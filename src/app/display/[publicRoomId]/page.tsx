"use client";

import { use, useEffect, useState } from "react";
import { db } from "@/lib/data";
import { useLiveQuery, useMounted } from "@/lib/hooks";
import { DisplayCanvas } from "@/components/display/DisplayCanvas";
import { Spinner } from "@/components/ui";
import { IconWarning } from "@/components/ui/icons";

export default function DisplayPage({ params }: { params: Promise<{ publicRoomId: string }> }) {
  const { publicRoomId } = use(params);
  const mounted = useMounted();
  const [joinUrl, setJoinUrl] = useState("");

  const room = useLiveQuery({ room: publicRoomId }, () => db.getRoomByPublicId(publicRoomId));
  const board = useLiveQuery({ room: publicRoomId }, () => {
    const r = db.getRoomByPublicId(publicRoomId);
    return r ? db.getBoard(r.board_id) : null;
  });
  // Subscribe by the stable public id (never depends on the async-loaded room
  // object); resolve the room inside the selector. commit() emits the public-id
  // signal variant for every room change, so this fires on every submission.
  const submissions = useLiveQuery({ room: publicRoomId }, () => {
    const r = db.getRoomByPublicId(publicRoomId);
    return r ? db.listSubmissions(r.id).filter((s) => s.status === "published") : [];
  });

  const [graceOver, setGraceOver] = useState(false);
  useEffect(() => {
    if (typeof window !== "undefined") setJoinUrl(`${window.location.origin}/join/${publicRoomId}`);
    const t = setTimeout(() => setGraceOver(true), 6000);
    return () => clearTimeout(t);
  }, [publicRoomId]);

  if (!mounted || (!room && !graceOver)) {
    return (
      <div style={{ height: "100vh", display: "grid", placeItems: "center", background: "var(--ink-950)" }}>
        <Spinner size={32} color="#fff" />
      </div>
    );
  }

  if (!room || !board) {
    return (
      <div className="theme-dark" style={{ height: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, background: "var(--gradient-ink)", color: "#f4f4f6", fontFamily: "var(--font-sans)" }}>
        <IconWarning size={40} />
        <div style={{ fontSize: "var(--text-2xl)", fontWeight: "var(--weight-black)" }}>החדר לא נמצא</div>
        <div style={{ color: "var(--neutral-400)" }}>ייתכן שהקישור שגוי או שהמפגש נמחק.</div>
      </div>
    );
  }

  return (
    <div style={{ height: "100vh", width: "100vw", overflow: "hidden" }}>
      <DisplayCanvas room={room} board={board} submissions={submissions} joinUrl={joinUrl} />
    </div>
  );
}
