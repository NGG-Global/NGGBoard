"use client";

import React from "react";
import { useI18n } from "@/lib/i18n/react";

export function Spinner({ size = 20, color = "var(--accent)" }: { size?: number; color?: string }) {
  const { t } = useI18n();
  return (
    <span
      role="status"
      aria-label={t("טוען")}
      style={{
        display: "inline-block",
        width: size,
        height: size,
        border: `${Math.max(2, size / 10)}px solid var(--border)`,
        borderTopColor: color,
        borderRadius: "50%",
        animation: "ngg-spin 0.7s linear infinite",
      }}
    />
  );
}

export function LiveDot({ light }: { light?: boolean }) {
  return (
    <span
      className={light ? "ngg-pulse-dot-light" : "ngg-pulse-dot"}
      style={{ width: 8, height: 8, borderRadius: "50%", background: light ? "#fff" : "var(--accent)", flex: "none" }}
    />
  );
}
