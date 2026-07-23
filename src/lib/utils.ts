import { ALLOWED_IMAGE_TYPES } from "./constants";
import { t } from "@/lib/i18n";

/** Cryptographically-strong random id (used for non-guessable public room ids). */
export function randomId(bytes = 12): string {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const arr = new Uint8Array(bytes);
    crypto.getRandomValues(arr);
    return Array.from(arr, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, bytes * 2);
  }
  // Fallback (should not be hit in browser/Node 18+).
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** UUID v4 (used for entity ids so they line up with Postgres uuid columns). */
export function uuid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** 6-digit human-friendly room code, grouped as "739 428" for display. */
export function generateRoomCode(): string {
  const n = 100000 + Math.floor(Math.random() * 900000);
  return String(n);
}

export function formatRoomCode(code: string): string {
  return code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}

/** Hebrew relative-time formatting used across the app. */
export function formatAgo(iso: string | number | Date, now: number = Date.now()): string {
  const ts = typeof iso === "number" ? iso : new Date(iso).getTime();
  const seconds = Math.max(2, Math.round((now - ts) / 1000));
  if (seconds < 60) return t("לפני {count} שנ׳", { count: seconds });
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return t("לפני {count} דק׳", { count: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t("לפני {count} שע׳", { count: hours });
  const days = Math.round(hours / 24);
  if (days < 7) return t("לפני {count} ימים", { count: days });
  const weeks = Math.round(days / 7);
  if (weeks < 5) return t("לפני {count} שבועות", { count: weeks });
  const months = Math.round(days / 30);
  if (months < 12) return t("לפני {count} חודשים", { count: months });
  return t("לפני {count} שנים", { count: Math.round(days / 365) });
}

export function minutesBetween(startIso: string | null, endIso: string | null): number | null {
  if (!startIso || !endIso) return null;
  return Math.max(0, Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000));
}

/** Strip C0/C1 control characters (except tab and newline), trim, cap length. */
export function sanitizeText(input: string, maxLen: number): string {
  let out = "";
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 0;
    const isControl = (code < 0x20 && code !== 0x09 && code !== 0x0a) || (code >= 0x7f && code <= 0x9f);
    if (!isControl) out += ch;
  }
  return out.trimEnd().slice(0, maxLen);
}

/** Returns the first blocked word found in the text, or null. Case-insensitive. */
export function findBlockedWord(text: string, blocked: string[]): string | null {
  if (!blocked.length) return null;
  const lower = text.toLowerCase();
  for (const w of blocked) {
    const word = w.trim().toLowerCase();
    if (word && lower.includes(word)) return w;
  }
  return null;
}

export function isAllowedImageType(type: string): boolean {
  return ALLOWED_IMAGE_TYPES.includes(type);
}

/** Deterministic initial for an avatar bubble. */
export function initialFor(name: string | null, anonymous: boolean): string {
  if (anonymous || !name) return "?";
  return name.trim().charAt(0) || "?";
}

export function classNames(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
