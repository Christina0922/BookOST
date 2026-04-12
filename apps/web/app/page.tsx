"use client";

import { useMemo, useRef, useState } from "react";
import { OstCard } from "@/components/OstCard";
import { generateOst, generateOstFromImage } from "@/lib/api";
import type { GenerateResponse } from "@/lib/types";

const SAMPLE =
  "밤비가 창문을 두드렸다. 네온 불빛 아래, 그는 마지막 단서를 손에 쥐고 숨을 죽였다. 골목 끝에서 발소리가 다가왔다.";

export default function HomePage() {
  const [text, setText] = useState(SAMPLE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const steps = useMemo(
    () => [
      { id: "in", label: "글·이미지 넣기" },
      { id: "gen", label: "OST 만들기" },
      { id: "listen", label: "듣기·공유" },
    ],
    [],
  );

  async function onGenerate() {
    setLoading(true);
    setError(null);
    try {
      const res = await generateOst(text.trim());
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류");
    } finally {
      setLoading(false);
    }
  }

  async function onImageSelected(f: File) {
    setLoading(true);
    setError(null);
    try {
      const res = await generateOstFromImage(f);
      const recognized = res.ocr_text?.trim() || res.artifacts.cleaned_text;
      if (recognized) setText(recognized);
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류");
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const artifacts = result?.artifacts;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-14 lg:flex-row">
      <section className="flex-1 space-y-6">
        <header className="space-y-3">
          <p className="text-sm uppercase tracking-[0.2em] text-indigo-300">BookOST · 독서 OST</p>
          <h1 className="text-4xl font-semibold leading-tight text-white md:text-5xl">
            텍스트를 보여주면
            <span className="text-indigo-300"> 음악이 나옵니다</span>.
          </h1>
          <p className="max-w-xl text-sm text-zinc-400">
            장면을 글로 붙여 넣거나, 스크린샷·사진을 올리면 그에 맞는 OST를 바로 들을 수 있습니다. 사진·캡처는 글자만 읽고
            이미지 파일은 서버에 저장하지 않습니다.
          </p>
        </header>

        <label className="block space-y-2 text-sm text-zinc-300">
          장면 텍스트
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            className="w-full rounded-2xl border border-white/10 bg-zinc-900/70 p-4 text-base text-white outline-none ring-indigo-500/40 transition focus:ring-2"
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

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onGenerate}
            disabled={loading || !text.trim()}
            className="rounded-full bg-indigo-500 px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-zinc-700"
          >
            {loading ? "음악 만드는 중…" : "OST 만들기 (원클릭)"}
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={loading}
            className="rounded-full border border-white/20 bg-white/5 px-6 py-3 text-sm font-semibold text-zinc-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "처리 중…" : "사진·스크린샷 → 인식 후 OST"}
          </button>
          <span className="text-xs text-zinc-500">목표 길이 20–40초 · MVP Mock 오디오 포함</span>
        </div>
        <p className="text-xs text-zinc-500">
          사진/스크린샷은 브라우저에서 서버로만 전송되어 OCR에만 쓰이며, 저작권 보호를 위해 이미지 파일을 서버에 저장하지 않습니다.
        </p>

        {error ? (
          <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-100">{error}</div>
        ) : null}

        <div className="rounded-2xl border border-white/5 bg-zinc-900/40 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">이렇게 쓰면 됩니다</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {steps.map((s) => (
              <span key={s.id} className="rounded-full bg-white/5 px-3 py-1 text-xs text-zinc-300">
                {s.label}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="flex-1 space-y-6">
        {artifacts ? (
          <>
            {result?.ocr_text ? (
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-400/90">OCR 인식 결과</p>
                <p className="mt-2 whitespace-pre-wrap text-zinc-100">{result.ocr_text}</p>
              </div>
            ) : null}
            <OstCard card={artifacts.ost_card} prompt={artifacts.music_prompt} jobId={result?.job_id ?? null} />

            <div className="rounded-3xl border border-white/10 bg-zinc-900/60 p-6">
              <p className="text-xs uppercase tracking-wide text-zinc-500">장면 분석</p>
              <pre className="mt-3 overflow-x-auto rounded-2xl bg-black/40 p-4 font-mono text-xs text-zinc-200">
                {JSON.stringify(artifacts.emotion, null, 2)}
              </pre>
              <p className="mt-4 text-xs uppercase tracking-wide text-zinc-500">음악 쪽 설정</p>
              <pre className="mt-3 overflow-x-auto rounded-2xl bg-black/40 p-4 font-mono text-xs text-zinc-200">
                {JSON.stringify(artifacts.condition, null, 2)}
              </pre>
            </div>

            {artifacts.audio_url ? (
              <div className="rounded-3xl border border-white/10 bg-zinc-900/60 p-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">미리듣기</p>
                    <p className="text-xs text-zinc-500">
                      길이 {artifacts.duration_sec ? `${artifacts.duration_sec.toFixed(1)}s` : "—"}
                    </p>
                  </div>
                  {artifacts.download_url ? (
                    <a
                      className="text-sm text-indigo-300 underline-offset-4 hover:underline"
                      href={artifacts.download_url}
                    >
                      다운로드
                    </a>
                  ) : null}
                </div>
                <audio controls className="mt-4 w-full" src={artifacts.audio_url} />
              </div>
            ) : null}
          </>
        ) : (
          <div className="rounded-3xl border border-dashed border-white/15 p-10 text-center text-sm text-zinc-500">
            아직 OST가 없습니다. 왼쪽에 글을 넣거나 사진을 올린 뒤 &ldquo;OST 만들기&rdquo;를 눌러 보세요.
          </div>
        )}
      </section>
    </main>
  );
}
