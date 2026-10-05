import { describe, expect, it } from "vitest";
import { isRetryable, needsRejoin, participantMessage, reasonFromError, WriteFailure } from "./write-errors";

/**
 * These guard the mapping that turns a refused participant write into something
 * the person holding the phone can read. Before it existed, every one of the
 * reasons below reached only `console.warn` and the participant was shown a
 * success screen for content the server never stored.
 */
describe("classifying a refused participant write", () => {
  it("recognises each reason the server RPCs raise", () => {
    // The RPCs signal with `raise exception '<reason>'`; PostgREST wraps it.
    const cases: Array<[string, string]> = [
      ['invalid_session', "invalid_session"],
      ['P0001: rate_limited', "rate_limited"],
      ['already_submitted', "already_submitted"],
      ['blocked_word', "blocked_word"],
      ['room_not_accepting', "room_not_accepting"],
      ['collection_closed', "collection_closed"],
      ['comments_not_allowed', "comments_not_allowed"],
      ['not_your_submission', "not_your_submission"],
      ['delete_not_allowed', "delete_not_allowed"],
    ];
    for (const [message, expected] of cases) {
      expect(reasonFromError({ message })).toBe(expected);
    }
  });

  it("treats a network drop as offline rather than a content problem", () => {
    expect(reasonFromError({ message: "TypeError: Failed to fetch" })).toBe("offline");
  });

  it("falls back to unknown instead of guessing", () => {
    // e.g. an RLS refusal, or a column missing because a migration hasn't run.
    expect(reasonFromError({ message: 'column "mode" does not exist' })).toBe("unknown");
    expect(reasonFromError(null)).toBe("unknown");
    expect(reasonFromError({})).toBe("unknown");
  });

  it("marks only a dead session as needing a re-join", () => {
    expect(needsRejoin("invalid_session")).toBe(true);
    for (const reason of ["already_submitted", "rate_limited", "blocked_word", "unknown"] as const) {
      expect(needsRejoin(reason)).toBe(false);
    }
  });

  it("separates what the participant can fix from what they cannot", () => {
    expect(isRetryable("rate_limited")).toBe(true);
    expect(isRetryable("blocked_word")).toBe(true);
    expect(isRetryable("offline")).toBe(true);
    expect(isRetryable("already_submitted")).toBe(false);
    expect(isRetryable("collection_closed")).toBe(false);
  });

  it("gives every reason a message, and never an empty one", () => {
    const reasons = [
      "room_not_found", "room_not_joinable", "room_not_accepting", "collection_closed",
      "invalid_session", "rate_limited", "already_submitted", "blocked_word",
      "text_too_long", "media_too_large", "text_not_allowed", "image_not_allowed",
      "giphy_not_allowed", "video_not_allowed", "invalid_video_url",
      "comments_not_allowed", "submission_not_available", "empty_comment",
      "comment_too_long", "not_your_submission", "delete_not_allowed",
      "offline", "unknown",
    ] as const;
    for (const reason of reasons) {
      expect(participantMessage(reason).trim().length).toBeGreaterThan(0);
    }
  });

  it("carries the reason on the error itself", () => {
    const err = new WriteFailure("already_submitted", "detail from postgres");
    expect(err.reason).toBe("already_submitted");
    expect(err.name).toBe("WriteFailure");
    expect(err instanceof Error).toBe(true);
  });
});
