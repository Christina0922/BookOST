export type EmotionType = "tense" | "sad" | "calm" | "mysterious";

export type EmotionAnalysisResult = {
  emotion: EmotionType;
  score: number;
  keywords: string[];
};

const RULES: Record<EmotionType, string[]> = {
  tense: ["총", "비명", "도망", "추격", "깨졌다", "피", "폭발"],
  sad: ["눈물", "외로", "슬펐", "떠났", "남겨졌", "남겨진", "혼자"],
  calm: ["햇살", "잔잔", "고요", "편안", "평온"],
  mysterious: ["어둠", "그림자", "낯설", "속삭", "이상한", "기묘"],
};

const PRIORITY: EmotionType[] = ["tense", "sad", "mysterious", "calm"];

export function analyzeEmotionFromText(text: string): EmotionAnalysisResult {
  const normalized = text.trim().toLowerCase();
  const scores = PRIORITY.map((emotion) => {
    const matched = RULES[emotion].filter((k) => normalized.includes(k));
    return {
      emotion,
      keywords: matched,
      score: matched.length,
    };
  });

  scores.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return PRIORITY.indexOf(a.emotion) - PRIORITY.indexOf(b.emotion);
  });

  const best = scores[0];
  if (best.score === 0) {
    return { emotion: "calm", score: 0.2, keywords: [] };
  }

  const maxKeywords = Math.max(1, RULES[best.emotion].length);
  return {
    emotion: best.emotion,
    score: Number(Math.min(1, best.score / maxKeywords).toFixed(2)),
    keywords: best.keywords,
  };
}

