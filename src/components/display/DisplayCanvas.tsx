"use client";

import Image from "next/image";
import { useMemo } from "react";
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
   * The whole page scrolls instead of the content panel, columns follow the
   * viewport instead of a projector's aspect ratio, and the full-screen
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

/**
 * Track width for the card grids. Cards sit in tracks of a fixed minimum
 * instead of stretching to fill the row — with one or two submissions a plain
 * `1fr` track blows a single card up to the full width of the screen, which is
 * what made the shared board unreadable. Leftover tracks simply stay empty.
 */
const TRACK_MIN = { viewer: 260, shared: 340 } as const;

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

  // The passive shared screen — a projector with no one at its keyboard. It
  // keeps the balanced wall composition and the full-screen overlays; the
  // control room and the guest view get the plainer scrolling grid.
  const projector = !facilitator && !viewer;

  // Every surface scrolls. The board used to fit one screen at a time and
  // auto-cycle pages, which hid content nobody could bring back; now the shared
  // screen holds the whole session and is scrolled to reach the rest of it.
  const gridColumns = `repeat(auto-fill, minmax(min(100%, ${viewer ? TRACK_MIN.viewer : TRACK_MIN.shared}px), 1fr))`;
  // A comfortable, fixed card size on every surface: with scrolling there is no
  // reason to shrink text to squeeze one more row onto the screen.
  const cardScale = projector ? baseScale : baseScale * 0.95;

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

      {/* Content area — the page scrolls in guest mode, the panel scrolls on the
          shared screen and in the control room. Everything sent is reachable. */}
      <div style={{ flex: 1, minHeight: 0, overflowY: viewer ? "visible" : "auto", overflowX: viewer ? "visible" : "hidden" }}>
        {ordered.length === 0 && !zoned ? (
          <EmptyDisplay joinUrl={joinUrl} roomCode={room.room_code} dark={v.dark} viewer={viewer} />
        ) : zoned ? (
          <ZonedContent zones={boardZones(board)} ordered={ordered} board={board} scale={baseScale} dark={v.dark} facFor={facFor} projector={projector} viewer={viewer} renderFooter={renderFooter} />
        ) : room.layout === "mosaic" ? (
          <div style={{ columnWidth: viewer ? TRACK_MIN.viewer : TRACK_MIN.shared, columnGap: "clamp(12px, 1.4vw, 22px)" }}>
            {ordered.map((s) => (
              <div key={s.id} style={{ marginBottom: "clamp(12px, 1.4vw, 22px)", breakInside: "avoid" }}>
                <DisplaySubmission submission={s} board={board} scale={cardScale} facilitator={facFor(s)} footer={renderFooter?.(s)} />
              </div>
            ))}
          </div>
        ) : room.layout === "feed" ? (
          // A feed is one column by definition; on a wide screen it is capped and
          // centered rather than stretched edge to edge.
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "clamp(12px, 1.4vw, 22px)", maxWidth: viewer ? undefined : 760, marginInline: viewer ? undefined : "auto", alignContent: "start" }}>
            {ordered.map((s) => (
              <DisplaySubmission key={s.id} submission={s} board={board} scale={cardScale} facilitator={facFor(s)} footer={renderFooter?.(s)} />
            ))}
          </div>
        ) : projector ? (
          <BalancedWall items={ordered} board={board} scale={cardScale} facFor={facFor} />
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: gridColumns,
              gap: "clamp(12px, 1.4vw, 22px)",
              gridAutoRows: "min-content",
              alignContent: "start",
            }}
          >
            {ordered.map((s) => (
              <DisplaySubmission key={s.id} submission={s} board={board} scale={cardScale} facilitator={facFor(s)} footer={renderFooter?.(s)} />
            ))}
          </div>
        )}
      </div>

      {/* Footer: org logo */}
      {board.appearance.show_org_logo && (
        <footer style={{ display: "flex", alignItems: "center", gap: 14, marginTop: "clamp(10px, 1.6vh, 20px)", minHeight: 30 }}>
          <div style={{ background: v.dark ? "rgba(255,255,255,.9)" : "transparent", borderRadius: "var(--radius-md)", padding: v.dark ? "4px 8px" : 0 }}>
            <Image src="/brand/ngg-logo.png" alt="NGG" width={64} height={18} style={{ height: 18, width: "auto" }} />
          </div>
        </footer>
      )}

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

/**
 * Ideal card width in px, sized to what the content warrants and capped well
 * below the width of the screen — a single submission should read as a card on
 * the board, not as a poster filling it.
 */
function idealCardWidth(s: Submission): number {
  if (s.type !== "text" && s.media_url) return 420;
  const len = s.text_content?.length ?? 0;
  return len <= 45 ? 300 : len <= 130 ? 380 : 460;
}

/**
 * Shared-screen wall: a balanced, centered composition instead of a stretched
 * grid. Items split into rows whose sizes differ by at most one (a shorter
 * last row sits centered), the block is centered while it fits on one screen
 * and grows into a scroll once it doesn't, and each card takes only the
 * width/height its content warrants — a short quote stays compact, media keeps
 * a consistent frame, nothing balloons to fill a track.
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
  const gap = "clamp(12px, 1.4vw, 22px)";
  return (
    // minHeight rather than height: the composition centres itself on a
    // half-empty board and grows past the screen — scrolled, not truncated —
    // once the session fills it.
    <div style={{ minHeight: "100%", display: "flex", flexDirection: "column", justifyContent: "center", gap }}>
      {rows.map((row, ri) => (
        <div key={ri} style={{ display: "flex", justifyContent: "center", alignItems: "center", gap, minHeight: 0 }}>
          {row.map((s) => (
            <div key={s.id} style={{ flex: `0 1 ${idealCardWidth(s)}px`, minWidth: 0, display: "flex", justifyContent: "center" }}>
              <DisplaySubmission submission={s} board={board} scale={scale} facilitator={facFor(s)} hug />
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
  projector,
  viewer,
  renderFooter,
}: {
  zones: BoardZone[];
  ordered: Submission[];
  board: Board;
  scale: number;
  dark: boolean;
  facFor: (s: Submission) => FacilitatorCardActions | undefined;
  projector: boolean;
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
    // An explicit 100% row (rather than the default content-sized one) is what
    // keeps each column bounded by the screen — without it the columns simply
    // grow to their tallest zone and the inner scrollers never engage.
    <div style={{ display: "grid", gridTemplateColumns: viewer ? "1fr" : `repeat(${zones.length}, 1fr)`, gridTemplateRows: viewer ? undefined : "100%", gap: viewer ? 26 : "clamp(12px, 1.6vw, 26px)", height: viewer ? undefined : "100%" }}>
      {zones.map((z, i) => {
        const items = byZone.get(z.id) ?? [];
        return (
          <div key={z.id} style={{ display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, height: viewer ? undefined : "100%", borderInlineStart: !viewer && i > 0 ? `1px solid ${divider}` : "none", paddingInlineStart: !viewer && i > 0 ? "clamp(8px, 1vw, 18px)" : 0 }}>
            <div style={{ flex: "none", paddingBottom: 10, marginBottom: 10, borderBottom: `2px solid ${divider}` }}>
              <div style={{ fontSize: viewer ? `clamp(16px, ${4 * scale}vw, ${22 * scale}px)` : `clamp(16px, ${1.4 * scale}vw, ${28 * scale}px)`, fontWeight: "var(--weight-black)", color: headerColor, lineHeight: "var(--leading-tight)" }}>
                {z.title || t("אזור {number}", { number: i + 1 })}
              </div>
              {z.subtitle && <div style={{ fontSize: viewer ? `clamp(12px, ${3 * scale}vw, ${15 * scale}px)` : `clamp(11px, ${0.9 * scale}vw, ${16 * scale}px)`, color: subColor, marginTop: 2 }}>{z.subtitle}</div>}
            </div>
            {/* Each zone column scrolls on its own so a busy zone never truncates
                its cards or pushes the quieter zones off the screen. */}
            <div style={{ flex: 1, minHeight: 0, overflowY: viewer ? "visible" : "auto", overflowX: viewer ? "visible" : "hidden", display: "flex", flexDirection: "column", gap: "clamp(10px, 1vw, 16px)" }}>
              {items.length === 0 ? (
                <div style={{ color: subColor, fontSize: `clamp(12px, 1vw, ${16 * scale}px)`, opacity: 0.7, paddingTop: 8 }}>{t("עדיין אין תוכן באזור זה")}</div>
              ) : (
                items.map((s) => <DisplaySubmission key={s.id} submission={s} board={board} scale={zoneScale} facilitator={facFor(s)} hug={!viewer} dense={projector && zones.length >= 3} footer={renderFooter?.(s)} />)
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
