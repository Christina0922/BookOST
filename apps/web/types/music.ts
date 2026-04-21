export type EmotionType = "tense" | "sad" | "calm" | "mysterious";

/** Scene-first BGM preset ids (harmony + texture + roles). */
export type SceneMusicPresetId =
  | "rain_lonely_night"
  | "tense_chase"
  | "calm_memory"
  | "warm_romance"
  | "serious_preparation"
  | "mysterious_scene";

export type SceneType =
  | "confrontation"
  | "preparation"
  | "reflection"
  | "suspense_build"
  | "quiet_moment";
export type ToneType = "serious" | "light" | "dark" | "warm" | "neutral";
export type DensityType = "low" | "medium" | "high";
export type DynamicsType = "soft" | "medium" | "strong";
export type StructureType = "static" | "build_up" | "wave";
export type ModeType = "major" | "minor";
export type RegisterType = "low" | "mid" | "high" | "wide";

/** Pulses per phrase — influences preset mapping & rhythm layer. */
export type TimeFeel = "floating" | "slow" | "moderate" | "driving" | "urgent";

/** Primary acoustic space for ambient layers. */
export type EnvironmentKind =
  | "rain"
  | "night"
  | "city"
  | "forest"
  | "interior"
  | "sea"
  | "neutral";

export type InstrumentType =
  | "piano"
  | "soft_pad"
  | "light_percussion"
  | "low_strings"
  | "pulse_synth"
  | "percussion"
  | "dark_pad"
  | "bell"
  | "ambient_noise"
  | "bass";

export type SceneAnalysisResult = {
  scene_summary: string;
  emotion: EmotionType;
  emotion_weights: Record<EmotionType, number>;
  /** 0–1 blend strength — drives tempo / layer density in music generation. */
  emotion_intensity: number;
  /** Alias for UI / pipeline clarity (same scale as `emotion_intensity`). */
  intensity: number;
  tension_level: number;
  energy_level: number;
  valence: number;
  scene_type: SceneType;
  tone: ToneType;
  time_feel: TimeFeel;
  environment: EnvironmentKind;
  ambience: string[];
  keywords: string[];
  explanation: string;
  generation_notes: string;
};

export type MusicParameterResult = {
  scene_summary: string;
  emotion: EmotionType;
  emotion_weights: Record<EmotionType, number>;
  emotion_intensity: number;
  intensity: number;
  tension_level: number;
  energy_level: number;
  valence: number;
  scene_type: SceneType;
  tone: ToneType;
  time_feel: TimeFeel;
  environment: EnvironmentKind;
  /** Selected scene BGM preset — drives harmony, BPM range, layering. */
  music_scene_preset: SceneMusicPresetId;
  tempo_bpm: number;
  time_signature: "4/4";
  key: string;
  mode: ModeType;
  duration_sec: number;
  loopable: boolean;
  structure: StructureType;
  dynamics: DynamicsType;
  melody_density: DensityType;
  rhythm_density: DensityType;
  register: RegisterType;
  instrumentation: InstrumentType[];
  texture: string;
  ambience: string[];
  harmonic_style: string;
  chord_progression: string[];
  motif_style: string;
  keywords: string[];
  explanation: string;
  generation_notes: string;
};

export type MidiNoteEvent = {
  midi: number;
  start_sec: number;
  duration_sec: number;
  velocity: number;
  instrument: InstrumentType;
};

export type GeneratedMusicOutput = {
  notes: MidiNoteEvent[];
  midi_base64: string;
};
