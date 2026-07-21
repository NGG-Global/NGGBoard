"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Board } from "@/lib/types";
import { db, CURRENT_USER_ID } from "@/lib/data";
import { useLiveQuery } from "@/lib/hooks";
import { formatAgo } from "@/lib/utils";
import { BoardStatusBadge, Badge, ConfirmDialog, useToast } from "@/components/ui";
import { BoardThumbnail } from "./BoardThumbnail";

export function BoardCard({ board, onActivate }: { board: Board; onActivate: (board: Board) => void }) {
  const router = useRouter();
  const toast = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const shared = board.created_by !== CURRENT_USER_ID;
  const owner = db.getProfile(board.created_by);
  const activeRoom = useLiveQuery("board-list", () => db.getActiveRoomForBoard(board.id));

  const closeMenu = () => setMenuOpen(false);

  return (
    <div
      className="ngg-card-hover"
      style={{
        position: "relative",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-xl)",
        boxShadow: "var(--shadow-xs)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Link href={`/app/boards/${board.id}`} aria-label={`פתח את ${board.internal_name}`}>
        <BoardThumbnail board={board} />
      </Link>
      <div style={{ padding: "11px 12px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
          <Link
            href={`/app/boards/${board.id}`}
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
                <div
                  role="menu"
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
                </div>
              </>
            )}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <BoardStatusBadge status={board.status} />
          {shared && owner && (
            <Badge color="neutral" variant="outline">
              שותף · {owner.full_name.split(" ")[0]}
            </Badge>
          )}
        </div>

        <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-subtle)" }}>
          נערך {formatAgo(board.updated_at)}
          {board.last_activated_at && ` · הופעל ${formatAgo(board.last_activated_at)}`}
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
