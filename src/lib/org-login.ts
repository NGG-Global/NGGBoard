import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Server-only helpers for the organisation shared-password sign-in
 * (`/api/auth/org-login`). Never import this from client code: the shared
 * password must stay on the server.
 */

export const DEFAULT_ORG_EMAIL_DOMAIN = "nggconsult.com";

/** Normalise an email for comparison (trimmed, lower-cased). */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * True when `email` is a single, well-formed address whose domain is EXACTLY
 * `domain` — subdomains and look-alikes (`evil-nggconsult.com`,
 * `nggconsult.com.evil.io`) are rejected.
 */
export function isOrgEmail(email: string, domain = DEFAULT_ORG_EMAIL_DOMAIN): boolean {
  const normalized = normalizeEmail(email);
  const parts = normalized.split("@");
  if (parts.length !== 2) return false;
  const [local, host] = parts;
  if (!local || /\s/.test(normalized)) return false;
  return host === domain.trim().toLowerCase();
}

/** Constant-time string comparison (hashing first equalises lengths). */
export function safeEqual(a: string, b: string): boolean {
  const da = createHash("sha256").update(a, "utf8").digest();
  const db = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(da, db);
}

/**
 * Minimal fixed-window attempt limiter keyed by client (IP). Best-effort only:
 * state is per server instance, so on serverless it bounds — but does not
 * fully prevent — brute-force attempts against the shared password.
 */
export class AttemptLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  /** Records an attempt; returns false once `key` exceeded the limit. */
  allow(key: string, now = Date.now()): boolean {
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      this.prune(now);
      return true;
    }
    entry.count += 1;
    return entry.count <= this.max;
  }

  private prune(now: number) {
    if (this.hits.size < 5000) return;
    for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k);
  }
}
