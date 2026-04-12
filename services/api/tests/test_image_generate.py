from unittest.mock import patch

import pytest


@pytest.mark.asyncio
async def test_generate_image_uses_ocr_then_pipeline(client):
    with patch(
        "app.routers.generate.extract_text_from_image_bytes",
        return_value="비 오는 밤, 그녀는 홀로 서 있었다.",
    ):
        r = await client.post(
            "/v1/generate/image",
            files={"file": ("shot.png", b"fake-bytes", "image/png")},
            data={},
        )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("ocr_text")
    assert data["artifacts"]["music_prompt"]


@pytest.mark.asyncio
async def test_generate_image_rejects_empty_ocr(client):
    with patch("app.routers.generate.extract_text_from_image_bytes", return_value=""):
        r = await client.post(
            "/v1/generate/image",
            files={"file": ("x.png", b"x", "image/png")},
        )
    assert r.status_code == 422
