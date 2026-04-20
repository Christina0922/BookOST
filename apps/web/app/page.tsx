"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GenerateOstResponse, GenerateOstSuccess } from "@/types/ost";

const SAMPLE =
  "밤비가 창문을 두드렸다. 네온 불빛 아래, 그는 마지막 단서를 손에 쥐고 숨을 죽였다. 골목 끝에서 발소리가 다가왔다.";
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const RESIZE_TRIGGER_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_SIDE = 2200;
const LAYER_ORDER: Array<keyof GenerateOstSuccess["layers"]> = ["base", "rhythm", "melodic", "effect"];

function getEmotionVisual(emotion: string) {
  switch (emotion) {
    case "tense":
      return {
        badgeClass: "border-amber-300/35 bg-amber-400/20 text-amber-100",
        accentSectionClass: "border-amber-300/25 from-slate-900/75 to-amber-950/35",
        accentHeroClass: "border-amber-300/25 from-amber-500/20 to-rose-500/15",
        accentTagClass: "border-amber-300/25 bg-amber-500/15 text-amber-100",
      };
    case "sad":
      return {
        badgeClass: "border-blue-300/35 bg-blue-400/20 text-blue-100",
        accentSectionClass: "border-blue-300/25 from-slate-900/75 to-blue-950/35",
        accentHeroClass: "border-blue-300/25 from-blue-500/20 to-indigo-500/15",
        accentTagClass: "border-blue-300/25 bg-blue-500/15 text-blue-100",
      };
    case "mysterious":
      return {
        badgeClass: "border-violet-300/35 bg-violet-400/20 text-violet-100",
        accentSectionClass: "border-violet-300/25 from-slate-900/75 to-violet-950/35",
        accentHeroClass: "border-violet-300/25 from-violet-500/20 to-fuchsia-500/15",
        accentTagClass: "border-violet-300/25 bg-violet-500/15 text-violet-100",
      };
    default:
      return {
        badgeClass: "border-emerald-300/35 bg-emerald-400/20 text-emerald-100",
        accentSectionClass: "border-emerald-300/25 from-slate-900/75 to-emerald-950/30",
        accentHeroClass: "border-emerald-300/25 from-emerald-500/18 to-teal-500/14",
        accentTagClass: "border-emerald-300/25 bg-emerald-500/15 text-emerald-100",
      };
  }
}

export default function HomePage() {
  const [text, setText] = useState(SAMPLE);
  const [loading, setLoading] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateOstSuccess | null>(null);
  const [audioNotice, setAudioNotice] = useState<string | null>(null);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [mixingAudio, setMixingAudio] = useState(false);
  const lastBlobUrlRef = useRef<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const steps = useMemo(
    () => [
      { id: "in", label: "글·이미지 넣기" },
      { id: "gen", label: "OST 만들기" },
      { id: "listen", label: "듣기·공유" },
    ],
    [],
  );
  const emotionUi = result ? getEmotionVisual(result.emotion) : null;

  useEffect(() => {
    return () => {
      if (lastBlobUrlRef.current) {
        URL.revokeObjectURL(lastBlobUrlRef.current);
      }
    };
  }, []);

  function bufferToWav(buffer: AudioBuffer): ArrayBuffer {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const samples = buffer.length;
    const bytesPerSample = 2;
    const blockAlign = numChannels * bytesPerSample;
    const dataSize = samples * blockAlign;
    const wav = new ArrayBuffer(44 + dataSize);
    const view = new DataView(wav);

    function writeString(offset: number, value: string) {
      for (let i = 0; i < value.length; i += 1) {
        view.setUint8(offset + i, value.charCodeAt(i));
      }
    }

    writeString(0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    writeString(36, "data");
    view.setUint32(40, dataSize, true);

    let offset = 44;
    for (let i = 0; i < samples; i += 1) {
      for (let c = 0; c < numChannels; c += 1) {
        const sample = Math.max(-1, Math.min(1, buffer.getChannelData(c)[i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += bytesPerSample;
      }
    }
    return wav;
  }

  async function buildLayerMix(layerUrls: string[]): Promise<string> {
    const AudioContextCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) {
      throw new Error("이 브라우저는 오디오 합성을 지원하지 않습니다.");
    }

    const decodeContext = new AudioContextCtor();
    try {
      const decoded = await Promise.all(
        layerUrls.map(async (url) => {
          const res = await fetch(url);
          if (!res.ok) {
            throw new Error(`레이어 파일을 불러오지 못했습니다: ${url}`);
          }
          const arr = await res.arrayBuffer();
          return decodeContext.decodeAudioData(arr.slice(0));
        }),
      );

      const maxDuration = Math.max(...decoded.map((buffer) => buffer.duration), 8);
      const sampleRate = 44100;
      const offline = new OfflineAudioContext(2, Math.ceil(maxDuration * sampleRate), sampleRate);
      const gains = [0.52, 0.36, 0.31, 0.24];

      decoded.forEach((buffer, index) => {
        const source = offline.createBufferSource();
        source.buffer = buffer;
        const gain = offline.createGain();
        gain.gain.value = gains[index] ?? 0.25;
        source.connect(gain).connect(offline.destination);
        source.start(0);
      });

      const rendered = await offline.startRendering();
      const wav = bufferToWav(rendered);
      const blobUrl = URL.createObjectURL(new Blob([wav], { type: "audio/wav" }));
      return blobUrl;
    } finally {
      void decodeContext.close();
    }
  }

  async function preparePlayback(data: GenerateOstSuccess) {
    if (lastBlobUrlRef.current) {
      URL.revokeObjectURL(lastBlobUrlRef.current);
      lastBlobUrlRef.current = null;
    }

    if (data.mixMode === "layers" && data.layerSources.length >= 2) {
      setMixingAudio(true);
      try {
        const mixedUrl = await buildLayerMix(data.layerSources);
        lastBlobUrlRef.current = mixedUrl;
        setPlaybackUrl(mixedUrl);
      } catch {
        setPlaybackUrl(data.audioUrl);
        setAudioNotice("레이어 믹스에 실패해 기본 트랙으로 재생합니다.");
      } finally {
        setMixingAudio(false);
      }
      return;
    }

    setPlaybackUrl(data.audioUrl);
  }

  async function runGenerate(trimmed: string) {
    setLoading(true);
    setAudioNotice(null);

    try {
      const res = await fetch("/api/generate-ost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
      });

      const data = (await res.json()) as GenerateOstResponse;
      if (!res.ok || !data.success) {
        throw new Error(data.success ? "요청 처리에 실패했습니다." : data.message);
      }

      await preparePlayback(data);
      setResult(data);
      // Best-effort autoplay after user gesture.
      queueMicrotask(() => {
        if (!audioRef.current) return;
        audioRef.current
          .play()
          .then(() => setAudioNotice(null))
          .catch(() => setAudioNotice("브라우저 정책으로 자동 재생이 제한될 수 있어요. 플레이 버튼을 눌러주세요."));
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function onGenerate() {
    const trimmed = text.trim();
    if (!trimmed) {
      setError("텍스트를 입력해 주세요.");
      return;
    }
    setError(null);
    await runGenerate(trimmed);
  }

  async function optimizeImageForOcr(file: File): Promise<{ blob: Blob; resized: boolean }> {
    if (file.size <= RESIZE_TRIGGER_BYTES) {
      return { blob: file, resized: false };
    }

    const bitmap = await createImageBitmap(file);
    const longerSide = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, MAX_IMAGE_SIDE / longerSide);
    if (scale >= 1) {
      return { blob: file, resized: false };
    }

    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return { blob: file, resized: false };
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (out) => {
          if (out) resolve(out);
          else reject(new Error("이미지 변환에 실패했습니다."));
        },
        "image/jpeg",
        0.9,
      );
    });
    return { blob, resized: true };
  }

  async function onImageSelected(f: File) {
    if (!f.type.startsWith("image/")) {
      setError("이미지 파일만 업로드할 수 있습니다.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    if (f.size > MAX_IMAGE_BYTES) {
      setError("이미지 용량이 너무 큽니다. 12MB 이하 파일을 사용해 주세요.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

    setOcrLoading(true);
    setError(null);
    setAudioNotice(null);

    try {
      const { blob, resized } = await optimizeImageForOcr(f);
      void resized;

      const { recognize } = await import("tesseract.js");
      const ocrRes = await recognize(blob, "kor+eng", {
        logger: (m) => {
          void m;
        },
      });

      const recognized = ocrRes.data.text.replace(/\s+/g, " ").trim();
      if (!recognized) {
        throw new Error("이미지에서 텍스트를 찾지 못했습니다. 더 선명한 이미지를 시도해 주세요.");
      }

      setText(recognized);
      await runGenerate(recognized);
    } catch (e) {
      setError(e instanceof Error ? e.message : "이미지 인식 중 오류가 발생했습니다.");
    } finally {
      setOcrLoading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 text-slate-100">
      <div className="mx-auto w-full max-w-5xl px-5 py-12 sm:px-8 sm:py-16">
        <header className="mb-10 space-y-5">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-300">BookOST · 독서 OST</p>
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-300/30 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-100">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-indigo-300" />
            AI Scene Analyzer
          </div>
          <h1 className="text-4xl font-extrabold leading-tight text-white sm:text-5xl md:text-6xl">
            텍스트를 보여주면
            <span className="text-indigo-300"> 음악이 나옵니다</span>.
          </h1>
          <p className="max-w-3xl text-base leading-8 text-slate-300 sm:text-xl">
            장면을 글로 붙여 넣거나, 스크린샷·사진을 올리면 그에 맞는 OST를 바로 들을 수 있습니다.
          </p>
          <p className="text-sm text-slate-400">사진·캡처는 글자만 읽고 이미지 파일은 서버에 저장하지 않습니다.</p>
        </header>

        <section className="space-y-5 rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl backdrop-blur-sm sm:p-7 md:p-8">
          <label className="block text-sm font-medium text-slate-200">
            장면 텍스트
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={9}
              className="mt-2 min-h-[180px] w-full resize-y rounded-2xl border border-slate-700 bg-slate-900/80 p-5 text-base leading-7 text-slate-100 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/30"
              placeholder="문장 또는 문단을 붙여넣으세요."
            />
          </label>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onImageSelected(f);
            }}
          />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:items-center">
            <button
              type="button"
              onClick={onGenerate}
              disabled={loading || ocrLoading || !text.trim()}
              className="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-6 py-3.5 text-base font-bold text-white shadow-lg shadow-indigo-500/30 transition hover:-translate-y-0.5 hover:from-indigo-400 hover:to-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "장면을 분석하고 OST를 준비하는 중입니다..." : "OST 만들기"}
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={loading || ocrLoading}
              className="w-full rounded-xl border border-slate-500 bg-slate-800/50 px-6 py-3.5 text-base font-semibold text-slate-100 transition hover:bg-slate-700/60 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {ocrLoading ? "처리 중…" : "사진·스크린샷 → 인식 후 OST"}
            </button>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-slate-400">목표 길이 20-40초 · MVP Mock 오디오 포함</span>
            <span className="hidden text-xs text-slate-500 sm:inline">One-click AI OST</span>
          </div>

          {ocrLoading ? <p className="text-sm font-medium text-indigo-200">이미지에서 텍스트를 추출하는 중입니다...</p> : null}
          {loading ? <p className="text-sm font-medium text-indigo-200">장면을 분석 중입니다...</p> : null}
          {error ? <div className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div> : null}
        </section>

        <p className="mt-3 text-xs text-slate-400">
          사진/스크린샷은 브라우저에서 서버로만 전송되어 OCR에만 쓰이며, 저작권 보호를 위해 이미지 파일을 서버에 저장하지 않습니다.
        </p>

        <section className="mt-6 rounded-2xl border border-white/10 bg-slate-900/40 p-4 sm:p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">이렇게 쓰면 됩니다</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {steps.map((s) => (
              <span key={s.id} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
                {s.label}
              </span>
            ))}
          </div>
        </section>

        {(loading || ocrLoading) && !result ? (
          <section className="mt-10 animate-pulse space-y-4 rounded-3xl border border-indigo-300/20 bg-gradient-to-br from-slate-900/70 to-indigo-950/40 p-5 shadow-2xl sm:p-6">
            <div className="h-3 w-24 rounded bg-slate-700/80" />
            <div className="h-7 w-96 max-w-full rounded bg-slate-700/70" />
            <div className="h-4 w-full rounded bg-slate-800/70" />
            <div className="h-4 w-5/6 rounded bg-slate-800/70" />
            <div className="rounded-2xl bg-slate-800/70 p-4">
              <div className="h-4 w-20 rounded bg-slate-700/70" />
              <div className="mt-3 h-20 rounded bg-slate-700/50" />
            </div>
            <p className="text-sm text-indigo-200">장면의 감정을 해석하고 OST를 준비하는 중입니다...</p>
          </section>
        ) : null}

        {!result && error ? (
          <section className="mt-10 rounded-2xl border border-rose-400/35 bg-rose-500/12 p-5 text-sm text-rose-100 shadow-lg shadow-rose-900/20">
            결과 생성 중 문제가 발생했습니다. 입력 내용을 확인하고 다시 시도해 주세요.
          </section>
        ) : null}

        {result ? (
          <section
            className={`mt-10 space-y-5 rounded-3xl border bg-gradient-to-br p-5 shadow-2xl sm:p-6 md:p-7 ${emotionUi?.accentSectionClass}`}
          >
            <header className="space-y-2.5">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-indigo-200">AI 분석 결과</p>
              <h2 className="text-2xl font-extrabold leading-tight text-white sm:text-3xl">이 장면에 맞는 OST를 준비했습니다.</h2>
              <p className="max-w-3xl text-sm leading-6 text-slate-300">
                입력한 문장의 감정과 분위기를 바탕으로 현재 장면에 어울리는 오디오를 선택했습니다.
              </p>
            </header>

            <div className={`rounded-2xl border bg-gradient-to-r p-4 ${emotionUi?.accentHeroClass}`}>
              <div className="flex flex-wrap items-center gap-2.5">
                <span className={`inline-flex items-center rounded-full border px-3.5 py-1.5 text-sm font-bold ${emotionUi?.badgeClass}`}>
                  {result.moodLabel}
                </span>
                <span className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-slate-200">
                  Mock OST
                </span>
              </div>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-100">{result.description}</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">장면 해석: {result.sceneInterpretation}</p>
            </div>

            <div className="rounded-2xl bg-slate-800/70 p-4">
              <p className="text-sm font-semibold text-slate-100">분석 요약</p>
              <div className="mt-3 grid gap-2.5 text-sm leading-6 text-slate-200 sm:grid-cols-2">
                <p>
                  감정 라벨:
                  <span className="ml-2 inline-flex items-center rounded-full bg-indigo-500/25 px-2.5 py-0.5 text-xs font-semibold text-indigo-100">
                    {result.moodLabel}
                  </span>
                </p>
                <p>
                  프리셋:
                  <span className="ml-2 font-semibold text-white">{result.selectedPresetEmotion}</span>
                </p>
                <p>분석 신뢰도: {(result.score * 100).toFixed(0)}%</p>
                <p>키워드: {result.keywords.length ? result.keywords.join(", ") : "기본 규칙(calm)"}</p>
                <p>
                  선택된 OST: <span className="font-semibold text-white">{result.ostTitle}</span>
                </p>
                <p>
                  템포/에너지:
                  <span className="ml-2 font-semibold text-white">
                    {result.scene.tempo} / {result.scene.energy}
                  </span>
                </p>
                <p>
                  톤/배경:
                  <span className="ml-2 font-semibold text-white">
                    {result.scene.tone} / {result.scene.setting}
                  </span>
                </p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2.5 border-t border-white/10 pt-4">
                {result.tags.map((tag) => (
                  <span key={tag} className={`rounded-full border px-3 py-1 text-xs ${emotionUi?.accentTagClass}`}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <div className="rounded-2xl bg-slate-800/70 p-4 sm:p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">오늘의 독서 OST</p>
              <p className="mt-1 text-sm font-semibold text-white">{result.ostTitle}</p>
              <p className="mt-1 text-xs text-slate-400">장면의 감정과 분위기를 반영한 추천 오디오입니다.</p>
              <div className="mt-3 rounded-lg border border-indigo-300/20 bg-indigo-500/10 px-3 py-2 text-xs text-indigo-100">
                구성 모드: {result.mixMode === "layers" ? "텍스트 기반 레이어 믹스" : "단일 프리셋 fallback"}
              </div>
              {result.mixMode === "layers" ? (
                <div className="mt-3 rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-xs text-slate-200">
                  {LAYER_ORDER.map((layerType) => {
                    const layerUrl = result.layers[layerType];
                    if (!layerUrl) return null;
                    return (
                      <p key={layerType}>
                        {layerType}: <span className="text-slate-100">{layerUrl}</span>
                      </p>
                    );
                  })}
                </div>
              ) : null}
              {!result.isAudioReady ? (
                <div className="mt-3 rounded-lg border border-amber-300/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                  Mock OST 프리셋만 연결된 상태입니다. 실제 재생을 위해 `public/audio`에 mp3 파일을 추가해 주세요.
                </div>
              ) : null}
              <div className="mt-3 rounded-xl border border-white/10 bg-slate-900/60 p-2 sm:p-3">
                <audio
                  ref={audioRef}
                  key={playbackUrl ?? result.audioUrl}
                  controls
                  autoPlay
                  className="w-full"
                  src={playbackUrl ?? result.audioUrl}
                  onError={() => {
                    setAudioNotice("오디오 파일을 찾지 못했습니다. public/audio 폴더의 mp3 파일을 확인해 주세요.");
                  }}
                />
              </div>
              {mixingAudio ? <p className="mt-2 text-xs text-indigo-300">레이어 오디오를 합성하고 있습니다...</p> : null}
              {audioNotice ? <p className="mt-2 text-xs text-amber-300">{audioNotice}</p> : null}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}

