import type { GenerateResponse } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

export async function generateOst(text: string, targetDurationSec?: number): Promise<GenerateResponse> {
  const res = await fetch(`${API_BASE}/v1/generate/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      target_duration_sec: targetDurationSec,
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || `Request failed (${res.status})`);
  }
  return (await res.json()) as GenerateResponse;
}

export async function generateOstFromImage(file: File, targetDurationSec?: number): Promise<GenerateResponse> {
  const fd = new FormData();
  fd.append("file", file);
  if (targetDurationSec != null) fd.append("target_duration_sec", String(targetDurationSec));

  const res = await fetch(`${API_BASE}/v1/generate/image`, {
    method: "POST",
    body: fd,
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || `Request failed (${res.status})`);
  }
  return (await res.json()) as GenerateResponse;
}
