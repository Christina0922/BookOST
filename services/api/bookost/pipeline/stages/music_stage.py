from bookost.config import Settings
from bookost.music.mock_provider import MockMusicProvider
from bookost.music.suno_provider import SunoMusicProvider
from bookost.pipeline.context import PipelineContext


def _provider(settings: Settings):
    if settings.music_provider.lower() == "suno":
        return SunoMusicProvider(settings)
    return MockMusicProvider()


async def run(ctx: PipelineContext, settings: Settings, duration_sec: float) -> None:
    provider = _provider(settings)
    result = await provider.generate(ctx, duration_sec=duration_sec)
    ctx.raw_audio_path = result.path
    ctx.metadata["music_format"] = result.format
