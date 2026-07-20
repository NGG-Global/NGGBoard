"use client";

import { use } from "react";
import { ParticipantFlow } from "@/components/participant/ParticipantFlow";

export default function JoinRoomPage({ params }: { params: Promise<{ publicRoomId: string }> }) {
  const { publicRoomId } = use(params);
  return <ParticipantFlow publicId={publicRoomId} />;
}
