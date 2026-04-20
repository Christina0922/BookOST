import { existsSync } from "fs";
import { join } from "path";

import { NextResponse } from "next/server";

import { analyzeEmotionFromText } from "@/lib/analyzeEmotion";
import { analyzeScene } from "@/lib/analyzeScene";
import { generateMidiFromParameters } from "@/lib/generateMidi";
import { generateMusicParameters } from "@/lib/generateMusicParameters";
import { getAudioPresetByEmotion } from "@/lib/mapEmotionToAudio";
import type { GenerateOstResponse } from "@/types/ost";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { text?: string };
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
    const generated = generateMidiFromParameters(musicParameters);

    // public/audio missing fallback handling
    const audioPath = join(process.cwd(), "public", preset.audioUrl.replace(/^\//, ""));
    const finalPreset = preset;
    const fallbackAudioReady = existsSync(audioPath);
    const isAudioReady = generated.notes.length > 0 || fallbackAudioReady;
    const fallbackReason: "preset_missing" | "all_missing" | undefined = isAudioReady ? undefined : "all_missing";

    const resolvedPreset = {
      ...finalPreset,
      description: isAudioReady
        ? finalPreset.description
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
      audioUrl: resolvedPreset.audioUrl,
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

