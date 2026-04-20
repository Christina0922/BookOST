import type { GenerateResponse } from "./types";

const WEB_API_BASE = "/api";

type ApiErr = { detail?: string };

async function parseError(res: Response): Promise<never> {
  let message = `Request failed (${res.status})`;
  try {
    const data = (await res.json()) as ApiErr;
    if (data?.detail) message = data.detail;
  } catch {
    const text = await res.text().catch(() => "");
    if (text) message = text;
  }
  throw new Error(message);
}

export async function generateOst(text: string, targetDurationSec?: number): Promise<GenerateResponse> {
  const res = await fetch(`${WEB_API_BASE}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      target_duration_sec: targetDurationSec,
    }),
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as GenerateResponse;
}

export async function generateOstFromImage(file: File, targetDurationSec?: number): Promise<GenerateResponse> {
  const fd = new FormData();
  fd.append("file", file);
  if (targetDurationSec != null) fd.append("target_duration_sec", String(targetDurationSec));

  const res = await fetch(`${WEB_API_BASE}/generate/image`, {
    method: "POST",
    body: fd,
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as GenerateResponse;
}
