"""In-memory OCR only. Callers must not persist image bytes."""

from __future__ import annotations

from io import BytesIO

from PIL import Image

from bookost.config import Settings


def extract_text_from_image_bytes(data: bytes, settings: Settings) -> str:
    import pytesseract

    if settings.tesseract_cmd:
        pytesseract.pytesseract.tesseract_cmd = settings.tesseract_cmd

    try:
        img = Image.open(BytesIO(data))
        img = img.convert("RGB")
    except Exception as e:
        raise ValueError("이미지 형식을 읽을 수 없습니다.") from e

    cfg = "--oem 3 --psm 6"
    lang = settings.ocr_languages.strip() or "eng"

    try:
        text = pytesseract.image_to_string(img, lang=lang, config=cfg)
    except pytesseract.TesseractNotFoundError as e:
        raise RuntimeError(
            "Tesseract OCR 엔진이 없습니다. Windows: https://github.com/UB-Mannheim/tesseract/wiki "
            "설치 후 PATH에 추가하거나 TESSERACT_CMD에 tesseract.exe 경로를 지정하세요."
        ) from e
    except Exception:
        try:
            text = pytesseract.image_to_string(img, lang="eng", config=cfg)
        except Exception as e2:
            raise RuntimeError("OCR에 실패했습니다. 언어 팩(kor) 설치 여부를 확인하세요.") from e2

    return " ".join(text.split()).strip()
