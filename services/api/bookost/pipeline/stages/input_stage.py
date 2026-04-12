from bookost.pipeline.context import PipelineContext


def run(ctx: PipelineContext, raw_text: str) -> None:
    ctx.raw_text = raw_text.strip()
