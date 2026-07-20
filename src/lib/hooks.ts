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
 */
export function useLiveQuery<T>(scope: RealtimeScope, selector: () => T): T {
  const selectorRef = useRef(selector);
  selectorRef.current = selector;

  // Start with the SSR/first-paint value; refresh after mount to read localStorage.
  const [value, setValue] = useState<T>(() => selector());

  const refresh = useCallback(() => setValue(selectorRef.current()), []);

  useEffect(() => {
    refresh(); // hydrate from localStorage after mount
    const unsub = db.subscribe(scope, refresh);
    return unsub;
    // scope is stable per-usage; stringify guards accidental re-subscribes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeof scope === "string" ? scope : scope.room, refresh]);

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
