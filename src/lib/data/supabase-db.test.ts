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
  op: "select" | "update";
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
  if (call.table === "submissions") {
    return new Promise((resolve) => {
      const d: Deferred = { call, resolve: (data) => resolve({ data, error: null }) };
      (call.op === "select" ? pendingReads : pendingUpdates).push(d);
    });
  }
  let data: unknown = null;
  if (call.table === "live_rooms" && call.op === "select") data = ROOM;
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
    eq: (col: string, val: unknown) => (call.filters.push([col, "eq", val]), builder),
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
      on: (_type: string, filter: { table: string }, cb: (p: unknown) => void) => (list.push({ table: filter.table, cb }), ch),
      subscribe: (cb?: (status: string) => void) => {
        if (cb) subscribeCallbacks.set(name, cb);
        return ch;
      },
    };
    return ch;
  },
};

vi.mock("@/lib/supabase", () => ({
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
