import type {
  GeneratedMusicOutput,
  MidiNoteEvent,
  MusicParameterResult,
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

function parseChord(chord: string, root: number): number[] {
  const c = chord.toLowerCase();
  if (c.includes("sus2")) return [root, root + 2, root + 7];
  if (c.includes("maj7")) return [root, root + 4, root + 7, root + 11];
  if (c.includes("m")) return [root, root + 3, root + 7];
  return [root, root + 4, root + 7];
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function rotateArray<T>(arr: T[], amount: number): T[] {
  if (arr.length === 0) return arr;
  const shift = ((amount % arr.length) + arr.length) % arr.length;
  return [...arr.slice(shift), ...arr.slice(0, shift)];
}

function motifPattern(motifStyle: string, density: MusicParameterResult["melody_density"]): number[] {
  if (motifStyle.includes("descending")) return [0, -2, -5, -7];
  if (motifStyle.includes("rising")) return [0, 2, 5, 7];
  if (motifStyle.includes("sparse")) return [0, 7];
  if (density === "high") return [0, 2, 4, 7, 9, 7, 4, 2];
  if (density === "medium") return [0, 2, 4, 7];
  return [0, 4];
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
    const endTick = Math.max(startTick + 1, Math.round(((note.start_sec + note.duration_sec) * params.tempo_bpm * ppq) / 60));
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
  const trkHeader = [...ascii("MTrk"), (track.length >> 24) & 0xff, (track.length >> 16) & 0xff, (track.length >> 8) & 0xff, track.length & 0xff];
  const bytes = new Uint8Array([...header, ...trkHeader, ...track]);
  return Buffer.from(bytes).toString("base64");
}

export function generateMidiFromParameters(params: MusicParameterResult): GeneratedMusicOutput {
  const seed = hashString(
    `${params.scene_summary}|${params.keywords.join(",")}|${params.chord_progression.join("-")}|${params.motif_style}`,
  );
  const tempoShift = ((seed % 9) - 4) * 0.6;
  const resolvedTempo = clamp(54, Math.round(params.tempo_bpm + tempoShift), 170);
  const beat = 60 / resolvedTempo;
  const root = keyRootToMidi(params.key);
  const bars = Math.max(4, Math.floor(params.duration_sec / (beat * 4)));
  const notes: MidiNoteEvent[] = [];
  const velocity = params.dynamics === "soft" ? 62 : params.dynamics === "medium" ? 84 : 106;
  const motif = motifPattern(params.motif_style, params.melody_density);
  const progression = rotateArray(params.chord_progression, seed % Math.max(1, params.chord_progression.length));
  const rhythmStep = params.rhythm_density === "high" ? 0.5 : params.rhythm_density === "medium" ? 1 : 2;
  const melodyStep = params.melody_density === "high" ? 0.5 : params.melody_density === "medium" ? 1 : 2;

  for (let bar = 0; bar < bars; bar += 1) {
    const chord = progression[bar % progression.length];
    const chordRoot = root + ((bar + (seed % 3)) % 2) * 2;
    const tones = parseChord(chord, chordRoot);
    const start = bar * beat * 4;

    notes.push({
      midi: tones[0] - 12,
      start_sec: start,
      duration_sec: beat * 4,
      velocity: velocity - 14,
      instrument: params.instrumentation[0] ?? "piano",
    });
    notes.push({
      midi: tones[1],
      start_sec: start,
      duration_sec: beat * 2.5,
      velocity: velocity - 18,
      instrument: params.instrumentation[1] ?? "soft_pad",
    });

    const motifCount = Math.max(1, Math.floor(4 / melodyStep));
    for (let i = 0; i < motifCount; i += 1) {
      const motifOffset = motif[(i + bar) % motif.length] ?? 0;
      notes.push({
        midi: tones[i % tones.length] + motifOffset,
        start_sec: start + i * beat * melodyStep,
        duration_sec: beat * melodyStep * (params.structure === "static" ? 0.75 : 0.55),
        velocity: velocity - 6,
        instrument: params.instrumentation[0] ?? "piano",
      });
    }

    // Basic rhythm pulse driven by rhythm_density and instrumentation
    if (params.instrumentation.some((inst) => inst.includes("percussion") || inst === "pulse_synth")) {
      const rhythmHits = Math.max(1, Math.floor(4 / rhythmStep));
      for (let h = 0; h < rhythmHits; h += 1) {
        notes.push({
          midi: 36,
          start_sec: start + h * beat * rhythmStep,
          duration_sec: Math.max(0.05, beat * 0.3),
          velocity: velocity - 10,
          instrument: params.instrumentation.find((inst) => inst.includes("percussion") || inst === "pulse_synth") ?? "percussion",
        });
      }
    }
  }

  const midi_base64 = toMidiBase64(
    {
      ...params,
      tempo_bpm: resolvedTempo,
    },
    notes,
  );
  return { notes, midi_base64 };
}

