from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from pathlib import Path

from bookost.schemas.condition import ConditionVector
from bookost.schemas.emotion import EmotionAnalysis


@dataclass
class PipelineContext:
    job_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    raw_text: str = ""
    cleaned_text: str = ""
    sentences: list[str] = field(default_factory=list)
    emotion: EmotionAnalysis | None = None
    condition: ConditionVector | None = None
    music_prompt: str = ""
    raw_audio_path: Path | None = None
    final_audio_path: Path | None = None
    audio_url: str | None = None
    download_url: str | None = None
    duration_sec: float | None = None
    metadata: dict = field(default_factory=dict)
