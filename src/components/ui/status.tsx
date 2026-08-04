"use client";

import type { BoardStatus, RoomMode, RoomStatus } from "@/lib/types";
import { Badge, type BadgeColor } from "./Badge";
import { useI18n } from "@/lib/i18n/react";

interface StatusMeta {
  label: string;
  color: BadgeColor;
  dot: boolean;
  pulse?: boolean;
}

/**
 * An open collection wears the same statuses as a live session but they mean
 * something different to the facilitator: "בשידור חי" on a board nobody is
 * watching is wrong, and a collection past its deadline is closed rather than
 * in read-only mode.
 */
const OPEN_ROOM_STATUS: Partial<Record<RoomStatus, StatusMeta>> = {
  active: { label: "פתוח לאיסוף", color: "accent", dot: true },
  paused: { label: "האיסוף מושהה", color: "warning", dot: true },
  read_only: { label: "האיסוף נסגר", color: "info", dot: false },
};

const BOARD_STATUS: Record<BoardStatus, StatusMeta> = {
  draft: { label: "טיוטה", color: "neutral", dot: false },
  ready: { label: "מוכן להפעלה", color: "success", dot: true },
  archived: { label: "בארכיון", color: "neutral", dot: false },
};

const ROOM_STATUS: Record<RoomStatus, StatusMeta> = {
  draft: { label: "טיוטה", color: "neutral", dot: false },
  ready: { label: "מוכן", color: "info", dot: false },
  active: { label: "בשידור חי", color: "accent", dot: true, pulse: true },
  paused: { label: "בהשהיה", color: "warning", dot: true },
  read_only: { label: "קריאה בלבד", color: "info", dot: true },
  suspended: { label: "הושהה אוטומטית", color: "warning", dot: true },
  ended: { label: "הסתיים", color: "info", dot: false },
  archived: { label: "בארכיון", color: "neutral", dot: false },
};

export function boardStatusMeta(status: BoardStatus): StatusMeta {
  return BOARD_STATUS[status];
}

export function roomStatusMeta(status: RoomStatus, mode: RoomMode = "live"): StatusMeta {
  return (mode === "open" ? OPEN_ROOM_STATUS[status] : undefined) ?? ROOM_STATUS[status];
}

export function BoardStatusBadge({ status }: { status: BoardStatus }) {
  const { t } = useI18n();
  const m = BOARD_STATUS[status];
  return (
    <Badge color={m.color} variant="soft" dot={m.dot}>
      {t(m.label)}
    </Badge>
  );
}

export function RoomStatusBadge({ status, mode = "live", solid }: { status: RoomStatus; mode?: RoomMode; solid?: boolean }) {
  const { t } = useI18n();
  const m = roomStatusMeta(status, mode);
  return (
    <Badge color={m.color} variant={solid ? "solid" : "soft"} dot={m.dot} pulseDot={m.pulse}>
      {t(m.label)}
    </Badge>
  );
}
