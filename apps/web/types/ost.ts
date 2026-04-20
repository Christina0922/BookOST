import type { EmotionAnalysisResult } from "@/lib/analyzeEmotion";
import type { OstPreset } from "@/lib/mapEmotionToAudio";
import type { LayerPlan, SceneAnalysis } from "@/lib/sceneMusic";

export type GenerateOstSuccess = {
  success: true;
  emotion: EmotionAnalysisResult["emotion"];
  preset: OstPreset;
  scene: SceneAnalysis;
  layers: Partial<LayerPlan>;
  layerSources: string[];
  mixMode: "layers" | "fallback";
  moodLabel: string;
  ostTitle: string;
  description: string;
  sceneInterpretation: string;
  audioUrl: string;
  selectedPresetEmotion: EmotionAnalysisResult["emotion"];
  isAudioReady: boolean;
  fallbackReason?: "preset_missing" | "all_missing";
  tags: string[];
  keywords: string[];
  score: number;
};

export type GenerateOstError = {
  success: false;
  message: string;
};

export type GenerateOstResponse = GenerateOstSuccess | GenerateOstError;

