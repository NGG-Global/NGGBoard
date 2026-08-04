"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Board, LiveRoom } from "@/lib/types";
import { db } from "@/lib/data";
import { useI18n } from "@/lib/i18n/react";
import { useLiveQuery, useTicker } from "@/lib/hooks";
import { dateInputFromDeadline, deadlineFromDateInput, deadlinePassed, formatDeadline } from "@/lib/rooms";
import { formatRoomCode } from "@/lib/utils";
import { Button, ConfirmDialog, Input, QRCodeCanvas, useToast } from "@/components/ui";
import { IconCheck, IconClock, IconCopy, IconMonitor, IconUsers } from "@/components/ui/icons";

/**
 * The facilitator's control surface for an open collection: the link to send,
 * how much has come in, what is waiting for approval, and the deadline.
 *
 * This exists because a live session's control room is the wrong tool here — it
 * is a projector-side cockpit for a room you are standing in front of, whereas
 * an open board is something you check on between other work.
 */
export function CollectionPanel({ board, room: initialRoom }: { board: Board; room: LiveRoom }) {
  const { t, lang } = useI18n();
  const toast = useToast();
  // Keeps the deadline and the closed state honest without a reload.
  useTicker(30000);

  // Re-read the room and its counts under the room scope. The caller watches the
  // board list, which hears status changes but not a new deadline or an arriving
  // submission — and on the Supabase backend the getRoom call is also what pulls
  // the room's submissions into the cache in the first place.
  const room = useLiveQuery({ room: initialRoom.id }, () => db.getRoom(initialRoom.id) ?? initialRoom, [initialRoom.id]);
  const counts = useLiveQuery(
    { room: initialRoom.id },
    () => {
      db.getRoom(initialRoom.id);
      return db.countByStatus(initialRoom.id);
    },
    [initialRoom.id],
  );

  const [joinUrl, setJoinUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [editingDeadline, setEditingDeadline] = useState(false);
  const [deadlineDraft, setDeadlineDraft] = useState(() => dateInputFromDeadline(room.closes_at));
  const [confirmClose, setConfirmClose] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") setJoinUrl(`${window.location.origin}/join/${room.public_id}`);
  }, [room.public_id]);

  useEffect(() => {
    setDeadlineDraft(dateInputFromDeadline(room.closes_at));
  }, [room.closes_at]);

  const collected = counts.published + counts.pending + counts.hidden;
  const closed = room.status === "read_only" || deadlinePassed(room);
  const deadline = formatDeadline(room.closes_at, lang === "he" ? "he-IL" : "en-GB");

  function copyLink() {
    navigator.clipboard?.writeText(joinUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function saveDeadline() {
    db.setCollectionDeadline(room.id, deadlineFromDateInput(deadlineDraft));
    setEditingDeadline(false);
    toast.show(deadlineDraft ? t("התאריך עודכן") : t("התאריך הוסר — הלוח פתוח עד לסגירה ידנית"));
  }

  return (
    <div style={{ background: "var(--surface)", border: "1.5px solid var(--magenta-400)", borderRadius: "var(--radius-xl)", padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 28, height: 28, borderRadius: "var(--radius-md)", background: "var(--accent-soft)", color: "var(--accent-text)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
          {closed ? <IconCheck size={15} /> : <IconClock size={15} />}
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-extrabold)", color: "var(--accent-text)" }}>
            {closed ? t("האיסוף נסגר") : t("הלוח פתוח לאיסוף")}
          </div>
          <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-subtle)" }}>
            {closed
              ? deadline
                ? t("נסגר ב-{date}. התוכן שנאסף נשמר.", { date: deadline })
                : t("התוכן שנאסף נשמר.")
              : deadline
                ? t("פתוח לשליחה עד {date}", { date: deadline })
                : t("ללא תאריך סיום — ייסגר כשתסגרו אותו")}
          </div>
        </div>
      </div>

      {/* The link to send. Everything a non-technical participant might need to
          get in — URL, QR, and the numeric code — points at the same place. */}
      {!closed && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, background: "var(--bg-subtle)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 12 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div style={{ background: "#fff", padding: 5, borderRadius: "var(--radius-md)", flex: "none" }}>
              {joinUrl && <QRCodeCanvas value={joinUrl} size={78} />}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
              <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-subtle)", fontWeight: "var(--weight-bold)" }}>{t("הקישור למשתתפים")}</div>
              <div dir="ltr" style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", wordBreak: "break-all", lineHeight: "var(--leading-snug)" }}>
                {joinUrl.replace(/^https?:\/\//, "")}
              </div>
              <div dir="ltr" style={{ fontSize: "var(--text-md)", fontWeight: "var(--weight-black)", letterSpacing: ".05em" }}>{formatRoomCode(room.room_code)}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="primary" size="sm" block leadingIcon={<IconCopy size={14} />} onClick={copyLink}>
              {copied ? t("הועתק") : t("העתק קישור")}
            </Button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`${board.public_title}\n${joinUrl}`)}`}
              target="_blank"
              rel="noreferrer"
              style={{ flex: 1, textDecoration: "none" }}
            >
              <Button variant="secondary" size="sm" block>{t("שליחה בוואטסאפ")}</Button>
            </a>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <Stat label={t("שיתופים")} value={collected} />
        <Stat label={t("משתתפים")} value={room.participant_count} icon={<IconUsers size={13} />} />
        <Stat label={t("ממתין לאישור")} value={counts.pending} highlight={counts.pending > 0} />
      </div>

      {counts.pending > 0 && (
        <div style={{ fontSize: "var(--text-2xs)", color: "var(--warning)", fontWeight: "var(--weight-semibold)", lineHeight: "var(--leading-relaxed)" }}>
          {t("יש {count} שיתופים שממתינים לאישור שלכם — עד שיאושרו הם לא מופיעים על הלוח.", { count: counts.pending })}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <Link href={`/app/rooms/${room.id}/control`} style={{ textDecoration: "none" }}>
          <Button variant={counts.pending > 0 ? "primary" : "secondary"} block leadingIcon={<IconMonitor size={15} />}>
            {t("צפייה בתוכן שנאסף")}
          </Button>
        </Link>

        {editingDeadline ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, background: "var(--bg-subtle)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 12 }}>
            <Input label={t("פתוח לשליחה עד")} type="date" value={deadlineDraft} onChange={(e) => setDeadlineDraft(e.target.value)} />
            <div style={{ display: "flex", gap: 8 }}>
              <Button variant="primary" size="sm" block onClick={saveDeadline}>{t("שמור")}</Button>
              <Button variant="ghost" size="sm" block onClick={() => { setDeadlineDraft(dateInputFromDeadline(room.closes_at)); setEditingDeadline(false); }}>
                {t("ביטול")}
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="ghost" size="sm" block onClick={() => setEditingDeadline(true)}>
            {closed ? t("פתיחה מחדש עם תאריך חדש") : deadline ? t("שינוי תאריך הסיום") : t("קביעת תאריך סיום")}
          </Button>
        )}

        {!closed && (
          <Button variant="ghost" size="sm" block onClick={() => setConfirmClose(true)}>
            {t("סגירת האיסוף עכשיו")}
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={confirmClose}
        title={t("לסגור את האיסוף?")}
        description={t("המשתתפים לא יוכלו לשלוח תוכן נוסף, והקישור יציג להם הודעה שהאיסוף נסגר. כל התוכן שנאסף יישמר ויישאר זמין לכם.")}
        confirmLabel={t("סגור איסוף")}
        onConfirm={() => {
          db.setRoomStatus(room.id, "read_only");
          db.setCollectionDeadline(room.id, new Date().toISOString());
          setConfirmClose(false);
          toast.show(t("האיסוף נסגר — התוכן נשמר"));
        }}
        onCancel={() => setConfirmClose(false)}
      />
    </div>
  );
}

function Stat({ label, value, icon, highlight }: { label: string; value: number; icon?: React.ReactNode; highlight?: boolean }) {
  return (
    <div style={{ flex: 1, minWidth: 0, background: highlight ? "var(--warning-bg)" : "var(--bg-subtle)", border: `1px solid ${highlight ? "var(--warning)" : "var(--border)"}`, borderRadius: "var(--radius-lg)", padding: "9px 10px", display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: "var(--text-lg)", fontWeight: "var(--weight-black)", lineHeight: 1, color: highlight ? "var(--warning)" : "var(--text)" }}>{value}</span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "var(--text-2xs)", color: "var(--text-subtle)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {icon}
        {label}
      </span>
    </div>
  );
}
