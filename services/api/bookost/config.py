from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "BookOST API"
    cors_origins: str = (
        "http://localhost:3000,http://127.0.0.1:3000,"
        "http://localhost:1000,http://127.0.0.1:1000"
    )

    # Windows 등에서 tesseract.exe 경로 (미설정 시 PATH 검색)
    tesseract_cmd: str | None = None
    ocr_languages: str = "kor+eng"

    openai_api_key: str | None = None
    openai_base_url: str = "https://api.openai.com/v1"
    openai_model: str = "gpt-4o-mini"

    music_provider: str = "mock"  # mock | suno
    suno_api_key: str | None = None
    suno_api_base: str = "https://api.suno.ai"  # placeholder; replace with real endpoint

    aws_region: str | None = None
    aws_access_key_id: str | None = None
    aws_secret_access_key: str | None = None
    s3_bucket: str | None = None
    s3_public_base_url: str | None = None

    public_api_url: str = "http://127.0.0.1:8000"

    audio_target_min_sec: float = 20.0
    audio_target_max_sec: float = 40.0

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
