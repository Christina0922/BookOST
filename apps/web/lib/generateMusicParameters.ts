import { EMOTION_DEFAULTS, STRUCTURE_KEYWORDS } from "@/lib/musicRules";
import {
  pickChordVariantIndex,
  type ScenePresetRow,
  SCENE_MUSIC_PRESET_CATALOG,
} from "@/lib/sceneMusicPresetCatalog";
import { selectSceneMusicPreset } from "@/lib/selectSceneMusicPreset";
import type {
  DensityType,
  MusicParameterResult,
  SceneAnalysisResult,
  StructureType,
} from "@/types/music";

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

/** Intensity pushes tempo & density; sparse BGM presets get smaller note gains. */
function refineDensities(
  row: ScenePresetRow,
  intensity: number,
): { melody: DensityType; rhythm: DensityType } {
  const i = intensity;
  let melody: DensityType = row.melody_density;
  let rhythm: DensityType = row.rhythmicDensity;

  if (row.melodySpacing === "sparse") {
    if (i > 0.72) melody = melody === "low" ? "medium" : melody;
    if (i < 0.35) melody = "low";
  } else if (row.melodySpacing === "dense") {
    melody = i > 0.55 ? "high" : melody === "medium" ? "medium" : "medium";
    rhythm = i > 0.55 ? "high" : rhythm;
  } else {
    if (i > 0.68) melody = melody === "medium" ? "high" : melody;
    if (i < 0.38) melody = melody === "high" ? "medium" : "low";
  }

  return { melody, rhythm };
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
  const dominantW = scene.emotion_weights[dominant] ?? 0.4;

  const preset = selectSceneMusicPreset(scene, text);
  const row = SCENE_MUSIC_PRESET_CATALOG[preset];
  const int = scene.intensity;

  const tempoMid = (row.tempoRange[0] + row.tempoRange[1]) / 2;
  const tempoSpan = (row.tempoRange[1] - row.tempoRange[0]) / 2;
  const tempo = clamp(
    row.tempoRange[0],
    Math.round(
      tempoMid +
        (scene.energy_level - 0.5) * tempoSpan * 1.15 +
        (int - 0.5) * tempoSpan * 0.95,
    ),
    row.tempoRange[1],
  );

  const progIdx = pickChordVariantIndex(scene.scene_summary, scene.keywords, preset);
  const chord_progression = row.chordProgressions[progIdx] ?? row.chordProgressions[0]!;

  const structure = pickStructure(text, row.structure);
  const ambience = Array.from(new Set([...scene.ambience]));

  const { melody: melody_density, rhythm: rhythm_density } = refineDensities(row, int);

  const motif_style =
    dominantW < 0.55 ? `${row.motifPattern}+${EMOTION_DEFAULTS[secondary].motif_style}` : row.motifPattern;

  const texture =
    dominantW < 0.55 ? `${row.texture}_blend` : row.texture;

  const instrumentation = Array.from(
    new Set<MusicParameterResult["instrumentation"][number]>([
      row.mainInstrument,
      row.secondaryLayer,
      "bass",
      ...(preset === "rain_lonely_night" || scene.environment === "rain" ? (["ambient_noise"] as const) : []),
      ...(preset === "tense_chase" ? (["percussion"] as const) : []),
    ]),
  );

  return {
    scene_summary: scene.scene_summary,
    emotion: dominant,
    emotion_weights: scene.emotion_weights,
    emotion_intensity: scene.emotion_intensity,
    intensity: scene.intensity,
    tension_level: scene.tension_level,
    energy_level: scene.energy_level,
    valence: scene.valence,
    scene_type: scene.scene_type,
    tone: scene.tone,
    time_feel: scene.time_feel,
    environment: scene.environment,
    music_scene_preset: preset,
    tempo_bpm: tempo,
    time_signature: "4/4",
    key: row.key,
    mode: row.mode,
    duration_sec: 30,
    loopable: true,
    structure,
    dynamics: row.dynamics,
    melody_density,
    rhythm_density,
    register: pickRegister(text),
    instrumentation,
    texture,
    ambience,
    harmonic_style: row.harmonic_style,
    chord_progression,
    motif_style,
    keywords: scene.keywords,
    explanation: scene.explanation,
    generation_notes: `BGM preset=${preset}, chordVariant=${progIdx}, tempo=${tempo}, intensity=${int.toFixed(
      2,
    )}, env=${scene.environment}, feel=${scene.time_feel}`,
  };
}
