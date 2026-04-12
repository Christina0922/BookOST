export type EmotionAnalysis = {
  emotion: string;
  intensity: number;
  tempo: string;
  mood: string;
  environment: string;
  genre: string;
};

export type ConditionVector = {
  tension: number;
  darkness: number;
  tempo: number;
  genre_weight: number;
  brightness: number;
  emotional_intensity: number;
};

export type OstCard = {
  title: string;
  tagline: string;
  accent_color: string;
  mood_emoji: string;
};

export type PipelineArtifacts = {
  cleaned_text: string;
  sentences: string[];
  emotion: EmotionAnalysis;
  condition: ConditionVector;
  music_prompt: string;
  audio_url: string | null;
  download_url: string | null;
  duration_sec: number | null;
  ost_card: OstCard;
};

export type GenerateResponse = {
  job_id: string | null;
  artifacts: PipelineArtifacts;
  /** 이미지 OCR로만 채워짐. 직접 텍스트 입력 시 null */
  ocr_text?: string | null;
};
