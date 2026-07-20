"use client";

import Image from "next/image";
import type { BoardAppearance, BoardParticipationSettings, DisplayLayout } from "@/lib/types";
import { themeVisual } from "@/lib/board-visuals";
import { IconImage } from "@/components/ui/icons";

interface PreviewProps {
  title: string;
  subtitle: string;
  appearance: BoardAppearance;
  participation: BoardParticipationSettings;
  layout: DisplayLayout;
}

/** Live 16:9 preview of the shared display, updated as the editor changes. */
export function EditorPreview({ title, subtitle, appearance, participation }: PreviewProps) {
  const v = themeVisual(appearance);
  const textColor = v.dark ? "#ffffff" : "var(--neutral-950)";
  const subColor = v.dark ? "rgba(255,255,255,.78)" : "var(--neutral-700)";
  const names = participation.anonymous_allowed
    ? ["אנונימי", "אנונימי", "אנונימי"]
    : ["נועה ברק", "יואב לוי", "מיכל אדר"];

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
            לוגו לקוח
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
          <div style={{ fontSize: 8, fontWeight: "var(--weight-bold)", color: "var(--neutral-700)" }}>הצטרפו</div>
        </div>
      </div>

      {/* Title block */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 6 }}>
        <div style={{ fontSize: "clamp(18px,2.6vw,34px)", fontWeight: "var(--weight-black)", color: textColor, lineHeight: "var(--leading-tight)" }}>
          {title || "כותרת הלוח תופיע כאן"}
        </div>
        <div style={{ fontSize: "clamp(11px,1.3vw,16px)", color: subColor }}>
          {subtitle || "ההנחיה למשתתפים תופיע כאן"}
        </div>
      </div>

      {/* Sample cards */}
      <div style={{ display: "flex", gap: "2.5%", alignItems: "stretch" }}>
        <PreviewCard name={names[0]!} text="שילוב סימולציות בכל מפגש למידה" />
        <PreviewCard name={names[1]!} text="שקיפות מלאה מול הלקוח" />
        {participation.allow_image && (
          <div style={{ flex: 1, background: "rgba(255,255,255,.95)", borderRadius: "var(--radius-lg)", padding: "2%", display: "flex", flexDirection: "column", gap: 4, boxShadow: "0 2px 8px rgba(8,8,16,.10)" }}>
            <div style={{ flex: 1, minHeight: 34, borderRadius: "var(--radius-md)", background: "var(--gradient-magenta-soft)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--magenta-700)" }}>
              <IconImage size={16} />
            </div>
            <div style={{ fontSize: "clamp(8px,.9vw,11px)", fontWeight: "var(--weight-bold)", color: "var(--neutral-950)" }}>{names[2]}</div>
          </div>
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

function PreviewCard({ name, text }: { name: string; text: string }) {
  return (
    <div style={{ flex: 1, background: "rgba(255,255,255,.95)", borderRadius: "var(--radius-lg)", padding: "3% 3.5%", display: "flex", flexDirection: "column", gap: 5, boxShadow: "0 2px 8px rgba(8,8,16,.10)" }}>
      <div style={{ fontSize: "clamp(8px,.9vw,11px)", fontWeight: "var(--weight-bold)", color: "var(--neutral-950)" }}>{name}</div>
      <div style={{ fontSize: "clamp(8px,.95vw,12px)", color: "var(--neutral-700)", lineHeight: 1.4 }}>{text}</div>
    </div>
  );
}
