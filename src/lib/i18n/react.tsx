"use client";

import { useEffect, useSyncExternalStore } from "react";
import { getLang, initLang, setLang, subscribe, t, type Lang } from "./index";

/**
 * Subscribes the component to interface-language changes.
 * Server render and hydration always report Hebrew; the persisted choice is
 * applied right after mount by <LanguageInit />, which re-renders subscribers.
 */
export function useI18n() {
  const lang = useSyncExternalStore(subscribe, getLang, () => "he" as Lang);
  return { lang, setLang, t };
}

/** Mounted once in the root layout — restores the saved language choice. */
export function LanguageInit() {
  useEffect(() => {
    initLang();
  }, []);
  return null;
}

/**
 * The visible Hebrew/English switcher — a small segmented pill.
 * Designed to sit on any surface: pass `onDark` for dark/photo backgrounds.
 */
export function LanguageToggle({ onDark = false }: { onDark?: boolean }) {
  const { lang } = useI18n();

  const base: React.CSSProperties = {
    border: "none",
    background: "transparent",
    fontFamily: "var(--font-sans)",
    fontSize: "var(--text-2xs)",
    fontWeight: "var(--weight-bold)" as React.CSSProperties["fontWeight"],
    padding: "4px 10px",
    borderRadius: "var(--radius-pill)",
    cursor: "pointer",
    lineHeight: 1.4,
  };

  const activeBg = onDark ? "rgba(255,255,255,.92)" : "var(--accent-soft)";
  const activeColor = onDark ? "#1a1a24" : "var(--accent-text)";
  const idleColor = onDark ? "rgba(255,255,255,.75)" : "var(--text-subtle)";

  return (
    <div
      role="group"
      aria-label="Interface language / שפת ממשק"
      style={{
        display: "inline-flex",
        gap: 2,
        padding: 2,
        borderRadius: "var(--radius-pill)",
        border: `1px solid ${onDark ? "rgba(255,255,255,.35)" : "var(--border)"}`,
        background: onDark ? "rgba(255,255,255,.08)" : "var(--surface)",
      }}
    >
      <button
        type="button"
        onClick={() => setLang("he")}
        aria-pressed={lang === "he"}
        lang="he"
        style={{ ...base, background: lang === "he" ? activeBg : "transparent", color: lang === "he" ? activeColor : idleColor }}
      >
        עברית
      </button>
      <button
        type="button"
        onClick={() => setLang("en")}
        aria-pressed={lang === "en"}
        lang="en"
        style={{ ...base, background: lang === "en" ? activeBg : "transparent", color: lang === "en" ? activeColor : idleColor }}
      >
        English
      </button>
    </div>
  );
}
