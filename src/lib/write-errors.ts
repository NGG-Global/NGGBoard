import { t } from "@/lib/i18n";

/**
 * Failures the participant write path can return, and what to tell the person
 * holding the phone.
 *
 * These exist because the Supabase backend writes optimistically: the row lands
 * in the local cache and the RPC is fired afterwards. Before this module, an RPC
 * rejection only reached `console.warn`, so a participant whose submission the
 * server refused was still shown "התוכן שלכם עלה על הלוח" — and on an
 * approval-mode board the facilitator's queue stayed empty while the participant
 * believed they were waiting for approval. Every reason below is a path the
 * server RPCs in `supabase/migrations` can actually take.
 */
export type WriteFailureReason =
  | "room_not_found"
  | "room_not_joinable"
  | "room_not_accepting"
  | "collection_closed"
  | "invalid_session"
  | "rate_limited"
  | "already_submitted"
  | "blocked_word"
  | "text_too_long"
  | "media_too_large"
  | "text_not_allowed"
  | "image_not_allowed"
  | "giphy_not_allowed"
  | "video_not_allowed"
  | "invalid_video_url"
  | "comments_not_allowed"
  | "submission_not_available"
  | "empty_comment"
  | "comment_too_long"
  | "not_your_submission"
  | "delete_not_allowed"
  | "offline"
  | "unknown";

export class WriteFailure extends Error {
  readonly reason: WriteFailureReason;
  constructor(reason: WriteFailureReason, detail?: string) {
    super(detail ? `${reason}: ${detail}` : reason);
    this.name = "WriteFailure";
    this.reason = reason;
  }
}

/**
 * A dead session is the one failure the UI can recover from on its own: the
 * participant's stored session no longer exists server-side, so re-joining
 * gives them a working one.
 */
export function needsRejoin(reason: WriteFailureReason): boolean {
  return reason === "invalid_session";
}

/** Reasons the participant caused and can fix by changing what they sent. */
export function isRetryable(reason: WriteFailureReason): boolean {
  return reason === "rate_limited" || reason === "blocked_word" || reason === "offline" || reason === "unknown";
}

const KNOWN: WriteFailureReason[] = [
  "room_not_found", "room_not_joinable", "room_not_accepting", "collection_closed",
  "invalid_session", "rate_limited", "already_submitted", "blocked_word",
  "text_too_long", "media_too_large", "text_not_allowed", "image_not_allowed",
  "giphy_not_allowed", "video_not_allowed", "invalid_video_url",
  "comments_not_allowed", "submission_not_available", "empty_comment",
  "comment_too_long", "not_your_submission", "delete_not_allowed",
];

/**
 * Turn a Supabase/Postgres error into a reason. The RPCs signal with
 * `raise exception '<reason>'`, which arrives in `message`; anything we don't
 * recognise (a network drop, an RLS refusal, a column that doesn't exist yet
 * because a migration hasn't run) becomes `unknown` rather than being guessed at.
 */
export function reasonFromError(err: { message?: string; code?: string } | null | undefined): WriteFailureReason {
  const message = (err?.message ?? "").toLowerCase();
  if (!message) return "unknown";
  if (message.includes("failed to fetch") || message.includes("networkerror") || message.includes("network request failed")) {
    return "offline";
  }
  return KNOWN.find((reason) => message.includes(reason)) ?? "unknown";
}

/** What the participant reads. Plain, and never blames them for a server fault. */
export function participantMessage(reason: WriteFailureReason): string {
  switch (reason) {
    case "already_submitted":
      return t("בלוח הזה אפשר לשלוח פעם אחת, וכבר נשלח ממכם תוכן.");
    case "rate_limited":
      return t("רגע לפני — נסו שוב עוד כמה שניות");
    case "blocked_word":
      return t("התוכן מכיל מילה שאינה מותרת. אנא נסחו מחדש.");
    case "text_too_long":
      return t("התשובה ארוכה מדי. קצרו אותה ונסו שוב.");
    case "media_too_large":
      return t("הקובץ גדול מדי. נסו תמונה קטנה יותר.");
    case "room_not_accepting":
      return t("הלוח אינו מקבל תוכן חדש כרגע. נסו שוב בעוד רגע.");
    case "collection_closed":
      return t("האיסוף נסגר ואי אפשר לשלוח יותר.");
    case "room_not_found":
    case "room_not_joinable":
      return t("לא הצלחנו להתחבר למפגש. בדקו את הקישור ונסו שוב.");
    case "invalid_session":
      return t("החיבור שלכם למפגש פג. מתחברים מחדש — נסו לשלוח שוב.");
    case "text_not_allowed":
    case "image_not_allowed":
    case "giphy_not_allowed":
    case "video_not_allowed":
      return t("סוג התוכן הזה אינו מאושר בלוח הזה.");
    case "invalid_video_url":
      return t("הקישור אינו קישור תקין לסרטון YouTube");
    case "comments_not_allowed":
      return t("הלוח הזה אינו מאפשר תגובות של משתתפים.");
    case "submission_not_available":
      return t("הפוסט הזה אינו זמין יותר.");
    case "empty_comment":
      return t("יש לכתוב תגובה לפני השליחה");
    case "comment_too_long":
      return t("התגובה ארוכה מדי. קצרו אותה ונסו שוב.");
    case "not_your_submission":
      return t("אפשר להסיר רק תוכן שאתם שלחתם.");
    case "delete_not_allowed":
      return t("בלוח הזה אי אפשר להסיר תוכן שנשלח. פנו למנחה.");
    case "offline":
      return t("אין חיבור לרשת. בדקו את החיבור ונסו שוב.");
    default:
      return t("השליחה לא הושלמה. נסו שוב.");
  }
}
