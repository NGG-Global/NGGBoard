"use client";

import { useState } from "react";
import type { Submission } from "@/lib/types";
import { db } from "@/lib/data";
import { useLiveQuery } from "@/lib/hooks";
import { formatAgo, initialFor, sanitizeText, findBlockedWord } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/react";
import { IconTrash } from "@/components/ui/icons";

/** How the thread is written to: as the facilitator, or as a participant. */
export type CommentAuthor =
  | { kind: "facilitator"; profileId: string }
  | { kind: "participant"; sessionId: string; displayName: string | null; anonymous: boolean };

const MAX_COMMENT_LENGTH = 500;

/**
 * Replies on a single post. Self-contained: it reads and writes comments itself
 * rather than being handed data, so the display components it hangs off don't
 * need to know comments exist at all.
 *
 * Facilitator threads can delete any reply; a participant can only add one.
 */
export function CommentThread({
  submission,
  author,
  canWrite,
  blockedWords = [],
  tone = "light",
}: {
  submission: Submission;
  author: CommentAuthor | null;
  /** Whether this viewer may add a reply at all (board setting / room state). */
  canWrite: boolean;
  blockedWords?: string[];
  /** `dark` for a board with a dark background, where the card sits on ink. */
  tone?: "light" | "dark";
}) {
  const { t } = useI18n();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const comments = useLiveQuery(
    { room: submission.room_id },
    () => db.listComments(submission.id),
    [submission.id],
  );

  const isFacilitator = author?.kind === "facilitator";
  const muted = tone === "dark" ? "rgba(255,255,255,.62)" : "var(--text-subtle)";
  const text = tone === "dark" ? "rgba(255,255,255,.92)" : "var(--text)";
  const line = tone === "dark" ? "rgba(255,255,255,.16)" : "var(--border)";

  function submit() {
    if (!author) return;
    const clean = sanitizeText(body, MAX_COMMENT_LENGTH);
    if (!clean.trim()) return;
    const blocked = findBlockedWord(clean, blockedWords);
    if (blocked) {
      setError(t("התגובה מכילה מילה שאינה מותרת. אנא נסחו מחדש."));
      return;
    }
    const created =
      author.kind === "facilitator"
        ? db.createComment({ submissionId: submission.id, body: clean, authorProfileId: author.profileId, displayName: db.getProfile(author.profileId)?.full_name ?? null })
        : db.createComment({ submissionId: submission.id, body: clean, participantSessionId: author.sessionId, displayName: author.displayName, anonymous: author.anonymous });
    if (!created) {
      setError(t("שליחת התגובה נכשלה. נסו שוב."));
      return;
    }
    setBody("");
    setError(null);
  }

  // Nothing to show and nothing to write: render nothing rather than an empty
  // affordance on every card.
  if (comments.length === 0 && !canWrite) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: `1px solid ${line}`, paddingTop: 9, marginTop: 2 }}>
      {comments.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {comments.map((c) => {
            const byFacilitator = !!c.author_profile_id;
            const anon = !byFacilitator && (c.anonymous || !c.display_name);
            const name = byFacilitator ? c.display_name || t("המנחה") : anon ? t("אנונימי") : c.display_name!;
            return (
              <div key={c.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    flex: "none",
                    background: byFacilitator ? "var(--accent)" : tone === "dark" ? "rgba(255,255,255,.16)" : "var(--neutral-100)",
                    color: byFacilitator ? "#fff" : tone === "dark" ? "rgba(255,255,255,.8)" : "var(--neutral-700)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "var(--text-3xs, 10px)",
                    fontWeight: "var(--weight-extrabold)",
                  }}
                >
                  {initialFor(byFacilitator || !anon ? c.display_name : null, anon)}
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: "var(--text-2xs)", fontWeight: "var(--weight-bold)", color: byFacilitator ? "var(--accent-text)" : text }}>{name}</span>
                    {byFacilitator && (
                      <span style={{ fontSize: "var(--text-2xs)", color: muted }}>· {t("מנחה")}</span>
                    )}
                    <span style={{ fontSize: "var(--text-2xs)", color: muted }}>· {formatAgo(c.created_at)}</span>
                  </div>
                  <div dir="auto" style={{ fontSize: "var(--text-xs)", color: text, lineHeight: "var(--leading-relaxed)", overflowWrap: "break-word", whiteSpace: "pre-line" }}>
                    {c.body}
                  </div>
                </div>
                {isFacilitator && (
                  <button
                    onClick={() => db.deleteComment(c.id)}
                    aria-label={t("מחיקת התגובה")}
                    title={t("מחיקת התגובה")}
                    className="ngg-danger-hover"
                    style={{ display: "flex", border: "none", background: "transparent", color: muted, padding: 3, borderRadius: "var(--radius-sm)", cursor: "pointer", flex: "none" }}
                  >
                    <IconTrash size={12} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {canWrite && author && (
        open || comments.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
              <textarea
                value={body}
                onChange={(e) => { setBody(e.target.value.slice(0, MAX_COMMENT_LENGTH)); setError(null); }}
                onKeyDown={(e) => {
                  // Enter sends, Shift+Enter breaks the line — what a reply box
                  // is expected to do.
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
                }}
                placeholder={isFacilitator ? t("כתבו תגובה למשתתף…") : t("כתבו תגובה…")}
                rows={1}
                className="ngg-focusable"
                dir="auto"
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontFamily: "var(--font-sans)",
                  fontSize: "var(--text-xs)",
                  color: tone === "dark" ? "#fff" : "var(--text)",
                  background: tone === "dark" ? "rgba(255,255,255,.08)" : "var(--surface)",
                  border: `1px solid ${error ? "var(--danger)" : line}`,
                  borderRadius: "var(--radius-lg)",
                  padding: "7px 10px",
                  outline: "none",
                  resize: "none",
                  lineHeight: "var(--leading-relaxed)",
                }}
              />
              <button
                onClick={submit}
                disabled={!body.trim()}
                style={{
                  flex: "none",
                  border: "none",
                  background: body.trim() ? "var(--accent)" : tone === "dark" ? "rgba(255,255,255,.12)" : "var(--bg-muted)",
                  color: body.trim() ? "#fff" : muted,
                  fontSize: "var(--text-2xs)",
                  fontWeight: "var(--weight-bold)",
                  padding: "8px 12px",
                  borderRadius: "var(--radius-lg)",
                  cursor: body.trim() ? "pointer" : "default",
                }}
              >
                {t("שלח")}
              </button>
            </div>
            {error && <span style={{ fontSize: "var(--text-2xs)", color: "var(--danger)", fontWeight: "var(--weight-semibold)" }}>{error}</span>}
          </div>
        ) : (
          <button
            onClick={() => setOpen(true)}
            className="ngg-hover"
            style={{ alignSelf: "flex-start", border: "none", background: "transparent", color: isFacilitator ? "var(--accent-text)" : muted, fontSize: "var(--text-2xs)", fontWeight: "var(--weight-bold)", padding: "3px 4px", borderRadius: "var(--radius-sm)", cursor: "pointer" }}
          >
            {isFacilitator ? t("הגיבו למשתתף") : t("הוסיפו תגובה")}
          </button>
        )
      )}
    </div>
  );
}
