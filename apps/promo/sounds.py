"""
The promo's interface sounds: a soft tick on every click in the footage, and
the app's own chime (the file it bundles) as each of its cards opens. The music is a separate, licensed track.

    bun src/cues.ts > public/cues.json
    python3 sounds.py            # needs numpy and scipy

Reads the film's timing from public/cues.json; writes public/sounds.wav.
"""

import json
import sys
import wave
from pathlib import Path

import numpy as np
from scipy.signal import butter, sosfilt

HERE = Path(__file__).parent
SR = 44100
RNG = np.random.default_rng(2083)

# The landscape tour by default; the vertical cut passes its own files:
#   python3 sounds.py public/cues-vertical.json public/sounds-vertical.wav
CUES = HERE / (sys.argv[1] if len(sys.argv) > 1 else "public/cues.json")
OUT = HERE / (sys.argv[2] if len(sys.argv) > 2 else "public/sounds.wav")

cues = json.loads(CUES.read_text())
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
    """The app's own reminder sound, the file it bundles and plays."""
    with wave.open(str(HERE / "../desktop/src-tauri/resources/chime.wav"), "rb") as file:
        assert file.getframerate() == SR and file.getsampwidth() == 2
        data = np.frombuffer(file.readframes(file.getnframes()), "<i2") / 32767
        return data.reshape(-1, file.getnchannels()).mean(axis=1)


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
    add(frame / cues["fps"], chime(), 0.8, 0.0)

out = OUT
with wave.open(str(out), "wb") as file:
    file.setnchannels(2)
    file.setsampwidth(2)
    file.setframerate(SR)
    file.writeframes((np.clip(track, -1, 1).T * 32767).astype("<i2").tobytes())
print(f"wrote {out.relative_to(HERE)}: {len(cues['clicks'])} clicks, {len(cues['chimes'])} chimes")
