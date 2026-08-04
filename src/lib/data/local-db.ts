"use client";

import type {
  ActivityEvent,
  ActivityEventType,
  Board,
  FolderSummary,
  LastSession,
  DisplayLayout,
  LiveRoom,
  ModerationActionType,
  ParticipantSession,
  RoomMode,
  SubmissionComment,
  RoomStatus,
  SessionSummary,
  Submission,
  SubmissionStatus,
  SubmissionType,
} from "@/lib/types";
import { INACTIVITY_SUSPEND_MS } from "@/lib/constants";
import { formatRoomCode, generateRoomCode, minutesBetween, randomId, uuid } from "@/lib/utils";
import { normalizeBoard } from "@/lib/board-visuals";
import { accruesIdleTime, dueRoomStatus, isOpenRoom, normalizeRoom } from "@/lib/rooms";
import { countsAsContribution, usableSeedPosts } from "@/lib/posts";
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
    // In the browser, refresh our in-memory cache the instant *another* tab
    // writes. The data layer registers this raw listener at module load —
    // before any component subscribes — so RealtimeBus (which dispatches in
    // subscription order) always runs it first. By the time a component's
    // useLiveQuery refresh runs for the same signal, `memory` is already fresh.
    // Reloading eagerly here (rather than lazily on the next read) removes the
    // read-ordering race that could otherwise serve stale data for one tick.
    if (typeof window !== "undefined") {
      realtime.subscribeRaw(() => {
        if (this.syncing) return; // ignore the echo from our own commit
        this.reloadFromStorage();
      });
      // BroadcastChannel delivers the *signal* fast, but localStorage writes are
      // NOT synchronously visible across renderer processes — a cross-tab signal
      // can arrive before the writing tab's data has propagated here, so the
      // reload above may read a stale value. The `storage` event fires only once
      // the new value is committed, so reloading here is guaranteed fresh. This
      // listener is registered at module load (before any component subscribes),
      // so memory is refreshed before useLiveQuery's own `storage` handler runs.
      window.addEventListener("storage", (e) => {
        if (e.key === null || e.key === STORAGE_KEY) this.reloadFromStorage();
      });
    }
  }

  private reloadFromStorage(): void {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) this.memory = hydrate(JSON.parse(raw) as Database);
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
        this.memory = hydrate(JSON.parse(raw) as Database);
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
      // Room-scoped signals carry the internal room id, but the display and
      // participant pages subscribe by the PUBLIC id — emit that variant too so
      // pause/focus/layout/qr/room-state changes reach them without a refresh.
      if (signal.roomId) {
        const room = this.memory?.rooms.find((r) => r.id === signal.roomId);
        if (room?.public_id && room.public_id !== signal.roomId) {
          realtime.publish({ ...signal, roomId: room.public_id });
        }
      }
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

  // ---- folders --------------------------------------------------------------

  /**
   * Folders shown on the dashboard: the persisted registry merged with any
   * folder names still referenced by boards (so legacy/ad-hoc folders show up
   * too), each with its live board count. Registry order first, then the rest
   * alphabetically. Boards link to a folder by name (`Board.folder`).
   */
  listFolders(): FolderSummary[] {
    const db = this.read();
    const counts = new Map<string, number>();
    for (const b of db.boards) {
      if (b.status === "archived") continue;
      const f = b.folder?.trim();
      if (f) counts.set(f, (counts.get(f) ?? 0) + 1);
    }
    const registry = [...db.folders].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, "he"));
    const seen = new Set<string>();
    const out: FolderSummary[] = [];
    for (const f of registry) {
      if (seen.has(f.name)) continue;
      seen.add(f.name);
      out.push({ name: f.name, count: counts.get(f.name) ?? 0 });
    }
    for (const name of [...counts.keys()].sort((a, b) => a.localeCompare(b, "he"))) {
      if (!seen.has(name)) {
        seen.add(name);
        out.push({ name, count: counts.get(name)! });
      }
    }
    return out;
  }

  /** Number of non-archived boards not assigned to any folder. */
  countUnfiled(): number {
    return this.read().boards.filter((b) => b.status !== "archived" && !b.folder?.trim()).length;
  }

  createFolder(name: string): void {
    const clean = name.trim();
    if (!clean) return;
    const db = this.read();
    if (db.folders.some((f) => f.name === clean)) return; // idempotent by name
    const maxSort = db.folders.reduce((m, f) => Math.max(m, f.sort), -1);
    db.folders.push({
      id: `folder_${randomId(6)}`,
      organization_id: this.getOrganization().id,
      name: clean,
      sort: maxSort + 1,
      created_at: new Date().toISOString(),
    });
    this.commit({ kind: "board-list" });
  }

  renameFolder(oldName: string, newName: string): void {
    const clean = newName.trim();
    if (!clean || clean === oldName) return;
    const db = this.read();
    if (db.folders.some((f) => f.name === clean)) return; // avoid collision
    const entry = db.folders.find((f) => f.name === oldName);
    if (entry) entry.name = clean;
    else db.folders.push({ id: `folder_${randomId(6)}`, organization_id: this.getOrganization().id, name: clean, sort: db.folders.length, created_at: new Date().toISOString() });
    for (const b of db.boards) if (b.folder === oldName) b.folder = clean;
    this.commit({ kind: "board-list" });
  }

  /** Remove a folder; boards inside it become unfiled (never deleted). */
  deleteFolder(name: string): void {
    const db = this.read();
    db.folders = db.folders.filter((f) => f.name !== name);
    for (const b of db.boards) if (b.folder === name) b.folder = null;
    this.commit({ kind: "board-list" });
  }

  /** Move a board into a folder (or out of all folders when null). */
  setBoardFolder(boardId: string, folder: string | null): void {
    const clean = folder?.trim() || null;
    this.updateBoard(boardId, { folder: clean });
  }

  /** Persist a new folder order (by name). Registers any not-yet-persisted folder. */
  reorderFolders(names: string[]): void {
    const db = this.read();
    names.forEach((name, i) => {
      const entry = db.folders.find((f) => f.name === name);
      if (entry) entry.sort = i;
      else db.folders.push({ id: `folder_${randomId(6)}`, organization_id: this.getOrganization().id, name, sort: i, created_at: new Date().toISOString() });
    });
    this.commit({ kind: "board-list" });
  }

  // ---- boards ---------------------------------------------------------------

  listBoards(): Board[] {
    return [...this.read().boards]
      .map(normalizeBoard)
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  }

  /** Stats from the board's most recent ended session (for the dashboard card). */
  getLastSession(boardId: string): LastSession | null {
    const last = this.listRoomsForBoard(boardId).find((r) => r.status === "ended");
    if (!last) return null;
    return {
      participants: last.participant_count,
      items: this.listSubmissions(last.id).length,
      endedAt: last.ended_at ?? last.created_at,
    };
  }

  getBoard(id: string): Board | null {
    const board = this.read().boards.find((b) => b.id === id);
    return board ? normalizeBoard(board) : null;
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

  /** Permanently delete a board and everything under it (rooms, submissions…). */
  deleteBoard(id: string): void {
    const db = this.read();
    const roomIds = new Set(db.rooms.filter((r) => r.board_id === id).map((r) => r.id));
    db.boards = db.boards.filter((b) => b.id !== id);
    db.rooms = db.rooms.filter((r) => r.board_id !== id);
    db.submissions = db.submissions.filter((s) => !roomIds.has(s.room_id));
    db.participants = db.participants.filter((p) => !roomIds.has(p.room_id));
    db.activity = db.activity.filter((a) => !roomIds.has(a.room_id));
    db.moderation = db.moderation.filter((m) => !roomIds.has(m.room_id));
    db.comments = db.comments.filter((c) => !roomIds.has(c.room_id));
    this.commit({ kind: "board-list" });
  }

  // ---- rooms ----------------------------------------------------------------

  getRoom(id: string): LiveRoom | null {
    const room = this.read().rooms.find((r) => r.id === id);
    return room ? normalizeRoom(room) : null;
  }

  getRoomByPublicId(publicId: string): LiveRoom | null {
    const room = this.read().rooms.find((r) => r.public_id === publicId);
    return room ? normalizeRoom(room) : null;
  }

  findRoomByCode(code: string): LiveRoom | null {
    const clean = code.replace(/\s/g, "");
    const room =
      this.read()
        .rooms.filter((r) => r.room_code === clean)
        // Prefer a still-joinable room if codes ever collide across history.
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] ?? null;
    return room ? normalizeRoom(room) : null;
  }

  listRoomsForBoard(boardId: string): LiveRoom[] {
    return this.read()
      .rooms.filter((r) => r.board_id === boardId)
      .map(normalizeRoom)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  getActiveRoomForBoard(boardId: string): LiveRoom | null {
    return (
      this.read()
        .rooms.filter((r) => r.board_id === boardId && ["active", "paused", "read_only", "suspended"].includes(r.status))
        .map(normalizeRoom)[0] ?? null
    );
  }

  /** The board's current open collection window, if one is running. */
  getOpenRoomForBoard(boardId: string): LiveRoom | null {
    const room = this.getActiveRoomForBoard(boardId);
    return room && isOpenRoom(room) ? room : null;
  }

  listActiveRooms(): LiveRoom[] {
    return this.read()
      .rooms.filter((r) => ["active", "paused", "read_only", "suspended"].includes(r.status))
      .map(normalizeRoom);
  }

  activateRoom(
    boardId: string,
    opts: {
      sessionLabel?: string;
      /** Whether to carry the previous session's content into the new room. */
      content?: "fresh" | "continue";
      /** Live session (default) or an open collection window. */
      mode?: RoomMode;
      /** Open rooms: when collection stops accepting. */
      closesAt?: string | null;
      facilitatorId?: string;
    } = {},
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
      mode: opts.mode ?? "live",
      closes_at: opts.mode === "open" ? opts.closesAt ?? null : null,
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

    // The board's opening content becomes real posts in this room, so it flows
    // through the display, moderation, results and export like anything else.
    // Published outright: sending the facilitator's own guidance to her own
    // approval queue would be nonsense.
    const facilitatorId = opts.facilitatorId ?? CURRENT_USER_ID;
    for (const seed of usableSeedPosts(board.seed_posts)) {
      db.submissions.push({
        id: `sub_${randomId(8)}`,
        room_id: room.id,
        organization_id: board.organization_id,
        type: seed.type,
        text_content: seed.text.trim() || null,
        media_url: seed.media_url,
        zone_id: seed.zone_id,
        participant_session_id: null,
        author_profile_id: facilitatorId,
        display_name: this.getProfile(facilitatorId)?.full_name ?? null,
        anonymous: false,
        status: "published",
        pinned: seed.pinned,
        created_at: nowIso,
        updated_at: nowIso,
      });
    }

    // "Continue" carries forward the most recent prior session's submissions.
    if (opts.content === "continue") {
      const prior = this.listRoomsForBoard(boardId).find((r) => r.id !== room.id && r.status === "ended");
      if (prior) {
        const carried = db.submissions
          // Carry only what participants contributed. The prior room's copies of
          // the board's opening content were materialized above from the board's
          // CURRENT seed posts — carrying them too would double every guidance
          // card, and would resurrect wording the facilitator has since edited.
          .filter((s) => s.room_id === prior.id && s.status !== "deleted" && !s.author_profile_id)
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
    const next = normalizeRoom({ ...db.rooms[idx]!, ...patch });
    db.rooms[idx] = next;
    this.commit({ kind: signal, roomId: id });
    // A room's status change flips its "active now" membership, which the
    // dashboard / board list / detail watch via the board-list scope.
    if (patch.status !== undefined) realtime.publish({ kind: "board-list" });
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
   * Server-timestamp-based lifecycle check. Callable from any tab (or a cron /
   * edge function once on Supabase). Returns the (possibly updated) room.
   *
   * Live sessions suspend after 30 minutes without meaningful activity. Open
   * collections never do — quiet stretches are normal for them — and instead
   * fall to read-only once their deadline passes.
   */
  checkAndApplyInactivity(id: string, nowMs = Date.now()): LiveRoom | null {
    const room = this.getRoom(id);
    if (!room) return null;
    const due = dueRoomStatus(room, nowMs);
    if (due) {
      this.logActivity(id, "collection_closed", null, false);
      return this.setRoomStatus(id, due);
    }
    if (!accruesIdleTime(room)) return room;
    const idle = nowMs - new Date(room.last_activity_at).getTime();
    if (idle >= INACTIVITY_SUSPEND_MS) {
      this.logActivity(id, "room_suspended", null, false);
      return this.setRoomStatus(id, "suspended");
    }
    return room;
  }

  /** Change an open collection's deadline (or clear it with null). */
  setCollectionDeadline(id: string, closesAt: string | null): LiveRoom {
    const room = this.getRoom(id);
    if (!room) throw new Error(`room ${id} not found`);
    const patch: Partial<LiveRoom> = { closes_at: closesAt };
    // Extending the deadline on an already-closed collection reopens it —
    // otherwise the facilitator changes the date and nothing happens.
    if (room.status === "read_only" && closesAt && new Date(closesAt).getTime() > Date.now()) {
      patch.status = "active";
      patch.last_activity_at = new Date().toISOString();
    }
    return this.patchRoom(id, patch, "room");
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

  /** Roster of participants who joined a room, newest first. */
  listParticipants(roomId: string): ParticipantSession[] {
    return this.read()
      .participants.filter((p) => p.room_id === roomId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  /** Clear all content from the board (soft-delete every submission), keep the room. */
  clearSubmissions(roomId: string): void {
    const db = this.read();
    const nowIso = new Date().toISOString();
    db.submissions = db.submissions.map((s) =>
      s.room_id === roomId && s.status !== "deleted" ? { ...s, status: "deleted", updated_at: nowIso } : s,
    );
    // A reply outlives nothing — it goes with the post it was a reply to.
    db.comments = db.comments.map((c) =>
      c.room_id === roomId && c.status !== "deleted" ? { ...c, status: "deleted", updated_at: nowIso } : c,
    );
    this.setFocus(roomId, null);
    this.commit({ kind: "submissions", roomId });
    this.commit({ kind: "comments", roomId });
  }

  /** Reset the whole session: clear content AND remove all participants. */
  resetSession(roomId: string): void {
    this.clearSubmissions(roomId);
    this.resetParticipants(roomId);
  }

  /** Clear the room's participant roster and reset the live count to zero. */
  resetParticipants(id: string): void {
    const db = this.read();
    db.participants = db.participants.filter((p) => p.room_id !== id);
    this.patchRoom(id, { participant_count: 0 }, "participants");
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

  /**
   * How much participants have actually contributed. Excludes the facilitator's
   * own opening posts — counting her guidance cards would report an empty board
   * as a busy one.
   */
  countContributions(roomId: string): number {
    return this.read().submissions.filter((s) => s.room_id === roomId && countsAsContribution(s)).length;
  }

  createSubmission(input: {
    roomId: string;
    type: SubmissionType;
    text?: string | null;
    mediaUrl?: string | null;
    /** Null when the facilitator is posting (see `authorProfileId`). */
    participantSessionId: string | null;
    /** Set when the facilitator posts to her own board mid-session. */
    authorProfileId?: string | null;
    displayName?: string | null;
    anonymous?: boolean;
    zoneId?: string | null;
    moderationMode: "immediate" | "approval";
  }): Submission {
    const db = this.read();
    const nowIso = new Date().toISOString();
    const byFacilitator = !!input.authorProfileId;
    const submission: Submission = {
      id: `sub_${randomId(8)}`,
      room_id: input.roomId,
      organization_id: this.getRoom(input.roomId)?.organization_id ?? this.getOrganization().id,
      type: input.type,
      text_content: input.text ?? null,
      media_url: input.mediaUrl ?? null,
      zone_id: input.zoneId ?? null,
      participant_session_id: input.participantSessionId,
      author_profile_id: input.authorProfileId ?? null,
      display_name: input.anonymous ? null : input.displayName ?? null,
      anonymous: !byFacilitator && !!input.anonymous,
      // The facilitator's own post never queues for her own approval.
      status: !byFacilitator && input.moderationMode === "approval" ? "pending" : "published",
      pinned: false,
      created_at: nowIso,
      updated_at: nowIso,
    };
    db.submissions.push(submission);
    this.logActivity(input.roomId, "submission_created", input.authorProfileId ?? null, true);
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
        for (const c of this.read().comments) {
          if (c.submission_id === id && c.status !== "deleted") c.status = "deleted";
        }
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

  // ---- comments -------------------------------------------------------------

  /** Visible replies on a post, oldest first — a thread reads in order. */
  listComments(submissionId: string): SubmissionComment[] {
    return this.read()
      .comments.filter((c) => c.submission_id === submissionId && c.status === "published")
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }

  /** Reply counts for a whole room in one pass, for list badges. */
  countCommentsBySubmission(roomId: string): Record<string, number> {
    const acc: Record<string, number> = {};
    for (const c of this.read().comments) {
      if (c.room_id === roomId && c.status === "published") {
        acc[c.submission_id] = (acc[c.submission_id] ?? 0) + 1;
      }
    }
    return acc;
  }

  createComment(input: {
    submissionId: string;
    body: string;
    /** Facilitator reply. */
    authorProfileId?: string | null;
    /** Participant reply — requires the board's allow_participant_comments. */
    participantSessionId?: string | null;
    displayName?: string | null;
    anonymous?: boolean;
  }): SubmissionComment | null {
    const db = this.read();
    const sub = db.submissions.find((s) => s.id === input.submissionId);
    if (!sub) return null;
    const body = input.body.trim();
    if (!body) return null;
    const nowIso = new Date().toISOString();
    const comment: SubmissionComment = {
      id: `cmt_${randomId(8)}`,
      submission_id: sub.id,
      room_id: sub.room_id,
      organization_id: sub.organization_id,
      body,
      author_profile_id: input.authorProfileId ?? null,
      participant_session_id: input.participantSessionId ?? null,
      display_name: input.anonymous ? null : input.displayName ?? null,
      anonymous: !input.authorProfileId && !!input.anonymous,
      status: "published",
      created_at: nowIso,
      updated_at: nowIso,
    };
    db.comments.push(comment);
    this.logActivity(sub.room_id, "comment_created", input.authorProfileId ?? null, true);
    this.touchActivity(sub.room_id);
    this.commit({ kind: "comments", roomId: sub.room_id });
    return comment;
  }

  /** Soft-delete a reply (the facilitator moderating a thread). */
  deleteComment(id: string): void {
    const db = this.read();
    const idx = db.comments.findIndex((c) => c.id === id);
    if (idx === -1) return;
    const comment = db.comments[idx]!;
    db.comments[idx] = { ...comment, status: "deleted", updated_at: new Date().toISOString() };
    this.commit({ kind: "comments", roomId: comment.room_id });
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

/**
 * Fill in database slices added after a browser last wrote its local copy.
 * Without this, a returning user's stored DB has no `comments` array and the
 * first reply attempt throws on a missing property.
 */
function hydrate(parsed: Database): Database {
  if (!Array.isArray(parsed.comments)) parsed.comments = [];
  return parsed;
}

export const db = new LocalDB();
export { CURRENT_USER_ID };
