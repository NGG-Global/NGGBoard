"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import type {
  Board,
  DisplayLayout,
  LiveRoom,
  ModerationActionType,
  ParticipantSession,
  Profile,
  RoomStatus,
  SessionSummary,
  Submission,
  SubmissionStatus,
  SubmissionType,
} from "@/lib/types";
import { INACTIVITY_SUSPEND_MS, DEFAULT_IMAGE_SIZE_LIMIT_MB, DEFAULT_TEXT_CHAR_LIMIT } from "@/lib/constants";
import { generateRoomCode, minutesBetween, randomId, uuid } from "@/lib/utils";
import { getSupabase } from "@/lib/supabase";
import { realtime, type RealtimeScope, type RealtimeSignal } from "./realtime";
import type { Database } from "./seed";

const emptyDb = (): Database => ({
  organizations: [],
  profiles: [],
  boards: [],
  rooms: [],
  submissions: [],
  participants: [],
  activity: [],
  moderation: [],
});

/**
 * Supabase backend that preserves LocalDB's synchronous read surface.
 *
 * Reads are served from an in-memory cache; the cache is hydrated lazily and
 * kept live by Supabase Realtime (postgres_changes on live_rooms + submissions).
 * Writes update the cache optimistically (with client-generated UUIDs), emit a
 * local realtime signal so `useLiveQuery` re-renders, then persist to Supabase.
 * The authoritative row later arrives over Realtime and reconciles the cache.
 */
class SupabaseDB {
  private cache = emptyDb();
  private currentProfileId: string | null = null;
  private orgHydrated = false;
  private loadingRooms = new Set<string>();
  private channels = new Map<string, RealtimeChannel>();

  // ---- signal plumbing ------------------------------------------------------
  subscribe(scope: RealtimeScope, cb: (s: RealtimeSignal) => void): () => void {
    return realtime.subscribe(scope, cb);
  }
  private emit(kind: RealtimeSignal["kind"], roomId?: string) {
    realtime.publish({ kind, roomId });
  }

  setCurrentProfile(id: string | null) {
    this.currentProfileId = id;
    if (id) void this.hydrateOrg();
  }

  // ---- hydration ------------------------------------------------------------
  private async hydrateOrg(force = false) {
    const sb = getSupabase();
    if (!sb || (this.orgHydrated && !force)) return;
    this.orgHydrated = true;
    const [{ data: profiles }, { data: orgs }, { data: boards }] = await Promise.all([
      sb.from("profiles").select("*"),
      sb.from("organizations").select("*"),
      sb.from("boards").select("*").order("updated_at", { ascending: false }),
    ]);
    if (profiles) this.cache.profiles = profiles as Profile[];
    if (orgs) this.cache.organizations = orgs as Database["organizations"];
    if (boards) this.cache.boards = boards as Board[];
    this.emit("board-list");
  }

  /** Load a room (+ board, submissions, participants) and subscribe to it. */
  private async ensureRoomByPublicId(publicId: string) {
    const key = `pub:${publicId}`;
    if (this.loadingRooms.has(key)) return;
    this.loadingRooms.add(key);
    const sb = getSupabase();
    if (!sb) return;

    // Authenticated path: direct table read (org-scoped by RLS).
    if (this.currentProfileId) {
      const { data: room } = await sb.from("live_rooms").select("*").eq("public_id", publicId).maybeSingle();
      if (room) return this.loadRoomGraph(room as LiveRoom);
    }
    // Anonymous path: the participant-safe view synthesises Board + Room.
    const { data: view } = await sb
      .from("public_board_view")
      .select("*")
      .eq("public_id", publicId)
      .maybeSingle();
    if (view) this.absorbPublicView(view as PublicViewRow);
    const target = this.cache.rooms.find((r) => r.public_id === publicId);
    if (target) await this.loadSubmissions(target.id, false);
    this.subscribePublic(publicId);
    this.emit("room", target?.id);
  }

  private async ensureRoomById(roomId: string) {
    if (this.loadingRooms.has(roomId) || this.cache.rooms.some((r) => r.id === roomId)) return;
    this.loadingRooms.add(roomId);
    const sb = getSupabase();
    if (!sb) return;
    const { data: room } = await sb.from("live_rooms").select("*").eq("id", roomId).maybeSingle();
    if (room) await this.loadRoomGraph(room as LiveRoom);
  }

  private async loadRoomGraph(room: LiveRoom) {
    this.upsert(this.cache.rooms, room);
    const sb = getSupabase();
    if (sb && !this.cache.boards.some((b) => b.id === room.board_id)) {
      const { data: board } = await sb.from("boards").select("*").eq("id", room.board_id).maybeSingle();
      if (board) this.upsert(this.cache.boards, board as Board);
    }
    await this.loadSubmissions(room.id, true);
    this.subscribeRoom(room.id);
    this.emit("room", room.id);
  }

  private async loadSubmissions(roomId: string, all: boolean) {
    const sb = getSupabase();
    if (!sb) return;
    let q = sb.from("submissions").select("*").eq("room_id", roomId);
    if (!all) q = q.eq("status", "published");
    const { data } = await q;
    if (data) {
      this.cache.submissions = this.cache.submissions.filter((s) => s.room_id !== roomId).concat(data as Submission[]);
      this.emit("submissions", roomId);
    }
  }

  private absorbPublicView(v: PublicViewRow) {
    const boardId = `viewboard_${v.public_id}`;
    const board: Board = {
      id: boardId,
      organization_id: "public",
      created_by: "public",
      internal_name: v.public_title,
      public_title: v.public_title,
      public_subtitle: v.public_subtitle ?? "",
      internal_description: "",
      status: "ready",
      appearance: v.appearance,
      participation: { ...defaultParticipation(), ...(v.participation ?? {}) },
      moderation: { mode: (v.moderation_mode as "immediate" | "approval") ?? "immediate", hide_identity_on_display: !!v.hide_identity_on_display, blocked_words: [] },
      sharing: "link",
      default_layout: v.layout,
      default_sort: "newest",
      tags: [],
      folder: null,
      collaborator_ids: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      archived_at: null,
      last_activated_at: null,
    };
    this.upsert(this.cache.boards, board);
    const room: LiveRoom = {
      id: `viewroom_${v.public_id}`,
      board_id: boardId,
      organization_id: "public",
      public_id: v.public_id,
      room_code: v.room_code,
      session_label: v.session_label,
      status: v.status,
      layout: v.layout,
      focused_submission_id: v.focused_submission_id,
      qr_overlay_visible: v.qr_overlay_visible,
      facilitator_ids: [],
      participant_count: v.participant_count,
      started_at: null,
      ended_at: null,
      last_activity_at: new Date().toISOString(),
      created_by: "public",
      created_at: new Date().toISOString(),
    };
    this.upsert(this.cache.rooms, room);
  }

  // ---- realtime channels ----------------------------------------------------
  private subscribeRoom(roomId: string) {
    const sb = getSupabase();
    if (!sb || this.channels.has(roomId)) return;
    const ch = sb
      .channel(`room:${roomId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "submissions", filter: `room_id=eq.${roomId}` }, () => {
        void this.loadSubmissions(roomId, true);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "live_rooms", filter: `id=eq.${roomId}` }, (p) => {
        if (p.new) this.upsert(this.cache.rooms, p.new as LiveRoom);
        this.emit("room", roomId);
      })
      .subscribe();
    this.channels.set(roomId, ch);
  }

  private subscribePublic(publicId: string) {
    const sb = getSupabase();
    const room = this.cache.rooms.find((r) => r.public_id === publicId);
    if (!sb || !room || this.channels.has(publicId)) return;
    // Anonymous viewers can't filter live_rooms by internal id reliably, so we
    // resync the public view + published submissions on any relevant change.
    const ch = sb
      .channel(`pub:${publicId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "submissions", filter: `room_id=eq.${room.id}` }, () => {
        void this.loadSubmissions(room.id, false);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "live_rooms", filter: `public_id=eq.${publicId}` }, async () => {
        const { data } = await sb.from("public_board_view").select("*").eq("public_id", publicId).maybeSingle();
        if (data) this.absorbPublicView(data as PublicViewRow);
        this.emit("room", room.id);
      })
      .subscribe();
    this.channels.set(publicId, ch);
  }

  private upsert<T extends { id: string }>(arr: T[], row: T) {
    const i = arr.findIndex((x) => x.id === row.id);
    if (i === -1) arr.push(row);
    else arr[i] = { ...arr[i], ...row };
  }

  // ---- org / profiles -------------------------------------------------------
  getOrganization() {
    return this.cache.organizations[0] ?? { id: "public", name: "נירם גיתן — NGG", logo_url: "/brand/ngg-logo.png", created_at: new Date().toISOString() };
  }
  getProfile(id: string) {
    return this.cache.profiles.find((p) => p.id === id) ?? null;
  }
  listProfiles() {
    void this.hydrateOrg();
    return [...this.cache.profiles];
  }

  // ---- boards ---------------------------------------------------------------
  listBoards(): Board[] {
    void this.hydrateOrg();
    return [...this.cache.boards]
      .filter((b) => b.organization_id !== "public")
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  }
  getBoard(id: string): Board | null {
    return this.cache.boards.find((b) => b.id === id) ?? null;
  }
  createBoard(input: Partial<Board>): Board {
    const sb = getSupabase();
    const nowIso = new Date().toISOString();
    const board: Board = {
      id: uuid(),
      organization_id: this.getOrganization().id,
      created_by: this.currentProfileId ?? "public",
      internal_name: input.internal_name ?? "",
      public_title: input.public_title ?? "",
      public_subtitle: input.public_subtitle ?? "",
      internal_description: input.internal_description ?? "",
      status: input.status ?? "draft",
      appearance: { ...defaultAppearance(), ...(input.appearance ?? {}) },
      participation: { ...defaultParticipation(), ...(input.participation ?? {}) },
      moderation: { mode: "immediate", hide_identity_on_display: false, blocked_words: [], ...(input.moderation ?? {}) },
      sharing: input.sharing ?? "private",
      default_layout: input.default_layout ?? "wall",
      default_sort: input.default_sort ?? "newest",
      tags: input.tags ?? [],
      folder: input.folder ?? null,
      collaborator_ids: input.collaborator_ids ?? [],
      created_at: nowIso,
      updated_at: nowIso,
      archived_at: null,
      last_activated_at: null,
    };
    this.cache.boards.unshift(board);
    this.emit("board-list");
    void sb?.from("boards").insert(boardToRow(board)).then(({ error }) => error && console.warn("createBoard", error.message));
    return board;
  }
  updateBoard(id: string, patch: Partial<Board>): Board {
    const idx = this.cache.boards.findIndex((b) => b.id === id);
    const prev = this.cache.boards[idx];
    const next: Board = {
      ...(prev as Board),
      ...patch,
      appearance: { ...(prev?.appearance ?? defaultAppearance()), ...(patch.appearance ?? {}) },
      participation: { ...(prev?.participation ?? defaultParticipation()), ...(patch.participation ?? {}) },
      moderation: { ...(prev?.moderation ?? { mode: "immediate", hide_identity_on_display: false, blocked_words: [] }), ...(patch.moderation ?? {}) },
      id,
      updated_at: new Date().toISOString(),
    };
    if (idx === -1) this.cache.boards.unshift(next);
    else this.cache.boards[idx] = next;
    this.emit("board-list");
    const sb = getSupabase();
    void sb?.from("boards").update(boardToRow(next)).eq("id", id).then(({ error }) => error && console.warn("updateBoard", error.message));
    return next;
  }
  setBoardStatus(id: string, status: Board["status"]): Board {
    return this.updateBoard(id, { status, archived_at: status === "archived" ? new Date().toISOString() : null });
  }
  duplicateBoard(id: string): Board {
    const src = this.getBoard(id);
    if (!src) throw new Error("board not found");
    return this.createBoard({ ...src, internal_name: `${src.internal_name} (עותק)`, status: "draft" });
  }

  // ---- rooms ----------------------------------------------------------------
  getRoom(id: string): LiveRoom | null {
    if (!this.cache.rooms.some((r) => r.id === id)) void this.ensureRoomById(id);
    return this.cache.rooms.find((r) => r.id === id) ?? null;
  }
  getRoomByPublicId(publicId: string): LiveRoom | null {
    const found = this.cache.rooms.find((r) => r.public_id === publicId);
    if (!found) void this.ensureRoomByPublicId(publicId);
    return found ?? null;
  }
  findRoomByCode(code: string): LiveRoom | null {
    const clean = code.replace(/\s/g, "");
    // Look up remotely and cache; returns null on first call, populated after.
    const cached = this.cache.rooms.find((r) => r.room_code === clean);
    if (!cached) void this.lookupByCode(clean);
    return cached ?? null;
  }
  private async lookupByCode(code: string) {
    const sb = getSupabase();
    if (!sb) return;
    const { data } = await sb.from("public_board_view").select("*").eq("room_code", code).maybeSingle();
    if (data) {
      this.absorbPublicView(data as PublicViewRow);
      this.emit("room");
    }
  }
  listRoomsForBoard(boardId: string): LiveRoom[] {
    void this.ensureBoardRooms(boardId);
    return this.cache.rooms
      .filter((r) => r.board_id === boardId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }
  private async ensureBoardRooms(boardId: string) {
    const key = `board:${boardId}`;
    if (this.loadingRooms.has(key)) return;
    this.loadingRooms.add(key);
    const sb = getSupabase();
    if (!sb) return;
    const { data } = await sb.from("live_rooms").select("*").eq("board_id", boardId);
    if (data) {
      for (const r of data as LiveRoom[]) this.upsert(this.cache.rooms, r);
      this.emit("board-list");
    }
  }
  getActiveRoomForBoard(boardId: string): LiveRoom | null {
    return this.cache.rooms.find((r) => r.board_id === boardId && ACTIVE_STATES.includes(r.status)) ?? null;
  }
  listActiveRooms(): LiveRoom[] {
    void this.hydrateActiveRooms();
    return this.cache.rooms.filter((r) => ACTIVE_STATES.includes(r.status) && r.organization_id !== "public");
  }
  private activeHydrated = false;
  private async hydrateActiveRooms() {
    const sb = getSupabase();
    if (!sb || !this.currentProfileId || this.activeHydrated) return;
    this.activeHydrated = true;
    const { data } = await sb.from("live_rooms").select("*").in("status", ACTIVE_STATES);
    if (data) {
      for (const r of data as LiveRoom[]) this.upsert(this.cache.rooms, r);
      this.emit("board-list");
    }
  }

  activateRoom(boardId: string, opts: { sessionLabel?: string; mode?: "fresh" | "continue" } = {}): LiveRoom {
    const board = this.getBoard(boardId);
    const nowIso = new Date().toISOString();
    const room: LiveRoom = {
      id: uuid(),
      board_id: boardId,
      organization_id: this.getOrganization().id,
      public_id: `r-${randomId(10)}`,
      room_code: generateRoomCode(),
      session_label: opts.sessionLabel?.trim() || null,
      status: "active",
      layout: board?.default_layout ?? "wall",
      focused_submission_id: null,
      qr_overlay_visible: false,
      facilitator_ids: this.currentProfileId ? [this.currentProfileId] : [],
      participant_count: 0,
      started_at: nowIso,
      ended_at: null,
      last_activity_at: nowIso,
      created_by: this.currentProfileId ?? "public",
      created_at: nowIso,
    };
    this.cache.rooms.unshift(room);
    this.updateBoard(boardId, { last_activated_at: nowIso });
    this.subscribeRoom(room.id);
    this.emit("board-list");
    const sb = getSupabase();
    void sb?.from("live_rooms").insert(roomToRow(room)).then(({ error }) => {
      if (error) console.warn("activateRoom", error.message);
      else if (this.currentProfileId) void sb.from("room_facilitators").insert({ room_id: room.id, profile_id: this.currentProfileId });
    });
    return room;
  }

  private patchRoom(id: string, patch: Partial<LiveRoom>, kind: RealtimeSignal["kind"]): LiveRoom {
    const idx = this.cache.rooms.findIndex((r) => r.id === id);
    const next = { ...(this.cache.rooms[idx] as LiveRoom), ...patch };
    if (idx !== -1) this.cache.rooms[idx] = next;
    this.emit(kind, id);
    const sb = getSupabase();
    void sb?.from("live_rooms").update(patch).eq("id", id).then(({ error }) => error && console.warn("patchRoom", error.message));
    return next;
  }
  touchActivity(id: string) { this.patchRoom(id, { last_activity_at: new Date().toISOString() }, "room"); }
  setRoomStatus(id: string, status: RoomStatus): LiveRoom {
    const patch: Partial<LiveRoom> = { status };
    if (status === "ended") patch.ended_at = new Date().toISOString();
    if (status === "active") patch.last_activity_at = new Date().toISOString();
    return this.patchRoom(id, patch, "room");
  }
  pauseRoom(id: string) { return this.setRoomStatus(id, "paused"); }
  resumeRoom(id: string) { return this.setRoomStatus(id, "active"); }
  setReadOnly(id: string, on: boolean) { return this.setRoomStatus(id, on ? "read_only" : "active"); }
  endRoom(id: string) { return this.setRoomStatus(id, "ended"); }
  reactivateRoom(id: string) { return this.patchRoom(id, { status: "active", last_activity_at: new Date().toISOString() }, "room"); }
  setLayout(id: string, layout: DisplayLayout) { return this.patchRoom(id, { layout }, "layout"); }
  setFocus(id: string, submissionId: string | null) { return this.patchRoom(id, { focused_submission_id: submissionId }, "focus"); }
  setQrOverlay(id: string, visible: boolean) { return this.patchRoom(id, { qr_overlay_visible: visible }, "qr-overlay"); }

  checkAndApplyInactivity(id: string, nowMs = Date.now()): LiveRoom | null {
    const room = this.getRoom(id);
    if (!room || (room.status !== "active" && room.status !== "paused")) return room;
    if (nowMs - new Date(room.last_activity_at).getTime() >= INACTIVITY_SUSPEND_MS) return this.setRoomStatus(id, "suspended");
    return room;
  }

  // ---- participants (anon RPC + client id) ----------------------------------
  joinRoom(publicId: string, displayName: string | null): { room: LiveRoom; session: ParticipantSession } | null {
    const room = this.cache.rooms.find((r) => r.public_id === publicId);
    if (!room) { void this.ensureRoomByPublicId(publicId); return null; }
    const sessionId = uuid();
    const session: ParticipantSession = {
      id: sessionId,
      room_id: room.id,
      display_name: displayName?.trim() || null,
      created_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
    };
    this.cache.participants.push(session);
    const updated = this.patchRoomLocal(room.id, { participant_count: room.participant_count + 1 });
    this.emit("participants", room.id);
    const sb = getSupabase();
    void sb?.rpc("join_room", { p_public_id: publicId, p_display_name: session.display_name, p_session_id: sessionId })
      .then(({ error }) => error && console.warn("join_room", error.message));
    return { room: updated, session };
  }
  private patchRoomLocal(id: string, patch: Partial<LiveRoom>): LiveRoom {
    const idx = this.cache.rooms.findIndex((r) => r.id === id);
    const next = { ...(this.cache.rooms[idx] as LiveRoom), ...patch };
    if (idx !== -1) this.cache.rooms[idx] = next;
    return next;
  }
  getParticipant(id: string): ParticipantSession | null {
    return this.cache.participants.find((p) => p.id === id) ?? null;
  }

  // ---- submissions ----------------------------------------------------------
  listSubmissions(roomId: string): Submission[] {
    return this.cache.submissions
      .filter((s) => s.room_id === roomId && s.status !== "deleted")
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }
  listSubmissionsForParticipant(roomId: string, sessionId: string): Submission[] {
    return this.listSubmissions(roomId).filter((s) => s.participant_session_id === sessionId);
  }
  countByStatus(roomId: string): Record<SubmissionStatus, number> {
    const acc: Record<SubmissionStatus, number> = { pending: 0, published: 0, hidden: 0, rejected: 0, deleted: 0 };
    for (const s of this.cache.submissions) if (s.room_id === roomId) acc[s.status]++;
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
    const room = this.cache.rooms.find((r) => r.id === input.roomId);
    const id = uuid();
    const nowIso = new Date().toISOString();
    const submission: Submission = {
      id,
      room_id: input.roomId,
      organization_id: room?.organization_id ?? "public",
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
    this.cache.submissions.push(submission);
    this.emit("submissions", input.roomId);
    const sb = getSupabase();
    if (sb && room) {
      void sb.rpc("create_submission", {
        p_id: id,
        p_public_id: room.public_id,
        p_session_id: input.participantSessionId,
        p_type: input.type,
        p_text: submission.text_content,
        p_media_url: submission.media_url,
        p_anonymous: submission.anonymous,
        p_display_name: input.displayName ?? null,
      }).then(({ error }) => error && console.warn("create_submission", error.message));
    }
    return submission;
  }

  moderate(id: string, action: ModerationActionType): Submission | null {
    const sub = this.cache.submissions.find((s) => s.id === id);
    if (!sub) return null;
    let patch: Partial<Submission> = {};
    switch (action) {
      case "approve": case "restore": patch = { status: "published" }; break;
      case "reject": patch = { status: "rejected" }; break;
      case "hide": patch = { status: "hidden" }; break;
      case "delete": patch = { status: "deleted" }; break;
      case "pin": patch = { pinned: true }; break;
      case "unpin": patch = { pinned: false }; break;
    }
    return this.applySubmission(sub, patch);
  }
  restoreTo(id: string, status: SubmissionStatus): Submission | null {
    const sub = this.cache.submissions.find((s) => s.id === id);
    return sub ? this.applySubmission(sub, { status }) : null;
  }
  private applySubmission(sub: Submission, patch: Partial<Submission>): Submission {
    const idx = this.cache.submissions.findIndex((s) => s.id === sub.id);
    const next = { ...sub, ...patch, updated_at: new Date().toISOString() };
    this.cache.submissions[idx] = next;
    // Drop focus if the focused item leaves the display.
    if (next.status !== "published") {
      const room = this.cache.rooms.find((r) => r.id === sub.room_id);
      if (room?.focused_submission_id === sub.id) this.setFocus(room.id, null);
    }
    this.emit("submissions", sub.room_id);
    const sb = getSupabase();
    void sb?.from("submissions").update(patch).eq("id", sub.id).then(({ error }) => error && console.warn("moderate", error.message));
    return next;
  }

  // ---- history --------------------------------------------------------------
  getSessionSummaries(boardId: string): SessionSummary[] {
    return this.listRoomsForBoard(boardId).map((room) => {
      const subs = this.cache.submissions.filter((s) => s.room_id === room.id && s.status !== "deleted");
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
  listActivity() { return []; }

  resetToSeed() {
    this.cache = emptyDb();
    this.orgHydrated = false;
    this.activeHydrated = false;
    void this.hydrateOrg(true);
  }
  resetMemoryForTest() { this.cache = emptyDb(); }
}

// ---- helpers ----------------------------------------------------------------
const ACTIVE_STATES = ["active", "paused", "read_only", "suspended"];

interface PublicViewRow {
  public_id: string;
  room_code: string;
  status: RoomStatus;
  layout: DisplayLayout;
  focused_submission_id: string | null;
  qr_overlay_visible: boolean;
  participant_count: number;
  session_label: string | null;
  public_title: string;
  public_subtitle: string | null;
  appearance: Board["appearance"];
  participation: Partial<Board["participation"]>;
  moderation_mode: string | null;
  hide_identity_on_display: boolean | null;
}

function defaultAppearance(): Board["appearance"] {
  return { background_theme: "soft", background_color: null, background_image_url: null, client_logo_url: null, show_org_logo: true, card_style: "elevated", font_scale: "md" };
}
function defaultParticipation(): Board["participation"] {
  return { allow_text: true, allow_image: true, name_policy: "optional", anonymous_allowed: true, multiple_submissions: true, text_char_limit: DEFAULT_TEXT_CHAR_LIMIT, image_size_limit_mb: DEFAULT_IMAGE_SIZE_LIMIT_MB, allow_participant_edit: false, allow_participant_delete: true };
}

// Boards store grouped config as jsonb; strip the client-only collaborator_ids
// array (persisted via board_collaborators if needed).
function boardToRow(b: Board) {
  const { collaborator_ids, ...row } = b;
  void collaborator_ids;
  return row;
}
function roomToRow(r: LiveRoom) {
  const { facilitator_ids, ...row } = r;
  void facilitator_ids;
  return row;
}

export const supabaseDb = new SupabaseDB();
