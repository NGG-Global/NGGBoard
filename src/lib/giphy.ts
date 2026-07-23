/**
 * Giphy integration shared between the server proxy route (`/api/giphy`) and
 * the participant picker.
 *
 * The Giphy API key is server-only (`GIPHY_API_KEY`, no `NEXT_PUBLIC_` prefix):
 * the browser talks to our `/api/giphy` route, which builds the upstream
 * request here and forwards a slimmed-down result. Keeping the mapping in a
 * plain module (no React, no fetch) makes it unit-testable.
 */

export type GiphyKind = "gifs" | "stickers";

/** Results per page requested from Giphy and returned to the picker. */
export const GIPHY_PAGE_SIZE = 24;

/** Workplace-appropriate content rating for workshop boards. */
export const GIPHY_CONTENT_RATING = "pg";

/** One selectable item, as consumed by the participant picker. */
export interface GiphyPickerItem {
  id: string;
  /** Accessible label supplied by Giphy (may be empty). */
  title: string;
  /** Small animated preview for the picker grid (`fixed_width`, 200px wide). */
  preview_url: string;
  preview_width: number;
  preview_height: number;
  /** The URL stored on the submission and shown on the board. */
  media_url: string;
}

export interface GiphySearchResult {
  items: GiphyPickerItem[];
  hasMore: boolean;
}

/**
 * Build the upstream Giphy request. An empty query maps to the trending
 * endpoint so the picker opens with content before the participant types.
 */
export function buildGiphyRequestUrl(params: {
  apiKey: string;
  kind: GiphyKind;
  query: string;
  offset: number;
  lang: string;
  limit?: number;
}): string {
  const { apiKey, kind, offset, lang } = params;
  const query = params.query.trim();
  const endpoint = query ? "search" : "trending";
  const url = new URL(`https://api.giphy.com/v1/${kind}/${endpoint}`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("limit", String(params.limit ?? GIPHY_PAGE_SIZE));
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("rating", GIPHY_CONTENT_RATING);
  if (query) {
    url.searchParams.set("q", query);
    url.searchParams.set("lang", lang);
  }
  return url.toString();
}

interface GiphyImageRendition {
  url?: string;
  width?: string;
  height?: string;
}

interface GiphyApiGif {
  id?: string;
  title?: string;
  images?: {
    fixed_width?: GiphyImageRendition;
    downsized_medium?: GiphyImageRendition;
    original?: GiphyImageRendition;
  };
}

interface GiphyApiResponse {
  data?: GiphyApiGif[];
  pagination?: { total_count?: number; count?: number; offset?: number };
}

/**
 * Reduce Giphy's verbose response to what the picker needs. Items missing a
 * usable rendition are dropped rather than rendered broken.
 */
export function mapGiphyResponse(payload: unknown): GiphySearchResult {
  const body = (payload ?? {}) as GiphyApiResponse;
  const data = Array.isArray(body.data) ? body.data : [];
  const items: GiphyPickerItem[] = [];
  for (const gif of data) {
    const preview = gif.images?.fixed_width;
    const full = gif.images?.downsized_medium?.url || gif.images?.original?.url || preview?.url;
    if (!gif.id || !preview?.url || !full) continue;
    items.push({
      id: gif.id,
      title: gif.title ?? "",
      preview_url: preview.url,
      preview_width: Number(preview.width) || 200,
      preview_height: Number(preview.height) || 200,
      media_url: full,
    });
  }
  const p = body.pagination ?? {};
  const hasMore =
    typeof p.total_count === "number" && typeof p.count === "number" && typeof p.offset === "number"
      ? p.offset + p.count < p.total_count
      : items.length > 0;
  return { items, hasMore };
}

/**
 * True for URLs served from Giphy's media CDN. Used by the display/control
 * cards to render GIFs and transparent stickers with `object-fit: contain`
 * instead of cropping them like photos.
 */
export function isGiphyMediaUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname;
    return host === "giphy.com" || host.endsWith(".giphy.com");
  } catch {
    return false;
  }
}
