"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Board, RoomMode } from "@/lib/types";
import { db } from "@/lib/data";
import { deadlineFromDateInput } from "@/lib/rooms";
import { Button, Input, Modal, Radio, Switch } from "@/components/ui";
import { useI18n } from "@/lib/i18n/react";

/**
 * The facilitator's one real decision when putting a board to work: is this a
 * session happening now, or a collection window people contribute to over time?
 * Everything downstream — whether inactivity suspends the room, whether a
 * deadline applies, where the facilitator lands next — follows from it, so the
 * two options are stated in plain terms rather than as a settings toggle.
 */
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
  const [mode, setMode] = useState<RoomMode>("live");
  const [label, setLabel] = useState("");
  const [content, setContent] = useState<"fresh" | "continue">("fresh");
  const [closesOn, setClosesOn] = useState("");
  // An unattended board has nobody watching content arrive, so approval is the
  // safe default — see the note under the switch.
  const [requireApproval, setRequireApproval] = useState(true);

  if (!board) return null;

  const hasPrior = db.listRoomsForBoard(board.id).some((r) => r.status === "ended");
  const isOpen = mode === "open";
  const today = new Date();
  const minDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  function reset() {
    setLabel("");
    setContent("fresh");
    setClosesOn("");
    setMode("live");
    setRequireApproval(true);
  }

  function activate() {
    if (!board) return;
    // An open board's moderation setting is what the server enforces, so the
    // choice made here has to be written to the board — not just to the room.
    if (isOpen && requireApproval && board.moderation.mode !== "approval") {
      db.updateBoard(board.id, { moderation: { ...board.moderation, mode: "approval" } });
    }
    const room = db.activateRoom(board.id, {
      sessionLabel: label,
      mode,
      content: isOpen ? "fresh" : content,
      closesAt: isOpen ? deadlineFromDateInput(closesOn) : null,
    });
    onClose();
    reset();
    // A live session goes straight to the projector-side control room. An open
    // collection has nothing to project yet — the facilitator needs the link,
    // which lives on the board page.
    router.push(isOpen ? `/app/boards/${board.id}` : `/app/rooms/${room.id}/control`);
  }

  return (
    <Modal open={open} onClose={onClose} labelledBy="activate-title" width={470}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <h2 id="activate-title" style={{ fontSize: "var(--text-lg)", fontWeight: "var(--weight-extrabold)" }}>
          {t("איך תרצו להשתמש בלוח?")}
        </h2>
        <p style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>{board.public_title}</p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <ModeCard
          title={t("מפגש חי עכשיו")}
          description={t("אתם מנחים בזמן אמת. המשתתפים סורקים קוד והתוכן עולה על המסך המשותף מיד.")}
          selected={!isOpen}
          onClick={() => setMode("live")}
        />
        <ModeCard
          title={t("לוח פתוח לאיסוף")}
          description={t("שולחים קישור, והמשתתפים מעלים תוכן מתי שנוח להם — לאורך ימים. הקישור נשאר פעיל עד התאריך שתקבעו.")}
          selected={isOpen}
          onClick={() => setMode("open")}
        />
      </div>

      <Input
        label={isOpen ? t("שם הסבב (אופציונלי)") : t("שם המפגש (אופציונלי)")}
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder={isOpen ? t("למשל: מחזור אביב") : t("למשל: קבוצת בוקר")}
      />

      {isOpen ? (
        <>
          <Input
            label={t("פתוח לשליחה עד")}
            type="date"
            value={closesOn}
            min={minDate}
            onChange={(e) => setClosesOn(e.target.value)}
            hint={t("אחרי התאריך הזה הלוח יפסיק לקבל תוכן חדש, והתוכן שנאסף יישאר. אפשר להשאיר ריק ולסגור ידנית.")}
          />
          <Switch
            label={t("אישור לפני הצגה")}
            description={t("בלוח פתוח אף אחד לא צופה בזמן אמת, ולכן מומלץ שתוכן יחכה לאישור שלכם. תראו את הממתינים בדף הלוח.")}
            checked={requireApproval}
            onChange={setRequireApproval}
          />
        </>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Radio name="actcontent" label={t("התחל מפגש חדש וריק")} checked={content === "fresh"} onChange={() => setContent("fresh")} />
          {hasPrior && (
            <Radio
              name="actcontent"
              label={t("המשך את המפגש הקודם עם התוכן שנאסף")}
              checked={content === "continue"}
              onChange={() => setContent("continue")}
            />
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
        <Button variant="ghost" onClick={onClose}>
          {t("ביטול")}
        </Button>
        <Button variant="primary" onClick={activate}>
          {isOpen ? t("פתח לוח לאיסוף") : t("הפעל חדר")}
        </Button>
      </div>
    </Modal>
  );
}

function ModeCard({ title, description, selected, onClick }: { title: string; description: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 3,
        border: `1.5px solid ${selected ? "var(--magenta-500)" : "var(--border)"}`,
        background: selected ? "var(--accent-soft)" : "var(--surface)",
        borderRadius: "var(--radius-lg)",
        padding: "12px 14px",
        cursor: "pointer",
        textAlign: "start",
      }}
    >
      <span style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-bold)", color: "var(--text)" }}>{title}</span>
      <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-subtle)", lineHeight: "var(--leading-relaxed)" }}>{description}</span>
    </button>
  );
}
