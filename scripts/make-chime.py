#!/usr/bin/env python3
"""Writes the Focus break chime: apps/desktop/src-tauri/resources/chime.wav.

Synthesised here rather than downloaded, so the sound is Sajilo's own and
carries no licence. Two soft bell notes a fourth apart, rising — noticed, not
alarming — each a sine with a quiet overtone, a 6 ms attack so it does not
click, and a long exponential tail. Mono 16-bit 44.1 kHz, under a second.

    python3 scripts/make-chime.py
"""

import math
import struct
import wave
from pathlib import Path

RATE = 44_100
PEAK = 0.32  # about -10 dBFS: audible over a fan, not startling
NOTES = [  # (start seconds, frequency Hz, length seconds)
    (0.00, 783.99, 0.9),  # G5
    (0.16, 1046.50, 0.75),  # C6
]
LENGTH = 1.0

samples = [0.0] * int(RATE * LENGTH)
for start, frequency, length in NOTES:
    offset = int(start * RATE)
    for i in range(int(length * RATE)):
        if offset + i >= len(samples):
            break
        t = i / RATE
        attack = min(1.0, t / 0.006)
        decay = math.exp(-t * 5.5)
        tone = math.sin(2 * math.pi * frequency * t) + 0.18 * math.sin(4 * math.pi * frequency * t)
        samples[offset + i] += attack * decay * tone

loudest = max(abs(value) for value in samples)
out = Path(__file__).resolve().parent.parent / "apps/desktop/src-tauri/resources/chime.wav"
with wave.open(str(out), "wb") as file:
    file.setnchannels(1)
    file.setsampwidth(2)
    file.setframerate(RATE)
    file.writeframes(
        b"".join(struct.pack("<h", int(value / loudest * PEAK * 32767)) for value in samples)
    )
print(f"wrote {out}")
