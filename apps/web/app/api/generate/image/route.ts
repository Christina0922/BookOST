import { NextResponse } from "next/server";

const BACKEND_BASE = process.env.BOOKOST_API_URL;

export async function POST(req: Request) {
  if (!BACKEND_BASE) {
    return NextResponse.json(
      {
        detail:
          "Server misconfigured: BOOKOST_API_URL is missing. Set it in Vercel project environment variables.",
      },
      { status: 500 },
    );
  }

  const incoming = await req.formData();
  const file = incoming.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ detail: "file is required" }, { status: 400 });
  }

  const out = new FormData();
  out.append("file", file, file.name);
  const duration = incoming.get("target_duration_sec");
  if (typeof duration === "string" && duration.trim()) out.append("target_duration_sec", duration);

  const upstream = `${BACKEND_BASE.replace(/\/$/, "")}/v1/generate/image`;
  const res = await fetch(upstream, {
    method: "POST",
    body: out,
    cache: "no-store",
  });

  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") ?? "application/json" },
  });
}
