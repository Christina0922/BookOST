import {
  AMBIENCE_KEYWORDS,
  EMOTION_BOOST_KEYWORDS,
  EMOTION_DEFAULTS,
  EMOTION_KEYWORDS,
  ENVIRONMENT_RULES,
  SCENE_TYPE_RULES,
  TIME_FEEL_RULES,
  TONE_RULES,
} from "@/lib/musicRules";
import type {
  EmotionType,
  EnvironmentKind,
  SceneAnalysisResult,
  SceneType,
  TimeFeel,
  ToneType,
} from "@/types/music";

function clamp(min: number, value: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

/** Stable 32-bit digest so *different* prose gets *different* base weights (no flat 0.24…0.27). */
function fnv1a32(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function sharpenWeights(weights: Record<EmotionType, number>, power: number): Record<EmotionType, number> {
  const keys = Object.keys(weights) as EmotionType[];
  const raw: Record<EmotionType, number> = {
    tense: 0,
    sad: 0,
    calm: 0,
    mysterious: 0,
  };
  let sum = 0;
  for (const k of keys) {
    const v = Math.max(0.01, weights[k]) ** power;
    raw[k] = v;
    sum += v;
  }
  const out: Record<EmotionType, number> = { ...raw };
  for (const k of keys) {
    out[k] = Number((out[k] / sum).toFixed(2));
  }
  const drift = 1 - (out.tense + out.sad + out.calm + out.mysterious);
  if (Math.abs(drift) > 0.001) {
    const top = (Object.keys(out) as EmotionType[]).sort((a, b) => out[b] - out[a])[0] ?? "calm";
    out[top] = Number((out[top] + drift).toFixed(2));
  }
  return out;
}

function detectEmotionWeights(text: string): {
  dominantEmotion: EmotionType;
  weights: Record<EmotionType, number>;
  keywords: string[];
} {
  const normalized = normalize(text);
  const h = fnv1a32(normalized);
  const order: EmotionType[] = ["tense", "sad", "calm", "mysterious"];
  const baseScores: Record<EmotionType, number> = {
    tense: 0,
    sad: 0,
    calm: 0,
    mysterious: 0,
  };
  for (let i = 0; i < 4; i += 1) {
    const slot = (h >>> (i * 7)) & 0x7f; // 0..127
    baseScores[order[i]] = 0.1 + (slot / 127) * 0.45;
  }
  const keywordBag = new Set<string>();

  for (const emotion of order) {
    for (const keyword of EMOTION_KEYWORDS[emotion]) {
      if (normalized.includes(keyword)) {
        baseScores[emotion] += 0.16;
        keywordBag.add(keyword);
      }
    }
  }

  for (const rule of EMOTION_BOOST_KEYWORDS) {
    if (rule.words.some((word) => normalized.includes(word))) {
      baseScores[rule.emotion] += rule.boost;
      rule.words.forEach((word) => {
        if (normalized.includes(word)) keywordBag.add(word);
      });
    }
  }

  const total = Object.values(baseScores).reduce((acc, value) => acc + value, 0);
  const prelim: Record<EmotionType, number> = {
    tense: baseScores.tense / total,
    sad: baseScores.sad / total,
    calm: baseScores.calm / total,
    mysterious: baseScores.mysterious / total,
  };
  const weights = sharpenWeights(prelim, 1.28);

  const dominantEmotion =
    (Object.keys(weights) as EmotionType[]).sort((a, b) => weights[b] - weights[a])[0] ?? "calm";
  return {
    dominantEmotion,
    weights,
    keywords: Array.from(keywordBag),
  };
}

function detectAmbience(text: string): string[] {
  const normalized = normalize(text);
  const matched = new Set<string>();
  for (const rule of AMBIENCE_KEYWORDS) {
    if (rule.words.some((word) => normalized.includes(word))) {
      rule.ambience.forEach((item) => matched.add(item));
    }
  }
  return Array.from(matched);
}

function detectSceneType(text: string): SceneType {
  const normalized = normalize(text);
  for (const rule of SCENE_TYPE_RULES) {
    if (rule.words.some((word) => normalized.includes(word))) {
      return rule.scene_type;
    }
  }
  return "reflection";
}

function detectTone(text: string): ToneType {
  const normalized = normalize(text);
  for (const rule of TONE_RULES) {
    if (rule.words.some((word) => normalized.includes(word))) {
      return rule.tone;
    }
  }
  return "neutral";
}

function detectTimeFeel(text: string): TimeFeel {
  const normalized = normalize(text);
  for (const rule of TIME_FEEL_RULES) {
    if (rule.words.some((word) => normalized.includes(word))) {
      return rule.feel;
    }
  }
  return "moderate";
}

function detectEnvironment(text: string): EnvironmentKind {
  const normalized = normalize(text);
  for (const rule of ENVIRONMENT_RULES) {
    if (rule.words.some((word) => normalized.includes(word))) {
      return rule.env;
    }
  }
  return "neutral";
}

function buildInterpretiveExplanation(
  weights: Record<EmotionType, number>,
  sceneType: SceneType,
  tone: ToneType,
  timeFeel: TimeFeel,
  env: EnvironmentKind,
): string {
  const ranked = (Object.entries(weights) as Array<[EmotionType, number]>).sort((a, b) => b[1] - a[1]);
  const [topEmotion, topWeight] = ranked[0] ?? ["calm", 0.3];
  const [secondEmotion, secondWeight] = ranked[1] ?? ["tense", 0.25];
  return `이 문장은 ${topEmotion}(${topWeight.toFixed(2)})를 중심으로 ${secondEmotion}(${secondWeight.toFixed(2)})가 함께 느껴지는 ${sceneType} 장면입니다. 톤 ${tone}, 시간감 ${timeFeel}, 공간감(환경) ${env}로 해석했습니다.`;
}

function hashVariant<T>(text: string, pool: readonly T[]): T {
  const h = fnv1a32(normalize(text));
  return pool[h % pool.length] as T;
}

/** If everything defaults to generic “neutral / reflection”, still split scenes by full text. */
function diversifySceneLabels(
  text: string,
  sceneType: SceneType,
  tone: ToneType,
  timeFeel: TimeFeel,
  environment: EnvironmentKind,
  hadEmotionKeywords: boolean,
): { sceneType: SceneType; tone: ToneType; timeFeel: TimeFeel; environment: EnvironmentKind } {
  const t = normalize(text);
  const reflectionCue = ["회상", "생각", "돌아보", "반성", "추억"].some((w) => t.includes(w));

  let st = sceneType;
  if (st === "reflection" && !reflectionCue) {
    st = hashVariant(text, ["suspense_build", "quiet_moment", "preparation", "reflection"] as const);
  }

  let tn = tone;
  if (tn === "neutral" && !hadEmotionKeywords) {
    tn = hashVariant(text, ["neutral", "dark", "serious", "light"] as const);
  }

  let tf = timeFeel;
  if (tf === "moderate") {
    tf = hashVariant(text, ["moderate", "slow", "floating", "urgent", "driving"] as const);
  }

  let env = environment;
  if (env === "neutral") {
    env = hashVariant(text, ["neutral", "interior", "night", "city", "rain"] as const);
  }

  return { sceneType: st, tone: tn, timeFeel: tf, environment: env };
}

export function analyzeScene(text: string): SceneAnalysisResult {
  const detection = detectEmotionWeights(text);
  const defaults = EMOTION_DEFAULTS[detection.dominantEmotion];
  let sceneType = detectSceneType(text);
  let tone = detectTone(text);
  let timeFeel = detectTimeFeel(text);
  let environment = detectEnvironment(text);

  const diversified = diversifySceneLabels(
    text,
    sceneType,
    tone,
    timeFeel,
    environment,
    detection.keywords.length > 0,
  );
  sceneType = diversified.sceneType;
  tone = diversified.tone;
  timeFeel = diversified.timeFeel;
  environment = diversified.environment;
  const ambience = Array.from(new Set([...detectAmbience(text)]));
  const sortedWeights = Object.entries(detection.weights).sort((a, b) => b[1] - a[1]);
  const topWeight = sortedWeights[0]?.[1] ?? 0.25;
  const secondWeight = sortedWeights[1]?.[1] ?? 0.2;
  const emotionIntensity = Number(
    clamp(0.2, 0.4 + topWeight * 0.5 + secondWeight * 0.2, 0.95).toFixed(2),
  );
  const tensionLevel = Number(
    clamp(
      0.1,
      defaults.tension_level +
        (sceneType === "suspense_build" ? 0.12 : 0) +
        (emotionIntensity - 0.5) * 0.22,
      0.98,
    ).toFixed(2),
  );
  const energyLevel = Number(
    clamp(
      0.1,
      defaults.energy_level +
        (sceneType === "confrontation" ? 0.14 : 0) +
        (emotionIntensity - 0.5) * 0.18,
      0.98,
    ).toFixed(2),
  );
  const valence = Number(
    clamp(
      0.05,
      defaults.valence +
        (tone === "warm" ? 0.08 : 0) +
        (tone === "dark" ? -0.1 : 0) +
        (detection.weights.calm - detection.weights.sad) * 0.16,
      0.95,
    ).toFixed(2),
  );

  return {
    scene_summary: `${sceneType} (${tone}) · ${timeFeel} · ${environment} · ambience: ${
      ambience.length ? ambience.join(", ") : "neutral"
    }`,
    emotion: detection.dominantEmotion,
    emotion_weights: detection.weights,
    emotion_intensity: emotionIntensity,
    intensity: emotionIntensity,
    tension_level: tensionLevel,
    energy_level: energyLevel,
    valence,
    scene_type: sceneType,
    tone,
    time_feel: timeFeel,
    environment,
    ambience,
    keywords: detection.keywords,
    explanation: buildInterpretiveExplanation(detection.weights, sceneType, tone, timeFeel, environment),
    generation_notes:
      "Rule-based scene interpretation: emotion weights, scene_type, tone, time_feel, environment.",
  };
}
