/**
 * Explicit scene → BGM preset mapping using analysis fields + text (KR/EN).
 * Priority: narrative signals (chase, rain+night, memory) override raw emotion defaults.
 */

import type { SceneAnalysisResult, SceneMusicPresetId } from "@/types/music";

function norm(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Choose one of six scene presets from `emotion`, `intensity`, `scene_type`,
 * `time_feel`, `environment`, tone, weights, and surface text.
 */
export function selectSceneMusicPreset(scene: SceneAnalysisResult, text: string): SceneMusicPresetId {
  const raw = text.trim();
  const n = norm(text);
  const {
    emotion,
    emotion_weights,
    scene_type,
    tone,
    environment,
    time_feel,
  } = scene;

  // --- Highest-priority narrative hooks (explicit) ---
  if (
    /\b(chase|pursuit|flee|sprint)\b/i.test(raw) ||
    /(추격|도망|쫓|폭발|총성|전쟁)/.test(raw)
  ) {
    return "tense_chase";
  }

  if (
    scene_type === "confrontation" ||
    time_feel === "urgent" ||
    (emotion === "tense" && emotion_weights.tense > 0.38)
  ) {
    return "tense_chase";
  }

  // Rain / night loneliness — environment + emotion, or strong lexical combo
  const hasRain =
    environment === "rain" || /\b(rain|rainy)\b/i.test(raw) || /비/.test(raw);
  const hasNight = environment === "night" || /\bnight\b/i.test(raw) || /밤/.test(raw);
  if ((hasRain || hasNight) && emotion === "sad") {
    return "rain_lonely_night";
  }
  if (hasRain && hasNight) {
    return "rain_lonely_night";
  }

  if (
    /\b(lonely|alone)\b.*\b(rain|night)\b/i.test(n) ||
    /(외로|혼자).*(비|밤)/.test(raw)
  ) {
    return "rain_lonely_night";
  }

  // Memory / reflection — scene-led
  if (
    scene_type === "reflection" ||
    /\b(memory|remember|childhood|past)\b/i.test(raw) ||
    /(회상|생각|돌아보|옛날|추억)/.test(raw)
  ) {
    return "calm_memory";
  }

  // Warm romance — lexical + tone
  if (
    /\b(love|kiss|embrace|moonlight)\b/i.test(raw) ||
    /(사랑|연인|포옹|달빛|고백|따뜻한\s*손)/.test(raw) ||
    (tone === "warm" && emotion_weights.calm >= emotion_weights.tense && emotion !== "tense")
  ) {
    return "warm_romance";
  }

  // Serious preparation / build (hopeful mission tone per product brief)
  if (
    scene_type === "preparation" ||
    tone === "serious" ||
    /\b(plan|briefing|before\s+the)\b/i.test(raw) ||
    /(준비|작전|계획|점검|회의)/.test(raw)
  ) {
    return "serious_preparation";
  }

  // Mystery
  if (
    emotion === "mysterious" ||
    emotion_weights.mysterious > 0.34 ||
    /\b(strange|shadow|whisper)\b/i.test(raw) ||
    /(그림자|속삭|기묘|미스터리)/.test(raw)
  ) {
    return "mysterious_scene";
  }

  // Quiet outdoor / calm default
  if (scene_type === "quiet_moment" || time_feel === "slow" || time_feel === "floating") {
    return "calm_memory";
  }

  // Emotion fallbacks (mysterious is handled by the block above; if we are here, it is not dominant)
  switch (emotion) {
    case "tense":
      return "tense_chase";
    case "sad":
      return "rain_lonely_night";
    case "calm":
    default:
      return "calm_memory";
  }
}
