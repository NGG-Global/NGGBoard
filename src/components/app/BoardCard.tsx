"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Board } from "@/lib/types";
import { db, CURRENT_USER_ID } from "@/lib/data";
import { useLiveQuery } from "@/lib/hooks";
import { formatAgo } from "@/lib/utils";
import { BoardStatusBadge, Badge, ConfirmDialog, LiveDot, RovingMenu, useToast } from "@/components/ui";
import { IconFolder } from "@/components/ui/icons";
import { BoardThumbnail } from "./BoardThumbnail";
import { MoveToFolderDialog } from "./MoveToFolderDialog";
import { BOARD_DND_MIME, useDashDnd } from "./dnd";

export function BoardCard({
  board,
  onActivate,
  selected,
  onToggleSelect,
}: {
  board: Board;
  onActivate: (board: Board) => void;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [moveFolder, setMoveFolder] = useState(false);
  const shared = board.created_by !== CURRENT_USER_ID;
  const owner = db.getProfile(board.created_by);
  const activeRoom = useLiveQuery("board-list", () => db.getActiveRoomForBoard(board.id));
  const lastSession = useLiveQuery("board-list", () => (activeRoom ? null : db.getLastSession(board.id)), [!!activeRoom]);
  const dnd = useDashDnd();
  const dragging = dnd.draggingId === board.id;

  const closeMenu = () => setMenuOpen(false);

  return (
    <div
      className="ngg-card-hover ngg-card-in"
      // Drag the card onto a folder in the sidebar to file it. The ⋯ menu is the
      // pointer-free fallback (touch / keyboard).
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(BOARD_DND_MIME, board.id);
        e.dataTransfer.effectAllowed = "move";
        dnd.start(board.id);
      }}
      onDragEnd={() => dnd.end()}
      style={{
        position: "relative",
        background: "var(--surface)",
        border: selected ? "1.5px solid var(--accent)" : "1px solid var(--border)",
        borderRadius: "var(--radius-xl)",
        boxShadow: selected ? "0 0 0 3px var(--accent-soft)" : "var(--shadow-xs)",
        display: "flex",
        flexDirection: "column",
        cursor: "grab",
        opacity: dragging ? 0.5 : 1,
      }}
    >
      {onToggleSelect && (
        <button
          role="checkbox"
          aria-checked={!!selected}
          aria-label={selected ? "ביטול בחירה" : "בחירת הלוח"}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleSelect(); }}
          draggable={false}
          style={{
            position: "absolute",
            top: 8,
            insetInlineStart: 8,
            zIndex: 5,
            width: 22,
            height: 22,
            borderRadius: "50%",
            border: selected ? "none" : "1.5px solid var(--border-strong)",
            background: selected ? "var(--accent)" : "rgba(255,255,255,.9)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 900,
            boxShadow: "var(--shadow-sm)",
          }}
        >
          {selected ? "✓" : ""}
        </button>
      )}
      <Link href={`/app/boards/${board.id}`} aria-label={`פתח את ${board.internal_name}`} draggable={false}>
        <BoardThumbnail board={board} />
      </Link>
      <div style={{ padding: "11px 12px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
          <Link
            href={`/app/boards/${board.id}`}
            draggable={false}
            style={{
              fontSize: "var(--text-sm)",
              fontWeight: "var(--weight-bold)",
              lineHeight: "var(--leading-snug)",
              color: "var(--text)",
              flex: 1,
              minWidth: 0,
            }}
          >
            {board.internal_name}
          </Link>
          <div style={{ position: "relative", flex: "none" }}>
            <button
              aria-label="פעולות נוספות"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              className="ngg-hover"
              style={{
                border: "none",
                background: "transparent",
                color: "var(--text-subtle)",
                cursor: "pointer",
                padding: "3px 6px",
                borderRadius: "var(--radius-md)",
                fontSize: "var(--text-md)",
                lineHeight: 1,
                fontWeight: "var(--weight-black)",
              }}
            >
              ⋯
            </button>
            {menuOpen && (
              <>
                <div onClick={closeMenu} style={{ position: "fixed", inset: 0, zIndex: 25 }} />
                <RovingMenu
                  onClose={closeMenu}
                  ariaLabel={`פעולות עבור ${board.internal_name}`}
                  style={{
                    position: "absolute",
                    insetInlineEnd: 0,
                    top: 26,
                    zIndex: 30,
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-lg)",
                    boxShadow: "var(--shadow-lg)",
                    padding: 5,
                    display: "flex",
                    flexDirection: "column",
                    minWidth: 156,
                  }}
                >
                  {activeRoom && (
                    <MenuItem accent onClick={() => { closeMenu(); router.push(`/app/rooms/${activeRoom.id}/control`); }}>
                      פתח חדר בקרה
                    </MenuItem>
                  )}
                  {activeRoom && (
                    <MenuItem danger onClick={() => { closeMenu(); setConfirmEnd(true); }}>
                      כבה חדר פעיל
                    </MenuItem>
                  )}
                  <MenuItem onClick={() => router.push(`/app/boards/${board.id}/edit`)}>עריכה</MenuItem>
                  <MenuItem onClick={() => { closeMenu(); setMoveFolder(true); }}>
                    {board.folder ? `תיקייה: ${board.folder}` : "העבר לתיקייה"}
                  </MenuItem>
                  {board.status === "ready" && !activeRoom && (
                    <MenuItem
                      accent
                      onClick={() => {
                        closeMenu();
                        onActivate(board);
                      }}
                    >
                      הפעל חדר
                    </MenuItem>
                  )}
                  <MenuItem
                    onClick={() => {
                      const dup = db.duplicateBoard(board.id);
                      closeMenu();
                      toast.show("הלוח שוכפל כטיוטה חדשה");
                      router.push(`/app/boards/${dup.id}/edit`);
                    }}
                  >
                    שכפול
                  </MenuItem>
                  <MenuItem
                    onClick={() => {
                      const toArchive = board.status !== "archived";
                      const prev = board.status;
                      db.setBoardStatus(board.id, toArchive ? "archived" : "ready");
                      closeMenu();
                      toast.show(
                        toArchive ? "הלוח הועבר לארכיון" : "הלוח שוחזר מהארכיון",
                        () => db.setBoardStatus(board.id, prev),
                      );
                    }}
                  >
                    {board.status === "archived" ? "שחזר מהארכיון" : "העבר לארכיון"}
                  </MenuItem>
                  <div style={{ height: 1, background: "var(--border)", margin: "4px 6px" }} />
                  <MenuItem danger onClick={() => { closeMenu(); setConfirmDelete(true); }}>
                    מחיקה לצמיתות
                  </MenuItem>
                </RovingMenu>
              </>
            )}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {activeRoom ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "var(--accent)", color: "#fff", padding: "2px 9px", borderRadius: "var(--radius-pill)", fontSize: "var(--text-2xs)", fontWeight: "var(--weight-bold)" }}>
              <LiveDot light />
              בשידור חי
            </span>
          ) : (
            <BoardStatusBadge status={board.status} />
          )}
          {shared && owner && (
            <Badge color="neutral" variant="outline">
              שותף · {owner.full_name.split(" ")[0]}
            </Badge>
          )}
          {board.folder && (
            <Link
              href={`/app/boards?view=all&folder=${encodeURIComponent(board.folder)}`}
              draggable={false}
              className="ngg-hover"
              style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--text-subtle)", fontSize: "var(--text-2xs)", fontWeight: "var(--weight-semibold)", padding: "2px 7px", borderRadius: "var(--radius-pill)", border: "1px solid var(--border)" }}
            >
              <IconFolder size={11} />
              {board.folder}
            </Link>
          )}
        </div>

        <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-subtle)" }}>
          {activeRoom
            ? `${activeRoom.participant_count} משתתפים · ${db.listSubmissions(activeRoom.id).length} פריטי תוכן`
            : lastSession
              ? `מפגש אחרון · ${lastSession.participants} משתתפים · ${lastSession.items} פריטים · ${formatAgo(lastSession.endedAt)}`
              : `נערך ${formatAgo(board.updated_at)}`}
        </div>
      </div>

      <ConfirmDialog
        open={confirmEnd}
        title="לכבות את החדר הפעיל?"
        description="המפגש החי ייסגר והמשתתפים לא יוכלו לשלוח תוכן נוסף. התוכן שנאסף יישמר בהיסטוריית המפגשים."
        confirmLabel="כבה מפגש"
        danger
        onConfirm={() => { if (activeRoom) db.endRoom(activeRoom.id); setConfirmEnd(false); toast.show("המפגש הפעיל נסגר"); }}
        onCancel={() => setConfirmEnd(false)}
      />
      <ConfirmDialog
        open={confirmDelete}
        title="למחוק את הלוח לצמיתות?"
        description={`הלוח "${board.internal_name}" וכל היסטוריית המפגשים והתוכן שנאסף יימחקו לצמיתות. לא ניתן לשחזר פעולה זו. אם ברצונכם לשמור את הנתונים, השתמשו ב"העבר לארכיון" במקום.`}
        confirmLabel="מחק לצמיתות"
        danger
        onConfirm={() => { db.deleteBoard(board.id); setConfirmDelete(false); toast.show("הלוח נמחק לצמיתות"); }}
        onCancel={() => setConfirmDelete(false)}
      />
      <MoveToFolderDialog
        open={moveFolder}
        boardIds={[board.id]}
        currentFolder={board.folder}
        boardName={board.internal_name}
        onClose={() => setMoveFolder(false)}
      />
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  accent,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  accent?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className="ngg-hover"
      style={{
        border: "none",
        background: "transparent",
        fontSize: "var(--text-xs)",
        fontWeight: accent ? "var(--weight-bold)" : "var(--weight-semibold)",
        color: danger ? "var(--danger)" : accent ? "var(--accent-text)" : "var(--text)",
        padding: "8px 10px",
        borderRadius: "var(--radius-md)",
        cursor: "pointer",
        textAlign: "start",
      }}
    >
      {children}
    </button>
  );
}
