"use client";

import { use } from "react";
import { ParticipantBoardView } from "@/components/participant/ParticipantBoardView";

export default function ParticipantBoardPage({ params }: { params: Promise<{ publicRoomId: string }> }) {
  const { publicRoomId } = use(params);
  return <ParticipantBoardView publicId={publicRoomId} />;
}
