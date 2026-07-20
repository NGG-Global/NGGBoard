"use client";

import React, { useId } from "react";

interface BaseFieldProps {
  label?: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
}

/** Shared label + hint + error scaffold, wired for a11y (aria-describedby). */
function FieldShell({
  label,
  hint,
  error,
  required,
  id,
  children,
}: BaseFieldProps & { id: string; children: (describedBy: string | undefined) => React.ReactNode }) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [errId, hintId].filter(Boolean).join(" ") || undefined;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {label && (
        <label htmlFor={id} style={{ fontSize: "var(--text-xs)", fontWeight: "var(--weight-bold)", color: "var(--text)" }}>
          {label}
          {required && <span style={{ color: "var(--danger)", marginInlineStart: 4 }}>*</span>}
        </label>
      )}
      {children(describedBy)}
      {error ? (
        <span id={errId} style={{ fontSize: "var(--text-2xs)", color: "var(--danger)", fontWeight: "var(--weight-semibold)" }}>
          {error}
        </span>
      ) : hint ? (
        <span id={hintId} style={{ fontSize: "var(--text-2xs)", color: "var(--text-subtle)" }}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

const controlStyle = (error?: string | null): React.CSSProperties => ({
  width: "100%",
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-sm)",
  color: "var(--text)",
  background: "var(--surface)",
  border: `1px solid ${error ? "var(--danger)" : "var(--border-strong)"}`,
  borderRadius: "var(--radius-lg)",
  padding: "10px 12px",
  outline: "none",
  transition: "var(--transition-colors)",
});

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement>, BaseFieldProps {}

export function Input({ label, hint, error, required, id, ...rest }: InputProps) {
  const generated = useId();
  const fieldId = id ?? generated;
  return (
    <FieldShell id={fieldId} label={label} hint={hint} error={error} required={required}>
      {(describedBy) => (
        <input
          id={fieldId}
          className="ngg-focusable"
          aria-invalid={!!error}
          aria-describedby={describedBy}
          aria-required={required}
          style={controlStyle(error)}
          {...rest}
        />
      )}
    </FieldShell>
  );
}

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement>, BaseFieldProps {}

export function Textarea({ label, hint, error, required, id, style, ...rest }: TextareaProps) {
  const generated = useId();
  const fieldId = id ?? generated;
  return (
    <FieldShell id={fieldId} label={label} hint={hint} error={error} required={required}>
      {(describedBy) => (
        <textarea
          id={fieldId}
          className="ngg-focusable"
          aria-invalid={!!error}
          aria-describedby={describedBy}
          aria-required={required}
          style={{ ...controlStyle(error), resize: "vertical", minHeight: 96, lineHeight: "var(--leading-relaxed)", ...style }}
          {...rest}
        />
      )}
    </FieldShell>
  );
}
