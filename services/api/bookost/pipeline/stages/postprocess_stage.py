from __future__ import annotations

from pathlib import Path

from pydub import AudioSegment
from pydub.effects import normalize

from bookost.config import Settings
from bookost.pipeline.context import PipelineContext


def _load_segment(path: Path) -> AudioSegment:
    suf = path.suffix.lower()
    try:
        if suf == ".wav":
            return AudioSegment.from_wav(str(path))
        if suf == ".mp3":
            return AudioSegment.from_mp3(str(path))
        return AudioSegment.from_file(str(path))
    except Exception as e:  # noqa: BLE001 — pydub/ffmpeg surfaces many types
        raise RuntimeError(
            "오디오 로드 실패: mp3 등은 ffmpeg 설치가 필요할 수 있습니다. "
            "MVP에서는 MUSIC_PROVIDER=mock 권장."
        ) from e


def _loop_to_length(segment: AudioSegment, target_ms: int) -> AudioSegment:
    if len(segment) >= target_ms:
        return segment
    out = AudioSegment.silent(duration=0)
    piece = segment
    while len(out) < target_ms:
        out += piece
    return out[:target_ms]


def run(ctx: PipelineContext, settings: Settings, target_duration_sec: float) -> None:
    if ctx.raw_audio_path is None:
        raise RuntimeError("raw audio missing")
    raw = ctx.raw_audio_path
    seg = _load_segment(raw)

    lo = int(settings.audio_target_min_sec * 1000)
    hi = int(settings.audio_target_max_sec * 1000)
    target_ms = int(max(settings.audio_target_min_sec, min(settings.audio_target_max_sec, target_duration_sec)) * 1000)
    target_ms = max(lo, min(hi, target_ms))

    seg = _loop_to_length(seg, target_ms)
    seg = seg[:target_ms]

    fade_ms = min(180, max(60, target_ms // 80))
    seg = seg.fade_in(fade_ms).fade_out(fade_ms)
    seg = normalize(seg)

    out_dir = Path("data") / "out"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{ctx.job_id}_final.wav"
    seg.export(str(out_path), format="wav")
    ctx.final_audio_path = out_path
    ctx.duration_sec = len(seg) / 1000.0
