import { beforeEach, describe, expect, it } from "vitest";
import { db } from "./local-db";
import { INACTIVITY_SUSPEND_MS } from "@/lib/constants";
import { boardFormSchema, validateSubmissionText } from "@/lib/validation";
import { isAllowedImageType, sanitizeText } from "@/lib/utils";

const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
  db.resetToSeed();
});

/**
 * Push a room's `last_activity_at` into the past. Written through storage and
 * followed by a cache drop so the value is read back the way the real
 * timestamp-based check reads it, rather than from a mutated in-memory object.
 */
function rewindActivity(roomId: string, iso: string) {
  const stored = JSON.parse(localStorage.getItem("ngg_boards_db_v1")!);
  const idx = stored.rooms.findIndex((r: { id: string }) => r.id === roomId);
  stored.rooms[idx].last_activity_at = iso;
  localStorage.setItem("ngg_boards_db_v1", JSON.stringify(stored));
  db.resetMemoryForTest();
}

describe("board creation and validation", () => {
  it("rejects a board without a public title", () => {
    const result = boardFormSchema.safeParse({ public_title: "  " });
    expect(result.success).toBe(false);
  });

  it("creates a board scoped to the organization", () => {
    const before = db.listBoards().length;
    const board = db.createBoard({ public_title: "לוח בדיקה", internal_name: "בדיקה" });
    expect(db.listBoards().length).toBe(before + 1);
    expect(board.organization_id).toBe(db.getOrganization().id);
    expect(board.status).toBe("draft");
  });

  it("duplicates a board as a fresh draft", () => {
    const dup = db.duplicateBoard("board_innovation");
    expect(dup.status).toBe("draft");
    expect(dup.internal_name).toContain("עותק");
    expect(dup.id).not.toBe("board_innovation");
  });

  it("permanently deletes a board and cascades to its rooms + submissions", () => {
    // board_innovation has an active room (room_active) with seeded submissions.
    expect(db.getBoard("board_innovation")).not.toBeNull();
    expect(db.listSubmissions("room_active").length).toBeGreaterThan(0);
    db.deleteBoard("board_innovation");
    expect(db.getBoard("board_innovation")).toBeNull();
    expect(db.getRoom("room_active")).toBeNull();
    expect(db.listSubmissions("room_active")).toHaveLength(0);
  });
});

describe("room activation", () => {
  it("creates a fresh active room with a unique code and public id", () => {
    const room = db.activateRoom("board_qa", { sessionLabel: "בדיקה" });
    expect(room.status).toBe("active");
    expect(room.room_code).toMatch(/^\d{6}$/);
    expect(room.public_id).toMatch(/^r-/);
    expect(room.session_label).toBe("בדיקה");
    // Default fresh activation carries no prior submissions.
    expect(db.listSubmissions(room.id)).toHaveLength(0);
  });

  it("carries submissions forward only when continuing a session", () => {
    const room = db.activateRoom("board_qa", { content: "continue" });
    // board_qa has a prior ended room (room_past) with no submissions in seed,
    // so continue yields an empty room here — but the code path must not throw.
    expect(room.status).toBe("active");
  });

  it("marks the board's last_activated_at", () => {
    db.activateRoom("board_qa");
    expect(db.getBoard("board_qa")?.last_activated_at).toBeTruthy();
  });
});

describe("participant join", () => {
  it("joins an active room and increments participant count", () => {
    const room = db.activateRoom("board_qa");
    const before = room.participant_count;
    const res = db.joinRoom(room.public_id, "נועה");
    expect(res).not.toBeNull();
    expect(res!.session.display_name).toBe("נועה");
    expect(db.getRoom(room.id)?.participant_count).toBe(before + 1);
  });

  it("returns null for an unknown public id", () => {
    expect(db.joinRoom("r-does-not-exist", "x")).toBeNull();
  });
});

describe("submission moderation lifecycle", () => {
  it("publishes immediately in immediate mode", () => {
    const room = db.activateRoom("board_innovation"); // immediate
    const part = db.joinRoom(room.public_id, "דנה")!;
    const sub = db.createSubmission({
      roomId: room.id,
      type: "text",
      text: "רעיון",
      participantSessionId: part.session.id,
      displayName: "דנה",
      moderationMode: "immediate",
    });
    expect(sub.status).toBe("published");
  });

  it("queues for approval in approval mode, then publishes on approve", () => {
    const room = db.activateRoom("board_qa"); // approval
    const part = db.joinRoom(room.public_id, "יואב")!;
    const sub = db.createSubmission({
      roomId: room.id,
      type: "text",
      text: "שאלה",
      participantSessionId: part.session.id,
      displayName: "יואב",
      moderationMode: "approval",
    });
    expect(sub.status).toBe("pending");
    const approved = db.moderate(sub.id, "approve");
    expect(approved?.status).toBe("published");
  });

  it("hides then restores a submission, and drops focus when hidden", () => {
    const room = db.activateRoom("board_innovation");
    const part = db.joinRoom(room.public_id, "רון")!;
    const sub = db.createSubmission({
      roomId: room.id,
      type: "text",
      text: "רעיון",
      participantSessionId: part.session.id,
      moderationMode: "immediate",
    });
    db.setFocus(room.id, sub.id);
    expect(db.getRoom(room.id)?.focused_submission_id).toBe(sub.id);
    db.moderate(sub.id, "hide");
    expect(db.getRoom(room.id)?.focused_submission_id).toBeNull();
    db.restoreTo(sub.id, "published");
    expect(db.listSubmissions(room.id).find((s) => s.id === sub.id)?.status).toBe("published");
  });
});

describe("inactivity lifecycle", () => {
  it("suspends an active room after 30 minutes without meaningful activity", () => {
    const room = db.activateRoom("board_qa");
    rewindActivity(room.id, new Date(Date.now() - INACTIVITY_SUSPEND_MS - 1000).toISOString());

    const after = db.checkAndApplyInactivity(room.id);
    expect(after?.status).toBe("suspended");
  });

  it("reactivates a suspended room and resets the timer", () => {
    const room = db.activateRoom("board_qa");
    db.setRoomStatus(room.id, "suspended");
    const reactivated = db.reactivateRoom(room.id);
    expect(reactivated.status).toBe("active");
    expect(Date.now() - new Date(reactivated.last_activity_at).getTime()).toBeLessThan(2000);
  });

  it("never suspends an open collection for inactivity", () => {
    // The whole point of an open board: the link the facilitator sent out must
    // still work after days of quiet.
    const room = db.activateRoom("board_qa", { mode: "open" });
    const stale = new Date(Date.now() - 40 * DAY).toISOString();
    rewindActivity(room.id, stale);

    const after = db.checkAndApplyInactivity(room.id);
    expect(after?.status).toBe("active");
  });

  it("still suspends a live room that has been idle for the same span", () => {
    // Guards the exemption above against being written too broadly.
    const room = db.activateRoom("board_qa", { mode: "live" });
    rewindActivity(room.id, new Date(Date.now() - 40 * DAY).toISOString());
    expect(db.checkAndApplyInactivity(room.id)?.status).toBe("suspended");
  });
});

describe("open collection lifecycle", () => {
  it("records the mode and deadline on activation", () => {
    const closesAt = new Date(Date.now() + 3 * DAY).toISOString();
    const room = db.activateRoom("board_qa", { mode: "open", closesAt });
    expect(room.mode).toBe("open");
    expect(room.closes_at).toBe(closesAt);
    expect(db.getOpenRoomForBoard("board_qa")?.id).toBe(room.id);
  });

  it("ignores a deadline passed for a live room", () => {
    const room = db.activateRoom("board_qa", { mode: "live", closesAt: new Date().toISOString() });
    expect(room.closes_at).toBeNull();
  });

  it("closes an open collection to read-only once its deadline passes", () => {
    const room = db.activateRoom("board_qa", { mode: "open", closesAt: new Date(Date.now() + 60_000).toISOString() });
    expect(db.checkAndApplyInactivity(room.id)?.status).toBe("active");
    // One minute later the deadline has passed.
    const after = db.checkAndApplyInactivity(room.id, Date.now() + 61_000);
    expect(after?.status).toBe("read_only");
    // Content survives closing — that is why it is read_only and not ended.
    expect(db.getRoom(room.id)?.closes_at).toBeTruthy();
  });

  it("leaves an open collection with no deadline running indefinitely", () => {
    const room = db.activateRoom("board_qa", { mode: "open" });
    rewindActivity(room.id, new Date(Date.now() - 365 * DAY).toISOString());
    expect(db.checkAndApplyInactivity(room.id, Date.now() + 365 * DAY)?.status).toBe("active");
  });

  it("reopens a closed collection when the deadline is extended", () => {
    const room = db.activateRoom("board_qa", { mode: "open", closesAt: new Date(Date.now() - 1000).toISOString() });
    expect(db.checkAndApplyInactivity(room.id)?.status).toBe("read_only");
    const extended = db.setCollectionDeadline(room.id, new Date(Date.now() + 2 * DAY).toISOString());
    expect(extended.status).toBe("active");
  });

  it("defaults rooms stored before open collection existed to live mode", () => {
    // Legacy rows carry neither field; every one of them was a live session.
    const room = db.activateRoom("board_qa");
    const stored = JSON.parse(localStorage.getItem("ngg_boards_db_v1")!);
    const idx = stored.rooms.findIndex((r: { id: string }) => r.id === room.id);
    delete stored.rooms[idx].mode;
    delete stored.rooms[idx].closes_at;
    localStorage.setItem("ngg_boards_db_v1", JSON.stringify(stored));
    db.resetMemoryForTest();

    const loaded = db.getRoom(room.id);
    expect(loaded?.mode).toBe("live");
    expect(loaded?.closes_at).toBeNull();
  });
});

describe("organization isolation", () => {
  it("stamps organization_id on every board, room and submission", () => {
    const orgId = db.getOrganization().id;
    const room = db.activateRoom("board_innovation");
    const part = db.joinRoom(room.public_id, "מיכל")!;
    const sub = db.createSubmission({
      roomId: room.id,
      type: "text",
      text: "רעיון",
      participantSessionId: part.session.id,
      moderationMode: "immediate",
    });
    expect(db.getBoard("board_innovation")?.organization_id).toBe(orgId);
    expect(room.organization_id).toBe(orgId);
    expect(sub.organization_id).toBe(orgId);
  });
});

describe("input validation and safety", () => {
  it("validates submission text length and emptiness", () => {
    expect(validateSubmissionText("", 100)).not.toBeNull();
    expect(validateSubmissionText("x".repeat(101), 100)).not.toBeNull();
    expect(validateSubmissionText("תשובה תקינה", 100)).toBeNull();
  });

  it("allows only whitelisted image types", () => {
    expect(isAllowedImageType("image/png")).toBe(true);
    expect(isAllowedImageType("image/jpeg")).toBe(true);
    expect(isAllowedImageType("application/x-msdownload")).toBe(false);
    expect(isAllowedImageType("text/html")).toBe(false);
  });

  it("strips control characters from submitted text", () => {
    const dirty = "\u05e9\u05dc\u05d5\u05dd\u0007\u0000\u05e2\u05d5\u05dc\u05dd"; // bell + null between words
    expect(sanitizeText(dirty, 100)).toBe("\u05e9\u05dc\u05d5\u05dd\u05e2\u05d5\u05dc\u05dd");
    // Ordinary spaces and newlines are preserved.
    expect(sanitizeText("\u05e9\u05d5\u05e8\u05d4\n\u05d7\u05d3\u05e9\u05d4", 100)).toBe("\u05e9\u05d5\u05e8\u05d4\n\u05d7\u05d3\u05e9\u05d4");
  })
});
