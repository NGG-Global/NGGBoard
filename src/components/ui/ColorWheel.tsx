"use client";

import { useRef, useState } from "react";
import { t } from "@/lib/i18n";

/** hsl (h 0-360, s/l 0-100) → #rrggbb */
export function hslToHex(h: number, s: number, l: number): string {
  const sn = s / 100;
  const ln = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sn * Math.min(ln, 1 - ln);
  const f = (n: number) => ln - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const to255 = (v: number) => Math.round(v * 255).toString(16).padStart(2, "0");
  return `#${to255(f(0))}${to255(f(8))}${to255(f(4))}`;
}

/** #rrggbb → hsl, or null when not parseable. */
export function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const r = parseInt(m[1]!.slice(0, 2), 16) / 255;
  const g = parseInt(m[1]!.slice(2, 4), 16) / 255;
  const b = parseInt(m[1]!.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l: Math.round(l * 100) };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = 60 * (((g - b) / d) % 6);
  else if (max === g) h = 60 * ((b - r) / d + 2);
  else h = 60 * ((r - g) / d + 4);
  if (h < 0) h += 360;
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

const RING_HUES = Array.from({ length: 13 }, (_, i) => `hsl(${i * 30}, 100%, 50%)`).join(", ");

/**
 * A hue color wheel with a brightness slider. Drag (touch or mouse) around
 * the ring to pick a hue; the center swatch previews the resulting color.
 * Saturation is fixed at a projection-friendly level so every pick stays
 * pleasant behind white content cards.
 */
export function ColorWheel({ value, onChange, size = 164 }: { value: string | null; onChange: (hex: string) => void; size?: number }) {
  const parsed = value ? hexToHsl(value) : null;
  const [hue, setHue] = useState(parsed?.h ?? 330);
  const [lightness, setLightness] = useState(parsed && parsed.s > 0 ? parsed.l : 90);
  const saturation = 62;
  const ringRef = useRef<HTMLDivElement>(null);

  const current = hslToHex(hue, saturation, lightness);

  function hueFromPointer(clientX: number, clientY: number): number {
    const rect = ringRef.current!.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let deg = (Math.atan2(clientY - cy, clientX - cx) * 180) / Math.PI + 90; // 0° at the top, clockwise
    if (deg < 0) deg += 360;
    return Math.round(deg);
  }

  function handlePointer(e: React.PointerEvent) {
    const h = hueFromPointer(e.clientX, e.clientY);
    setHue(h);
    onChange(hslToHex(h, saturation, lightness));
  }

  const handleRadius = size / 2 - 13;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      <div style={{ position: "relative", width: size, height: size }}>
        <div
          ref={ringRef}
          role="slider"
          aria-label={t("גלגל צבעים לבחירת גוון")}
          aria-valuemin={0}
          aria-valuemax={359}
          aria-valuenow={hue}
          tabIndex={0}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            handlePointer(e);
          }}
          onPointerMove={(e) => {
            if (e.buttons > 0) handlePointer(e);
          }}
          onKeyDown={(e) => {
            const delta = e.key === "ArrowRight" || e.key === "ArrowUp" ? 6 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -6 : 0;
            if (!delta) return;
            e.preventDefault();
            const h = (hue + delta + 360) % 360;
            setHue(h);
            onChange(hslToHex(h, saturation, lightness));
          }}
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            background: `conic-gradient(${RING_HUES})`,
            WebkitMask: "radial-gradient(closest-side, transparent 62%, #000 63%)",
            mask: "radial-gradient(closest-side, transparent 62%, #000 63%)",
            touchAction: "none",
            cursor: "pointer",
          }}
        >
          <span
            aria-hidden
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: 24,
              height: 24,
              borderRadius: "50%",
              background: `hsl(${hue}, 100%, 50%)`,
              border: "3px solid #fff",
              boxShadow: "0 1px 6px rgba(8,8,16,.4)",
              transform: `translate(-50%, -50%) rotate(${hue}deg) translateY(${-handleRadius}px)`,
              pointerEvents: "none",
            }}
          />
        </div>
        {/* Center swatch fills the masked hole with the resulting color. */}
        <span
          aria-hidden
          style={{
            position: "absolute",
            inset: "31%",
            borderRadius: "50%",
            background: current,
            border: "1px solid rgba(8,8,16,.10)",
            pointerEvents: "none",
          }}
        />
      </div>
      <label style={{ display: "flex", flexDirection: "column", gap: 6, width: size }}>
        <span style={{ fontSize: "var(--text-2xs)", fontWeight: "var(--weight-bold)", color: "var(--text-muted)" }}>{t("בהירות")}</span>
        <input
          type="range"
          dir="ltr"
          min={16}
          max={94}
          value={lightness}
          onChange={(e) => {
            const l = Number(e.target.value);
            setLightness(l);
            onChange(hslToHex(hue, saturation, l));
          }}
          style={{ width: "100%", accentColor: hslToHex(hue, saturation, Math.min(lightness, 60)) }}
        />
      </label>
    </div>
  );
}
