"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { db } from "@/lib/data";
import { useLiveQuery, useMounted } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n/react";
import { themeVisual } from "@/lib/board-visuals";
import { deadlinePassed } from "@/lib/rooms";
import { DisplayCanvas } from "@/components/display/DisplayCanvas";
import { CommentThread, type CommentAuthor } from "@/components/app/CommentThread";
import { Button, Spinner } from "@/components/ui";
import { IconChevron, IconWarning } from "@/components/ui/icons";

function sessionKey(publicId: string) {
  return `ngg_participant_${publicId}`;
}

/**
 * The board as a participant reads it on their own phone.
 *
 * Deliberately not the projector view: that one is built to fit a fixed 16:9
 * screen — it clips to one page of cards and auto-cycles them every 12s, which
 * on a phone means content the participant can neither reach nor keep still
 * long enough to read. Here the page scrolls normally, every published item is
 * present, and a fixed bar keeps the way back to submitting one tap away.
 */
export function ParticipantBoardView({ publicId }: { publicId: string }) {
  const { t } = useI18n();
  const mounted = useMounted();
  const [graceOver, setGraceOver] = useState(false);

  const room = useLiveQuery({ room: publicId }, () => db.getRoomByPublicId(publicId));
  const board = useLiveQuery({ room: publicId }, () => {
    const r = db.getRoomByPublicId(publicId);
    return r ? db.getBoard(r.board_id) : null;
  });
  const submissions = useLiveQuery({ room: publicId }, () => {
    const r = db.getRoomByPublicId(publicId);
    return r ? db.listSubmissions(r.id).filter((s) => s.status === "published") : [];
  });

  useEffect(() => {
    const id = setTimeout(() => setGraceOver(true), 6000);
    return () => clearTimeout(id);
  }, [publicId]);

  // The stored participant session is what lets a reply be attributed. Someone
  // who reached the board without joining can read the threads but not add to
  // them — there is no identity to attach.
  const [sessionId, setSessionId] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(sessionKey(publicId));
    if (stored && db.getParticipant(stored)) setSessionId(stored);
  }, [publicId]);

  if (!mounted || (!room && !graceOver)) {
    return (
      <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", background: "var(--surface-sunken)" }}>
        <Spinner size={28} />
      </div>
    );
  }

  if (!room || !board) {
    return (
      <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, textAlign: "center", padding: 24, background: "var(--surface-sunken)", fontFamily: "var(--font-sans)", color: "var(--text)" }}>
        <IconWarning size={38} style={{ color: "var(--text-subtle)" }} />
        <div style={{ fontSize: "var(--text-xl)", fontWeight: "var(--weight-extrabold)" }}>{t("החדר לא נמצא")}</div>
        <Link href={`/join/${publicId}`}>
          <Button variant="primary">{t("חזרה לשליחת תוכן")}</Button>
        </Link>
      </div>
    );
  }

  const participant = sessionId ? db.getParticipant(sessionId) : null;
  const participantAuthor: CommentAuthor | null = participant
    ? {
        kind: "participant",
        sessionId: participant.id,
        displayName: participant.display_name,
        anonymous: board.participation.anonymous_allowed && !participant.display_name,
      }
    : null;
  // Replies need the board to allow them, an identity to attach, and a board
  // that is still open — a closed collection stops taking replies too.
  const roomOpen = room.status === "active" && !deadlinePassed(room);
  const canComment = board.participation.allow_participant_comments && !!participantAuthor && roomOpen;

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", background: "var(--surface-sunken)", fontFamily: "var(--font-sans)" }}>
      {/* Fixed way back — a participant should never have to find the browser's
          back button to return to sending. */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 30,
          flex: "none",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: `calc(9px + env(safe-area-inset-top)) 14px 9px`,
          background: "var(--ink-950)",
          color: "#fff",
          boxShadow: "var(--shadow-md)",
        }}
      >
        <Link
          href={`/join/${publicId}`}
          className="ngg-hover"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#fff", textDecoration: "none", fontSize: "var(--text-xs)", fontWeight: "var(--weight-bold)", padding: "7px 10px", borderRadius: "var(--radius-pill)", border: "1px solid rgba(255,255,255,.22)" }}
        >
          <IconChevron size={14} strokeWidth={2.2} />
          {t("חזרה לשליחת תוכן")}
        </Link>
        <span style={{ marginInlineStart: "auto", fontSize: "var(--text-2xs)", color: "rgba(255,255,255,.7)", fontWeight: "var(--weight-semibold)" }}>
          {t("{count} פריטים", { count: submissions.length })}
        </span>
      </header>

      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        <DisplayCanvas
          room={room}
          board={board}
          submissions={submissions}
          joinUrl=""
          viewer
          renderFooter={(s) => (
            <CommentThread
              key={s.id}
              submission={s}
              author={participantAuthor}
              canWrite={canComment}
              blockedWords={board.moderation.blocked_words}
              tone="light"
            />
          )}
        />
      </div>
    </div>
  );
}
