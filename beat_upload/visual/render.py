"""Rendering an Effect: the engine in headless Chromium, one frame per call, piped to ffmpeg.

``render_effect`` analyses the audio (``analysis.py``), opens ``render.html`` in Playwright's
Chromium with the engine and every effect file, sets the cover, the Cover Style palette and
the header's words, then asks for the frames in batches of ``BATCH``: the page draws each
one straight at the file's size (the engine at ``DRAW_SCALE`` times the Lab's size), encodes
it to JPEG and POSTs the whole batch, binary, to a small HTTP server of ours that serves the
page itself (``_FrameServer``); a writer thread feeds the batches into ffmpeg's stdin while
the page draws the next one. Nothing but the features travels over Playwright's channel:
a base64 answer per frame was the bottleneck (about 150 ms a frame at 1080p, more than the
drawing). Progress is frames done over frames due. Randomness in the engine is seeded from ``seed``
so the same Beat renders the same video twice.

With a Clip (CONTEXT.md) the cover is the clip's frame of the moment: ``clip_frames`` decodes
the clip with ffmpeg at the render's rate, looped, scaled to the engine's size, as a stream of
JPEGs that goes to the page one frame per call; the Effect decides whether it plays on under
the treatments or stands still between cuts (its ``clip`` field, see render.html).

Chromium lives where BeatStars keeps it (``PLAYWRIGHT_BROWSERS_PATH`` in the data dir) and
is downloaded on first use.
"""

import base64
import json
import os
import queue
import subprocess
import sys
import tempfile
import threading
import zlib
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Literal

from beat_upload.beatstars.track import parse_youtube_title
from beat_upload.cover_style import CoverStyle
from beat_upload.errors import BeatStarsError, VideoError
from beat_upload.video import RENDER_CPUS, ProgressFn, _limited, _yield_to_desktop, ensure_ffmpeg
from beat_upload.visual import STILL, effect, effect_files, visual_dir
from beat_upload.visual.analysis import Features, analyse
from beat_upload.workspace import APP_NAME, Workspace

Format = Literal["reel", "yt"]
StatusFn = Callable[[str], None]

FPS = 30
DRAW_SCALE = (
    2  # the engine draws at twice the Lab's size: 1920x1080 / 1080x1920 straight (ADR 0011)
)
BATCH = 30  # frames per page call and per POST
JPEG_QUALITY = 0.92
CRF = 18  # YouTube re-encodes; a near-lossless source survives it best (handoff §6)
X264_PRESET = "veryfast"  # medium cost 2.5x the time of the drawing itself at 1080p on 4 cores
BROWSERS_DIRNAME = "ms-playwright"  # the same folder BeatStars uses (beatstars/studio.py)
CLIP_SIDE = 960  # a Clip is decoded no larger than the engine's longest side (the Lab's size)
CLIP_JPEG_Q = 4  # ffmpeg -q:v for the decoded clip frames (2 best .. 31)
_DATA_URL_PREFIX = "data:image/jpeg;base64,"
_JPEG_END = b"\xff\xd9"


@dataclass(frozen=True)
class EffectMeta:
    """What the header and the type treatments say."""

    title: str = ""
    artists: str = ""
    bpm: int | None = None
    key: str = ""

    @classmethod
    def of_title(cls, title: str | None, bpm: int | None, key: str | None) -> "EffectMeta":
        """Pure. The header as a YouTube title names it (``[FREE] A x B Type Beat 2026 -
        "NAME" | Genre``: NAME and the artists); a title in another shape shows as it is,
        with no artists line."""
        try:
            parsed = parse_youtube_title(title or "")
            name, artists = parsed.name, " x ".join(parsed.artists)
        except BeatStarsError:
            name, artists = (title or "").strip(), ""
        return cls(title=name, artists=artists, bpm=bpm, key=key or "")

    def for_engine(self) -> dict[str, Any]:
        return {"title": self.title, "artists": self.artists, "bpm": self.bpm or 0, "key": self.key}


@dataclass
class RenderPlan:
    """Pure description of one Effect render, so tests can check it without a browser."""

    effect: str
    style: CoverStyle
    format: Format
    meta: EffectMeta = field(default_factory=EffectMeta)
    seed: int = 1
    fps: int = FPS
    scale: int = DRAW_SCALE
    # A bake (``bake.py``): full quality, no header, periodic motion; the dict reaches the
    # Effect as ``window.__bake`` (the gem reads its stone from it).
    bake: dict[str, Any] | None = None
    # The gem's stone (an index into gem.js STONES), so an engine render and a bake of the
    # same Beat agree; None lets the Effect draw lots.
    stone: int | None = None

    def setup(self, cover_data_url: str, clip: bool = False) -> dict[str, Any]:
        return {
            "clip": clip,
            "effect": self.effect,
            "palette": str(self.style),
            "format": self.format,
            "meta": self.meta.for_engine(),
            "seed": self.seed,
            "scale": self.scale,
            "quality": JPEG_QUALITY,
            "cover": cover_data_url,
        }


def seed_for(text: str) -> int:
    """Pure. A stable 32-bit seed from a Beat's id (or any string)."""
    return zlib.crc32(text.encode()) & 0xFFFFFFFF


def cover_data_url(image: Path) -> str:
    suffix = image.suffix.lower().lstrip(".") or "png"
    mime = {"jpg": "jpeg"}.get(suffix, suffix)
    return f"data:image/{mime};base64," + base64.b64encode(image.read_bytes()).decode()


def encode_command(audio: Path, output: Path, fps: int) -> list[str]:
    """Pure. ffmpeg reading JPEG frames from stdin, muxing ``audio``, writing ``output``."""
    return [
        "ffmpeg", "-y", "-loglevel", "error",
        "-f", "image2pipe", "-framerate", str(fps), "-c:v", "mjpeg", "-i", "-",
        "-i", str(audio),
        "-c:v", "libx264", "-preset", X264_PRESET, "-crf", str(CRF), "-r", str(fps),
        "-threads", str(RENDER_CPUS),
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-movflags", "+faststart",
        "-shortest",
        str(output),
    ]  # fmt: skip


def clip_command(clip: Path, fps: int, side: int = CLIP_SIDE) -> list[str]:
    """Pure. ffmpeg decoding ``clip`` forever (looped), without sound, at ``fps``, no larger
    than ``side`` on its longest edge, as a stream of JPEGs on stdout."""
    scale = f"scale='trunc(iw*min(1,{side}/max(iw,ih))/2)*2':-2"
    return [
        "ffmpeg", "-loglevel", "error", "-nostdin",
        "-stream_loop", "-1", "-i", str(clip),
        "-an", "-r", str(fps), "-vf", scale,
        "-f", "image2pipe", "-c:v", "mjpeg", "-q:v", str(CLIP_JPEG_Q), "-",
    ]  # fmt: skip


def split_jpegs(chunks: Iterator[bytes]) -> Iterator[bytes]:
    """Pure. The JPEGs in a byte stream, one by one: a JPEG ends at FFD9, which never occurs
    inside its entropy-coded data (an FF there is always stuffed with 00 or a restart mark)."""
    buf = b""
    for chunk in chunks:
        buf += chunk
        while (end := buf.find(_JPEG_END)) != -1:
            yield buf[: end + 2]
            buf = buf[end + 2 :]


@contextmanager
def clip_frames(clip: Path, fps: int) -> Iterator[Iterator[str]]:
    """The frames of ``clip`` as JPEG data URLs, looped forever at ``fps``; ffmpeg is stopped
    when the block ends."""
    proc = subprocess.Popen(
        clip_command(clip, fps),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        preexec_fn=_yield_to_desktop,
    )
    assert proc.stdout is not None and proc.stderr is not None

    def frames() -> Iterator[str]:
        for jpeg in split_jpegs(iter(lambda: proc.stdout.read(1 << 16), b"")):  # type: ignore[union-attr]
            yield _DATA_URL_PREFIX + base64.b64encode(jpeg).decode()
        proc.wait()
        raise VideoError(
            f"ffmpeg stopped decoding the clip {clip.name}:\n{proc.stderr.read().decode().strip()}"  # type: ignore[union-attr]
        )

    try:
        yield frames()
    finally:
        proc.kill()
        proc.wait()


class _Writer:
    """Feeds batches of frames into ffmpeg's stdin on a thread of its own, so the page draws
    the next batch while ffmpeg eats this one. ``broken`` once ffmpeg stopped reading."""

    def __init__(self, stdin: Any) -> None:
        self._stdin = stdin
        self._queue: queue.Queue[bytes | None] = queue.Queue(maxsize=2)
        self.broken = False
        self._thread = threading.Thread(target=self._run, name="effect-writer", daemon=True)
        self._thread.start()

    def _run(self) -> None:
        while (data := self._queue.get()) is not None:
            if not self.broken:
                try:
                    self._stdin.write(data)
                except BrokenPipeError:
                    self.broken = True

    def put(self, data: bytes) -> None:
        """Blocks while two batches are already waiting: the page's POST waits with it, which
        is the backpressure that keeps the browser from running ahead of ffmpeg."""
        self._queue.put(data)

    def close(self) -> None:
        self._queue.put(None)
        self._thread.join()
        try:
            self._stdin.close()
        except BrokenPipeError:
            self.broken = True


class _FrameServer:
    """Serves ``beat_upload/`` (render.html, the fonts) on a loopback port and takes the
    frames back: ``POST /frames`` with a batch of JPEGs as the body goes to the writer. Same
    origin for the page, so no CORS, and the bytes never pass through the CDP channel."""

    def __init__(self, writer: _Writer) -> None:
        root = str(visual_dir().parent)
        server = self

        class Handler(SimpleHTTPRequestHandler):
            def __init__(self, *args: Any, **kwargs: Any) -> None:
                super().__init__(*args, directory=root, **kwargs)

            def log_message(self, format: str, *args: Any) -> None:  # noqa: A002
                pass

            def do_POST(self) -> None:  # noqa: N802
                if self.path.split("?")[0] != "/frames":
                    self.send_error(404)
                    return
                length = int(self.headers.get("Content-Length") or 0)
                data = self.rfile.read(length)
                server.received += 1
                server.bytes += len(data)
                if length:
                    writer.put(data)
                self.send_response(204)
                self.send_header("Content-Length", "0")
                self.end_headers()

        self.received = 0
        self.bytes = 0
        self._http = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self._http.daemon_threads = True
        self._thread = threading.Thread(target=self._http.serve_forever, daemon=True)
        self._thread.start()

    @property
    def url(self) -> str:
        return f"http://127.0.0.1:{self._http.server_address[1]}"

    def close(self) -> None:
        self._http.shutdown()
        self._http.server_close()
        self._thread.join()


def frame_bytes(data_url: str) -> bytes:
    """Pure. The JPEG behind the page's data URL."""
    if not data_url.startswith(_DATA_URL_PREFIX):
        raise VideoError("The effect page answered with something that is not a JPEG frame.")
    return base64.b64decode(data_url[len(_DATA_URL_PREFIX) :])


def browsers_dir() -> Path:
    return Workspace.default().data_dir / BROWSERS_DIRNAME


def ensure_chromium(on_status: StatusFn | None = None) -> None:
    """Point Playwright at the data dir and download Chromium there when it is missing."""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        raise VideoError(
            "Playwright is not installed: pip install -e . && playwright install chromium"
        ) from None
    os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", str(browsers_dir()))
    with sync_playwright() as p:
        if Path(p.chromium.executable_path).is_file():
            return
    if on_status:
        on_status(f"Downloading the browser for Effects (~170 MB) into {APP_NAME}'s data dir")
    result = subprocess.run(
        [sys.executable, "-m", "playwright", "install", "chromium"], capture_output=True, text=True
    )
    if result.returncode != 0:
        tail = (result.stderr or result.stdout).strip().splitlines()[-1:]
        raise VideoError(f"Could not download the browser: {' '.join(tail) or 'no output'}")


def render_effect(
    audio: Path,
    image: Path,
    output: Path,
    plan: RenderPlan,
    on_progress: ProgressFn | None = None,
    on_status: StatusFn | None = None,
    clip: Path | None = None,
) -> Path:
    """``audio`` and ``image`` as a video in ``plan.effect``; ``plan.format`` decides the
    frame (``reel`` 1080x1920, ``yt`` 1920x1080). With a ``clip`` the image only sizes the
    cover; the frames come from the clip."""
    if plan.effect == STILL:
        raise VideoError("The Still effect is rendered by render_video / render_reel.")
    effect(plan.effect)  # unknown -> ConfigError before any work
    ensure_ffmpeg()
    ensure_chromium(on_status)
    if on_status:
        on_status("Listening to the beat")
    features = analyse(audio, plan.fps, plan.meta.bpm)
    if on_status:
        kicks, snares, hats = features.hits
        on_status(f"{kicks} kicks, {snares} snares, {hats} hats in {features.duration:.0f} s")
    return _render_frames(audio, image, output, plan, features, on_progress, clip)


def _render_frames(
    audio: Path,
    image: Path,
    output: Path,
    plan: RenderPlan,
    features: Features,
    on_progress: ProgressFn | None,
    clip: Path | None = None,
) -> Path:
    from playwright.sync_api import sync_playwright

    total = len(features.frames)
    log_file = tempfile.NamedTemporaryFile("w+", prefix="effect-", suffix=".log", dir=output.parent)
    clip_source = clip_frames(clip, plan.fps) if clip else _no_frames()
    with sync_playwright() as p, log_file as log, clip_source as clip_urls:
        encoder = subprocess.Popen(
            _limited(encode_command(audio, output, plan.fps)),
            stdin=subprocess.PIPE,
            stdout=subprocess.DEVNULL,
            stderr=log,
            preexec_fn=_yield_to_desktop,
        )
        assert encoder.stdin is not None
        writer = _Writer(encoder.stdin)
        server = _FrameServer(writer)
        browser = p.chromium.launch(headless=True)
        try:
            page = browser.new_page(viewport={"width": 1000, "height": 1000})
            if plan.bake is not None:
                page.add_init_script(f"window.__hq = true; window.__bake = {json.dumps(plan.bake)}")
            if plan.stone is not None:
                page.add_init_script(f"window.__stone = {int(plan.stone)}")
            elif os.environ.get("BEAT_UPLOAD_HQ"):
                # shader effects at full size with 2x2 supersampling: slow, for a try
                page.add_init_script("window.__hq = true")
            page.goto(f"{server.url}/visual/render.html")
            page.add_script_tag(path=str(visual_dir() / "engine.js"))
            for file in effect_files():
                page.add_script_tag(path=str(file))
            setup = page.evaluate(
                "o => __render.setup(o)", plan.setup(cover_data_url(image), clip is not None)
            )
            if setup.get("effect") != plan.effect:
                raise VideoError(
                    f"The effect {plan.effect!r} is not in the engine; "
                    f"loaded: {', '.join(setup.get('styles', []))}"
                )
            sent = 0
            for start in range(0, total, BATCH):
                rows = features.frames[start : start + BATCH]
                urls = [next(clip_urls) for _ in rows] if clip else None
                answer = page.evaluate("a => __render.batch(...a)", [rows, urls])
                if answer.get("frames") != len(rows) or not answer.get("posted"):
                    raise VideoError(
                        f"The effect page drew {answer.get('frames')} frames of {len(rows)} "
                        f"and {'posted' if answer.get('posted') else 'did not post'} them."
                    )
                sent += len(rows)
                if writer.broken:
                    break  # ffmpeg died; its log says why, below
                if on_progress:
                    on_progress(min(1.0, sent / total))
        finally:
            browser.close()
            server.close()
            writer.close()
            returncode = encoder.wait()
        if returncode != 0:
            log.seek(0)
            raise VideoError(f"ffmpeg failed on the effect render:\n{log.read().strip()}")
        if server.received * BATCH < sent and returncode == 0:
            raise VideoError(f"The effect page posted {server.received} batches for {sent} frames.")
    return output


@contextmanager
def _no_frames() -> Iterator[Iterator[str]]:
    yield iter(())
