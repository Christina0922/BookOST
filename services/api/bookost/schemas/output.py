from pydantic import BaseModel, Field

from bookost.schemas.condition import ConditionVector
from bookost.schemas.emotion import EmotionAnalysis


class OstCard(BaseModel):
    title: str
    tagline: str
    accent_color: str = Field(description="Hex color for share card")
    mood_emoji: str


class PipelineArtifacts(BaseModel):
    cleaned_text: str
    sentences: list[str]
    emotion: EmotionAnalysis
    condition: ConditionVector
    music_prompt: str
    audio_url: str | None = None
    download_url: str | None = None
    duration_sec: float | None = None
    ost_card: OstCard
