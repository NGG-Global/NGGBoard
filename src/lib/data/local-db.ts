"use client";

import type {
  ActivityEvent,
  ActivityEventType,
  Board,
  DisplayLayout,
  LiveRoom,
  ModerationActionType,
  ParticipantSession,
  RoomStatus,
  SessionSummary,
  Submission,
  SubmissionStatus,
  SubmissionType,
} from "@/lib/types";
import { INACTIVITY_SUSPEND_MS } from "@/lib/constants";
import { formatRoomCode, generateRoomCode, minutesBetween, randomId, uuid } from "@/lib/utils";
import { realtime, type RealtimeScope, type RealtimeSignal } from "./realtime";
import { buildSeed, CURRENT_USER_ID, type Database } from "./seed";

const STORAGE_KEY = "ngg_boards_db_v1";

/**
 * Local, browser-persisted implementation of the app's data contract.
 * Every method here maps 1:1 to an operation a Supabase client would expose;
 * see README "Hooking up Supabase" for the swap.
 */
class LocalDB {
  private memory: Database | null = null;
  private syncing = false;

  constructor() {
    // In the browser, invalidate our in-memory cache whenever *any* tab writes,
    // so cross-tab realtime signals reflect the freshly-persisted state.
    if (typeof window !== "undefined") {
      realtime.subscribeRaw(() => {
        if (this.syncing) return; // ignore the echo from our own commit
        this.reloadFromStorage();
      });
    }
  }

  private reloadFromStorage(): void {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) this.memory = JSON.parse(raw) as Database;
    } catch {
      /* keep current memory on parse error */
    }
  }

  // ---- persistence ----------------------------------------------------------

  private read(): Database {
    if (typeof window === "undefined") {
      // SSR: return a fresh, non-persisted seed so server render never crashes.
      this.memory ??= buildSeed();
      return this.memory;
    }
    if (this.memory) return this.memory;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        this.memory = JSON.parse(raw) as Database;
        return this.memory;
      }
    } catch {
      /* fall through to seed */
    }
    this.memory = buildSeed();
    this.persist();
    return this.memory;
  }

  private persist(): void {
    if (typeof window === "undefined" || !this.memory) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.memory));
    } catch (err) {
      // Most likely a quota error from large base64 images.
      console.warn("NGG: could not persist local DB (storage quota?)", err);
    }
  }

  private commit(signal: Omit<RealtimeSignal, "at">): void {
    this.persist();
    // Guard so our own broadcast echo doesn't trigger a redundant self-reload.
    this.syncing = true;
    try {
      realtime.publish(signal);
    } finally {
      this.syncing = false;
    }
  }

  /** Wipe local state and re-seed (used by the reset control / tests). */
  resetToSeed(): void {
    this.memory = buildSeed();
    this.persist();
    realtime.publish({ kind: "board-list" });
  }

  /** Test-only: drop the in-memory cache so the next read re-hydrates from storage. */
  resetMemoryForTest(): void {
    this.memory = null;
  }

  subscribe(scope: RealtimeScope, cb: (s: RealtimeSignal) => void): () => void {
    return realtime.subscribe(scope, cb);
  }

  // ---- org / profiles -------------------------------------------------------

  getOrganization() {
    return this.read().organizations[0]!;
  }

  getProfile(id: string) {
    return this.read().profiles.find((p) => p.id === id) ?? null;
  }

  listProfiles() {
    return [...this.read().profiles];
  }

  // ---- boards ---------------------------------------------------------------

  listBoards(): Board[] {
    return [...this.read().boards].sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );
  }

  getBoard(id: string): Board | null {
    return this.read().boards.find((b) => b.id === id) ?? null;
  }

  createBoard(input: Partial<Board>): Board {
    const db = this.read();
    const nowIso = new Date().toISOString();
    const base = buildSeed().boards[2]!; // draft template shape
    const board: Board = {
      ...base,
      ...input,
      id: `board_${randomId(6)}`,
      organization_id: this.getOrganization().id,
      created_by: CURRENT_USER_ID,
      status: input.status ?? "draft",
      appearance: { ...base.appearance, ...(input.appearance ?? {}) },
      participation: { ...base.participation, ...(input.participation ?? {}) },
      moderation: { ...base.moderation, ...(input.moderation ?? {}) },
      collaborator_ids: input.collaborator_ids ?? [],
      tags: input.tags ?? [],
      created_at: nowIso,
      updated_at: nowIso,
      archived_at: null,
      last_activated_at: null,
    };
    db.boards.unshift(board);
    this.commit({ kind: "board-list" });
    return board;
  }

  updateBoard(id: string, patch: Partial<Board>): Board {
    const db = this.read();
    const idx = db.boards.findIndex((b) => b.id === id);
    if (idx === -1) throw new Error(`board ${id} not found`);
    const prev = db.boards[idx]!;
    const next: Board = {
      ...prev,
      ...patch,
      appearance: { ...prev.appearance, ...(patch.appearance ?? {}) },
      participation: { ...prev.participation, ...(patch.participation ?? {}) },
      moderation: { ...prev.moderation, ...(patch.moderation ?? {}) },
      id: prev.id,
      updated_at: new Date().toISOString(),
    };
    db.boards[idx] = next;
    this.commit({ kind: "board-list" });
    return next;
  }

  setBoardStatus(id: string, status: Board["status"]): Board {
    return this.updateBoard(id, {
      status,
      archived_at: status === "archived" ? new Date().toISOString() : null,
    });
  }

  duplicateBoard(id: string): Board {
    const src = this.getBoard(id);
    if (!src) throw new Error(`board ${id} not found`);
    return this.createBoard({
      ...src,
      internal_name: `${src.internal_name} (עותק)`,
      public_title: src.public_title,
      status: "draft",
    });
  }

  // ---- rooms ----------------------------------------------------------------

  getRoom(id: string): LiveRoom | null {
    return this.read().rooms.find((r) => r.id === id) ?? null;
  }

  getRoomByPublicId(publicId: string): LiveRoom | null {
    return this.read().rooms.find((r) => r.public_id === publicId) ?? null;
  }

  findRoomByCode(code: string): LiveRoom | null {
    const clean = code.replace(/\s/g, "");
    return (
      this.read()
        .rooms.filter((r) => r.room_code === clean)
        // Prefer a still-joinable room if codes ever collide across history.
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] ?? null
    );
  }

  listRoomsForBoard(boardId: string): LiveRoom[] {
    return this.read()
      .rooms.filter((r) => r.board_id === boardId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  getActiveRoomForBoard(boardId: string): LiveRoom | null {
    return (
      this.read().rooms.find(
        (r) => r.board_id === boardId && ["active", "paused", "read_only", "suspended"].includes(r.status),
      ) ?? null
    );
  }

  listActiveRooms(): LiveRoom[] {
    return this.read().rooms.filter((r) =>
      ["active", "paused", "read_only", "suspended"].includes(r.status),
    );
  }

  activateRoom(
    boardId: string,
    opts: { sessionLabel?: string; mode?: "fresh" | "continue"; facilitatorId?: string } = {},
  ): LiveRoom {
    const db = this.read();
    const board = this.getBoard(boardId);
    if (!board) throw new Error(`board ${boardId} not found`);
    const nowIso = new Date().toISOString();
    const code = generateRoomCode();
    const room: LiveRoom = {
      id: `room_${randomId(6)}`,
      board_id: boardId,
      organization_id: board.organization_id,
      public_id: `r-${randomId(10)}`,
      room_code: code,
      session_label: opts.sessionLabel?.trim() || null,
      status: "active",
      layout: board.default_layout,
      focused_submission_id: null,
      qr_overlay_visible: false,
      facilitator_ids: [opts.facilitatorId ?? CURRENT_USER_ID],
      participant_count: 0,
      started_at: nowIso,
      ended_at: null,
      last_activity_at: nowIso,
      created_by: opts.facilitatorId ?? CURRENT_USER_ID,
      created_at: nowIso,
    };
    db.rooms.unshift(room);

    // "Continue" carries forward the most recent prior session's submissions.
    if (opts.mode === "continue") {
      const prior = this.listRoomsForBoard(boardId).find((r) => r.id !== room.id && r.status === "ended");
      if (prior) {
        const carried = db.submissions
          .filter((s) => s.room_id === prior.id && s.status !== "deleted")
          .map((s) => ({ ...s, id: `sub_${randomId(6)}`, room_id: room.id }));
        db.submissions.push(...carried);
      }
    }

    this.updateBoard(boardId, { last_activated_at: nowIso });
    this.logActivity(room.id, "room_activated", opts.facilitatorId ?? CURRENT_USER_ID, true);
    this.commit({ kind: "board-list" });
    return room;
  }

  private patchRoom(id: string, patch: Partial<LiveRoom>, signal: RealtimeSignal["kind"]): LiveRoom {
    const db = this.read();
    const idx = db.rooms.findIndex((r) => r.id === id);
    if (idx === -1) throw new Error(`room ${id} not found`);
    const next = { ...db.rooms[idx]!, ...patch };
    db.rooms[idx] = next;
    this.commit({ kind: signal, roomId: id });
    return next;
  }

  /** Records meaningful activity → resets the inactivity clock. */
  touchActivity(id: string): void {
    this.patchRoom(id, { last_activity_at: new Date().toISOString() }, "room");
  }

  setRoomStatus(id: string, status: RoomStatus): LiveRoom {
    const patch: Partial<LiveRoom> = { status };
    if (status === "ended") patch.ended_at = new Date().toISOString();
    if (status === "active") patch.last_activity_at = new Date().toISOString();
    return this.patchRoom(id, patch, "room");
  }

  pauseRoom(id: string) {
    this.logActivity(id, "room_paused", CURRENT_USER_ID, true);
    return this.setRoomStatus(id, "paused");
  }
  resumeRoom(id: string) {
    this.logActivity(id, "room_resumed", CURRENT_USER_ID, true);
    return this.setRoomStatus(id, "active");
  }
  setReadOnly(id: string, on: boolean) {
    return this.setRoomStatus(id, on ? "read_only" : "active");
  }
  endRoom(id: string) {
    this.logActivity(id, "room_ended", CURRENT_USER_ID, true);
    return this.setRoomStatus(id, "ended");
  }
  reactivateRoom(id: string) {
    this.logActivity(id, "room_reactivated", CURRENT_USER_ID, true);
    return this.patchRoom(
      id,
      { status: "active", last_activity_at: new Date().toISOString() },
      "room",
    );
  }

  setLayout(id: string, layout: DisplayLayout) {
    return this.patchRoom(id, { layout }, "layout");
  }
  setFocus(id: string, submissionId: string | null) {
    return this.patchRoom(id, { focused_submission_id: submissionId }, "focus");
  }
  setQrOverlay(id: string, visible: boolean) {
    return this.patchRoom(id, { qr_overlay_visible: visible }, "qr-overlay");
  }

  /**
   * Server-timestamp-based inactivity check. Callable from any tab (or a cron/
   * edge function once on Supabase). Suspends an active room after 30 minutes
   * without meaningful activity. Returns the (possibly updated) room.
   */
  checkAndApplyInactivity(id: string, nowMs = Date.now()): LiveRoom | null {
    const room = this.getRoom(id);
    if (!room) return null;
    if (room.status !== "active" && room.status !== "paused") return room;
    const idle = nowMs - new Date(room.last_activity_at).getTime();
    if (idle >= INACTIVITY_SUSPEND_MS) {
      this.logActivity(id, "room_suspended", null, false);
      return this.setRoomStatus(id, "suspended");
    }
    return room;
  }

  // ---- participants ---------------------------------------------------------

  joinRoom(publicId: string, displayName: string | null): { room: LiveRoom; session: ParticipantSession } | null {
    const room = this.getRoomByPublicId(publicId);
    if (!room) return null;
    const db = this.read();
    const nowIso = new Date().toISOString();
    const session: ParticipantSession = {
      id: `part_${randomId(8)}`,
      room_id: room.id,
      display_name: displayName?.trim() || null,
      created_at: nowIso,
      last_seen_at: nowIso,
    };
    db.participants.push(session);
    const updated = this.patchRoom(
      room.id,
      { participant_count: room.participant_count + 1, last_activity_at: nowIso },
      "participants",
    );
    this.logActivity(room.id, "participant_joined", null, true);
    return { room: updated, session };
  }

  getParticipant(id: string): ParticipantSession | null {
    return this.read().participants.find((p) => p.id === id) ?? null;
  }

  // ---- submissions ----------------------------------------------------------

  listSubmissions(roomId: string): Submission[] {
    return this.read()
      .submissions.filter((s) => s.room_id === roomId && s.status !== "deleted")
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  listSubmissionsForParticipant(roomId: string, sessionId: string): Submission[] {
    return this.listSubmissions(roomId).filter((s) => s.participant_session_id === sessionId);
  }

  countByStatus(roomId: string): Record<SubmissionStatus, number> {
    const acc: Record<SubmissionStatus, number> = {
      pending: 0,
      published: 0,
      hidden: 0,
      rejected: 0,
      deleted: 0,
    };
    for (const s of this.read().submissions) {
      if (s.room_id === roomId) acc[s.status]++;
    }
    return acc;
  }

  createSubmission(input: {
    roomId: string;
    type: SubmissionType;
    text?: string | null;
    mediaUrl?: string | null;
    participantSessionId: string;
    displayName?: string | null;
    anonymous?: boolean;
    moderationMode: "immediate" | "approval";
  }): Submission {
    const db = this.read();
    const nowIso = new Date().toISOString();
    const submission: Submission = {
      id: `sub_${randomId(8)}`,
      room_id: input.roomId,
      organization_id: this.getRoom(input.roomId)?.organization_id ?? this.getOrganization().id,
      type: input.type,
      text_content: input.text ?? null,
      media_url: input.mediaUrl ?? null,
      participant_session_id: input.participantSessionId,
      display_name: input.anonymous ? null : input.displayName ?? null,
      anonymous: !!input.anonymous,
      status: input.moderationMode === "approval" ? "pending" : "published",
      pinned: false,
      created_at: nowIso,
      updated_at: nowIso,
    };
    db.submissions.push(submission);
    this.logActivity(input.roomId, "submission_created", null, true);
    this.commit({ kind: "submissions", roomId: input.roomId });
    return submission;
  }

  private setSubmission(id: string, patch: Partial<Submission>): Submission | null {
    const db = this.read();
    const idx = db.submissions.findIndex((s) => s.id === id);
    if (idx === -1) return null;
    const next = { ...db.submissions[idx]!, ...patch, updated_at: new Date().toISOString() };
    db.submissions[idx] = next;
    return next;
  }

  moderate(id: string, action: ModerationActionType, actorId = CURRENT_USER_ID): Submission | null {
    const sub = this.read().submissions.find((s) => s.id === id);
    if (!sub) return null;
    let patch: Partial<Submission> = {};
    let meaningful = true;
    switch (action) {
      case "approve":
        patch = { status: "published" };
        this.logActivity(sub.room_id, "submission_approved", actorId, true);
        break;
      case "reject":
        patch = { status: "rejected" };
        this.logActivity(sub.room_id, "submission_rejected", actorId, true);
        break;
      case "hide":
        patch = { status: "hidden" };
        break;
      case "restore":
        patch = { status: "published" };
        break;
      case "delete":
        patch = { status: "deleted" };
        break;
      case "pin":
        patch = { pinned: true };
        meaningful = false;
        break;
      case "unpin":
        patch = { pinned: false };
        meaningful = false;
        break;
      default:
        break;
    }
    const next = this.setSubmission(id, patch);
    this.recordModeration(sub.room_id, id, action, actorId);
    // Focused item that leaves the display should also drop focus.
    if (next && next.status !== "published") {
      const room = this.getRoom(sub.room_id);
      if (room?.focused_submission_id === id) {
        this.setFocus(sub.room_id, null);
      }
    }
    if (meaningful) this.touchActivity(sub.room_id);
    this.commit({ kind: "submissions", roomId: sub.room_id });
    return next;
  }

  /** Restore a soft-deleted or hidden submission back to published (undo). */
  restoreTo(id: string, status: SubmissionStatus): Submission | null {
    const sub = this.read().submissions.find((s) => s.id === id);
    if (!sub) return null;
    const next = this.setSubmission(id, { status });
    this.commit({ kind: "submissions", roomId: sub.room_id });
    return next;
  }

  // ---- activity + moderation log -------------------------------------------

  private logActivity(roomId: string, type: ActivityEventType, actorId: string | null, meaningful: boolean): void {
    this.read().activity.push({
      id: uuid(),
      room_id: roomId,
      type,
      actor_id: actorId,
      meaningful,
      created_at: new Date().toISOString(),
    });
  }

  private recordModeration(
    roomId: string,
    submissionId: string,
    action: ModerationActionType,
    actorId: string,
  ): void {
    this.read().moderation.push({
      id: uuid(),
      room_id: roomId,
      submission_id: submissionId,
      actor_id: actorId,
      action,
      created_at: new Date().toISOString(),
    });
  }

  listActivity(roomId: string): ActivityEvent[] {
    return this.read()
      .activity.filter((a) => a.room_id === roomId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  // ---- session history ------------------------------------------------------

  getSessionSummaries(boardId: string): SessionSummary[] {
    return this.listRoomsForBoard(boardId).map((room) => {
      const subs = this.read().submissions.filter((s) => s.room_id === room.id && s.status !== "deleted");
      return {
        room,
        submission_count: subs.length,
        published_count: subs.filter((s) => s.status === "published").length,
        duration_minutes: minutesBetween(room.started_at, room.ended_at ?? new Date().toISOString()),
      };
    });
  }

  getBoardForRoom(roomId: string): Board | null {
    const room = this.getRoom(roomId);
    return room ? this.getBoard(room.board_id) : null;
  }
}

export const db = new LocalDB();
export { CURRENT_USER_ID };
