import { NextResponse } from "next/server";

const BACKEND = process.env.BOOKOST_API_URL;

/**
 * Same-origin proxy so the browser can play the FastAPI-generated WAV
 * without CORS issues (the page no longer uses only client-side MIDI).
 */
export async function GET(_req: Request, context: { params: { jobId: string } }) {
  if (!BACKEND) {
    return NextResponse.json({ detail: "BOOKOST_API_URL is not set" }, { status: 500 });
  }
  const { jobId } = context.params;
  if (!jobId || /[^a-f0-9-]/i.test(jobId)) {
    return NextResponse.json({ detail: "Invalid job id" }, { status: 400 });
  }
  const url = `${BACKEND.replace(/\/$/, "")}/v1/audio/${encodeURIComponent(jobId)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    return NextResponse.json(
      { detail: `Upstream audio error (${res.status})` },
      { status: res.status },
    );
  }
  const buf = await res.arrayBuffer();
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": res.headers.get("content-type") ?? "audio/wav",
      "Cache-Control": "no-store",
    },
  });
}
