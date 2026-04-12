from __future__ import annotations

import asyncio
from pathlib import Path

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from bookost.config import Settings
from bookost.pipeline.context import PipelineContext


async def maybe_upload_and_url(ctx: PipelineContext, settings: Settings) -> tuple[str | None, str | None]:
    path = ctx.final_audio_path
    if path is None or not path.exists():
        return None, None

    public = settings.public_api_url.rstrip("/")

    if (
        settings.s3_bucket
        and settings.aws_access_key_id
        and settings.aws_secret_access_key
        and settings.aws_region
    ):
        key = f"bookost/{ctx.job_id}/final.wav"
        try:
            session = boto3.session.Session(
                aws_access_key_id=settings.aws_access_key_id,
                aws_secret_access_key=settings.aws_secret_access_key,
                region_name=settings.aws_region,
            )
            s3 = session.client("s3")
            await asyncio.to_thread(
                lambda: s3.upload_file(
                    str(path),
                    settings.s3_bucket,
                    key,
                    ExtraArgs={"ContentType": "audio/wav"},
                )
            )
            url = s3.generate_presigned_url(
                "get_object",
                Params={"Bucket": settings.s3_bucket, "Key": key},
                ExpiresIn=3600,
            )
            dl = url  # same object; client may append filename when saving
            if settings.s3_public_base_url:
                url = f"{settings.s3_public_base_url.rstrip('/')}/{key}"
                dl = url
            return url, dl
        except (BotoCoreError, ClientError):
            pass

    stream = f"{public}/v1/audio/{ctx.job_id}"
    download = f"{public}/v1/audio/{ctx.job_id}?disposition=attachment"
    return stream, download
