import { NextResponse } from "next/server";
import { buildYouTubeRequestUrl, mapYouTubeResponse } from "@/lib/youtube";

/**
 * Server-side proxy for YouTube Data API v3 search / most-popular.
 *
 * Same pattern as `/api/giphy`: the browser never sees `YOUTUBE_API_KEY`;
 * this route signs the upstream request, pins strict safe-search (set in the
 * URL builder) and clamps client parameters. Pasting a video link in the
 * picker bypasses this route entirely, so the feature still works without a
 * key — only search is gated on it.
 */

export async function GET(request: Request) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "youtube_not_configured" }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("q") ?? "").slice(0, 100);
  const lang = searchParams.get("lang") === "he" ? "he" : "en";
  // Page tokens are short, opaque, URL-safe strings issued by the API.
  const rawToken = searchParams.get("pageToken") ?? "";
  const pageToken = /^[A-Za-z0-9_-]{1,64}$/.test(rawToken) ? rawToken : null;

  let upstream: Response;
  try {
    upstream = await fetch(buildYouTubeRequestUrl({ apiKey, query, pageToken, lang }), {
      // Search costs 100 quota units per call — cache identical requests
      // briefly so a room full of participants doesn't burn quota in unison.
      next: { revalidate: query ? 60 : 300 },
    });
  } catch {
    return NextResponse.json({ error: "youtube_unreachable" }, { status: 502 });
  }
  if (!upstream.ok) {
    return NextResponse.json({ error: "youtube_upstream_error" }, { status: 502 });
  }

  const payload = await upstream.json().catch(() => null);
  return NextResponse.json(mapYouTubeResponse(payload), {
    headers: { "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300" },
  });
}
