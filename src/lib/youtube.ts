/**
 * YouTube integration shared between the server proxy route (`/api/youtube`)
 * and the participant video picker.
 *
 * Mirrors the Giphy setup: the Data API key is server-only (`YOUTUBE_API_KEY`,
 * no `NEXT_PUBLIC_` prefix) and only the proxy route talks to Google. Pasting
 * a video link needs no API at all — the video id is parsed locally and the
 * thumbnail comes straight from YouTube's public image CDN.
 *
 * A chosen video is stored as a `video` submission whose media_url is the
 * canonical watch URL. Anything that renders it derives the embed/thumbnail
 * URL from the PARSED 11-character id — never from the raw stored URL — so a
 * crafted media_url can never inject an arbitrary iframe source.
 */

/** Results per page. YouTube search costs 100 quota units per call, so pages are modest. */
export const YOUTUBE_PAGE_SIZE = 12;

export interface YouTubePickerItem {
  /** 11-character YouTube video id. */
  id: string;
  title: string;
  channel: string;
  thumbnail_url: string;
}

export interface YouTubeSearchResult {
  items: YouTubePickerItem[];
  nextPageToken: string | null;
}

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * Extract a video id from any common YouTube URL form (watch, share, shorts,
 * embed, live, mobile/music subdomains). Returns null for anything else —
 * deliberately does NOT accept bare ids, so free-text search terms are never
 * mistaken for a video.
 */
export function parseYouTubeVideoId(input: string): string | null {
  const raw = input.trim();
  if (!/^https?:\/\//i.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\.|^m\.|^music\./, "");
  let candidate: string | null = null;
  if (host === "youtu.be") {
    candidate = url.pathname.split("/")[1] ?? null;
  } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const [, seg1, seg2] = url.pathname.split("/");
    if (seg1 === "watch") candidate = url.searchParams.get("v");
    else if (seg1 === "shorts" || seg1 === "embed" || seg1 === "live" || seg1 === "v") candidate = seg2 ?? null;
  }
  return candidate && VIDEO_ID.test(candidate) ? candidate : null;
}

/** Canonical form stored on the submission. */
export function youTubeWatchUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}

/** Privacy-enhanced embed used on the projector display. */
export function youTubeEmbedUrl(id: string, opts?: { autoplay?: boolean }): string {
  return `https://www.youtube-nocookie.com/embed/${id}${opts?.autoplay ? "?autoplay=1" : ""}`;
}

/** Static thumbnail from YouTube's public image CDN — needs no API key. */
export function youTubeThumbnailUrl(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

/**
 * Build the upstream Data API request. With a query this is `search.list`
 * (100 quota units); with no query it falls back to the region's most popular
 * videos via `videos.list` (1 unit), so the picker's opening screen is cheap.
 */
export function buildYouTubeRequestUrl(params: {
  apiKey: string;
  query: string;
  pageToken: string | null;
  lang: string;
  limit?: number;
}): string {
  const { apiKey, pageToken, lang } = params;
  const query = params.query.trim();
  const limit = String(params.limit ?? YOUTUBE_PAGE_SIZE);
  const url = query
    ? new URL("https://www.googleapis.com/youtube/v3/search")
    : new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("part", "snippet");
  url.searchParams.set("maxResults", limit);
  if (pageToken) url.searchParams.set("pageToken", pageToken);
  if (query) {
    url.searchParams.set("q", query);
    url.searchParams.set("type", "video");
    url.searchParams.set("videoEmbeddable", "true");
    url.searchParams.set("safeSearch", "strict");
    url.searchParams.set("relevanceLanguage", lang);
  } else {
    url.searchParams.set("chart", "mostPopular");
    url.searchParams.set("regionCode", lang === "he" ? "IL" : "US");
  }
  return url.toString();
}

interface YouTubeApiThumbnail {
  url?: string;
}

interface YouTubeApiItem {
  /** `videos.list` returns the id as a string; `search.list` as an object. */
  id?: string | { videoId?: string };
  snippet?: {
    title?: string;
    channelTitle?: string;
    thumbnails?: { medium?: YouTubeApiThumbnail; default?: YouTubeApiThumbnail; high?: YouTubeApiThumbnail };
  };
}

interface YouTubeApiResponse {
  items?: YouTubeApiItem[];
  nextPageToken?: string;
}

/**
 * Reduce a `search.list` or `videos.list` response to the picker shape.
 * Items without a valid id are dropped rather than rendered broken.
 */
export function mapYouTubeResponse(payload: unknown): YouTubeSearchResult {
  const body = (payload ?? {}) as YouTubeApiResponse;
  const data = Array.isArray(body.items) ? body.items : [];
  const items: YouTubePickerItem[] = [];
  for (const entry of data) {
    const id = typeof entry.id === "string" ? entry.id : entry.id?.videoId;
    if (!id || !VIDEO_ID.test(id)) continue;
    const thumbs = entry.snippet?.thumbnails;
    items.push({
      id,
      title: entry.snippet?.title ?? "",
      channel: entry.snippet?.channelTitle ?? "",
      thumbnail_url: thumbs?.medium?.url || thumbs?.high?.url || thumbs?.default?.url || youTubeThumbnailUrl(id),
    });
  }
  return { items, nextPageToken: typeof body.nextPageToken === "string" ? body.nextPageToken : null };
}
