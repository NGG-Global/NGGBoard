"use client";

import { USE_SUPABASE } from "@/lib/supabase";
import { db as localDb, CURRENT_USER_ID } from "./local-db";
import { supabaseDb } from "./supabase-db";

/**
 * The active data backend. Selected by NEXT_PUBLIC_DATA_BACKEND:
 *   "supabase" → Supabase (cache-backed, realtime, RLS)
 *   anything else → local (localStorage + BroadcastChannel), the default.
 *
 * Both expose the same method surface, so screens import `db` from here and
 * never care which backend is live. Typed as the local client so existing
 * call sites keep their exact signatures.
 */
export const db: typeof localDb = USE_SUPABASE ? (supabaseDb as unknown as typeof localDb) : localDb;

export { CURRENT_USER_ID };
