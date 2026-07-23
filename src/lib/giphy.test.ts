import { describe, expect, it } from "vitest";
import {
  GIPHY_CONTENT_RATING,
  GIPHY_PAGE_SIZE,
  buildGiphyRequestUrl,
  isGiphyMediaUrl,
  mapGiphyResponse,
} from "./giphy";

describe("buildGiphyRequestUrl", () => {
  it("targets the search endpoint with query, lang and rating", () => {
    const url = new URL(buildGiphyRequestUrl({ apiKey: "k", kind: "gifs", query: "כלב", offset: 24, lang: "he" }));
    expect(url.origin + url.pathname).toBe("https://api.giphy.com/v1/gifs/search");
    expect(url.searchParams.get("q")).toBe("כלב");
    expect(url.searchParams.get("lang")).toBe("he");
    expect(url.searchParams.get("offset")).toBe("24");
    expect(url.searchParams.get("rating")).toBe(GIPHY_CONTENT_RATING);
    expect(url.searchParams.get("limit")).toBe(String(GIPHY_PAGE_SIZE));
    expect(url.searchParams.get("api_key")).toBe("k");
  });

  it("falls back to trending when the query is empty, without q/lang params", () => {
    const url = new URL(buildGiphyRequestUrl({ apiKey: "k", kind: "stickers", query: "   ", offset: 0, lang: "he" }));
    expect(url.origin + url.pathname).toBe("https://api.giphy.com/v1/stickers/trending");
    expect(url.searchParams.has("q")).toBe(false);
    expect(url.searchParams.has("lang")).toBe(false);
  });
});

describe("mapGiphyResponse", () => {
  const gif = (id: string) => ({
    id,
    title: `gif ${id}`,
    images: {
      fixed_width: { url: `https://media1.giphy.com/${id}/200w.gif`, width: "200", height: "150" },
      downsized_medium: { url: `https://media1.giphy.com/${id}/giphy.gif` },
    },
  });

  it("maps items and pagination into the picker shape", () => {
    const result = mapGiphyResponse({
      data: [gif("a"), gif("b")],
      pagination: { total_count: 100, count: 2, offset: 0 },
    });
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toEqual({
      id: "a",
      title: "gif a",
      preview_url: "https://media1.giphy.com/a/200w.gif",
      preview_width: 200,
      preview_height: 150,
      media_url: "https://media1.giphy.com/a/giphy.gif",
    });
    expect(result.hasMore).toBe(true);
  });

  it("reports no more pages when the offset window covers the total", () => {
    const result = mapGiphyResponse({ data: [gif("a")], pagination: { total_count: 1, count: 1, offset: 0 } });
    expect(result.hasMore).toBe(false);
  });

  it("drops items missing a usable rendition and survives malformed payloads", () => {
    const broken = { id: "x", images: {} };
    expect(mapGiphyResponse({ data: [broken, gif("ok")] }).items.map((i) => i.id)).toEqual(["ok"]);
    expect(mapGiphyResponse(null).items).toEqual([]);
    expect(mapGiphyResponse({ data: "nope" }).items).toEqual([]);
  });
});

describe("isGiphyMediaUrl", () => {
  it("accepts giphy media CDN hosts only", () => {
    expect(isGiphyMediaUrl("https://media2.giphy.com/media/abc/giphy.gif")).toBe(true);
    expect(isGiphyMediaUrl("https://giphy.com/gifs/abc")).toBe(true);
    expect(isGiphyMediaUrl("https://evil.com/giphy.com/x.gif")).toBe(false);
    expect(isGiphyMediaUrl("https://notgiphy.com/a.gif")).toBe(false);
    expect(isGiphyMediaUrl("data:image/png;base64,xxx")).toBe(false);
    expect(isGiphyMediaUrl(null)).toBe(false);
  });
});
