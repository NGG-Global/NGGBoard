"use client";

import type { Board, Submission } from "@/lib/types";
import { initialFor } from "@/lib/utils";
import { isSeedImage, seedGradientFor } from "@/lib/board-visuals";
import { IconEyeOff, IconMonitor, IconPin, IconTrash } from "@/components/ui/icons";

export interface FacilitatorCardActions {
  focused: boolean;
  onFocus: () => void;
  onPin: () => void;
  onHide: () => void;
  onDelete: () => void;
}

const AVATAR_PALETTE = [
  ["var(--magenta-100)", "var(--magenta-800)"],
  ["var(--info-50)", "var(--info-600)"],
  ["var(--success-50)", "var(--success-600)"],
  ["var(--neutral-100)", "var(--neutral-800)"],
  ["var(--warning-50)", "var(--warning-600)"],
];

function avatarColors(seed: string): [string, string] {
  const n = seed.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_PALETTE[n % AVATAR_PALETTE.length] as [string, string];
}

interface Props {
  submission: Submission;
  board: Board;
  scale: number;
  focus?: boolean;
  facilitator?: FacilitatorCardActions;
}

/** A single submission rendered for the projector — large, high-contrast. */
export function DisplaySubmission({ submission, board, scale, focus, facilitator }: Props) {
  const hideIdentity = board.moderation.hide_identity_on_display;
  const anonymous = submission.anonymous || hideIdentity || !submission.display_name;
  const name = anonymous ? "אנונימי" : submission.display_name!;
  const [avBg, avFg] = anonymous ? ["var(--neutral-100)", "var(--neutral-600)"] : avatarColors(submission.id);

  const nameSize = `${(focus ? 1.6 : 1) * scale}rem`;
  const textSize = `${(focus ? 3 : 1.35) * scale}rem`;

  return (
    <div
      className={facilitator ? "ngg-card-in ngg-fac-card" : "ngg-card-in"}
      style={{
        background: "#ffffff",
        borderRadius: "var(--radius-2xl)",
        padding: focus ? "clamp(28px, 4vw, 56px)" : "clamp(16px, 1.6vw, 26px)",
        display: "flex",
        flexDirection: "column",
        gap: focus ? 20 : 12,
        boxShadow: focus ? "0 30px 80px rgba(8,8,16,.35)" : "0 4px 16px rgba(8,8,16,.14)",
        border: submission.pinned ? "2px solid var(--magenta-400)" : "1px solid rgba(8,8,16,.06)",
        height: "100%",
        breakInside: "avoid",
      }}
    >
      {facilitator && !focus && (
        <div
          className="ngg-fac-actions"
          style={{ position: "absolute", top: 8, insetInlineStart: 8, display: "flex", gap: 6, zIndex: 5 }}
        >
          <button className="ngg-fac-btn" data-active={facilitator.focused} onClick={facilitator.onFocus} title={facilitator.focused ? "הסר מהמסך" : "הצג במרכז"} aria-label="הצג במרכז">
            <IconMonitor size={16} />
          </button>
          <button className="ngg-fac-btn" data-active={submission.pinned} onClick={facilitator.onPin} title={submission.pinned ? "בטל הצמדה" : "הצמד"} aria-label="הצמד">
            <IconPin size={16} />
          </button>
          <button className="ngg-fac-btn" onClick={facilitator.onHide} title="הסתר" aria-label="הסתר">
            <IconEyeOff size={16} />
          </button>
          <button className="ngg-fac-btn" data-danger="true" onClick={facilitator.onDelete} title="מחק" aria-label="מחק">
            <IconTrash size={16} />
          </button>
        </div>
      )}
      {submission.type === "image" && submission.media_url && (
        <div
          style={{
            borderRadius: "var(--radius-lg)",
            overflow: "hidden",
            minHeight: focus ? 220 : 120,
            flex: submission.text_content ? "none" : 1,
            background: isSeedImage(submission.media_url) ? seedGradientFor(submission.media_url) : undefined,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {!isSeedImage(submission.media_url) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={submission.media_url} alt={submission.text_content ?? "תמונה ששלח משתתף"} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          )}
        </div>
      )}

      {submission.text_content && (
        <div style={{ fontSize: textSize, fontWeight: "var(--weight-bold)", color: "var(--neutral-950)", lineHeight: "var(--leading-snug)", overflowWrap: "break-word" }}>
          {submission.text_content}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: "auto" }}>
        <span
          style={{
            width: focus ? 44 : 30,
            height: focus ? 44 : 30,
            borderRadius: "50%",
            background: avBg,
            color: avFg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: "var(--weight-extrabold)",
            fontSize: nameSize,
            flex: "none",
          }}
        >
          {initialFor(anonymous ? null : submission.display_name, anonymous)}
        </span>
        <span style={{ fontSize: nameSize, fontWeight: "var(--weight-bold)", color: "var(--neutral-700)" }}>{name}</span>
        {submission.pinned && (
          <span style={{ marginInlineStart: "auto", fontSize: `${0.75 * scale}rem`, fontWeight: "var(--weight-bold)", color: "var(--magenta-600)", background: "var(--magenta-50)", padding: "2px 10px", borderRadius: "var(--radius-pill)" }}>
            מוצמד
          </span>
        )}
      </div>
    </div>
  );
}

export { avatarColors };
