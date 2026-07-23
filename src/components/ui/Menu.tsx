"use client";

import { useEffect, useRef } from "react";

/**
 * A `role="menu"` container with keyboard support: focuses the first item on
 * open, ArrowUp/Down (wrapping) and Home/End move between items, Escape closes.
 * Items are any descendants with `role="menuitem"` (native buttons work as-is).
 * Pair with a trigger that has aria-haspopup/aria-expanded.
 */
export function RovingMenu({
  onClose,
  children,
  style,
  ariaLabel,
}: {
  onClose: () => void;
  children: React.ReactNode;
  style?: React.CSSProperties;
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const items = () =>
    Array.from(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? []);

  useEffect(() => {
    items()[0]?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onKeyDown(e: React.KeyboardEvent) {
    const list = items();
    if (list.length === 0) return;
    const idx = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") { e.preventDefault(); list[(idx + 1) % list.length]?.focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); list[(idx - 1 + list.length) % list.length]?.focus(); }
    else if (e.key === "Home") { e.preventDefault(); list[0]?.focus(); }
    else if (e.key === "End") { e.preventDefault(); list[list.length - 1]?.focus(); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
  }

  return (
    <div ref={ref} role="menu" aria-label={ariaLabel} onKeyDown={onKeyDown} style={style}>
      {children}
    </div>
  );
}
