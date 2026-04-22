import type {
  EmotionType,
  EnvironmentKind,
  InstrumentType,
  ModeType,
  SceneType,
  StructureType,
  TimeFeel,
  ToneType,
} from "@/types/music";

export const EMOTION_KEYWORDS: Record<EmotionType, string[]> = {
  tense: [
    "총",
    "샷건",
    "깨졌다",
    "폭발",
    "추격",
    "도망",
    "비명",
    "갑자기",
    "순간",
    "짜증",
    "잘못",
    "긴장",
  ],
  sad: [
    "비",
    "혼자",
    "남겨진",
    "눈물",
    "외로",
    "떠났",
    "그리움",
    "쓸쓸",
    "피곤",
    "힘없",
    "무너",
  ],
  calm: [
    "햇살",
    "바람",
    "고요",
    "창가",
    "잔잔",
    "편안",
    "평온",
    "조용히",
    "천천히",
    "다시 잠",
    "잠에",
  ],
  mysterious: [
    "속삭",
    "그림자",
    "복도",
    "낯설",
    "기묘",
    "어둠",
    "이상한",
    "컴퓨터",
    "기계",
    "똑같",
    "질문",
    "눈을",
    "눈 뜨",
    "뜰 수",
    "틀렸",
    "실험",
  ],
};

export const AMBIENCE_KEYWORDS: Array<{ words: string[]; ambience: string[] }> = [
  { words: ["비", "빗", "젖"], ambience: ["rain"] },
  { words: ["밤", "네온"], ambience: ["night", "city"] },
  { words: ["복도"], ambience: ["hallway"] },
  { words: ["숲"], ambience: ["forest"] },
];

/** First match wins — order more specific cues before generic ones. */
export const TIME_FEEL_RULES: Array<{ words: string[]; feel: TimeFeel }> = [
  { words: ["꿈", "멀리", "떠올"], feel: "floating" },
  { words: ["천천히", "잔잔", "고요히"], feel: "slow" },
  { words: ["몇 분", "다시", "똑같", "또"], feel: "slow" },
  { words: ["추격", "도망", "갑자기", "순간", "급히"], feel: "urgent" },
  { words: ["행진", "전진", "박자"], feel: "driving" },
];

export const ENVIRONMENT_RULES: Array<{ words: string[]; env: EnvironmentKind }> = [
  { words: ["비", "빗", "rain", "rainy"], env: "rain" },
  { words: ["밤", "night"], env: "night" },
  { words: ["침대", "누워", "누웠"], env: "interior" },
  { words: ["컴퓨터", "기계", "질문", "응답", "ai"], env: "interior" },
  { words: ["네온", "거리", "city", "urban"], env: "city" },
  { words: ["숲", "forest"], env: "forest" },
  { words: ["방", "실내", "cafe", "café", "interior"], env: "interior" },
  { words: ["바다", "sea", "ocean"], env: "sea" },
];

export const STRUCTURE_KEYWORDS: Array<{ words: string[]; structure: StructureType }> = [
  { words: ["갑자기", "순간"], structure: "build_up" },
  { words: ["조용히", "천천히"], structure: "static" },
];

export const EMOTION_BOOST_KEYWORDS: Array<{ words: string[]; emotion: EmotionType; boost: number }> = [
  { words: ["전쟁", "대회", "준비"], emotion: "tense", boost: 0.18 },
  { words: ["피로", "한계"], emotion: "sad", boost: 0.22 },
  { words: ["설명", "지시"], emotion: "calm", boost: 0.14 },
];

export const SCENE_TYPE_RULES: Array<{ words: string[]; scene_type: SceneType }> = [
  { words: ["추격", "폭발", "전쟁", "총"], scene_type: "confrontation" },
  { words: ["준비", "점검", "계획", "회의"], scene_type: "preparation" },
  { words: ["눈을", "눈 뜨", "눈뜨", "둘 수", "뜰 수", "말이", "말하"], scene_type: "suspense_build" },
  { words: ["컴퓨터", "질문", "응답", "감정이 없", "똑같", "실험", "틀렸"], scene_type: "suspense_build" },
  { words: ["불안", "긴장", "실수", "압박"], scene_type: "suspense_build" },
  { words: ["회상", "생각", "돌아보", "반성"], scene_type: "reflection" },
  { words: ["고요", "휴식", "잠시", "안정"], scene_type: "quiet_moment" },
];

export const TONE_RULES: Array<{ words: string[]; tone: ToneType }> = [
  { words: ["엄숙", "현실", "지시", "작전"], tone: "serious" },
  { words: ["가볍", "유쾌", "미소"], tone: "light" },
  { words: ["냉정", "차갑", "감정이 없", "감독", "냉"], tone: "dark" },
  { words: ["어둠", "그림자", "불길", "눈을 뜰"], tone: "dark" },
  { words: ["따뜻", "온기", "포근"], tone: "warm" },
];

export const EMOTION_DEFAULTS: Record<
  EmotionType,
  {
    mode: ModeType;
    key: string;
    tempo_bpm: number;
    structure: StructureType;
    dynamics: "soft" | "medium" | "strong";
    melody_density: "low" | "medium" | "high";
    rhythm_density: "low" | "medium" | "high";
    instrumentation: InstrumentType[];
    texture: string;
    harmonic_style: string;
    chord_progression: string[];
    motif_style: string;
    valence: number;
    tension_level: number;
    energy_level: number;
  }
> = {
  tense: {
    mode: "minor",
    key: "E",
    tempo_bpm: 122,
    structure: "build_up",
    dynamics: "strong",
    melody_density: "high",
    rhythm_density: "high",
    instrumentation: ["low_strings", "pulse_synth", "percussion", "bass"],
    texture: "driving_layered",
    harmonic_style: "unstable_harmony",
    chord_progression: ["Em", "C", "G", "D"],
    motif_style: "rising_pattern",
    valence: 0.22,
    tension_level: 0.82,
    energy_level: 0.86,
  },
  sad: {
    mode: "minor",
    key: "D",
    tempo_bpm: 68,
    structure: "wave",
    dynamics: "soft",
    melody_density: "low",
    rhythm_density: "low",
    instrumentation: ["piano", "soft_pad", "bass"],
    texture: "thin_warm",
    harmonic_style: "simple_harmony",
    chord_progression: ["Dm", "Bb", "Gm", "A"],
    motif_style: "descending_motif",
    valence: 0.16,
    tension_level: 0.36,
    energy_level: 0.28,
  },
  calm: {
    mode: "major",
    key: "G",
    tempo_bpm: 86,
    structure: "static",
    dynamics: "soft",
    melody_density: "medium",
    rhythm_density: "low",
    instrumentation: ["piano", "soft_pad", "light_percussion"],
    texture: "open_warm",
    harmonic_style: "warm_harmony",
    chord_progression: ["G", "D", "Em", "C"],
    motif_style: "repeating_motif",
    valence: 0.72,
    tension_level: 0.2,
    energy_level: 0.34,
  },
  mysterious: {
    mode: "minor",
    key: "F#",
    tempo_bpm: 76,
    structure: "wave",
    dynamics: "medium",
    melody_density: "low",
    rhythm_density: "medium",
    instrumentation: ["dark_pad", "bell", "ambient_noise", "bass"],
    texture: "dark_sparse",
    harmonic_style: "suspended_harmony",
    chord_progression: ["F#m", "Gmaj7", "Em", "Dsus2"],
    motif_style: "sparse_motif",
    valence: 0.3,
    tension_level: 0.56,
    energy_level: 0.46,
  },
};

