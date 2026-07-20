"use client";

import type { Board } from "@/lib/types";
import { themeVisual } from "@/lib/board-visuals";

/** Distinctive board thumbnail derived from the board's theme (no stock art). */
export function BoardThumbnail({
  board,
  height = 104,
  radius = "11px 11px 0 0",
}: {
  board: Board;
  height?: number;
  radius?: string;
}) {
  const v = themeVisual(board.appearance);
  const chip = v.chip;
  return (
    <div
      aria-hidden="true"
      style={{
        height,
        borderRadius: radius,
        background: v.background,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 5,
        padding: 14,
        overflow: "hidden",
        position: "relative",
      }}
    >
      <span style={{ width: 24, height: 32, background: chip, borderRadius: 4 }} />
      <span style={{ width: 24, height: 24, background: chip, opacity: 0.75, borderRadius: 4 }} />
      <span style={{ width: 24, height: 28, background: chip, opacity: 0.85, borderRadius: 4 }} />
    </div>
  );
}
