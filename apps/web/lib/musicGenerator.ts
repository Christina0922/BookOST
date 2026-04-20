import type { SceneAnalysis } from "@/lib/sceneMusic";

export type MelodyDensity = "low" | "medium" | "high";
export type Dynamics = "soft" | "medium" | "strong";
export type InstrumentType = "piano" | "pad" | "pluck" | "bass" | "perc";
export type StructureType = "static" | "build_up" | "wave";
export type EmotionType = SceneAnalysis["emotion"];

export type MusicParameterSchema = {
  scene_summary: string;
  emotion: EmotionType;
  emotion_intensity: number;
  tension_level: number;
  energy_level: number;
  valence: number;
  tempo_bpm: number;
  time_signature: "4/4";
  key: string;
  mode: "major" | "minor";
  duration_sec: number;
  loopable: boolean;
  structure: StructureType;
  dynamics: Dynamics;
  melody_density: MelodyDensity;
  rhythm_density: MelodyDensity;
  register: "low" | "mid" | "high" | "wide";
  instrumentation: InstrumentType[];
  texture: string;
  ambience: string[];
  harmonic_style: string;
  chord_progression: string[];
  motif_style: string;
  keywords: string[];
  generation_notes: string;
};

export type NoteEvent = {
  midi: number;
  start_sec: number;
  duration_sec: number;
  velocity: number;
  instrument: InstrumentType;
};

export type GeneratedMusic = {
  parameters: MusicParameterSchema;
  notes: NoteEvent[];
  midi_base64: string;
};

const BASE_RULES: Record<
  EmotionType,
  {
    key: string;
    mode: "major" | "minor";
    chord_progression: string[];
    instrumentation: InstrumentType[];
    ambience: string[];
    texture: string;
    harmonic_style: string;
    motif_style: string;
    structure: StructureType;
    tempo_base: number;
    valence_base: number;
  }
> = {
  tense: {
    key: "E",
    mode: "minor",
    chord_progression: ["Em", "C", "G", "D"],
    instrumentation: ["bass", "perc", "pad", "pluck"],
    ambience: ["city_noise", "low_rumble", "sub_pulse"],
    texture: "layered_pulse",
    harmonic_style: "driving_minor_loop",
    motif_style: "rising_fragment",
    structure: "build_up",
    tempo_base: 118,
    valence_base: 0.22,
  },
  sad: {
    key: "D",
    mode: "minor",
    chord_progression: ["Dm", "Bb", "Gm", "A"],
    instrumentation: ["piano", "pad", "bass"],
    ambience: ["rain", "room_tone", "soft_noise"],
    texture: "thin_warm_layer",
    harmonic_style: "slow_minor_resolve",
    motif_style: "descending_phrase",
    structure: "wave",
    tempo_base: 66,
    valence_base: 0.18,
  },
  calm: {
    key: "G",
    mode: "major",
    chord_progression: ["G", "D", "Em", "C"],
    instrumentation: ["pad", "piano", "pluck"],
    ambience: ["wind", "daylight_air", "soft_room"],
    texture: "airy_open",
    harmonic_style: "stable_diatonic",
    motif_style: "gentle_repetition",
    structure: "static",
    tempo_base: 84,
    valence_base: 0.68,
  },
  mysterious: {
    key: "F#",
    mode: "minor",
    chord_progression: ["F#m", "Gmaj7", "Em", "Dsus2"],
    instrumentation: ["pad", "bass", "perc"],
    ambience: ["whisper_noise", "dark_hum", "distance_reverb"],
    texture: "dark_sparse",
    harmonic_style: "suspended_unresolved",
    motif_style: "broken_interval",
    structure: "wave",
    tempo_base: 76,
    valence_base: 0.32,
  },
};

function clamp(min: number, value: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hashText(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) || 1;
}

function createSeededRandom(seedValue: number): () => number {
  let seed = seedValue >>> 0;
  return () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function keyRootToMidi(key: string): number {
  const root = key.split(" ")[0];
  const table: Record<string, number> = {
    C: 60,
    "C#": 61,
    Db: 61,
    D: 62,
    "D#": 63,
    Eb: 63,
    E: 64,
    F: 65,
    "F#": 66,
    Gb: 66,
    G: 67,
    "G#": 68,
    Ab: 68,
    A: 69,
    "A#": 70,
    Bb: 70,
    B: 71,
  };
  return table[root] ?? 60;
}

function buildChordNotes(chord: string, rootMidi: number): number[] {
  const normalized = chord.toLowerCase();
  if (normalized.includes("sus2")) return [rootMidi, rootMidi + 2, rootMidi + 7];
  if (normalized.includes("maj7")) return [rootMidi, rootMidi + 4, rootMidi + 7, rootMidi + 11];
  if (normalized.includes("m")) return [rootMidi, rootMidi + 3, rootMidi + 7];
  return [rootMidi, rootMidi + 4, rootMidi + 7];
}

function chooseDynamics(intensity: number): Dynamics {
  if (intensity < 0.4) return "soft";
  if (intensity < 0.75) return "medium";
  return "strong";
}

function chooseDensity(intensity: number): MelodyDensity {
  if (intensity < 0.42) return "low";
  if (intensity < 0.73) return "medium";
  return "high";
}

function pickByKeywords(text: string, candidates: Array<{ words: string[]; value: string }>, fallback: string): string {
  const normalized = text.toLowerCase();
  for (const item of candidates) {
    if (item.words.some((word) => normalized.includes(word))) {
      return item.value;
    }
  }
  return fallback;
}

export function generateMusicParameters(scene: SceneAnalysis, text: string): MusicParameterSchema {
  const base = BASE_RULES[scene.emotion];
  const jitter = Math.round((Math.random() - 0.5) * 8);
  const tensionLevel = Number((scene.emotion === "tense" ? 0.65 + scene.intensity * 0.3 : scene.intensity * 0.85).toFixed(2));
  const energyLevel = Number((scene.energy === "high" ? 0.85 : scene.energy === "medium" ? 0.58 : 0.34).toFixed(2));
  const valence = Number(clamp(0.05, base.valence_base + (scene.tone === "bright" ? 0.12 : -0.08), 0.92).toFixed(2));
  const tempo = clamp(56, Math.round(base.tempo_base + scene.intensity * 16 + jitter), 160);
  const duration = clamp(20, 30 + Math.round((hashText(text) % 9) - 4), 40);
  const melodyDensity = chooseDensity(scene.intensity);
  const rhythmDensity = scene.emotion === "sad" ? "low" : scene.emotion === "tense" ? "high" : "medium";
  const dynamics = chooseDynamics(scene.intensity);
  const register = pickByKeywords(
    text,
    [
      { words: ["속삭", "그림자", "낮게", "웅성"], value: "low" },
      { words: ["비명", "폭발", "외침", "치솟"], value: "wide" },
      { words: ["햇살", "새소리", "가볍", "맑"], value: "high" },
    ],
    "mid",
  ) as "low" | "mid" | "high" | "wide";
  const ambienceExtra = pickByKeywords(
    text,
    [
      { words: ["비", "젖", "빗"], value: "rain_detail" },
      { words: ["골목", "도시", "네온"], value: "urban_reflection" },
      { words: ["숲", "바람", "햇살"], value: "nature_breeze" },
    ],
    "",
  );
  const ambience = ambienceExtra ? [...base.ambience, ambienceExtra] : base.ambience;
  const keywords = [...new Set(scene.keywords)].slice(0, 8);

  return {
    scene_summary: `${scene.emotion} mood in ${scene.setting} with ${scene.tone} tone`,
    emotion: scene.emotion,
    emotion_intensity: Number(scene.intensity.toFixed(2)),
    tension_level: tensionLevel,
    energy_level: energyLevel,
    valence,
    tempo_bpm: tempo,
    time_signature: "4/4",
    key: base.key,
    mode: base.mode,
    duration_sec: duration,
    loopable: true,
    structure: base.structure,
    dynamics,
    melody_density: melodyDensity,
    rhythm_density: rhythmDensity,
    register,
    instrumentation: base.instrumentation,
    texture: base.texture,
    ambience,
    harmonic_style: base.harmonic_style,
    chord_progression: base.chord_progression,
    motif_style: base.motif_style,
    keywords,
    generation_notes: "Rule-based scene-to-music parameters. Keep deterministic base with slight tempo variation.",
  };
}

export function generateNoteSequence(params: MusicParameterSchema, text: string): NoteEvent[] {
  const notes: NoteEvent[] = [];
  const rand = createSeededRandom(hashText(`${text}-${Date.now()}`));
  const beatSec = 60 / params.tempo_bpm;
  const bars = Math.max(4, Math.floor(params.duration_sec / (beatSec * 4)));
  const root = keyRootToMidi(params.key);
  const melodyStep = params.melody_density === "high" ? 0.5 : params.melody_density === "medium" ? 1 : 2;
  const velocityBase = params.dynamics === "soft" ? 62 : params.dynamics === "medium" ? 84 : 104;

  for (let bar = 0; bar < bars; bar += 1) {
    const chord = params.chord_progression[bar % params.chord_progression.length];
    const chordRoot = root + ((bar % 2) * 2);
    const chordNotes = buildChordNotes(chord, chordRoot);
    const barStart = bar * beatSec * 4;

    // Pad/piano chord bed
    notes.push({
      midi: chordNotes[0] - 12,
      start_sec: barStart,
      duration_sec: beatSec * 4,
      velocity: velocityBase - 14,
      instrument: params.instrumentation.includes("pad") ? "pad" : "piano",
    });
    notes.push({
      midi: chordNotes[1],
      start_sec: barStart,
      duration_sec: beatSec * 3.8,
      velocity: velocityBase - 18,
      instrument: "pad",
    });

    // Melody
    const steps = Math.floor(4 / melodyStep);
    for (let i = 0; i < steps; i += 1) {
      const idx = Math.floor(rand() * chordNotes.length);
      const jump = rand() > 0.8 ? 12 : 0;
      notes.push({
        midi: chordNotes[idx] + jump,
        start_sec: barStart + i * beatSec * melodyStep,
        duration_sec: beatSec * melodyStep * (rand() > 0.7 ? 0.8 : 0.55),
        velocity: clamp(45, velocityBase + Math.round((rand() - 0.5) * 22), 120),
        instrument: params.instrumentation.includes("pluck") ? "pluck" : "piano",
      });
    }

    // Pulse/bass for tense/mysterious
    if (params.instrumentation.includes("bass")) {
      for (let i = 0; i < 4; i += 1) {
        notes.push({
          midi: chordNotes[0] - 24,
          start_sec: barStart + i * beatSec,
          duration_sec: beatSec * (params.emotion === "tense" ? 0.75 : 0.55),
          velocity: velocityBase - 8,
          instrument: "bass",
        });
      }
    }

    if (params.instrumentation.includes("perc") && params.emotion !== "sad") {
      notes.push({
        midi: 36,
        start_sec: barStart,
        duration_sec: 0.08,
        velocity: velocityBase,
        instrument: "perc",
      });
      notes.push({
        midi: 42,
        start_sec: barStart + beatSec * 2,
        duration_sec: 0.06,
        velocity: velocityBase - 12,
        instrument: "perc",
      });
    }
  }

  return notes.filter((note) => note.start_sec < params.duration_sec);
}

function writeVarLen(value: number): number[] {
  let buffer = value & 0x7f;
  const bytes: number[] = [];
  while ((value >>= 7) > 0) {
    buffer <<= 8;
    buffer |= (value & 0x7f) | 0x80;
  }
  while (true) {
    bytes.push(buffer & 0xff);
    if (buffer & 0x80) {
      buffer >>= 8;
    } else {
      break;
    }
  }
  return bytes;
}

function ascii(text: string): number[] {
  return Array.from(text).map((char) => char.charCodeAt(0));
}

export function toMidiBase64(params: MusicParameterSchema, notes: NoteEvent[]): string {
  const ppq = 480;
  const tempoMicro = Math.round(60000000 / params.tempo_bpm);
  const events: Array<{ tick: number; data: number[] }> = [];

  events.push({ tick: 0, data: [0xff, 0x51, 0x03, (tempoMicro >> 16) & 0xff, (tempoMicro >> 8) & 0xff, tempoMicro & 0xff] });

  for (const note of notes) {
    const startTick = Math.max(0, Math.round((note.start_sec * params.tempo_bpm * ppq) / 60));
    const endTick = Math.max(startTick + 1, Math.round(((note.start_sec + note.duration_sec) * params.tempo_bpm * ppq) / 60));
    const midi = clamp(24, note.midi, 108);
    const velocity = clamp(1, note.velocity, 127);
    events.push({ tick: startTick, data: [0x90, midi, velocity] });
    events.push({ tick: endTick, data: [0x80, midi, 0] });
  }

  events.sort((a, b) => a.tick - b.tick);
  const trackData: number[] = [];
  let prevTick = 0;
  for (const event of events) {
    const delta = event.tick - prevTick;
    trackData.push(...writeVarLen(delta), ...event.data);
    prevTick = event.tick;
  }
  trackData.push(0x00, 0xff, 0x2f, 0x00);

  const header = [...ascii("MThd"), 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0x01, (ppq >> 8) & 0xff, ppq & 0xff];
  const trackHeader = [...ascii("MTrk"), (trackData.length >> 24) & 0xff, (trackData.length >> 16) & 0xff, (trackData.length >> 8) & 0xff, trackData.length & 0xff];
  const bytes = new Uint8Array([...header, ...trackHeader, ...trackData]);

  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

export function generateMusicFromText(scene: SceneAnalysis, text: string): GeneratedMusic {
  const parameters = generateMusicParameters(scene, text);
  const notes = generateNoteSequence(parameters, text);
  const midi_base64 = toMidiBase64(parameters, notes);
  return { parameters, notes, midi_base64 };
}

