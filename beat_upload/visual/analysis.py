"""Per-frame audio features for the Effect engine, computed offline with numpy.

A port of the Visual Lab's live analysis (Web Audio ``AnalyserNode`` at FFT 2048, byte
spectrum, smoothing 0.55) so an Effect reacts in the Render as it did in the Lab:

- six bands 20-60-150-400-2k-8k-20k Hz with AGC (the reference decays x0.996 per frame);
- onsets by spectral flux: kick 0-150 Hz, snare 150-600 + 2-5 kHz, hat 6-16 kHz; a hit when
  the flux is above the mean of the last 45 frames x mult + 2, with a refractory time;
- the beat clock from the BPM (phase, bar position, beats), when the BPM is known;
- 64 log-spaced bins 40 Hz - 12 kHz for the Ridge family.

``analyse`` decodes with ffmpeg; everything below it is pure and tested on synthetic signals.
"""

import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np

from beat_upload.errors import VideoError

SAMPLE_RATE = 44100
FFT_SIZE = 2048
SMOOTHING = 0.55  # AnalyserNode.smoothingTimeConstant in the Lab
MIN_DB, MAX_DB = -100.0, -30.0  # AnalyserNode defaults: the byte spectrum's range
BANDS = ((20, 60), (60, 150), (150, 400), (400, 2000), (2000, 8000), (8000, 20000))
AGC_DECAY = 0.996
AGC_FLOOR = 8.0
FLUX_HISTORY = 45
# (low Hz, high Hz) regions of the flux, the threshold multiplier and the refractory seconds
KICK = (((0, 150),), 1.6, 0.14)
SNARE = (((150, 600), (2000, 5000)), 1.7, 0.12)
HAT = (((6000, 16000),), 1.5, 0.06)
SPEC_BINS = 64


@dataclass
class Features:
    fps: int
    duration: float
    frames: list[dict[str, Any]] = field(default_factory=list)

    @property
    def hits(self) -> tuple[int, int, int]:
        """Kicks, snares and hats found: a sanity figure for the log."""
        return (
            sum(f["kickHit"] for f in self.frames),
            sum(f["snareHit"] for f in self.frames),
            sum(f["hatHit"] for f in self.frames),
        )


def decode(audio: Path, sample_rate: int = SAMPLE_RATE) -> np.ndarray:
    """``audio`` as mono float32 samples via ffmpeg."""
    cmd = [
        "ffmpeg", "-v", "error", "-i", str(audio),
        "-f", "f32le", "-ac", "1", "-ar", str(sample_rate), "-",
    ]  # fmt: skip
    result = subprocess.run(cmd, capture_output=True)
    if result.returncode != 0:
        raise VideoError(f"ffmpeg could not decode {audio.name}:\n{result.stderr.decode().strip()}")
    return np.frombuffer(result.stdout, dtype=np.float32)


def byte_spectra(samples: np.ndarray, fps: int, sample_rate: int = SAMPLE_RATE) -> np.ndarray:
    """Pure. One byte spectrum (``FFT_SIZE // 2`` values 0..255) per frame, as the Lab's
    AnalyserNode saw it: the last 2048 samples at the frame's time, Blackman window, |X|/N,
    smoothed with the previous frame, in dB mapped from [-100, -30] onto [0, 255]."""
    n_frames = max(1, int(np.ceil(len(samples) / sample_rate * fps)))
    window = np.blackman(FFT_SIZE).astype(np.float32)
    padded = np.concatenate([np.zeros(FFT_SIZE, dtype=np.float32), samples])
    out = np.zeros((n_frames, FFT_SIZE // 2), dtype=np.float32)
    smoothed = np.zeros(FFT_SIZE // 2, dtype=np.float32)
    for i in range(n_frames):
        end = FFT_SIZE + int(round(i / fps * sample_rate))
        frame = padded[max(0, end - FFT_SIZE) : end]
        if len(frame) < FFT_SIZE:
            frame = np.pad(frame, (FFT_SIZE - len(frame), 0))
        mag = np.abs(np.fft.rfft(frame * window))[: FFT_SIZE // 2] / FFT_SIZE
        smoothed = SMOOTHING * smoothed + (1 - SMOOTHING) * mag
        db = 20 * np.log10(np.maximum(smoothed, 1e-12))
        out[i] = np.clip((db - MIN_DB) / (MAX_DB - MIN_DB) * 255, 0, 255)
    return out


def _bins(lo_hz: float, hi_hz: float, bin_hz: float) -> tuple[int, int]:
    return int(np.floor(lo_hz / bin_hz)), min(FFT_SIZE // 2 - 1, int(np.ceil(hi_hz / bin_hz)))


def band_levels(spectra: np.ndarray, sample_rate: int = SAMPLE_RATE) -> np.ndarray:
    """Pure. Six AGC'd band levels 0..1 per frame."""
    bin_hz = sample_rate / FFT_SIZE
    out = np.zeros((len(spectra), len(BANDS)), dtype=np.float32)
    ref = np.ones(len(BANDS), dtype=np.float32)
    for i, spectrum in enumerate(spectra):
        for b, (lo_hz, hi_hz) in enumerate(BANDS):
            lo, hi = _bins(lo_hz, hi_hz, bin_hz)
            s = float(spectrum[lo : hi + 1].mean())
            ref[b] = max(ref[b] * AGC_DECAY, s, AGC_FLOOR)
            out[i, b] = min(1.0, s / ref[b])
    return out


def flux(spectra: np.ndarray, regions: tuple[tuple[int, int], ...], sample_rate: int) -> np.ndarray:
    """Pure. Positive spectral flux per frame, summed over ``regions`` (Hz), each region the
    mean rise of its bins against the previous frame. The Lab starts the kick region at bin 1."""
    bin_hz = sample_rate / FFT_SIZE
    rise = np.diff(spectra, axis=0, prepend=np.zeros((1, spectra.shape[1]), dtype=spectra.dtype))
    rise = np.maximum(rise, 0)
    out = np.zeros(len(spectra), dtype=np.float32)
    for lo_hz, hi_hz in regions:
        lo, hi = _bins(lo_hz, hi_hz, bin_hz)
        lo = max(lo, 1)
        out += rise[:, lo : hi + 1].mean(axis=1)
    return out


def onsets(values: np.ndarray, fps: int, mult: float, refractory: float) -> np.ndarray:
    """Pure. ``True`` where ``values`` rises above the mean of the last ``FLUX_HISTORY``
    values x ``mult`` + 2, and at least ``refractory`` seconds after the previous hit."""
    hits = np.zeros(len(values), dtype=bool)
    history: list[float] = []
    last_hit = -1e9
    for i, v in enumerate(values):
        history.append(float(v))
        if len(history) > FLUX_HISTORY:
            history.pop(0)
        mean = sum(history) / len(history)
        t = i / fps
        if v > mean * mult + 2 and t - last_hit > refractory:
            hits[i] = True
            last_hit = t
    return hits


def beat_clock(t: float, bpm: int | None) -> tuple[float, float, float]:
    """Pure. (beats, phase within the beat, position within the bar) at ``t`` seconds; all
    zero without a BPM."""
    if not bpm:
        return 0.0, 0.0, 0.0
    beats = t * bpm / 60
    return beats, beats - np.floor(beats), beats / 4 - np.floor(beats / 4)


def spec_row(spectrum: np.ndarray, sample_rate: int = SAMPLE_RATE) -> list[float]:
    """Pure. 64 log-spaced bins 40 Hz .. 12 kHz of one byte spectrum, 0..1."""
    bin_hz = sample_rate / FFT_SIZE
    hz = 40 * np.power(300, np.arange(SPEC_BINS) / (SPEC_BINS - 1))
    idx = np.minimum(FFT_SIZE // 2 - 1, np.round(hz / bin_hz).astype(int))
    return [round(float(v), 3) for v in spectrum[idx] / 255]


def features_of(
    samples: np.ndarray, fps: int, bpm: int | None, sample_rate: int = SAMPLE_RATE
) -> Features:
    """Pure. Every frame's features from decoded ``samples``."""
    spectra = byte_spectra(samples, fps, sample_rate)
    bands = band_levels(spectra, sample_rate)
    hits = {
        name: onsets(flux(spectra, regions, sample_rate), fps, mult, refr)
        for name, (regions, mult, refr) in (("kick", KICK), ("snare", SNARE), ("hat", HAT))
    }
    duration = len(samples) / sample_rate
    out = Features(fps=fps, duration=duration)
    prev_phase = 0.0
    for i in range(len(spectra)):
        t = i / fps
        beats, phase, bar = beat_clock(t, bpm)
        b = [round(float(v), 3) for v in bands[i]]
        out.frames.append(
            {
                "t": round(t, 4),
                "bands": b,
                "level": round(b[1] * 0.5 + b[3] * 0.3 + b[4] * 0.2, 3),
                "kickHit": bool(hits["kick"][i]),
                "snareHit": bool(hits["snare"][i]),
                "hatHit": bool(hits["hat"][i]),
                "beats": round(float(beats), 4),
                "phase": round(float(phase), 4),
                "bar": round(float(bar), 4),
                "beatHit": bool(bpm) and bool(phase < prev_phase),
                "spec": spec_row(spectra[i], sample_rate),
            }
        )
        prev_phase = float(phase)
    return out


def analyse(audio: Path, fps: int, bpm: int | None) -> Features:
    """The features of ``audio`` at ``fps`` frames per second."""
    return features_of(decode(audio), fps, bpm)
