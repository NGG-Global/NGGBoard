"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { use, useEffect, useMemo, useState } from "react";
import type { DisplayLayout, LiveRoom, Submission, SubmissionStatus } from "@/lib/types";
import { db } from "@/lib/data";
import { useLiveQuery, useMounted, useTicker } from "@/lib/hooks";
import { useInactivityMonitor } from "@/lib/useInactivity";
import { formatAgo, formatRoomCode, minutesBetween } from "@/lib/utils";
import { Button, ConfirmDialog, QRCodeCanvas, useToast, LiveDot } from "@/components/ui";
import { RoomStatusBadge } from "@/components/ui";
import { LayoutIcon } from "@/components/app/editor/BoardEditor";
import { ControlSubmissionCard, type CardActions } from "@/components/control/ControlSubmissionCard";
import {
  IconCopy,
  IconEyeOff,
  IconMonitor,
  IconPause,
  IconPlay,
  IconUsers,
  IconWarning,
} from "@/components/ui/icons";

type Tab = "published" | "pending" | "hidden" | "rejected";

const TAB_LABELS: Record<Tab, string> = { published: "מוצג", pending: "ממתין לאישור", hidden: "מוסתר", rejected: "נדחה" };

export default function ControlRoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = use(params);
  const router = useRouter();
  const toast = useToast();
  const mounted = useMounted();
  useTicker(8000); // keep relative times fresh

  const room = useLiveQuery({ room: roomId }, () => db.getRoom(roomId));
  const board = useLiveQuery({ room: roomId }, () => db.getBoardForRoom(roomId));
  const submissions = useLiveQuery({ room: roomId }, () => db.listSubmissions(roomId));

  const [tab, setTab] = useState<Tab>("published");
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [copied, setCopied] = useState(false);
  const [joinUrl, setJoinUrl] = useState("");
  const [prevIds, setPrevIds] = useState<Set<string>>(new Set());
  const [newIds, setNewIds] = useState<Set<string>>(new Set());

  const inactivity = useInactivityMonitor(room);

  useEffect(() => {
    if (typeof window !== "undefined" && room) setJoinUrl(`${window.location.origin}/join/${room.public_id}`);
  }, [room?.public_id]);

  // Track newly-arrived submissions to animate them in.
  useEffect(() => {
    const currentIds = new Set(submissions.map((s) => s.id));
    const fresh = [...currentIds].filter((id) => !prevIds.has(id));
    if (prevIds.size > 0 && fresh.length > 0) {
      setNewIds(new Set(fresh));
      const t = setTimeout(() => setNewIds(new Set()), 900);
      setPrevIds(currentIds);
      return () => clearTimeout(t);
    }
    setPrevIds(currentIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissions]);

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { published: 0, pending: 0, hidden: 0, rejected: 0 };
    for (const s of submissions) {
      if (s.status === "published") c.published++;
      else if (s.status === "pending") c.pending++;
      else if (s.status === "hidden") c.hidden++;
      else if (s.status === "rejected") c.rejected++;
    }
    return c;
  }, [submissions]);

  const visible = useMemo(() => {
    const byTab = submissions.filter((s) => s.status === tab);
    byTab.sort((a, b) => (Number(b.pinned) - Number(a.pinned)) || (new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
    return byTab;
  }, [submissions, tab]);

  if (!mounted) return null;

  if (!room || !board) {
    return (
      <CenterMessage
        title="החדר לא נמצא"
        description="ייתכן שהמפגש נמחק או שאין לכם הרשאת גישה."
        action={<Button variant="primary" onClick={() => router.push("/app/boards")}>חזרה לרשימת הלוחות</Button>}
      />
    );
  }

  const paused = room.status === "paused";
  const suspended = room.status === "suspended";
  const readOnly = room.status === "read_only";
  const ended = room.status === "ended";
  const liveNow = room.status === "active";

  function moderateWithUndo(sub: Submission, action: "hide" | "reject" | "delete", message: string) {
    const prevStatus = sub.status;
    db.moderate(sub.id, action);
    toast.show(message, () => db.restoreTo(sub.id, prevStatus));
  }

  function copyLink() {
    navigator.clipboard?.writeText(joinUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function actionsFor(sub: Submission): CardActions {
    if (tab === "published") {
      return {
        onFocus: () => db.setFocus(roomId, room!.focused_submission_id === sub.id ? null : sub.id),
        onPin: () => db.moderate(sub.id, sub.pinned ? "unpin" : "pin"),
        onHide: () => moderateWithUndo(sub, "hide", "התוכן הוסתר מהמסך"),
        onDelete: () => moderateWithUndo(sub, "delete", "התוכן נמחק"),
      };
    }
    if (tab === "pending") {
      return {
        onApprove: () => {
          db.moderate(sub.id, "approve");
          toast.show("התוכן אושר ומוצג על המסך");
        },
        onReject: () => moderateWithUndo(sub, "reject", "התוכן נדחה"),
        onDelete: () => moderateWithUndo(sub, "delete", "התוכן נמחק"),
      };
    }
    // hidden / rejected
    return {
      onRestore: () => {
        db.moderate(sub.id, "restore");
        toast.show("התוכן הושב לתצוגה");
      },
      onDelete: () => moderateWithUndo(sub, "delete", "התוכן נמחק"),
    };
  }

  const elapsed = minutesBetween(room.started_at, ended ? room.ended_at : new Date().toISOString()) ?? 0;

  return (
    <div dir="rtl" style={{ height: "100vh", display: "flex", flexDirection: "column", background: "var(--surface-sunken)", fontFamily: "var(--font-sans)", color: "var(--text)", overflow: "hidden" }}>
      {/* Top status bar */}
      <header style={{ height: 62, flex: "none", display: "flex", alignItems: "center", gap: 14, padding: "0 20px", background: "var(--surface)", borderBottom: "1px solid var(--border)", zIndex: 10 }}>
        <Image src="/brand/ngg-logo.png" alt="NGG" width={70} height={24} style={{ height: 24, width: "auto" }} />
        <div style={{ width: 1, height: 26, background: "var(--border)" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
          <div style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-bold)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "40vw" }}>{board.public_title}</div>
          <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-subtle)" }}>
            {room.session_label ? `מפגש: ${room.session_label} · ` : ""}החל לפני {elapsed} דק׳
          </div>
        </div>
        <RoomStatusBadge status={room.status} solid={liveNow} />
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--success)" }} />
          מחובר
        </div>
        <div style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)" }}>פעילות אחרונה {formatAgo(room.last_activity_at)}</div>
        <div style={{ flex: 1 }} />
        <Button variant="outline" size="sm" leadingIcon={<IconMonitor size={14} />} onClick={() => window.open(`/display/${room.public_id}`, "_blank")}>פתח תצוגה</Button>
        {!ended && <Button variant="danger" size="sm" onClick={() => setConfirmEnd(true)}>סיים מפגש</Button>}
      </header>

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* Left panel */}
        <aside style={{ width: 292, flex: "none", overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 14, borderInlineEnd: "1px solid var(--border)", background: "var(--bg-subtle)" }}>
          {/* Join panel */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", padding: 18, display: "flex", flexDirection: "column", alignItems: "center", gap: 12, boxShadow: "var(--shadow-xs)" }}>
            <div style={{ fontSize: "var(--text-xs)", fontWeight: "var(--weight-bold)", color: "var(--text-subtle)", alignSelf: "flex-start" }}>הצטרפות למפגש</div>
            {joinUrl && <QRCodeCanvas value={joinUrl} size={172} />}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-subtle)" }}>קוד חדר</div>
              <div dir="ltr" style={{ fontSize: "var(--text-2xl)", fontWeight: "var(--weight-black)", letterSpacing: ".08em", lineHeight: "var(--leading-tight)" }}>{formatRoomCode(room.room_code)}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", background: "var(--bg-muted)", borderRadius: "var(--radius-lg)", padding: "7px 10px" }}>
              <div dir="ltr" style={{ flex: 1, fontSize: "var(--text-xs)", fontFamily: "var(--font-mono)", color: "var(--text-muted)", textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {joinUrl.replace(/^https?:\/\//, "")}
              </div>
              <button onClick={copyLink} className="ngg-hover" style={{ display: "flex", alignItems: "center", gap: 4, border: "none", background: "transparent", color: "var(--accent-text)", fontSize: "var(--text-2xs)", fontWeight: "var(--weight-bold)", cursor: "pointer", padding: "4px 6px", borderRadius: "var(--radius-md)" }}>
                <IconCopy size={13} />
                {copied ? "הועתק" : "העתק"}
              </button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
              <IconUsers size={16} />
              <strong style={{ fontWeight: "var(--weight-extrabold)", color: "var(--text)" }}>{room.participant_count}</strong> משתתפים מחוברים
            </div>
            <Button variant={room.qr_overlay_visible ? "primary" : "secondary"} size="sm" block onClick={() => db.setQrOverlay(roomId, !room.qr_overlay_visible)}>
              {room.qr_overlay_visible ? "הסתר QR מהמסך" : "הצג QR על המסך"}
            </Button>
          </div>

          {/* Room controls */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", padding: 16, display: "flex", flexDirection: "column", gap: 10, boxShadow: "var(--shadow-xs)" }}>
            <div style={{ fontSize: "var(--text-xs)", fontWeight: "var(--weight-bold)", color: "var(--text-subtle)" }}>בקרת חדר</div>

            {suspended ? (
              <Button variant="primary" block onClick={() => { db.reactivateRoom(roomId); toast.show("החדר הופעל מחדש"); }}>
                הפעל מחדש
              </Button>
            ) : (
              <>
                <ControlToggle
                  active={paused}
                  onClick={() => {
                    if (paused) { db.resumeRoom(roomId); toast.show("קבלת התוכן חודשה"); }
                    else { db.pauseRoom(roomId); toast.show("קבלת התוכן הושהתה — המשתתפים רואים הודעת המתנה"); }
                  }}
                  icon={paused ? <IconPlay size={14} /> : <IconPause size={14} />}
                  activeColor="warning"
                >
                  {paused ? "המשך קבלת תוכן" : "השהה קבלת תוכן"}
                </ControlToggle>
                <ControlToggle
                  active={readOnly}
                  onClick={() => { db.setReadOnly(roomId, !readOnly); toast.show(readOnly ? "מצב קריאה בלבד בוטל" : "מצב קריאה בלבד — הלוח מוצג אך לא מקבל תוכן חדש"); }}
                  activeColor="info"
                >
                  {readOnly ? "בטל מצב קריאה בלבד" : "מצב קריאה בלבד"}
                </ControlToggle>
              </>
            )}

            <div style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />
            <div style={{ fontSize: "var(--text-xs)", fontWeight: "var(--weight-bold)", color: "var(--text-subtle)" }}>פריסת תצוגה</div>
            <div style={{ display: "flex", gap: 6 }}>
              {(["wall", "mosaic", "feed"] as DisplayLayout[]).map((l) => {
                const active = room.layout === l;
                return (
                  <button
                    key={l}
                    onClick={() => db.setLayout(roomId, l)}
                    aria-pressed={active}
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 5,
                      padding: "9px 4px",
                      borderRadius: "var(--radius-lg)",
                      border: `1.5px solid ${active ? "var(--magenta-500)" : "var(--border)"}`,
                      background: active ? "var(--accent-soft)" : "var(--surface)",
                      color: active ? "var(--accent-text)" : "var(--text-muted)",
                      fontSize: "var(--text-2xs)",
                      fontWeight: "var(--weight-semibold)",
                      cursor: "pointer",
                    }}
                  >
                    <LayoutIcon layout={l} color="currentColor" />
                    {{ wall: "קיר כרטיסים", mosaic: "פסיפס", feed: "פיד חי" }[l]}
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ flex: "none", padding: "16px 22px 12px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <div style={{ fontSize: "var(--text-lg)", fontWeight: "var(--weight-extrabold)" }}>{board.public_subtitle || board.public_title}</div>
            <div style={{ flex: 1 }} />
            <div role="tablist" style={{ display: "flex", background: "var(--bg-muted)", borderRadius: "var(--radius-lg)", padding: 3, gap: 2, flexWrap: "wrap" }}>
              {(["published", "pending", "hidden", "rejected"] as Tab[]).map((t) => {
                const active = tab === t;
                if (t === "rejected" && counts.rejected === 0 && tab !== "rejected") return null;
                return (
                  <button
                    key={t}
                    role="tab"
                    aria-selected={active}
                    onClick={() => setTab(t)}
                    style={{
                      border: "none",
                      padding: "6px 14px",
                      borderRadius: "var(--radius-md)",
                      background: active ? "var(--surface)" : "transparent",
                      color: active ? "var(--text)" : "var(--text-muted)",
                      boxShadow: active ? "var(--shadow-sm)" : "none",
                      fontSize: "var(--text-xs)",
                      fontWeight: "var(--weight-bold)",
                      cursor: "pointer",
                    }}
                  >
                    {TAB_LABELS[t]} · {counts[t]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Inactivity warning */}
          {inactivity.warning && liveNow && (
            <Banner color="warning" icon={<IconWarning size={15} />}>
              אין פעילות כבר {Math.round(inactivity.idleMs / 60000)} דק׳ — החדר יושהה אוטומטית בעוד {inactivity.minutesUntilSuspend} דק׳
              <Button variant="secondary" size="sm" onClick={() => db.touchActivity(roomId)}>שמור על החדר פעיל</Button>
            </Banner>
          )}
          {paused && (
            <Banner color="warning" icon={<IconPause size={15} />}>
              קבלת התוכן מושהית — המשתתפים רואים הודעת המתנה
              <Button variant="secondary" size="sm" onClick={() => { db.resumeRoom(roomId); }}>המשך קבלת תוכן</Button>
            </Banner>
          )}
          {suspended && (
            <Banner color="warning" icon={<IconWarning size={15} />}>
              החדר הושהה אוטומטית לאחר 30 דקות ללא פעילות. כל התוכן נשמר.
              <Button variant="primary" size="sm" onClick={() => { db.reactivateRoom(roomId); toast.show("החדר הופעל מחדש"); }}>הפעל מחדש</Button>
            </Banner>
          )}
          {readOnly && (
            <Banner color="info" icon={<IconEyeOff size={15} />}>
              מצב קריאה בלבד — הלוח מוצג אך אינו מקבל תוכן חדש
            </Banner>
          )}

          {/* Cards */}
          <div style={{ flex: 1, overflowY: "auto", padding: "2px 22px 24px" }}>
            {visible.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "70px 20px", color: "var(--text-subtle)", fontSize: "var(--text-sm)", textAlign: "center" }}>
                <IconMonitor size={34} strokeWidth={1.5} style={{ opacity: 0.5 }} />
                {emptyMessage(tab)}
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(236px,1fr))", gap: 14, alignItems: "start" }}>
                {visible.map((s) => (
                  <ControlSubmissionCard
                    key={s.id}
                    submission={s}
                    board={board}
                    focused={room.focused_submission_id === s.id}
                    isNew={newIds.has(s.id)}
                    actions={actionsFor(s)}
                  />
                ))}
              </div>
            )}
          </div>
        </main>
      </div>

      <ConfirmDialog
        open={confirmEnd}
        title="לסיים את המפגש?"
        description="המשתתפים לא יוכלו לשלוח תוכן נוסף. כל התוכן שנאסף יישמר בהיסטוריית המפגשים של הלוח."
        confirmLabel="סיים מפגש"
        danger
        onConfirm={() => { db.endRoom(roomId); setConfirmEnd(false); router.push(`/results/${roomId}`); }}
        onCancel={() => setConfirmEnd(false)}
      />

      {ended && (
        <EndedOverlay room={room} submissionCount={counts.published + counts.hidden} elapsed={elapsed} onResults={() => router.push(`/results/${roomId}`)} onReopen={() => db.reactivateRoom(roomId)} />
      )}
    </div>
  );
}

function ControlToggle({ active, onClick, icon, children, activeColor }: { active: boolean; onClick: () => void; icon?: React.ReactNode; children: React.ReactNode; activeColor: "warning" | "info" }) {
  const c = activeColor === "warning" ? { border: "var(--warning)", bg: "var(--warning-bg)", color: "var(--warning)" } : { border: "var(--info)", bg: "var(--info-bg)", color: "var(--info)" };
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        width: "100%",
        padding: 10,
        borderRadius: "var(--radius-lg)",
        border: `1px solid ${active ? c.border : "var(--border-strong)"}`,
        background: active ? c.bg : "var(--surface)",
        color: active ? c.color : "var(--text)",
        fontSize: "var(--text-sm)",
        fontWeight: "var(--weight-bold)",
        cursor: "pointer",
      }}
    >
      {icon}
      {children}
    </button>
  );
}

function Banner({ color, icon, children }: { color: "warning" | "info"; icon: React.ReactNode; children: React.ReactNode }) {
  const c = color === "warning" ? { border: "var(--warning)", bg: "var(--warning-bg)", color: "var(--warning)" } : { border: "var(--info)", bg: "var(--info-bg)", color: "var(--info)" };
  return (
    <div style={{ flex: "none", margin: "0 22px 12px", display: "flex", alignItems: "center", gap: 10, background: c.bg, border: `1px solid ${c.border}`, borderRadius: "var(--radius-lg)", padding: "10px 14px", fontSize: "var(--text-sm)", color: c.color, fontWeight: "var(--weight-semibold)", flexWrap: "wrap" }}>
      {icon}
      <span style={{ flex: 1, minWidth: 160, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>{children}</span>
    </div>
  );
}

function emptyMessage(tab: Tab): string {
  switch (tab) {
    case "pending": return "אין תוכן שממתין לאישור";
    case "hidden": return "אין תוכן מוסתר";
    case "rejected": return "אין תוכן שנדחה";
    default: return "עוד אין תוכן — ברגע שמשתתפים ישלחו, הוא יופיע כאן";
  }
}

function CenterMessage({ title, description, action }: { title: string; description: string; action: React.ReactNode }) {
  return (
    <div dir="rtl" style={{ height: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, background: "var(--surface-sunken)", fontFamily: "var(--font-sans)", padding: 24, textAlign: "center" }}>
      <IconWarning size={38} style={{ color: "var(--text-subtle)" }} />
      <div style={{ fontSize: "var(--text-2xl)", fontWeight: "var(--weight-black)" }}>{title}</div>
      <div style={{ color: "var(--text-muted)" }}>{description}</div>
      {action}
    </div>
  );
}

function EndedOverlay({ room, submissionCount, elapsed, onResults, onReopen }: { room: LiveRoom; submissionCount: number; elapsed: number; onResults: () => void; onReopen: () => void }) {
  return (
    <div className="theme-dark" dir="rtl" style={{ position: "fixed", inset: 0, background: "var(--gradient-ink)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 26, zIndex: 80, color: "#f4f4f6", fontFamily: "var(--font-sans)" }}>
      <Image src="/brand/ngg-mark.png" alt="" width={50} height={44} style={{ height: 44, width: "auto", opacity: 0.85 }} />
      <div style={{ fontSize: "var(--text-3xl)", fontWeight: "var(--weight-black)" }}>המפגש הסתיים</div>
      <div style={{ display: "flex", gap: 52, flexWrap: "wrap", justifyContent: "center" }}>
        <Stat value={room.participant_count} label="משתתפים" />
        <Stat value={submissionCount} label="פריטי תוכן" />
        <Stat value={elapsed} label="דקות" />
      </div>
      <div style={{ display: "flex", gap: 12 }}>
        <Button variant="primary" onClick={onResults}>צפה בתוצאות המפגש</Button>
        <Button variant="outline" onClick={onReopen}>חזרה לחדר</Button>
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <div className="ngg-magenta-text" style={{ fontSize: "var(--text-3xl)", fontWeight: "var(--weight-black)" }}>{value}</div>
      <div style={{ fontSize: "var(--text-xs)", color: "var(--neutral-400)" }}>{label}</div>
    </div>
  );
}
