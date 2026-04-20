"""
Deterministic procedural "music-like" generator for MVP demos.

Why this exists:
- We still need end-to-end demos without external music APIs.
- The old mock used two static sine tones, so outputs felt almost identical.

What this version does:
- Builds melody/chord/rhythm patterns from text hash + condition vector.
- Keeps deterministic output for same text.
- Produces noticeably different motifs across different inputs.
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


def _midi_to_hz(midi: int) -> float:
    return 440.0 * (2.0 ** ((midi - 69) / 12.0))


def _build_phrase(
    seed: int,
    bars: int,
    root_midi: int,
    minor: bool,
    tempo_factor: float,
    tension: float,
) -> tuple[list[int], list[int]]:
    rng = random.Random(seed)
    scale = [0, 2, 3, 5, 7, 8, 10] if minor else [0, 2, 4, 5, 7, 9, 11]
    degrees = [0, 3, 4, 5]
    chords: list[int] = []
    melody: list[int] = []

    # 16th-note grid style (4 notes per beat feel) with moderate variation.
    steps_per_bar = 16
    phrase_steps = bars * steps_per_bar
    for i in range(phrase_steps):
        # Chord changes every bar.
        if i % steps_per_bar == 0:
            d = rng.choice(degrees)
            chord_root = root_midi + scale[d]
            chords.extend([chord_root, chord_root + (3 if minor else 4), chord_root + 7, chord_root + 12])

        # Melody follows scale with stochastic leaps influenced by tension.
        if not melody:
            melody.append(root_midi + scale[rng.randrange(len(scale))])
            continue
        prev = melody[-1]
        if rng.random() < (0.18 + 0.4 * tension):
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
        # Snap to scale.
        base_oct = (candidate // 12) * 12
        snap = min((base_oct + s for s in scale), key=lambda x: abs(x - candidate))
        melody.append(snap)

    return melody, chords


def _osc(f: float, t: float) -> float:
    # Slightly richer timbre than pure sine.
    return (
        0.72 * math.sin(2 * math.pi * f * t)
        + 0.2 * math.sin(2 * math.pi * 2 * f * t + 0.25)
        + 0.08 * math.sin(2 * math.pi * 3 * f * t + 0.5)
    )


def _write_wav(path: Path, duration_sec: float, seed_text: str, tension: float, tempo: float, darkness: float) -> None:
    # 짧은 루프 소스만 생성하고, 길이 맞춤·페이드는 postprocess에서 처리합니다.
    sample_rate = 22050
    n_frames = int(sample_rate * duration_sec)
    seed_int = int.from_bytes(sha256(seed_text.encode("utf-8")).digest()[:8], "big")
    rng = random.Random(seed_int)

    minor = darkness >= 0.55
    root_pool = [45, 47, 48, 50, 52] if minor else [48, 50, 52, 53, 55]
    root_midi = rng.choice(root_pool)
    tempo_factor = max(0.05, min(1.0, tempo))
    bars = 2 + int(2 * tempo_factor)  # 2~4 bar loop

    melody, chord = _build_phrase(seed_int, bars, root_midi, minor, tempo_factor, tension)
    step_rate_hz = 4.0 + 3.5 * tempo_factor  # note changes per second
    beat_hz = 1.2 + 1.6 * tempo_factor

    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "w") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        for i in range(n_frames):
            t = i / sample_rate
            # Step index for melodic progression.
            step_idx = int(t * step_rate_hz) % len(melody)
            note_hz = _midi_to_hz(melody[step_idx])

            # Arpeggiated chord voice.
            chord_note = chord[(int(t * (step_rate_hz * 0.5)) % len(chord))]
            chord_hz = _midi_to_hz(chord_note)

            # Percussive pulse envelope.
            beat_phase = (t * beat_hz) % 1.0
            pulse = math.exp(-10.0 * beat_phase)
            kick = math.sin(2 * math.pi * (55 + 35 * pulse) * t) * pulse * (0.2 + 0.35 * tension)

            # Mood envelope (darker => softer highs, brighter => more top layer).
            top_weight = max(0.05, 0.35 - 0.25 * darkness)
            main = _osc(note_hz, t) * 0.55
            pad = _osc(chord_hz * 0.5, t + 0.01) * 0.35
            top = _osc(note_hz * 2.0, t) * top_weight

            # Slow motion for musical breathing.
            long_env = 0.7 + 0.3 * math.sin(2 * math.pi * 0.08 * t + 0.4)
            mono = (main + pad + top + kick) * long_env * 0.28
            mono = max(-1.0, min(1.0, mono))

            # Gentle stereo spread.
            l = mono * (0.96 + 0.04 * math.sin(2 * math.pi * 0.17 * t))
            r = mono * (0.96 + 0.04 * math.sin(2 * math.pi * 0.19 * t + 0.7))
            wf.writeframes(struct.pack("<hh", int(l * 32767), int(r * 32767)))


class MockMusicProvider(MusicProvider):
    async def generate(self, ctx: PipelineContext, duration_sec: float) -> MusicGenerationResult:
        c = ctx.condition
        tension = c.tension if c else 0.35
        tempo = c.tempo if c else 0.3
        darkness = c.darkness if c else 0.4
        seed_text = f"{ctx.cleaned_text}|{ctx.music_prompt}|{ctx.emotion.emotion if ctx.emotion else ''}"

        out = Path("data") / "tmp" / f"{ctx.job_id}_mock.wav"
        seed_len = min(8.0, max(3.0, duration_sec * 0.2))
        _write_wav(out, seed_len, seed_text, tension=tension, tempo=tempo, darkness=darkness)
        return MusicGenerationResult(path=out, format="wav")
