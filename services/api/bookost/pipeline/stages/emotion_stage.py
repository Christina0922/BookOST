from __future__ import annotations

import json
import re
from typing import get_args

import httpx
from pydantic import ValidationError

from bookost.config import Settings
from bookost.pipeline.context import PipelineContext
from bookost.schemas.emotion import EmotionAnalysis, EmotionLabel, GenreLabel, MoodLabel, TempoLabel

_ALLOWED_EMOTION = set(get_args(EmotionLabel))
_ALLOWED_TEMPO = set(get_args(TempoLabel))
_ALLOWED_MOOD = set(get_args(MoodLabel))
_ALLOWED_GENRE = set(get_args(GenreLabel))

_KEYWORDS: dict[str, dict[str, list[str]]] = {
    "emotion": {
        "sad": ["슬픔", "눈물", "이별", "쓸쓸", "외로", "그리움", "sad", "tears", "goodbye", "lonely"],
        "joy": ["기쁨", "웃음", "행복", "환희", "joy", "happy", "laugh", "smile"],
        "tension": ["긴장", "숨막", "대립", "추격", "tension", "chase", "standoff", "grip"],
        "fear": ["공포", "두려움", "악몽", "피", "blood", "fear", "terror", "dread"],
        "excitement": ["설렘", "두근", "기대", "excited", "flutter", "anticipation"],
        "calm": ["평온", "고요", "잔잔", "calm", "peace", "still", "quiet", "serene"],
    },
    "tempo": {
        "slow": ["느리", "천천", "slow", "lingering"],
        "fast": ["빠르", "달리", "fast", "rush", "sprint"],
        "climax": ["절정", "고조", "폭발", "climax", "crescendo", "peak"],
        "static": ["정적", "멈춤", "고정", "static", "frozen", "pause"],
    },
    "mood": {
        "dark": ["어둠", "밤", "그림자", "dark", "shadow", "night"],
        "bright": ["밝", "햇살", "bright", "sunlight", "radiant"],
        "neutral": [],
        "melancholic": ["melanchol", "우울", "회한", "한탄"],
        "uplifting": ["희망", "hope", "uplift", "rise"],
        "eerie": ["기이", "소름", "eerie", "uncanny", "unsettling"],
    },
    "environment": {
        "rainy night": ["비", "장마", "rain", "storm", "빗소리"],
        "night city": ["밤", "네온", "night", "city", "도시", "골목"],
        "forest": ["숲", "forest", "나무", "wood"],
        "ocean": ["바다", "ocean", "파도", "wave"],
        "mountain": ["산", "mountain", "peak"],
        "interior": ["방", "집", "카페", "room", "home", "cafe"],
    },
    "genre": {
        "romance": ["사랑", "키스", "로맨스", "romance", "kiss", "heart"],
        "fantasy": ["마법", "용", "왕국", "fantasy", "magic", "dragon"],
        "mystery": ["수수께끼", "단서", "범인", "mystery", "clue", "detective"],
        "essay": ["생각", "회고", "essay", "memoir", "reflection"],
    },
}


def _score_bucket(text: str, bucket: dict[str, list[str]]) -> str:
    lowered = text.lower()
    best, best_hits = next(iter(bucket)), 0
    for label, words in bucket.items():
        hits = sum(1 for w in words if w in text or w in lowered)
        if hits > best_hits:
            best, best_hits = label, hits
    return best


def analyze_rule_based(text: str) -> EmotionAnalysis:
    emotion = _score_bucket(text, _KEYWORDS["emotion"])
    tempo = _score_bucket(text, _KEYWORDS["tempo"])
    mood = _score_bucket(text, _KEYWORDS["mood"])
    genre = _score_bucket(text, _KEYWORDS["genre"])

    env_label = _score_bucket(text, _KEYWORDS["environment"])
    if env_label == "rainy night" and mood == "neutral":
        mood = "melancholic"
    environment = env_label.replace("_", " ")

    punct = len(re.findall(r"[.!?。！？]", text))
    intensity = min(1.0, 0.4 + 0.06 * punct + 0.01 * min(len(text), 400) / 40)

    return EmotionAnalysis(
        emotion=emotion if emotion in _ALLOWED_EMOTION else "calm",
        intensity=round(intensity, 2),
        tempo=tempo if tempo in _ALLOWED_TEMPO else "slow",
        mood=mood if mood in _ALLOWED_MOOD else "neutral",
        environment=environment,
        genre=genre if genre in _ALLOWED_GENRE else "general",
    )


async def _analyze_openai(text: str, settings: Settings) -> EmotionAnalysis | None:
    if not settings.openai_api_key:
        return None
    system = (
        "You are a literary mood analyst for soundtrack generation. "
        "Return ONLY valid JSON with keys: emotion(sad|joy|tension|fear|excitement|calm), "
        "intensity(0-1 number), tempo(slow|fast|climax|static), mood(dark|bright|neutral|"
        "melancholic|uplifting|eerie), environment(short English phrase), genre(romance|fantasy|mystery|essay|general)."
    )
    payload = {
        "model": settings.openai_model,
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": text[:6000]},
        ],
    }
    headers = {"Authorization": f"Bearer {settings.openai_api_key}"}
    async with httpx.AsyncClient(timeout=60.0) as client:
        r = await client.post(f"{settings.openai_base_url.rstrip('/')}/chat/completions", json=payload, headers=headers)
        r.raise_for_status()
        data = r.json()
        content = data["choices"][0]["message"]["content"]
        obj = json.loads(content)
        try:
            return EmotionAnalysis.model_validate(obj)
        except ValidationError:
            return None


async def run(ctx: PipelineContext, settings: Settings) -> None:
    text = ctx.cleaned_text or ctx.raw_text
    source = "rules"
    emotion: EmotionAnalysis | None = None
    if settings.openai_api_key:
        try:
            emotion = await _analyze_openai(text, settings)
            if emotion is not None:
                source = "llm"
        except (httpx.HTTPError, KeyError, json.JSONDecodeError, ValueError, TypeError):
            emotion = None
    if emotion is None:
        emotion = analyze_rule_based(text)
    ctx.emotion = emotion
    ctx.metadata["emotion_source"] = source
