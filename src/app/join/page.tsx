"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { db } from "@/lib/data/local-db";
import { Button } from "@/components/ui";

export default function JoinByCodePage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const clean = code.replace(/\D/g, "");
    if (clean.length !== 6) {
      setError("קוד החדר מורכב מ-6 ספרות");
      return;
    }
    const room = db.findRoomByCode(clean);
    if (!room) {
      setError("לא נמצא חדר עם הקוד הזה. בדקו שוב עם המנחה.");
      return;
    }
    router.push(`/join/${room.public_id}`);
  }

  return (
    <div dir="rtl" style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24, background: "var(--surface-sunken)", fontFamily: "var(--font-sans)", padding: 24 }}>
      <Image src="/brand/ngg-logo.png" alt="NGG" width={92} height={30} style={{ height: 30, width: "auto" }} />
      <div style={{ textAlign: "center" }}>
        <h1 style={{ fontSize: "var(--text-2xl)", fontWeight: "var(--weight-black)" }}>הצטרפות למפגש</h1>
        <p style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", marginTop: 6 }}>הזינו את קוד החדר בן 6 הספרות שמופיע על המסך</p>
      </div>
      <form onSubmit={submit} style={{ width: "100%", maxWidth: 340, display: "flex", flexDirection: "column", gap: 14 }}>
        <input
          value={code}
          onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(null); }}
          inputMode="numeric"
          autoFocus
          aria-label="קוד חדר"
          placeholder="000000"
          dir="ltr"
          className="ngg-focusable"
          style={{ fontSize: "var(--text-4xl)", fontWeight: "var(--weight-black)", letterSpacing: ".2em", textAlign: "center", border: `1px solid ${error ? "var(--danger)" : "var(--border-strong)"}`, borderRadius: "var(--radius-xl)", padding: "16px", background: "var(--surface)", color: "var(--text)", outline: "none" }}
        />
        {error && <span style={{ color: "var(--danger)", fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)", textAlign: "center" }}>{error}</span>}
        <Button type="submit" variant="primary" size="lg" block>הצטרפו</Button>
      </form>
    </div>
  );
}
