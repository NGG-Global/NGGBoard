"use client";

import type { Board, Submission } from "@/lib/types";
import { formatAgo, initialFor } from "@/lib/utils";
import { isSeedImage, seedGradientFor } from "@/lib/board-visuals";
import { avatarColors } from "@/components/display/DisplaySubmission";
import {
  IconCheck,
  IconEye,
  IconMonitor,
  IconPin,
  IconTrash,
  IconX,
} from "@/components/ui/icons";

export interface CardActions {
  onFocus?: () => void;
  onPin?: () => void;
  onHide?: () => void;
  onRestore?: () => void;
  onApprove?: () => void;
  onReject?: () => void;
  onDelete?: () => void;
}

export function ControlSubmissionCard({
  submission,
  board,
  focused,
  isNew,
  actions,
}: {
  submission: Submission;
  board: Board;
  focused: boolean;
  isNew?: boolean;
  actions: CardActions;
}) {
  const anonymous = submission.anonymous || !submission.display_name;
  const name = anonymous ? "אנונימי" : submission.display_name!;
  const [avBg, avFg] = anonymous ? ["var(--neutral-100)", "var(--neutral-600)"] : avatarColors(submission.id);

  return (
    <div
      className={isNew ? "ngg-card-in" : undefined}
      style={{
        background: "var(--surface)",
        border: `1.5px solid ${focused ? "var(--magenta-400)" : "var(--border)"}`,
        borderRadius: "var(--radius-xl)",
        padding: "14px 14px 8px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        boxShadow: "var(--shadow-xs)",
      }}
    >
      {focused && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--accent-text)", fontSize: "var(--text-2xs)", fontWeight: "var(--weight-bold)" }}>
          <IconMonitor size={13} />
          מוצג כעת על המסך
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <span style={{ width: 30, height: 30, borderRadius: "50%", background: avBg, color: avFg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "var(--text-xs)", fontWeight: "var(--weight-extrabold)", flex: "none" }}>
          {initialFor(anonymous ? null : submission.display_name, anonymous)}
        </span>
        <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          <span style={{ fontSize: "var(--text-xs)", fontWeight: "var(--weight-bold)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
          <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-subtle)" }}>{formatAgo(submission.created_at)}</span>
        </div>
        <div style={{ flex: 1 }} />
        {submission.pinned && (
          <span style={{ background: "var(--accent-soft)", color: "var(--accent-text)", fontSize: "var(--text-2xs)", fontWeight: "var(--weight-bold)", padding: "3px 8px", borderRadius: "var(--radius-pill)" }}>מוצמד</span>
        )}
      </div>

      {submission.type === "image" && submission.media_url && (
        <div style={{ height: 118, borderRadius: "var(--radius-lg)", overflow: "hidden", background: isSeedImage(submission.media_url) ? seedGradientFor(submission.media_url) : undefined, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {!isSeedImage(submission.media_url) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={submission.media_url} alt={submission.text_content ?? "תמונה ששלח משתתף"} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          )}
        </div>
      )}

      {submission.text_content && (
        <div style={{ fontSize: "var(--text-sm)", lineHeight: "var(--leading-relaxed)", overflowWrap: "break-word" }}>{submission.text_content}</div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 2, borderTop: "1px solid var(--border)", paddingTop: 6, marginTop: "auto" }}>
        {actions.onApprove && (
          <ActionButton accent onClick={actions.onApprove} icon={<IconCheck size={13} />}>אשר</ActionButton>
        )}
        {actions.onReject && (
          <ActionButton onClick={actions.onReject} icon={<IconX size={13} />}>דחה</ActionButton>
        )}
        {actions.onFocus && (
          <ActionButton accent onClick={actions.onFocus} icon={<IconMonitor size={13} />}>{focused ? "הסר מהמסך" : "הצג"}</ActionButton>
        )}
        {actions.onPin && (
          <ActionButton onClick={actions.onPin} icon={<IconPin size={13} />}>{submission.pinned ? "בטל הצמדה" : "הצמד"}</ActionButton>
        )}
        {actions.onHide && (
          <ActionButton onClick={actions.onHide} icon={<IconEye size={13} />}>הסתר</ActionButton>
        )}
        {actions.onRestore && (
          <ActionButton accent onClick={actions.onRestore} icon={<IconEye size={13} />}>השב לתצוגה</ActionButton>
        )}
        <div style={{ flex: 1 }} />
        {actions.onDelete && (
          <button
            aria-label="מחיקה"
            title="מחיקה"
            onClick={actions.onDelete}
            className="ngg-danger-hover"
            style={{ display: "flex", alignItems: "center", border: "none", background: "transparent", color: "var(--text-subtle)", padding: 6, borderRadius: "var(--radius-md)", cursor: "pointer" }}
          >
            <IconTrash size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

function ActionButton({ children, onClick, icon, accent }: { children: React.ReactNode; onClick: () => void; icon: React.ReactNode; accent?: boolean }) {
  return (
    <button
      onClick={onClick}
      className="ngg-hover"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        border: "none",
        background: "transparent",
        color: accent ? "var(--accent-text)" : "var(--text-muted)",
        fontSize: "var(--text-xs)",
        fontWeight: accent ? "var(--weight-bold)" : "var(--weight-semibold)",
        padding: "6px 8px",
        borderRadius: "var(--radius-md)",
        cursor: "pointer",
      }}
    >
      {icon}
      {children}
    </button>
  );
}
