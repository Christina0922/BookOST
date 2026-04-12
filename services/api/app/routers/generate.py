from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.deps import settings_dep
from bookost.config import Settings
from bookost.ocr.extract import extract_text_from_image_bytes
from bookost.pipeline.orchestrator import run_pipeline
from bookost.schemas.generate import GenerateRequest, GenerateResponse

router = APIRouter(prefix="/generate", tags=["generate"])

_MAX_IMAGE_BYTES = 12 * 1024 * 1024
_ALLOWED_CT = {"image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp", "image/tiff"}


@router.post("/", response_model=GenerateResponse)
async def generate(
    body: GenerateRequest,
    settings: Settings = Depends(settings_dep),
) -> GenerateResponse:
    return await run_pipeline(body, settings)


@router.post("/image", response_model=GenerateResponse)
async def generate_from_image(
    file: UploadFile = File(..., description="스크린샷·사진(메모리에서만 OCR, 서버에 저장하지 않음)"),
    target_duration_sec: float | None = Form(None),
    settings: Settings = Depends(settings_dep),
) -> GenerateResponse:
    ct = (file.content_type or "").split(";")[0].strip().lower()
    if ct and ct not in _ALLOWED_CT:
        raise HTTPException(status_code=400, detail=f"지원하지 않는 이미지 형식입니다: {ct}")

    raw = await file.read()
    if len(raw) > _MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="이미지가 너무 큽니다(최대 약 12MB).")

    try:
        ocr_text = extract_text_from_image_bytes(raw, settings)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    finally:
        raw = b""

    if not ocr_text or len(ocr_text) < 2:
        raise HTTPException(
            status_code=422,
            detail="이미지에서 읽을 수 있는 글자가 없습니다. 더 선명한 스크린샷을 시도하세요.",
        )

    body = GenerateRequest(text=ocr_text[:8000], target_duration_sec=target_duration_sec)
    out = await run_pipeline(body, settings)
    return GenerateResponse(job_id=out.job_id, artifacts=out.artifacts, ocr_text=ocr_text[:8000])
