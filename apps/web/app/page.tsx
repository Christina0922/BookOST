"use client";

import { useEffect, useRef, useState } from "react";
import type { GenerateOstResponse, GenerateOstSuccess } from "@/types/ost";
import { EXAMPLE_SCENE_EN, EXAMPLE_SCENE_KO, PAGE_COPY } from "@/lib/marketingCopy";

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const RESIZE_TRIGGER_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_SIDE = 2200;

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
  type PipelineStage = "idle" | "analyzing" | "generating" | "ready";
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [pipelineStage, setPipelineStage] = useState<PipelineStage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateOstSuccess | null>(null);
  const [audioNotice, setAudioNotice] = useState<string | null>(null);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [mixingAudio, setMixingAudio] = useState(false);
  const lastBlobUrlRef = useRef<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const emotionUi = result ? getEmotionVisual(result.emotion) : null;
  const pipelineProgress =
    pipelineStage === "idle" ? 0 : pipelineStage === "analyzing" ? 33 : pipelineStage === "generating" ? 72 : 100;

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

  function midiToFrequency(midi: number): number {
    return 440 * 2 ** ((midi - 69) / 12);
  }

  function waveformForInstrument(instrument: string): OscillatorType {
    if (instrument === "soft_pad" || instrument === "dark_pad" || instrument === "ambient_noise") return "triangle";
    if (instrument === "bass" || instrument === "low_strings") return "sawtooth";
    if (instrument === "perc" || instrument === "percussion" || instrument === "light_percussion") return "square";
    if (instrument === "pluck" || instrument === "pulse_synth" || instrument === "bell") return "square";
    if (instrument === "piano") return "triangle";
    return "sine";
  }

  async function renderGeneratedTrack(data: GenerateOstSuccess): Promise<string> {
    const durationSec = Math.max(8, data.musicParameters.duration_sec);
    const sampleRate = 44100;
    const offline = new OfflineAudioContext(2, Math.ceil(durationSec * sampleRate), sampleRate);
    const notes = data.generated.notes;
    const masterGain = offline.createGain();
    masterGain.gain.value = 0.78;
    masterGain.connect(offline.destination);

    for (const note of notes) {
      const osc = offline.createOscillator();
      const gain = offline.createGain();
      const start = Math.max(0, note.start_sec);
      const end = Math.min(durationSec, note.start_sec + Math.max(0.03, note.duration_sec));
      if (end <= start) continue;

      osc.type = waveformForInstrument(note.instrument);
      osc.frequency.value = midiToFrequency(note.midi);
      if (note.instrument === "bass" || note.instrument === "low_strings") {
        osc.detune.value = -7;
      }

      const amp = Math.min(0.3, Math.max(0.04, note.velocity / 420));
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(amp, start + 0.01);
      gain.gain.linearRampToValueAtTime(amp * 0.75, start + (end - start) * 0.6);
      gain.gain.linearRampToValueAtTime(0.0001, end);

      osc.connect(gain).connect(masterGain);
      osc.start(start);
      osc.stop(end + 0.02);
    }

    const rendered = await offline.startRendering();
    const wav = bufferToWav(rendered);
    return URL.createObjectURL(new Blob([wav], { type: "audio/wav" }));
  }

  async function preparePlayback(data: GenerateOstSuccess) {
    if (lastBlobUrlRef.current) {
      URL.revokeObjectURL(lastBlobUrlRef.current);
      lastBlobUrlRef.current = null;
    }

    if (data.mixMode === "generated" && data.generated.notes.length > 0) {
      setMixingAudio(true);
      try {
        const mixedUrl = await renderGeneratedTrack(data);
        lastBlobUrlRef.current = mixedUrl;
        setPlaybackUrl(mixedUrl);
      } catch {
        setPlaybackUrl(data.audioUrl);
        setAudioNotice("생성 트랙 렌더링에 실패해 fallback 오디오로 재생합니다.");
      } finally {
        setMixingAudio(false);
      }
      return;
    }

    setPlaybackUrl(data.audioUrl);
  }

  async function runGenerate(trimmed: string) {
    setLoading(true);
    setPipelineStage("analyzing");
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

      setPipelineStage("generating");
      await preparePlayback(data);
      setResult(data);
      setPipelineStage("ready");
      queueMicrotask(() => {
        if (!audioRef.current) return;
        audioRef.current
          .play()
          .then(() => setAudioNotice(null))
          .catch(() => setAudioNotice("브라우저 정책으로 자동 재생이 제한될 수 있어요. 플레이 버튼을 눌러주세요."));
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류가 발생했습니다.");
      setPipelineStage("idle");
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
    setPipelineStage("idle");
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
    setPipelineStage("idle");

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
      setAudioNotice("텍스트가 입력창에 반영되었습니다. OST 만들기를 눌러 주세요.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "이미지 인식 중 오류가 발생했습니다.");
    } finally {
      setOcrLoading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-indigo-950/90 to-slate-950 text-slate-100">
      <div className="mx-auto w-full max-w-3xl px-5 py-14 sm:px-8 sm:py-20 md:max-w-4xl">
        {/* [1] Hero */}
        <header className="mx-auto mb-14 max-w-3xl text-center sm:mb-16">
          <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.28em] text-indigo-300/90 sm:text-xs">
            {PAGE_COPY.brand}
          </p>
          <div className="mb-6 flex flex-wrap items-center justify-center gap-2">
            <span className="inline-flex items-center rounded-full border-2 border-indigo-400/50 bg-indigo-500/20 px-4 py-1.5 text-sm font-bold tracking-wide text-white shadow-lg shadow-indigo-500/20">
              {PAGE_COPY.badgeLang}
            </span>
            <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-slate-300">
              {PAGE_COPY.heroTaglineEn}
            </span>
          </div>
          <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl md:text-5xl lg:text-[2.75rem] lg:leading-[1.12]">
            이 문장은 ‘소리’가 없습니다
            <br />
            <span className="bg-gradient-to-r from-indigo-300 to-violet-300 bg-clip-text text-transparent">
              우리는 장면을 재생합니다
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl whitespace-pre-line text-base leading-relaxed text-slate-300 sm:text-lg">
            {PAGE_COPY.heroSub}
          </p>
        </header>

        {/* Flow: Input → Generate → Listen */}
        <div className="mb-10 grid grid-cols-1 gap-4 sm:mb-12 sm:grid-cols-3 sm:gap-6">
          {PAGE_COPY.flowSteps.map((s) => (
            <div
              key={s.step}
              className="flex flex-col items-center rounded-2xl border border-white/10 bg-slate-900/30 px-4 py-4 text-center sm:py-5"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-indigo-400/50 bg-indigo-500/25 text-sm font-bold text-indigo-50">
                {s.step}
              </span>
              <p className="mt-3 font-semibold text-white">{s.title}</p>
              <p className="mt-1 text-xs text-slate-400">{s.subtitle}</p>
            </div>
          ))}
        </div>

        {/* [2] Input card + [3] CTA + [4] examples */}
        <section className="rounded-3xl border border-white/10 bg-white/[0.06] p-6 shadow-2xl shadow-black/40 backdrop-blur-md sm:p-8">
          <div className="mb-6">
            <label className="block text-sm font-semibold tracking-wide text-white" htmlFor="scene-text">
              {PAGE_COPY.sceneTextLabel}
            </label>
            <p className="mt-1 text-sm text-indigo-200/90">{PAGE_COPY.sceneTextHint}</p>
            <textarea
              id="scene-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              placeholder={PAGE_COPY.sceneTextPlaceholder}
              className="mt-4 min-h-[200px] w-full resize-y rounded-2xl border-2 border-slate-600/80 bg-slate-950/70 px-5 py-4 text-base leading-relaxed text-slate-100 shadow-inner outline-none ring-0 transition placeholder:text-slate-500 focus:border-indigo-400 focus:bg-slate-950/90 focus:shadow-[0_0_0_4px_rgba(129,140,248,0.25)]"
            />
          </div>

          <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-3">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Try an example</span>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                onClick={() => {
                  setText(EXAMPLE_SCENE_KO);
                  setError(null);
                }}
                className="rounded-xl border border-white/10 bg-slate-800/80 px-4 py-2.5 text-left text-sm text-slate-200 transition hover:border-indigo-400/50 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
              >
                <span className="font-medium text-indigo-200">한국어</span>
                <span className="mt-0.5 line-clamp-2 block text-xs text-slate-400">비·네온·추격 분위기</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setText(EXAMPLE_SCENE_EN);
                  setError(null);
                }}
                className="rounded-xl border border-white/10 bg-slate-800/80 px-4 py-2.5 text-left text-sm text-slate-200 transition hover:border-indigo-400/50 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
              >
                <span className="font-medium text-indigo-200">English</span>
                <span className="mt-0.5 line-clamp-2 block text-xs text-slate-400">Rain, neon, tension</span>
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-white/5 bg-slate-950/40 p-4 sm:p-5">
            <p className="text-sm font-medium text-slate-200">{PAGE_COPY.ocrTitle}</p>
            <p className="mt-1 text-xs text-slate-400">{PAGE_COPY.ocrHint}</p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="mt-3 block w-full cursor-pointer rounded-xl border border-slate-600/80 bg-slate-900/80 px-3 py-2.5 text-sm text-slate-200 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-500 file:px-4 file:py-2 file:text-xs file:font-semibold file:text-white hover:border-indigo-400/60"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onImageSelected(f);
              }}
            />
          </div>

          <button
            type="button"
            onClick={onGenerate}
            disabled={loading || ocrLoading || !text.trim()}
            className="mt-8 w-full rounded-2xl bg-gradient-to-r from-indigo-500 via-violet-500 to-indigo-600 px-8 py-4 text-lg font-bold text-white shadow-xl shadow-indigo-600/35 transition hover:scale-[1.02] hover:shadow-indigo-500/45 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-45 disabled:shadow-none sm:py-5 sm:text-xl"
          >
            {loading ? PAGE_COPY.ctaLoading : PAGE_COPY.ctaPrimary}
          </button>

          {ocrLoading ? <p className="mt-4 text-center text-sm text-indigo-200">OCR 처리 중…</p> : null}
          {loading ? <p className="mt-4 text-center text-sm text-indigo-200">장면 분석 및 생성 중…</p> : null}
          {error ? (
            <div className="mt-4 rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-center text-sm text-rose-100">
              {error}
            </div>
          ) : null}
        </section>

        {/* [5] Feature cards */}
        <section className="mt-14 sm:mt-16">
          <div className="grid gap-4 sm:grid-cols-3">
            {PAGE_COPY.featureCards.map((c) => (
              <article
                key={c.id}
                className="rounded-2xl border border-white/10 bg-slate-900/35 p-5 text-center shadow-lg backdrop-blur-sm transition hover:border-indigo-400/30 hover:bg-slate-900/50"
              >
                <h3 className="text-base font-bold text-white">{c.title}</h3>
                <p className="mt-0.5 text-xs font-medium uppercase tracking-wider text-indigo-300/90">{c.titleEn}</p>
                <p className="mt-3 text-sm leading-relaxed text-slate-400">{c.body}</p>
              </article>
            ))}
          </div>
        </section>

        <p className="mt-10 text-center text-xs text-slate-500">{PAGE_COPY.footerPrivacy}</p>

        {(loading || ocrLoading) && !result ? (
          <section className="mt-12 animate-pulse space-y-4 rounded-3xl border border-indigo-400/20 bg-slate-900/50 p-8">
            <div className="mx-auto h-3 w-32 rounded-full bg-slate-700" />
            <div className="mx-auto h-8 max-w-md rounded-lg bg-slate-700/80" />
            <div className="h-4 rounded bg-slate-800" />
            <div className="h-4 w-11/12 rounded bg-slate-800" />
          </section>
        ) : null}

        {!result && error ? (
          <section className="mt-12 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-6 text-center text-sm text-rose-100">
            다시 시도해 주세요.
          </section>
        ) : null}

        {/* [6] Results */}
        {result ? (
          <section
            className={`mt-14 space-y-6 rounded-3xl border bg-gradient-to-br p-6 shadow-2xl sm:mt-16 sm:p-8 ${emotionUi?.accentSectionClass}`}
          >
            <div className="text-center">
              <h2 className="text-xl font-bold text-white sm:text-2xl">{PAGE_COPY.resultTitle}</h2>
              <p className="mt-1 text-sm text-slate-400">{PAGE_COPY.resultSubtitle}</p>
              <div className="mx-auto mt-4 h-1.5 max-w-xs overflow-hidden rounded-full bg-slate-800/80">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-emerald-400 transition-all duration-500"
                  style={{ width: `${pipelineProgress}%` }}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <article className="rounded-2xl border border-white/10 bg-slate-950/50 p-5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-200">{PAGE_COPY.cardScene}</h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-100">{result.scene_summary}</p>
              </article>

              <article className="rounded-2xl border border-white/10 bg-slate-950/50 p-5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-200">{PAGE_COPY.cardEmotion}</h3>
                <ul className="mt-3 space-y-2">
                  {Object.entries(result.emotion_weights).map(([emotion, weight]) => (
                    <li key={emotion} className="flex items-center gap-2 text-sm">
                      <span className="w-24 shrink-0 capitalize text-slate-400">{emotion}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
                        <div
                          className="h-full rounded-full bg-indigo-400/80"
                          style={{ width: `${Math.min(100, weight * 100)}%` }}
                        />
                      </div>
                      <span className="w-10 text-right text-xs text-slate-400">{weight}</span>
                    </li>
                  ))}
                </ul>
              </article>

              <article className="rounded-2xl border border-white/10 bg-slate-950/50 p-5 sm:col-span-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-200">{PAGE_COPY.cardPlayer}</h3>
                <div className="mt-4 rounded-xl border border-white/10 bg-slate-900/70 p-3 sm:p-4">
                  <audio
                    ref={audioRef}
                    key={playbackUrl ?? result.audioUrl}
                    controls
                    autoPlay
                    className="w-full"
                    src={playbackUrl ?? result.audioUrl}
                    onError={() => {
                      setAudioNotice("오디오를 재생하지 못했습니다. 잠시 후 다시 시도해 주세요.");
                    }}
                  />
                </div>
                {mixingAudio ? <p className="mt-2 text-xs text-indigo-300">오디오 렌더링 중…</p> : null}
                {audioNotice ? <p className="mt-2 text-xs text-amber-200">{audioNotice}</p> : null}
              </article>

              <article className="rounded-2xl border border-white/10 bg-slate-950/50 p-5 sm:col-span-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">{PAGE_COPY.cardParams}</h3>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <div className="flex justify-between gap-4 border-b border-white/5 pb-2 sm:block sm:border-0 sm:pb-0">
                    <dt className="text-slate-500">Tempo</dt>
                    <dd className="font-medium text-white">{result.musicParameters.tempo_bpm} bpm</dd>
                  </div>
                  <div className="flex justify-between gap-4 border-b border-white/5 pb-2 sm:block sm:border-0 sm:pb-0">
                    <dt className="text-slate-500">Key / mode</dt>
                    <dd className="font-medium text-white">
                      {result.musicParameters.key} {result.musicParameters.mode}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4 border-b border-white/5 pb-2 sm:block sm:border-0 sm:pb-0">
                    <dt className="text-slate-500">BGM preset</dt>
                    <dd className="font-mono text-xs text-indigo-200">{result.musicParameters.music_scene_preset}</dd>
                  </div>
                  <div className="flex justify-between gap-4 border-b border-white/5 pb-2 sm:block sm:border-0 sm:pb-0">
                    <dt className="text-slate-500">Feel / env</dt>
                    <dd className="text-slate-200">
                      {result.musicParameters.time_feel} · {result.musicParameters.environment}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4 sm:col-span-2 sm:block">
                    <dt className="text-slate-500">Intensity</dt>
                    <dd className="font-medium text-white">{result.musicParameters.intensity.toFixed(2)}</dd>
                  </div>
                </dl>
              </article>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
