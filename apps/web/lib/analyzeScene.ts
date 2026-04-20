import {
  AMBIENCE_KEYWORDS,
  EMOTION_BOOST_KEYWORDS,
  EMOTION_DEFAULTS,
  EMOTION_KEYWORDS,
  SCENE_TYPE_RULES,
  TONE_RULES,
} from "@/lib/musicRules";
import type { EmotionType, SceneAnalysisResult, SceneType, ToneType } from "@/types/music";

function clamp(min: number, value: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

function detectEmotionWeights(text: string): {
  dominantEmotion: EmotionType;
  weights: Record<EmotionType, number>;
  keywords: string[];
} {
  const normalized = normalize(text);
  const baseScores: Record<EmotionType, number> = {
    tense: 0.22,
    sad: 0.2,
    calm: 0.22,
    mysterious: 0.18,
  };
  const keywordBag = new Set<string>();

  for (const emotion of Object.keys(EMOTION_KEYWORDS) as EmotionType[]) {
    for (const keyword of EMOTION_KEYWORDS[emotion]) {
      if (normalized.includes(keyword)) {
        baseScores[emotion] += 0.14;
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
  const weights: Record<EmotionType, number> = {
    tense: Number((baseScores.tense / total).toFixed(2)),
    sad: Number((baseScores.sad / total).toFixed(2)),
    calm: Number((baseScores.calm / total).toFixed(2)),
    mysterious: Number((baseScores.mysterious / total).toFixed(2)),
  };
  // fix rounding drift
  const drift = Number((1 - (weights.tense + weights.sad + weights.calm + weights.mysterious)).toFixed(2));
  if (Math.abs(drift) > 0) {
    weights.calm = Number((weights.calm + drift).toFixed(2));
  }

  const dominantEmotion = (Object.keys(weights) as EmotionType[]).sort((a, b) => weights[b] - weights[a])[0] ?? "calm";
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

function buildInterpretiveExplanation(
  weights: Record<EmotionType, number>,
  sceneType: SceneType,
  tone: ToneType,
): string {
  const ranked = (Object.entries(weights) as Array<[EmotionType, number]>).sort((a, b) => b[1] - a[1]);
  const [topEmotion, topWeight] = ranked[0] ?? ["calm", 0.3];
  const [secondEmotion, secondWeight] = ranked[1] ?? ["tense", 0.25];
  return `이 문장은 ${topEmotion}(${topWeight.toFixed(2)})를 중심으로 ${secondEmotion}(${secondWeight.toFixed(2)})가 함께 느껴지는 ${sceneType} 성격의 장면으로 해석되었습니다. 톤은 ${tone} 쪽으로 반영했습니다.`;
}

export function analyzeScene(text: string): SceneAnalysisResult {
  const detection = detectEmotionWeights(text);
  const defaults = EMOTION_DEFAULTS[detection.dominantEmotion];
  const sceneType = detectSceneType(text);
  const tone = detectTone(text);
  const ambience = Array.from(new Set([...detectAmbience(text)]));
  const sortedWeights = Object.entries(detection.weights).sort((a, b) => b[1] - a[1]);
  const topWeight = sortedWeights[0]?.[1] ?? 0.25;
  const secondWeight = sortedWeights[1]?.[1] ?? 0.2;
  const emotionIntensity = Number(
    clamp(0.2, 0.4 + topWeight * 0.5 + secondWeight * 0.2, 0.95).toFixed(2),
  );
  const tensionLevel = Number(
    clamp(0.1, defaults.tension_level + (sceneType === "suspense_build" ? 0.12 : 0) + (emotionIntensity - 0.5) * 0.22, 0.98).toFixed(2),
  );
  const energyLevel = Number(
    clamp(0.1, defaults.energy_level + (sceneType === "confrontation" ? 0.14 : 0) + (emotionIntensity - 0.5) * 0.18, 0.98).toFixed(2),
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
    scene_summary: `${sceneType} scene (${tone}) with ${ambience.length ? ambience.join(", ") : "neutral ambience"}`,
    emotion: detection.dominantEmotion,
    emotion_weights: detection.weights,
    emotion_intensity: emotionIntensity,
    tension_level: tensionLevel,
    energy_level: energyLevel,
    valence,
    scene_type: sceneType,
    tone,
    ambience,
    keywords: detection.keywords,
    explanation: buildInterpretiveExplanation(detection.weights, sceneType, tone),
    generation_notes: "Rule-based weighted emotion analysis with scene_type and tone classification.",
  };
}

