import { EMOTION_DEFAULTS, STRUCTURE_KEYWORDS } from "@/lib/musicRules";
import type { MusicParameterResult, SceneAnalysisResult, StructureType } from "@/types/music";

function clamp(min: number, value: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function pickStructure(text: string, fallback: StructureType): StructureType {
  const normalized = text.toLowerCase();
  for (const rule of STRUCTURE_KEYWORDS) {
    if (rule.words.some((word) => normalized.includes(word))) {
      return rule.structure;
    }
  }
  return fallback;
}

function pickRegister(text: string): MusicParameterResult["register"] {
  const normalized = text.toLowerCase();
  if (["속삭", "그림자", "웅성", "어둠"].some((word) => normalized.includes(word))) return "low";
  if (["폭발", "비명", "총", "치솟"].some((word) => normalized.includes(word))) return "wide";
  if (["햇살", "바람", "맑"].some((word) => normalized.includes(word))) return "high";
  return "mid";
}

export function generateMusicParameters(
  scene: SceneAnalysisResult,
  text: string,
): MusicParameterResult {
  const dominant = scene.emotion;
  const secondary = (Object.entries(scene.emotion_weights)
    .sort((a, b) => b[1] - a[1])
    .map(([emotion]) => emotion)
    .find((emotion) => emotion !== dominant) ?? dominant) as SceneAnalysisResult["emotion"];
  const defaults = EMOTION_DEFAULTS[dominant];
  const secondaryDefaults = EMOTION_DEFAULTS[secondary];
  const jitter = Math.round((Math.random() - 0.5) * 8);
  const dominantW = scene.emotion_weights[dominant] ?? 0.4;
  const secondaryW = scene.emotion_weights[secondary] ?? 0.2;
  const blendedTempoBase = Math.round(defaults.tempo_bpm * dominantW + secondaryDefaults.tempo_bpm * secondaryW + defaults.tempo_bpm * (1 - dominantW - secondaryW));
  const tempo = clamp(56, blendedTempoBase + Math.round(scene.energy_level * 16) + jitter, 160);
  const duration = clamp(20, 30 + Math.round((scene.emotion_intensity - 0.5) * 12), 40);
  const structure = pickStructure(text, defaults.structure);
  const ambience = Array.from(new Set([...scene.ambience]));
  const instrumentation = Array.from(
    new Set([...defaults.instrumentation, ...secondaryDefaults.instrumentation]),
  ).slice(0, 4) as MusicParameterResult["instrumentation"];
  const chordProgression = dominantW < 0.55
    ? [
        defaults.chord_progression[0],
        secondaryDefaults.chord_progression[1] ?? secondaryDefaults.chord_progression[0],
        defaults.chord_progression[2] ?? defaults.chord_progression[0],
        secondaryDefaults.chord_progression[3] ?? secondaryDefaults.chord_progression[0],
      ]
    : defaults.chord_progression;

  return {
    scene_summary: scene.scene_summary,
    emotion: dominant,
    emotion_weights: scene.emotion_weights,
    emotion_intensity: scene.emotion_intensity,
    tension_level: scene.tension_level,
    energy_level: scene.energy_level,
    valence: scene.valence,
    scene_type: scene.scene_type,
    tone: scene.tone,
    tempo_bpm: tempo,
    time_signature: "4/4",
    key: defaults.key,
    mode: defaults.mode,
    duration_sec: duration,
    loopable: true,
    structure,
    dynamics: defaults.dynamics,
    melody_density: defaults.melody_density,
    rhythm_density: defaults.rhythm_density,
    register: pickRegister(text),
    instrumentation,
    texture: dominantW < 0.55 ? `${defaults.texture}_blended` : defaults.texture,
    ambience,
    harmonic_style: defaults.harmonic_style,
    chord_progression: chordProgression,
    motif_style: dominantW < 0.55 ? `${defaults.motif_style}+${secondaryDefaults.motif_style}` : defaults.motif_style,
    keywords: scene.keywords,
    explanation: scene.explanation,
    generation_notes:
      `Weighted blend from dominant(${dominant}:${dominantW}) and secondary(${secondary}:${secondaryW}) emotions.`,
  };
}

