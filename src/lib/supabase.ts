"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Postgres schema that holds this app's tables, views and RPCs. The NGG apps
 * share one Supabase project, each in a schema of its own
 * (supabase/migrations/0000_app_schema.sql); the client and every Realtime
 * subscription must name it.
 */
export const DB_SCHEMA = "board";

/** Whether the Supabase backend is selected via env. */
export const USE_SUPABASE =
  process.env.NEXT_PUBLIC_DATA_BACKEND === "supabase" &&
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

type BoardClient = SupabaseClient<any, typeof DB_SCHEMA>;

let client: BoardClient | null = null;

/** Lazily-created browser Supabase client (null on the server or when unset). */
export function getSupabase(): BoardClient | null {
  if (!USE_SUPABASE || typeof window === "undefined") return null;
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: true, autoRefreshToken: true }, db: { schema: DB_SCHEMA } },
    );
  }
  return client;
}

export function appOrigin(): string {
  if (typeof window !== "undefined") return window.location.origin;
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}
