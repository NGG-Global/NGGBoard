"use client";

import { t } from "@/lib/i18n";
import type { Profile } from "@/lib/types";
import { db, CURRENT_USER_ID } from "@/lib/data";
import { supabaseDb } from "@/lib/data/supabase-db";
import { getSupabase, USE_SUPABASE } from "@/lib/supabase";

/**
 * Backend-aware organizational auth.
 *
 * - Local backend: a mock session id in localStorage resolved against seeded
 *   profiles (any org email accepted; demo shortcut available).
 * - Supabase backend: real Supabase Auth (email + password). A signup is
 *   auto-provisioned with an org + profile by the `handle_new_user` trigger
 *   (migration 0005).
 */

const SESSION_KEY = "ngg_session_user_id";

// Synchronous cache of the current user id (Supabase session is async).
let cachedUserId: string | null = null;
let authInitStarted = false;

export interface SignInResult {
  ok: boolean;
  error?: string;
  profile?: Profile;
}

// ---- session resolution -----------------------------------------------------

/** Resolve the current session id, initialising the Supabase auth listener. */
export async function resolveSession(): Promise<string | null> {
  if (!USE_SUPABASE) {
    cachedUserId = typeof window !== "undefined" ? window.localStorage.getItem(SESSION_KEY) : null;
    return cachedUserId;
  }
  const sb = getSupabase();
  if (!sb) return null;
  if (!authInitStarted) {
    authInitStarted = true;
    sb.auth.onAuthStateChange((_event, session) => {
      cachedUserId = session?.user?.id ?? null;
      supabaseDb.setCurrentProfile(cachedUserId);
    });
  }
  const { data } = await sb.auth.getSession();
  cachedUserId = data.session?.user?.id ?? null;
  supabaseDb.setCurrentProfile(cachedUserId);
  return cachedUserId;
}

export function getSessionUserId(): string | null {
  if (!USE_SUPABASE && typeof window !== "undefined") {
    return window.localStorage.getItem(SESSION_KEY);
  }
  return cachedUserId;
}

export function getCurrentProfile(): Profile | null {
  const id = getSessionUserId();
  return id ? db.getProfile(id) : null;
}

// ---- sign in / up / out -----------------------------------------------------

export async function signIn(email: string, password: string): Promise<SignInResult> {
  if (USE_SUPABASE) {
    const sb = getSupabase();
    if (!sb) return { ok: false, error: t("החיבור לשרת אינו זמין") };
    const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    if (error) return { ok: false, error: translateAuthError(error.message) };
    cachedUserId = data.user?.id ?? null;
    supabaseDb.setCurrentProfile(cachedUserId);
    return { ok: true };
  }

  // Local mock: any seeded org email is accepted.
  const normalized = email.trim().toLowerCase();
  const match =
    db.listProfiles().find((p) => p.email.toLowerCase() === normalized) ??
    (normalized === "" ? db.getProfile(CURRENT_USER_ID) : null);
  if (!match) return { ok: false, error: t("כתובת המייל אינה מזוהה בארגון. פנו למנהל המערכת.") };
  if (typeof window !== "undefined") window.localStorage.setItem(SESSION_KEY, match.id);
  return { ok: true, profile: match };
}

export async function signUp(email: string, password: string, fullName: string): Promise<SignInResult> {
  if (!USE_SUPABASE) return signIn(email, password);
  const sb = getSupabase();
  if (!sb) return { ok: false, error: t("החיבור לשרת אינו זמין") };
  const { data, error } = await sb.auth.signUp({
    email: email.trim(),
    password,
    options: { data: { full_name: fullName.trim() } },
  });
  if (error) return { ok: false, error: translateAuthError(error.message) };
  // If email confirmation is required, there is no session yet.
  if (!data.session) {
    return { ok: false, error: t("נשלח אליכם מייל אימות. אשרו אותו ואז התחברו.") };
  }
  cachedUserId = data.user?.id ?? null;
  supabaseDb.setCurrentProfile(cachedUserId);
  return { ok: true };
}

/** Local-only demo shortcut. */
export function signInDemo(): Profile {
  if (typeof window !== "undefined") window.localStorage.setItem(SESSION_KEY, CURRENT_USER_ID);
  return db.getProfile(CURRENT_USER_ID)!;
}

export async function signOut(): Promise<void> {
  if (USE_SUPABASE) {
    await getSupabase()?.auth.signOut();
    cachedUserId = null;
    return;
  }
  if (typeof window !== "undefined") window.localStorage.removeItem(SESSION_KEY);
}

export { USE_SUPABASE };

function translateAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login")) return t("מייל או סיסמה שגויים");
  if (m.includes("email not confirmed")) return t("יש לאשר את מייל האימות לפני ההתחברות");
  if (m.includes("already registered")) return t("כתובת המייל כבר רשומה — התחברו במקום זאת");
  if (m.includes("password")) return t("הסיסמה חייבת לכלול לפחות 6 תווים");
  return t("ההתחברות נכשלה. נסו שוב.");
}
