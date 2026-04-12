from pydantic import BaseModel, Field

from bookost.schemas.output import PipelineArtifacts


class GenerateRequest(BaseModel):
    text: str = Field(min_length=1, max_length=8000)
    target_duration_sec: float | None = Field(
        default=None,
        ge=5.0,
        le=120.0,
        description="Clamped to MVP window 20–40s when unset",
    )


class GenerateResponse(BaseModel):
    job_id: str | None = None
    artifacts: PipelineArtifacts
    ocr_text: str | None = Field(
        default=None,
        description="이미지 OCR로 추출된 원문(저장하지 않음). 직접 텍스트 입력 시 null.",
    )
