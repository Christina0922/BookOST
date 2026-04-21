/**
 * Scene-based BGM presets (separated from mapping logic — see `selectSceneMusicPreset.ts`).
 * Web client renders MIDI with oscillators; this catalog defines harmony, texture, and roles.
 */

import { hashString } from "@/lib/hashSeed";
import type {
  DensityType,
  DynamicsType,
  InstrumentType,
  ModeType,
  SceneMusicPresetId,
  StructureType,
} from "@/types/music";

export type OutroStyle =
  | "fade_pad_decay"
  | "soft_resolution"
  | "pulse_drop"
  | "bell_tail"
  | "noise_wash"
  | "bass_sustain";

export type ScenePresetRow = {
  id: SceneMusicPresetId;
  tempoRange: [number, number];
  key: string;
  mode: ModeType;
  /** Several progressions so the same preset still varies across inputs. */
  chordProgressions: string[][];
  mainInstrument: InstrumentType;
  secondaryLayer: InstrumentType;
  rhythmicDensity: DensityType;
  motifPattern: string;
  outroStyle: OutroStyle;
  texture: string;
  harmonic_style: string;
  dynamics: DynamicsType;
  melody_density: DensityType;
  structure: StructureType;
  /** Tritone / cluster allowed (only tense_chase & mysterious_scene should be true). */
  allowsDissonance: boolean;
  /** Wide spacing & fewer melody hits for BGM stability. */
  melodySpacing: "sparse" | "medium" | "dense";
};

export const SCENE_MUSIC_PRESET_CATALOG: Record<SceneMusicPresetId, ScenePresetRow> = {
  rain_lonely_night: {
    id: "rain_lonely_night",
    tempoRange: [48, 64],
    key: "D",
    mode: "minor",
    chordProgressions: [
      ["Dm", "Bb", "Gm", "Am"],
      ["Dm", "Am", "Gm", "Bb"],
      ["Gm", "Eb", "Bb", "Cm"],
    ],
    mainInstrument: "piano",
    secondaryLayer: "soft_pad",
    rhythmicDensity: "low",
    motifPattern: "falling_sparse",
    outroStyle: "fade_pad_decay",
    texture: "wet_sparse",
    harmonic_style: "minor_simple",
    dynamics: "soft",
    melody_density: "low",
    structure: "wave",
    allowsDissonance: false,
    melodySpacing: "sparse",
  },
  tense_chase: {
    id: "tense_chase",
    tempoRange: [118, 148],
    key: "E",
    mode: "minor",
    chordProgressions: [
      ["Em", "C", "G", "D"],
      ["Fm", "Db", "Ab", "Eb"],
      ["Em", "Bm", "C", "D"],
    ],
    mainInstrument: "pulse_synth",
    secondaryLayer: "low_strings",
    rhythmicDensity: "high",
    motifPattern: "ostinato_short",
    outroStyle: "pulse_drop",
    texture: "drive_grit",
    harmonic_style: "unstable_motion",
    dynamics: "strong",
    melody_density: "high",
    structure: "build_up",
    allowsDissonance: true,
    melodySpacing: "dense",
  },
  calm_memory: {
    id: "calm_memory",
    tempoRange: [58, 76],
    key: "G",
    mode: "major",
    chordProgressions: [
      ["G", "D", "Em", "C"],
      ["C", "G", "Am", "F"],
      ["Am", "F", "C", "G"],
    ],
    mainInstrument: "piano",
    secondaryLayer: "soft_pad",
    rhythmicDensity: "low",
    motifPattern: "broken_chord_wide",
    outroStyle: "soft_resolution",
    texture: "warm_recollection",
    harmonic_style: "diatonic_open",
    dynamics: "soft",
    melody_density: "medium",
    structure: "static",
    allowsDissonance: false,
    melodySpacing: "sparse",
  },
  warm_romance: {
    id: "warm_romance",
    tempoRange: [62, 84],
    key: "Eb",
    mode: "major",
    chordProgressions: [
      ["Eb", "Cm", "Ab", "Bb"],
      ["Gm", "Eb", "Bb", "F"],
      ["Db", "Ab", "Eb", "Bb"],
    ],
    mainInstrument: "piano",
    secondaryLayer: "bell",
    rhythmicDensity: "low",
    motifPattern: "lyrical_arc",
    outroStyle: "bell_tail",
    texture: "intimate_glow",
    harmonic_style: "warm_triads",
    dynamics: "medium",
    melody_density: "medium",
    structure: "wave",
    allowsDissonance: false,
    melodySpacing: "medium",
  },
  serious_preparation: {
    id: "serious_preparation",
    tempoRange: [92, 120],
    key: "C",
    mode: "minor",
    chordProgressions: [
      ["Cm", "Ab", "Eb", "Bb"],
      ["Am", "F", "Dm", "Em"],
      ["Cm", "Gm", "Bb", "F"],
    ],
    mainInstrument: "piano",
    secondaryLayer: "light_percussion",
    rhythmicDensity: "medium",
    motifPattern: "steady_step",
    outroStyle: "bass_sustain",
    texture: "mission_build",
    harmonic_style: "determined_minor",
    dynamics: "medium",
    melody_density: "medium",
    structure: "build_up",
    allowsDissonance: false,
    melodySpacing: "medium",
  },
  mysterious_scene: {
    id: "mysterious_scene",
    tempoRange: [56, 78],
    key: "F#",
    mode: "minor",
    chordProgressions: [
      ["F#m", "Gmaj7", "Em", "Dsus2"],
      ["Bm", "D", "A", "Em"],
      ["Am", "Fmaj7", "Dm7", "E7"],
    ],
    mainInstrument: "bell",
    secondaryLayer: "dark_pad",
    rhythmicDensity: "medium",
    motifPattern: "wide_uncertain",
    outroStyle: "noise_wash",
    texture: "shadow_fog",
    harmonic_style: "sus_dim",
    dynamics: "medium",
    melody_density: "low",
    structure: "wave",
    allowsDissonance: true,
    melodySpacing: "sparse",
  },
};

/** Three melodic skeletons per preset — random pick is driven by seeded hash (not Math.random). */
export const SCENE_PRESET_VARIATION_MOTIFS: Record<
  SceneMusicPresetId,
  [number[], number[], number[]]
> = {
  rain_lonely_night: [
    [0, -2, -3, -5],
    [-1, -2, -4, -5],
    [2, 0, -2, -4],
  ],
  tense_chase: [
    [0, 1, 3, 6],
    [0, 2, 5, 7],
    [0, 4, 6, 11],
  ],
  calm_memory: [
    [0, 4, 7, 12],
    [12, 7, 4, 0],
    [0, 2, 4, 9],
  ],
  warm_romance: [
    [0, 3, 7, 10],
    [7, 5, 3, 0],
    [0, 5, 9, 12],
  ],
  serious_preparation: [
    [0, 3, 5, 7],
    [0, 2, 4, 7],
    [4, 7, 5, 4],
  ],
  mysterious_scene: [
    [0, 6, 11, 13],
    [0, 4, 10, 15],
    [11, 6, 3, 0],
  ],
};

export function pickChordVariantIndex(
  sceneSummary: string,
  keywords: string[],
  presetId: SceneMusicPresetId,
): number {
  const salt = `${sceneSummary}|${keywords.join(",")}|${presetId}`;
  const pool = SCENE_MUSIC_PRESET_CATALOG[presetId].chordProgressions;
  return hashString(salt) % pool.length;
}
