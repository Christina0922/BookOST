"""
Prompt generation engine: maps condition vector + labels → short English music prompt.
This is the product core — deterministic templates for MVP speed and cost control.
"""

from bookost.pipeline.context import PipelineContext

_INSTRUMENTS = [
    ("tension", 0.72, "tense pulsing synth strings, ticking percussion"),
    ("darkness", 0.7, "low cello drones, shadowy pads"),
    ("brightness", 0.72, "soft acoustic guitar, airy bells"),
    ("tempo", 0.75, "driving rhythmic pulse, cinematic drums"),
    ("tempo", 0.25, "sparse piano, gentle ambient bed"),
    ("emotional_intensity", 0.75, "expressive solo lead, intimate close-mic"),
    ("genre_weight", 0.8, "orchestral film score palette"),
]


def _pick_instruments(ctx: PipelineContext) -> list[str]:
    c = ctx.condition
    e = ctx.emotion
    if c is None or e is None:
        return ["minimal piano", "soft ambient pad"]
    picks: list[str] = []
    for key, thresh, phrase in _INSTRUMENTS:
        val = getattr(c, key)
        if val >= thresh:
            picks.append(phrase)
    if not picks:
        picks.append("minimal felt piano, subtle ambient texture")
    # genre flavor
    genre_line = {
        "romance": "intimate romantic strings",
        "fantasy": "ethereal choir pads, mystical shimmer",
        "mystery": "noir jazz undertones, suspenseful plucks",
        "essay": "contemplative solo instrument, documentary softness",
        "general": "modern cinematic hybrid score",
    }.get(e.genre, "modern cinematic hybrid score")
    picks.append(genre_line)
    return picks[:3]


def _tempo_words(ctx: PipelineContext) -> str:
    e = ctx.emotion
    c = ctx.condition
    if e is None or c is None:
        return "moderate tempo"
    if e.tempo == "slow" or c.tempo < 0.35:
        return "very slow tempo, spacious mix"
    if e.tempo == "fast" or c.tempo > 0.75:
        return "fast energetic tempo"
    if e.tempo == "climax":
        return "building to climax, wide dynamics"
    if e.tempo == "static":
        return "almost static time, suspended atmosphere"
    return "breathing mid-tempo"


def _mood_cluster(ctx: PipelineContext) -> str:
    e = ctx.emotion
    if e is None:
        return "reflective"
    mood_map = {
        "dark": "noir melancholic",
        "bright": "hopeful luminous",
        "neutral": "neutral observational",
        "melancholic": "bittersweet melancholic",
        "uplifting": "uplifting anthemic",
        "eerie": "eerie uncanny",
    }
    emo_map = {
        "sad": "grief-tinged fragile",
        "joy": "warm celebratory",
        "tension": "nail-biting suspense",
        "fear": "cold dread-filled",
        "excitement": "fluttery anticipatory",
        "calm": "serene meditative",
    }
    return f"{mood_map.get(e.mood, 'cinematic')}, {emo_map.get(e.emotion, 'emotional')}"


def run(ctx: PipelineContext) -> None:
    if ctx.emotion is None or ctx.condition is None:
        raise RuntimeError("emotion and condition required before prompt engine")

    env = ctx.emotion.environment.strip()
    instruments = ", ".join(_pick_instruments(ctx))
    tempo = _tempo_words(ctx)
    mood = _mood_cluster(ctx)

    prompt = (
        f"{tempo}, {instruments}, {env}, {mood}, "
        "high production clarity, loop-friendly arrangement, no vocals"
    )
    # keep reasonably short
    words = prompt.replace(",", " ").split()
    ctx.music_prompt = " ".join(words[:48])
