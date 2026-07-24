"use client";

import { useEffect, useRef, useState } from "react";
import type { YouTubePickerItem, YouTubeSearchResult } from "@/lib/youtube";
import { parseYouTubeVideoId, youTubeThumbnailUrl } from "@/lib/youtube";
import { Button, Spinner } from "@/components/ui";
import { IconPlay, IconSearch, IconWarning } from "@/components/ui/icons";
import { useI18n } from "@/lib/i18n/react";

const SEARCH_DEBOUNCE_MS = 450;

/**
 * Search-and-pick UI over `/api/youtube`, plus a keyless fast path: when the
 * input parses as a YouTube link, the video is offered directly (thumbnail
 * from YouTube's public image CDN) without touching the Data API — so pasting
 * a link works even when no `YOUTUBE_API_KEY` is configured server-side.
 */
export function YouTubePicker({ onSelect }: { onSelect: (item: YouTubePickerItem) => void }) {
  const { t, lang } = useI18n();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [items, setItems] = useState<YouTubePickerItem[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  // "unconfigured" = server has no YOUTUBE_API_KEY (503); "unavailable" = any other failure.
  const [failed, setFailed] = useState<"unconfigured" | "unavailable" | null>(null);
  const requestSeq = useRef(0);

  // A pasted link short-circuits search entirely.
  const pastedVideoId = parseYouTubeVideoId(query);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  async function fetchPage(pageToken: string | null): Promise<YouTubeSearchResult | "unconfigured" | null> {
    const params = new URLSearchParams({ lang });
    if (debouncedQuery) params.set("q", debouncedQuery);
    if (pageToken) params.set("pageToken", pageToken);
    try {
      const res = await fetch(`/api/youtube?${params.toString()}`);
      if (res.status === 503) return "unconfigured";
      if (!res.ok) return null;
      return (await res.json()) as YouTubeSearchResult;
    } catch {
      return null;
    }
  }

  // Fresh result set on query change; a sequence counter discards responses
  // that arrive after a newer request was issued. Skipped while the input is
  // a pasted link — the direct-use card is shown instead.
  useEffect(() => {
    if (parseYouTubeVideoId(debouncedQuery)) return;
    const seq = ++requestSeq.current;
    setLoading(true);
    setFailed(null);
    void fetchPage(null).then((result) => {
      if (seq !== requestSeq.current) return;
      setLoading(false);
      if (!result || result === "unconfigured") {
        setFailed(result === "unconfigured" ? "unconfigured" : "unavailable");
        setItems([]);
        setNextPageToken(null);
        return;
      }
      setItems(result.items);
      setNextPageToken(result.nextPageToken);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchPage reads debouncedQuery/lang, both listed.
  }, [debouncedQuery, lang]);

  async function loadMore() {
    if (!nextPageToken) return;
    const seq = requestSeq.current;
    setLoadingMore(true);
    const result = await fetchPage(nextPageToken);
    if (seq !== requestSeq.current) return;
    setLoadingMore(false);
    if (!result || result === "unconfigured") {
      return setFailed(result === "unconfigured" ? "unconfigured" : "unavailable");
    }
    const known = new Set(items.map((i) => i.id));
    setItems([...items, ...result.items.filter((i) => !known.has(i.id))]);
    setNextPageToken(result.nextPageToken);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ position: "relative" }}>
        <span style={{ position: "absolute", insetInlineStart: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-subtle)", display: "flex" }}>
          <IconSearch size={16} />
        </span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value.slice(0, 200))}
          placeholder={t("חיפוש ב-YouTube או הדבקת קישור לסרטון…")}
          className="ngg-focusable"
          dir="auto"
          style={{ width: "100%", fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)", color: "var(--text)", background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-lg)", padding: "10px 12px", paddingInlineStart: 36, outline: "none" }}
        />
      </div>

      {/* Direct-use card for a pasted link — works without the search API. */}
      {pastedVideoId && (
        <button
          onClick={() => onSelect({ id: pastedVideoId, title: "", channel: "", thumbnail_url: youTubeThumbnailUrl(pastedVideoId) })}
          className="ngg-card-hover"
          style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", padding: 10, cursor: "pointer", textAlign: "start" }}
        >
          <span style={{ position: "relative", flex: "none", width: 120, aspectRatio: "16 / 9", borderRadius: "var(--radius-lg)", overflow: "hidden", background: "var(--surface-sunken)", display: "flex" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={youTubeThumbnailUrl(pastedVideoId)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </span>
          <span style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
            <span style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-bold)", color: "var(--accent-text)" }}>{t("שימוש בסרטון מהקישור")}</span>
            <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-subtle)", direction: "ltr", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{query.trim()}</span>
          </span>
        </button>
      )}

      {!pastedVideoId && (
        <>
          {!debouncedQuery && !loading && !failed && items.length > 0 && (
            <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-subtle)", fontWeight: "var(--weight-semibold)" }}>{t("פופולרי עכשיו")}</div>
          )}

          {loading && (
            <div style={{ display: "flex", justifyContent: "center", padding: "36px 0" }}>
              <Spinner size={24} />
            </div>
          )}

          {!loading && failed && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "28px 12px", textAlign: "center", color: "var(--text-muted)" }}>
              <IconWarning size={28} />
              <div style={{ fontSize: "var(--text-sm)" }}>
                {failed === "unconfigured"
                  ? t("חיפוש הסרטונים עדיין לא הוגדר במערכת (חסר YOUTUBE_API_KEY בסביבת השרת).")
                  : t("חיפוש הסרטונים אינו זמין כרגע. נסו שוב מאוחר יותר.")}
              </div>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)" }}>{t("אפשר עדיין להדביק בשורת החיפוש קישור לסרטון מ-YouTube.")}</div>
            </div>
          )}

          {!loading && !failed && items.length === 0 && (
            <div style={{ padding: "28px 12px", textAlign: "center", color: "var(--text-muted)", fontSize: "var(--text-sm)" }}>
              {t("לא נמצאו סרטונים עבור \"{query}\"", { query: debouncedQuery })}
            </div>
          )}

          {!loading && items.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onSelect(item)}
                  className="ngg-card-hover"
                  style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", padding: 10, cursor: "pointer", textAlign: "start" }}
                >
                  <span style={{ position: "relative", flex: "none", width: 120, aspectRatio: "16 / 9", borderRadius: "var(--radius-lg)", overflow: "hidden", background: "var(--surface-sunken)", display: "flex" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.thumbnail_url} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", background: "rgba(8,8,16,.25)" }}>
                      <IconPlay size={20} />
                    </span>
                  </span>
                  <span style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                    <span dir="auto" style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-bold)", color: "var(--text)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{item.title}</span>
                    {item.channel && <span dir="auto" style={{ fontSize: "var(--text-2xs)", color: "var(--text-subtle)" }}>{item.channel}</span>}
                  </span>
                </button>
              ))}
            </div>
          )}

          {!loading && !failed && nextPageToken && (
            <Button variant="outline" size="md" block onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? <Spinner size={16} /> : t("טעינת עוד")}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
