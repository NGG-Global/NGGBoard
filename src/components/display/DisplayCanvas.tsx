"use client";

import Image from "next/image";
import { useMemo, useRef } from "react";
import type { Board, LiveRoom, Submission } from "@/lib/types";
import { t as translate } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/react";
import { boardZones, FONT_SCALE_FACTOR, isZoned, themeVisual } from "@/lib/board-visuals";
import { formatRoomCode } from "@/lib/utils";
import { QRCodeCanvas, LiveDot } from "@/components/ui";
import { IconPause, IconLock, IconClock, IconCheck } from "@/components/ui/icons";
import { DisplaySubmission, type FacilitatorCardActions } from "./DisplaySubmission";
import { FIT_ATTR, HEADER_FACTOR, useFitDensity } from "./fit";
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
 * The shared screen's width is in `em` of the stage unit (times the fit
 * density), so the number of columns follows the screen and grows as the fit
 * shrinks the cards to keep a large session on one screen.
 */
const TRACK_MIN = { viewer: "260px", shared: "17em" } as const;

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
  // The projector and the control room's board both size off the stage unit
  // (see `.ngg-stage-type`), which follows the size of the screen; the guest
  // view is a phone and keeps a fixed 16px base.
  const stage = !viewer;
  const gap = stage ? "1em" : "clamp(12px, 1.4vw, 22px)";

  // The shared screen shows the whole session at once: the content area is
  // sized in `em` of a fit density that shrinks every card together until all
  // of them are on screen (see fit.ts). Scrolling is the last resort, for a
  // session too large to stay legible on one screen. (It used to auto-cycle
  // pages, which hid content nobody could bring back.) A guest's phone scrolls
  // as a page and is never fitted.
  const rootRef = useRef<HTMLDivElement>(null);
  // Everything that changes how much room the board takes; resizes, fonts and
  // images are watched by the hook itself.
  const layoutKey = [
    ordered.map((s) => (s.pinned ? `${s.id}*` : s.id)).join(","),
    room.layout,
    room.status,
    room.focused_submission_id,
    room.qr_overlay_visible,
    hideJoinChip,
    board.public_title,
    board.public_subtitle,
    board.appearance.font_scale,
    board.appearance.show_org_logo,
    board.appearance.client_logo_url,
    boardZones(board).map((z) => `${z.id}:${z.title}:${z.subtitle}`).join(","),
  ].join("|");
  const density = useFitDensity(stage, rootRef, layoutKey);
  const gridColumns = `repeat(auto-fill, minmax(min(100%, ${viewer ? TRACK_MIN.viewer : TRACK_MIN.shared}), 1fr))`;
  const cardScale = projector ? baseScale : baseScale * 0.95;
  // Edge padding eases off with the header as the board fills up.
  const stagePad = `calc(clamp(20px, 2.4em, 64px) * ${HEADER_FACTOR})`;
  const cornerLogo = stage && board.appearance.show_org_logo;

  const overlay = statusOverlay(room);

  return (
    // The outer box is the size container the stage unit measures; the inner
    // one is the board itself. A guest's page grows with its content, so it
    // can't be a size container and keeps a fixed base instead.
    <div className={stage ? "ngg-stage" : undefined} style={{ height: viewer ? "auto" : "100%", minHeight: viewer ? "100%" : undefined, width: "100%" }}>
      <div
        ref={rootRef}
        className={stage ? "ngg-stage-type" : undefined}
        style={{
          // The guest view grows with its content and lets the page scroll; the
          // projector and control room stay pinned to the viewport.
          height: viewer ? "auto" : "100%",
          minHeight: viewer ? "100%" : undefined,
          width: "100%",
          fontSize: viewer ? 16 : undefined,
          background: v.background,
          color: textColor,
          fontFamily: "var(--font-sans)",
          display: "flex",
          flexDirection: "column",
          padding: viewer ? "clamp(14px, 4vw, 28px)" : stagePad,
          // Room for the corner logo, which sits in the padding instead of
          // taking a row of its own away from the cards.
          paddingBottom: cornerLogo ? `max(${stagePad}, calc(2.7em * ${HEADER_FACTOR}))` : undefined,
          position: "relative",
          overflow: viewer ? "visible" : "hidden",
          ...(stage ? { "--density": density } : {}),
        } as React.CSSProperties}
      >
        {/* Header */}
        <header style={{ display: "flex", alignItems: "flex-start", gap: viewer ? 12 : "1em", marginBottom: viewer ? "clamp(12px, 2vh, 28px)" : `calc(1.1em * ${HEADER_FACTOR})` }}>
          {board.appearance.client_logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={board.appearance.client_logo_url} alt={t("לוגו לקוח")} style={{ height: viewer ? "clamp(24px, 8vw, 40px)" : `calc(2.6em * ${HEADER_FACTOR})`, background: "rgba(255,255,255,.92)", borderRadius: "var(--radius-md)", padding: viewer ? 6 : "0.3em" }} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: viewer ? `clamp(21px, ${5 * baseScale}vw, ${34 * baseScale}px)` : `calc(${3.1 * baseScale}em * ${HEADER_FACTOR})`, fontWeight: "var(--weight-black)", lineHeight: "var(--leading-tight)", color: textColor }}>
              {board.public_title}
            </h1>
            {board.public_subtitle && (
              <p style={{ fontSize: viewer ? `clamp(13px, ${3.2 * baseScale}vw, ${17 * baseScale}px)` : `calc(${1.4 * baseScale}em * ${HEADER_FACTOR})`, color: subColor, marginTop: viewer ? 6 : "0.25em" }}>
                {board.public_subtitle}
              </p>
            )}
          </div>
          {/* Room state (paused / read-only / suspended) sits in the header, beside
              the title rather than over it, so it never hides the board's name or
              the first row of cards. The guest equivalent is the strip below. */}
          {stage && overlay && !focused && !room.qr_overlay_visible && room.status !== "ended" && (
            <div role="status" style={{ alignSelf: "center", display: "inline-flex", alignItems: "center", gap: "0.5em", flex: "none", background: overlay.bg, color: overlay.fg, padding: "0.55em 1.1em", borderRadius: "var(--radius-pill)", fontSize: "1.05em", fontWeight: "var(--weight-bold)", boxShadow: "var(--shadow-lg)" }}>
              {overlay.icon}
              {overlay.label}
            </div>
          )}
          {/* Persistent join hint — a guest is already in, so it's dropped there.
              Sized off the stage unit so it stays scannable from the back of the
              room on a large screen. */}
          {!hideJoinChip && !viewer && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.3em", flex: "none", background: "rgba(255,255,255,.94)", borderRadius: "var(--radius-lg)", padding: "0.5em 0.6em" }}>
              <QRCodeCanvas value={joinUrl} size={180} displaySize={`calc(5.6em * ${HEADER_FACTOR})`} />
              <div dir="ltr" style={{ fontSize: `calc(1em * ${HEADER_FACTOR})`, fontWeight: "var(--weight-black)", color: "var(--neutral-900)", letterSpacing: ".06em", lineHeight: 1.1 }}>
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

        {/* Content area — the page scrolls in guest mode. On the shared screen and
            in the control room it is fitted (its `em` follows the fit density) and
            scrolls only past the legibility floor. Everything sent is reachable. */}
        <div {...(stage ? FIT_ATTR : {})} style={{ flex: 1, minHeight: 0, overflowY: viewer ? "visible" : "auto", overflowX: viewer ? "visible" : "hidden", fontSize: stage ? "calc(1em * var(--density, 1))" : undefined }}>
          {ordered.length === 0 && !zoned ? (
            <EmptyDisplay joinUrl={joinUrl} roomCode={room.room_code} dark={v.dark} viewer={viewer} />
          ) : zoned ? (
            <ZonedContent zones={boardZones(board)} ordered={ordered} board={board} scale={baseScale} dark={v.dark} facFor={facFor} projector={projector} viewer={viewer} renderFooter={renderFooter} />
          ) : room.layout === "mosaic" ? (
            <div style={{ columnWidth: viewer ? TRACK_MIN.viewer : TRACK_MIN.shared, columnGap: gap }}>
              {ordered.map((s) => (
                <div key={s.id} style={{ marginBottom: gap, breakInside: "avoid" }}>
                  <DisplaySubmission submission={s} board={board} scale={cardScale} facilitator={facFor(s)} footer={renderFooter?.(s)} />
                </div>
              ))}
            </div>
          ) : room.layout === "feed" ? (
            // A feed is one column by definition; on a wide screen it is capped and
            // centered rather than stretched edge to edge. The cap ignores the fit
            // density, so a full feed gets shorter, wider lines rather than a
            // narrower column.
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap, maxWidth: viewer ? undefined : "calc(42em / var(--density, 1))", marginInline: viewer ? undefined : "auto", alignContent: "start" }}>
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
                gap,
                gridAutoRows: "min-content",
                alignContent: "start",
              }}
            >
              {/* A large session in the control room gets the projector's compact
                  cards, so one long answer doesn't make its whole row tall. */}
              {ordered.map((s) => (
                <DisplaySubmission key={s.id} submission={s} board={board} scale={cardScale} facilitator={facFor(s)} footer={renderFooter?.(s)} hug={stage && ordered.length >= WRAP_FROM} dense={stage && ordered.length >= WRAP_FROM} />
              ))}
            </div>
          )}
        </div>

        {/* Org logo. The mark is a square emblem with its wordmark under it, so it
            needs real height to read as a logo rather than a smudge. On the shared
            screen it sits in the bottom padding, on the physical right (clear of
            the control room's drawer handle on the left), instead of a footer row
            that would cost the cards a row. A guest's page keeps it in a footer. */}
        {board.appearance.show_org_logo && (cornerLogo ? (
          <div style={{ position: "absolute", bottom: `calc(0.45em * ${HEADER_FACTOR})`, right: stagePad, background: v.dark ? "rgba(255,255,255,.92)" : "transparent", borderRadius: "var(--radius-md)", padding: v.dark ? "0.12em" : 0, display: "flex" }}>
            <Image src="/brand/ngg-logo.png" alt="NGG" width={96} height={96} style={{ height: `calc(2em * ${HEADER_FACTOR})`, width: "auto" }} />
          </div>
        ) : (
          <footer style={{ display: "flex", alignItems: "center", gap: 14, marginTop: "clamp(10px, 1.6vh, 20px)" }}>
            <div style={{ background: v.dark ? "rgba(255,255,255,.92)" : "transparent", borderRadius: "var(--radius-md)", padding: v.dark ? 3 : 0, display: "flex" }}>
              <Image src="/brand/ngg-logo.png" alt="NGG" width={96} height={96} style={{ height: 34, width: "auto" }} />
            </div>
          </footer>
        ))}

        {/* Focus mode overlay — projector/control room only. A guest keeps their
            own place in the board instead of having the facilitator's highlight
            fill their screen; the focused card is still there in the list. */}
        {focused && !viewer && (
          <div
            onClick={facilitator ? () => facilitator.onFocus(focused.id) : undefined}
            title={facilitator ? t("לחצו להסרה מהמסך") : undefined}
            // Near-opaque with a blur: the wall behind is context, not content, and
            // cards showing through at full contrast fight the focused one.
            style={{ position: "absolute", inset: 0, background: v.dark ? "rgba(8,8,16,.9)" : "rgba(246,246,248,.92)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "3em", zIndex: 40, cursor: facilitator ? "zoom-out" : "default" }}
          >
            <div style={{ width: "min(58em, 100%)", maxHeight: "100%", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
              <DisplaySubmission submission={focused} board={board} scale={baseScale} focus />
            </div>
          </div>
        )}

        {/* QR overlay (facilitator-triggered) — a guest has already joined. */}
        {room.qr_overlay_visible && !focused && !viewer && (
          // Opaque: the code has to scan from across a room, and cards showing
          // through behind the room code and link made both hard to read.
          <div className="theme-dark" style={{ position: "absolute", inset: 0, background: "rgba(8,8,16,.97)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1.2em", zIndex: 50, color: "#fff", padding: "1.5em" }}>
            <div style={{ fontSize: "2.4em", fontWeight: "var(--weight-black)", lineHeight: "var(--leading-tight)" }}>{t("הצטרפו למפגש")}</div>
            <div style={{ background: "#fff", padding: "0.9em", borderRadius: "var(--radius-2xl)" }}>
              <QRCodeCanvas value={joinUrl} size={480} displaySize="min(21em, 48vh)" />
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.3em" }}>
              <div dir="ltr" style={{ fontSize: "3em", fontWeight: "var(--weight-black)", letterSpacing: ".08em", lineHeight: 1.1 }}>{formatRoomCode(room.room_code)}</div>
              <div dir="ltr" style={{ fontSize: "1.1em", color: "var(--neutral-400)" }}>{joinUrl.replace(/^https?:\/\//, "")}</div>
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
    </div>
  );
}

/**
 * Past this many cards the wall stops composing fixed rows and wraps instead,
 * so the number of cards per row follows the fit density: as the session grows
 * the cards shrink and each row takes more of them, rather than the wall only
 * growing taller.
 */
const WRAP_FROM = 13;

/** Preferred item count in the widest row of the balanced projector wall. */
function balancedColumns(n: number): number {
  if (n <= 3) return Math.max(n, 1);
  if (n <= 8) return Math.min(Math.ceil(n / 2), 4);
  if (n <= 12) return 4;
  return 5;
}

/**
 * Ideal card width in `em` of the stage unit, sized to what the content
 * warrants and capped well below the width of the screen — a single submission
 * should read as a card on the board, not as a poster filling it.
 */
function idealCardWidth(s: Submission, dense = false): number {
  if (s.type !== "text" && s.media_url) return dense ? 17 : 21;
  const len = s.text_content?.length ?? 0;
  return len <= 45 ? 15 : len <= 130 ? 19 : 23;
}

/**
 * Shared-screen wall: a balanced, centered composition instead of a stretched
 * grid. Items split into rows whose sizes differ by at most one (a shorter
 * last row sits centered), the block is centered on the screen, and each card
 * takes only the width/height its content warrants — a short quote stays
 * compact, media keeps a consistent frame, nothing balloons to fill a track.
 * A large session wraps into as many cards per row as the screen takes (see
 * WRAP_FROM), with long answers clamped shorter; the facilitator can focus any
 * card to read it in full.
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
  const gap = "1em";
  if (n >= WRAP_FROM) {
    return (
      // Cards in a row share its height (stretch), so a full wall reads as tidy
      // rows instead of a staggered line of different heights.
      <div style={{ minHeight: "100%", display: "flex", flexWrap: "wrap", justifyContent: "center", alignContent: "center", alignItems: "stretch", gap }}>
        {items.map((s) => (
          <div key={s.id} style={{ flex: `0 1 ${idealCardWidth(s, true)}em`, minWidth: 0, display: "flex", justifyContent: "center" }}>
            <DisplaySubmission submission={s} board={board} scale={scale} facilitator={facFor(s)} hug dense />
          </div>
        ))}
      </div>
    );
  }
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
  return (
    // minHeight rather than height: the composition centres itself on a
    // half-empty board, and can still grow past the screen — scrolled, not
    // truncated — if a session is too large for the fit to keep on one screen.
    <div style={{ minHeight: "100%", display: "flex", flexDirection: "column", justifyContent: "center", gap }}>
      {rows.map((row, ri) => (
        <div key={ri} style={{ display: "flex", justifyContent: "center", alignItems: "center", gap, minHeight: 0 }}>
          {row.map((s) => (
            <div key={s.id} style={{ flex: `0 1 ${idealCardWidth(s)}em`, minWidth: 0, display: "flex", justifyContent: "center" }}>
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
  // No extra shrink for zones on the shared screen: the fit sizes every card
  // there, and shrinking zones on top of it pushed their text under the floor.
  const zoneScale = scale;

  return (
    // An explicit 100% row (rather than the default content-sized one) is what
    // keeps each column bounded by the screen — without it the columns simply
    // grow to their tallest zone and the inner scrollers never engage.
    <div style={{ display: "grid", gridTemplateColumns: viewer ? "1fr" : `repeat(${zones.length}, 1fr)`, gridTemplateRows: viewer ? undefined : "100%", gap: viewer ? 26 : "1.2em", height: viewer ? undefined : "100%" }}>
      {zones.map((z, i) => {
        const items = byZone.get(z.id) ?? [];
        return (
          <div key={z.id} style={{ display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, height: viewer ? undefined : "100%", borderInlineStart: !viewer && i > 0 ? `1px solid ${divider}` : "none", paddingInlineStart: !viewer && i > 0 ? "0.8em" : 0 }}>
            <div style={{ flex: "none", paddingBottom: 10, marginBottom: 10, borderBottom: `2px solid ${divider}` }}>
              {/* Zone titles are headings, not content: on the shared screen they
                  ease off with the page header rather than shrinking with the cards
                  (dividing by the density undoes the content area's scaling). */}
              <div style={{ fontSize: viewer ? `clamp(16px, ${4 * scale}vw, ${22 * scale}px)` : `calc(${1.35 * scale}em * ${HEADER_FACTOR} / var(--density, 1))`, fontWeight: "var(--weight-black)", color: headerColor, lineHeight: "var(--leading-tight)" }}>
                {z.title || t("אזור {number}", { number: i + 1 })}
              </div>
              {z.subtitle && <div style={{ fontSize: viewer ? `clamp(12px, ${3 * scale}vw, ${15 * scale}px)` : `calc(${0.85 * scale}em * ${HEADER_FACTOR} / var(--density, 1))`, color: subColor, marginTop: 2 }}>{z.subtitle}</div>}
            </div>
            {/* Each zone column is fitted with the rest of the board, and on the
                shared screen its cards wrap into more columns as they shrink, so a
                busy zone stays on screen. Past the legibility floor it scrolls on
                its own rather than pushing the quieter zones off the screen. */}
            <div
              {...(viewer ? {} : FIT_ATTR)}
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: viewer ? "visible" : "auto",
                overflowX: viewer ? "visible" : "hidden",
                ...(viewer
                  ? { display: "flex", flexDirection: "column", gap: "clamp(10px, 1vw, 16px)" }
                  : { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 16em), 1fr))", gap: "0.8em", alignContent: "start", alignItems: "start" }),
              }}
            >
              {items.length === 0 ? (
                <div style={{ color: subColor, fontSize: viewer ? `clamp(12px, 1vw, ${16 * scale}px)` : `${0.85 * scale}em`, opacity: 0.7, paddingTop: 8, gridColumn: "1 / -1" }}>{t("עדיין אין תוכן באזור זה")}</div>
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
  // Icons sized in `em` so they match the pill they sit in on every surface.
  const icon = { width: "1.2em", height: "1.2em" };
  if (room.status === "paused") return { label: translate("קבלת התוכן מושהית"), icon: <IconPause style={icon} />, bg: "var(--warning)", fg: "#fff" };
  if (room.status === "read_only") return { label: translate("מצב קריאה בלבד"), icon: <IconLock style={icon} />, bg: "var(--info)", fg: "#fff" };
  if (room.status === "suspended") return { label: translate("החדר הושהה זמנית"), icon: <IconClock style={icon} />, bg: "var(--warning)", fg: "#fff" };
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
    <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1.3em" }}>
      <div style={{ fontSize: "1.7em", fontWeight: "var(--weight-extrabold)", color: dark ? "#fff" : "var(--neutral-900)", textAlign: "center", lineHeight: "var(--leading-tight)" }}>
        {t("סרקו את הקוד כדי להצטרף ולשלוח את התוכן הראשון")}
      </div>
      <div style={{ background: "#fff", padding: "1.1em", borderRadius: "var(--radius-2xl)", boxShadow: "var(--shadow-xl)", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5em" }}>
        <QRCodeCanvas value={joinUrl} size={400} displaySize="min(13em, 38vh)" />
        <div dir="ltr" style={{ fontSize: "1.9em", fontWeight: "var(--weight-black)", color: "var(--neutral-900)", letterSpacing: ".08em", lineHeight: 1.1 }}>{formatRoomCode(roomCode)}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: dark ? "rgba(255,255,255,.8)" : "var(--neutral-700)", fontSize: "1.1em" }}>
        <LiveDot light={dark} />
        {t("ממתין למשתתפים…")}
      </div>
    </div>
  );
}
