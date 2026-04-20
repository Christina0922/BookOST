import type { EmotionAnalysisResult, EmotionType } from "@/lib/analyzeEmotion";

export type TempoType = "slow" | "medium" | "fast";
export type EnergyType = "low" | "medium" | "high";
export type ToneType = "bright" | "dark" | "neutral";
export type SettingType = "night_city" | "rainy_street" | "indoor" | "nature" | "unknown";
export type StructureType = "stable" | "build_up" | "drop_release";
export type LayerType = "base" | "rhythm" | "melodic" | "effect";

export type SceneAnalysis = {
  emotion: EmotionType;
  intensity: number;
  tempo: TempoType;
  energy: EnergyType;
  tone: ToneType;
  setting: SettingType;
  instruments: string[];
  structure: StructureType;
  keywords: string[];
};

export type LayerPlan = {
  base: string;
  rhythm?: string;
  melodic?: string;
  effect?: string;
};

const SETTING_RULES: Array<{ setting: SettingType; keywords: string[] }> = [
  { setting: "night_city", keywords: ["네온", "밤", "도시", "골목", "불빛"] },
  { setting: "rainy_street", keywords: ["비", "빗", "우산", "젖", "창문"] },
  { setting: "nature", keywords: ["햇살", "바람", "숲", "새", "들판"] },
  { setting: "indoor", keywords: ["방", "복도", "서재", "창가", "문"] },
];

const BASE_BY_EMOTION: Record<EmotionType, Omit<SceneAnalysis, "setting" | "keywords">> = {
  tense: {
    emotion: "tense",
    intensity: 0.82,
    tempo: "fast",
    energy: "high",
    tone: "dark",
    instruments: ["low_strings", "drone", "pulse_percussion"],
    structure: "build_up",
  },
  sad: {
    emotion: "sad",
    intensity: 0.48,
    tempo: "slow",
    energy: "low",
    tone: "dark",
    instruments: ["felt_piano", "soft_pad", "warm_strings"],
    structure: "stable",
  },
  calm: {
    emotion: "calm",
    intensity: 0.3,
    tempo: "medium",
    energy: "low",
    tone: "bright",
    instruments: ["acoustic_guitar", "air_pad", "light_keys"],
    structure: "stable",
  },
  mysterious: {
    emotion: "mysterious",
    intensity: 0.66,
    tempo: "medium",
    energy: "medium",
    tone: "dark",
    instruments: ["reverse_pad", "texture_fx", "soft_bell"],
    structure: "build_up",
  },
};

const LAYER_POOL: Record<LayerType, Record<EmotionType, string[]>> = {
  base: {
    tense: ["/audio/base/tense_dark_1.mp3", "/audio/base/tense_dark_2.mp3"],
    sad: ["/audio/base/sad_soft_1.mp3", "/audio/base/sad_soft_2.mp3"],
    calm: ["/audio/base/calm_air_1.mp3", "/audio/base/calm_air_2.mp3"],
    mysterious: ["/audio/base/mystic_drone_1.mp3", "/audio/base/mystic_drone_2.mp3"],
  },
  rhythm: {
    tense: ["/audio/rhythm/tense_pulse_1.mp3", "/audio/rhythm/tense_pulse_2.mp3"],
    sad: ["/audio/rhythm/sad_brush_1.mp3", "/audio/rhythm/sad_brush_2.mp3"],
    calm: ["/audio/rhythm/calm_light_1.mp3", "/audio/rhythm/calm_light_2.mp3"],
    mysterious: ["/audio/rhythm/mystic_tick_1.mp3", "/audio/rhythm/mystic_tick_2.mp3"],
  },
  melodic: {
    tense: ["/audio/melodic/tense_motif_1.mp3", "/audio/melodic/tense_motif_2.mp3"],
    sad: ["/audio/melodic/sad_theme_1.mp3", "/audio/melodic/sad_theme_2.mp3"],
    calm: ["/audio/melodic/calm_theme_1.mp3", "/audio/melodic/calm_theme_2.mp3"],
    mysterious: ["/audio/melodic/mystic_theme_1.mp3", "/audio/melodic/mystic_theme_2.mp3"],
  },
  effect: {
    tense: ["/audio/effect/tense_hit_1.mp3", "/audio/effect/tense_hit_2.mp3"],
    sad: ["/audio/effect/sad_whoosh_1.mp3", "/audio/effect/sad_whoosh_2.mp3"],
    calm: ["/audio/effect/calm_glint_1.mp3", "/audio/effect/calm_glint_2.mp3"],
    mysterious: ["/audio/effect/mystic_reverse_1.mp3", "/audio/effect/mystic_reverse_2.mp3"],
  },
};

function detectSetting(normalizedText: string): { setting: SettingType; matched: string[] } {
  for (const rule of SETTING_RULES) {
    const matched = rule.keywords.filter((keyword) => normalizedText.includes(keyword));
    if (matched.length > 0) {
      return { setting: rule.setting, matched };
    }
  }
  return { setting: "unknown", matched: [] };
}

function pickOneRandom<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

export function buildSceneAnalysis(text: string, emotion: EmotionAnalysisResult): SceneAnalysis {
  const normalized = text.trim().toLowerCase();
  const base = BASE_BY_EMOTION[emotion.emotion];
  const settingDetected = detectSetting(normalized);
  const intensity = Number(Math.min(1, Math.max(base.intensity, emotion.score)).toFixed(2));

  return {
    ...base,
    intensity,
    setting: settingDetected.setting,
    keywords: [...new Set([...emotion.keywords, ...settingDetected.matched])],
  };
}

export function buildLayerPlan(scene: SceneAnalysis): LayerPlan {
  // Same text can still vary slightly by random layer selection.
  const base = pickOneRandom(LAYER_POOL.base[scene.emotion]);
  const rhythm = scene.energy === "low" ? undefined : pickOneRandom(LAYER_POOL.rhythm[scene.emotion]);
  const melodic = pickOneRandom(LAYER_POOL.melodic[scene.emotion]);
  const effect = scene.structure === "build_up" || scene.intensity > 0.7 ? pickOneRandom(LAYER_POOL.effect[scene.emotion]) : undefined;

  return { base, rhythm, melodic, effect };
}

