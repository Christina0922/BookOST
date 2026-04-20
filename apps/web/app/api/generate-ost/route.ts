import { existsSync } from "fs";
import { join } from "path";

import { NextResponse } from "next/server";

import { analyzeEmotionFromText } from "@/lib/analyzeEmotion";
import { getAudioPresetByEmotion } from "@/lib/mapEmotionToAudio";
import { buildLayerPlan, buildSceneAnalysis } from "@/lib/sceneMusic";
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
    const preset = getAudioPresetByEmotion(analysis.emotion);
    const scene = buildSceneAnalysis(text, analysis);
    const layerPlan = buildLayerPlan(scene);

    const layerEntries = Object.entries(layerPlan).filter((entry): entry is [keyof typeof layerPlan, string] => Boolean(entry[1]));
    const existingLayers: Partial<typeof layerPlan> = {};
    for (const [layerType, layerUrl] of layerEntries) {
      const layerPath = join(process.cwd(), "public", layerUrl.replace(/^\//, ""));
      if (existsSync(layerPath)) {
        existingLayers[layerType] = layerUrl;
      }
    }
    const layerSources = Object.values(existingLayers).filter((layer): layer is string => Boolean(layer));
    const useLayerMix = layerSources.length >= 2;

    // public/audio missing fallback handling
    const audioPath = join(process.cwd(), "public", preset.audioUrl.replace(/^\//, ""));
    const finalPreset = preset;
    const fallbackAudioReady = existsSync(audioPath);
    const isAudioReady = useLayerMix || fallbackAudioReady;
    const fallbackReason: "preset_missing" | "all_missing" | undefined = isAudioReady ? undefined : "all_missing";

    const resolvedPreset = {
      ...finalPreset,
      description: isAudioReady
        ? finalPreset.description
        : `${finalPreset.description} (Mock OST 프리셋만 연결됨: /audio/${finalPreset.emotion}.mp3 파일을 추가하세요)`,
    };

    return NextResponse.json<GenerateOstResponse>({
      success: true,
      emotion: analysis.emotion,
      preset: resolvedPreset,
      scene,
      layers: existingLayers,
      layerSources,
      mixMode: useLayerMix ? "layers" : "fallback",
      moodLabel: resolvedPreset.moodLabel,
      ostTitle: resolvedPreset.ostTitle,
      description: resolvedPreset.description,
      sceneInterpretation: resolvedPreset.sceneInterpretation,
      audioUrl: useLayerMix ? layerSources[0] : resolvedPreset.audioUrl,
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

