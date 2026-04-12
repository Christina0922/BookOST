from pydantic import BaseModel, Field


class ConditionVector(BaseModel):
    tension: float = Field(ge=0.0, le=1.0)
    darkness: float = Field(ge=0.0, le=1.0)
    tempo: float = Field(ge=0.0, le=1.0, description="0 slow/static — 1 fast/climax")
    genre_weight: float = Field(ge=0.0, le=1.0)
    brightness: float = Field(ge=0.0, le=1.0)
    emotional_intensity: float = Field(ge=0.0, le=1.0)
