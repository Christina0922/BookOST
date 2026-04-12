from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path

from bookost.pipeline.context import PipelineContext


@dataclass
class MusicGenerationResult:
    path: Path
    format: str  # wav | mp3


class MusicProvider(ABC):
    @abstractmethod
    async def generate(self, ctx: PipelineContext, duration_sec: float) -> MusicGenerationResult:
        raise NotImplementedError
