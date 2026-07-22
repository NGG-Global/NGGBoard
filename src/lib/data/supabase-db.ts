"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import type {
  Board,
  DisplayLayout,
  Folder,
  FolderSummary,
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
import { normalizeBoard } from "@/lib/board-visuals";
import { realtime, type RealtimeScope, type RealtimeSignal } from "./realtime";
import type { Database } from "./seed";

const emptyDb = (): Database => ({
  organizations: [],
  profiles: [],
  folders: [],
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
  /**
   * Emit a room/submission signal keyed by BOTH the internal room id and its
   * public id. Participant/display pages subscribe by public id while the
   * control room subscribes by internal id — emitting both reaches all of them.
   */
  private signalRoom(kind: RealtimeSignal["kind"], idOrPublicId?: string) {
    if (!idOrPublicId) {
      this.emit(kind);
      return;
    }
    const room = this.cache.rooms.find((r) => r.id === idOrPublicId || r.public_id === idOrPublicId);
    this.emit(kind, idOrPublicId);
    if (room) {
      if (room.id !== idOrPublicId) this.emit(kind, room.id);
      if (room.public_id && room.public_id !== idOrPublicId) this.emit(kind, room.public_id);
    }
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
    const [{ data: profiles }, { data: orgs }, { data: boards }, { data: folders }] = await Promise.all([
      sb.from("profiles").select("*"),
      sb.from("organizations").select("*"),
      sb.from("boards").select("*").order("updated_at", { ascending: false }),
      sb.from("folders").select("*").order("sort", { ascending: true }),
    ]);
    if (profiles) this.cache.profiles = profiles as Profile[];
    if (orgs) this.cache.organizations = orgs as Database["organizations"];
    if (boards) this.cache.boards = (boards as Board[]).map(normalizeBoard);
    if (folders) this.cache.folders = folders as Folder[];
    this.emit("board-list");
    this.subscribeBoardList();
  }

  private boardListSubscribed = false;
  /** Org-wide realtime so the dashboard / "active now" updates across devices
   *  even before any specific room is opened. */
  private subscribeBoardList() {
    const sb = getSupabase();
    if (!sb || this.boardListSubscribed) return;
    this.boardListSubscribed = true;
    sb.channel("board-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "live_rooms" }, (p) => {
        const row = (p.new && (p.new as LiveRoom).id ? p.new : p.old) as LiveRoom | undefined;
        if (p.eventType === "DELETE" && row) this.cache.rooms = this.cache.rooms.filter((r) => r.id !== row.id);
        else if (row?.id) this.upsert(this.cache.rooms, row);
        this.emit("board-list");
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "boards" }, (p) => {
        if (p.eventType === "DELETE" && p.old && (p.old as Board).id) {
          this.cache.boards = this.cache.boards.filter((b) => b.id !== (p.old as Board).id);
        } else if (p.new && (p.new as Board).id) {
          this.upsert(this.cache.boards, normalizeBoard(p.new as Board));
        }
        this.emit("board-list");
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "folders" }, (p) => {
        if (p.eventType === "DELETE" && p.old && (p.old as Folder).id) {
          this.cache.folders = this.cache.folders.filter((f) => f.id !== (p.old as Folder).id);
        } else if (p.new && (p.new as Folder).id) {
          this.upsert(this.cache.folders, p.new as Folder);
        }
        this.emit("board-list");
      })
      .subscribe();
  }

  /**
   * Load a room (+ board, submissions, participants) and subscribe to it.
   *
   * A freshly-activated room may take a few hundred ms to land in Supabase, so
   * we retry a handful of times before giving up — and we only guard against
   * *concurrent* lookups (clearing the flag in `finally`), never permanently
   * caching a "not found", so the page recovers on its own once the room lands.
   */
  private async ensureRoomByPublicId(publicId: string) {
    const key = `pub:${publicId}`;
    if (this.loadingRooms.has(key) || this.cache.rooms.some((r) => r.public_id === publicId)) return;
    this.loadingRooms.add(key);
    const sb = getSupabase();
    if (!sb) {
      this.loadingRooms.delete(key);
      return;
    }
    try {
      for (let attempt = 0; attempt < 6; attempt++) {
        // Authenticated path: direct table read (org-scoped by RLS).
        if (this.currentProfileId) {
          const { data: room } = await sb.from("live_rooms").select("*").eq("public_id", publicId).maybeSingle();
          if (room) return void (await this.loadRoomGraph(room as LiveRoom));
        }
        // Anonymous path: the participant-safe view synthesises Board + Room.
        const { data: view } = await sb.from("public_board_view").select("*").eq("public_id", publicId).maybeSingle();
        if (view) {
          this.absorbPublicView(view as PublicViewRow);
          const target = this.cache.rooms.find((r) => r.public_id === publicId);
          if (target) await this.loadSubmissions(target.id, false);
          this.subscribePublic(publicId);
          this.signalRoom("room", target?.id);
          return;
        }
        await delay(500 + attempt * 400);
      }
      // Give up for now; emit so the UI can show a "not found" state.
      this.emit("room");
    } finally {
      this.loadingRooms.delete(key);
    }
  }

  private async ensureRoomById(roomId: string) {
    if (this.loadingRooms.has(roomId) || this.cache.rooms.some((r) => r.id === roomId)) return;
    this.loadingRooms.add(roomId);
    const sb = getSupabase();
    if (!sb) {
      this.loadingRooms.delete(roomId);
      return;
    }
    try {
      for (let attempt = 0; attempt < 6; attempt++) {
        const { data: room } = await sb.from("live_rooms").select("*").eq("id", roomId).maybeSingle();
        if (room) return void (await this.loadRoomGraph(room as LiveRoom));
        await delay(500 + attempt * 400);
      }
      this.emit("room");
    } finally {
      this.loadingRooms.delete(roomId);
    }
  }

  private async loadRoomGraph(room: LiveRoom) {
    this.upsert(this.cache.rooms, room);
    const sb = getSupabase();
    if (sb && !this.cache.boards.some((b) => b.id === room.board_id)) {
      const { data: board } = await sb.from("boards").select("*").eq("id", room.board_id).maybeSingle();
      if (board) this.upsert(this.cache.boards, normalizeBoard(board as Board));
    }
    await this.loadSubmissions(room.id, true);
    void this.loadParticipants(room.id);
    this.subscribeRoom(room.id);
    this.signalRoom("room", room.id);
  }

  private async loadSubmissions(roomId: string, all: boolean) {
    const sb = getSupabase();
    if (!sb) return;
    let q = sb.from("submissions").select("*").eq("room_id", roomId);
    if (!all) q = q.eq("status", "published");
    const { data } = await q;
    if (data) {
      this.cache.submissions = this.cache.submissions.filter((s) => s.room_id !== roomId).concat(data as Submission[]);
      this.signalRoom("submissions", roomId);
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
      zones: Array.isArray(v.zones) ? v.zones : [],
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
      // Prefer the real room id (exposed by public_board_view as of migration
      // 0007) so anon submission reads + realtime match real rows. Falls back to
      // a synthetic id when running against a pre-0007 view.
      id: v.room_id ?? `viewroom_${v.public_id}`,
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
        this.signalRoom("room", roomId);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "participant_sessions", filter: `room_id=eq.${roomId}` }, () => {
        void this.loadParticipants(roomId);
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
        this.signalRoom("room", room.id);
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
  /** Org id for writes — prefer the signed-in profile's org (RLS uses this). */
  private currentOrgId(): string {
    const p = this.currentProfileId ? this.getProfile(this.currentProfileId) : null;
    return p?.organization_id ?? this.cache.organizations[0]?.id ?? "public";
  }
  getProfile(id: string) {
    return this.cache.profiles.find((p) => p.id === id) ?? null;
  }
  listProfiles() {
    void this.hydrateOrg();
    return [...this.cache.profiles];
  }

  // ---- folders --------------------------------------------------------------
  listFolders(): FolderSummary[] {
    void this.hydrateOrg();
    const counts = new Map<string, number>();
    for (const b of this.cache.boards) {
      if (b.organization_id === "public" || b.status === "archived") continue;
      const f = b.folder?.trim();
      if (f) counts.set(f, (counts.get(f) ?? 0) + 1);
    }
    const registry = [...this.cache.folders].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, "he"));
    const seen = new Set<string>();
    const out: FolderSummary[] = [];
    for (const f of registry) {
      if (seen.has(f.name)) continue;
      seen.add(f.name);
      out.push({ name: f.name, count: counts.get(f.name) ?? 0 });
    }
    for (const name of [...counts.keys()].sort((a, b) => a.localeCompare(b, "he"))) {
      if (!seen.has(name)) { seen.add(name); out.push({ name, count: counts.get(name)! }); }
    }
    return out;
  }
  countUnfiled(): number {
    return this.cache.boards.filter((b) => b.organization_id !== "public" && b.status !== "archived" && !b.folder?.trim()).length;
  }
  createFolder(name: string): void {
    const clean = name.trim();
    if (!clean || this.cache.folders.some((f) => f.name === clean)) return;
    const maxSort = this.cache.folders.reduce((m, f) => Math.max(m, f.sort), -1);
    const folder: Folder = {
      id: uuid(),
      organization_id: this.currentOrgId(),
      name: clean,
      sort: maxSort + 1,
      created_at: new Date().toISOString(),
    };
    this.cache.folders.push(folder);
    this.emit("board-list");
    const sb = getSupabase();
    void sb?.from("folders").insert(folder).then(({ error }) => error && console.warn("createFolder", error.message));
  }
  renameFolder(oldName: string, newName: string): void {
    const clean = newName.trim();
    if (!clean || clean === oldName || this.cache.folders.some((f) => f.name === clean)) return;
    for (const f of this.cache.folders) if (f.name === oldName) f.name = clean;
    for (const b of this.cache.boards) if (b.folder === oldName) b.folder = clean;
    this.emit("board-list");
    const sb = getSupabase();
    const org = this.currentOrgId();
    void sb?.from("folders").update({ name: clean }).eq("organization_id", org).eq("name", oldName)
      .then(({ error }) => error && console.warn("renameFolder", error.message));
    void sb?.from("boards").update({ folder: clean }).eq("organization_id", org).eq("folder", oldName)
      .then(({ error }) => error && console.warn("renameFolder boards", error.message));
  }
  deleteFolder(name: string): void {
    this.cache.folders = this.cache.folders.filter((f) => f.name !== name);
    for (const b of this.cache.boards) if (b.folder === name) b.folder = null;
    this.emit("board-list");
    const sb = getSupabase();
    const org = this.currentOrgId();
    void sb?.from("folders").delete().eq("organization_id", org).eq("name", name)
      .then(({ error }) => error && console.warn("deleteFolder", error.message));
    void sb?.from("boards").update({ folder: null }).eq("organization_id", org).eq("folder", name)
      .then(({ error }) => error && console.warn("deleteFolder boards", error.message));
  }
  setBoardFolder(boardId: string, folder: string | null): void {
    this.updateBoard(boardId, { folder: folder?.trim() || null });
  }
  reorderFolders(names: string[]): void {
    const org = this.currentOrgId();
    const rows: Folder[] = names.map((name, i) => {
      const entry = this.cache.folders.find((f) => f.name === name);
      if (entry) { entry.sort = i; return entry; }
      const created: Folder = { id: uuid(), organization_id: org, name, sort: i, created_at: new Date().toISOString() };
      this.cache.folders.push(created);
      return created;
    });
    this.emit("board-list");
    const sb = getSupabase();
    void sb?.from("folders").upsert(rows, { onConflict: "organization_id,name" })
      .then(({ error }) => error && console.warn("reorderFolders", error.message));
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
      organization_id: this.currentOrgId(),
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
      zones: input.zones ?? [],
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
  /** Permanently delete a board; Postgres cascades to rooms/submissions. */
  deleteBoard(id: string): void {
    const roomIds = new Set(this.cache.rooms.filter((r) => r.board_id === id).map((r) => r.id));
    this.cache.boards = this.cache.boards.filter((b) => b.id !== id);
    this.cache.rooms = this.cache.rooms.filter((r) => r.board_id !== id);
    this.cache.submissions = this.cache.submissions.filter((s) => !roomIds.has(s.room_id));
    this.emit("board-list");
    const sb = getSupabase();
    void sb?.from("boards").delete().eq("id", id).then(({ error }) => error && console.warn("deleteBoard", error.message));
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
      organization_id: this.currentOrgId(),
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
    this.signalRoom(kind, id);
    // Status changes flip "active now" membership watched via the board-list scope.
    if (patch.status !== undefined) this.emit("board-list");
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
    this.signalRoom("participants", room.id);
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

  /** Roster of participants who joined a room (authenticated read; RLS-scoped). */
  listParticipants(roomId: string): ParticipantSession[] {
    return this.cache.participants
      .filter((p) => p.room_id === roomId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  private async loadParticipants(roomId: string) {
    const sb = getSupabase();
    if (!sb || !this.currentProfileId) return;
    const { data } = await sb.from("participant_sessions").select("*").eq("room_id", roomId);
    if (data) {
      this.cache.participants = this.cache.participants.filter((p) => p.room_id !== roomId).concat(data as ParticipantSession[]);
      this.signalRoom("participants", roomId);
    }
  }

  /** Clear all content from the board (soft-delete every submission), keep the room. */
  clearSubmissions(roomId: string): void {
    this.cache.submissions = this.cache.submissions.map((s) =>
      s.room_id === roomId && s.status !== "deleted" ? { ...s, status: "deleted" as const, updated_at: new Date().toISOString() } : s,
    );
    this.setFocus(roomId, null);
    this.signalRoom("submissions", roomId);
    const sb = getSupabase();
    void sb?.from("submissions").update({ status: "deleted" }).eq("room_id", roomId).neq("status", "deleted")
      .then(({ error }) => error && console.warn("clearSubmissions", error.message));
  }

  /** Reset the whole session: clear content AND remove all participants. */
  resetSession(roomId: string): void {
    this.clearSubmissions(roomId);
    this.resetParticipants(roomId);
  }

  /** Clear the room's participant roster and reset the live count to zero. */
  resetParticipants(id: string): void {
    this.cache.participants = this.cache.participants.filter((p) => p.room_id !== id);
    this.patchRoom(id, { participant_count: 0 }, "participants");
    const sb = getSupabase();
    void sb?.from("participant_sessions").delete().eq("room_id", id).then(({ error }) => error && console.warn("resetParticipants", error.message));
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
    zoneId?: string | null;
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
      zone_id: input.zoneId ?? null,
      participant_session_id: input.participantSessionId,
      display_name: input.anonymous ? null : input.displayName ?? null,
      anonymous: !!input.anonymous,
      status: input.moderationMode === "approval" ? "pending" : "published",
      pinned: false,
      created_at: nowIso,
      updated_at: nowIso,
    };
    this.cache.submissions.push(submission);
    this.signalRoom("submissions", input.roomId);
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
        p_zone_id: submission.zone_id,
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
    this.signalRoom("submissions", sub.room_id);
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

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface PublicViewRow {
  /** Real room id — present once migration 0007 is applied; absent before it. */
  room_id?: string;
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
  zones: Board["zones"] | null;
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
