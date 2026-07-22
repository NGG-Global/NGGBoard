"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { db } from "@/lib/data";
import type { RealtimeScope } from "@/lib/data/realtime";

/**
 * useLiveQuery — runs a selector against the local DB, re-running it whenever a
 * matching realtime signal fires (and once on mount, after hydration).
 *
 * `scope` decides which signals trigger a refetch: "board-list" for dashboard
 * views, `{ room }` for anything inside a live session.
 *
 * `deps` lists reactive values the selector closes over *beyond* the DB and
 * `scope` (e.g. a `sessionId` from state). Realtime signals alone won't catch a
 * change to those, so the selector is also re-run whenever a dep changes —
 * without this, a selector reading fresh component state returns a stale value
 * until an unrelated signal happens to fire.
 */
export function useLiveQuery<T>(scope: RealtimeScope, selector: () => T, deps: readonly unknown[] = []): T {
  const selectorRef = useRef(selector);
  selectorRef.current = selector;

  // Start with the SSR/first-paint value; refresh after mount to read localStorage.
  const [value, setValue] = useState<T>(() => selector());

  const refresh = useCallback(() => setValue(selectorRef.current()), []);

  useEffect(() => {
    refresh(); // hydrate from localStorage after mount
    const unsub = db.subscribe(scope, refresh);
    // Cross-tab writes: the `storage` event fires once the new value is
    // committed (unlike the BroadcastChannel signal, which can outrun the
    // localStorage write across renderer processes). The data layer's own
    // `storage` listener — registered at module load — reloads memory first,
    // so this refresh reads fresh data. Harmless no-op on the Supabase backend.
    const onStorage = () => refresh();
    window.addEventListener("storage", onStorage);
    return () => {
      unsub();
      window.removeEventListener("storage", onStorage);
    };
    // scope is stable per-usage; stringify guards accidental re-subscribes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeof scope === "string" ? scope : scope.room, refresh]);

  // Re-run the selector when caller-declared inputs change (see `deps` above).
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return value;
}

/** Ticks every `ms` to keep relative timestamps / countdowns fresh. */
export function useTicker(ms: number): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
  return tick;
}

/** True after the component has mounted on the client (guards SSR-only APIs). */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

/**
 * Reactive media-query match. Starts `false` on the server and first client
 * render (so SSR markup is stable), then reflects the real match after mount.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, [query]);
  return matches;
}
