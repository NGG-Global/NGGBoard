import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveRoom, Submission } from "@/lib/types";

/**
 * The Supabase adapter's realtime behaviour, against a scripted client. These
 * cover what a projector left running for a whole session depends on: bursts of
 * events don't race each other, a dropped connection catches up, and moderation
 * reaches screens that nobody signed in on.
 */

type Row = Record<string, unknown>;
interface Call {
  table: string;
  op: "select" | "update" | "insert";
  rows?: Row[];
  /** `.maybeSingle()` — one row rather than a list. */
  single?: boolean;
  filters: [string, string, unknown][];
  patch?: Row;
}
interface Deferred {
  call: Call;
  resolve: (data: unknown) => void;
}

const calls: Call[] = [];
/** What the scripted database holds for the one room it knows. */
let roomRow: LiveRoom;
/** Submission reads held open until the test answers them, in call order. */
let pendingReads: Deferred[] = [];
let pendingUpdates: Deferred[] = [];
let channelHandlers: Map<string, { table: string; cb: (p: unknown) => void }[]>;
let subscribeCallbacks: Map<string, (status: string) => void>;

const ROOM: LiveRoom = {
  id: "room-1",
  board_id: "board-1",
  organization_id: "org-1",
  public_id: "r-public1",
  room_code: "123456",
  session_label: null,
  mode: "live",
  closes_at: null,
  status: "active",
  layout: "wall",
  focused_submission_id: null,
  qr_overlay_visible: false,
  facilitator_ids: [],
  participant_count: 0,
  started_at: new Date().toISOString(),
  ended_at: null,
  last_activity_at: new Date().toISOString(),
  created_by: "user-1",
  created_at: new Date().toISOString(),
};

function sub(id: string, status: Submission["status"] = "published"): Submission {
  const now = new Date().toISOString();
  return {
    id,
    room_id: ROOM.id,
    organization_id: "org-1",
    type: "text",
    text_content: `text ${id}`,
    media_url: null,
    zone_id: null,
    participant_session_id: "p-1",
    author_profile_id: null,
    display_name: null,
    anonymous: true,
    status,
    pinned: false,
    created_at: now,
    updated_at: now,
  };
}

/** Answers every query immediately except submission reads and writes, which the test resolves. */
function answer(call: Call): Promise<{ data: unknown; error: null }> {
  if (call.op === "insert") return Promise.resolve({ data: null, error: null });
  if (call.table === "submissions") {
    return new Promise((resolve) => {
      const d: Deferred = { call, resolve: (data) => resolve({ data, error: null }) };
      (call.op === "select" ? pendingReads : pendingUpdates).push(d);
    });
  }
  let data: unknown = null;
  if (call.table === "live_rooms" && call.op === "select") data = roomRow;
  if (call.table === "boards") data = { id: ROOM.board_id, organization_id: "org-1", public_title: "Board", appearance: {}, participation: {}, moderation: { mode: "immediate" } };
  if (call.table === "public_board_view") {
    data = { public_id: ROOM.public_id, room_id: ROOM.id, room_code: ROOM.room_code, session_label: null, mode: "live", closes_at: null, status: "active", layout: "wall", focused_submission_id: null, qr_overlay_visible: false, participant_count: 0, public_title: "Board", public_subtitle: "", instructions: "", appearance: {}, participation: {}, moderation_mode: "immediate", hide_identity_on_display: false, zones: [] };
  }
  if (call.table === "participant_sessions" || call.table === "submission_comments") data = [];
  // A list read (the org-wide hydration) gets an array of whatever single row the table has.
  if (call.op === "select" && !call.single && !Array.isArray(data)) data = data ? [data] : [];
  return Promise.resolve({ data, error: null });
}

function query(table: string) {
  const call: Call = { table, op: "select", filters: [] };
  const builder = {
    select: () => builder,
    update: (patch: Row) => {
      call.op = "update";
      call.patch = patch;
      return builder;
    },
    insert: (rows: Row | Row[]) => {
      call.op = "insert";
      call.rows = Array.isArray(rows) ? rows : [rows];
      return builder;
    },
    eq: (col: string, val: unknown) => (call.filters.push([col, "eq", val]), builder),
    in: (col: string, val: unknown) => (call.filters.push([col, "in", val]), builder),
    neq: (col: string, val: unknown) => (call.filters.push([col, "neq", val]), builder),
    order: () => builder,
    limit: () => builder,
    maybeSingle: () => ((call.single = true), calls.push(call), answer(call)),
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => (calls.push(call), answer(call).then(res, rej)),
  };
  return builder;
}

const fakeClient = {
  from: (table: string) => query(table),
  channel: (name: string) => {
    const list: { table: string; cb: (p: unknown) => void }[] = [];
    channelHandlers.set(name, list);
    const ch = {
      on: (_type: string, filter: { schema: string; table: string }, cb: (p: unknown) => void) => {
        // The app lives in its own schema of the shared NGG project; a
        // subscription on any other schema would never receive a change.
        expect(filter.schema).toBe("board");
        list.push({ table: filter.table, cb });
        return ch;
      },
      subscribe: (cb?: (status: string) => void) => {
        if (cb) subscribeCallbacks.set(name, cb);
        return ch;
      },
    };
    return ch;
  },
};

vi.mock("@/lib/supabase", () => ({
  DB_SCHEMA: "board",
  USE_SUPABASE: true,
  getSupabase: () => fakeClient,
  appOrigin: () => "http://localhost",
}));

/** Let every already-settled promise chain run. */
const flush = () => new Promise((r) => setTimeout(r, 0));

function fire(channel: string, table: string, payload: unknown = {}) {
  const handlers = channelHandlers.get(channel)?.filter((h) => h.table === table) ?? [];
  expect(handlers.length).toBeGreaterThan(0);
  for (const h of handlers) h.cb(payload);
}

async function freshDb() {
  vi.resetModules();
  const mod = await import("./supabase-db");
  return mod.supabaseDb;
}

beforeEach(() => {
  roomRow = ROOM;
  calls.length = 0;
  pendingReads = [];
  pendingUpdates = [];
  channelHandlers = new Map();
  subscribeCallbacks = new Map();
});

/** Load the room as a signed-in facilitator and answer its first read. */
async function loadAsFacilitator(initial: Submission[]) {
  const db = await freshDb();
  db.setCurrentProfile("user-1");
  db.getRoom(ROOM.id);
  await flush();
  expect(pendingReads).toHaveLength(1);
  pendingReads.shift()!.resolve(initial);
  await flush();
  return db;
}

describe("SupabaseDB realtime", () => {
  it("serialises a burst of submission events into in-order reads", async () => {
    const db = await loadAsFacilitator([sub("a")]);

    // Five participants send at once: five events, but only one read starts…
    for (let i = 0; i < 5; i++) fire(`room:${ROOM.id}`, "submissions");
    await flush();
    expect(pendingReads).toHaveLength(1);

    // …and the events that arrived while it ran cause exactly one more, issued
    // only after the first has landed — so an older answer can never overwrite
    // a newer one.
    pendingReads.shift()!.resolve([sub("a"), sub("b")]);
    await flush();
    expect(db.listSubmissions(ROOM.id)).toHaveLength(2);
    expect(pendingReads).toHaveLength(1);

    pendingReads.shift()!.resolve(["a", "b", "c", "d", "e", "f"].map((id) => sub(id)));
    await flush();
    expect(pendingReads).toHaveLength(0);
    expect(db.listSubmissions(ROOM.id)).toHaveLength(6);
  });

  it("re-reads the room when the realtime channel re-joins after a drop", async () => {
    await loadAsFacilitator([sub("a")]);
    const onStatus = subscribeCallbacks.get(`room:${ROOM.id}`)!;

    onStatus("SUBSCRIBED"); // the first join: nothing was missed
    await flush();
    expect(pendingReads).toHaveLength(0);

    onStatus("CHANNEL_ERROR");
    onStatus("SUBSCRIBED"); // re-joined: whatever changed meanwhile was never delivered
    await flush();
    expect(pendingReads).toHaveLength(1);
  });

  it("touches the room after a hide is stored, so anonymous screens re-read", async () => {
    const db = await loadAsFacilitator([sub("a")]);
    calls.length = 0;

    db.moderate("a", "hide");
    expect(pendingUpdates).toHaveLength(1);
    // Not before the hide itself is stored — an anonymous screen re-reading
    // early would still be served the post.
    expect(calls.some((c) => c.table === "live_rooms" && c.op === "update")).toBe(false);

    pendingUpdates.shift()!.resolve(null);
    await flush();
    const touch = calls.find((c) => c.table === "live_rooms" && c.op === "update");
    expect(touch?.patch).toHaveProperty("last_activity_at");
  });

  it("does not count pinning as room activity", async () => {
    const db = await loadAsFacilitator([sub("a")]);
    calls.length = 0;
    db.moderate("a", "pin");
    pendingUpdates.shift()!.resolve(null);
    await flush();
    expect(calls.some((c) => c.table === "live_rooms" && c.op === "update")).toBe(false);
  });

  it("re-reads published content on an anonymous screen when the room changes", async () => {
    const db = await freshDb(); // no profile: the anonymous path
    db.getRoomByPublicId(ROOM.public_id);
    await flush();
    expect(pendingReads).toHaveLength(1);
    pendingReads.shift()!.resolve([sub("a"), sub("b")]);
    await flush();
    expect(db.listSubmissions(ROOM.id)).toHaveLength(2);

    // The facilitator hides "b". Realtime never delivers that update to anon
    // (it may not read the hidden row); the room touch that follows does arrive.
    fire(`pub:${ROOM.public_id}`, "live_rooms");
    await flush();
    expect(pendingReads).toHaveLength(1);
    expect(pendingReads[0]!.call.filters).toContainEqual(["status", "eq", "published"]);
    pendingReads.shift()!.resolve([sub("a")]);
    await flush();
    expect(db.listSubmissions(ROOM.id).map((s) => s.id)).toEqual(["a"]);
  });
});

/**
 * A facilitator rarely opens a session straight from a link. They go through
 * the dashboard or the board page first, and those load room rows in bulk
 * without their content. Treating "room row cached" as "room loaded" made a
 * stored session look empty everywhere it was shown afterwards.
 */
describe("SupabaseDB session content", () => {
  /** Sign in and let the dashboard's org-wide hydration land (it lists the room). */
  async function afterDashboard() {
    const db = await freshDb();
    db.setCurrentProfile("user-1");
    await flush();
    expect(db.listRoomsForBoard(ROOM.board_id).map((r) => r.id)).toContain(ROOM.id);
    await flush();
    pendingReads = []; // nothing has asked for content yet
    return db;
  }

  it("the session summary loads a session's posts when the dashboard already listed the room", async () => {
    roomRow = { ...ROOM, status: "ended", ended_at: new Date().toISOString() };
    const db = await afterDashboard();

    expect(db.getRoom(ROOM.id)).not.toBeNull(); // the row is cached…
    await flush();
    expect(pendingReads).toHaveLength(1); // …but its content still has to be read
    expect(pendingReads[0]!.call.filters).toContainEqual(["room_id", "eq", ROOM.id]);
    pendingReads.shift()!.resolve([sub("a"), sub("b"), sub("c", "hidden")]);
    await flush();
    expect(db.listSubmissions(ROOM.id).filter((s) => s.status === "published")).toHaveLength(2);
  });

  it("a control room reopened from the board page loads its posts and goes live again", async () => {
    const db = await afterDashboard();
    db.getRoom(ROOM.id);
    await flush();
    pendingReads.shift()!.resolve([sub("a")]);
    await flush();
    expect(db.listSubmissions(ROOM.id)).toHaveLength(1);
    expect(channelHandlers.has(`room:${ROOM.id}`)).toBe(true); // new posts will arrive
  });

  it("the session history and the dashboard count a session's posts, and refresh when they arrive", async () => {
    roomRow = { ...ROOM, status: "ended", ended_at: new Date().toISOString(), participant_count: 9 };
    const db = await afterDashboard();
    const boardList = vi.fn();
    db.subscribe("board-list", boardList);

    db.getSessionSummaries(ROOM.board_id);
    await flush();
    expect(pendingReads).toHaveLength(1);
    pendingReads.shift()!.resolve([sub("a"), sub("b"), sub("c", "hidden")]);
    await flush();
    expect(boardList).toHaveBeenCalled();

    const [summary] = db.getSessionSummaries(ROOM.board_id);
    expect(summary).toMatchObject({ submission_count: 3, published_count: 2 });
    expect(db.getLastSession(ROOM.board_id)).toMatchObject({ participants: 9, items: 3 });
    expect(pendingReads).toHaveLength(0); // counted once, not re-read on every render
  });

  it("retries a content read that failed, but not on every render", async () => {
    const db = await afterDashboard();
    db.getRoom(ROOM.id);
    await flush();
    pendingReads.shift()!.resolve(null); // the read failed (offline, refused)
    await flush();

    db.getRoom(ROOM.id);
    db.getRoom(ROOM.id);
    await flush();
    expect(pendingReads).toHaveLength(0); // no hammering

    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now + 5000);
    db.getRoom(ROOM.id);
    await flush();
    expect(pendingReads).toHaveLength(1); // a few seconds later it tries again
    pendingReads.shift()!.resolve([sub("a")]);
    await flush();
    expect(db.listSubmissions(ROOM.id)).toHaveLength(1);
    clock.mockRestore();
  });

  it("doesn't suspend a busy room on a stale idea of its last activity", async () => {
    const longAgo = new Date(Date.now() - 45 * 60_000).toISOString();
    roomRow = { ...ROOM, last_activity_at: longAgo };
    const db = await afterDashboard(); // cached with activity from 45 minutes ago
    roomRow = { ...ROOM, last_activity_at: new Date().toISOString() }; // participants have been posting
    calls.length = 0;

    db.checkAndApplyInactivity(ROOM.id);
    await flush();
    const suspended = calls.some((c) => c.table === "live_rooms" && c.op === "update" && c.patch?.status === "suspended");
    expect(suspended).toBe(false);
    expect(db.getRoom(ROOM.id)?.last_activity_at).toBe(roomRow.last_activity_at);
  });

  it("still suspends a room the server confirms has been idle", async () => {
    roomRow = { ...ROOM, last_activity_at: new Date(Date.now() - 45 * 60_000).toISOString() };
    const db = await afterDashboard();
    calls.length = 0;
    db.checkAndApplyInactivity(ROOM.id);
    await flush();
    expect(calls.some((c) => c.table === "live_rooms" && c.op === "update" && c.patch?.status === "suspended")).toBe(true);
  });

  it("continuing a session carries the previous session's participant posts into the new room", async () => {
    roomRow = { ...ROOM, status: "ended", ended_at: new Date().toISOString() };
    const db = await afterDashboard();
    calls.length = 0;

    const next = db.activateRoom(ROOM.board_id, { content: "continue" });
    await flush();
    // The previous session's content is read from the server, not from whatever the cache holds.
    const read = pendingReads.find((d) => d.call.filters.some(([c, , v]) => c === "room_id" && v === ROOM.id));
    expect(read).toBeDefined();
    const facilitatorPost = { ...sub("seed"), participant_session_id: null, author_profile_id: "user-1" };
    read!.resolve([sub("a"), sub("b", "hidden"), facilitatorPost]);
    await flush();

    const insert = calls.find((c) => c.table === "submissions" && c.op === "insert");
    expect(insert?.rows).toHaveLength(2); // participants' posts; the board's opening content is re-made fresh
    for (const row of insert!.rows!) {
      expect(row.room_id).toBe(next.id);
      expect(row.id).not.toMatch(/^(a|b)$/);
      expect(row.participant_session_id).toBe("p-1");
    }
    expect(db.listSubmissions(next.id).map((s) => s.text_content).sort()).toEqual(["text a", "text b"]);
  });
});
