"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GenerateOstResponse, GenerateOstSuccess } from "@/types/ost";

const SAMPLE =
  "밤비가 창문을 두드렸다. 네온 불빛 아래, 그는 마지막 단서를 손에 쥐고 숨을 죽였다. 골목 끝에서 발소리가 다가왔다.";
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
  const [text, setText] = useState(SAMPLE);
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

  const steps = useMemo(
    () => [
      { id: "in", label: "글·이미지 넣기" },
      { id: "gen", label: "OST 만들기" },
      { id: "listen", label: "듣기·공유" },
    ],
    [],
  );
  const emotionUi = result ? getEmotionVisual(result.emotion) : null;
  const pipelineProgress = pipelineStage === "idle" ? 0 : pipelineStage === "analyzing" ? 33 : pipelineStage === "generating" ? 72 : 100;

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
    if (instrument === "bass") return "sawtooth";
    if (instrument === "perc" || instrument === "percussion" || instrument === "light_percussion") return "square";
    if (instrument === "pluck" || instrument === "pulse_synth" || instrument === "bell") return "square";
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
      if (note.instrument === "bass") {
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
      setAudioNotice("이미지 텍스트를 입력창에 반영했습니다. 'OST 만들기'를 눌러 생성하세요.");
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

          <div className="space-y-3">
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-200">이미지 업로드 (OCR)</span>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="block w-full cursor-pointer rounded-xl border border-slate-600 bg-slate-900/70 px-3 py-2 text-sm text-slate-200 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-500 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:border-indigo-400"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onImageSelected(f);
                }}
              />
            </label>
            <button
              type="button"
              onClick={onGenerate}
              disabled={loading || ocrLoading || !text.trim()}
              className="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-6 py-3.5 text-base font-bold text-white shadow-lg shadow-indigo-500/30 transition hover:-translate-y-0.5 hover:from-indigo-400 hover:to-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "장면을 분석하고 OST를 준비하는 중입니다..." : "OST 만들기"}
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
          <section className={`mt-10 space-y-5 rounded-3xl border bg-gradient-to-br p-5 shadow-2xl sm:p-6 md:p-7 ${emotionUi?.accentSectionClass}`}>
            <header className="space-y-2.5">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-indigo-200">해석 → 생성 결과</p>
              <h2 className="text-2xl font-extrabold leading-tight text-white sm:text-3xl">입력 문장을 분석하고 바로 OST를 생성했습니다.</h2>
              <p className="max-w-3xl text-sm leading-6 text-slate-300">입력 → 분석 → 생성 → 재생 흐름이 한 번에 이어집니다.</p>
            </header>

            <div className="grid gap-4 lg:grid-cols-2">
              <section className="rounded-2xl border border-white/10 bg-slate-900/55 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-indigo-200">[A] Scene Analysis</p>
                <div className="mt-2 flex items-center gap-2 text-xs">
                  <span className={`rounded-full px-2 py-0.5 ${pipelineStage === "analyzing" ? "animate-pulse bg-indigo-500/35 text-indigo-100" : "bg-slate-700/60 text-slate-300"}`}>
                    Analyzing
                  </span>
                  <span className={`rounded-full px-2 py-0.5 ${pipelineStage === "ready" || pipelineStage === "generating" ? "bg-emerald-500/30 text-emerald-100" : "bg-slate-700/60 text-slate-300"}`}>
                    {pipelineStage === "idle" ? "Pending" : "Done"}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-100">장면 해석 요약: {result.scene_summary}</p>
                <p className="mt-1 text-xs text-slate-300">
                  복합 감정 분포:{" "}
                  {Object.entries(result.emotion_weights)
                    .map(([emotion, weight]) => `${emotion}:${weight}`)
                    .join(" | ")}
                </p>
                <p className="mt-1 text-xs text-slate-300">장면 유형: {result.scene_type}</p>
                <p className="mt-1 text-xs text-slate-300">tone: {result.tone}</p>
                <p className="mt-2 text-sm text-slate-200">{result.explanation}</p>
              </section>

              <section className="rounded-2xl border border-white/10 bg-slate-900/55 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-200">[B] Generated OST</p>
                <div className="mt-2 flex items-center gap-2 text-xs">
                  <span className={`rounded-full px-2 py-0.5 ${pipelineStage === "generating" ? "animate-pulse bg-violet-500/35 text-violet-100" : "bg-slate-700/60 text-slate-300"}`}>
                    Generating
                  </span>
                  <span className={`rounded-full px-2 py-0.5 ${pipelineStage === "ready" ? "bg-emerald-500/30 text-emerald-100" : "bg-slate-700/60 text-slate-300"}`}>
                    {pipelineStage === "ready" ? "Ready" : "Pending"}
                  </span>
                </div>
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-700/70">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r from-indigo-400 via-violet-400 to-emerald-400 transition-all duration-500 ${pipelineStage !== "idle" && pipelineStage !== "ready" ? "animate-pulse" : ""}`}
                    style={{ width: `${pipelineProgress}%` }}
                  />
                </div>
                <p className="mt-2 text-sm text-slate-100">30초 생성 음악 (scene-based loop)</p>
                <p className="mt-1 text-xs text-emerald-300">Generated from analysis</p>
                <p className="mt-2 text-xs text-slate-300">
                  tempo: {result.musicParameters.tempo_bpm} bpm · key/mode: {result.musicParameters.key}/{result.musicParameters.mode}
                </p>
                <div className="mt-3 rounded-xl border border-white/10 bg-slate-900/60 p-2 sm:p-3">
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
                {mixingAudio ? <p className="mt-2 text-xs text-indigo-300">생성된 MIDI 파라미터를 오디오로 렌더링하고 있습니다...</p> : null}
                {audioNotice ? <p className="mt-2 text-xs text-amber-300">{audioNotice}</p> : null}
              </section>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}

