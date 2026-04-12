"use client";

import type { OstCard as OstCardModel } from "@/lib/types";

type Props = {
  card: OstCardModel;
  prompt: string;
  jobId: string | null;
};

export function OstCard({ card, prompt, jobId }: Props) {
  return (
    <div
      className="relative overflow-hidden rounded-3xl border border-white/10 p-8 shadow-card"
      style={{
        background: `linear-gradient(135deg, ${card.accent_color}33, rgba(24,24,27,0.92))`,
      }}
    >
      <div className="absolute inset-0 opacity-40 blur-3xl" style={{ background: card.accent_color }} />
      <div className="relative space-y-4">
        <div className="flex items-center gap-3 text-sm text-zinc-300">
          <span className="text-3xl">{card.mood_emoji}</span>
          <span className="rounded-full bg-white/5 px-3 py-1 font-mono text-xs text-zinc-400">
            {jobId ? `job_${jobId.slice(0, 8)}` : "preview"}
          </span>
        </div>
        <h2 className="text-2xl font-semibold tracking-tight text-white">{card.title}</h2>
        <p className="text-sm text-zinc-300">{card.tagline}</p>
        <p className="text-xs font-medium text-zinc-500">이 곡의 느낌</p>
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-xs leading-relaxed text-emerald-200/90">
          {prompt}
        </div>
        <p className="text-xs text-zinc-500">공유용 카드</p>
      </div>
    </div>
  );
}
