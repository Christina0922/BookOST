"""
Deterministic procedural audio for local demos (no music APIs).

Stronger *between-scene* contrast via:
- SHA-256 split into several RNG / pitch / mode lanes (not one 64-bit int)
- Condition vector (JSON) mixed into the hash so labels can tie but audio diverges
- 7 diatonic modes, wide root register, 4 timbre presets, ambient vs driving percussion
"""

from __future__ import annotations

import json
import math
import random
import struct
import wave
from hashlib import sha256
from pathlib import Path

from bookost.music.base import MusicGenerationResult, MusicProvider
from bookost.pipeline.context import PipelineContext
from bookost.schemas.condition import ConditionVector

# (name, 7 step intervals from tonic, use minor 3 in triad)
_MODES: tuple[tuple[str, list[int], bool], ...] = (
    ("ionian", [0, 2, 4, 5, 7, 9, 11], False),
    ("aeolian", [0, 2, 3, 5, 7, 8, 10], True),
    ("dorian", [0, 2, 3, 5, 7, 9, 10], True),
    ("phrygian", [0, 1, 3, 5, 7, 8, 10], True),
    ("mixolydian", [0, 2, 4, 5, 7, 9, 10], False),
    ("harmonic_minor", [0, 2, 3, 5, 7, 8, 11], True),
    ("locrian", [0, 1, 3, 5, 6, 8, 10], True),
)


def _midi_to_hz(midi: int) -> float:
    return 440.0 * (2.0 ** ((midi - 69) / 12.0))


def _soft_clip(x: float, drive: float) -> float:
    return math.tanh(drive * x)


def _osc_timbre(f: float, t: float, brightness: float, preset: int) -> float:
    br = max(0.0, min(1.0, brightness))
    p = preset % 4
    if p == 0:
        return (
            0.6 * math.sin(2 * math.pi * f * t)
            + 0.25 * math.sin(2 * math.pi * 2 * f * t)
            + 0.12 * br * math.sin(2 * math.pi * 5 * f * t)
        )
    if p == 1:
        return (
            0.5 * math.sin(2 * math.pi * f * t)
            + 0.28 * math.sin(2 * math.pi * 3 * f * t + 0.1)
            + 0.15 * (1.0 - 0.2 * (1.0 - br)) * math.sin(2 * math.pi * 2 * f * t)
        )
    if p == 2:
        return (
            0.7 * math.sin(2 * math.pi * f * t + 0.2)
            + 0.12 * math.sin(2 * math.pi * 4 * f * t)
            + 0.08 * br * math.sin(2 * math.pi * 6 * f * t)
        )
    return (
        0.65 * math.sin(2 * math.pi * f * t)
        + 0.2 * math.sin(2 * math.pi * 2 * f * t + 0.2)
        + 0.08 * (1.0 - 0.4 * (1.0 - br)) * math.sin(2 * math.pi * 3 * f * t + 0.4)
    )


def _mood_pad_strength(brightness: float, darkness: float) -> float:
    return max(0.0, min(1.0, 0.45 + 0.25 * brightness - 0.1 * darkness))


def _all_scale_pitch_candidates(root: int, scale: list[int]) -> list[int]:
    return [root + s + 12 * k for s in scale for k in range(-2, 3)]


def _nearest_scale_pitch(root: int, scale: list[int], candidate: int) -> int:
    cands = _all_scale_pitch_candidates(root, scale)
    return min(cands, key=lambda x: abs(x - candidate))


def _build_phrase(
    seed: int,
    bars: int,
    root_midi: int,
    scale: list[int],
    triad_minor: bool,
    tempo_factor: float,
    tension: float,
    emo_int: float,
) -> tuple[list[int], list[int]]:
    rng = random.Random(seed)
    chord_degree_idx = [0, 2, 3, 4, 5]  # pick chord roots on scale
    stretch = 0.16 + 0.42 * tension + 0.16 * emo_int
    third = 3 if triad_minor else 4

    chords: list[int] = []
    melody: list[int] = []
    steps_per_bar = 16
    phrase_steps = bars * steps_per_bar
    for i in range(phrase_steps):
        if i % steps_per_bar == 0:
            di = rng.choice(chord_degree_idx) % len(scale)
            off = scale[di]
            chord_root = root_midi + off
            chords.extend([chord_root, chord_root + third, chord_root + 7, chord_root + 12])

        if not melody:
            melody.append(root_midi + scale[rng.randrange(len(scale))])
            continue
        prev = melody[-1]
        if rng.random() < stretch:
            jump = rng.choice([-7, -5, -3, 3, 5, 7])
        else:
            jump = rng.choice([-2, -1, 1, 2])
        candidate = prev + jump
        lo, hi = root_midi - 7, root_midi + 24 + int(6 * tempo_factor)
        while candidate < lo:
            candidate += 12
        while candidate > hi:
            candidate -= 12
        melody.append(_nearest_scale_pitch(root_midi, scale, candidate))

    return melody, chords


def _seeds_from(seed_text: str, c: ConditionVector) -> tuple[int, int, int, int, int, int, int, int]:
    key = f"{seed_text}|{c.tension:.4f}|{c.darkness:.4f}|{c.tempo:.4f}|{c.genre_weight:.4f}|{c.brightness:.4f}|{c.emotional_intensity:.4f}"
    b0 = sha256(key.encode("utf-8")).digest()
    b1 = sha256(key.encode("utf-8") + b"::cond").digest()
    j = int.from_bytes(sha256(json.dumps(c.model_dump(), sort_keys=True).encode()).digest()[:8], "big")
    s0 = int.from_bytes(b0[0:8], "big")
    s1 = int.from_bytes(b0[8:16], "big")
    s2 = int.from_bytes(b0[16:24], "big")
    s3 = int.from_bytes(b0[24:32], "big")
    t0 = int.from_bytes(b1[0:8], "big")
    t1 = int.from_bytes(b1[8:16], "big")
    s4 = s0 ^ j
    s5 = s1 ^ (j << 1)
    return s0, s1, s2, s3, s4, s5, t0, t1


def _write_wav(
    path: Path,
    duration_sec: float,
    seed_text: str,
    condition: ConditionVector,
) -> None:
    c = condition
    s0, s1, s2, s3, s4, s5, t0, t1 = _seeds_from(seed_text, c)
    r0 = random.Random(s0)
    r1 = random.Random(s1)

    tension = c.tension
    tempo = c.tempo
    darkness = c.darkness
    brightness = c.brightness
    genre_w = c.genre_weight
    emo_i = c.emotional_intensity

    mode_idx = s3 % len(_MODES)
    _, scale, triad_minor = _MODES[mode_idx]
    timbre = (s1 >> 5) % 4
    drive = 0.9 + 0.45 * ((s2 ^ t0) & 0x0F) / 15.0

    root_midi = 36 + (s4 % 22)
    if (s5 % 4) == 0:
        root_midi = min(62, max(36, root_midi + 5))
    root_midi = int(root_midi)

    tempo_factor = max(0.05, min(1.0, tempo + 0.1 * (r0.random() - 0.5)))
    bars = 2 + (s5 % 3)
    if genre_w > 0.75 and bars < 4:
        bars += 1

    phrase_seed = s0 ^ (s1 >> 3) ^ (s2 << 1) ^ t0
    melody, chord = _build_phrase(phrase_seed, bars, root_midi, list(scale), triad_minor, tempo_factor, tension, emo_i)
    if not melody or not chord:
        melody = [root_midi + scale[0]]
        chord = [root_midi, root_midi + (3 if triad_minor else 4), root_midi + 7, root_midi + 12]

    step_rate_hz = 2.2 + 4.5 * tempo_factor
    if (t1 % 5) < 2:
        step_rate_hz += 0.4 * (r1.random())
    beat_hz = 0.7 + 1.8 * tempo_factor
    hihat_rate = beat_hz * (2.0 if (s2 % 3) else 1.5)
    offbeat = 0.12 * ((s3 & 0x0F) / 16.0)

    root_bass = root_midi - 12
    bass_hz = _midi_to_hz(root_bass)

    ambient = tension < 0.28 and tempo < 0.32
    kick_mul = 0.0 if ambient else 0.65 + 0.35 * tension
    hat_mul = 0.0 if ambient else 0.5 + 0.5 * brightness

    sample_rate = 44100
    n_frames = int(sample_rate * duration_sec)
    path.parent.mkdir(parents=True, exist_ok=True)
    prev_step = -1
    note_t0 = 0.0
    hihat_seed = t1

    with wave.open(str(path), "w") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        for i in range(n_frames):
            t = i / sample_rate
            step_idx = int(t * step_rate_hz) % len(melody)
            if step_idx != prev_step:
                note_t0 = t
                prev_step = step_idx
            lead_env = 1.0 - math.exp(-(t - note_t0) * (30.0 + 22.0 * emo_i))

            note_hz = _midi_to_hz(melody[step_idx])
            vib = 1.0 + 0.012 * emo_i * math.sin(2 * math.pi * (5.0 + 0.3 * (s0 % 7)) * t)
            ph2 = 2.0 * math.pi * 0.31 * t + (hihat_seed & 0xFF) * 0.01
            vib2 = 1.0 + 0.0035 * genre_w * math.sin(ph2)
            note_hz *= vib * vib2

            chord_idx = int(t * (step_rate_hz * 0.5)) % len(chord)
            chord_note = chord[chord_idx]
            chord_hz = _midi_to_hz(chord_note)

            beat_phase = (t * beat_hz) % 1.0
            pulse = math.exp(-8.0 * beat_phase)
            kick = math.sin(2 * math.pi * (48 + 40 * pulse) * t) * pulse * (0.22 + 0.5 * tension) * kick_mul

            hihat_p = (t * hihat_rate + offbeat) % 1.0
            hat = 0.0
            if hihat_p < 0.034:
                hat = 0.12 * (1.0 - hihat_p / 0.034) * hat_mul * (0.3 + 0.7 * brightness)
            if ((t * hihat_rate + 0.5 + offbeat) % 1.0) < 0.026:
                hat += 0.05 * hat_mul * brightness

            sub = math.sin(2 * math.pi * bass_hz * 0.5 * t) * 0.14 * (0.35 + 0.65 * genre_w)
            if ambient:
                sub *= 0.5 + 0.5 * (1.0 - darkness * 0.4)
            else:
                sub *= 0.4 + 0.6 * (0.3 + 0.7 * tension)

            top_w = max(0.04, 0.42 - 0.3 * darkness - 0.12 * (1.0 - brightness))
            main = _osc_timbre(note_hz, t, brightness, timbre) * 0.5 * (0.65 + 0.35 * lead_env)
            det = _osc_timbre(note_hz * 1.0028, t + 0.0006, brightness, (timbre + 1) % 4) * 0.1 * (0.25 + 0.75 * genre_w)
            pad = _osc_timbre(chord_hz * 0.5, t + 0.014, brightness, (timbre + 2) % 4) * (0.3 + 0.08 * (1.0 - darkness))
            low_note = max(24, chord_note - 12)
            pad2 = _osc_timbre(_midi_to_hz(low_note) * 0.5, t, brightness, timbre) * 0.1 * _mood_pad_strength(brightness, darkness)
            top = _osc_timbre(note_hz * 2.0, t, brightness, (timbre + 3) % 4) * top_w * lead_env

            noise_bed = 0.0
            if emo_i > 0.62 and (s0 % 2) == 0:
                nph = 2 * math.pi * 100.0 * t
                noise_bed = 0.01 * emo_i * (math.sin(nph * 0.5) * math.sin(nph * 0.3)) * darkness

            mono = main + det + pad + pad2 + top + sub + kick + hat + noise_bed
            sh = 0.07 + 0.02 * (s1 % 5)
            long_env = 0.58 + 0.42 * math.sin(2 * math.pi * (0.062 + sh) * t + 0.2)
            mono = _soft_clip(mono * long_env * 0.31, drive)

            wob = 0.07 + 0.11 * emo_i
            l = mono * (0.9 + wob * math.sin(2 * math.pi * 0.11 * t + s0 * 0.0008))
            r = mono * (0.9 + wob * math.sin(2 * math.pi * 0.13 * t + 0.5 + s1 * 0.0008))
            l = max(-1.0, min(1.0, l))
            r = max(-1.0, min(1.0, r))
            wf.writeframes(struct.pack("<hh", int(l * 32767), int(r * 32767)))


class MockMusicProvider(MusicProvider):
    async def generate(self, ctx: PipelineContext, duration_sec: float) -> MusicGenerationResult:
        c = ctx.condition
        if c is None:
            c = ConditionVector(
                tension=0.4,
                darkness=0.45,
                tempo=0.4,
                genre_weight=0.5,
                brightness=0.5,
                emotional_intensity=0.5,
            )
        seed_text = f"{ctx.cleaned_text}|{ctx.music_prompt}|{ctx.emotion.emotion if ctx.emotion else ''}"
        out = Path("data") / "tmp" / f"{ctx.job_id}_mock.wav"
        seed_len = min(8.0, max(3.0, duration_sec * 0.2))
        _write_wav(out, seed_len, seed_text, c)
        return MusicGenerationResult(path=out, format="wav")
