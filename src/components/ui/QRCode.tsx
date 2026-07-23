"use client";

import React, { useEffect, useRef } from "react";
import QRCode from "qrcode";
import { useI18n } from "@/lib/i18n/react";

export interface QRCodeProps {
  value: string;
  size?: number;
  /** Foreground/background; defaults to brand ink on white for max scannability. */
  dark?: string;
  light?: string;
  className?: string;
  style?: React.CSSProperties;
}

/** Renders a real, scannable QR code to a canvas via the `qrcode` library. */
export function QRCodeCanvas({ value, size = 180, dark = "#15151f", light = "#ffffff", className, style }: QRCodeProps) {
  const { t } = useI18n();
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    QRCode.toCanvas(canvas, value, {
      width: size * 2, // render at 2x for crisp projection, CSS scales down
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark, light },
    })
      .then(() => {
        // `qrcode` overwrites the canvas inline width/height in px during render,
        // which — combined with the global `canvas { max-width: 100% }` reset —
        // can distort the QR into a rectangle. Re-assert a fixed square after.
        canvas.style.width = `${size}px`;
        canvas.style.height = `${size}px`;
        canvas.style.maxWidth = "none";
      })
      .catch((err) => console.warn("QR render failed", err));
  }, [value, size, dark, light]);

  return (
    <canvas
      ref={ref}
      width={size * 2}
      height={size * 2}
      role="img"
      aria-label={t("קוד QR להצטרפות: {value}", { value })}
      className={className}
      style={{ width: size, height: size, maxWidth: "none", display: "block", borderRadius: "var(--radius-lg)", ...style }}
    />
  );
}
