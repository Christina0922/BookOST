import { existsSync } from "fs";
import { join } from "path";

import { NextResponse } from "next/server";

import { analyzeEmotionFromText } from "@/lib/analyzeEmotion";
import { analyzeScene } from "@/lib/analyzeScene";
import { generateMidiFromParameters } from "@/lib/generateMidi";
import { generateMusicParameters } from "@/lib/generateMusicParameters";
import { getAudioPresetByEmotion } from "@/lib/mapEmotionToAudio";
import type { GenerateOstResponse } from "@/types/ost";

type ApiGenerateResponse = { job_id?: string | null };

/**
 * The UI was using only the client-side (TS) MIDI path, so improvements on the
 * Python mock pipeline were not heard. When BOOKOST_API_URL is set, we call
 * FastAPI and stream that WAV through /api/ost-audio/:jobId for playback.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { text?: string; targetDurationSec?: number };
    const text = body?.text?.trim() ?? "";

    if (!text) {
      return NextResponse.json<GenerateOstResponse>(
        { success: false, message: "텍스트를 입력해 주세요." },
        { status: 400 },
      );
    }

    const analysis = analyzeEmotionFromText(text);
    const sceneAnalysis = analyzeScene(text);
    const preset = getAudioPresetByEmotion(sceneAnalysis.emotion);
    const musicParameters = generateMusicParameters(sceneAnalysis, text);
    let generated = generateMidiFromParameters(musicParameters);

    const back = process.env.BOOKOST_API_URL;
    let audioUrlOut = preset.audioUrl;
    let fromBackend = false;
    if (back) {
      try {
        const target =
          body.targetDurationSec != null && body.targetDurationSec >= 5 && body.targetDurationSec <= 120
            ? body.targetDurationSec
            : 30;
        const upstream = await fetch(`${back.replace(/\/$/, "")}/v1/generate/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, target_duration_sec: target }),
          cache: "no-store",
        });
        if (upstream.ok) {
          const j = (await upstream.json()) as ApiGenerateResponse;
          if (j.job_id) {
            audioUrlOut = `/api/ost-audio/${j.job_id}`;
            generated = { notes: [], midi_base64: "" };
            fromBackend = true;
          }
        }
      } catch {
        // local TS MIDI + preset / public fallback
      }
    }

    // public/audio missing fallback handling
    const audioPath = join(process.cwd(), "public", preset.audioUrl.replace(/^\//, ""));
    const finalPreset = preset;
    const fallbackAudioReady = existsSync(audioPath);
    const isAudioReady = fromBackend || generated.notes.length > 0 || fallbackAudioReady;
    const fallbackReason: "preset_missing" | "all_missing" | undefined = isAudioReady
      ? undefined
      : "all_missing";

    const resolvedPreset = {
      ...finalPreset,
      description: isAudioReady
        ? fromBackend
          ? `${finalPreset.description} (서버·파이프라인 OST가 재생됩니다.)`
          : finalPreset.description
        : `${finalPreset.description} (Mock OST 프리셋만 연결됨: /audio/${finalPreset.emotion}.mp3 파일을 추가하세요)`,
    };

    return NextResponse.json<GenerateOstResponse>({
      success: true,
      emotion: sceneAnalysis.emotion,
      preset: resolvedPreset,
      sceneAnalysis,
      musicParameters,
      scene_summary: sceneAnalysis.scene_summary,
      emotion_weights: sceneAnalysis.emotion_weights,
      scene_type: sceneAnalysis.scene_type,
      tone: sceneAnalysis.tone,
      explanation: sceneAnalysis.explanation,
      generated,
      mixMode: generated.notes.length > 0 ? "generated" : "fallback",
      moodLabel: resolvedPreset.moodLabel,
      ostTitle: resolvedPreset.ostTitle,
      description: resolvedPreset.description,
      sceneInterpretation: resolvedPreset.sceneInterpretation,
      audioUrl: audioUrlOut,
      tags: resolvedPreset.tags,
      selectedPresetEmotion: resolvedPreset.emotion,
      isAudioReady,
      fallbackReason,
      keywords: analysis.keywords,
      score: analysis.score,
    });
  } catch {
    return NextResponse.json<GenerateOstResponse>(
      { success: false, message: "OST 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 500 },
    );
  }
}

