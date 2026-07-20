"use client";

import React from "react";
import { classNames } from "@/lib/utils";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  leadingIcon?: React.ReactNode;
}

const sizeStyle: Record<Size, React.CSSProperties> = {
  sm: { height: 34, padding: "0 14px", fontSize: "var(--text-xs)", borderRadius: "var(--radius-lg)" },
  md: { height: 40, padding: "0 18px", fontSize: "var(--text-sm)", borderRadius: "var(--radius-lg)" },
  lg: { height: 48, padding: "0 24px", fontSize: "var(--text-md)", borderRadius: "var(--radius-lg)" },
};

const variantStyle: Record<Variant, React.CSSProperties> = {
  primary: { background: "var(--accent)", color: "#fff", border: "1px solid var(--accent)" },
  secondary: { background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border-strong)" },
  outline: { background: "transparent", color: "var(--accent-text)", border: "1px solid var(--accent-border)" },
  ghost: { background: "transparent", color: "var(--text-muted)", border: "1px solid transparent" },
  danger: { background: "var(--danger)", color: "#fff", border: "1px solid var(--danger)" },
};

export function Button({
  variant = "secondary",
  size = "md",
  block = false,
  leadingIcon,
  className,
  style,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={classNames("ngg-btn", `ngg-btn--${variant}`, className)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        fontWeight: "var(--weight-bold)",
        fontFamily: "var(--font-sans)",
        cursor: rest.disabled ? "not-allowed" : "pointer",
        opacity: rest.disabled ? 0.55 : 1,
        width: block ? "100%" : undefined,
        transition: "var(--transition-colors)",
        whiteSpace: "nowrap",
        ...sizeStyle[size],
        ...variantStyle[variant],
        ...style,
      }}
      {...rest}
    >
      {leadingIcon}
      {children}
    </button>
  );
}
