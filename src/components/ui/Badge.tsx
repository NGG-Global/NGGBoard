"use client";

import React from "react";

export type BadgeColor = "neutral" | "accent" | "success" | "warning" | "danger" | "info";
type BadgeVariant = "soft" | "outline" | "solid";
type BadgeSize = "sm" | "md";

export interface BadgeProps {
  color?: BadgeColor;
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
  pulseDot?: boolean;
  children: React.ReactNode;
}

const colorVar: Record<BadgeColor, { fg: string; bg: string; border: string; solid: string }> = {
  neutral: { fg: "var(--text-muted)", bg: "var(--bg-muted)", border: "var(--border-strong)", solid: "var(--neutral-700)" },
  accent: { fg: "var(--accent-text)", bg: "var(--accent-soft)", border: "var(--accent-border)", solid: "var(--accent)" },
  success: { fg: "var(--success)", bg: "var(--success-bg)", border: "var(--success)", solid: "var(--success)" },
  warning: { fg: "var(--warning)", bg: "var(--warning-bg)", border: "var(--warning)", solid: "var(--warning)" },
  danger: { fg: "var(--danger)", bg: "var(--danger-bg)", border: "var(--danger)", solid: "var(--danger)" },
  info: { fg: "var(--info)", bg: "var(--info-bg)", border: "var(--info)", solid: "var(--info)" },
};

export function Badge({ color = "neutral", variant = "soft", size = "sm", dot, pulseDot, children }: BadgeProps) {
  const c = colorVar[color];
  const solid = variant === "solid";
  const outline = variant === "outline";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        height: size === "sm" ? 20 : 24,
        padding: size === "sm" ? "0 9px" : "0 11px",
        borderRadius: "var(--radius-pill)",
        fontSize: size === "sm" ? "var(--text-2xs)" : "var(--text-xs)",
        fontWeight: "var(--weight-bold)",
        lineHeight: 1,
        color: solid ? "#fff" : c.fg,
        background: solid ? c.solid : outline ? "transparent" : c.bg,
        border: outline ? `1px solid ${c.border}` : "1px solid transparent",
        whiteSpace: "nowrap",
      }}
    >
      {dot && (
        <span
          className={pulseDot ? "ngg-pulse-dot-light" : undefined}
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: solid ? "#fff" : c.solid,
            flex: "none",
          }}
        />
      )}
      {children}
    </span>
  );
}
