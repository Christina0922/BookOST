import type { EmotionType } from "@/lib/analyzeEmotion";

export type OstPreset = {
  emotion: EmotionType;
  moodLabel: string;
  ostTitle: string;
  description: string;
  sceneInterpretation: string;
  audioUrl: string;
  tags: string[];
};

const PRESETS: Record<EmotionType, OstPreset> = {
  tense: {
    emotion: "tense",
    moodLabel: "긴장",
    ostTitle: "Dark Collision",
    description: "빠른 전개와 충돌감을 반영한 어두운 OST",
    sceneInterpretation: "갑작스러운 파열감과 위협이 느껴지는 전개로 해석되었습니다.",
    audioUrl: "/audio/tense.mp3",
    tags: ["긴장", "어두움", "빠른 전개", "Mock OST"],
  },
  sad: {
    emotion: "sad",
    moodLabel: "슬픔",
    ostTitle: "Rain After Midnight",
    description: "고독하고 여운이 긴 장면을 위한 잔잔한 OST",
    sceneInterpretation: "고독과 상실감이 짙게 배어 있는 장면으로 해석되었습니다.",
    audioUrl: "/audio/sad.mp3",
    tags: ["슬픔", "고요함", "느린 흐름", "Mock OST"],
  },
  calm: {
    emotion: "calm",
    moodLabel: "평온",
    ostTitle: "Soft Daylight",
    description: "햇살과 숨 고르기에 어울리는 맑은 OST",
    sceneInterpretation: "감정 파동이 안정적으로 흐르는 장면으로 해석되었습니다.",
    audioUrl: "/audio/calm.mp3",
    tags: ["평온", "밝음", "호흡 정돈", "Mock OST"],
  },
  mysterious: {
    emotion: "mysterious",
    moodLabel: "미스터리",
    ostTitle: "Whisper in the Hall",
    description: "낯선 기류와 속삭임을 살린 신비로운 OST",
    sceneInterpretation: "낯선 단서와 기류가 서서히 드러나는 장면으로 해석되었습니다.",
    audioUrl: "/audio/mysterious.mp3",
    tags: ["미스터리", "신비로움", "긴장 유지", "Mock OST"],
  },
};

export function getAudioPresetByEmotion(emotion: EmotionType): OstPreset {
  return PRESETS[emotion] ?? PRESETS.calm;
}

