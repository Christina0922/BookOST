"""
Suno (or compatible) HTTP adapter — endpoint varies by vendor; configure via env.

Set SUNO_API_KEY and MUSIC_PROVIDER=suno. Request shape may need adjustment for your vendor.
"""

from __future__ import annotations

from pathlib import Path

import httpx

from bookost.config import Settings
from bookost.music.base import MusicGenerationResult, MusicProvider
from bookost.pipeline.context import PipelineContext


class SunoMusicProvider(MusicProvider):
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    async def generate(self, ctx: PipelineContext, duration_sec: float) -> MusicGenerationResult:
        if not self._settings.suno_api_key:
            raise RuntimeError("SUNO_API_KEY is required when MUSIC_PROVIDER=suno")

        headers = {"Authorization": f"Bearer {self._settings.suno_api_key}"}
        payload = {
            "prompt": ctx.music_prompt,
            "duration_sec": int(duration_sec),
            "instrumental": True,
            "title": f"BookOST-{ctx.job_id[:8]}",
        }
        base = self._settings.suno_api_base.rstrip("/")
        async with httpx.AsyncClient(timeout=120.0) as client:
            # Example path — replace with your provider's documented route.
            r = await client.post(f"{base}/v1/generate", json=payload, headers=headers)
            r.raise_for_status()
            data = r.json()

        audio_url = data.get("audio_url") or data.get("url")
        if not audio_url:
            raise RuntimeError(f"Unexpected Suno response: {data!r}")

        ext = "mp3" if "mp3" in str(audio_url).lower() else "wav"
        out = Path("data") / "tmp" / f"{ctx.job_id}_suno_raw.{ext}"
        out.parent.mkdir(parents=True, exist_ok=True)
        async with httpx.AsyncClient(timeout=120.0) as client:
            ar = await client.get(audio_url)
            ar.raise_for_status()
            out.write_bytes(ar.content)

        return MusicGenerationResult(path=out, format=ext)
