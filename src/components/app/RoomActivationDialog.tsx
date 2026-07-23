"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Board } from "@/lib/types";
import { db } from "@/lib/data";
import { Button, Input, Modal, Radio } from "@/components/ui";
import { useI18n } from "@/lib/i18n/react";

export function RoomActivationDialog({
  board,
  open,
  onClose,
}: {
  board: Board | null;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const [label, setLabel] = useState("");
  const [mode, setMode] = useState<"fresh" | "continue">("fresh");

  if (!board) return null;

  const hasPrior = db.listRoomsForBoard(board.id).some((r) => r.status === "ended");

  function activate() {
    if (!board) return;
    const room = db.activateRoom(board.id, { sessionLabel: label, mode });
    onClose();
    setLabel("");
    setMode("fresh");
    router.push(`/app/rooms/${room.id}/control`);
  }

  return (
    <Modal open={open} onClose={onClose} labelledBy="activate-title" width={420}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <h2 id="activate-title" style={{ fontSize: "var(--text-lg)", fontWeight: "var(--weight-extrabold)" }}>
          {t("הפעלת חדר חי")}
        </h2>
        <p style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>{board.public_title}</p>
      </div>

      <Input
        label={t("שם המפגש (אופציונלי)")}
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder={t("למשל: קבוצת בוקר")}
      />

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <Radio name="actmode" label={t("התחל מפגש חדש וריק")} checked={mode === "fresh"} onChange={() => setMode("fresh")} />
        {hasPrior && (
          <Radio
            name="actmode"
            label={t("המשך את המפגש הקודם עם התוכן שנאסף")}
            checked={mode === "continue"}
            onChange={() => setMode("continue")}
          />
        )}
      </div>

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
        <Button variant="ghost" onClick={onClose}>
          {t("ביטול")}
        </Button>
        <Button variant="primary" onClick={activate}>
          {t("הפעל חדר")}
        </Button>
      </div>
    </Modal>
  );
}
