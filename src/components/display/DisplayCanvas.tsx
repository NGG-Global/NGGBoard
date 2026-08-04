"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import type { Board, LiveRoom, Submission } from "@/lib/types";
import { t as translate } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/react";
import { boardZones, FONT_SCALE_FACTOR, isZoned, themeVisual } from "@/lib/board-visuals";
import { formatRoomCode } from "@/lib/utils";
import { QRCodeCanvas, LiveDot } from "@/components/ui";
import { IconPause, IconLock, IconClock, IconCheck } from "@/components/ui/icons";
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
  /**
   * Guest reading mode — a participant opening the board on their own phone.
   * The board becomes one continuous page that scrolls: every card is shown at
   * a comfortable size, column counts follow the viewport instead of a
   * projector's aspect ratio, pages never auto-cycle, and the full-screen
   * overlays (focus, QR, "session ended") are replaced by a small status strip
   * so they can't swallow the scroll or hide the content the guest came to read.
   */
  viewer?: boolean;
  /**
   * Extra content rendered under each card. The guest view uses it for reply
   * threads; the projector passes nothing. Keeping it a render prop means the
   * canvas never has to know what comments are.
   */
  renderFooter?: (submission: Submission) => React.ReactNode;
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

export function DisplayCanvas({ room, board, submissions, joinUrl, facilitator, hideJoinChip, viewer, renderFooter }: Props) {
  const { t } = useI18n();
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

  // Both interactive surfaces — the facilitator's control room and a guest
  // reading the board on their phone — show every card and scroll. A passive
  // projector keeps fitting one screen at a time and auto-cycles pages.
  // `scrollable` gates the two behaviours.
  const scrollable = !!facilitator || !!viewer;

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

  // Clamp the page: if submissions were removed while parked on a high page,
  // `page` can exceed the new range and slice to an empty screen until the next
  // 12s tick. Fall back to page 0 rather than show a blank projector.
  const safePage = page < pageCount ? page : 0;
  const shown = scrollable ? ordered : ordered.slice(safePage * pageSize, safePage * pageSize + pageSize);
  const cols = columnsFor(scrollable ? Math.min(ordered.length, 20) : shown.length);
  // The guest view runs on anything from a narrow phone to a laptop, so its
  // tracks are sized by CSS rather than by a count derived from the item total —
  // one column on a phone, more as the width allows.
  const gridColumns = viewer ? "repeat(auto-fill, minmax(min(100%, 260px), 1fr))" : `repeat(${cols}, 1fr)`;
  // Projector shrinks text as density rises so a full screen stays readable;
  // the scrollable view keeps a comfortable fixed size and lets you scroll.
  const densityScale = scrollable
    ? baseScale * 0.95
    : baseScale * (shown.length > 12 ? 0.82 : shown.length > 6 ? 0.92 : 1);

  const overlay = statusOverlay(room);

  return (
    <div
      style={{
        // The guest view grows with its content and lets the page scroll; the
        // projector and control room stay pinned to the viewport.
        height: viewer ? "auto" : "100%",
        minHeight: viewer ? "100%" : undefined,
        width: "100%",
        background: v.background,
        color: textColor,
        fontFamily: "var(--font-sans)",
        display: "flex",
        flexDirection: "column",
        padding: viewer ? "clamp(14px, 4vw, 28px)" : "clamp(20px, 3vw, 48px)",
        position: "relative",
        overflow: viewer ? "visible" : "hidden",
      }}
    >
      {/* Header */}
      <header style={{ display: "flex", alignItems: "flex-start", gap: viewer ? 12 : 20, marginBottom: "clamp(12px, 2vh, 28px)" }}>
        {board.appearance.client_logo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={board.appearance.client_logo_url} alt={t("לוגו לקוח")} style={{ height: viewer ? "clamp(24px, 8vw, 40px)" : "clamp(28px, 4vh, 52px)", background: "rgba(255,255,255,.92)", borderRadius: "var(--radius-md)", padding: 6 }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: viewer ? `clamp(21px, ${5 * baseScale}vw, ${34 * baseScale}px)` : `clamp(28px, ${3.4 * baseScale}vw, ${72 * baseScale}px)`, fontWeight: "var(--weight-black)", lineHeight: "var(--leading-tight)", color: textColor }}>
            {board.public_title}
          </h1>
          {board.public_subtitle && (
            <p style={{ fontSize: viewer ? `clamp(13px, ${3.2 * baseScale}vw, ${17 * baseScale}px)` : `clamp(15px, ${1.6 * baseScale}vw, ${28 * baseScale}px)`, color: subColor, marginTop: 6 }}>
              {board.public_subtitle}
            </p>
          )}
        </div>
        {/* Persistent small join hint — a guest is already in, so it's dropped there. */}
        {!hideJoinChip && !viewer && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flex: "none", background: "rgba(255,255,255,.94)", borderRadius: "var(--radius-lg)", padding: "10px 12px" }}>
            <QRCodeCanvas value={joinUrl} size={84} />
            <div dir="ltr" style={{ fontSize: 15, fontWeight: "var(--weight-black)", color: "var(--neutral-900)", letterSpacing: ".06em" }}>
              {formatRoomCode(room.room_code)}
            </div>
          </div>
        )}
      </header>

      {/* The facilitator's brief, pinned above the content for a guest. On the
          projector it would compete with the board itself, so it stays here. */}
      {viewer && board.instructions?.trim() && (
        <div style={{ background: v.dark ? "rgba(255,255,255,.08)" : "rgba(255,255,255,.72)", border: `1px solid ${v.dark ? "rgba(255,255,255,.16)" : "rgba(8,8,16,.08)"}`, borderRadius: "var(--radius-xl)", padding: "13px 15px", marginBottom: 16, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: "var(--text-2xs)", fontWeight: "var(--weight-bold)", color: subColor, letterSpacing: ".02em" }}>{t("ההנחיות")}</div>
          <p style={{ fontSize: "var(--text-sm)", color: textColor, lineHeight: "var(--leading-relaxed)", whiteSpace: "pre-line" }}>{board.instructions.trim()}</p>
        </div>
      )}

      {/* A guest can't be handed a full-screen takeover — it would hide the very
          content they opened the board to read — so the room's state is a strip. */}
      {viewer && (overlay || room.status === "ended") && (
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: room.status === "ended" ? "var(--ink-900)" : overlay!.bg, color: room.status === "ended" ? "#fff" : overlay!.fg, padding: "8px 16px", borderRadius: "var(--radius-pill)", fontSize: "var(--text-xs)", fontWeight: "var(--weight-bold)", boxShadow: "var(--shadow-sm)" }}>
            {room.status === "ended" ? <IconCheck size={15} /> : overlay!.icon}
            {room.status === "ended" ? t("המפגש הסתיים") : overlay!.label}
          </div>
        </div>
      )}

      {/* Content area — the page scrolls in guest mode, the panel scrolls in the
          control room, and a projector fits one screen at a time. */}
      <div className={scrollable ? undefined : "ngg-no-scrollbar"} style={{ flex: 1, minHeight: 0, overflowY: viewer ? "visible" : scrollable ? "auto" : "hidden", overflowX: viewer ? "visible" : "hidden" }}>
        {ordered.length === 0 && !zoned ? (
          <EmptyDisplay joinUrl={joinUrl} roomCode={room.room_code} dark={v.dark} viewer={viewer} />
        ) : zoned ? (
          <ZonedContent zones={boardZones(board)} ordered={ordered} board={board} scale={baseScale} dark={v.dark} facFor={facFor} scrollable={scrollable} viewer={viewer} renderFooter={renderFooter} />
        ) : room.layout === "mosaic" ? (
          <div style={viewer ? { columnWidth: 260, columnGap: "clamp(12px, 1.4vw, 22px)" } : { columns: cols, columnGap: "clamp(12px, 1.4vw, 22px)", height: "100%", overflow: "hidden" }}>
            {shown.map((s) => (
              <div key={s.id} style={{ marginBottom: "clamp(12px, 1.4vw, 22px)", breakInside: "avoid" }}>
                <DisplaySubmission submission={s} board={board} scale={densityScale} facilitator={facFor(s)} footer={renderFooter?.(s)} />
              </div>
            ))}
          </div>
        ) : room.layout === "feed" ? (
          <div style={{ display: "grid", gridTemplateColumns: viewer || shown.length <= 4 ? "1fr" : "1fr 1fr", gap: "clamp(12px, 1.4vw, 22px)", height: scrollable ? undefined : "100%", alignContent: "start" }}>
            {shown.map((s, i) => (
              <div key={s.id} style={{ gridColumn: !viewer && i === 0 && shown.length > 4 ? "1 / -1" : undefined }}>
                <DisplaySubmission submission={s} board={board} scale={densityScale * (!viewer && i === 0 ? 1.15 : 1)} facilitator={facFor(s)} footer={renderFooter?.(s)} />
              </div>
            ))}
          </div>
        ) : scrollable ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: gridColumns,
              gap: "clamp(12px, 1.4vw, 22px)",
              gridAutoRows: "min-content",
              alignContent: "start",
            }}
          >
            {shown.map((s) => (
              <DisplaySubmission key={s.id} submission={s} board={board} scale={densityScale} facilitator={facFor(s)} footer={renderFooter?.(s)} />
            ))}
          </div>
        ) : (
          <BalancedWall items={shown} board={board} scale={densityScale} facFor={facFor} />
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
              <span key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: i === safePage ? "var(--accent)" : v.dark ? "rgba(255,255,255,.3)" : "rgba(8,8,16,.2)" }} />
            ))}
          </div>
        )}
      </footer>

      {/* Focus mode overlay — projector/control room only. A guest keeps their
          own place in the board instead of having the facilitator's highlight
          fill their screen; the focused card is still there in the list. */}
      {focused && !viewer && (
        <div
          onClick={facilitator ? () => facilitator.onFocus(focused.id) : undefined}
          title={facilitator ? t("לחצו להסרה מהמסך") : undefined}
          style={{ position: "absolute", inset: 0, background: v.dark ? "rgba(8,8,16,.72)" : "rgba(255,255,255,.82)", display: "flex", alignItems: "center", justifyContent: "center", padding: "clamp(40px, 6vw, 120px)", zIndex: 40, cursor: facilitator ? "zoom-out" : "default" }}
        >
          <div style={{ width: "min(1100px, 100%)", maxHeight: "100%" }} onClick={(e) => e.stopPropagation()}>
            <DisplaySubmission submission={focused} board={board} scale={baseScale} focus />
          </div>
        </div>
      )}

      {/* QR overlay (facilitator-triggered) — a guest has already joined. */}
      {room.qr_overlay_visible && !focused && !viewer && (
        <div className="theme-dark" style={{ position: "absolute", inset: 0, background: "rgba(8,8,16,.88)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 26, zIndex: 50, color: "#fff" }}>
          <div style={{ fontSize: "clamp(28px, 4vw, 56px)", fontWeight: "var(--weight-black)" }}>{t("הצטרפו למפגש")}</div>
          <div style={{ background: "#fff", padding: 20, borderRadius: "var(--radius-2xl)" }}>
            <QRCodeCanvas value={joinUrl} size={280} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <div dir="ltr" style={{ fontSize: "clamp(32px, 5vw, 64px)", fontWeight: "var(--weight-black)", letterSpacing: ".08em" }}>{formatRoomCode(room.room_code)}</div>
            <div dir="ltr" style={{ fontSize: "var(--text-lg)", color: "var(--neutral-400)" }}>{joinUrl.replace(/^https?:\/\//, "")}</div>
          </div>
        </div>
      )}

      {/* Lifecycle overlays (the guest equivalent is the status strip above) */}
      {overlay && !focused && !room.qr_overlay_visible && !viewer && (
        <div style={{ position: "absolute", insetInlineStart: 0, insetInlineEnd: 0, top: "clamp(20px, 3vw, 48px)", display: "flex", justifyContent: "center", zIndex: 45, pointerEvents: "none" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 10, background: overlay.bg, color: overlay.fg, padding: "12px 22px", borderRadius: "var(--radius-pill)", fontSize: "var(--text-lg)", fontWeight: "var(--weight-bold)", boxShadow: "var(--shadow-lg)" }}>
            {overlay.icon}
            {overlay.label}
          </div>
        </div>
      )}

      {room.status === "ended" && !viewer && (
        <div className="theme-dark" style={{ position: "absolute", inset: 0, background: "var(--gradient-ink)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, zIndex: 60, color: "#f4f4f6" }}>
          <Image src="/brand/ngg-mark.png" alt="" width={54} height={47} style={{ height: 47, width: "auto", opacity: 0.85 }} />
          <div style={{ fontSize: "clamp(30px, 4vw, 56px)", fontWeight: "var(--weight-black)" }}>{t("המפגש הסתיים")}</div>
          <div style={{ fontSize: "var(--text-lg)", color: "var(--neutral-400)" }}>{t("תודה על ההשתתפות")}</div>
        </div>
      )}
    </div>
  );
}

/** Preferred item count in the widest row of the balanced projector wall. */
function balancedColumns(n: number): number {
  if (n <= 3) return Math.max(n, 1);
  if (n <= 8) return Math.min(Math.ceil(n / 2), 4);
  if (n <= 12) return 4;
  return 5;
}

/** Ideal (pre-shrink) card width in px, sized to what the content warrants. */
function idealCardWidth(s: Submission): number {
  if (s.type !== "text" && s.media_url) return 480;
  const len = s.text_content?.length ?? 0;
  return len <= 45 ? 340 : len <= 130 ? 460 : 580;
}

/**
 * Projector wall: a balanced, centered composition instead of a stretched
 * grid. Items split into rows whose sizes differ by at most one (a shorter
 * last row sits centered), the whole block is vertically centered, and each
 * card takes only the width/height its content warrants — a short quote stays
 * compact, media keeps a consistent frame, nothing balloons to fill a track.
 */
function BalancedWall({
  items,
  board,
  scale,
  facFor,
}: {
  items: Submission[];
  board: Board;
  scale: number;
  facFor: (s: Submission) => FacilitatorCardActions | undefined;
}) {
  const n = items.length;
  const cols = balancedColumns(n);
  const rowCount = Math.max(1, Math.ceil(n / cols));
  // Even distribution: 7 items in rows of ≤4 become [4,3], 10 become [4,3,3].
  const base = Math.floor(n / rowCount);
  const extra = n % rowCount;
  const rows: Submission[][] = [];
  let idx = 0;
  for (let r = 0; r < rowCount; r++) {
    const size = base + (r < extra ? 1 : 0);
    rows.push(items.slice(idx, idx + size));
    idx += size;
  }
  const dense = rowCount >= 4;
  const gap = "clamp(12px, 1.4vw, 22px)";
  // A near-empty board still shouldn't produce billboard-sized cards; give the
  // one-or-two-item case a little extra presence and cap it there.
  const fewBoost = n <= 2 ? 1.2 : 1;
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", gap }}>
      {rows.map((row, ri) => (
        <div key={ri} style={{ display: "flex", justifyContent: "center", alignItems: "center", gap, minHeight: 0 }}>
          {row.map((s) => (
            <div key={s.id} style={{ flex: `0 1 ${Math.round(idealCardWidth(s) * fewBoost)}px`, minWidth: 0, display: "flex", justifyContent: "center" }}>
              <DisplaySubmission submission={s} board={board} scale={scale} facilitator={facFor(s)} hug dense={dense} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Divided board: one titled column per zone, cards flow inside their zone.
 * In guest mode the zones stack into titled sections instead — four columns
 * side by side is unreadable on a phone — and the whole thing scrolls as one
 * page rather than each zone owning its own scroller.
 */
function ZonedContent({
  zones,
  ordered,
  board,
  scale,
  dark,
  facFor,
  scrollable,
  viewer,
  renderFooter,
}: {
  zones: BoardZone[];
  ordered: Submission[];
  board: Board;
  scale: number;
  dark: boolean;
  facFor: (s: Submission) => FacilitatorCardActions | undefined;
  scrollable: boolean;
  viewer?: boolean;
  renderFooter?: (submission: Submission) => React.ReactNode;
}) {
  const { t } = useI18n();
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
  const zoneScale = viewer ? scale : scale * (zones.length >= 3 ? 0.8 : 0.9);

  return (
    <div style={{ display: "grid", gridTemplateColumns: viewer ? "1fr" : `repeat(${zones.length}, 1fr)`, gap: viewer ? 26 : "clamp(12px, 1.6vw, 26px)", height: viewer ? undefined : "100%" }}>
      {zones.map((z, i) => {
        const items = byZone.get(z.id) ?? [];
        return (
          <div key={z.id} style={{ display: "flex", flexDirection: "column", minWidth: 0, height: viewer ? undefined : "100%", borderInlineStart: !viewer && i > 0 ? `1px solid ${divider}` : "none", paddingInlineStart: !viewer && i > 0 ? "clamp(8px, 1vw, 18px)" : 0 }}>
            <div style={{ flex: "none", paddingBottom: 10, marginBottom: 10, borderBottom: `2px solid ${divider}` }}>
              <div style={{ fontSize: viewer ? `clamp(16px, ${4 * scale}vw, ${22 * scale}px)` : `clamp(16px, ${1.4 * scale}vw, ${28 * scale}px)`, fontWeight: "var(--weight-black)", color: headerColor, lineHeight: "var(--leading-tight)" }}>
                {z.title || t("אזור {number}", { number: i + 1 })}
              </div>
              {z.subtitle && <div style={{ fontSize: viewer ? `clamp(12px, ${3 * scale}vw, ${15 * scale}px)` : `clamp(11px, ${0.9 * scale}vw, ${16 * scale}px)`, color: subColor, marginTop: 2 }}>{z.subtitle}</div>}
            </div>
            <div className={scrollable ? undefined : "ngg-no-scrollbar"} style={{ flex: 1, minHeight: 0, overflowY: viewer ? "visible" : scrollable ? "auto" : "hidden", overflowX: viewer ? "visible" : "hidden", display: "flex", flexDirection: "column", gap: "clamp(10px, 1vw, 16px)" }}>
              {items.length === 0 ? (
                <div style={{ color: subColor, fontSize: `clamp(12px, 1vw, ${16 * scale}px)`, opacity: 0.7, paddingTop: 8 }}>{t("עדיין אין תוכן באזור זה")}</div>
              ) : (
                (scrollable ? items : items.slice(0, 12)).map((s) => <DisplaySubmission key={s.id} submission={s} board={board} scale={zoneScale} facilitator={facFor(s)} hug={!viewer} dense={!viewer && zones.length >= 3} footer={renderFooter?.(s)} />)
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function statusOverlay(room: LiveRoom): { label: string; icon: React.ReactNode; bg: string; fg: string } | null {
  if (room.status === "paused") return { label: translate("קבלת התוכן מושהית"), icon: <IconPause size={20} />, bg: "var(--warning)", fg: "#fff" };
  if (room.status === "read_only") return { label: translate("מצב קריאה בלבד"), icon: <IconLock size={18} />, bg: "var(--info)", fg: "#fff" };
  if (room.status === "suspended") return { label: translate("החדר הושהה זמנית"), icon: <IconClock size={18} />, bg: "var(--warning)", fg: "#fff" };
  return null;
}

function EmptyDisplay({ joinUrl, roomCode, dark, viewer }: { joinUrl: string; roomCode: string; dark: boolean; viewer?: boolean }) {
  const { t } = useI18n();
  // A guest doesn't need the join QR — they're already in. They just need to
  // know the board is genuinely empty rather than still loading.
  if (viewer) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, textAlign: "center", padding: "48px 16px" }}>
        <div style={{ fontSize: "var(--text-lg)", fontWeight: "var(--weight-extrabold)", color: dark ? "#fff" : "var(--neutral-900)" }}>
          {t("הלוח עוד ריק")}
        </div>
        <div style={{ fontSize: "var(--text-sm)", color: dark ? "rgba(255,255,255,.75)" : "var(--neutral-700)", maxWidth: 320, lineHeight: "var(--leading-relaxed)" }}>
          {t("היו הראשונים לשלוח — התוכן יופיע כאן ועל המסך המשותף.")}
        </div>
      </div>
    );
  }
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 28 }}>
      <div style={{ fontSize: "clamp(22px, 3vw, 40px)", fontWeight: "var(--weight-extrabold)", color: dark ? "#fff" : "var(--neutral-900)", textAlign: "center" }}>
        {t("סרקו את הקוד כדי להצטרף ולשלוח את התוכן הראשון")}
      </div>
      <div style={{ background: "#fff", padding: 24, borderRadius: "var(--radius-2xl)", boxShadow: "var(--shadow-xl)", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <QRCodeCanvas value={joinUrl} size={240} />
        <div dir="ltr" style={{ fontSize: 36, fontWeight: "var(--weight-black)", color: "var(--neutral-900)", letterSpacing: ".08em" }}>{formatRoomCode(roomCode)}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: dark ? "rgba(255,255,255,.8)" : "var(--neutral-700)", fontSize: "var(--text-lg)" }}>
        <LiveDot light={dark} />
        {t("ממתין למשתתפים…")}
      </div>
    </div>
  );
}
