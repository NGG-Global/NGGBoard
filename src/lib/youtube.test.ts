import { describe, expect, it } from "vitest";
import {
  YOUTUBE_PAGE_SIZE,
  buildYouTubeRequestUrl,
  mapYouTubeResponse,
  parseYouTubeVideoId,
  youTubeEmbedUrl,
  youTubeThumbnailUrl,
  youTubeWatchUrl,
} from "./youtube";

const ID = "dQw4w9WgXcQ";

describe("parseYouTubeVideoId", () => {
  it("parses all common URL forms", () => {
    expect(parseYouTubeVideoId(`https://www.youtube.com/watch?v=${ID}`)).toBe(ID);
    expect(parseYouTubeVideoId(`https://www.youtube.com/watch?v=${ID}&t=42s`)).toBe(ID);
    expect(parseYouTubeVideoId(`https://youtu.be/${ID}?si=abc`)).toBe(ID);
    expect(parseYouTubeVideoId(`https://m.youtube.com/watch?v=${ID}`)).toBe(ID);
    expect(parseYouTubeVideoId(`https://music.youtube.com/watch?v=${ID}`)).toBe(ID);
    expect(parseYouTubeVideoId(`https://www.youtube.com/shorts/${ID}`)).toBe(ID);
    expect(parseYouTubeVideoId(`https://www.youtube.com/embed/${ID}`)).toBe(ID);
    expect(parseYouTubeVideoId(`https://www.youtube-nocookie.com/embed/${ID}`)).toBe(ID);
    expect(parseYouTubeVideoId(`  https://youtu.be/${ID}  `)).toBe(ID);
  });

  it("rejects non-YouTube URLs, bare ids and malformed ids", () => {
    expect(parseYouTubeVideoId(ID)).toBeNull(); // bare id: could be a search term
    expect(parseYouTubeVideoId("dogs playing chess")).toBeNull();
    expect(parseYouTubeVideoId("https://vimeo.com/12345")).toBeNull();
    expect(parseYouTubeVideoId("https://evil.com/watch?v=" + ID)).toBeNull();
    expect(parseYouTubeVideoId("https://notyoutube.com/watch?v=" + ID)).toBeNull();
    expect(parseYouTubeVideoId("https://www.youtube.com/watch?v=short")).toBeNull();
    expect(parseYouTubeVideoId("https://www.youtube.com/playlist?list=PL123")).toBeNull();
    expect(parseYouTubeVideoId("")).toBeNull();
  });
});

describe("URL builders", () => {
  it("builds canonical watch / embed / thumbnail URLs from an id", () => {
    expect(youTubeWatchUrl(ID)).toBe(`https://www.youtube.com/watch?v=${ID}`);
    expect(youTubeEmbedUrl(ID)).toBe(`https://www.youtube-nocookie.com/embed/${ID}`);
    expect(youTubeEmbedUrl(ID, { autoplay: true })).toBe(`https://www.youtube-nocookie.com/embed/${ID}?autoplay=1`);
    expect(youTubeThumbnailUrl(ID)).toBe(`https://i.ytimg.com/vi/${ID}/hqdefault.jpg`);
  });

  it("targets search.list with strict safe-search when a query is present", () => {
    const url = new URL(buildYouTubeRequestUrl({ apiKey: "k", query: "כלבים", pageToken: null, lang: "he" }));
    expect(url.origin + url.pathname).toBe("https://www.googleapis.com/youtube/v3/search");
    expect(url.searchParams.get("q")).toBe("כלבים");
    expect(url.searchParams.get("safeSearch")).toBe("strict");
    expect(url.searchParams.get("videoEmbeddable")).toBe("true");
    expect(url.searchParams.get("type")).toBe("video");
    expect(url.searchParams.get("relevanceLanguage")).toBe("he");
    expect(url.searchParams.get("maxResults")).toBe(String(YOUTUBE_PAGE_SIZE));
  });

  it("falls back to region most-popular when the query is empty", () => {
    const url = new URL(buildYouTubeRequestUrl({ apiKey: "k", query: " ", pageToken: "TOK", lang: "he" }));
    expect(url.origin + url.pathname).toBe("https://www.googleapis.com/youtube/v3/videos");
    expect(url.searchParams.get("chart")).toBe("mostPopular");
    expect(url.searchParams.get("regionCode")).toBe("IL");
    expect(url.searchParams.get("pageToken")).toBe("TOK");
    expect(url.searchParams.has("q")).toBe(false);
  });
});

describe("mapYouTubeResponse", () => {
  it("maps search.list items (object ids)", () => {
    const result = mapYouTubeResponse({
      items: [{ id: { videoId: ID }, snippet: { title: "T", channelTitle: "C", thumbnails: { medium: { url: "https://i.ytimg.com/x.jpg" } } } }],
      nextPageToken: "NEXT",
    });
    expect(result.items).toEqual([{ id: ID, title: "T", channel: "C", thumbnail_url: "https://i.ytimg.com/x.jpg" }]);
    expect(result.nextPageToken).toBe("NEXT");
  });

  it("maps videos.list items (string ids) and falls back to the CDN thumbnail", () => {
    const result = mapYouTubeResponse({ items: [{ id: ID, snippet: { title: "T", channelTitle: "C" } }] });
    expect(result.items[0]!.thumbnail_url).toBe(youTubeThumbnailUrl(ID));
    expect(result.nextPageToken).toBeNull();
  });

  it("drops items without a valid id and survives malformed payloads", () => {
    expect(mapYouTubeResponse({ items: [{ id: { videoId: "bad" } }, { id: ID, snippet: {} }] }).items.map((i) => i.id)).toEqual([ID]);
    expect(mapYouTubeResponse(null).items).toEqual([]);
    expect(mapYouTubeResponse({ items: "nope" }).items).toEqual([]);
  });
});
