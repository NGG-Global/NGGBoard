"use client";

import Link from "next/link";
import type { SessionSummary } from "@/lib/types";
import { RoomStatusBadge, Badge } from "@/components/ui";
import { EmptyState } from "@/components/ui";
import { formatAgo } from "@/lib/utils";
import { isOpenRoom } from "@/lib/rooms";
import { useI18n } from "@/lib/i18n/react";

export function SessionHistoryTable({ sessions }: { sessions: SessionSummary[] }) {
  const { t } = useI18n();
  if (sessions.length === 0) {
    return <EmptyState compact title={t("הלוח עדיין לא הופעל")} description={t("כשתפעילו חדר חי, כל מפגש יופיע כאן עם מספר המשתתפים והתוכן שנאסף.")} />;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {sessions.map(({ room, submission_count, duration_minutes }) => {
        // An open collection runs for days, so its elapsed minutes are noise —
        // "8641 דק׳" tells a facilitator nothing. Show the mode instead.
        const open = isOpenRoom(room);
        return (
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
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-bold)" }}>
                {room.session_label || (open ? t("איסוף ללא שם") : t("מפגש ללא שם"))}
              </span>
              {open && <Badge color="accent" variant="outline">{t("לוח פתוח")}</Badge>}
            </span>
            <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-subtle)" }}>
              {open ? t("נפתח {ago}", { ago: formatAgo(room.started_at ?? room.created_at) }) : formatAgo(room.started_at ?? room.created_at)}
              {!open && duration_minutes != null && ` · ${t("{minutes} דק׳", { minutes: duration_minutes })}`} · {t("{count} משתתפים", { count: room.participant_count })} · {t("{count} פריטים", { count: submission_count })}
            </span>
          </div>
          <RoomStatusBadge status={room.status} mode={room.mode} />
          {(room.status === "ended" || room.status === "archived") && (
            <Link href={`/results/${room.id}`} style={{ fontSize: "var(--text-xs)", fontWeight: "var(--weight-bold)", color: "var(--accent-text)" }}>
              {t("פתח תוצאות")}
            </Link>
          )}
          {["active", "paused", "read_only", "suspended"].includes(room.status) && (
            <Link href={`/app/rooms/${room.id}/control`} style={{ fontSize: "var(--text-xs)", fontWeight: "var(--weight-bold)", color: "var(--accent-text)" }}>
              {open ? t("צפייה בתוכן") : t("חזרה לחדר")}
            </Link>
          )}
        </div>
        );
      })}
    </div>
  );
}
