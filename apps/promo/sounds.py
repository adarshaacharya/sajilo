"""
The promo's interface sounds: a soft tick on every click in the footage and a
chime when the reminder arrives. The music is a separate, licensed track.

    bun src/cues.ts > public/cues.json
    python3 sounds.py            # needs numpy and scipy

Reads the film's timing from public/cues.json; writes public/sounds.wav.
"""

import json
import wave
from pathlib import Path

import numpy as np
from scipy.signal import butter, sosfilt

HERE = Path(__file__).parent
SR = 44100
RNG = np.random.default_rng(2083)

cues = json.loads((HERE / "public" / "cues.json").read_text())
LENGTH = cues["total"] / cues["fps"]


def seconds(duration):
    return np.arange(int(duration * SR)) / SR


def bandpass(signal, low, high):
    return sosfilt(butter(2, [low, high], btype="band", fs=SR, output="sos"), signal)


def tick():
    """A trackpad click: a short, bright, quiet tap."""
    t = seconds(0.03)
    tap = np.sin(2 * np.pi * 2400 * t) * 0.5 + bandpass(RNG.standard_normal(len(t)), 2000, 8000)
    return tap * np.exp(-t / 0.006)


def chime():
    """A notification: two soft bells, D6 then A6."""
    t = seconds(1.6)
    out = np.zeros_like(t)
    for freq, delay in ((1174.66, 0.0), (1760.0, 0.12)):
        later = np.clip(t - delay, 0, None)
        for ratio, weight in ((1, 1), (2.76, 0.3), (5.4, 0.12)):
            out += (t >= delay) * np.sin(2 * np.pi * freq * ratio * later) * np.exp(-later / (0.7 / ratio)) * weight
    return out


track = np.zeros((2, int(LENGTH * SR)))


def add(at, sound, gain, pan):
    start = int(at * SR)
    end = min(track.shape[1], start + len(sound))
    angle = (pan + 1) * np.pi / 4
    track[0, start:end] += sound[: end - start] * gain * np.cos(angle)
    track[1, start:end] += sound[: end - start] * gain * np.sin(angle)


for frame in cues["clicks"]:
    add(frame / cues["fps"], tick(), 0.18, 0.4)
for frame in cues["chimes"]:
    add(frame / cues["fps"], chime(), 0.22, 0.4)

out = HERE / "public" / "sounds.wav"
with wave.open(str(out), "wb") as file:
    file.setnchannels(2)
    file.setsampwidth(2)
    file.setframerate(SR)
    file.writeframes((np.clip(track, -1, 1).T * 32767).astype("<i2").tobytes())
print(f"wrote {out.relative_to(HERE)}: {len(cues['clicks'])} clicks, {len(cues['chimes'])} chime")
