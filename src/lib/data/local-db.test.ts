import { beforeEach, describe, expect, it } from "vitest";
import { db, CURRENT_USER_ID } from "./local-db";
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

describe("board opening content", () => {
  it("copies the board's seed posts into every room it activates", () => {
    db.updateBoard("board_qa", {
      seed_posts: [
        { id: "sp1", type: "text", text: "קראו את ההנחיות לפני שאתם שולחים", media_url: null, zone_id: null, pinned: true },
        { id: "sp2", type: "text", text: "דוגמה לשאלה טובה", media_url: null, zone_id: null, pinned: false },
      ],
    });

    const first = db.activateRoom("board_qa");
    const opened = db.listSubmissions(first.id);
    expect(opened).toHaveLength(2);
    expect(opened.every((s) => s.author_profile_id === CURRENT_USER_ID)).toBe(true);
    expect(opened.every((s) => s.participant_session_id === null)).toBe(true);
    expect(opened.find((s) => s.text_content?.includes("ההנחיות"))?.pinned).toBe(true);

    // Every activation opens with the same framing, not just the first.
    db.endRoom(first.id);
    expect(db.listSubmissions(db.activateRoom("board_qa").id)).toHaveLength(2);
  });

  it("publishes the facilitator's own posts even on an approval board", () => {
    // board_qa moderates by approval; sending her own guidance to her own queue
    // would mean the board opens blank until she approves herself.
    db.updateBoard("board_qa", {
      seed_posts: [{ id: "sp1", type: "text", text: "הנחיה", media_url: null, zone_id: null, pinned: false }],
    });
    const room = db.activateRoom("board_qa");
    expect(db.getBoard("board_qa")?.moderation.mode).toBe("approval");
    expect(db.listSubmissions(room.id)[0]?.status).toBe("published");
    expect(db.countByStatus(room.id).pending).toBe(0);
  });

  it("skips seed posts with nothing in them", () => {
    db.updateBoard("board_qa", {
      seed_posts: [
        { id: "sp1", type: "text", text: "   ", media_url: null, zone_id: null, pinned: false },
        { id: "sp2", type: "image", text: "כיתוב בלי תמונה", media_url: null, zone_id: null, pinned: false },
        { id: "sp3", type: "text", text: "זה כן", media_url: null, zone_id: null, pinned: false },
      ],
    });
    const room = db.activateRoom("board_qa");
    expect(db.listSubmissions(room.id)).toHaveLength(1);
  });

  it("does not duplicate opening content when continuing a session", () => {
    db.updateBoard("board_qa", {
      seed_posts: [{ id: "sp1", type: "text", text: "הנחיה", media_url: null, zone_id: null, pinned: false }],
    });
    const first = db.activateRoom("board_qa");
    const part = db.joinRoom(first.public_id, "יואב")!;
    const sub = db.createSubmission({
      roomId: first.id,
      type: "text",
      text: "שאלה",
      participantSessionId: part.session.id,
      moderationMode: "approval",
    });
    db.moderate(sub.id, "approve");
    db.endRoom(first.id);

    const second = db.activateRoom("board_qa", { content: "continue" });
    const carried = db.listSubmissions(second.id);
    // One fresh copy of the opening content plus the participant's answer —
    // not two copies of the guidance card.
    expect(carried.filter((s) => s.author_profile_id).length).toBe(1);
    expect(carried.filter((s) => !s.author_profile_id).length).toBe(1);
  });

  it("carries the board's current opening wording, not the previous room's", () => {
    db.updateBoard("board_qa", {
      seed_posts: [{ id: "sp1", type: "text", text: "נוסח ראשון", media_url: null, zone_id: null, pinned: false }],
    });
    const first = db.activateRoom("board_qa");
    db.endRoom(first.id);
    db.updateBoard("board_qa", {
      seed_posts: [{ id: "sp1", type: "text", text: "נוסח מעודכן", media_url: null, zone_id: null, pinned: false }],
    });

    const second = db.activateRoom("board_qa", { content: "continue" });
    expect(db.listSubmissions(second.id).map((s) => s.text_content)).toEqual(["נוסח מעודכן"]);
  });

  it("counts only participant content as contributions", () => {
    db.updateBoard("board_innovation", {
      seed_posts: [{ id: "sp1", type: "text", text: "הנחיה", media_url: null, zone_id: null, pinned: false }],
    });
    const room = db.activateRoom("board_innovation");
    const part = db.joinRoom(room.public_id, "נועה")!;
    db.createSubmission({
      roomId: room.id,
      type: "text",
      text: "רעיון",
      participantSessionId: part.session.id,
      moderationMode: "immediate",
    });
    // Two posts on the board, but only one of them came from a participant.
    expect(db.listSubmissions(room.id)).toHaveLength(2);
    expect(db.countContributions(room.id)).toBe(1);
  });
});

describe("a participant recovering from a mistake", () => {
  function singleSubmissionBoard() {
    db.updateBoard("board_innovation", {
      participation: { ...db.getBoard("board_innovation")!.participation, multiple_submissions: false },
    });
    const room = db.activateRoom("board_innovation");
    const part = db.joinRoom(room.public_id, "רון")!;
    const sub = db.createSubmission({
      roomId: room.id,
      type: "text",
      text: "תשובה שגויה",
      participantSessionId: part.session.id,
      displayName: "רון",
      moderationMode: "immediate",
    });
    return { room, session: part.session.id, sub };
  }

  it("frees a single-submission board after removing the mistake", () => {
    const { room, session, sub } = singleSubmissionBoard();
    // Before: one post, so the participant screen is locked to "כבר שלחתם".
    expect(db.listSubmissionsForParticipant(room.id, session)).toHaveLength(1);

    expect(db.deleteOwnSubmission(sub.id, session)).toBe(true);

    // After: nothing of theirs remains, so they can send again.
    expect(db.listSubmissionsForParticipant(room.id, session)).toHaveLength(0);
    expect(db.listSubmissions(room.id).find((s) => s.id === sub.id)).toBeUndefined();
  });

  it("refuses to remove someone else's post", () => {
    const { room, sub } = singleSubmissionBoard();
    const other = db.joinRoom(room.public_id, "מיכל")!;
    expect(db.deleteOwnSubmission(sub.id, other.session.id)).toBe(false);
    expect(db.listSubmissions(room.id).find((s) => s.id === sub.id)?.status).toBe("published");
  });

  it("refuses to remove the board's opening content", () => {
    db.updateBoard("board_qa", {
      seed_posts: [{ id: "sp1", type: "text", text: "הנחיה", media_url: null, zone_id: null, pinned: false }],
    });
    const room = db.activateRoom("board_qa");
    const part = db.joinRoom(room.public_id, "יואב")!;
    const opening = db.listSubmissions(room.id)[0]!;
    // A facilitator post has no participant session, so no participant owns it.
    expect(db.deleteOwnSubmission(opening.id, part.session.id)).toBe(false);
    expect(db.listSubmissions(room.id)).toHaveLength(1);
  });

  it("honours a board that forbids participant deletion", () => {
    const { session, sub } = singleSubmissionBoard();
    db.updateBoard("board_innovation", {
      participation: { ...db.getBoard("board_innovation")!.participation, allow_participant_delete: false },
    });
    expect(db.deleteOwnSubmission(sub.id, session)).toBe(false);
  });

  it("takes the post's replies down with it", () => {
    const { session, sub } = singleSubmissionBoard();
    db.createComment({ submissionId: sub.id, body: "תגובה", authorProfileId: CURRENT_USER_ID });
    expect(db.listComments(sub.id)).toHaveLength(1);
    db.deleteOwnSubmission(sub.id, session);
    expect(db.listComments(sub.id)).toHaveLength(0);
  });

  it("is idempotent — removing twice is not an error the second time", () => {
    const { session, sub } = singleSubmissionBoard();
    expect(db.deleteOwnSubmission(sub.id, session)).toBe(true);
    expect(db.deleteOwnSubmission(sub.id, session)).toBe(false);
  });
});

describe("replies on posts", () => {
  function roomWithPost() {
    const room = db.activateRoom("board_innovation");
    const part = db.joinRoom(room.public_id, "רון")!;
    const sub = db.createSubmission({
      roomId: room.id,
      type: "text",
      text: "רעיון",
      participantSessionId: part.session.id,
      displayName: "רון",
      moderationMode: "immediate",
    });
    return { room, part, sub };
  }

  it("records a facilitator reply against the post", () => {
    const { sub } = roomWithPost();
    const comment = db.createComment({ submissionId: sub.id, body: "תודה, נדבר על זה במפגש", authorProfileId: CURRENT_USER_ID });
    expect(comment).not.toBeNull();
    const thread = db.listComments(sub.id);
    expect(thread).toHaveLength(1);
    expect(thread[0]!.author_profile_id).toBe(CURRENT_USER_ID);
    expect(thread[0]!.participant_session_id).toBeNull();
  });

  it("records a participant reply and keeps the thread in order", () => {
    const { sub, part } = roomWithPost();
    db.createComment({ submissionId: sub.id, body: "ראשונה", authorProfileId: CURRENT_USER_ID });
    db.createComment({ submissionId: sub.id, body: "שנייה", participantSessionId: part.session.id, displayName: "רון" });
    // Oldest first — a thread reads in the order it was written.
    expect(db.listComments(sub.id).map((c) => c.body)).toEqual(["ראשונה", "שנייה"]);
  });

  it("ignores an empty reply and an unknown post", () => {
    const { sub } = roomWithPost();
    expect(db.createComment({ submissionId: sub.id, body: "   ", authorProfileId: CURRENT_USER_ID })).toBeNull();
    expect(db.createComment({ submissionId: "sub_nope", body: "היי", authorProfileId: CURRENT_USER_ID })).toBeNull();
    expect(db.listComments(sub.id)).toHaveLength(0);
  });

  it("drops a deleted reply from the thread", () => {
    const { sub } = roomWithPost();
    const c = db.createComment({ submissionId: sub.id, body: "להסרה", authorProfileId: CURRENT_USER_ID })!;
    db.deleteComment(c.id);
    expect(db.listComments(sub.id)).toHaveLength(0);
  });

  it("takes replies down with the post they hang off", () => {
    const { sub } = roomWithPost();
    db.createComment({ submissionId: sub.id, body: "תגובה", authorProfileId: CURRENT_USER_ID });
    db.moderate(sub.id, "delete");
    expect(db.listComments(sub.id)).toHaveLength(0);
  });

  it("clears replies when the board is reset", () => {
    const { room, sub } = roomWithPost();
    db.createComment({ submissionId: sub.id, body: "תגובה", authorProfileId: CURRENT_USER_ID });
    db.clearSubmissions(room.id);
    expect(db.listComments(sub.id)).toHaveLength(0);
    expect(db.countCommentsBySubmission(room.id)).toEqual({});
  });

  it("keeps participant replies opt-in on the board", () => {
    // The data layer records what it is asked to; the gate is the board setting
    // the UI and the server RPC both read. Assert the default is closed.
    expect(db.getBoard("board_innovation")?.participation.allow_participant_comments).toBe(false);
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
