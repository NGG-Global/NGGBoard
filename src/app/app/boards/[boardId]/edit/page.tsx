"use client";

import { use } from "react";
import { BoardEditor } from "@/components/app/editor/BoardEditor";

export default function EditBoardPage({ params }: { params: Promise<{ boardId: string }> }) {
  const { boardId } = use(params);
  return <BoardEditor boardId={boardId} />;
}
