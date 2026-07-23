"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type CSSProperties, Suspense, useEffect, useMemo, useState } from "react";
import type { Board } from "@/lib/types";
import { db, CURRENT_USER_ID } from "@/lib/data";
import { useLiveQuery } from "@/lib/hooks";
import { formatAgo } from "@/lib/utils";
import { AppShell, type DashView } from "@/components/app/AppShell";
import { BoardCard } from "@/components/app/BoardCard";
import { BoardThumbnail } from "@/components/app/BoardThumbnail";
import { MoveToFolderDialog } from "@/components/app/MoveToFolderDialog";
import { RoomActivationDialog } from "@/components/app/RoomActivationDialog";
import { Button, ConfirmDialog, EmptyState, Input, LiveDot, Modal, RovingMenu, useToast } from "@/components/ui";
import { IconFolder, IconGrid, IconMonitor, IconSearch, IconTemplate } from "@/components/ui/icons";

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
  const folder = params.get("folder");
  const [query, setQuery] = useState("");
  const [activateBoard, setActivateBoard] = useState<Board | null>(null);
  const [endRoomId, setEndRoomId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkMove, setBulkMove] = useState(false);
  const toggleSelect = (id: string) =>
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const clearSelection = () => setSelected(new Set());
  // Reset the selection when the view / folder / search changes.
  useEffect(() => { setSelected(new Set()); }, [view, folder, query]);

  const boards = useLiveQuery("board-list", () => db.listBoards());
  const activeRooms = useLiveQuery("board-list", () => db.listActiveRooms());
  const folders = useLiveQuery("board-list", () => db.listFolders());

  const q = query.trim();
  const pool = useMemo(() => {
    let list = boards;
    if (view === "all") list = list.filter((b) => b.status !== "archived");
    else if (view === "shared") list = list.filter((b) => b.created_by !== CURRENT_USER_ID);
    else if (view === "archive") list = list.filter((b) => b.status === "archived");
    if (view === "all" && folder) list = list.filter((b) => (b.folder ?? null) === folder);
    if (q) list = list.filter((b) => b.internal_name.includes(q) || b.public_title.includes(q));
    return list;
  }, [boards, view, folder, q]);

  // Grouped view: the default "all" dashboard (no folder filter, no search) is
  // organised into folder sections, with unfiled boards last.
  const grouped = view === "all" && !folder && !q;
  const groups = useMemo(() => {
    if (!grouped) return [];
    const nonArchived = boards.filter((b) => b.status !== "archived");
    const named = folders
      .map((f) => ({ name: f.name, boards: nonArchived.filter((b) => b.folder === f.name) }))
      .filter((g) => g.boards.length > 0);
    const unfiled = nonArchived.filter((b) => !b.folder?.trim());
    return unfiled.length > 0 ? [...named, { name: null as string | null, boards: unfiled }] : named;
  }, [grouped, boards, folders]);

  const recent = useMemo(
    () => boards.filter((b) => b.status !== "archived").slice(0, 3),
    [boards],
  );

  const showLive = ((view === "all" && !folder) || view === "active") && !q && activeRooms.length > 0;
  const showRecent = view === "all" && !folder && !q && recent.length > 0;
  const showGrid = view !== "templates" && view !== "active";

  return (
    <AppShell current={view} activeFolder={folder}>
      <div style={{ padding: "26px 30px 40px", maxWidth: 1240, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 22, flexWrap: "wrap" }}>
          <h1 style={{ margin: 0, fontSize: "var(--text-2xl)", fontWeight: "var(--weight-black)", display: "flex", alignItems: "center", gap: 8 }}>
            {view === "all" && folder ? (
              <>
                <IconFolder size={22} style={{ color: "var(--accent-text)" }} />
                {folder}
              </>
            ) : (
              PAGE_TITLES[view]
            )}
          </h1>
          {view === "all" && folder && <FolderMenu folder={folder} onDone={() => router.push("/app/boards?view=all")} />}
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

        {/* Grid — grouped by folder in the default view, flat when filtered/searching. */}
        {showGrid && grouped && groups.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
            {groups.map((g) => (
              <section key={g.name ?? "__unfiled"}>
                <SectionLabel>
                  {g.name ? (
                    <Link href={`/app/boards?view=all&folder=${encodeURIComponent(g.name)}`} style={{ color: "inherit", display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <IconFolder size={13} /> {g.name} · {g.boards.length}
                    </Link>
                  ) : (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>ללא תיקייה · {g.boards.length}</span>
                  )}
                </SectionLabel>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: 14 }}>
                  {g.boards.map((board) => (
                    <BoardCard key={board.id} board={board} onActivate={setActivateBoard} selected={selected.has(board.id)} onToggleSelect={() => toggleSelect(board.id)} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {showGrid && !(grouped && groups.length > 0) && (
          <section>
            <SectionLabel>
              {view === "all" ? (folder ? `לוחות בתיקייה` : q ? "תוצאות חיפוש" : "כל הלוחות") : PAGE_TITLES[view]}
            </SectionLabel>
            {pool.length === 0 ? (
              <EmptyState
                icon={<IconGrid size={36} strokeWidth={1.5} />}
                title={
                  q
                    ? "לא נמצאו לוחות שמתאימים לחיפוש"
                    : folder
                      ? "אין לוחות בתיקייה הזו"
                      : view === "archive"
                        ? "הארכיון ריק"
                        : view === "shared"
                          ? "עדיין לא שותפו איתכם לוחות"
                          : "אין כאן לוחות עדיין"
                }
                description={
                  folder
                    ? 'העבירו לוחות לתיקייה דרך תפריט "⋯" שעל הלוח, או צרו לוח חדש.'
                    : view === "all" && !q
                      ? "צרו את הלוח הראשון שלכם — הגדירו כותרת, עיצוב וכללי השתתפות, ואז הפעילו חדר חי בלחיצה."
                      : undefined
                }
                action={
                  (folder || (view === "all" && !q)) ? (
                    <Button variant="primary" onClick={() => router.push("/app/boards/new")}>
                      צרו לוח חדש
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: 14 }}>
                {pool.map((board) => (
                  <BoardCard key={board.id} board={board} onActivate={setActivateBoard} selected={selected.has(board.id)} onToggleSelect={() => toggleSelect(board.id)} />
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div
          dir="rtl"
          style={{
            position: "fixed",
            insetInlineStart: 0,
            insetInlineEnd: 0,
            bottom: 20,
            display: "flex",
            justifyContent: "center",
            zIndex: 70,
            pointerEvents: "none",
          }}
        >
          <div
            className="ngg-fade-up"
            style={{
              pointerEvents: "auto",
              display: "flex",
              alignItems: "center",
              gap: 12,
              background: "var(--ink-950, #101014)",
              color: "#fff",
              padding: "10px 12px 10px 18px",
              borderRadius: "var(--radius-pill)",
              boxShadow: "var(--shadow-xl)",
            }}
          >
            <span style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-bold)" }}>{selected.size} נבחרו</span>
            <span style={{ width: 1, height: 20, background: "rgba(255,255,255,.2)" }} />
            <button onClick={() => setBulkMove(true)} className="ngg-hover" style={bulkBtn()}>העברה לתיקייה</button>
            <button
              onClick={() => {
                const ids = [...selected];
                ids.forEach((id) => db.setBoardStatus(id, "archived"));
                clearSelection();
                toast.show(`${ids.length} לוחות הועברו לארכיון`, () => ids.forEach((id) => db.setBoardStatus(id, "ready")));
              }}
              className="ngg-hover"
              style={bulkBtn()}
            >
              העברה לארכיון
            </button>
            <button onClick={clearSelection} aria-label="ניקוי הבחירה" className="ngg-hover" style={{ ...bulkBtn(), color: "var(--neutral-400,#a1a1aa)" }}>נקה</button>
          </div>
        </div>
      )}

      <MoveToFolderDialog open={bulkMove} boardIds={[...selected]} onClose={() => setBulkMove(false)} onDone={clearSelection} />

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

/** Rename / delete controls for the currently-open folder. */
function FolderMenu({ folder, onDone }: { folder: string; onDone: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [name, setName] = useState(folder);

  function doRename() {
    const clean = name.trim();
    if (clean && clean !== folder) {
      db.renameFolder(folder, clean);
      setRenaming(false);
      router.push(`/app/boards?view=all&folder=${encodeURIComponent(clean)}`);
      toast.show("שם התיקייה עודכן");
    } else {
      setRenaming(false);
    }
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        aria-label="פעולות תיקייה"
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        className="ngg-hover"
        style={{ border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-muted)", cursor: "pointer", padding: "5px 9px", borderRadius: "var(--radius-md)", fontSize: "var(--text-md)", fontWeight: "var(--weight-black)", lineHeight: 1 }}
      >
        ⋯
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 25 }} />
          <RovingMenu onClose={() => setOpen(false)} ariaLabel={`פעולות עבור התיקייה ${folder}`} style={{ position: "absolute", insetInlineStart: 0, top: 34, zIndex: 30, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-lg)", padding: 5, minWidth: 150, display: "flex", flexDirection: "column" }}>
            <button role="menuitem" onClick={() => { setOpen(false); setName(folder); setRenaming(true); }} className="ngg-hover" style={menuBtn(false)}>שינוי שם</button>
            <button role="menuitem" onClick={() => { setOpen(false); setConfirmDelete(true); }} className="ngg-hover" style={menuBtn(true)}>מחיקת תיקייה</button>
          </RovingMenu>
        </>
      )}

      <Modal open={renaming} onClose={() => setRenaming(false)} width={360}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <h2 style={{ margin: 0, fontSize: "var(--text-lg)", fontWeight: "var(--weight-extrabold)" }}>שינוי שם התיקייה</h2>
          <Input value={name} onChange={(e) => setName(e.target.value)} aria-label="שם התיקייה" autoFocus onKeyDown={(e) => e.key === "Enter" && doRename()} />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={() => setRenaming(false)}>ביטול</Button>
            <Button variant="primary" disabled={!name.trim()} onClick={doRename}>שמירה</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        title={`למחוק את התיקייה "${folder}"?`}
        description="התיקייה תימחק. הלוחות שבתוכה יישארו — הם פשוט לא ישויכו לתיקייה. אפשר לשייך אותם מחדש בכל עת."
        confirmLabel="מחק תיקייה"
        danger
        onConfirm={() => { db.deleteFolder(folder); setConfirmDelete(false); onDone(); toast.show("התיקייה נמחקה"); }}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

function bulkBtn(): CSSProperties {
  return { border: "none", background: "transparent", color: "#fff", fontSize: "var(--text-sm)", fontWeight: "var(--weight-bold)", padding: "6px 10px", borderRadius: "var(--radius-md)", cursor: "pointer", fontFamily: "inherit" };
}

function menuBtn(danger: boolean): CSSProperties {
  return { border: "none", background: "transparent", fontSize: "var(--text-xs)", fontWeight: "var(--weight-semibold)", color: danger ? "var(--danger)" : "var(--text)", padding: "8px 10px", borderRadius: "var(--radius-md)", cursor: "pointer", textAlign: "start" };
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: "var(--text-xs)", fontWeight: "var(--weight-bold)", color: "var(--text-subtle)", marginBottom: 10 }}>
      {children}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div style={{ padding: "26px 30px 40px", maxWidth: 1240, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 22 }}>
        <div className="ngg-skeleton" style={{ width: 160, height: 30 }} />
        <div style={{ flex: 1 }} />
        <div className="ngg-skeleton" style={{ width: 230, height: 38 }} />
        <div className="ngg-skeleton" style={{ width: 110, height: 38 }} />
      </div>
      <div className="ngg-skeleton" style={{ width: 90, height: 14, marginBottom: 12 }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: 14 }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", overflow: "hidden", background: "var(--surface)" }}>
            <div className="ngg-skeleton" style={{ height: 132, borderRadius: 0 }} />
            <div style={{ padding: "11px 12px 14px", display: "flex", flexDirection: "column", gap: 9 }}>
              <div className="ngg-skeleton" style={{ width: "75%", height: 13 }} />
              <div className="ngg-skeleton" style={{ width: 64, height: 18, borderRadius: "var(--radius-pill)" }} />
              <div className="ngg-skeleton" style={{ width: "55%", height: 10 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function BoardsDashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardInner />
    </Suspense>
  );
}
