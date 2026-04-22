from hashlib import sha256

from bookost.pipeline.context import PipelineContext
from bookost.schemas.condition import ConditionVector

_EMOTION_TENSION: dict[str, float] = {
    "sad": 0.35,
    "joy": 0.25,
    "tension": 0.9,
    "fear": 0.85,
    "excitement": 0.65,
    "calm": 0.15,
}

_EMOTION_DARK: dict[str, float] = {
    "sad": 0.75,
    "joy": 0.2,
    "tension": 0.55,
    "fear": 0.9,
    "excitement": 0.35,
    "calm": 0.25,
}

_TEMPO_MAP: dict[str, float] = {"slow": 0.2, "static": 0.1, "fast": 0.85, "climax": 1.0}

_MOOD_BRIGHT: dict[str, float] = {
    "dark": 0.15,
    "melancholic": 0.25,
    "eerie": 0.2,
    "neutral": 0.5,
    "bright": 0.85,
    "uplifting": 0.9,
}

_GENRE_WEIGHT: dict[str, float] = {
    "romance": 0.85,
    "fantasy": 0.9,
    "mystery": 0.8,
    "essay": 0.6,
    "general": 0.5,
}


def _clamp(x: float) -> float:
    return max(0.0, min(1.0, round(x, 3)))


def run(ctx: PipelineContext) -> None:
    e = ctx.emotion
    if e is None:
        raise RuntimeError("emotion stage required before condition vector")

    tension = _EMOTION_TENSION.get(e.emotion, 0.5) * (0.5 + 0.5 * e.intensity)
    darkness = _EMOTION_DARK.get(e.emotion, 0.5)
    tempo = _TEMPO_MAP.get(e.tempo, 0.4) * (0.6 + 0.4 * e.intensity)
    genre_weight = _GENRE_WEIGHT.get(e.genre, 0.5)
    brightness = _MOOD_BRIGHT.get(e.mood, 0.5)

    # environment nudges
    env_l = e.environment.lower()
    if any(k in env_l for k in ("rain", "night", "storm", "비", "밤")):
        darkness = _clamp(darkness + 0.1)
        brightness = _clamp(brightness - 0.1)
    if any(k in env_l for k in ("sun", "morning", "해돋")):
        brightness = _clamp(brightness + 0.15)
        darkness = _clamp(darkness - 0.1)

    # Procedural audio: nudge the vector with a stable text digest so *different* scenes
    # do not map to the same 6D point when labels tie (e.g. same emotion bucket).
    digest = sha256((ctx.cleaned_text or ctx.raw_text or "").encode("utf-8")).digest()
    h0 = int.from_bytes(digest[0:4], "big")
    h1 = int.from_bytes(digest[4:8], "big")
    h2 = int.from_bytes(digest[8:12], "big")

    def jiggle(val: float, a: int, b: int, shift: int) -> float:
        n = (a ^ (b >> 4)) & 0x3FFF
        j = (n >> (shift & 6)) & 0x3F
        w = 0.18 * (j / 63.0 - 0.5)  # ±0.09
        return _clamp(val + w)

    tension = jiggle(tension, h0, h1, 0)
    darkness = jiggle(darkness, h0, h2, 2)
    tempo = jiggle(tempo, h1, h0, 4)
    genre_weight = jiggle(genre_weight, h2, h1, 5)
    brightness = jiggle(brightness, h0 + h1, h2, 1)
    emo = jiggle(e.intensity, h1, h2, 3)

    ctx.condition = ConditionVector(
        tension=tension,
        darkness=darkness,
        tempo=tempo,
        genre_weight=genre_weight,
        brightness=brightness,
        emotional_intensity=emo,
    )
