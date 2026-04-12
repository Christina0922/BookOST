from bookost.pipeline.context import PipelineContext
from bookost.schemas.output import OstCard


def _accent(emotion: str) -> str:
    return {
        "sad": "#4C6EF5",
        "joy": "#FCC419",
        "tension": "#E64980",
        "fear": "#5C3D8C",
        "excitement": "#FF922B",
        "calm": "#51CF66",
    }.get(emotion, "#868E96")


def _emoji(emotion: str) -> str:
    return {
        "sad": "💧",
        "joy": "✨",
        "tension": "⚡",
        "fear": "🌑",
        "excitement": "💓",
        "calm": "🌿",
    }.get(emotion, "🎧")


def _title(ctx: PipelineContext) -> str:
    first = (ctx.sentences[0][:42] + "…") if ctx.sentences and len(ctx.sentences[0]) > 42 else (ctx.sentences[0] if ctx.sentences else "Reading OST")
    return f"오늘의 독서 OST — {first}"


def _tagline(ctx: PipelineContext) -> str:
    e = ctx.emotion
    if not e:
        return "장면에 맞춘 한 곡."
    return f"{e.environment} · {e.genre} · {e.mood}"


def run(ctx: PipelineContext) -> OstCard:
    e = ctx.emotion
    emotion_key = e.emotion if e else "calm"
    return OstCard(
        title=_title(ctx),
        tagline=_tagline(ctx),
        accent_color=_accent(emotion_key),
        mood_emoji=_emoji(emotion_key),
    )
