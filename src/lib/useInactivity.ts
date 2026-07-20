"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/data";
import { INACTIVITY_SUSPEND_MS, INACTIVITY_WARNING_MS } from "@/lib/constants";
import type { LiveRoom } from "@/lib/types";

export interface InactivityState {
  idleMs: number;
  warning: boolean;
  minutesUntilSuspend: number;
}

/**
 * Watches a room's server-side `last_activity_at`. Every 10s it:
 *  - recomputes idle time (drives the 25-minute facilitator warning), and
 *  - asks the DB to auto-suspend once past 30 minutes.
 *
 * Because suspension is derived from a stored timestamp (not an open tab), it
 * behaves correctly even if the facilitator's tab was closed and reopened.
 * On Supabase this same check moves to an edge function / scheduled task.
 */
export function useInactivityMonitor(room: LiveRoom | null): InactivityState {
  const [state, setState] = useState<InactivityState>({ idleMs: 0, warning: false, minutesUntilSuspend: 30 });

  useEffect(() => {
    if (!room) return;
    const evaluate = () => {
      const current = db.getRoom(room.id);
      if (!current) return;
      // Only active/paused rooms accrue idle time.
      if (current.status !== "active" && current.status !== "paused") {
        setState({ idleMs: 0, warning: false, minutesUntilSuspend: 30 });
        return;
      }
      db.checkAndApplyInactivity(current.id);
      const idle = Date.now() - new Date(current.last_activity_at).getTime();
      setState({
        idleMs: idle,
        warning: idle >= INACTIVITY_WARNING_MS && idle < INACTIVITY_SUSPEND_MS,
        minutesUntilSuspend: Math.max(0, Math.ceil((INACTIVITY_SUSPEND_MS - idle) / 60000)),
      });
    };
    evaluate();
    const id = setInterval(evaluate, 10000);
    return () => clearInterval(id);
  }, [room?.id, room?.last_activity_at, room?.status]);

  return state;
}
