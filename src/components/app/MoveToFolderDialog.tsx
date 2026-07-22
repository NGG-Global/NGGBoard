"use client";

import { useState } from "react";
import { db } from "@/lib/data";
import { useLiveQuery } from "@/lib/hooks";
import { Button, Input, Modal, useToast } from "@/components/ui";
import { IconFolder } from "@/components/ui/icons";

/**
 * Pick or create a folder for a board. Lists the org's folders, an "unfiled"
 * option, and an inline "new folder" field. Assigning is a single db call.
 */
export function MoveToFolderDialog({
  open,
  boardId,
  currentFolder,
  boardName,
  onClose,
}: {
  open: boolean;
  boardId: string;
  currentFolder: string | null;
  boardName: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const folders = useLiveQuery("board-list", () => db.listFolders());
  const [newName, setNewName] = useState("");

  function assign(folder: string | null) {
    db.setBoardFolder(boardId, folder);
    onClose();
    setNewName("");
    toast.show(folder ? `"${boardName}" הועבר לתיקייה "${folder}"` : `"${boardName}" הוסר מהתיקייה`);
  }

  function createAndAssign() {
    const clean = newName.trim();
    if (!clean) return;
    db.createFolder(clean); // idempotent if it already exists
    assign(clean);
  }

  return (
    <Modal open={open} onClose={onClose} labelledBy="move-folder-title" width={380}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <h2 id="move-folder-title" style={{ margin: 0, fontSize: "var(--text-lg)", fontWeight: "var(--weight-extrabold)" }}>
          העברה לתיקייה
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 260, overflowY: "auto" }}>
          <FolderRow label="ללא תיקייה" active={!currentFolder} onClick={() => assign(null)} muted />
          {folders.map((f) => (
            <FolderRow
              key={f.name}
              label={f.name}
              count={f.count}
              active={currentFolder === f.name}
              onClick={() => assign(f.name)}
            />
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", borderTop: "1px solid var(--border)", paddingTop: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="תיקייה חדשה…"
              aria-label="שם תיקייה חדשה"
              onKeyDown={(e) => e.key === "Enter" && createAndAssign()}
            />
          </div>
          <Button variant="secondary" disabled={!newName.trim()} onClick={createAndAssign}>
            צור והעבר
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function FolderRow({
  label,
  count,
  active,
  muted,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  muted?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="ngg-hover"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        border: "none",
        background: active ? "var(--accent-soft)" : "transparent",
        color: active ? "var(--accent-text)" : muted ? "var(--text-muted)" : "var(--text)",
        padding: "9px 10px",
        borderRadius: "var(--radius-md)",
        cursor: "pointer",
        textAlign: "start",
        fontSize: "var(--text-sm)",
        fontWeight: active ? "var(--weight-bold)" : "var(--weight-semibold)",
      }}
    >
      <IconFolder size={15} />
      <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      {count !== undefined && count > 0 && (
        <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-subtle)" }}>{count}</span>
      )}
      {active && <span aria-hidden="true">✓</span>}
    </button>
  );
}
