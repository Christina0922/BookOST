import { createSeededRandom, hashString } from "@/lib/hashSeed";
import {
  SCENE_MUSIC_PRESET_CATALOG,
  SCENE_PRESET_VARIATION_MOTIFS,
  type ScenePresetRow,
} from "@/lib/sceneMusicPresetCatalog";
import type {
  GeneratedMusicOutput,
  InstrumentType,
  MidiNoteEvent,
  MusicParameterResult,
  SceneMusicPresetId,
} from "@/types/music";

function clamp(min: number, value: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function keyRootToMidi(key: string): number {
  const root = key.split(" ")[0];
  const map: Record<string, number> = {
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
  return map[root] ?? 60;
}

function chordSymbolToRootMidi(symbol: string): number {
  const token = symbol.match(/^([A-G][#b]?)/)?.[1] ?? "C";
  return keyRootToMidi(token);
}

function parseChord(chord: string, root: number): number[] {
  const c = chord.toLowerCase();
  if (c.includes("maj7")) return [root, root + 4, root + 7, root + 11];
  if (c.includes("m7")) return [root, root + 3, root + 7, root + 10];
  if (c.includes("sus4")) return [root, root + 5, root + 7];
  if (c.includes("sus2")) return [root, root + 2, root + 7];
  if (c.includes("dim")) return [root, root + 3, root + 6];
  if (c.includes("m") && !c.includes("maj")) return [root, root + 3, root + 7];
  return [root, root + 4, root + 7];
}

function rotateArray<T>(arr: T[], amount: number): T[] {
  if (arr.length === 0) return arr;
  const shift = ((amount % arr.length) + arr.length) % arr.length;
  return [...arr.slice(shift), ...arr.slice(0, shift)];
}

type SectionId = "intro" | "main" | "variation" | "outro";

function sectionAt(barT: number, durationSec: number): SectionId {
  const i = (5 / 30) * durationSec;
  const m = (15 / 30) * durationSec;
  const v = (25 / 30) * durationSec;
  if (barT < i) return "intro";
  if (barT < m) return "main";
  if (barT < v) return "variation";
  return "outro";
}

function sectionGain(section: SectionId): number {
  switch (section) {
    case "intro":
      return 0.84;
    case "outro":
      return 0.88;
    case "variation":
      return 1.06;
    default:
      return 1;
  }
}

function baseVelocity(params: MusicParameterResult): number {
  if (params.dynamics === "soft") return 56;
  if (params.dynamics === "medium") return 78;
  return 100;
}

function push(
  notes: MidiNoteEvent[],
  midi: number,
  start: number,
  dur: number,
  velocity: number,
  instrument: InstrumentType,
): void {
  notes.push({
    midi: clamp(28, Math.round(midi), 108),
    start_sec: Math.max(0, start),
    duration_sec: Math.max(0.04, dur),
    velocity: clamp(18, Math.round(velocity), 120),
    instrument,
  });
}

function isPadInstrument(i: InstrumentType): boolean {
  return i === "soft_pad" || i === "dark_pad" || i === "low_strings";
}

/** Chord tones as sustained bed — separate from motif line. */
function emitChordBed(
  notes: MidiNoteEvent[],
  tones: number[],
  barStart: number,
  dur: number,
  vel: number,
  padInst: InstrumentType,
): void {
  const maxLayers = tones.length;
  for (let k = 0; k < maxLayers; k += 1) {
    push(notes, tones[k] + 12, barStart, dur, clamp(22, vel - k * 5, 102), padInst);
  }
}

/** Rain / generic ambient grains — tied to analysis environment. */
function emitEnvironmentAmbient(
  notes: MidiNoteEvent[],
  presetId: SceneMusicPresetId,
  env: MusicParameterResult["environment"],
  chordRoot: number,
  barStart: number,
  q: number,
  vb: number,
  rand: () => number,
): void {
  const wantRain =
    presetId === "rain_lonely_night" || env === "rain" || env === "sea";
  if (!wantRain || rand() > 0.42) return;
  push(
    notes,
    chordRoot + 56 + (rand() > 0.5 ? 3 : 0),
    barStart + rand() * q * 2,
    q * (0.35 + rand() * 0.25),
    vb - 42 + Math.round((rand() - 0.5) * 10),
    "ambient_noise",
  );
}

/** Scene-led bar: chord pad + bass + motif + accents (no single repeating toy loop). */
function emitSceneBar(args: {
  presetId: SceneMusicPresetId;
  cfg: ScenePresetRow;
  notes: MidiNoteEvent[];
  barIndex: number;
  barStart: number;
  q: number;
  chordSym: string;
  section: SectionId;
  motifIntervals: number[];
  params: MusicParameterResult;
  rand: () => number;
  seed: number;
}): void {
  const { presetId, cfg, notes, barIndex, barStart, q, chordSym, section, motifIntervals, params, rand, seed } =
    args;
  const chordRoot = chordSymbolToRootMidi(chordSym);
  const tones = parseChord(chordSym, chordRoot);
  const vb = baseVelocity(params) * sectionGain(section);
  const velJ = () => Math.round((rand() - 0.5) * 12);
  const intensity = params.intensity;

  const padPrimary: InstrumentType = isPadInstrument(cfg.secondaryLayer) ? cfg.secondaryLayer : "soft_pad";
  const padVelBase = vb - 28;

  const spacingMul = cfg.melodySpacing === "sparse" ? 1.2 : cfg.melodySpacing === "dense" ? 0.62 : 0.88;
  const spareIntro = section === "intro" ? 0.55 + intensity * 0.15 : 1;

  // --- (1) Harmony bed: pads / strings (chord ≠ motif) ---
  const bedDur =
    cfg.melodySpacing === "sparse"
      ? q * (3.6 + rand() * 0.15)
      : q * (3.2 + rand() * 0.12);
  if (!(section === "intro" && cfg.melodySpacing === "sparse" && barIndex % 2 === 1)) {
    emitChordBed(notes, tones, barStart, bedDur, padVelBase + velJ(), padPrimary);
  }
  if (!isPadInstrument(cfg.secondaryLayer) && cfg.secondaryLayer !== "light_percussion") {
    emitChordBed(notes, tones, barStart + 0.02, bedDur * 0.95, padVelBase - 14 + velJ(), "soft_pad");
  }

  const bassMidi = chordRoot - 24;

  // --- (2) Bass / pulse cells (preset-specific) ---
  if (presetId === "tense_chase") {
    for (let s = 0; s < 8; s += 1) {
      if (section === "intro" && s % 2 === 1 && rand() < 0.5) continue;
      const st = barStart + s * (q / 2);
      push(notes, bassMidi + (s % 2 === 0 ? 0 : 7), st, q * 0.4, vb - 6 + velJ(), "bass");
    }
  } else if (presetId === "rain_lonely_night" || presetId === "calm_memory") {
    const steps = section === "outro" ? [0] : cfg.melodySpacing === "sparse" ? [0, 2] : [0, 2, 3];
    for (let s = 0; s < steps.length; s += 1) {
      push(
        notes,
        bassMidi,
        barStart + steps[s]! * q * 0.5,
        q * (cfg.melodySpacing === "sparse" ? 3.2 : 2.4),
        vb - 18 + velJ(),
        "bass",
      );
    }
  } else if (presetId === "warm_romance") {
    push(notes, bassMidi, barStart, q * 2.8, vb - 14 + velJ(), "bass");
    if (section === "variation" && barIndex % 2 === 0) {
      push(notes, bassMidi + 7, barStart + q * 2, q * 1.2, vb - 20 + velJ(), "bass");
    }
  } else if (presetId === "serious_preparation") {
    for (let b = 0; b < 4; b += 1) {
      push(notes, bassMidi, barStart + b * q, q * 0.85, vb - 12 + velJ(), "bass");
    }
  } else if (presetId === "mysterious_scene") {
    push(notes, bassMidi, barStart, q * 2.8, vb - 20 + velJ(), "bass");
    if (section === "variation") {
      push(notes, bassMidi + 6, barStart + q * 2, q * 1.4, vb - 26 + velJ(), "bass");
    }
  }

  // --- (3) Melodic motif (main instrument) — separated from chord stack ---
  const motifTone = tones[(barIndex + (seed % 3)) % tones.length]!;
  let melodyHits = 3;
  if (presetId === "tense_chase") melodyHits = section === "intro" ? 2 : 5;
  else if (presetId === "rain_lonely_night" || presetId === "calm_memory")
    melodyHits = section === "intro" ? 1 : cfg.melodySpacing === "sparse" ? 2 : 3;
  else if (presetId === "warm_romance") melodyHits = section === "outro" ? 2 : 3;
  else if (presetId === "serious_preparation") melodyHits = 4;
  else if (presetId === "mysterious_scene") melodyHits = section === "intro" ? 1 : 3;

  melodyHits = Math.round(melodyHits * spareIntro * (0.85 + intensity * 0.2));

  if (section === "outro") {
    const cap =
      cfg.outroStyle === "fade_pad_decay" || cfg.outroStyle === "bell_tail"
        ? 1
        : cfg.outroStyle === "pulse_drop"
          ? 2
          : 2;
    melodyHits = Math.min(melodyHits, cap);
  }

  const lead: InstrumentType = cfg.mainInstrument;

  for (let m = 0; m < melodyHits; m += 1) {
    if (cfg.melodySpacing === "sparse" && section === "intro" && m > 0) continue;
    if (rand() < (section === "intro" ? 0.38 : 0.06)) continue;
    const interval = motifIntervals[(m + barIndex + seed) % motifIntervals.length] ?? 0;
    const step = m * q * spacingMul * (presetId === "tense_chase" ? 0.48 : 0.82);
    const start = barStart + step + (rand() - 0.5) * 0.03;
    const dur =
      q *
      (presetId === "tense_chase"
        ? 0.26
        : cfg.melodySpacing === "sparse"
          ? 0.62
          : presetId === "mysterious_scene"
            ? 0.52
            : 0.45);

    push(
      notes,
      motifTone + interval + (lead === "bell" ? 12 : 0),
      start,
      dur,
      vb - (lead === "pulse_synth" ? 5 : 14) + velJ(),
      lead,
    );
  }

  // Secondary ornamental layer (bell romance / strings stab chase)
  if (presetId === "warm_romance" && cfg.secondaryLayer === "bell" && section !== "intro") {
    push(notes, motifTone + 19, barStart + q * 2.5, q * 0.35, vb - 28 + velJ(), "bell");
  }
  if (presetId === "tense_chase" && section !== "intro" && barIndex % 2 === 0) {
    push(notes, chordRoot + 7, barStart + q * 0.5, q * 0.2, vb - 22 + velJ(), "low_strings");
  }

  // --- (4) Limited dissonance (tense / mysterious only) ---
  if (
    cfg.allowsDissonance &&
    rand() < 0.22 &&
    (section === "variation" || section === "main")
  ) {
    push(notes, chordRoot + 6, barStart + q * 1.5, q * 0.14, vb - 30 + velJ(), "pulse_synth");
  }

  // --- (5) Rhythm layer ---
  const rh = params.rhythm_density;
  const percChance =
    rh === "high" ? 0.88 : rh === "medium" ? 0.45 : 0.18;
  if (rand() < percChance && section !== "intro") {
    const hits = presetId === "tense_chase" ? 4 : presetId === "serious_preparation" ? 2 : 1;
    const inst: InstrumentType =
      cfg.secondaryLayer === "light_percussion" ? "light_percussion" : "percussion";
    for (let h = 0; h < hits; h += 1) {
      if (presetId === "calm_memory" && barIndex % 2 === 1 && h > 0) continue;
      push(
        notes,
        40 + h,
        barStart + h * q * (presetId === "tense_chase" ? 1 : 2.1),
        q * (presetId === "tense_chase" ? 0.14 : 0.1),
        vb - 32 + velJ(),
        inst,
      );
    }
  }

  // --- (6) Environment-driven ambient ---
  emitEnvironmentAmbient(notes, presetId, params.environment, chordRoot, barStart, q, vb, rand);

  // --- (7) Outro tail ---
  if (section === "outro") {
    if (cfg.outroStyle === "noise_wash" && rand() < 0.55) {
      push(notes, chordRoot + 48, barStart + q * 2.2, q * 2.4, vb - 36 + velJ(), "ambient_noise");
    }
    if (cfg.outroStyle === "bell_tail" && presetId === "warm_romance") {
      push(notes, motifTone + 24, barStart + q * 3.2, q * 0.8, vb - 34 + velJ(), "bell");
    }
  }
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
    if (buffer & 0x80) buffer >>= 8;
    else break;
  }
  return bytes;
}

function ascii(text: string): number[] {
  return Array.from(text).map((ch) => ch.charCodeAt(0));
}

function toMidiBase64(params: MusicParameterResult, notes: MidiNoteEvent[]): string {
  const ppq = 480;
  const tempoMicro = Math.round(60000000 / params.tempo_bpm);
  const events: Array<{ tick: number; data: number[] }> = [];

  events.push({
    tick: 0,
    data: [0xff, 0x51, 0x03, (tempoMicro >> 16) & 0xff, (tempoMicro >> 8) & 0xff, tempoMicro & 0xff],
  });
  for (const note of notes) {
    const startTick = Math.max(0, Math.round((note.start_sec * params.tempo_bpm * ppq) / 60));
    const endTick = Math.max(
      startTick + 1,
      Math.round(((note.start_sec + note.duration_sec) * params.tempo_bpm * ppq) / 60),
    );
    const midi = clamp(24, note.midi, 108);
    const vel = clamp(1, note.velocity, 127);
    events.push({ tick: startTick, data: [0x90, midi, vel] });
    events.push({ tick: endTick, data: [0x80, midi, 0] });
  }

  events.sort((a, b) => a.tick - b.tick);
  const track: number[] = [];
  let prev = 0;
  for (const event of events) {
    const delta = event.tick - prev;
    track.push(...writeVarLen(delta), ...event.data);
    prev = event.tick;
  }
  track.push(0x00, 0xff, 0x2f, 0x00);

  const header = [...ascii("MThd"), 0, 0, 0, 6, 0, 0, 0, 1, (ppq >> 8) & 0xff, ppq & 0xff];
  const trkHeader = [
    ...ascii("MTrk"),
    (track.length >> 24) & 0xff,
    (track.length >> 16) & 0xff,
    (track.length >> 8) & 0xff,
    track.length & 0xff,
  ];
  const bytes = new Uint8Array([...header, ...trkHeader, ...track]);
  return Buffer.from(bytes).toString("base64");
}

export function generateMidiFromParameters(params: MusicParameterResult): GeneratedMusicOutput {
  const presetId = params.music_scene_preset;
  const cfg = SCENE_MUSIC_PRESET_CATALOG[presetId];

  const seed =
    hashString(
      `${params.scene_summary}|${params.keywords.join(",")}|${presetId}|${params.tone}|${params.scene_type}|${params.time_feel}|${params.environment}|${params.chord_progression.join("-")}|${params.intensity}`,
    ) ^ hashString(`${params.emotion}|${params.texture}|${params.motif_style}`);

  const rand = createSeededRandom(seed >>> 0);
  const tempoJitter = ((seed % 9) - 4) * 0.25;
  const tempo = clamp(cfg.tempoRange[0], Math.round(params.tempo_bpm + tempoJitter), cfg.tempoRange[1]);

  const progression = rotateArray(params.chord_progression, seed % Math.max(1, params.chord_progression.length));
  const durationSec = params.duration_sec;
  const quarter = 60 / tempo;
  const barLen = quarter * 4;
  const numBars = Math.max(4, Math.ceil(durationSec / barLen));

  const varIdx = (seed >>> 10) % 3;
  const motifIntervals = [...(SCENE_PRESET_VARIATION_MOTIFS[presetId][varIdx] ?? [0, 2, 4, 7])];

  const notes: MidiNoteEvent[] = [];

  for (let bar = 0; bar < numBars; bar += 1) {
    const barStart = bar * barLen;
    if (barStart >= durationSec - 0.02) break;
    const chordSym = progression[bar % progression.length] ?? progression[0]!;
    const section = sectionAt(barStart, durationSec);

    emitSceneBar({
      presetId,
      cfg,
      notes,
      barIndex: bar,
      barStart,
      q: quarter,
      chordSym,
      section,
      motifIntervals,
      params: { ...params, tempo_bpm: tempo },
      rand,
      seed,
    });
  }

  const midi_base64 = toMidiBase64({ ...params, tempo_bpm: tempo }, notes);
  return { notes, midi_base64 };
}
