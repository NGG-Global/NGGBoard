"use client";

import type { BoardStatus, RoomStatus } from "@/lib/types";
import { Badge, type BadgeColor } from "./Badge";

interface StatusMeta {
  label: string;
  color: BadgeColor;
  dot: boolean;
  pulse?: boolean;
}

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

export function roomStatusMeta(status: RoomStatus): StatusMeta {
  return ROOM_STATUS[status];
}

export function BoardStatusBadge({ status }: { status: BoardStatus }) {
  const m = BOARD_STATUS[status];
  return (
    <Badge color={m.color} variant="soft" dot={m.dot}>
      {m.label}
    </Badge>
  );
}

export function RoomStatusBadge({ status, solid }: { status: RoomStatus; solid?: boolean }) {
  const m = ROOM_STATUS[status];
  return (
    <Badge color={m.color} variant={solid ? "solid" : "soft"} dot={m.dot} pulseDot={m.pulse}>
      {m.label}
    </Badge>
  );
}
