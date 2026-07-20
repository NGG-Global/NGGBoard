"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Input, Spinner } from "@/components/ui";
import { signIn, signInDemo, signUp, USE_SUPABASE } from "@/lib/auth";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const router = useRouter();
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
    else if (mode === "signup" && res.error?.includes("אימות")) setNotice(res.error);
    else setError(res.error ?? "התחברות נכשלה");
  }

  return (
    <div
      className="theme-dark"
      dir="rtl"
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
          <Image src="/brand/ngg-logo.png" alt="NGG" width={92} height={30} style={{ height: 30, width: "auto" }} priority />
          <div>
            <h1 style={{ fontSize: "var(--text-2xl)", fontWeight: "var(--weight-black)", marginBottom: 6 }}>לוחות חיים</h1>
            <p style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", lineHeight: "var(--leading-normal)" }}>
              {mode === "signup"
                ? "צרו חשבון ארגוני כדי להתחיל ליצור לוחות שיתופיים."
                : "התחברו כדי ליצור לוחות שיתופיים, להפעיל חדרים חיים ולהציג תוכן משתתפים בזמן אמת."}
            </p>
          </div>
        </div>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {mode === "signup" && (
            <Input label="שם מלא" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="שם ושם משפחה" required />
          )}
          <Input
            label="כתובת מייל ארגונית"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@nggconsult.com"
            error={error}
          />
          <Input
            label="סיסמה"
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
            {loading ? <Spinner size={18} color="#fff" /> : mode === "signup" ? "יצירת חשבון" : "כניסה"}
          </Button>
        </form>

        {USE_SUPABASE ? (
          <button
            onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); setNotice(null); }}
            style={{ border: "none", background: "transparent", color: "var(--accent-text)", fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)", cursor: "pointer" }}
          >
            {mode === "signin" ? "אין לכם חשבון? הרשמה" : "כבר יש לכם חשבון? כניסה"}
          </button>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
              <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-subtle)" }}>או</span>
              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            </div>
            <Button variant="secondary" size="md" block onClick={() => { signInDemo(); go(); }}>
              כניסה להדגמה
            </Button>
          </>
        )}

        <p style={{ fontSize: "var(--text-2xs)", color: "var(--text-subtle)", textAlign: "center", lineHeight: "var(--leading-normal)" }}>
          {USE_SUPABASE
            ? "התחברות מאובטחת דרך Supabase. חיבור SSO יתווסף בהמשך."
            : "זוהי גרסת הדגמה. כל מייל ארגוני מזוהה מתקבל, או השתמשו בכניסה להדגמה."}
        </p>
      </div>
    </div>
  );
}
