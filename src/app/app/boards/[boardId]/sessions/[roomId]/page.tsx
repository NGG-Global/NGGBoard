"use client";

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";

/** Board-scoped session view. Session results live at /results/[roomId]. */
export default function BoardSessionPage({ params }: { params: Promise<{ boardId: string; roomId: string }> }) {
  const { roomId } = use(params);
  const router = useRouter();
  useEffect(() => {
    router.replace(`/results/${roomId}`);
  }, [roomId, router]);
  return null;
}
