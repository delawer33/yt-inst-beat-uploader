"""A Track Package: one folder holding everything one BeatStars track is made of.

    NAME_95bpm_Cmin_delawer.wav          master, untagged, leading silence cut
    NAME_95bpm_Cmin_delawer_tagged.mp3   preview + free download, 320 kbps, cut at the same bar
    NAME_95bpm_Cmin_delawer_stems.zip    optional
    cover.jpg                            square
    beatstars.json                       BeatStarsTrack

``prepare_package`` writes one from sources it never touches. The leading silence is found
on the master; the tagged source is cut at the same point counted from its end, because both
are bounces of the same project and may differ only in how much silence comes first.
"""

import re
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, UnidentifiedImageError

from beat_upload.beat_folder import CONFIG_FILENAME, IMAGE_EXTENSIONS
from beat_upload.beatstars.naming import (
    TrackFileKind,
    TrackFileName,
    parse_track_filename,
    spelled_key,
)
from beat_upload.beatstars.track import (
    FREE_USE_LINE,
    BeatStarsTrack,
    mood_name,
    read_track,
    track_from_youtube,
    write_track,
)
from beat_upload.config import load_youtube_metadata
from beat_upload.errors import BeatStarsError
from beat_upload.video import ensure_ffmpeg, probe_duration

COVER_FILENAME = "cover.jpg"
COVER_MAX_SIDE = 1000
SILENCE_THRESHOLD_DB = -50
SILENCE_MARGIN = 0.015  # seconds kept before the first sound, so the attack is not cut
SILENCE_SEARCH = 30.0  # seconds from the start that are searched for the first sound
MP3_BITRATE = "320k"

_SILENCE_END = re.compile(r"silence_end:\s*(?P<end>[\d.]+)")
_SILENCE_START = re.compile(r"silence_start:\s*(?P<start>-?[\d.]+)")


@dataclass(frozen=True)
class TrackPackage:
    folder: Path
    master: Path
    preview: Path
    cover: Path
    track: BeatStarsTrack
    stems: Path | None = None


@dataclass(frozen=True)
class TrackSources:
    """Where a package comes from. ``tagged`` may be the master itself when only a tagged
    bounce exists, and may be a WAV or an MP3."""

    master: Path
    tagged: Path
    cover: Path
    stems: Path | None = None


def leading_silence(ffmpeg_log: str) -> float:
    """Pure. Seconds of silence at the very start, from ffmpeg ``silencedetect`` output."""
    start = _SILENCE_START.search(ffmpeg_log)
    if start is None or float(start["start"]) > 0.001:
        return 0.0
    end = _SILENCE_END.search(ffmpeg_log)
    return float(end["end"]) if end else 0.0


def cut_points(
    master_silence: float, master_length: float, tagged_length: float
) -> tuple[float, float]:
    """Pure. Where to cut the master and the tagged source so both start on the first sound.

    The tagged cut is the master cut moved by the difference in length: the two bounces end
    together, so any extra length of the tagged one is extra silence at its start.
    """
    master_cut = max(0.0, master_silence - SILENCE_MARGIN) if master_silence > 0 else 0.0
    tagged_cut = master_cut + (tagged_length - master_length)
    if tagged_cut < -0.05:
        raise BeatStarsError(
            f"The tagged bounce is {master_length - tagged_length:.2f}s shorter than the master; "
            "they must be bounces of the same project"
        )
    return master_cut, max(0.0, tagged_cut)


def find_package(folder: Path) -> TrackPackage:
    """Locate the files of a prepared package and read its ``beatstars.json``."""
    if not folder.is_dir():
        raise BeatStarsError(f"Not a directory: {folder}")
    track = read_track(folder)
    kinds: dict[TrackFileKind, list[Path]] = {kind: [] for kind in TrackFileKind}
    for f in sorted(folder.iterdir()):
        if f.suffix.lower() in (".wav", ".mp3", ".zip"):
            _, kind = parse_track_filename(f.name)
            kinds[kind].append(f)
    masters = [f for f in kinds[TrackFileKind.MASTER] if f.suffix.lower() == ".wav"]
    previews = [f for f in kinds[TrackFileKind.PREVIEW] if f.suffix.lower() == ".mp3"]
    if len(masters) != 1:
        raise BeatStarsError(f"Expected one untagged master .wav in {folder}, found {len(masters)}")
    if len(previews) != 1:
        raise BeatStarsError(f"Expected one _tagged.mp3 in {folder}, found {len(previews)}")
    cover = folder / COVER_FILENAME
    if not cover.is_file():
        raise BeatStarsError(f"{COVER_FILENAME} not found in {folder}")
    stems = kinds[TrackFileKind.STEMS]
    return TrackPackage(folder, masters[0], previews[0], cover, track, stems[0] if stems else None)


def find_sources(folder: Path) -> tuple[TrackSources, TrackFileName]:
    """The owner's bounce folder: ``NAME_..._delawer.wav``, ``NAME_..._delawer_tagged.(wav|mp3)``,
    one cover image, optionally stems and ``config.yaml``."""
    if not folder.is_dir():
        raise BeatStarsError(f"Not a directory: {folder}")
    found: dict[TrackFileKind, list[tuple[Path, TrackFileName]]] = {k: [] for k in TrackFileKind}
    for f in sorted(folder.iterdir()):
        if f.is_file() and f.suffix.lower() in (".wav", ".mp3", ".zip"):
            facts, kind = parse_track_filename(f.name)
            found[kind].append((f, facts))
    masters = [m for m in found[TrackFileKind.MASTER] if m[0].suffix.lower() == ".wav"]
    if len(masters) != 1:
        raise BeatStarsError(f"Expected one untagged NAME_..._delawer.wav in {folder}")
    if len(found[TrackFileKind.PREVIEW]) != 1:
        raise BeatStarsError(f"Expected one NAME_..._delawer_tagged.wav or .mp3 in {folder}")
    images = [f for f in sorted(folder.iterdir()) if f.suffix.lower() in IMAGE_EXTENSIONS]
    if len(images) != 1:
        raise BeatStarsError(f"Expected one cover image in {folder}, found {len(images)}")
    stems = found[TrackFileKind.STEMS]
    master, facts = masters[0]
    sources = TrackSources(
        master=master,
        tagged=found[TrackFileKind.PREVIEW][0][0],
        cover=images[0],
        stems=stems[0][0] if stems else None,
    )
    return sources, facts


def track_from_folder(folder: Path, facts: TrackFileName, youtube_id: str | None) -> BeatStarsTrack:
    """Metadata for a bounce folder: from its ``config.yaml`` YouTube title when there is one,
    otherwise just the name, bpm and key; edit ``beatstars.json`` before uploading."""
    moods = [mood_name(m) for m in facts.moods]
    config = folder / CONFIG_FILENAME
    if config.is_file():
        title = load_youtube_metadata(config).title
        return track_from_youtube(title, facts.bpm, facts.key, youtube_id, moods, facts.samples)
    lines = [f"BPM: {facts.bpm} | Key: {spelled_key(facts.key)}", FREE_USE_LINE]
    if youtube_id:
        lines.append(f"https://youtu.be/{youtube_id}")
    return BeatStarsTrack(
        title=facts.display_name,
        bpm=facts.bpm,
        key=facts.key,
        description="\n".join(lines),
        moods=moods,
        samples=facts.samples,
        youtube_id=youtube_id,
    )


def prepare_package(
    sources: TrackSources, facts: TrackFileName, track: BeatStarsTrack, out_dir: Path
) -> TrackPackage:
    """Write the package into ``out_dir``. Sources are only read."""
    ensure_ffmpeg()
    out_dir.mkdir(parents=True, exist_ok=True)
    master_cut, tagged_cut = cut_points(
        _detect_leading_silence(sources.master),
        probe_duration(sources.master),
        probe_duration(sources.tagged),
    )
    master = out_dir / facts.filename(TrackFileKind.MASTER)
    preview = out_dir / facts.filename(TrackFileKind.PREVIEW)
    _write_master(sources.master, master, master_cut)
    _write_preview(sources.tagged, preview, tagged_cut)
    cover = out_dir / COVER_FILENAME
    write_square_cover(sources.cover, cover)
    stems = None
    if sources.stems is not None:
        stems = out_dir / facts.filename(TrackFileKind.STEMS)
        shutil.copyfile(sources.stems, stems)
    write_track(track, out_dir)
    return TrackPackage(out_dir, master, preview, cover, track, stems)


def write_square_cover(source: Path, target: Path) -> None:
    """Centre-crop ``source`` to a square JPEG of at most ``COVER_MAX_SIDE`` pixels; Studio's
    artwork upload stalled on a 1200 px, 900 KB cover."""
    try:
        with Image.open(source) as img:
            side = min(img.size)
            left, top = (img.width - side) // 2, (img.height - side) // 2
            square = img.convert("RGB").crop((left, top, left + side, top + side))
            if side > COVER_MAX_SIDE:
                square = square.resize((COVER_MAX_SIDE, COVER_MAX_SIDE), Image.LANCZOS)
    except (OSError, UnidentifiedImageError) as e:
        raise BeatStarsError(f"Cannot read cover {source.name}: {e}") from e
    square.save(target, "JPEG", quality=90)


def _detect_leading_silence(audio: Path) -> float:
    cmd = [
        "ffmpeg", "-hide_banner", "-nostats", "-i", str(audio),
        "-t", str(SILENCE_SEARCH),
        "-af", f"silencedetect=n={SILENCE_THRESHOLD_DB}dB:d=0.05",
        "-f", "null", "-",
    ]  # fmt: skip
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise BeatStarsError(f"ffmpeg silencedetect failed on {audio.name}:\n{result.stderr}")
    return leading_silence(result.stderr)


def _write_master(source: Path, target: Path, cut: float) -> None:
    if cut == 0:
        shutil.copyfile(source, target)
        return
    codec = f"pcm_s{_bits_per_sample(source)}le"
    _ffmpeg(["-i", str(source), "-ss", f"{cut:.3f}", "-c:a", codec, str(target)])


def _write_preview(source: Path, target: Path, cut: float) -> None:
    if cut == 0 and source.suffix.lower() == ".mp3":
        shutil.copyfile(source, target)
        return
    _ffmpeg(
        ["-i", str(source), "-ss", f"{cut:.3f}", "-c:a", "libmp3lame", "-b:a", MP3_BITRATE,
         str(target)]
    )  # fmt: skip


def _bits_per_sample(audio: Path) -> int:
    cmd = [
        "ffprobe", "-v", "error", "-select_streams", "a:0",
        "-show_entries", "stream=bits_per_sample", "-of", "csv=p=0", str(audio),
    ]  # fmt: skip
    result = subprocess.run(cmd, capture_output=True, text=True)
    bits = result.stdout.strip()
    if result.returncode != 0 or bits not in ("16", "24", "32"):
        raise BeatStarsError(f"Cannot read the bit depth of {audio.name}: {result.stderr.strip()}")
    return int(bits)


def _ffmpeg(args: list[str]) -> None:
    result = subprocess.run(
        ["ffmpeg", "-hide_banner", "-y", "-loglevel", "error", *args],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise BeatStarsError(f"ffmpeg failed:\n{result.stderr.strip()}")
