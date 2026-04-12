from __future__ import annotations

from bookost.config import Settings
from bookost.pipeline.context import PipelineContext
from bookost.pipeline.stages import (
    condition_vector_stage,
    emotion_stage,
    input_stage,
    music_stage,
    output_stage,
    postprocess_stage,
    prompt_engine_stage,
    text_clean,
)
from bookost.schemas.generate import GenerateRequest, GenerateResponse
from bookost.schemas.output import PipelineArtifacts
from bookost.storage.s3 import maybe_upload_and_url


async def run_pipeline(req: GenerateRequest, settings: Settings) -> GenerateResponse:
    ctx = PipelineContext()
    input_stage.run(ctx, req.text)
    text_clean.run(ctx)

    await emotion_stage.run(ctx, settings)
    condition_vector_stage.run(ctx)
    prompt_engine_stage.run(ctx)

    target_dur = req.target_duration_sec
    if target_dur is None:
        target_dur = (settings.audio_target_min_sec + settings.audio_target_max_sec) / 2
    target_dur = max(settings.audio_target_min_sec, min(settings.audio_target_max_sec, target_dur))

    await music_stage.run(ctx, settings, duration_sec=target_dur)
    postprocess_stage.run(ctx, settings, target_duration_sec=target_dur)

    ost = output_stage.run(ctx)
    audio_url, download_url = await maybe_upload_and_url(ctx, settings)

    assert ctx.emotion is not None and ctx.condition is not None

    artifacts = PipelineArtifacts(
        cleaned_text=ctx.cleaned_text,
        sentences=ctx.sentences,
        emotion=ctx.emotion,
        condition=ctx.condition,
        music_prompt=ctx.music_prompt,
        audio_url=audio_url,
        download_url=download_url,
        duration_sec=ctx.duration_sec,
        ost_card=ost,
    )
    return GenerateResponse(job_id=ctx.job_id, artifacts=artifacts)
