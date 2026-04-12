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

    ctx.condition = ConditionVector(
        tension=_clamp(tension),
        darkness=_clamp(darkness),
        tempo=_clamp(tempo),
        genre_weight=_clamp(genre_weight),
        brightness=_clamp(brightness),
        emotional_intensity=_clamp(e.intensity),
    )
