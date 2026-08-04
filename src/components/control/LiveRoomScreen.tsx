"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DisplayLayout, Submission } from "@/lib/types";
import { useI18n } from "@/lib/i18n/react";
import { db, CURRENT_USER_ID } from "@/lib/data";
import { useLiveQuery, useMounted, useTicker } from "@/lib/hooks";
import { useInactivityMonitor } from "@/lib/useInactivity";
import { formatAgo, formatRoomCode, minutesBetween } from "@/lib/utils";
import { Button, ConfirmDialog, QRCodeCanvas, RoomStatusBadge, Spinner, useToast, LiveDot } from "@/components/ui";
import { LayoutIcon } from "@/components/app/editor/BoardEditor";
import { ControlSubmissionCard, type CardActions } from "@/components/control/ControlSubmissionCard";
import { CommentThread } from "@/components/app/CommentThread";
import { DisplayCanvas, type FacilitatorControls } from "@/components/display/DisplayCanvas";
import {
  IconChevron,
  IconClock,
  IconCopy,
  IconExpand,
  IconEyeOff,
  IconPause,
  IconPlay,
  IconTrash,
  IconUsers,
  IconWarning,
  IconX,
} from "@/components/ui/icons";

type Tab = "published" | "pending" | "hidden" | "rejected";

const resetBtnStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  padding: "9px 10px",
  border: "1px solid var(--border-strong)",
  background: "var(--surface)",
  color: "var(--text)",
  borderRadius: "var(--radius-md)",
  fontSize: "var(--text-xs)",
  fontWeight: "var(--weight-bold)",
  cursor: "pointer",
  textAlign: "start",
};
const TAB_LABELS: Record<Tab, string> = { published: "מוצג", pending: "ממתין", hidden: "מוסתר", rejected: "נדחה" };
const DRAWER_W = 372;

export function LiveRoomScreen({ roomId }: { roomId: string }) {
  const { lang, t } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const mounted = useMounted();
  useTicker(8000);

  const room = useLiveQuery({ room: roomId }, () => db.getRoom(roomId));
  const board = useLiveQuery({ room: roomId }, () => db.getBoardForRoom(roomId));
  const submissions = useLiveQuery({ room: roomId }, () => db.listSubmissions(roomId));
  const participants = useLiveQuery({ room: roomId }, () => db.listParticipants(roomId));

  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<Tab>("pending");
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [confirmClearBoard, setConfirmClearBoard] = useState(false);
  const [confirmResetSession, setConfirmResetSession] = useState(false);
  const [rosterOpen, setRosterOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [joinUrl, setJoinUrl] = useState("");
  const [isFs, setIsFs] = useState(false);
  const [graceOver, setGraceOver] = useState(false);

  const inactivity = useInactivityMonitor(room ?? null);

  useEffect(() => {
    if (typeof window !== "undefined" && room) setJoinUrl(`${window.location.origin}/join/${room.public_id}`);
  }, [room?.public_id]);

  useEffect(() => {
    const t = setTimeout(() => setGraceOver(true), 6000);
    const onFs = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      clearTimeout(t);
      document.removeEventListener("fullscreenchange", onFs);
    };
  }, [roomId]);

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { published: 0, pending: 0, hidden: 0, rejected: 0 };
    for (const s of submissions) if (s.status in c) c[s.status as Tab]++;
    return c;
  }, [submissions]);

  // Default the drawer's content tab ONCE, after the first data arrives — then
  // leave the facilitator's choice alone. (Previously this re-fired on every
  // pending 0↔1 transition, yanking the tab away mid-session as items arrived
  // or were cleared.)
  const didDefaultTab = useRef(false);
  useEffect(() => {
    if (didDefaultTab.current || submissions.length === 0) return;
    didDefaultTab.current = true;
    setTab(counts.pending > 0 ? "pending" : "published");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissions.length]);

  const listItems = useMemo(() => {
    const inTab = submissions.filter((s) => s.status === tab);
    inTab.sort((a, b) => Number(b.pinned) - Number(a.pinned) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return inTab;
  }, [submissions, tab]);

  if (!mounted || (!room && !graceOver)) {
    return (
      <div style={{ height: "100vh", display: "grid", placeItems: "center", background: "var(--ink-950)" }}>
        <Spinner size={30} color="#fff" />
      </div>
    );
  }
  if (!room || !board) {
    return (
      <div style={{ height: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, background: "var(--surface-sunken)", fontFamily: "var(--font-sans)", textAlign: "center", padding: 24 }}>
        <IconWarning size={38} style={{ color: "var(--text-subtle)" }} />
        <div style={{ fontSize: "var(--text-2xl)", fontWeight: "var(--weight-black)" }}>{t("החדר לא נמצא")}</div>
        <Button variant="primary" onClick={() => router.push("/app/boards")}>{t("חזרה לרשימת הלוחות")}</Button>
      </div>
    );
  }

  const paused = room.status === "paused";
  const suspended = room.status === "suspended";
  const readOnly = room.status === "read_only";
  const liveNow = room.status === "active";
  const elapsed = minutesBetween(room.started_at, room.ended_at ?? new Date().toISOString()) ?? 0;

  function moderateWithUndo(sub: Submission, action: "hide" | "reject" | "delete", message: string) {
    const prev = sub.status;
    db.moderate(sub.id, action);
    toast.show(message, () => db.restoreTo(sub.id, prev));
  }

  const facilitator: FacilitatorControls = {
    focusedId: room.focused_submission_id,
    onFocus: (id) => db.setFocus(roomId, room.focused_submission_id === id ? null : id),
    onPin: (id) => {
      const s = submissions.find((x) => x.id === id);
      db.moderate(id, s?.pinned ? "unpin" : "pin");
    },
    onHide: (id) => {
      const s = submissions.find((x) => x.id === id);
      if (s) moderateWithUndo(s, "hide", t("התוכן הוסתר מהמסך"));
    },
    onDelete: (id) => {
      const s = submissions.find((x) => x.id === id);
      if (s) moderateWithUndo(s, "delete", t("התוכן נמחק"));
    },
  };

  function listActionsFor(sub: Submission): CardActions {
    if (tab === "pending") {
      return {
        onApprove: () => { db.moderate(sub.id, "approve"); toast.show(t("התוכן אושר ומוצג על המסך")); },
        onReject: () => moderateWithUndo(sub, "reject", t("התוכן נדחה")),
        onDelete: () => moderateWithUndo(sub, "delete", t("התוכן נמחק")),
      };
    }
    if (tab === "published") {
      return {
        onFocus: () => db.setFocus(roomId, room!.focused_submission_id === sub.id ? null : sub.id),
        onPin: () => db.moderate(sub.id, sub.pinned ? "unpin" : "pin"),
        onHide: () => moderateWithUndo(sub, "hide", t("התוכן הוסתר מהמסך")),
        onDelete: () => moderateWithUndo(sub, "delete", t("התוכן נמחק")),
      };
    }
    return {
      onRestore: () => { db.moderate(sub.id, "restore"); toast.show(t("התוכן הושב לתצוגה")); },
      onDelete: () => moderateWithUndo(sub, "delete", t("התוכן נמחק")),
    };
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
  }

  return (
    <div dir="ltr" style={{ height: "100vh", width: "100vw", display: "flex", overflow: "hidden", background: "var(--ink-950)", fontFamily: "var(--font-sans)" }}>
      {/* ---- Control drawer (physical left) ---- */}
      <aside
        style={{
          width: open ? DRAWER_W : 0,
          flex: "none",
          transition: "width var(--dur) var(--ease-out)",
          overflow: "hidden",
          background: "var(--surface)",
          borderInlineEnd: open ? "1px solid var(--border)" : "none",
          boxShadow: open ? "var(--shadow-lg)" : "none",
          zIndex: 20,
        }}
        aria-hidden={!open}
      >
        <div dir={lang === "he" ? "rtl" : "ltr"} style={{ width: DRAWER_W, height: "100%", display: "flex", flexDirection: "column", color: "var(--text)" }}>
          {/* Drawer header */}
          <div style={{ flex: "none", padding: "14px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={() => router.push(`/app/boards/${board.id}`)} className="ngg-hover" aria-label={t("חזרה ללוח")} style={{ border: "none", background: "transparent", cursor: "pointer", padding: 6, borderRadius: "var(--radius-md)", color: "var(--text-muted)", display: "flex" }}>
              <IconChevron size={16} strokeWidth={2.2} />
            </button>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-bold)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{board.public_title}</div>
              <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-subtle)" }}>
                {room.session_label ? `${room.session_label} · ` : ""}{t("החל לפני {minutes} דק׳", { minutes: elapsed })}
              </div>
            </div>
            <RoomStatusBadge status={room.status} mode={room.mode} solid={liveNow} />
            <button onClick={() => setOpen(false)} className="ngg-hover" aria-label={t("סגור בקרה")} title={t("סגור פאנל")} style={{ border: "none", background: "transparent", cursor: "pointer", padding: 6, borderRadius: "var(--radius-md)", color: "var(--text-muted)", display: "flex" }}>
              <IconX size={16} />
            </button>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Alerts */}
            {inactivity.warning && liveNow && (
              <Alert color="warning" icon={<IconWarning size={15} />}>
                {t("אין פעילות {idleMinutes} דק׳ — החדר יושהה בעוד {minutesLeft} דק׳", { idleMinutes: Math.round(inactivity.idleMs / 60000), minutesLeft: inactivity.minutesUntilSuspend })}
                <Button variant="secondary" size="sm" onClick={() => db.touchActivity(roomId)}>{t("שמור פעיל")}</Button>
              </Alert>
            )}
            {suspended && (
              <Alert color="warning" icon={<IconClock size={15} />}>
                {t("החדר הושהה אוטומטית לאחר 30 דקות ללא פעילות. התוכן נשמר.")}
                <Button variant="primary" size="sm" onClick={() => { db.reactivateRoom(roomId); toast.show(t("החדר הופעל מחדש")); }}>{t("הפעל מחדש")}</Button>
              </Alert>
            )}

            {/* Join panel */}
            <SectionCard title={t("הצטרפות למפגש")}>
              <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                <div style={{ background: "#fff", padding: 6, borderRadius: "var(--radius-md)", flex: "none" }}>
                  {joinUrl && <QRCodeCanvas value={joinUrl} size={92} />}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                  <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-subtle)" }}>{t("קוד חדר")}</div>
                  <div dir="ltr" style={{ fontSize: "var(--text-2xl)", fontWeight: "var(--weight-black)", letterSpacing: ".06em", lineHeight: 1 }}>{formatRoomCode(room.room_code)}</div>
                  <button onClick={() => { navigator.clipboard?.writeText(joinUrl).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="ngg-hover" style={{ display: "inline-flex", alignItems: "center", gap: 4, border: "none", background: "transparent", color: "var(--accent-text)", fontSize: "var(--text-2xs)", fontWeight: "var(--weight-bold)", cursor: "pointer", padding: "3px 4px", borderRadius: "var(--radius-md)", alignSelf: "flex-start" }}>
                    <IconCopy size={13} /> {copied ? t("הועתק") : t("העתק קישור")}
                  </button>
                </div>
              </div>
              <button
                onClick={() => setRosterOpen((v) => !v)}
                aria-expanded={rosterOpen}
                className="ngg-hover"
                style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--text-sm)", color: "var(--text-muted)", marginTop: 4, border: "1px solid var(--border)", background: "var(--surface)", borderRadius: "var(--radius-md)", padding: "8px 10px", cursor: "pointer", width: "100%" }}
              >
                <IconUsers size={16} />
                <strong style={{ fontWeight: "var(--weight-extrabold)", color: "var(--text)" }}>{room.participant_count}</strong> {t("משתתפים מחוברים")}
                <span style={{ marginInlineStart: "auto", display: "flex", transform: rosterOpen ? "rotate(90deg)" : "rotate(0deg)", transition: "transform var(--dur) var(--ease-out)", color: "var(--text-subtle)" }}>
                  <IconChevron size={14} strokeWidth={2.2} />
                </span>
              </button>
              {rosterOpen && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflowY: "auto", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 8 }}>
                  {participants.length === 0 ? (
                    <div style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)", textAlign: "center", padding: "10px 0" }}>{t("עדיין לא הצטרפו משתתפים")}</div>
                  ) : (
                    participants.map((p) => {
                      const anon = !p.display_name;
                      return (
                        <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ width: 24, height: 24, borderRadius: "50%", background: anon ? "var(--bg-muted)" : "var(--accent-soft)", color: anon ? "var(--text-subtle)" : "var(--accent-text)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "var(--text-2xs)", fontWeight: "var(--weight-extrabold)", flex: "none" }}>
                            {anon ? "?" : p.display_name!.charAt(0)}
                          </span>
                          <span style={{ fontSize: "var(--text-xs)", fontWeight: "var(--weight-semibold)", color: anon ? "var(--text-subtle)" : "var(--text)", flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {p.display_name || t("אנונימי")}
                          </span>
                          <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-subtle)" }}>{formatAgo(p.created_at)}</span>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
              <Button variant={room.qr_overlay_visible ? "primary" : "secondary"} size="sm" block onClick={() => db.setQrOverlay(roomId, !room.qr_overlay_visible)}>
                {room.qr_overlay_visible ? t("הסתר QR מהמסך") : t("הצג QR על המסך")}
              </Button>
            </SectionCard>

            {/* Room controls */}
            <SectionCard title={t("בקרת חדר")}>
              {!suspended && (
                <div style={{ display: "flex", gap: 8 }}>
                  <ToggleBtn active={paused} onClick={() => { if (paused) { db.resumeRoom(roomId); toast.show(t("קבלת התוכן חודשה")); } else { db.pauseRoom(roomId); toast.show(t("קבלת התוכן הושהתה")); } }} icon={paused ? <IconPlay size={14} /> : <IconPause size={14} />} color="warning">
                    {paused ? t("המשך קבלה") : t("השהה קבלה")}
                  </ToggleBtn>
                  <ToggleBtn active={readOnly} onClick={() => { db.setReadOnly(roomId, !readOnly); toast.show(readOnly ? t("מצב קריאה בלבד בוטל") : t("מצב קריאה בלבד")); }} icon={<IconEyeOff size={14} />} color="info">
                    {t("קריאה בלבד")}
                  </ToggleBtn>
                </div>
              )}
              <div style={{ fontSize: "var(--text-2xs)", fontWeight: "var(--weight-bold)", color: "var(--text-subtle)", marginTop: 2 }}>{t("פריסת תצוגה")}</div>
              <div style={{ display: "flex", gap: 6 }}>
                {(["wall", "mosaic", "feed"] as DisplayLayout[]).map((l) => {
                  const active = room.layout === l;
                  return (
                    <button key={l} onClick={() => db.setLayout(roomId, l)} aria-pressed={active} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5, padding: "9px 4px", borderRadius: "var(--radius-md)", border: `1.5px solid ${active ? "var(--magenta-500)" : "var(--border)"}`, background: active ? "var(--accent-soft)" : "var(--surface)", color: active ? "var(--accent-text)" : "var(--text-muted)", fontSize: "var(--text-2xs)", fontWeight: "var(--weight-semibold)", cursor: "pointer" }}>
                      <LayoutIcon layout={l} color="currentColor" />
                      {t({ wall: "קיר", mosaic: "פסיפס", feed: "פיד" }[l])}
                    </button>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
                <Button variant="secondary" size="sm" block leadingIcon={<IconExpand size={14} />} onClick={toggleFullscreen}>{isFs ? t("צא ממסך מלא") : t("מסך מלא")}</Button>
                <Button variant="danger" size="sm" block onClick={() => setConfirmEnd(true)}>{t("סיים מפגש")}</Button>
              </div>
            </SectionCard>

            {/* Reset actions */}
            <SectionCard title={t("איפוס")}>
              <button onClick={() => setConfirmClearBoard(true)} className="ngg-hover" style={resetBtnStyle}>
                <IconTrash size={14} /> {t("אפס לוח — מחק את כל התוכן")}
              </button>
              <button onClick={() => setConfirmResetSession(true)} className="ngg-danger-hover" style={{ ...resetBtnStyle, color: "var(--danger)", borderColor: "var(--danger)" }}>
                <IconUsers size={14} /> {t("אפס מפגש — נקה תוכן והוצא את כל המשתתפים")}
              </button>
            </SectionCard>

            {/* Content moderation */}
            <SectionCard title={t("ניהול תוכן")} grow>
              <div role="tablist" style={{ display: "flex", background: "var(--bg-muted)", borderRadius: "var(--radius-md)", padding: 3, gap: 2 }}>
                {(["published", "pending", "hidden", "rejected"] as Tab[]).map((tk) => {
                  if (tk === "rejected" && counts.rejected === 0 && tab !== "rejected") return null;
                  const active = tab === tk;
                  return (
                    <button key={tk} role="tab" aria-selected={active} onClick={() => setTab(tk)} style={{ flex: 1, border: "none", padding: "6px 6px", borderRadius: "var(--radius-sm)", background: active ? "var(--surface)" : "transparent", color: active ? "var(--text)" : "var(--text-muted)", boxShadow: active ? "var(--shadow-sm)" : "none", fontSize: "var(--text-2xs)", fontWeight: "var(--weight-bold)", cursor: "pointer", whiteSpace: "nowrap" }}>
                      {t(TAB_LABELS[tk])} {counts[tk]}
                    </button>
                  );
                })}
              </div>
              {tab === "published" && (
                <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-subtle)" }}>
                  {t("טיפ: אפשר גם להצביע, להצמיד, להסתיר או להסיר תוכן ישירות על הלוח (בריחוף מעל כרטיס).")}
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {listItems.length === 0 ? (
                  <div style={{ padding: "28px 10px", textAlign: "center", color: "var(--text-subtle)", fontSize: "var(--text-xs)" }}>
                    {tab === "pending" ? t("אין תוכן שממתין לאישור") : tab === "hidden" ? t("אין תוכן מוסתר") : tab === "rejected" ? t("אין תוכן שנדחה") : t("עוד אין תוכן — הוא יופיע כאן וברגע אמת על הלוח")}
                  </div>
                ) : (
                  listItems.map((s) => (
                    <ControlSubmissionCard
                      key={s.id}
                      submission={s}
                      board={board}
                      focused={room.focused_submission_id === s.id}
                      actions={listActionsFor(s)}
                      thread={
                        tab === "published" ? (
                          <CommentThread
                            submission={s}
                            author={{ kind: "facilitator", profileId: CURRENT_USER_ID }}
                            canWrite
                            blockedWords={board.moderation.blocked_words}
                          />
                        ) : undefined
                      }
                    />
                  ))
                )}
              </div>
            </SectionCard>
          </div>
        </div>
      </aside>

      {/* ---- Live board (fills remaining space) ---- */}
      <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
        <DisplayCanvas room={room} board={board} submissions={submissions} joinUrl={joinUrl} facilitator={facilitator} hideJoinChip={open} />

        {/* Open handle (visible when drawer closed) */}
        {!open && (
          <button
            onClick={() => setOpen(true)}
            className="ngg-drawer-handle"
            style={{ position: "absolute", top: 20, insetInlineStart: 20, zIndex: 70, display: "flex", alignItems: "center", gap: 8, border: "none", background: "var(--accent)", color: "#fff", padding: "10px 16px", borderRadius: "var(--radius-pill)", fontSize: "var(--text-sm)", fontWeight: "var(--weight-bold)", cursor: "pointer", boxShadow: "var(--shadow-lg)" }}
          >
            <LiveDot light /> {t("בקרת מנחה")}
          </button>
        )}
      </div>

      <ConfirmDialog
        open={confirmEnd}
        title={t("לסיים את המפגש?")}
        description={t("המשתתפים לא יוכלו לשלוח תוכן נוסף. כל התוכן שנאסף יישמר בהיסטוריית המפגשים.")}
        confirmLabel={t("סיים מפגש")}
        danger
        onConfirm={() => { db.endRoom(roomId); setConfirmEnd(false); router.push(`/results/${roomId}`); }}
        onCancel={() => setConfirmEnd(false)}
      />
      <ConfirmDialog
        open={confirmClearBoard}
        title={t("לאפס את הלוח?")}
        description={t("כל התוכן שהוצג יימחק מהלוח. המשתתפים המחוברים יישארו ויוכלו להמשיך לשלוח תוכן חדש.")}
        confirmLabel={t("אפס לוח")}
        danger
        onConfirm={() => { db.clearSubmissions(roomId); setConfirmClearBoard(false); toast.show(t("הלוח אופס — התוכן נמחק")); }}
        onCancel={() => setConfirmClearBoard(false)}
      />
      <ConfirmDialog
        open={confirmResetSession}
        title={t("לאפס את המפגש?")}
        description={t("כל התוכן יימחק וכל המשתתפים יוצאו מהמפגש (יצטרכו להצטרף מחדש). החדר יישאר פעיל עם אותו קוד ו-QR — כמו מפגש חדש.")}
        confirmLabel={t("אפס מפגש")}
        danger
        onConfirm={() => { db.resetSession(roomId); setConfirmResetSession(false); toast.show(t("המפגש אופס — התוכן נמחק והמשתתפים הוצאו")); }}
        onCancel={() => setConfirmResetSession(false)}
      />
    </div>
  );
}

function SectionCard({ title, children, grow }: { title: string; children: React.ReactNode; grow?: boolean }) {
  return (
    <section style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", padding: 14, display: "flex", flexDirection: "column", gap: 10, flex: grow ? "1 0 auto" : "none" }}>
      <div style={{ fontSize: "var(--text-2xs)", fontWeight: "var(--weight-bold)", color: "var(--text-subtle)", letterSpacing: ".01em" }}>{title}</div>
      {children}
    </section>
  );
}

function ToggleBtn({ active, onClick, icon, color, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; color: "warning" | "info"; children: React.ReactNode }) {
  const c = color === "warning" ? { border: "var(--warning)", bg: "var(--warning-bg)", fg: "var(--warning)" } : { border: "var(--info)", bg: "var(--info-bg)", fg: "var(--info)" };
  return (
    <button onClick={onClick} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "9px 6px", borderRadius: "var(--radius-md)", border: `1px solid ${active ? c.border : "var(--border-strong)"}`, background: active ? c.bg : "var(--surface)", color: active ? c.fg : "var(--text)", fontSize: "var(--text-xs)", fontWeight: "var(--weight-bold)", cursor: "pointer" }}>
      {icon}
      {children}
    </button>
  );
}

function Alert({ color, icon, children }: { color: "warning" | "info"; icon: React.ReactNode; children: React.ReactNode }) {
  const c = color === "warning" ? { border: "var(--warning)", bg: "var(--warning-bg)", fg: "var(--warning)" } : { border: "var(--info)", bg: "var(--info-bg)", fg: "var(--info)" };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", background: c.bg, border: `1px solid ${c.border}`, borderRadius: "var(--radius-lg)", padding: "10px 12px", fontSize: "var(--text-xs)", color: c.fg, fontWeight: "var(--weight-semibold)" }}>
      {icon}
      <span style={{ flex: 1, minWidth: 120, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>{children}</span>
    </div>
  );
}
