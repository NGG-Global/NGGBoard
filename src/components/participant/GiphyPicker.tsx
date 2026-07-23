"use client";

import { useEffect, useRef, useState } from "react";
import type { GiphyKind, GiphyPickerItem, GiphySearchResult } from "@/lib/giphy";
import { Button, Spinner } from "@/components/ui";
import { IconSearch, IconWarning } from "@/components/ui/icons";
import { useI18n } from "@/lib/i18n/react";

const SEARCH_DEBOUNCE_MS = 400;

/**
 * Search-and-pick UI over `/api/giphy` (GIFs + stickers tabs, trending when
 * the query is empty, paged "load more"). Selection is delegated to the
 * parent, which owns the submission step.
 */
export function GiphyPicker({ onSelect }: { onSelect: (item: GiphyPickerItem) => void }) {
  const { t, lang } = useI18n();
  const [kind, setKind] = useState<GiphyKind>("gifs");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [items, setItems] = useState<GiphyPickerItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const requestSeq = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  async function fetchPage(offset: number): Promise<GiphySearchResult | null> {
    const params = new URLSearchParams({ kind, offset: String(offset), lang });
    if (debouncedQuery) params.set("q", debouncedQuery);
    try {
      const res = await fetch(`/api/giphy?${params.toString()}`);
      if (!res.ok) return null;
      return (await res.json()) as GiphySearchResult;
    } catch {
      return null;
    }
  }

  // Fresh result set on tab / query change; a sequence counter discards
  // responses that arrive after a newer request was issued.
  useEffect(() => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setFailed(false);
    void fetchPage(0).then((result) => {
      if (seq !== requestSeq.current) return;
      setLoading(false);
      if (!result) {
        setFailed(true);
        setItems([]);
        setHasMore(false);
        return;
      }
      setItems(result.items);
      setHasMore(result.hasMore);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchPage reads kind/debouncedQuery/lang, all listed.
  }, [kind, debouncedQuery, lang]);

  async function loadMore() {
    const seq = requestSeq.current;
    setLoadingMore(true);
    const result = await fetchPage(items.length);
    if (seq !== requestSeq.current) return;
    setLoadingMore(false);
    if (!result) return setFailed(true);
    // Dedupe: Giphy pages can overlap when its ranking shifts between calls.
    const known = new Set(items.map((i) => i.id));
    setItems([...items, ...result.items.filter((i) => !known.has(i.id))]);
    setHasMore(result.hasMore);
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: "8px 0",
    border: "none",
    borderRadius: "var(--radius-lg)",
    background: active ? "var(--surface)" : "transparent",
    color: active ? "var(--accent-text)" : "var(--text-muted)",
    fontSize: "var(--text-sm)",
    fontWeight: "var(--weight-bold)",
    fontFamily: "var(--font-sans)",
    cursor: "pointer",
    boxShadow: active ? "var(--elevation-1, 0 1px 3px rgba(8,8,16,.12))" : "none",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 4, background: "var(--surface-sunken)", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", padding: 4 }}>
        <button onClick={() => setKind("gifs")} style={tabStyle(kind === "gifs")}>GIF</button>
        <button onClick={() => setKind("stickers")} style={tabStyle(kind === "stickers")}>{t("מדבקות")}</button>
      </div>

      <div style={{ position: "relative" }}>
        <span style={{ position: "absolute", insetInlineStart: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-subtle)", display: "flex" }}>
          <IconSearch size={16} />
        </span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value.slice(0, 100))}
          placeholder={t("חיפוש ב-GIPHY…")}
          className="ngg-focusable"
          style={{ width: "100%", fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)", color: "var(--text)", background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-lg)", padding: "10px 12px", paddingInlineStart: 36, outline: "none" }}
        />
      </div>

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
          <div style={{ fontSize: "var(--text-sm)" }}>{t("חיפוש ה-GIF אינו זמין כרגע. נסו שוב מאוחר יותר.")}</div>
        </div>
      )}

      {!loading && !failed && items.length === 0 && (
        <div style={{ padding: "28px 12px", textAlign: "center", color: "var(--text-muted)", fontSize: "var(--text-sm)" }}>
          {t("לא נמצאו תוצאות עבור \"{query}\"", { query: debouncedQuery })}
        </div>
      )}

      {!loading && items.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => onSelect(item)}
              className="ngg-focusable"
              aria-label={item.title || t("בחירת GIF")}
              style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden", padding: 0, cursor: "pointer", background: "var(--surface-sunken)", aspectRatio: `${item.preview_width} / ${item.preview_height}` }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.preview_url} alt={item.title} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            </button>
          ))}
        </div>
      )}

      {!loading && !failed && hasMore && (
        <Button variant="outline" size="md" block onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? <Spinner size={16} /> : t("טעינת עוד")}
        </Button>
      )}

      {/* Attribution required by Giphy's API terms. Brand name stays in English. */}
      <div style={{ textAlign: "center", fontSize: "var(--text-2xs)", color: "var(--text-subtle)", letterSpacing: "0.04em" }} dir="ltr">
        Powered by GIPHY
      </div>
    </div>
  );
}
