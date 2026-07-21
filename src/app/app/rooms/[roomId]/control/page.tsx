"use client";

import { use } from "react";
import { LiveRoomScreen } from "@/components/control/LiveRoomScreen";

export default function ControlRoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = use(params);
  return <LiveRoomScreen roomId={roomId} />;
}
