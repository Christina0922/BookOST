import re

from bookost.pipeline.context import PipelineContext


def _split_sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?。！？])\s+", text)
    return [p.strip() for p in parts if p.strip()]


def run(ctx: PipelineContext) -> None:
    t = ctx.raw_text
    t = re.sub(r"[^\w\s가-힣ㄱ-ㅎㅏ-ㅣ.,!?…'\"-]", " ", t, flags=re.UNICODE)
    t = re.sub(r"\s+", " ", t).strip()
    ctx.cleaned_text = t
    ctx.sentences = _split_sentences(t) if t else []
