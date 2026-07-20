"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { db, CURRENT_USER_ID } from "@/lib/data";
import { useLiveQuery } from "@/lib/hooks";
import { formatAgo } from "@/lib/utils";
import { THEME_VISUALS } from "@/lib/board-visuals";
import type { NamePolicy, SharingLevel } from "@/lib/types";
import { AppShell } from "@/components/app/AppShell";
import { EditorPreview } from "@/components/app/editor/EditorPreview";
import { RoomActivationDialog } from "@/components/app/RoomActivationDialog";
import { SessionHistoryTable } from "@/components/app/SessionHistoryTable";
import { Button, BoardStatusBadge, Badge, EmptyState, useToast } from "@/components/ui";
import { IconChevron, IconDuplicate, IconEdit, IconMonitor } from "@/components/ui/icons";

const SHARE_LABELS: Record<SharingLevel, string> = {
  private: "פרטי",
  selected: "אנשים נבחרים",
  team: "צוות",
  organization: "כל הארגון",
  link: "קישור ישיר בלבד",
};
const NAME_LABELS: Record<NamePolicy, string> = { required: "שם חובה", optional: "שם אופציונלי", disabled: "ללא שם" };

export default function BoardDetailPage({ params }: { params: Promise<{ boardId: string }> }) {
  const { boardId } = use(params);
  const router = useRouter();
  const toast = useToast();
  const [activateOpen, setActivateOpen] = useState(false);

  const board = useLiveQuery("board-list", () => db.getBoard(boardId));
  const sessions = useLiveQuery({ room: boardId }, () => db.getSessionSummaries(boardId));
  const activeRoom = useLiveQuery("board-list", () => db.getActiveRoomForBoard(boardId));

  if (!board) {
    return (
      <AppShell current="all">
        <div style={{ padding: 40, maxWidth: 720, margin: "0 auto" }}>
          <EmptyState title="הלוח לא נמצא" description="ייתכן שהלוח נמחק או שאין לכם הרשאת גישה אליו." action={<Button variant="primary" onClick={() => router.push("/app/boards")}>חזרה לרשימת הלוחות</Button>} />
        </div>
      </AppShell>
    );
  }

  const owner = db.getProfile(board.created_by);
  const collaborators = board.collaborator_ids.map((id) => db.getProfile(id)).filter(Boolean);
  const ready = board.status === "ready";

  return (
    <AppShell current={board.created_by !== CURRENT_USER_ID ? "shared" : "all"}>
      <div style={{ padding: "22px 30px 48px", maxWidth: 1080, margin: "0 auto" }}>
        <button onClick={() => router.push("/app/boards")} className="ngg-hover" style={{ display: "flex", alignItems: "center", gap: 6, border: "none", background: "transparent", color: "var(--text-muted)", fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)", cursor: "pointer", padding: "7px 10px", borderRadius: "var(--radius-lg)", marginBottom: 14 }}>
          <IconChevron size={15} strokeWidth={2.2} />
          הלוחות שלי
        </button>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(280px, 1fr)", gap: 24, alignItems: "start" }} className="ngg-detail-grid">
          {/* Left: preview + sessions */}
          <div style={{ display: "flex", flexDirection: "column", gap: 22, minWidth: 0 }}>
            <EditorPreview title={board.public_title} subtitle={board.public_subtitle} appearance={board.appearance} participation={board.participation} layout={board.default_layout} />

            <section>
              <h2 style={{ fontSize: "var(--text-md)", fontWeight: "var(--weight-extrabold)", marginBottom: 12 }}>היסטוריית מפגשים</h2>
              <SessionHistoryTable sessions={sessions} />
            </section>
          </div>

          {/* Right: meta + actions */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16, position: "sticky", top: 22 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
                <BoardStatusBadge status={board.status} />
                <Badge color="neutral" variant="outline">{SHARE_LABELS[board.sharing]}</Badge>
              </div>
              <h1 style={{ fontSize: "var(--text-2xl)", fontWeight: "var(--weight-black)", lineHeight: "var(--leading-tight)" }}>{board.internal_name}</h1>
              {board.public_title !== board.internal_name && (
                <p style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", marginTop: 4 }}>{board.public_title}</p>
              )}
            </div>

            {activeRoom ? (
              <div style={{ background: "var(--accent-soft)", border: "1.5px solid var(--magenta-400)", borderRadius: "var(--radius-xl)", padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-bold)", color: "var(--accent-text)" }}>יש חדר פעיל ללוח זה</div>
                <Button variant="primary" block leadingIcon={<IconMonitor size={16} />} onClick={() => router.push(`/app/rooms/${activeRoom.id}/control`)}>
                  חזרה לחדר הבקרה
                </Button>
              </div>
            ) : (
              <Button variant="primary" size="lg" block disabled={!ready} onClick={() => setActivateOpen(true)}>
                {ready ? "הפעל חדר חי" : "השלימו את הלוח כדי להפעיל"}
              </Button>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <Button variant="secondary" block leadingIcon={<IconEdit size={15} />} onClick={() => router.push(`/app/boards/${board.id}/edit`)}>
                עריכה
              </Button>
              <Button
                variant="secondary"
                block
                leadingIcon={<IconDuplicate size={15} />}
                onClick={() => {
                  const dup = db.duplicateBoard(board.id);
                  toast.show("הלוח שוכפל כטיוטה חדשה");
                  router.push(`/app/boards/${dup.id}/edit`);
                }}
              >
                שכפול
              </Button>
            </div>

            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: "var(--text-xs)", fontWeight: "var(--weight-bold)", color: "var(--text-subtle)" }}>סיכום הגדרות</div>
              <SummaryRow label="עיצוב" value={THEME_VISUALS[board.appearance.background_theme].label} />
              <SummaryRow label="תוכן מותר" value={[board.participation.allow_text && "טקסט", board.participation.allow_image && "תמונות"].filter(Boolean).join(" · ") || "—"} />
              <SummaryRow label="שם משתתף" value={NAME_LABELS[board.participation.name_policy]} />
              <SummaryRow label="אישור תוכן" value={board.moderation.mode === "approval" ? "אישור לפני הצגה" : "הצגה מיידית"} />
              <SummaryRow label="פריסת ברירת מחדל" value={{ wall: "קיר כרטיסים", mosaic: "פסיפס", feed: "פיד חי" }[board.default_layout]} />
            </div>

            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: "var(--text-xs)", fontWeight: "var(--weight-bold)", color: "var(--text-subtle)" }}>בעלות ושיתוף</div>
              <SummaryRow label="נוצר על ידי" value={owner?.full_name ?? "—"} />
              {collaborators.length > 0 && <SummaryRow label="שותפים" value={collaborators.map((c) => c!.full_name.split(" ")[0]).join(", ")} />}
              <SummaryRow label="עודכן" value={formatAgo(board.updated_at)} />
              {board.last_activated_at && <SummaryRow label="הופעל לאחרונה" value={formatAgo(board.last_activated_at)} />}
            </div>
          </div>
        </div>
      </div>

      <RoomActivationDialog board={board} open={activateOpen} onClose={() => setActivateOpen(false)} />
    </AppShell>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
      <span style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)" }}>{label}</span>
      <span style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)", textAlign: "end" }}>{value}</span>
    </div>
  );
}
