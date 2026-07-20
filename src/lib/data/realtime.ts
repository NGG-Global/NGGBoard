/**
 * Realtime transport abstraction.
 *
 * The local backend implements this with a BroadcastChannel, which gives
 * genuine cross-tab/window realtime on one machine — enough to demo the
 * participant → display → control-room loop end to end without a server.
 *
 * A Supabase backend implements the same surface with `supabase.channel(...)`
 * + Postgres change subscriptions. UI code only ever depends on this shape,
 * so swapping transports is a one-file change (see README "Hooking up Supabase").
 */

export type RealtimeScope = "board-list" | { room: string };

export interface RealtimeSignal {
  /** What changed. Subscribers re-fetch the relevant slice on receipt. */
  kind:
    | "submissions"
    | "room"
    | "participants"
    | "focus"
    | "layout"
    | "qr-overlay"
    | "board-list";
  roomId?: string;
  /** Monotonic-ish stamp for debugging/ordering; not authoritative. */
  at: number;
}

type Listener = (signal: RealtimeSignal) => void;

const CHANNEL_NAME = "ngg-realtime";

class RealtimeBus {
  private channel: BroadcastChannel | null = null;
  private listeners = new Set<Listener>();

  private ensure(): void {
    if (this.channel || typeof window === "undefined" || typeof BroadcastChannel === "undefined") return;
    this.channel = new BroadcastChannel(CHANNEL_NAME);
    this.channel.onmessage = (ev: MessageEvent<RealtimeSignal>) => {
      for (const l of this.listeners) l(ev.data);
    };
  }

  /** Publish a change to all tabs (including local subscribers). */
  publish(signal: Omit<RealtimeSignal, "at">): void {
    this.ensure();
    const full: RealtimeSignal = { ...signal, at: Date.now() };
    // Deliver to same-tab subscribers synchronously…
    for (const l of this.listeners) l(full);
    // …and to other tabs via the channel.
    this.channel?.postMessage(full);
  }

  /**
   * Subscribe to *every* signal regardless of scope. Used by the data layer to
   * invalidate its in-memory cache the moment another tab writes. Registered
   * before any component subscribes, so cache refresh happens first.
   */
  subscribeRaw(cb: Listener): () => void {
    this.ensure();
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /**
   * Subscribe to a scope. Returns an unsubscribe function.
   * "board-list" hears board-list changes; { room } hears everything for a room.
   */
  subscribe(scope: RealtimeScope, cb: Listener): () => void {
    this.ensure();
    const wrapped: Listener = (sig) => {
      if (scope === "board-list") {
        if (sig.kind === "board-list") cb(sig);
        return;
      }
      if (sig.roomId === scope.room) cb(sig);
    };
    this.listeners.add(wrapped);
    return () => this.listeners.delete(wrapped);
  }
}

export const realtime = new RealtimeBus();
