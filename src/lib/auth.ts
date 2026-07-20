"use client";

import type { Profile } from "@/lib/types";
import { db, CURRENT_USER_ID } from "@/lib/data/local-db";

/**
 * Mock organizational auth for the MVP. It persists a session id in
 * localStorage and resolves it against seeded profiles. The surface
 * (signIn/signOut/getSession) mirrors Supabase Auth so the swap is isolated
 * to this file — see README "Hooking up Supabase".
 */

const SESSION_KEY = "ngg_session_user_id";

export function getSessionUserId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(SESSION_KEY);
}

export function getCurrentProfile(): Profile | null {
  const id = getSessionUserId();
  return id ? db.getProfile(id) : null;
}

export interface SignInResult {
  ok: boolean;
  error?: string;
  profile?: Profile;
}

/**
 * Demo sign-in: any seeded organizational email is accepted with any password
 * (the login screen makes this explicit). Defaults to the current demo user.
 */
export function signIn(email: string, _password: string): SignInResult {
  const normalized = email.trim().toLowerCase();
  const match =
    db.listProfiles().find((p) => p.email.toLowerCase() === normalized) ??
    (normalized === "" ? db.getProfile(CURRENT_USER_ID) : null);

  if (!match) {
    return { ok: false, error: "כתובת המייל אינה מזוהה בארגון. פנו למנהל המערכת." };
  }
  if (typeof window !== "undefined") {
    window.localStorage.setItem(SESSION_KEY, match.id);
  }
  return { ok: true, profile: match };
}

/** Sign in straight as the demo user (used by the "enter demo" shortcut). */
export function signInDemo(): Profile {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(SESSION_KEY, CURRENT_USER_ID);
  }
  return db.getProfile(CURRENT_USER_ID)!;
}

export function signOut(): void {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(SESSION_KEY);
  }
}
