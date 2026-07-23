"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Input, Spinner } from "@/components/ui";
import { LanguageToggle, useI18n } from "@/lib/i18n/react";
import { signIn, signInDemo, signUp, USE_SUPABASE } from "@/lib/auth";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>("signin");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const go = () => router.push("/app/boards");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);
    const res = mode === "signup" ? await signUp(email, password, fullName) : await signIn(email, password);
    setLoading(false);
    if (res.ok) go();
    else if (mode === "signup" && (res.error?.includes("אימות") || res.error?.includes("verification"))) setNotice(res.error);
    else setError(res.error ?? t("התחברות נכשלה"));
  }

  return (
    <div
      className="theme-dark"
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "var(--gradient-ink-magenta)",
        color: "#f4f4f6",
        fontFamily: "var(--font-sans)",
        padding: 24,
      }}
    >
      <div
        className="theme-light"
        style={{
          width: "100%",
          maxWidth: 420,
          background: "var(--surface)",
          color: "var(--text)",
          borderRadius: "var(--radius-2xl)",
          padding: "36px 32px",
          boxShadow: "0 24px 60px rgba(8,8,16,.45)",
          display: "flex",
          flexDirection: "column",
          gap: 22,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "flex-start" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
            <Image src="/brand/ngg-logo.png" alt="NGG" width={92} height={30} style={{ height: 30, width: "auto" }} priority />
            <LanguageToggle />
          </div>
          <div>
            <h1 style={{ fontSize: "var(--text-2xl)", fontWeight: "var(--weight-black)", marginBottom: 6 }}>{t("לוחות חיים")}</h1>
            <p style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", lineHeight: "var(--leading-normal)" }}>
              {mode === "signup"
                ? t("צרו חשבון ארגוני כדי להתחיל ליצור לוחות שיתופיים.")
                : t("התחברו כדי ליצור לוחות שיתופיים, להפעיל חדרים חיים ולהציג תוכן משתתפים בזמן אמת.")}
            </p>
          </div>
        </div>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {mode === "signup" && (
            <Input label={t("שם מלא")} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder={t("שם ושם משפחה")} required />
          )}
          <Input
            label={t("כתובת מייל ארגונית")}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@nggconsult.com"
            error={error}
          />
          <Input
            label={t("סיסמה")}
            type="password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
          {notice && (
            <div style={{ fontSize: "var(--text-sm)", color: "var(--success)", background: "var(--success-bg)", padding: "10px 12px", borderRadius: "var(--radius-lg)" }}>
              {notice}
            </div>
          )}
          <Button type="submit" variant="primary" size="lg" block disabled={loading}>
            {loading ? <Spinner size={18} color="#fff" /> : mode === "signup" ? t("יצירת חשבון") : t("כניסה")}
          </Button>
        </form>

        {USE_SUPABASE ? (
          <button
            onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); setNotice(null); }}
            style={{ border: "none", background: "transparent", color: "var(--accent-text)", fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)", cursor: "pointer" }}
          >
            {mode === "signin" ? t("אין לכם חשבון? הרשמה") : t("כבר יש לכם חשבון? כניסה")}
          </button>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
              <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-subtle)" }}>{t("או")}</span>
              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            </div>
            <Button variant="secondary" size="md" block onClick={() => { signInDemo(); go(); }}>
              {t("כניסה להדגמה")}
            </Button>
          </>
        )}

        <p style={{ fontSize: "var(--text-2xs)", color: "var(--text-subtle)", textAlign: "center", lineHeight: "var(--leading-normal)" }}>
          {USE_SUPABASE
            ? t("התחברות מאובטחת דרך Supabase. חיבור SSO יתווסף בהמשך.")
            : t("זוהי גרסת הדגמה. כל מייל ארגוני מזוהה מתקבל, או השתמשו בכניסה להדגמה.")}
        </p>
      </div>
    </div>
  );
}
