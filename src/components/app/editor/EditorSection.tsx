"use client";

import React from "react";

export function EditorSection({
  index,
  title,
  summary,
  open,
  onToggle,
  error,
  children,
}: {
  index: number;
  title: string;
  summary?: string;
  open: boolean;
  onToggle: () => void;
  error?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={{ border: `1px solid ${error ? "var(--danger)" : "var(--border)"}`, borderRadius: "var(--radius-xl)", overflow: "hidden" }}>
      <button
        onClick={onToggle}
        aria-expanded={open}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 10,
          border: "none",
          background: "transparent",
          padding: "13px 14px",
          cursor: "pointer",
          textAlign: "start",
        }}
      >
        <span
          style={{
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: "var(--accent-soft)",
            color: "var(--accent-text)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "var(--text-2xs)",
            fontWeight: "var(--weight-extrabold)",
            flex: "none",
          }}
        >
          {index}
        </span>
        <span style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-bold)" }}>{title}</span>
        <span style={{ flex: 1 }} />
        {summary && (
          <span
            style={{
              fontSize: "var(--text-2xs)",
              color: "var(--text-subtle)",
              maxWidth: 140,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {summary}
          </span>
        )}
      </button>
      {open && <div style={{ padding: "2px 14px 16px", display: "flex", flexDirection: "column", gap: 14 }}>{children}</div>}
    </div>
  );
}
