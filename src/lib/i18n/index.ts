/**
 * Lightweight interface-language layer (Hebrew ⇄ English).
 *
 * The original Hebrew string doubles as the translation key: `t("שמירה")`
 * returns the English entry from the dictionary when the interface language
 * is English, and falls back to the Hebrew text itself when no entry exists.
 * Parameterized strings use `{name}`-style placeholders:
 *   t('הלוח הועבר לתיקייה "{name}"', { name: folder })
 *
 * The current language lives in a module-level store (usable from non-React
 * code such as validation or data-layer error messages) and is persisted in
 * localStorage. React components subscribe via `useI18n()`.
 */
import { EN } from "./en";

export type Lang = "he" | "en";

const STORAGE_KEY = "ngg-lang";

let current: Lang = "he";
const listeners = new Set<() => void>();

function applyToDocument(lang: Lang) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "he" ? "rtl" : "ltr";
}

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang) {
  if (lang === current) return;
  current = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* storage unavailable (private mode etc.) — keep in-memory only */
  }
  applyToDocument(lang);
  listeners.forEach((fn) => fn());
}

/**
 * Restores the persisted language choice. Called once on the client after
 * mount (see LanguageInit) so server-rendered HTML always hydrates as Hebrew
 * and no hydration mismatch occurs.
 */
export function initLang() {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  if (stored === "en" || stored === "he") setLang(stored);
  else applyToDocument(current);
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Translates a Hebrew UI string, with optional {placeholder} substitution. */
export function t(he: string, params?: Record<string, string | number>): string {
  let out = current === "en" ? (EN[he] ?? he) : he;
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      out = out.split(`{${key}}`).join(String(value));
    }
  }
  return out;
}
