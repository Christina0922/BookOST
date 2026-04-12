"""
Deterministic procedural audio for MVP demos when Suno is unavailable.
Produces stereo WAV derived from condition vector (not 'musical', but validates pipeline).
"""

from __future__ import annotations

import math
import struct
import wave
from pathlib import Path

from bookost.music.base import MusicGenerationResult, MusicProvider
from bookost.pipeline.context import PipelineContext


def _write_wav(path: Path, duration_sec: float, base_hz: float, second_hz: float) -> None:
    # 짧은 루프 소스만 생성하고, 길이 맞춤·페이드는 postprocess에서 처리합니다.
    sample_rate = 22050
    n_frames = int(sample_rate * duration_sec)
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "w") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        for i in range(n_frames):
            t = i / sample_rate
            s1 = math.sin(2 * math.pi * base_hz * t)
            s2 = 0.35 * math.sin(2 * math.pi * second_hz * t + 0.7)
            env = 0.55 + 0.45 * math.sin(2 * math.pi * 0.12 * t)
            sample = int(max(-1.0, min(1.0, (s1 + s2) * env * 0.22)) * 32767)
            wf.writeframes(struct.pack("<hh", sample, sample))


class MockMusicProvider(MusicProvider):
    async def generate(self, ctx: PipelineContext, duration_sec: float) -> MusicGenerationResult:
        c = ctx.condition
        base = 196.0
        second = 293.66
        if c:
            base = 130 + 220 * c.tension
            second = base * (1.0 + 0.35 * c.tempo)
        out = Path("data") / "tmp" / f"{ctx.job_id}_mock.wav"
        seed_len = min(8.0, max(3.0, duration_sec * 0.2))
        _write_wav(out, seed_len, base, second)
        return MusicGenerationResult(path=out, format="wav")
