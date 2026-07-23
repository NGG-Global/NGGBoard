"use client";

import { useEffect } from "react";
import { useI18n } from "@/lib/i18n/react";

/**
 * Last-resort boundary for errors thrown in the root layout itself, where the
 * normal error.tsx cannot render. It must provide its own <html>/<body>.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { lang, t } = useI18n();
  useEffect(() => {
    console.error("NGG Boards — root error:", error);
  }, [error]);

  return (
    <html lang={lang} dir={lang === "he" ? "rtl" : "ltr"}>
      <body style={{ margin: 0 }}>
        <div
          style={{
            minHeight: "100dvh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            padding: 24,
            textAlign: "center",
            background: "#f7f7f8",
            color: "#101014",
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          <div style={{ fontSize: 44, lineHeight: 1 }} aria-hidden="true">
            ⚠️
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>{t("משהו השתבש")}</h1>
          <p style={{ maxWidth: 420, color: "#55555f", fontSize: 15, margin: 0 }}>
            {t("אירעה תקלה בלתי צפויה. נסו לרענן את הדף.")}
          </p>
          <button
            onClick={() => reset()}
            style={{
              border: "none",
              background: "#ec2a8c",
              color: "#fff",
              padding: "11px 22px",
              borderRadius: 999,
              fontSize: 15,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {t("נסו שוב")}
          </button>
        </div>
      </body>
    </html>
  );
}
