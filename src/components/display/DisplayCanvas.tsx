"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import type { Board, LiveRoom, Submission } from "@/lib/types";
import { boardZones, FONT_SCALE_FACTOR, isZoned, themeVisual } from "@/lib/board-visuals";
import { formatRoomCode } from "@/lib/utils";
import { QRCodeCanvas, LiveDot } from "@/components/ui";
import { IconPause, IconLock, IconClock } from "@/components/ui/icons";
import { DisplaySubmission, type FacilitatorCardActions } from "./DisplaySubmission";
import type { BoardZone } from "@/lib/types";

/** When present, published cards gain on-board hover controls. */
export interface FacilitatorControls {
  focusedId: string | null;
  onFocus: (id: string) => void;
  onPin: (id: string) => void;
  onHide: (id: string) => void;
  onDelete: (id: string) => void;
}

interface Props {
  room: LiveRoom;
  board: Board;
  submissions: Submission[];
  joinUrl: string;
  /** Facilitator mode: enables direct move/remove on the board. */
  facilitator?: FacilitatorControls;
  /** Hide the built-in header QR chip (e.g. when the drawer shows it). */
  hideJoinChip?: boolean;
}

function columnsFor(count: number): number {
  if (count <= 2) return count || 1;
  if (count <= 4) return 2;
  if (count <= 9) return 3;
  if (count <= 20) return 4;
  return 5;
}

function pageSizeFor(layout: Board["default_layout"], count: number): number {
  if (layout === "feed") return 9;
  return count <= 20 ? count : 20; // wall/mosaic paginate above 20
}

export function DisplayCanvas({ room, board, submissions, joinUrl, facilitator, hideJoinChip }: Props) {
  const v = themeVisual(board.appearance);
  const zoned = isZoned(board);
  const facFor = (s: Submission) =>
    facilitator
      ? {
          focused: facilitator.focusedId === s.id,
          onFocus: () => facilitator.onFocus(s.id),
          onPin: () => facilitator.onPin(s.id),
          onHide: () => facilitator.onHide(s.id),
          onDelete: () => facilitator.onDelete(s.id),
        }
      : undefined;
  const baseScale = FONT_SCALE_FACTOR[board.appearance.font_scale];
  const textColor = v.dark ? "#ffffff" : "var(--neutral-950)";
  const subColor = v.dark ? "rgba(255,255,255,.8)" : "var(--neutral-700)";

  const focused = room.focused_submission_id
    ? submissions.find((s) => s.id === room.focused_submission_id) ?? null
    : null;

  // Newest-first, pinned float to the front.
  const ordered = useMemo(() => {
    const base = [...submissions];
    base.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      const t = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      return board.default_sort === "oldest" ? -t : t;
    });
    return base;
  }, [submissions, board.default_sort]);

  // Facilitator mode is an interactive screen (the live control room), so it
  // scrolls and shows every card. A passive projector keeps fitting one screen
  // at a time and auto-cycles pages. `scrollable` gates the two behaviours.
  const scrollable = !!facilitator;

  const pageSize = pageSizeFor(room.layout, ordered.length);
  const pageCount = scrollable ? 1 : Math.max(1, Math.ceil(ordered.length / pageSize));
  const [page, setPage] = useState(0);

  // Auto-cycle pages when content overflows one screen (projector only; paused
  // during focus mode). Never cycles when the view is scrollable.
  useEffect(() => {
    if (scrollable || focused || pageCount <= 1) {
      setPage(0);
      return;
    }
    const id = setInterval(() => setPage((p) => (p + 1) % pageCount), 12000);
    return () => clearInterval(id);
  }, [scrollable, focused, pageCount]);

  const shown = scrollable ? ordered : ordered.slice(page * pageSize, page * pageSize + pageSize);
  const cols = columnsFor(scrollable ? Math.min(ordered.length, 20) : shown.length);
  // Projector shrinks text as density rises so a full screen stays readable;
  // the scrollable view keeps a comfortable fixed size and lets you scroll.
  const densityScale = scrollable
    ? baseScale * 0.95
    : baseScale * (shown.length > 12 ? 0.82 : shown.length > 6 ? 0.92 : 1);

  const overlay = statusOverlay(room);

  return (
    <div
      dir="rtl"
      style={{
        height: "100%",
        width: "100%",
        background: v.background,
        color: textColor,
        fontFamily: "var(--font-sans)",
        display: "flex",
        flexDirection: "column",
        padding: "clamp(20px, 3vw, 48px)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <header style={{ display: "flex", alignItems: "flex-start", gap: 20, marginBottom: "clamp(12px, 2vh, 28px)" }}>
        {board.appearance.client_logo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={board.appearance.client_logo_url} alt="לוגו לקוח" style={{ height: "clamp(28px, 4vh, 52px)", background: "rgba(255,255,255,.92)", borderRadius: "var(--radius-md)", padding: 6 }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: `clamp(28px, ${3.4 * baseScale}vw, ${72 * baseScale}px)`, fontWeight: "var(--weight-black)", lineHeight: "var(--leading-tight)", color: textColor }}>
            {board.public_title}
          </h1>
          {board.public_subtitle && (
            <p style={{ fontSize: `clamp(15px, ${1.6 * baseScale}vw, ${28 * baseScale}px)`, color: subColor, marginTop: 6 }}>
              {board.public_subtitle}
            </p>
          )}
        </div>
        {/* Persistent small join hint */}
        {!hideJoinChip && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flex: "none", background: "rgba(255,255,255,.94)", borderRadius: "var(--radius-lg)", padding: "10px 12px" }}>
            <QRCodeCanvas value={joinUrl} size={84} />
            <div dir="ltr" style={{ fontSize: 15, fontWeight: "var(--weight-black)", color: "var(--neutral-900)", letterSpacing: ".06em" }}>
              {formatRoomCode(room.room_code)}
            </div>
          </div>
        )}
      </header>

      {/* Content area — scrolls in facilitator mode, fits one screen on a projector. */}
      <div className={scrollable ? undefined : "ngg-no-scrollbar"} style={{ flex: 1, minHeight: 0, overflowY: scrollable ? "auto" : "hidden", overflowX: "hidden" }}>
        {ordered.length === 0 && !zoned ? (
          <EmptyDisplay joinUrl={joinUrl} roomCode={room.room_code} dark={v.dark} />
        ) : zoned ? (
          <ZonedContent zones={boardZones(board)} ordered={ordered} board={board} scale={baseScale} dark={v.dark} facFor={facFor} scrollable={scrollable} />
        ) : room.layout === "mosaic" ? (
          <div style={{ columns: cols, columnGap: "clamp(12px, 1.4vw, 22px)", height: scrollable ? undefined : "100%", overflow: "hidden" }}>
            {shown.map((s) => (
              <div key={s.id} style={{ marginBottom: "clamp(12px, 1.4vw, 22px)", breakInside: "avoid" }}>
                <DisplaySubmission submission={s} board={board} scale={densityScale} facilitator={facFor(s)} />
              </div>
            ))}
          </div>
        ) : room.layout === "feed" ? (
          <div style={{ display: "grid", gridTemplateColumns: shown.length > 4 ? "1fr 1fr" : "1fr", gap: "clamp(12px, 1.4vw, 22px)", height: scrollable ? undefined : "100%", alignContent: "start" }}>
            {shown.map((s, i) => (
              <div key={s.id} style={{ gridColumn: i === 0 && shown.length > 4 ? "1 / -1" : undefined }}>
                <DisplaySubmission submission={s} board={board} scale={densityScale * (i === 0 ? 1.15 : 1)} facilitator={facFor(s)} />
              </div>
            ))}
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${cols}, 1fr)`,
              gap: "clamp(12px, 1.4vw, 22px)",
              height: scrollable ? undefined : "100%",
              gridAutoRows: scrollable ? "min-content" : "1fr",
              alignContent: "start",
            }}
          >
            {shown.map((s) => (
              <DisplaySubmission key={s.id} submission={s} board={board} scale={densityScale} facilitator={facFor(s)} />
            ))}
          </div>
        )}
      </div>

      {/* Footer: org logo, page indicator, paused strip */}
      <footer style={{ display: "flex", alignItems: "center", gap: 14, marginTop: "clamp(10px, 1.6vh, 20px)", minHeight: 30 }}>
        {board.appearance.show_org_logo && (
          <div style={{ background: v.dark ? "rgba(255,255,255,.9)" : "transparent", borderRadius: "var(--radius-md)", padding: v.dark ? "4px 8px" : 0 }}>
            <Image src="/brand/ngg-logo.png" alt="NGG" width={64} height={18} style={{ height: 18, width: "auto" }} />
          </div>
        )}
        <div style={{ flex: 1 }} />
        {pageCount > 1 && !focused && !zoned && (
          <div style={{ display: "flex", gap: 6 }} aria-hidden="true">
            {Array.from({ length: pageCount }).map((_, i) => (
              <span key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: i === page ? "var(--accent)" : v.dark ? "rgba(255,255,255,.3)" : "rgba(8,8,16,.2)" }} />
            ))}
          </div>
        )}
      </footer>

      {/* Focus mode overlay */}
      {focused && (
        <div
          onClick={facilitator ? () => facilitator.onFocus(focused.id) : undefined}
          title={facilitator ? "לחצו להסרה מהמסך" : undefined}
          style={{ position: "absolute", inset: 0, background: v.dark ? "rgba(8,8,16,.72)" : "rgba(255,255,255,.82)", display: "flex", alignItems: "center", justifyContent: "center", padding: "clamp(40px, 6vw, 120px)", zIndex: 40, cursor: facilitator ? "zoom-out" : "default" }}
        >
          <div style={{ width: "min(1100px, 100%)", maxHeight: "100%" }} onClick={(e) => e.stopPropagation()}>
            <DisplaySubmission submission={focused} board={board} scale={baseScale} focus />
          </div>
        </div>
      )}

      {/* QR overlay (facilitator-triggered) */}
      {room.qr_overlay_visible && !focused && (
        <div className="theme-dark" style={{ position: "absolute", inset: 0, background: "rgba(8,8,16,.88)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 26, zIndex: 50, color: "#fff" }}>
          <div style={{ fontSize: "clamp(28px, 4vw, 56px)", fontWeight: "var(--weight-black)" }}>הצטרפו למפגש</div>
          <div style={{ background: "#fff", padding: 20, borderRadius: "var(--radius-2xl)" }}>
            <QRCodeCanvas value={joinUrl} size={280} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <div dir="ltr" style={{ fontSize: "clamp(32px, 5vw, 64px)", fontWeight: "var(--weight-black)", letterSpacing: ".08em" }}>{formatRoomCode(room.room_code)}</div>
            <div dir="ltr" style={{ fontSize: "var(--text-lg)", color: "var(--neutral-400)" }}>{joinUrl.replace(/^https?:\/\//, "")}</div>
          </div>
        </div>
      )}

      {/* Lifecycle overlays */}
      {overlay && !focused && !room.qr_overlay_visible && (
        <div style={{ position: "absolute", insetInlineStart: 0, insetInlineEnd: 0, top: "clamp(20px, 3vw, 48px)", display: "flex", justifyContent: "center", zIndex: 45, pointerEvents: "none" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 10, background: overlay.bg, color: overlay.fg, padding: "12px 22px", borderRadius: "var(--radius-pill)", fontSize: "var(--text-lg)", fontWeight: "var(--weight-bold)", boxShadow: "var(--shadow-lg)" }}>
            {overlay.icon}
            {overlay.label}
          </div>
        </div>
      )}

      {room.status === "ended" && (
        <div className="theme-dark" style={{ position: "absolute", inset: 0, background: "var(--gradient-ink)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, zIndex: 60, color: "#f4f4f6" }}>
          <Image src="/brand/ngg-mark.png" alt="" width={54} height={47} style={{ height: 47, width: "auto", opacity: 0.85 }} />
          <div style={{ fontSize: "clamp(30px, 4vw, 56px)", fontWeight: "var(--weight-black)" }}>המפגש הסתיים</div>
          <div style={{ fontSize: "var(--text-lg)", color: "var(--neutral-400)" }}>תודה על ההשתתפות</div>
        </div>
      )}
    </div>
  );
}

/** Divided board: one titled column per zone, cards flow inside their zone. */
function ZonedContent({
  zones,
  ordered,
  board,
  scale,
  dark,
  facFor,
  scrollable,
}: {
  zones: BoardZone[];
  ordered: Submission[];
  board: Board;
  scale: number;
  dark: boolean;
  facFor: (s: Submission) => FacilitatorCardActions | undefined;
  scrollable: boolean;
}) {
  const firstZoneId = zones[0]?.id;
  const byZone = new Map<string, Submission[]>();
  for (const z of zones) byZone.set(z.id, []);
  for (const s of ordered) {
    const key = s.zone_id && byZone.has(s.zone_id) ? s.zone_id : firstZoneId;
    if (key) byZone.get(key)!.push(s);
  }
  const headerColor = dark ? "#fff" : "var(--neutral-950)";
  const subColor = dark ? "rgba(255,255,255,.72)" : "var(--neutral-700)";
  const divider = dark ? "rgba(255,255,255,.16)" : "rgba(8,8,16,.12)";
  const zoneScale = scale * (zones.length >= 3 ? 0.8 : 0.9);

  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${zones.length}, 1fr)`, gap: "clamp(12px, 1.6vw, 26px)", height: "100%" }}>
      {zones.map((z, i) => {
        const items = byZone.get(z.id) ?? [];
        return (
          <div key={z.id} style={{ display: "flex", flexDirection: "column", minWidth: 0, height: "100%", borderInlineStart: i > 0 ? `1px solid ${divider}` : "none", paddingInlineStart: i > 0 ? "clamp(8px, 1vw, 18px)" : 0 }}>
            <div style={{ flex: "none", paddingBottom: 10, marginBottom: 10, borderBottom: `2px solid ${divider}` }}>
              <div style={{ fontSize: `clamp(16px, ${1.4 * scale}vw, ${28 * scale}px)`, fontWeight: "var(--weight-black)", color: headerColor, lineHeight: "var(--leading-tight)" }}>
                {z.title || `אזור ${i + 1}`}
              </div>
              {z.subtitle && <div style={{ fontSize: `clamp(11px, ${0.9 * scale}vw, ${16 * scale}px)`, color: subColor, marginTop: 2 }}>{z.subtitle}</div>}
            </div>
            <div className={scrollable ? undefined : "ngg-no-scrollbar"} style={{ flex: 1, minHeight: 0, overflowY: scrollable ? "auto" : "hidden", overflowX: "hidden", display: "flex", flexDirection: "column", gap: "clamp(10px, 1vw, 16px)" }}>
              {items.length === 0 ? (
                <div style={{ color: subColor, fontSize: `clamp(12px, 1vw, ${16 * scale}px)`, opacity: 0.7, paddingTop: 8 }}>עדיין אין תוכן באזור זה</div>
              ) : (
                (scrollable ? items : items.slice(0, 12)).map((s) => <DisplaySubmission key={s.id} submission={s} board={board} scale={zoneScale} facilitator={facFor(s)} />)
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function statusOverlay(room: LiveRoom): { label: string; icon: React.ReactNode; bg: string; fg: string } | null {
  if (room.status === "paused") return { label: "קבלת התוכן מושהית", icon: <IconPause size={20} />, bg: "var(--warning)", fg: "#fff" };
  if (room.status === "read_only") return { label: "מצב קריאה בלבד", icon: <IconLock size={18} />, bg: "var(--info)", fg: "#fff" };
  if (room.status === "suspended") return { label: "החדר הושהה זמנית", icon: <IconClock size={18} />, bg: "var(--warning)", fg: "#fff" };
  return null;
}

function EmptyDisplay({ joinUrl, roomCode, dark }: { joinUrl: string; roomCode: string; dark: boolean }) {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 28 }}>
      <div style={{ fontSize: "clamp(22px, 3vw, 40px)", fontWeight: "var(--weight-extrabold)", color: dark ? "#fff" : "var(--neutral-900)", textAlign: "center" }}>
        סרקו את הקוד כדי להצטרף ולשלוח את התוכן הראשון
      </div>
      <div style={{ background: "#fff", padding: 24, borderRadius: "var(--radius-2xl)", boxShadow: "var(--shadow-xl)", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <QRCodeCanvas value={joinUrl} size={240} />
        <div dir="ltr" style={{ fontSize: 36, fontWeight: "var(--weight-black)", color: "var(--neutral-900)", letterSpacing: ".08em" }}>{formatRoomCode(roomCode)}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: dark ? "rgba(255,255,255,.8)" : "var(--neutral-700)", fontSize: "var(--text-lg)" }}>
        <LiveDot light={dark} />
        ממתין למשתתפים…
      </div>
    </div>
  );
}
