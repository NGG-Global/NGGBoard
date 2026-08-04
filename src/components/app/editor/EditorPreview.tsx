"use client";

import Image from "next/image";
import type { BoardAppearance, BoardParticipationSettings, BoardSeedPost, DisplayLayout } from "@/lib/types";
import { themeVisual } from "@/lib/board-visuals";
import { usableSeedPosts } from "@/lib/posts";
import { parseYouTubeVideoId, youTubeThumbnailUrl } from "@/lib/youtube";
import { IconImage, IconPlay } from "@/components/ui/icons";
import { useI18n } from "@/lib/i18n/react";

interface PreviewProps {
  title: string;
  subtitle: string;
  appearance: BoardAppearance;
  participation: BoardParticipationSettings;
  layout: DisplayLayout;
  /** The board's opening content, so the preview shows the real thing. */
  seedPosts?: BoardSeedPost[];
}

/** Live 16:9 preview of the shared display, updated as the editor changes. */
export function EditorPreview({ title, subtitle, appearance, participation, seedPosts }: PreviewProps) {
  const { t } = useI18n();
  const v = themeVisual(appearance);
  const textColor = v.dark ? "#ffffff" : "var(--neutral-950)";
  const subColor = v.dark ? "rgba(255,255,255,.78)" : "var(--neutral-700)";
  const opening = usableSeedPosts(seedPosts);
  const names = participation.anonymous_allowed
    ? [t("אנונימי"), t("אנונימי"), t("אנונימי")]
    : [t("נועה ברק"), t("יואב לוי"), t("מיכל אדר")];

  return (
    <div
      style={{
        aspectRatio: "16 / 9",
        borderRadius: "var(--radius-2xl)",
        background: v.background,
        border: "1px solid var(--border)",
        boxShadow: "0 8px 30px rgba(8,8,16,.10)",
        position: "relative",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        padding: "4.5%",
      }}
    >
      {/* Top row: client logo + join QR chip */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {appearance.client_logo_url && (
          <div
            style={{
              background: "rgba(255,255,255,.92)",
              borderRadius: "var(--radius-md)",
              padding: "5px 12px",
              fontSize: "var(--text-2xs)",
              fontWeight: "var(--weight-bold)",
              color: "var(--neutral-700)",
            }}
          >
            {t("לוגו לקוח")}
          </div>
        )}
        <div style={{ flex: 1 }} />
        <div
          style={{
            background: "rgba(255,255,255,.94)",
            borderRadius: "var(--radius-lg)",
            padding: 6,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 3,
          }}
        >
          <svg width="30" height="30" viewBox="0 0 24 24" fill="var(--ink-800)">
            <rect x="2" y="2" width="7" height="7" />
            <rect x="15" y="2" width="7" height="7" />
            <rect x="2" y="15" width="7" height="7" />
            <rect x="12" y="12" width="3" height="3" />
            <rect x="17" y="13" width="2" height="2" />
            <rect x="13" y="17" width="2" height="2" />
            <rect x="18" y="18" width="3" height="3" />
          </svg>
          <div style={{ fontSize: 8, fontWeight: "var(--weight-bold)", color: "var(--neutral-700)" }}>{t("הצטרפו")}</div>
        </div>
      </div>

      {/* Title block */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 6 }}>
        <div style={{ fontSize: "clamp(18px,2.6vw,34px)", fontWeight: "var(--weight-black)", color: textColor, lineHeight: "var(--leading-tight)" }}>
          {title || t("כותרת הלוח תופיע כאן")}
        </div>
        <div style={{ fontSize: "clamp(11px,1.3vw,16px)", color: subColor }}>
          {subtitle || t("ההנחיה למשתתפים תופיע כאן")}
        </div>
      </div>

      {/* Cards: the board's real opening content when it has any, otherwise a
          sample of what participant answers will look like. */}
      <div style={{ display: "flex", gap: "2.5%", alignItems: "stretch" }}>
        {opening.length > 0 ? (
          opening.slice(0, 3).map((post) => <SeedPreviewCard key={post.id} post={post} facilitatorLabel={t("מנחה")} />)
        ) : (
          <>
        <PreviewCard name={names[0]!} text={t("שילוב סימולציות בכל מפגש למידה")} />
        <PreviewCard name={names[1]!} text={t("שקיפות מלאה מול הלקוח")} />
        {participation.allow_image && (
          <div style={{ flex: 1, background: "rgba(255,255,255,.95)", borderRadius: "var(--radius-lg)", padding: "2%", display: "flex", flexDirection: "column", gap: 4, boxShadow: "0 2px 8px rgba(8,8,16,.10)" }}>
            <div style={{ flex: 1, minHeight: 34, borderRadius: "var(--radius-md)", background: "var(--gradient-magenta-soft)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--magenta-700)" }}>
              <IconImage size={16} />
            </div>
            <div style={{ fontSize: "clamp(8px,.9vw,11px)", fontWeight: "var(--weight-bold)", color: "var(--neutral-950)" }}>{names[2]}</div>
          </div>
        )}
          </>
        )}
      </div>

      {appearance.show_org_logo && (
        <div style={{ position: "absolute", bottom: "3.5%", insetInlineStart: "4.5%", background: "rgba(255,255,255,.9)", borderRadius: "var(--radius-md)", padding: "4px 8px" }}>
          <Image src="/brand/ngg-logo.png" alt="NGG" width={40} height={12} style={{ height: 12, width: "auto" }} />
        </div>
      )}
    </div>
  );
}

/** One of the board's own opening posts, as it will appear on the wall. */
function SeedPreviewCard({ post, facilitatorLabel }: { post: BoardSeedPost; facilitatorLabel: string }) {
  const videoId = post.type === "video" && post.media_url ? parseYouTubeVideoId(post.media_url) : null;
  return (
    <div style={{ flex: 1, minWidth: 0, background: "rgba(255,255,255,.95)", borderRadius: "var(--radius-lg)", padding: "3% 3.5%", display: "flex", flexDirection: "column", gap: 5, boxShadow: "0 2px 8px rgba(8,8,16,.10)", border: post.pinned ? "1.5px solid var(--magenta-400)" : undefined }}>
      {post.type === "image" && post.media_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={post.media_url} alt="" style={{ width: "100%", height: 40, objectFit: "cover", borderRadius: "var(--radius-md)" }} />
      )}
      {videoId && (
        <div style={{ position: "relative", width: "100%", height: 40, borderRadius: "var(--radius-md)", overflow: "hidden", background: "#08080f" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={youTubeThumbnailUrl(videoId)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.9 }} />
          <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
            <IconPlay size={14} />
          </span>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ fontSize: "clamp(7px,.8vw,10px)", fontWeight: "var(--weight-bold)", color: "var(--magenta-700)", background: "var(--magenta-50)", padding: "1px 6px", borderRadius: "var(--radius-pill)" }}>{facilitatorLabel}</span>
      </div>
      {post.text.trim() && (
        <div style={{ fontSize: "clamp(8px,.95vw,12px)", color: "var(--neutral-800)", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {post.text}
        </div>
      )}
    </div>
  );
}

function PreviewCard({ name, text }: { name: string; text: string }) {
  return (
    <div style={{ flex: 1, background: "rgba(255,255,255,.95)", borderRadius: "var(--radius-lg)", padding: "3% 3.5%", display: "flex", flexDirection: "column", gap: 5, boxShadow: "0 2px 8px rgba(8,8,16,.10)" }}>
      <div style={{ fontSize: "clamp(8px,.9vw,11px)", fontWeight: "var(--weight-bold)", color: "var(--neutral-950)" }}>{name}</div>
      <div style={{ fontSize: "clamp(8px,.95vw,12px)", color: "var(--neutral-700)", lineHeight: 1.4 }}>{text}</div>
    </div>
  );
}
