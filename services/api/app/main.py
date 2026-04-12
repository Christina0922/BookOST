from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import audio, generate, health
from bookost.config import get_settings


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Path("data/tmp").mkdir(parents=True, exist_ok=True)
    Path("data/out").mkdir(parents=True, exist_ok=True)
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router, prefix="/v1")
    app.include_router(generate.router, prefix="/v1")
    app.include_router(audio.router, prefix="/v1")

    return app


app = create_app()
