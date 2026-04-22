from __future__ import annotations

import json
import re
from hashlib import sha256
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
        "sad": [
            "슬픔",
            "눈물",
            "이별",
            "쓸쓸",
            "외로",
            "그리움",
            "sad",
            "sorrow",
            "grief",
            "tears",
            "goodbye",
            "lonely",
            "alone",
            "depressed",
            "weep",
            "cry",
        ],
        "joy": [
            "기쁨",
            "웃음",
            "행복",
            "환희",
            "joy",
            "happy",
            "laugh",
            "smile",
            "cheer",
            "delight",
            "celebrat",
        ],
        "tension": [
            "긴장",
            "숨막",
            "대립",
            "추격",
            "tension",
            "chase",
            "standoff",
            "grip",
            "angry",
            "rage",
            "furious",
            "fight",
            "argue",
        ],
        "fear": [
            "공포",
            "두려움",
            "악몽",
            "피",
            "blood",
            "fear",
            "terror",
            "dread",
            "scared",
            "horror",
            "nightmare",
        ],
        "excitement": [
            "설렘",
            "두근",
            "기대",
            "excited",
            "flutter",
            "anticipation",
            "thrill",
        ],
        "calm": ["평온", "고요", "잔잔", "calm", "peace", "still", "quiet", "serene", "gentle", "soft"],
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
        "night city": ["밤", "네온", "night", "city", "도시", "골목", "alley", "urban"],
        "forest": ["숲", "forest", "나무", "wood", "grove", "woodland"],
        "ocean": ["바다", "ocean", "파도", "wave", "sea", "tide", "beach", "coast"],
        "mountain": ["산", "mountain", "peak", "summit", "ridge", "alpine", "hills", "village"],
        "interior": ["방", "집", "카페", "room", "home", "cafe", "kitchen", "office", "hall", "stair", "stairway"],
    },
    "genre": {
        "romance": ["사랑", "키스", "로맨스", "romance", "kiss", "heart", "love", "wedding"],
        "fantasy": ["마법", "용", "왕국", "fantasy", "magic", "dragon", "spell", "knight", "sword", "crown", "castle", "fairy", "fae"],
        "mystery": [
            "수수께끼",
            "단서",
            "범인",
            "mystery",
            "clue",
            "detective",
            "whodunit",
            "secret",
        ],
        "essay": [
            "생각",
            "회고",
            "essay",
            "memoir",
            "reflection",
            "recall",
        ],
    },
}


# When no dictionary keywords match, the previous implementation used the first
# key of each dict (e.g. sad + rainy night for almost all generic text). Use
# explicit defaults, then diversify with a stable text fingerprint.
_ENV_FALLBACKS: tuple[str, ...] = (
    "open interior",
    "coastal haze",
    "city dusk",
    "empty corridor",
    "mountain pass",
    "woodland stillness",
    "rain-streaked window",
    "late subway car",
    "stadium reverb",
    "sunlit atrium",
    "basement stair",
    "train compartment",
    "foggy quay",
)

_EM_FINGERPRINT_ORDER: tuple[str, ...] = get_args(EmotionLabel)  # type: ignore[assignment]
_TM_FINGERPRINT_ORDER: tuple[str, ...] = get_args(TempoLabel)  # type: ignore[assignment]
_MD_FINGERPRINT_ORDER: tuple[str, ...] = ("neutral", "neutral", "dark", "bright", "melancholic", "uplifting", "eerie")
_GN_FINGERPRINT_ORDER: tuple[str, ...] = ("general", "general", "mystery", "romance", "essay", "fantasy")

# No-LLM: lightweight lexicons (EN tokens + short KO stems) to map prose → labels.
# Word-boundary style matching reduces accidental hits from substrings.
_LEX_EN_POS: frozenset[str] = frozenset(
    {
        "love", "loved", "loving", "lovely", "happy", "joy", "laugh", "laughed", "smile", "light",
        "sun", "dawn", "bright", "warm", "tender", "gentle", "kind", "hope", "hoped", "peace",
        "safe", "home", "together", "kiss", "soft", "sweet", "laughter", "cheer", "wedding",
    }
)
_LEX_EN_NEG: frozenset[str] = frozenset(
    {
        "sad", "grief", "grieved", "tears", "tear", "cry", "died", "dead", "death", "dying", "loss",
        "lonely", "alone", "empty", "cold", "dark", "darkness", "fear", "scared", "dread", "hate", "hated",
        "ache", "aching", "broken", "goodbye", "never", "gone", "grave", "blood", "die",
    }
)
_LEX_EN_TENSION: frozenset[str] = frozenset(
    {
        "chase", "chased", "run", "running", "gun", "knife", "fight", "fought", "punch", "shout", "yell",
        "pursue", "grab", "grip", "sprint", "racing", "alarm", "screaming", "door", "locked", "hunting",
    }
)
_LEX_EN_FEAR: frozenset[str] = frozenset(
    {
        "horror", "nightmare", "haunted", "ghost", "monster", "creep", "creepy", "terror", "panic",
    }
)
_LEX_KO_POS: tuple[str, ...] = (
    "행복", "기뻐", "웃", "웃음", "사랑", "따뜻", "빛", "희망", "화창", "따스", "다정", "포근", "감사",
)
_LEX_KO_NEG: tuple[str, ...] = (
    "슬픔", "눈물", "죽", "끔찍", "절망", "쓸쓸", "아프", "괴로", "비탄", "이별", "잃", "상처",
)
_LEX_KO_TENSION: tuple[str, ...] = (
    "쫓", "싸", "총", "도망", "긴장", "숨", "뛰", "쾅", "비명", "위협", "갈등",
)
_LEX_KO_FEAR: tuple[str, ...] = ("악몽", "공포", "귀신", "찢", "으스스", "섬뜩", "망")

_TOKEN_RE = re.compile(r"(?:[a-zA-Z']+|[가-힣]{2,})")


def _tokens(text: str) -> list[str]:
    return [m.group(0).lower() for m in _TOKEN_RE.finditer(text)]


def _lex_hits_tension_fear_ko(text: str) -> tuple[int, int, int, int, int, int]:
    t = text
    toks = set(_tokens(t))
    pos = sum(1 for w in toks if w in _LEX_EN_POS) + sum(2 for s in _LEX_KO_POS if s in t)
    neg = sum(1 for w in toks if w in _LEX_EN_NEG) + sum(2 for s in _LEX_KO_NEG if s in t)
    ten = sum(1 for w in toks if w in _LEX_EN_TENSION) + sum(2 for s in _LEX_KO_TENSION if s in t)
    fea = sum(1 for w in toks if w in _LEX_EN_FEAR) + sum(2 for s in _LEX_KO_FEAR if s in t)
    return pos, neg, ten, fea, len(toks), max(len(t), 1)


def _pick_emotion_no_keyword_hits(
    text: str,
) -> str:
    """Prefer lexicon + tension/fear signals; fall back to stable fingerprint for remaining variety."""
    pos, neg, ten, fea, ntok, tlen = _lex_hits_tension_fear_ko(text)
    if fea >= 2 or (fea >= 1 and ten >= 1):
        return "fear"
    if ten >= 2:
        return "tension"
    # Polarity: normalize so long texts do not always skew extreme.
    scale = (ntok**0.5) + 1.0
    pol = (pos - neg) / scale
    if pol > 0.45:
        return "joy"
    if pol < -0.45:
        return "sad"
    if pol > 0.2 and text.count("!") >= 1:
        return "excitement"
    if 0.15 < pol <= 0.4:
        return "joy" if tlen < 200 else "calm"
    if -0.4 <= pol < -0.15:
        return "sad" if tlen < 200 else "calm"
    return _diversify_from_fingerprint(_fingerprint32(text + "|emo"), _EM_FINGERPRINT_ORDER)


def _pick_tempo_no_keyword_hits(text: str) -> str:
    n_ex, n_ell, n_q = text.count("!"), text.count("..."), text.count("?")
    if n_ell >= 2 or "slow" in text.lower() or "느리" in text or "잔잔" in text:
        return "static" if n_ell >= 2 and n_ex == 0 else "slow"
    if n_ex >= 2 or "rush" in text.lower() or "빨리" in text or "달리" in text or "sprint" in text.lower():
        return "climax" if n_ex >= 3 else "fast"
    if n_q >= 3 and "myst" not in text.lower():
        return "static"
    parts = re.split(r"(?<=[.!?。！？])\s+", text.strip())
    sents = max(1, len([p for p in parts if p]))
    wcount = max(1, len(_tokens(text)))
    if wcount / sents < 4.0 and wcount > 12:
        return "fast"
    if wcount / sents > 16:
        return "slow"
    return _diversify_from_fingerprint(_fingerprint32(text + "|tpo"), _TM_FINGERPRINT_ORDER)


def _fingerprint32(text: str) -> int:
    return int.from_bytes(sha256(text.encode("utf-8")).digest()[:4], "big")


def _score_bucket(text: str, bucket: dict[str, list[str]], default: str) -> tuple[str, int]:
    """Label with the most keyword hits. Ties and zero-hit cases resolve to *default* (not dict order)."""
    lowered = text.lower()
    best, best_hits = default, 0
    for label, words in bucket.items():
        if not words:
            continue
        hits = sum(1 for w in words if w in text or w in lowered)
        if hits > best_hits:
            best, best_hits = label, hits
    return best, best_hits


def _diversify_from_fingerprint(
    h: int,
    order: tuple[str, ...],
) -> str:
    return order[h % len(order)]


def _nudge_from_punctuation(text: str) -> dict[str, str]:
    """Lightweight heuristics to reflect tone when keyword lists miss."""
    out: dict[str, str] = {}
    n_q = text.count("?")
    n_ex = text.count("!")
    n_ell = text.count("...")

    if n_ell >= 1:
        out.setdefault("tempo", "static")
    if n_q >= 2 or ("who " in text.lower() and "?" in text):
        out.setdefault("genre", "mystery")
    if n_ex >= 2 or text.strip().endswith("!!") or "!!!" in text:
        out.setdefault("tempo", "fast")
        out.setdefault("emotion", "excitement")
    return out


def analyze_rule_based(text: str) -> EmotionAnalysis:
    emotion, em_hits = _score_bucket(text, _KEYWORDS["emotion"], "calm")
    if em_hits == 0:
        emotion = _pick_emotion_no_keyword_hits(text)
    if emotion not in _ALLOWED_EMOTION:
        emotion = "calm"

    tempo, tp_hits = _score_bucket(text, _KEYWORDS["tempo"], "slow")
    if tp_hits == 0:
        tempo = _pick_tempo_no_keyword_hits(text)
    if tempo not in _ALLOWED_TEMPO:
        tempo = "slow"

    mood, mo_hits = _score_bucket(text, _KEYWORDS["mood"], "neutral")
    if mo_hits == 0:
        if emotion in ("fear", "tension"):
            mood = "eerie" if _fingerprint32(text + "|md") % 2 == 0 else "dark"
        else:
            mood = _diversify_from_fingerprint(_fingerprint32(text + "|mood"), _MD_FINGERPRINT_ORDER)
    if mood not in _ALLOWED_MOOD:
        mood = "neutral"

    genre, gn_hits = _score_bucket(text, _KEYWORDS["genre"], "general")
    if gn_hits == 0:
        genre = _diversify_from_fingerprint(_fingerprint32(text + "|genre"), _GN_FINGERPRINT_ORDER)
    if genre not in _ALLOWED_GENRE:
        genre = "general"

    env_label, env_hits = _score_bucket(text, _KEYWORDS["environment"], "interior")
    if env_hits == 0:
        environment = _ENV_FALLBACKS[_fingerprint32(text + "|env") % len(_ENV_FALLBACKS)]
    else:
        environment = env_label.replace("_", " ")

    if env_label == "rainy night" and env_hits > 0 and mood == "neutral":
        mood = "melancholic"
    nudges = _nudge_from_punctuation(text)
    if em_hits == 0 and "emotion" in nudges and nudges["emotion"] in _ALLOWED_EMOTION:
        emotion = nudges["emotion"]  # type: ignore[assignment]
    if tp_hits == 0 and "tempo" in nudges and nudges["tempo"] in _ALLOWED_TEMPO:
        tempo = nudges["tempo"]  # type: ignore[assignment]
    if gn_hits == 0 and "genre" in nudges and nudges["genre"] in _ALLOWED_GENRE:
        genre = nudges["genre"]  # type: ignore[assignment]

    punct = len(re.findall(r"[.!?。！？]", text))
    h = _fingerprint32(text)
    base = 0.38 + 0.1 * (h % 13) / 12.0
    intensity = min(1.0, base + 0.06 * punct + 0.01 * min(len(text), 400) / 40)

    return EmotionAnalysis(
        emotion=emotion,
        intensity=round(intensity, 2),
        tempo=tempo,
        mood=mood,
        environment=environment,
        genre=genre,
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
