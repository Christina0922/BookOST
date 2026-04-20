import type { EmotionAnalysisResult } from "@/lib/analyzeEmotion";
import type { OstPreset } from "@/lib/mapEmotionToAudio";
import type {
  GeneratedMusicOutput,
  MusicParameterResult,
  SceneAnalysisResult,
} from "@/types/music";

export type GenerateOstSuccess = {
  success: true;
  emotion: EmotionAnalysisResult["emotion"];
  preset: OstPreset;
  sceneAnalysis: SceneAnalysisResult;
  musicParameters: MusicParameterResult;
  scene_summary: string;
  emotion_weights: SceneAnalysisResult["emotion_weights"];
  scene_type: SceneAnalysisResult["scene_type"];
  tone: SceneAnalysisResult["tone"];
  explanation: string;
  generated: GeneratedMusicOutput;
  mixMode: "generated" | "fallback";
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

