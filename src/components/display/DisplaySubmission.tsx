"use client";

import type { Board, Submission } from "@/lib/types";
import { useI18n } from "@/lib/i18n/react";
import { initialFor } from "@/lib/utils";
import { isSeedImage, seedGradientFor } from "@/lib/board-visuals";
import { isGiphyMediaUrl } from "@/lib/giphy";
import { isFacilitatorPost } from "@/lib/posts";
import { parseYouTubeVideoId, youTubeEmbedUrl, youTubeThumbnailUrl } from "@/lib/youtube";
import { IconEyeOff, IconMonitor, IconPin, IconPlay, IconTrash } from "@/components/ui/icons";

export interface FacilitatorCardActions {
  focused: boolean;
  onFocus: () => void;
  onPin: () => void;
  onHide: () => void;
  onDelete: () => void;
}

const AVATAR_PALETTE = [
  ["var(--magenta-100)", "var(--magenta-800)"],
  ["var(--info-50)", "var(--info-600)"],
  ["var(--success-50)", "var(--success-600)"],
  ["var(--neutral-100)", "var(--neutral-800)"],
  ["var(--warning-50)", "var(--warning-600)"],
];

function avatarColors(seed: string): [string, string] {
  const n = seed.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_PALETTE[n % AVATAR_PALETTE.length] as [string, string];
}

interface Props {
  submission: Submission;
  board: Board;
  scale: number;
  focus?: boolean;
  facilitator?: FacilitatorCardActions;
  /**
   * Content-hugging mode (balanced projector wall): the card takes the height
   * its content needs instead of stretching to fill a grid track, media gets a
   * consistent aspect ratio, and long texts clamp instead of growing the card.
   */
  hug?: boolean;
  /** Tighter hug variant for pages with 4+ rows so the composition still fits one screen. */
  dense?: boolean;
  /**
   * Extra content below the card body — used for the reply thread in the guest
   * board view. A slot rather than a comments prop, so this component (and the
   * projector that shares it) stays unaware that comments exist.
   */
  footer?: React.ReactNode;
}

/** A single submission rendered for the projector — large, high-contrast. */
export function DisplaySubmission({ submission, board, scale, focus, facilitator, hug, dense, footer }: Props) {
  const { t } = useI18n();
  // A facilitator's own post is always attributed to her: the board's
  // identity-hiding setting protects participants, and labelling the
  // facilitator's guidance "אנונימי" would read as a stray participant answer.
  const byFacilitator = isFacilitatorPost(submission);
  const hideIdentity = board.moderation.hide_identity_on_display && !byFacilitator;
  const anonymous = !byFacilitator && (submission.anonymous || hideIdentity || !submission.display_name);
  const name = anonymous ? t("אנונימי") : submission.display_name || t("המנחה");
  const [avBg, avFg] = byFacilitator
    ? ["var(--accent)", "#ffffff"]
    : anonymous
      ? ["var(--neutral-100)", "var(--neutral-600)"]
      : avatarColors(submission.id);

  // Long answers read better a step smaller; short quotes can carry more size.
  const textLen = submission.text_content?.length ?? 0;
  const lenFactor = focus ? 1 : textLen > 220 ? 0.78 : textLen > 120 ? 0.88 : textLen > 60 ? 1 : 1.12;

  const nameSize = `${(focus ? 1.6 : 1) * scale}rem`;
  const textSize = `${(focus ? 3 : 1.35) * scale * lenFactor}rem`;
  const hasMedia = submission.type !== "text" && !!submission.media_url;
  // Mindful containers: clamp text so one verbose answer can't dominate the
  // composition — tighter when it captions media, roomier when text-only.
  const clampLines = hug && !focus ? (hasMedia ? (dense ? 2 : 3) : dense ? 4 : 9) : undefined;
  const mediaMaxHeight = dense ? "min(22vh, 300px)" : "min(34vh, 380px)";

  return (
    <div
      className={facilitator ? "ngg-card-in ngg-fac-card" : "ngg-card-in"}
      style={{
        background: "#ffffff",
        borderRadius: "var(--radius-2xl)",
        padding: focus ? "clamp(28px, 4vw, 56px)" : "clamp(16px, 1.6vw, 26px)",
        display: "flex",
        flexDirection: "column",
        gap: focus ? 20 : 12,
        boxShadow: focus ? "0 30px 80px rgba(8,8,16,.35)" : "0 4px 16px rgba(8,8,16,.14)",
        border: submission.pinned ? "2px solid var(--magenta-400)" : "1px solid rgba(8,8,16,.06)",
        height: hug ? "auto" : "100%",
        width: "100%",
        breakInside: "avoid",
      }}
    >
      {facilitator && !focus && (
        <div
          className="ngg-fac-actions"
          style={{ position: "absolute", top: 8, insetInlineStart: 8, display: "flex", gap: 6, zIndex: 5 }}
        >
          <button className="ngg-fac-btn" data-active={facilitator.focused} onClick={facilitator.onFocus} title={facilitator.focused ? t("הסר מהמסך") : t("הצג במרכז")} aria-label={t("הצג במרכז")}>
            <IconMonitor size={16} />
          </button>
          <button className="ngg-fac-btn" data-active={submission.pinned} onClick={facilitator.onPin} title={submission.pinned ? t("בטל הצמדה") : t("הצמד")} aria-label={t("הצמד")}>
            <IconPin size={16} />
          </button>
          <button className="ngg-fac-btn" onClick={facilitator.onHide} title={t("הסתר")} aria-label={t("הסתר")}>
            <IconEyeOff size={16} />
          </button>
          <button className="ngg-fac-btn" data-danger="true" onClick={facilitator.onDelete} title={t("מחק")} aria-label={t("מחק")}>
            <IconTrash size={16} />
          </button>
        </div>
      )}
      {submission.type === "image" && submission.media_url && (
        <div
          style={{
            borderRadius: "var(--radius-lg)",
            overflow: "hidden",
            minHeight: hug ? undefined : focus ? 220 : 120,
            aspectRatio: hug ? "4 / 3" : undefined,
            maxHeight: hug ? mediaMaxHeight : undefined,
            flex: submission.text_content || hug ? "none" : 1,
            background: isSeedImage(submission.media_url) ? seedGradientFor(submission.media_url) : undefined,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {!isSeedImage(submission.media_url) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={submission.media_url} alt={submission.text_content ?? t("תמונה ששלח משתתף")} style={{ width: "100%", height: "100%", objectFit: isGiphyMediaUrl(submission.media_url) ? "contain" : "cover" }} />
          )}
        </div>
      )}

      {submission.type === "video" && submission.media_url && (
        <VideoMedia mediaUrl={submission.media_url} focus={!!focus} hasCaption={!!submission.text_content} hug={hug} maxHeight={mediaMaxHeight} />
      )}

      {submission.text_content && (
        <div
          style={{
            fontSize: textSize,
            fontWeight: "var(--weight-bold)",
            color: "var(--neutral-950)",
            lineHeight: "var(--leading-snug)",
            overflowWrap: "break-word",
            ...(clampLines
              ? { display: "-webkit-box", WebkitLineClamp: clampLines, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }
              : {}),
          }}
        >
          {submission.text_content}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: "auto" }}>
        <span
          style={{
            width: focus ? 44 : 30,
            height: focus ? 44 : 30,
            borderRadius: "50%",
            background: avBg,
            color: avFg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: "var(--weight-extrabold)",
            fontSize: nameSize,
            flex: "none",
          }}
        >
          {initialFor(anonymous ? null : submission.display_name, anonymous)}
        </span>
        <span style={{ fontSize: nameSize, fontWeight: "var(--weight-bold)", color: "var(--neutral-700)" }}>{name}</span>
        {byFacilitator && (
          <span style={{ fontSize: `${0.7 * scale}rem`, fontWeight: "var(--weight-bold)", color: "var(--accent-text)", background: "var(--accent-soft)", padding: "2px 8px", borderRadius: "var(--radius-pill)", flex: "none" }}>
            {t("מנחה")}
          </span>
        )}
        {submission.pinned && (
          <span style={{ marginInlineStart: "auto", fontSize: `${0.75 * scale}rem`, fontWeight: "var(--weight-bold)", color: "var(--magenta-600)", background: "var(--magenta-50)", padding: "2px 10px", borderRadius: "var(--radius-pill)" }}>
            {t("מוצמד")}
          </span>
        )}
      </div>

      {footer}
    </div>
  );
}

/**
 * Video media block. On the wall it stays a lightweight thumbnail (a grid of
 * live iframes would crawl and be unwatchable anyway); when the facilitator
 * focuses the submission it becomes a real embedded player. The embed URL is
 * built from the PARSED video id — never from the raw stored URL.
 */
function VideoMedia({ mediaUrl, focus, hasCaption, hug, maxHeight }: { mediaUrl: string; focus: boolean; hasCaption: boolean; hug?: boolean; maxHeight?: string }) {
  const { t } = useI18n();
  const videoId = parseYouTubeVideoId(mediaUrl);
  if (!videoId) return null;
  const frame: React.CSSProperties = {
    position: "relative",
    borderRadius: "var(--radius-lg)",
    overflow: "hidden",
    minHeight: hug ? undefined : focus ? 220 : 120,
    aspectRatio: hug && !focus ? "16 / 9" : undefined,
    maxHeight: hug && !focus ? maxHeight : undefined,
    flex: hasCaption || hug ? "none" : 1,
    background: "#08080f",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };
  if (focus) {
    return (
      <div style={{ ...frame, aspectRatio: "16 / 9" }}>
        <iframe
          src={youTubeEmbedUrl(videoId, { autoplay: true })}
          title={t("סרטון ששלח משתתף")}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          style={{ width: "100%", height: "100%", border: 0, display: "block" }}
        />
      </div>
    );
  }
  return (
    <div style={frame}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={youTubeThumbnailUrl(videoId)} alt={t("סרטון ששלח משתתף")} style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.92 }} />
      <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", background: "rgba(8,8,16,.28)" }}>
        <IconPlay size={40} />
      </span>
    </div>
  );
}

export { avatarColors };
