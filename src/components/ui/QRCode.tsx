"use client";

import React, { useEffect, useRef } from "react";
import QRCode from "qrcode";

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
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    QRCode.toCanvas(canvas, value, {
      width: size * 2, // render at 2x for crisp projection, CSS scales down
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark, light },
    }).catch((err) => console.warn("QR render failed", err));
  }, [value, size, dark, light]);

  return (
    <canvas
      ref={ref}
      width={size * 2}
      height={size * 2}
      role="img"
      aria-label={`קוד QR להצטרפות: ${value}`}
      className={className}
      style={{ width: size, height: size, borderRadius: "var(--radius-lg)", ...style }}
    />
  );
}
