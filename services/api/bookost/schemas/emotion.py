from typing import Literal

from pydantic import BaseModel, Field


EmotionLabel = Literal["sad", "joy", "tension", "fear", "excitement", "calm"]
TempoLabel = Literal["slow", "fast", "climax", "static"]
MoodLabel = Literal["dark", "bright", "neutral", "melancholic", "uplifting", "eerie"]
GenreLabel = Literal["romance", "fantasy", "mystery", "essay", "general"]


class EmotionAnalysis(BaseModel):
    emotion: EmotionLabel = Field(description="Dominant narrative emotion")
    intensity: float = Field(ge=0.0, le=1.0)
    tempo: TempoLabel
    mood: MoodLabel
    environment: str = Field(description="Scene setting, e.g. rainy night, forest")
    genre: GenreLabel
