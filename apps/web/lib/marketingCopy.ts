/**
 * Landing / demo UI copy (BookOST).
 */
export const PAGE_COPY = {
  brand: "BookOST",
  heroSub:
    "한국어·영어 등 다양한 텍스트에서 감정과 분위기를 해석해 맞춤형 OST를 생성합니다",
  heroTaglineEn: "Translate scenes into music, in any language.",
  badgeLang: "KR · EN Supported",
  sceneTextLabel: "Scene Text",
  sceneTextHint: "한국어 / English 입력 가능",
  sceneTextPlaceholder: "Describe a moment from a book or film — any language.",
  ocrTitle: "Book image (optional)",
  ocrHint: "OCR runs in your browser. Images are not stored on the server.",
  ctaPrimary: "OST 만들기",
  ctaLoading: "Generating…",
  flowSteps: [
    { step: 1, title: "Scene", subtitle: "Paste text or OCR" },
    { step: 2, title: "Generate", subtitle: "Analyze & compose" },
    { step: 3, title: "Listen", subtitle: "30s scene BGM" },
  ] as const,
  featureCards: [
    {
      id: "interpret",
      title: "장면 해석",
      titleEn: "Scene interpretation",
      body: "감정 가중치와 장면 유형으로 문장을 읽습니다.",
    },
    {
      id: "params",
      title: "음악 파라미터",
      titleEn: "Music parameters",
      body: "템포·조성·텍스처를 장면에 맞게 설계합니다.",
    },
    {
      id: "ost",
      title: "OST 생성",
      titleEn: "OST output",
      body: "약 30초 길이의 장면형 사운드를 만듭니다.",
    },
  ] as const,
  resultTitle: "Your scene soundtrack",
  resultSubtitle: "요약 · 감정 · 재생 · 파라미터",
  cardScene: "장면 요약",
  cardEmotion: "감정 분포",
  cardPlayer: "재생",
  cardParams: "음악 파라미터",
  footerPrivacy: "OCR & images stay in your browser.",
} as const;

export const EXAMPLE_SCENE_KO =
  "비 오는 밤, 창밖 네온이 번지는 골목에서 나는 숨을 죽였다. 뒤쪽에서 발소리가 다가왔다.";
export const EXAMPLE_SCENE_EN =
  "The neon bled into the rainy alley — I held my breath, listening for footsteps behind me.";
