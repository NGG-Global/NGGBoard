import { NextResponse } from "next/server";
import { buildGiphyRequestUrl, mapGiphyResponse, type GiphyKind } from "@/lib/giphy";

/**
 * Server-side proxy for Giphy search/trending.
 *
 * Exists so the Giphy API key never reaches the browser: participants call
 * `/api/giphy?...` and this route signs the upstream request with the
 * server-only `GIPHY_API_KEY`. It also pins the content rating and clamps all
 * client-supplied parameters.
 */

function clampInt(raw: string | null, min: number, max: number, fallback: number): number {
  const n = Number.parseInt(raw ?? "", 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export async function GET(request: Request) {
  const apiKey = process.env.GIPHY_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "giphy_not_configured" }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const kind: GiphyKind = searchParams.get("kind") === "stickers" ? "stickers" : "gifs";
  const query = (searchParams.get("q") ?? "").slice(0, 100);
  const offset = clampInt(searchParams.get("offset"), 0, 4999, 0);
  const lang = searchParams.get("lang") === "he" ? "he" : "en";

  let upstream: Response;
  try {
    upstream = await fetch(buildGiphyRequestUrl({ apiKey, kind, query, offset, lang }), {
      // Short server-side cache: repeated identical searches within a session
      // (and the trending page every participant opens with) hit Giphy once.
      next: { revalidate: 60 },
    });
  } catch {
    return NextResponse.json({ error: "giphy_unreachable" }, { status: 502 });
  }
  if (!upstream.ok) {
    return NextResponse.json({ error: "giphy_upstream_error" }, { status: 502 });
  }

  const payload = await upstream.json().catch(() => null);
  return NextResponse.json(mapGiphyResponse(payload), {
    headers: { "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300" },
  });
}
