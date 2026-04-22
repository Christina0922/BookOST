"""
Deterministic procedural "music-like" generator for MVP demos (no external APIs).

- Builds melody / chord / rhythm from *condition vector* + text hash (perceived
  "scene fit" without LLM: tension, darkness, tempo, brightness, genre weight, intensity).
- 44.1kHz, mild stereo, sub layer, hihat, lead vibrato, soft-clip.
"""

from __future__ import annotations

import math
import random
import struct
import wave
from hashlib import sha256
from pathlib import Path

from bookost.music.base import MusicGenerationResult, MusicProvider
from bookost.pipeline.context import PipelineContext
from bookost.schemas.condition import ConditionVector


def _midi_to_hz(midi: int) -> float:
    return 440.0 * (2.0 ** ((midi - 69) / 12.0))


def _soft_clip(x: float, drive: float = 1.15) -> float:
    return math.tanh(drive * x)


def _build_phrase(
    seed: int,
    bars: int,
    root_midi: int,
    minor: bool,
    tempo_factor: float,
    tension: float,
    emo_int: float,
) -> tuple[list[int], list[int]]:
    rng = random.Random(seed)
    scale = [0, 2, 3, 5, 7, 8, 10] if minor else [0, 2, 4, 5, 7, 9, 11]
    degrees = [0, 3, 4, 5]
    chords: list[int] = []
    melody: list[int] = []
    stretch = 0.18 + 0.4 * tension + 0.12 * emo_int

    steps_per_bar = 16
    phrase_steps = bars * steps_per_bar
    for i in range(phrase_steps):
        if i % steps_per_bar == 0:
            d = rng.choice(degrees)
            chord_root = root_midi + scale[d]
            chords.extend([chord_root, chord_root + (3 if minor else 4), chord_root + 7, chord_root + 12])

        if not melody:
            melody.append(root_midi + scale[rng.randrange(len(scale))])
            continue
        prev = melody[-1]
        if rng.random() < stretch:
            jump = rng.choice([-5, -3, 3, 5, 7])
        else:
            jump = rng.choice([-2, -1, 1, 2])
        candidate = prev + jump
        lo = root_midi - 5
        hi = root_midi + 19 + int(6 * tempo_factor)
        while candidate < lo:
            candidate += 12
        while candidate > hi:
            candidate -= 12
        base_oct = (candidate // 12) * 12
        snap = min((base_oct + s for s in scale), key=lambda x: abs(x - candidate))
        melody.append(snap)

    return melody, chords


def _osc(f: float, t: float, brightness: float) -> float:
    br = max(0.0, min(1.0, brightness))
    return (
        0.7 * math.sin(2 * math.pi * f * t)
        + 0.18 * math.sin(2 * math.pi * 2 * f * t + 0.2)
        + 0.06 * (1.0 - 0.4 * (1.0 - br)) * math.sin(2 * math.pi * 3 * f * t + 0.4)
    )


def _mood_pad_strength(brightness: float, darkness: float) -> float:
    return max(0.0, min(1.0, 0.45 + 0.25 * brightness - 0.1 * darkness))


def _write_wav(
    path: Path,
    duration_sec: float,
    seed_text: str,
    condition: ConditionVector,
) -> None:
    c = condition
    tension = c.tension
    tempo = c.tempo
    darkness = c.darkness
    brightness = c.brightness
    genre_w = c.genre_weight
    emo_i = c.emotional_intensity

    sample_rate = 44100
    n_frames = int(sample_rate * duration_sec)
    seed_int = int.from_bytes(sha256(seed_text.encode("utf-8")).digest()[:8], "big")
    rng = random.Random(seed_int)

    minor = 0.55 * darkness + 0.45 * (1.0 - brightness) > 0.52
    root_pool = [45, 47, 48, 50, 52] if minor else [48, 50, 52, 53, 55]
    root_midi = rng.choice(root_pool)
    tempo_factor = max(0.05, min(1.0, tempo))
    bars = 2 + int(2 * tempo_factor) + (1 if genre_w > 0.8 else 0)
    if bars > 4:
        bars = 4

    melody, chord = _build_phrase(
        seed_int, bars, root_midi, minor, tempo_factor, tension, emo_i
    )
    step_rate_hz = 3.0 + 4.0 * tempo_factor
    beat_hz = 0.9 + 1.5 * tempo_factor
    hihat_rate = beat_hz * 2.0

    root_bass = root_midi - 12
    bass_hz = _midi_to_hz(root_bass)

    path.parent.mkdir(parents=True, exist_ok=True)
    prev_step = -1
    note_t0 = 0.0

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
            lead_env = 1.0 - math.exp(-(t - note_t0) * 40.0)

            note_hz = _midi_to_hz(melody[step_idx])
            vib = 1.0 + 0.01 * emo_i * math.sin(2 * math.pi * 5.2 * t)
            ph2 = 2.0 * math.pi * 0.35 * t + (seed_int & 0xFF) * 0.01
            vib2 = 1.0 + 0.002 * genre_w * math.sin(ph2)
            note_hz *= vib * vib2

            chord_idx = int(t * (step_rate_hz * 0.5)) % len(chord)
            chord_note = chord[chord_idx]
            chord_hz = _midi_to_hz(chord_note)

            beat_phase = (t * beat_hz) % 1.0
            pulse = math.exp(-9.0 * beat_phase)
            kick = math.sin(2 * math.pi * (50 + 40 * pulse) * t) * pulse * (0.18 + 0.4 * tension)

            hihat_p = (t * hihat_rate) % 1.0
            hat = 0.0
            if hihat_p < 0.04:
                hat = 0.12 * (1.0 - hihat_p / 0.04) * (0.35 + 0.4 * brightness)
            if (t * hihat_rate + 0.5) % 1.0 < 0.03:
                hat += 0.06 * brightness

            sub = math.sin(2 * math.pi * bass_hz * 0.5 * t) * 0.14 * (0.4 + 0.6 * genre_w)
            sub *= 0.5 + 0.5 * tension if tension > 0.35 else 0.4 + 0.6 * (1.0 - darkness * 0.3)

            top_w = max(0.04, 0.4 - 0.28 * darkness - 0.1 * (1.0 - brightness))
            main = _osc(note_hz, t, brightness) * 0.48 * (0.7 + 0.3 * lead_env)
            det = _osc(note_hz * 1.0025, t + 0.0007, brightness) * 0.1 * (0.3 + genre_w * 0.5)
            pad = _osc(chord_hz * 0.5, t + 0.012, brightness) * (0.32 + 0.08 * (1.0 - darkness))
            low_note = max(24, chord_note - 12)
            pad2 = _osc(_midi_to_hz(low_note) * 0.5, t, brightness) * 0.1 * _mood_pad_strength(brightness, darkness)
            top = _osc(note_hz * 2.0, t, brightness) * top_w * lead_env

            mono = main + det + pad + pad2 + top + sub + kick + hat
            long_env = 0.65 + 0.35 * math.sin(2 * math.pi * 0.07 * t + 0.3)
            mono = _soft_clip(mono * long_env * 0.3)

            wobble = 0.08 * emo_i
            l = mono * (0.95 + wobble * math.sin(2 * math.pi * 0.12 * t))
            r = mono * (0.95 + wobble * math.sin(2 * math.pi * 0.14 * t + 0.6))
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
