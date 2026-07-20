"use client";

import React, { useId } from "react";

export interface SwitchProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function Switch({ label, description, checked, onChange, disabled }: SwitchProps) {
  const id = useId();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <label
        htmlFor={id}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.55 : 1,
        }}
      >
        <button
          id={id}
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={label}
          disabled={disabled}
          onClick={() => !disabled && onChange(!checked)}
          className="ngg-focusable"
          style={{
            flex: "none",
            width: 40,
            height: 24,
            borderRadius: "var(--radius-pill)",
            border: "none",
            background: checked ? "var(--accent)" : "var(--border-strong)",
            position: "relative",
            cursor: disabled ? "not-allowed" : "pointer",
            transition: "var(--transition-colors)",
            padding: 0,
          }}
        >
          <span
            style={{
              position: "absolute",
              top: 3,
              insetInlineStart: checked ? 19 : 3,
              width: 18,
              height: 18,
              borderRadius: "50%",
              background: "#fff",
              boxShadow: "var(--shadow-sm)",
              transition: "inset-inline-start var(--dur) var(--ease-out)",
            }}
          />
        </button>
        <span style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)", color: "var(--text)" }}>{label}</span>
      </label>
      {description && (
        <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-subtle)", paddingInlineStart: 50 }}>{description}</span>
      )}
    </div>
  );
}

export interface RadioProps {
  name: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: () => void;
}

export function Radio({ name, label, description, checked, onChange }: RadioProps) {
  const id = useId();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <label htmlFor={id} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
        <input
          id={id}
          type="radio"
          name={name}
          checked={checked}
          onChange={onChange}
          className="ngg-focusable"
          style={{ accentColor: "var(--accent)", width: 16, height: 16, flex: "none", cursor: "pointer" }}
        />
        <span style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)", color: "var(--text)" }}>{label}</span>
      </label>
      {description && (
        <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-subtle)", paddingInlineStart: 26 }}>{description}</span>
      )}
    </div>
  );
}
