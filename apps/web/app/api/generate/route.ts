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

  const body = await req.text();
  const upstream = `${BACKEND_BASE.replace(/\/$/, "")}/v1/generate/`;
  const res = await fetch(upstream, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    cache: "no-store",
  });

  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") ?? "application/json" },
  });
}
