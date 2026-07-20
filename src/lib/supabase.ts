"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Whether the Supabase backend is selected via env. */
export const USE_SUPABASE =
  process.env.NEXT_PUBLIC_DATA_BACKEND === "supabase" &&
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;

/** Lazily-created browser Supabase client (null on the server or when unset). */
export function getSupabase(): SupabaseClient | null {
  if (!USE_SUPABASE || typeof window === "undefined") return null;
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: true, autoRefreshToken: true } },
    );
  }
  return client;
}

export function appOrigin(): string {
  if (typeof window !== "undefined") return window.location.origin;
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}
