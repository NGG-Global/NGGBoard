"use client";

import { useEffect } from "react";

/**
 * Route-level error boundary. Replaces React's blank white-screen crash
 * ("Application error: a client-side exception has occurred") with a calm,
 * on-brand recovery screen. Kept dependency-light on purpose — a boundary that
 * imports heavy UI could fail to render for the very error it is catching.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Surface the real cause in the console for diagnostics.
    console.error("NGG Boards — unhandled error:", error);
  }, [error]);

  return (
    <div
      dir="rtl"
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
        padding: 24,
        textAlign: "center",
        background: "var(--surface-sunken, #f7f7f8)",
        color: "var(--text, #101014)",
        fontFamily: "var(--font-sans, system-ui, sans-serif)",
      }}
    >
      <div style={{ fontSize: 44, lineHeight: 1 }} aria-hidden="true">
        ⚠️
      </div>
      <h1 style={{ fontSize: "clamp(20px, 3vw, 28px)", fontWeight: 800, margin: 0 }}>
        משהו השתבש
      </h1>
      <p style={{ maxWidth: 420, color: "var(--text-muted, #55555f)", fontSize: 15, margin: 0 }}>
        אירעה תקלה בטעינת המסך. אפשר לנסות שוב — ואם התקלה חוזרת, רעננו את הדף או חזרו למסך הראשי.
      </p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", marginTop: 6 }}>
        <button
          onClick={() => reset()}
          style={{
            border: "none",
            background: "var(--accent, #ec2a8c)",
            color: "#fff",
            padding: "11px 22px",
            borderRadius: 999,
            fontSize: 15,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          נסו שוב
        </button>
        <a
          href="/app/boards"
          style={{
            border: "1px solid var(--border-strong, #d4d4d8)",
            background: "transparent",
            color: "var(--text, #101014)",
            padding: "11px 22px",
            borderRadius: 999,
            fontSize: 15,
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          חזרה למסך הראשי
        </a>
      </div>
    </div>
  );
}
