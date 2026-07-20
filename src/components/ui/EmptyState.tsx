"use client";

import React from "react";

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  dashed?: boolean;
  compact?: boolean;
}

export function EmptyState({ icon, title, description, action, dashed = true, compact }: EmptyStateProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
        padding: compact ? "48px 20px" : "72px 20px",
        textAlign: "center",
        background: "var(--surface)",
        border: dashed ? "1px dashed var(--border-strong)" : "1px solid var(--border)",
        borderRadius: "var(--radius-2xl)",
        color: "var(--text-subtle)",
      }}
    >
      {icon && <div style={{ opacity: 0.5, color: "var(--text-muted)" }}>{icon}</div>}
      <div style={{ fontSize: "var(--text-md)", fontWeight: "var(--weight-bold)", color: "var(--text-muted)" }}>{title}</div>
      {description && <div style={{ fontSize: "var(--text-sm)", maxWidth: 420 }}>{description}</div>}
      {action && <div style={{ marginTop: 6 }}>{action}</div>}
    </div>
  );
}
