import pytest


@pytest.mark.asyncio
async def test_health(client):
    r = await client.get("/v1/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_generate_pipeline_mock(client):
    r = await client.post(
        "/v1/generate/",
        json={"text": "비 오는 밤, 그녀는 홀로 창가에 섰다."},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["job_id"]
    art = data["artifacts"]
    assert art["music_prompt"]
    assert art["emotion"]["emotion"] in {"sad", "joy", "tension", "fear", "excitement", "calm"}
    assert art["audio_url"]
    job = data["job_id"]
    ar = await client.get(f"/v1/audio/{job}")
    assert ar.status_code == 200
    assert ar.headers.get("content-type", "").startswith("audio/")
