"""
The promo's soundtrack, composed to the edit and synthesised here: nothing
sampled, nothing licensed.

A Nepali folk groove in 6/8 (the lilt of a jhyaure): madal and khaijadi,
a tanpura drone on Sa and Pa, a bansuri carrying the tune, jhyali cymbals
on every chapter card, and a soft modern kick and bass under it so it sits
next to the product rather than in a museum. The key is D (Sa = D).

    bun src/cues.ts > public/cues.json
    python3 music.py            # needs numpy and scipy

Reads the film's timing from public/cues.json, so every card lands on a
downbeat and every click in the footage gets its tick. Writes
public/music.wav.
"""

import json
import wave
from pathlib import Path

import numpy as np
from scipy.signal import butter, fftconvolve, sosfilt

HERE = Path(__file__).parent
SR = 44100
RNG = np.random.default_rng(2083)

cues = json.loads((HERE / "public" / "cues.json").read_text())
FPS = cues["fps"]
BAR_FRAMES = cues["bar"]
EIGHTH = BAR_FRAMES / 6 / FPS  # seconds
LENGTH = cues["total"] / FPS

# Sa = D. Notes are semitones from the bansuri's Sa, D5.
SA = 587.33


def hz(semitones, base=SA):
    return base * 2 ** (semitones / 12)


S, R, G, m, P, D, n, N = 0, 2, 4, 5, 7, 9, 10, 11

# ---------------------------------------------------------------- the mix bus


class Bus:
    """A stereo stem. Instruments add into it; the mix sets its level."""

    def __init__(self, reverb=0.0):
        self.left = np.zeros(int((LENGTH + 4) * SR))
        self.right = np.zeros_like(self.left)
        self.reverb = reverb

    def add(self, t, signal, pan=0.0, gain=1.0):
        start = int(t * SR)
        if start >= len(self.left):
            return
        end = min(len(self.left), start + len(signal))
        chunk = signal[: end - start] * gain
        # Equal-power pan, -1 left to 1 right.
        angle = (pan + 1) * np.pi / 4
        self.left[start:end] += chunk * np.cos(angle)
        self.right[start:end] += chunk * np.sin(angle)

    def stereo(self):
        return np.stack([self.left, self.right])


def bandpass(signal, low, high, order=2):
    sos = butter(order, [low, high], btype="band", fs=SR, output="sos")
    return sosfilt(sos, signal)


def lowpass(signal, cutoff, order=2):
    return sosfilt(butter(order, cutoff, btype="low", fs=SR, output="sos"), signal)


def highpass(signal, cutoff, order=2):
    return sosfilt(butter(order, cutoff, btype="high", fs=SR, output="sos"), signal)


def seconds(duration):
    return np.arange(int(duration * SR)) / SR


def noise(duration):
    return RNG.standard_normal(int(duration * SR))


# ---------------------------------------------------------------- instruments


def madal_dhim(strength=1.0):
    """The madal's bass head: a round boom whose pitch settles as it rings."""
    t = seconds(0.55)
    pitch = 78 + 46 * np.exp(-t / 0.035)
    phase = 2 * np.pi * np.cumsum(pitch) / SR
    body = np.sin(phase) + 0.35 * np.sin(1.52 * phase) * np.exp(-t / 0.08)
    slap = lowpass(noise(0.55), 1800) * np.exp(-t / 0.012) * 0.5
    return (body * np.exp(-t / 0.21) + slap) * strength


def madal_ta(strength=1.0, open_=True):
    """The treble head, struck open (ta) or damped (ghost)."""
    t = seconds(0.3)
    base = 352 if open_ else 390
    ratios = [1.0, 1.59, 2.14, 2.3, 2.65, 2.92]
    decay = 0.13 if open_ else 0.045
    tone = sum(
        np.sin(2 * np.pi * base * r * t + i) * np.exp(-t / (decay / (1 + i * 0.4))) / (1 + i)
        for i, r in enumerate(ratios)
    )
    crack = bandpass(noise(0.3), 1200, 6000) * np.exp(-t / 0.008) * 0.6
    return (tone * 0.8 + crack) * strength


def khaijadi(strength=1.0):
    """A frame drum's jingles: a short bright shimmer."""
    t = seconds(0.12)
    return bandpass(noise(0.12), 5000, 11000) * np.exp(-t / 0.03) * strength


def jhyali(strength=1.0):
    """Hand cymbals: inharmonic ring, the high partials dying first."""
    t = seconds(2.6)
    partials = [523, 1117, 1693, 2371, 3147, 3988, 4870, 5961, 7210]
    ring = sum(
        np.sin(2 * np.pi * f * t + RNG.uniform(0, 6)) * np.exp(-t / (1.9 / (1 + i * 0.35))) / (1 + 0.25 * i)
        for i, f in enumerate(partials)
    )
    wash = highpass(noise(2.6), 4000) * np.exp(-t / 0.35) * 0.35
    return (ring * 0.22 + wash) * strength


def kick(strength=1.0):
    t = seconds(0.45)
    pitch = 44 + 80 * np.exp(-t / 0.03)
    return np.sin(2 * np.pi * np.cumsum(pitch) / SR) * np.exp(-t / 0.18) * strength


def bass(freq, duration, strength=1.0):
    t = seconds(duration)
    env = np.minimum(1, t / 0.01) * np.exp(-t / (duration * 0.8))
    tone = np.sin(2 * np.pi * freq * t) + 0.18 * np.sin(4 * np.pi * freq * t)
    return tone * env * strength


def tanpura(freq, strength=1.0):
    """One tanpura string: many harmonics, the jawari buzz shimmering in them."""
    t = seconds(4.0)
    out = np.zeros_like(t)
    for k in range(1, 18):
        shimmer = 1 + 0.7 * np.sin(2 * np.pi * (0.18 + 0.03 * k) * t + k)
        out += np.sin(2 * np.pi * freq * k * t) * shimmer * np.exp(-t / (2.6 / (1 + 0.08 * k))) / k
    return out * np.minimum(1, t / 0.02) * strength


def pad(freqs, duration, strength=1.0):
    t = seconds(duration + 0.8)
    env = np.minimum(1, t / 0.45) * np.clip((duration + 0.8 - t) / 0.8, 0, 1)
    out = np.zeros_like(t)
    for f in freqs:
        for detune in (-0.12, 0.12):
            g = f * 2 ** (detune / 12)
            out += np.sin(2 * np.pi * g * t) + 0.3 * np.sin(4 * np.pi * g * t) + 0.12 * np.sin(6 * np.pi * g * t)
    return lowpass(out, 2200) * env * strength / len(freqs)


def bansuri(notes, strength=1.0):
    """
    A phrase on the bamboo flute: (semitones, eighths, ornament) per note, None
    for a rest. Notes glide into each other (meend), accented ones get a grace
    note from above (kan), long ones grow a vibrato, and the breath is audible.
    """
    total = sum(length for _, length, *_ in notes) * EIGHTH + 0.4
    t = seconds(total)
    freq = np.full_like(t, np.nan)
    amp = np.zeros_like(t)
    cursor = 0.0
    previous = None
    for note in notes:
        pitch, length, *rest = note
        ornament = rest[0] if rest else ""
        duration = length * EIGHTH
        a, b = int(cursor * SR), int((cursor + duration) * SR)
        cursor += duration
        if pitch is None:
            previous = None
            continue
        target = hz(pitch)
        b = min(b, len(t))
        local = np.arange(b - a) / SR
        curve = np.full_like(local, target)
        if previous is not None and "tongue" not in ornament:
            glide = np.exp(-local / 0.03)
            curve = target + (previous - target) * glide
        elif "kan" in ornament:
            grace = hz(pitch + 2)
            curve = np.where(local < 0.045, grace, target)
        if duration > 0.5:
            depth = np.clip((local - 0.28) / 0.3, 0, 1) * 0.3
            curve = curve * 2 ** (depth * np.sin(2 * np.pi * 5.4 * local) / 12)
        freq[a:b] = curve
        attack = np.minimum(1, local / (0.025 if previous is None else 0.012))
        release = np.clip((duration - local) / 0.05, 0, 1)
        swell = 0.85 + 0.15 * np.minimum(1, local / 0.3)
        amp[a:b] = attack * release * swell
        previous = target
    freq = np.nan_to_num(freq, nan=SA)
    phase = 2 * np.pi * np.cumsum(freq) / SR
    tone = np.sin(phase) + 0.2 * np.sin(2 * phase) + 0.07 * np.sin(3 * phase)
    breath = bandpass(noise(total), 1500, 7000) * 0.09
    return (tone + breath) * lowpass(amp, 40) * strength


def tick(strength=1.0):
    t = seconds(0.03)
    return (np.sin(2 * np.pi * 2400 * t) * 0.5 + bandpass(noise(0.03), 2000, 8000)) * np.exp(-t / 0.006) * strength


def chime(strength=1.0):
    t = seconds(1.6)
    out = np.zeros_like(t)
    for f, delay in ((hz(12), 0.0), (hz(19), 0.12)):
        shifted = np.clip(t - delay, 0, None)
        on = t >= delay
        for ratio, weight in ((1, 1), (2.76, 0.3), (5.4, 0.12)):
            out += on * np.sin(2 * np.pi * f * ratio * shifted) * np.exp(-shifted / (0.7 / ratio)) * weight
    return out * strength


def riser(duration=0.9, strength=1.0):
    t = seconds(duration)
    sweep = noise(duration)
    out = np.zeros_like(t)
    # A rising band of air: four bands handed over as it climbs.
    for i, (low, high) in enumerate(((400, 1200), (900, 2600), (2000, 5000), (4000, 9000))):
        weight = np.clip(1 - abs(t / duration * 3 - i), 0, 1)
        out += bandpass(sweep, low, high) * weight
    return out * (t / duration) ** 2 * strength


# ---------------------------------------------------------------- the score

buses = {
    "madal": Bus(reverb=0.1),
    "jingles": Bus(reverb=0.1),
    "cymbal": Bus(reverb=0.3),
    "kick": Bus(),
    "bass": Bus(),
    "drone": Bus(reverb=0.25),
    "pad": Bus(reverb=0.3),
    "flute": Bus(reverb=0.35),
    "fx": Bus(reverb=0.2),
}


def at(section, bar, eighth=0.0):
    return (section["start"] + bar * BAR_FRAMES) / FPS + eighth * EIGHTH


# Chords by bar of an eight-bar cycle: I I IV V / I IV V I.
CYCLE = ["D", "D", "G", "A", "D", "G", "A", "D"]
CHORD = {
    "D": [hz(-12), hz(-8), hz(-5)],
    "G": [hz(-7), hz(-3), hz(0) / 1],
    "A": [hz(-5), hz(-1), hz(2)],
}
ROOT = {"D": hz(-36), "G": hz(-31), "A": hz(-29)}

# The tune. Phrase A asks, phrase B answers, C is the quiet version for
# screens that want less.
TUNE_A = [
    (P, 2, "kan"), (D, 1), (S + 12, 2), (D, 1),
    (P, 1), (G, 1), (R, 1), (G, 3),
    (R, 1, "kan"), (G, 1), (P, 1), (D, 2), (P, 1),
    (G, 1), (R, 1), (S, 4),
]
TUNE_B = [
    (S + 12, 2, "kan"), (R + 12, 1), (S + 12, 2), (D, 1),
    (P, 2), (D, 1), (P, 1), (G, 2),
    (R, 1), (G, 1), (P, 1), (G, 1), (R, 1), (D - 12, 1),
    (S, 6),
]
TUNE_C = [
    (S + 12, 6, "kan"),
    (D, 3), (P, 3),
    (G, 6),
    (R, 3), (S, 3),
]
CALL = [(S, 0.5, "tongue"), (R, 0.5), (G, 0.5), (P, 0.5), (D, 4, "kan")]
FINALE = [
    (P, 2, "kan"), (D, 1), (S + 12, 3),
    (R + 12, 1), (S + 12, 1), (D, 1), (P, 3),
    (G, 1), (R, 1), (G, 1), (R, 1), (S, 2),
    (S, 6, "tongue"),
]

# Which screens get the tune, and which the quiet line.
TUNE_FOR = {
    "calendar": "AB",
    "bazar": "AB",
    "keeper": "AB",
    "tools": "BA",
    "yours": "A",
    "news": "C",
    "weather": "C",
    "routine": "C",
}


def phrase_bars(notes):
    return round(sum(length for _, length, *_ in notes) / 6)


def groove(section, bar, fill=False, light=False):
    """One bar of the jhyaure groove."""
    madal, jingles = buses["madal"], buses["jingles"]
    # Dhim on 1 and 4, ta between, ghosts filling the lilt.
    madal.add(at(section, bar, 0), madal_dhim(1.0), pan=-0.1)
    madal.add(at(section, bar, 2), madal_ta(0.8), pan=0.15)
    madal.add(at(section, bar, 3), madal_dhim(0.75), pan=-0.1)
    madal.add(at(section, bar, 4), madal_ta(0.7), pan=0.15)
    madal.add(at(section, bar, 5), madal_ta(0.35, open_=False), pan=0.15)
    madal.add(at(section, bar, 1.5), madal_ta(0.25, open_=False), pan=0.15)
    if fill:
        for i, e in enumerate((3, 3.5, 4, 4.5, 5, 5.5)):
            madal.add(at(section, bar, e), madal_ta(0.45 + i * 0.09), pan=0.15)
    for e in range(6):
        jingles.add(at(section, bar, e), khaijadi(0.9 if e in (0, 3) else 0.45), pan=0.35)
    if not light:
        buses["kick"].add(at(section, bar, 0), kick(1.0))
        buses["kick"].add(at(section, bar, 3), kick(0.65))


def harmony(section, bar, chord, strength=1.0):
    buses["pad"].add(at(section, bar), pad(CHORD[chord], BAR_FRAMES / FPS, strength), pan=0)
    root = ROOT[chord]
    buses["bass"].add(at(section, bar, 0), bass(root, 3 * EIGHTH * 0.95, strength))
    buses["bass"].add(at(section, bar, 3), bass(root * (1.5 if bar % 2 else 1), 3 * EIGHTH * 0.95, strength * 0.8))


def drone(start, bars_):
    """The tanpura's cycle, Pa Sa Sa low-Sa, across every two bars."""
    for b in range(0, bars_, 2):
        base = start + b * BAR_FRAMES / FPS
        for i, freq in enumerate((hz(-29), hz(-24), hz(-24), hz(-36))):
            buses["drone"].add(base + i * 3 * EIGHTH, tanpura(freq), pan=-0.3 + 0.2 * i)


def hit(t, strength=1.0):
    buses["cymbal"].add(t, jhyali(strength), pan=0.2)
    buses["madal"].add(t, madal_dhim(1.1 * strength), pan=-0.1)
    buses["kick"].add(t, kick(1.1 * strength))


drone(0, round(LENGTH * FPS / BAR_FRAMES))

for section in cues["sections"]:
    kind, bars_ = section["kind"], section["bars"]
    start = section["start"] / FPS

    if kind == "open":
        # A breath of flute over the drone; the click lands the band.
        buses["flute"].add(at(section, 0, 1), bansuri([(G, 1), (P, 4, "kan")], 0.7), pan=0.1)
        hit(at(section, 1), 0.8)
        harmony(section, 1, "D", 0.7)
        buses["flute"].add(at(section, 1, 0.5), bansuri(CALL, 0.8), pan=0.1)
        groove(section, 2, fill=True, light=True)
        harmony(section, 2, "A", 0.8)
        buses["fx"].add(at(section, 3) - 0.9, riser(0.9, 0.5), pan=0)

    elif kind == "card":
        # The groove stops for the question: cymbals, one dhim, a call.
        hit(start)
        harmony(section, 0, "G", 0.9)
        buses["flute"].add(at(section, 0, 1), bansuri([(R + 12, 0.5, "tongue"), (S + 12, 0.5), (D, 3, "kan")], 0.75), pan=0.1)
        buses["madal"].add(at(section, 0, 4), madal_ta(0.6), pan=0.15)
        buses["madal"].add(at(section, 0, 4.5), madal_ta(0.7), pan=0.15)
        buses["madal"].add(at(section, 0, 5), madal_ta(0.8), pan=0.15)
        buses["madal"].add(at(section, 0, 5.5), madal_ta(0.9), pan=0.15)

    elif kind in ("footage", "notification"):
        light = kind == "notification"
        for b in range(bars_):
            groove(section, b, fill=b == bars_ - 1, light=light)
            harmony(section, b, CYCLE[b % 8], 0.7 if light else 1.0)
        if bars_ > 1:
            buses["fx"].add(at(section, bars_) - 0.9, riser(0.9, 0.45), pan=0)
        tune = TUNE_FOR.get(section["id"], "")
        bar = 0
        for name in tune * 3:
            notes = {"A": TUNE_A, "B": TUNE_B, "C": TUNE_C}[name]
            length = phrase_bars(notes)
            # The tune rests in the section's last bar, under the fill.
            if bar + length > bars_ - 1:
                break
            buses["flute"].add(at(section, bar), bansuri(notes, 0.95 if name != "C" else 0.75), pan=0.1)
            bar += length

    elif kind == "end":
        hit(start, 1.2)
        for b in range(2):
            groove(section, b)
            harmony(section, b, ["D", "A"][b])
        harmony(section, 2, "D", 0.8)
        buses["flute"].add(start, bansuri(FINALE, 1.0), pan=0.1)
        # A tihai: the same figure three times, landing on the last downbeat.
        figure = (0, 0.5, 1.0)
        for repeat in range(3):
            for e in figure:
                buses["madal"].add(at(section, 2, repeat * 2 + e), madal_ta(0.9), pan=0.15)
        hit(at(section, 3), 1.0)
        buses["pad"].add(at(section, 3), pad(CHORD["D"], 1.4, 0.8))

for frame in cues["clicks"]:
    buses["fx"].add(frame / FPS, tick(0.5), pan=0.4)
for frame in cues["chimes"]:
    buses["fx"].add(frame / FPS, chime(0.8), pan=0.4)

# ---------------------------------------------------------------- mix

# Each stem's level, as RMS in dBFS while it plays.
LEVELS = {
    "madal": -19,
    "jingles": -31,
    "cymbal": -27,
    "kick": -24,
    "bass": -23,
    "drone": -30,
    "pad": -29,
    "flute": -18,
    "fx": -30,
}


def reverb_ir(seconds_=2.2):
    t = seconds(seconds_)
    left = lowpass(noise(seconds_), 6000) * np.exp(-t / 0.5)
    right = lowpass(noise(seconds_), 6000) * np.exp(-t / 0.5)
    ir = np.stack([left, right])
    return ir / np.sqrt(np.sum(ir**2) / 2)


IR = reverb_ir()
mix = None
for name, bus in buses.items():
    stem = bus.stereo()
    active = np.abs(stem).max(axis=0) > 1e-4
    rms = np.sqrt(np.mean(stem[:, active] ** 2)) if active.any() else 0
    if rms == 0:
        continue
    stem *= 10 ** (LEVELS[name] / 20) / rms
    if bus.reverb:
        wet = np.stack([fftconvolve(stem[i], IR[i])[: stem.shape[1]] for i in range(2)])
        stem = stem + wet * bus.reverb * 0.35
    mix = stem if mix is None else mix + stem

mix = highpass(mix, 28)
# Gentle glue, then a soft limiter and a whisker of headroom.
mix = np.tanh(mix * 1.6) / np.tanh(1.6)
mix *= 0.89 / np.abs(mix).max()

end = int(LENGTH * SR)
mix = mix[:, :end]
fade = int(0.08 * SR)
mix[:, -fade:] *= np.linspace(1, 0, fade)

out = HERE / "public" / "music.wav"
with wave.open(str(out), "wb") as file:
    file.setnchannels(2)
    file.setsampwidth(2)
    file.setframerate(SR)
    file.writeframes((mix.T * 32767).astype("<i2").tobytes())
print(f"wrote {out.relative_to(HERE)}: {LENGTH:.1f} s")
