"use client";

import { createContext, useCallback, useContext, useState } from "react";

/** MIME used to carry a board id across the native drag. */
export const BOARD_DND_MIME = "application/x-ngg-board-id";

interface DashDnd {
  /** Board id currently being dragged, or null. Drives drop-target highlights. */
  draggingId: string | null;
  start: (id: string) => void;
  end: () => void;
}

const Ctx = createContext<DashDnd>({ draggingId: null, start: () => {}, end: () => {} });

export function DashDndProvider({ children }: { children: React.ReactNode }) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const start = useCallback((id: string) => setDraggingId(id), []);
  const end = useCallback(() => setDraggingId(null), []);
  return <Ctx.Provider value={{ draggingId, start, end }}>{children}</Ctx.Provider>;
}

export const useDashDnd = () => useContext(Ctx);
