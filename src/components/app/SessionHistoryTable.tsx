"use client";

import Link from "next/link";
import type { SessionSummary } from "@/lib/types";
import { RoomStatusBadge } from "@/components/ui";
import { EmptyState } from "@/components/ui";
import { formatAgo } from "@/lib/utils";

export function SessionHistoryTable({ sessions }: { sessions: SessionSummary[] }) {
  if (sessions.length === 0) {
    return <EmptyState compact title="הלוח עדיין לא הופעל" description="כשתפעילו חדר חי, כל מפגש יופיע כאן עם מספר המשתתפים והתוכן שנאסף." />;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {sessions.map(({ room, submission_count, duration_minutes }) => (
        <div
          key={room.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)",
            padding: "12px 14px",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 }}>
            <span style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-bold)" }}>
              {room.session_label || "מפגש ללא שם"}
            </span>
            <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-subtle)" }}>
              {formatAgo(room.started_at ?? room.created_at)}
              {duration_minutes != null && ` · ${duration_minutes} דק׳`} · {room.participant_count} משתתפים · {submission_count} פריטים
            </span>
          </div>
          <RoomStatusBadge status={room.status} />
          {(room.status === "ended" || room.status === "archived") && (
            <Link href={`/results/${room.id}`} style={{ fontSize: "var(--text-xs)", fontWeight: "var(--weight-bold)", color: "var(--accent-text)" }}>
              פתח תוצאות
            </Link>
          )}
          {["active", "paused", "read_only", "suspended"].includes(room.status) && (
            <Link href={`/app/rooms/${room.id}/control`} style={{ fontSize: "var(--text-xs)", fontWeight: "var(--weight-bold)", color: "var(--accent-text)" }}>
              חזרה לחדר
            </Link>
          )}
        </div>
      ))}
    </div>
  );
}
