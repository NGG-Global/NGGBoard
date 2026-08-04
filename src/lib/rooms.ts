import type { LiveRoom, RoomMode } from "@/lib/types";

/**
 * Room lifecycle helpers shared by both data backends and the UI.
 *
 * A room is either a live session or an open collection window (see `RoomMode`).
 * The rules that differ between them live here rather than being re-derived at
 * each call site, because getting one of them wrong — suspending an open room
 * for inactivity, or accepting content past a deadline — is exactly the kind of
 * failure a participant reads as "the link doesn't work".
 */

/**
 * Fill in a room row's lifecycle fields. Rooms created before open collection
 * existed have neither `mode` nor `closes_at`; every one of them was a live
 * session, so that is what they normalise to. Both backends pass rooms through
 * here on read, so the UI always receives a complete object. Idempotent.
 */
export function normalizeRoom<T extends LiveRoom>(room: T): T {
  if (room.mode && room.closes_at !== undefined) return room;
  return { ...room, mode: room.mode ?? "live", closes_at: room.closes_at ?? null };
}

export function isOpenRoom(room: Pick<LiveRoom, "mode"> | null | undefined): boolean {
  return room?.mode === "open";
}

/** True once an open room's deadline has passed (false when it has none). */
export function deadlinePassed(room: Pick<LiveRoom, "closes_at">, nowMs = Date.now()): boolean {
  if (!room.closes_at) return false;
  const at = new Date(room.closes_at).getTime();
  return Number.isFinite(at) && nowMs >= at;
}

/**
 * Whether inactivity should ever suspend this room. Open rooms are exempt:
 * days of quiet between contributions is their normal state, not a sign the
 * facilitator walked away.
 */
export function accruesIdleTime(room: Pick<LiveRoom, "mode" | "status">): boolean {
  return !isOpenRoom(room) && (room.status === "active" || room.status === "paused");
}

/**
 * The room state an open collection should be in right now, or null when it
 * needs no change. Past its deadline a collection goes `read_only`, not
 * `ended`: the content stays on the board for the facilitator to review and
 * present, and the board keeps counting as the board's current collection
 * instead of dropping back to "no room yet". Ending it is a deliberate act.
 */
export function dueRoomStatus(room: Pick<LiveRoom, "mode" | "status" | "closes_at">, nowMs = Date.now()): "read_only" | null {
  if (!isOpenRoom(room)) return null;
  if (room.status !== "active" && room.status !== "paused") return null;
  return deadlinePassed(room, nowMs) ? "read_only" : null;
}

/** Copy key for the mode, used by the activation dialog and board summaries. */
export const ROOM_MODE_LABELS: Record<RoomMode, string> = {
  live: "מפגש חי",
  open: "לוח פתוח לאיסוף",
};

/**
 * A deadline in the plain form a participant should read it in — a date, and a
 * time only when it isn't end-of-day. `null` when there is no deadline.
 */
export function formatDeadline(closesAt: string | null, locale = "he-IL"): string | null {
  if (!closesAt) return null;
  const d = new Date(closesAt);
  if (Number.isNaN(d.getTime())) return null;
  const date = d.toLocaleDateString(locale, { day: "numeric", month: "long" });
  const endOfDay = d.getHours() === 23 && d.getMinutes() === 59;
  if (endOfDay) return date;
  return `${date}, ${d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}`;
}

/**
 * Turn a date-only picker value ("2026-08-20") into the instant collection
 * should close — the end of that day in the facilitator's own timezone, which
 * is what "open until the 20th" means to them. Empty input means no deadline.
 */
export function deadlineFromDateInput(value: string): string | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 23, 59, 0, 0).toISOString();
}

/** The inverse of `deadlineFromDateInput`, for populating the picker. */
export function dateInputFromDeadline(closesAt: string | null): string {
  if (!closesAt) return "";
  const d = new Date(closesAt);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
