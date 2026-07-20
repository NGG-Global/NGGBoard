"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { use, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { db } from "@/lib/data";
import { useLiveQuery, useMounted } from "@/lib/hooks";
import { minutesBetween } from "@/lib/utils";
import { themeVisual } from "@/lib/board-visuals";
import { DisplaySubmission } from "@/components/display/DisplaySubmission";
import { Button, Spinner, useToast } from "@/components/ui";
import { IconChevron, IconDownload, IconDuplicate } from "@/components/ui/icons";

export default function ResultsPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = use(params);
  const router = useRouter();
  const toast = useToast();
  const mounted = useMounted();
  const snapshotRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const room = useLiveQuery({ room: roomId }, () => db.getRoom(roomId));
  const board = useLiveQuery({ room: roomId }, () => db.getBoardForRoom(roomId));
  const submissions = useLiveQuery({ room: roomId }, () =>
    db.listSubmissions(roomId).filter((s) => s.status === "published"),
  );

  if (!mounted) return null;
  if (!room || !board) {
    return (
      <div dir="rtl" style={{ minHeight: "100vh", display: "grid", placeItems: "center", fontFamily: "var(--font-sans)" }}>
        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: "var(--text-xl)", fontWeight: "var(--weight-black)" }}>התוצאות לא נמצאו</div>
          <Button variant="primary" onClick={() => router.push("/app/boards")}>חזרה לרשימת הלוחות</Button>
        </div>
      </div>
    );
  }

  const duration = minutesBetween(room.started_at, room.ended_at ?? new Date().toISOString());
  const v = themeVisual(board.appearance);

  async function exportPng() {
    if (!snapshotRef.current) return;
    setExporting(true);
    try {
      const dataUrl = await toPng(snapshotRef.current, { pixelRatio: 2, cacheBust: true, backgroundColor: "#ffffff" });
      const link = document.createElement("a");
      link.download = `ngg-${board!.internal_name}-${room!.session_label ?? "session"}.png`.replace(/\s+/g, "-");
      link.href = dataUrl;
      link.click();
      toast.show("התמונה יוצאה בהצלחה");
    } catch {
      toast.show("ייצוא התמונה נכשל — נסו שוב");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div dir="rtl" style={{ minHeight: "100vh", background: "var(--surface-sunken)", fontFamily: "var(--font-sans)", color: "var(--text)" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 24px", background: "var(--surface)", borderBottom: "1px solid var(--border)", position: "sticky", top: 0, zIndex: 10 }}>
        <Image src="/brand/ngg-logo.png" alt="NGG" width={64} height={22} style={{ height: 22, width: "auto" }} />
        <div style={{ width: 1, height: 22, background: "var(--border)" }} />
        <button onClick={() => router.push(`/app/boards/${board.id}`)} className="ngg-hover" style={{ display: "flex", alignItems: "center", gap: 6, border: "none", background: "transparent", color: "var(--text-muted)", fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)", cursor: "pointer", padding: "7px 10px", borderRadius: "var(--radius-lg)" }}>
          <IconChevron size={15} strokeWidth={2.2} />
          חזרה ללוח
        </button>
        <div style={{ flex: 1 }} />
        <Button variant="secondary" leadingIcon={<IconDuplicate size={15} />} onClick={() => { db.activateRoom(board.id, { mode: "continue", sessionLabel: `${room.session_label ?? "מפגש"} — המשך` }); toast.show("מפגש חדש נפתח עם התוכן שנאסף"); router.push(`/app/boards/${board.id}`); }}>
          שכפל למפגש חדש
        </Button>
        <Button variant="primary" leadingIcon={exporting ? <Spinner size={15} color="#fff" /> : <IconDownload size={15} />} onClick={exportPng} disabled={exporting}>
          ייצוא כתמונה
        </Button>
      </header>

      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "26px 24px 48px" }}>
        {/* Summary stats */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 22 }}>
          <StatCard value={String(room.participant_count)} label="משתתפים" />
          <StatCard value={String(submissions.length)} label="פריטי תוכן שהוצגו" />
          <StatCard value={duration != null ? `${duration}` : "—"} label="דקות" />
        </div>

        {/* Exportable snapshot */}
        <div ref={snapshotRef} style={{ background: v.background, borderRadius: "var(--radius-2xl)", padding: 28, border: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 20 }}>
            {board.appearance.client_logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={board.appearance.client_logo_url} alt="לוגו לקוח" style={{ height: 40, background: "rgba(255,255,255,.92)", borderRadius: "var(--radius-md)", padding: 5 }} />
            )}
            <div style={{ flex: 1 }}>
              <h1 style={{ fontSize: "var(--text-2xl)", fontWeight: "var(--weight-black)", color: v.dark ? "#fff" : "var(--neutral-950)" }}>{board.public_title}</h1>
              <p style={{ fontSize: "var(--text-sm)", color: v.dark ? "rgba(255,255,255,.75)" : "var(--neutral-700)", marginTop: 4 }}>
                {room.session_label ? `${room.session_label} · ` : ""}
                {room.started_at ? new Date(room.started_at).toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" }) : ""}
              </p>
            </div>
            {board.appearance.show_org_logo && (
              <div style={{ background: "rgba(255,255,255,.9)", borderRadius: "var(--radius-md)", padding: "4px 8px" }}>
                <Image src="/brand/ngg-logo.png" alt="NGG" width={54} height={16} style={{ height: 16, width: "auto" }} />
              </div>
            )}
          </div>

          {submissions.length === 0 ? (
            <div style={{ padding: "48px 0", textAlign: "center", color: v.dark ? "rgba(255,255,255,.7)" : "var(--neutral-700)", fontSize: "var(--text-md)" }}>
              לא הוצג תוכן במפגש זה
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14, alignItems: "start" }}>
              {submissions.map((s) => (
                <DisplaySubmission key={s.id} submission={s} board={board} scale={0.62} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ flex: 1, minWidth: 140, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", padding: "18px 20px", display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontSize: "var(--text-3xl)", fontWeight: "var(--weight-black)" }}>{value}</div>
      <div style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)" }}>{label}</div>
    </div>
  );
}
