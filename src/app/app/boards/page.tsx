"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import type { Board } from "@/lib/types";
import { db, CURRENT_USER_ID } from "@/lib/data";
import { useLiveQuery } from "@/lib/hooks";
import { formatAgo } from "@/lib/utils";
import { AppShell, type DashView } from "@/components/app/AppShell";
import { BoardCard } from "@/components/app/BoardCard";
import { BoardThumbnail } from "@/components/app/BoardThumbnail";
import { RoomActivationDialog } from "@/components/app/RoomActivationDialog";
import { Button, ConfirmDialog, EmptyState, LiveDot, useToast } from "@/components/ui";
import { IconGrid, IconMonitor, IconSearch, IconTemplate } from "@/components/ui/icons";

const PAGE_TITLES: Record<DashView, string> = {
  all: "הלוחות שלי",
  shared: "שותפו איתי",
  active: "פעילים עכשיו",
  templates: "תבניות",
  archive: "ארכיון",
  admin: "הגדרות ארגון",
};

function DashboardInner() {
  const router = useRouter();
  const toast = useToast();
  const params = useSearchParams();
  const view = (params.get("view") as DashView) || "all";
  const [query, setQuery] = useState("");
  const [activateBoard, setActivateBoard] = useState<Board | null>(null);
  const [endRoomId, setEndRoomId] = useState<string | null>(null);

  const boards = useLiveQuery("board-list", () => db.listBoards());
  const activeRooms = useLiveQuery("board-list", () => db.listActiveRooms());

  const q = query.trim();
  const pool = useMemo(() => {
    let list = boards;
    if (view === "all") list = list.filter((b) => b.status !== "archived");
    else if (view === "shared") list = list.filter((b) => b.created_by !== CURRENT_USER_ID);
    else if (view === "archive") list = list.filter((b) => b.status === "archived");
    if (q) list = list.filter((b) => b.internal_name.includes(q) || b.public_title.includes(q));
    return list;
  }, [boards, view, q]);

  const recent = useMemo(
    () => boards.filter((b) => b.status !== "archived").slice(0, 3),
    [boards],
  );

  const showLive = (view === "all" || view === "active") && !q && activeRooms.length > 0;
  const showRecent = view === "all" && !q && recent.length > 0;
  const showGrid = view !== "templates" && view !== "active";

  return (
    <AppShell current={view}>
      <div style={{ padding: "26px 30px 40px", maxWidth: 1240, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 22, flexWrap: "wrap" }}>
          <h1 style={{ margin: 0, fontSize: "var(--text-2xl)", fontWeight: "var(--weight-black)" }}>
            {PAGE_TITLES[view]}
          </h1>
          <div style={{ flex: 1 }} />
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-lg)",
              padding: "8px 12px",
              width: 230,
              maxWidth: "40vw",
            }}
          >
            <IconSearch size={14} style={{ color: "var(--text-subtle)" }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="חיפוש לוחות"
              aria-label="חיפוש לוחות"
              style={{ border: "none", outline: "none", background: "transparent", fontSize: "var(--text-sm)", width: "100%", color: "var(--text)" }}
            />
          </label>
          <Button variant="primary" leadingIcon={<span style={{ fontSize: 16, fontWeight: 800 }}>+</span>} onClick={() => router.push("/app/boards/new")}>
            לוח חדש
          </Button>
        </div>

        {/* Templates gallery placeholder */}
        {view === "templates" && (
          <EmptyState
            icon={<IconTemplate size={36} strokeWidth={1.5} />}
            title="גלריית התבניות בדרך"
            description="תבניות מוכנות — סיכום סדנה, רטרוספקטיבה, קיר רעיונות, שאלות ותשובות ועוד — יגיעו בגרסה הבאה. עד אז אפשר ליצור לוח חדש ולשכפל לוחות קיימים."
            action={
              <Button variant="secondary" onClick={() => router.push("/app/boards/new")}>
                צרו לוח חדש
              </Button>
            }
          />
        )}

        {/* Active-now banner */}
        {showLive && (
          <section style={{ marginBottom: 26 }}>
            <SectionLabel>פעיל עכשיו</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {activeRooms.map((room) => {
                const board = db.getBoard(room.board_id);
                if (!board) return null;
                const subs = db.listSubmissions(room.id).length;
                return (
                  <div
                    key={room.id}
                    style={{
                      background: "var(--surface)",
                      border: "1.5px solid var(--magenta-400)",
                      borderRadius: "var(--radius-2xl)",
                      padding: "16px 18px",
                      display: "flex",
                      alignItems: "center",
                      gap: 18,
                      boxShadow: "0 2px 10px rgba(236,42,140,.08)",
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ width: 120, flex: "none" }}>
                      <BoardThumbnail board={board} height={72} radius="9px" />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0, flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <span style={{ fontSize: "var(--text-md)", fontWeight: "var(--weight-extrabold)" }}>
                          {board.public_title}
                        </span>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            background: "var(--accent)",
                            color: "#fff",
                            padding: "3px 11px",
                            borderRadius: "var(--radius-pill)",
                            fontSize: "var(--text-2xs)",
                            fontWeight: "var(--weight-bold)",
                          }}
                        >
                          <LiveDot light />
                          בשידור חי
                        </span>
                      </div>
                      <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                        {room.participant_count} משתתפים · {subs} פריטי תוכן
                        {room.session_label ? ` · ${room.session_label}` : ""} · התחיל {formatAgo(room.started_at ?? room.created_at)}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 10 }}>
                      <Button variant="primary" leadingIcon={<IconMonitor size={14} />} onClick={() => router.push(`/app/rooms/${room.id}/control`)}>
                        פתח חדר בקרה
                      </Button>
                      <Link href={`/display/${room.public_id}`} target="_blank">
                        <Button variant="outline">פתח תצוגה</Button>
                      </Link>
                      <Button variant="ghost" onClick={() => setEndRoomId(room.id)}>כבה</Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {view === "active" && activeRooms.length === 0 && (
          <EmptyState
            icon={<LiveDot />}
            title="אין חדרים פעילים כרגע"
            description="כשתפעילו לוח, החדר החי יופיע כאן עם מספר המשתתפים והתוכן שנאסף."
          />
        )}

        {/* Recently used */}
        {showRecent && (
          <section style={{ marginBottom: 26 }}>
            <SectionLabel>בשימוש לאחרונה</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 12 }}>
              {recent.map((board) => (
                <Link
                  key={board.id}
                  href={`/app/boards/${board.id}`}
                  className="ngg-card-hover"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-xl)",
                    padding: 10,
                    boxShadow: "var(--shadow-xs)",
                    color: "var(--text)",
                  }}
                >
                  <div style={{ width: 86, flex: "none" }}>
                    <BoardThumbnail board={board} height={58} radius="7px" />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                    <span
                      style={{
                        fontSize: "var(--text-sm)",
                        fontWeight: "var(--weight-bold)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {board.internal_name}
                    </span>
                    <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-subtle)" }}>נערך {formatAgo(board.updated_at)}</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Grid */}
        {showGrid && (
          <section>
            <SectionLabel>
              {view === "all" ? (q ? "תוצאות חיפוש" : "כל הלוחות") : PAGE_TITLES[view]}
            </SectionLabel>
            {pool.length === 0 ? (
              <EmptyState
                icon={<IconGrid size={36} strokeWidth={1.5} />}
                title={
                  q
                    ? "לא נמצאו לוחות שמתאימים לחיפוש"
                    : view === "archive"
                      ? "הארכיון ריק"
                      : view === "shared"
                        ? "עדיין לא שותפו איתכם לוחות"
                        : "אין כאן לוחות עדיין"
                }
                description={
                  view === "all" && !q
                    ? "צרו את הלוח הראשון שלכם — הגדירו כותרת, עיצוב וכללי השתתפות, ואז הפעילו חדר חי בלחיצה."
                    : undefined
                }
                action={
                  view === "all" && !q ? (
                    <Button variant="primary" onClick={() => router.push("/app/boards/new")}>
                      צרו לוח חדש
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: 14 }}>
                {pool.map((board) => (
                  <BoardCard key={board.id} board={board} onActivate={setActivateBoard} />
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      <RoomActivationDialog board={activateBoard} open={!!activateBoard} onClose={() => setActivateBoard(null)} />
      <ConfirmDialog
        open={!!endRoomId}
        title="לכבות את החדר הפעיל?"
        description="המפגש החי ייסגר והמשתתפים לא יוכלו לשלוח תוכן נוסף. התוכן שנאסף יישמר בהיסטוריית המפגשים."
        confirmLabel="כבה מפגש"
        danger
        onConfirm={() => { if (endRoomId) db.endRoom(endRoomId); setEndRoomId(null); toast.show("המפגש הפעיל נסגר"); }}
        onCancel={() => setEndRoomId(null)}
      />
    </AppShell>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: "var(--text-xs)", fontWeight: "var(--weight-bold)", color: "var(--text-subtle)", marginBottom: 10 }}>
      {children}
    </div>
  );
}

export default function BoardsDashboardPage() {
  return (
    <Suspense fallback={null}>
      <DashboardInner />
    </Suspense>
  );
}
