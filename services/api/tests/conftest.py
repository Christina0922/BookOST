import os

import pytest_asyncio
from httpx import ASGITransport, AsyncClient

os.environ.setdefault("MUSIC_PROVIDER", "mock")
os.environ.setdefault("PUBLIC_API_URL", "http://test")

from app.main import app  # noqa: E402


@pytest_asyncio.fixture
async def client() -> AsyncClient:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
