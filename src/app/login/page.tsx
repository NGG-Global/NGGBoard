"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Input, Spinner } from "@/components/ui";
import { signIn, signInDemo } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function go() {
    router.push("/app/boards");
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    // Simulated network latency to exercise the loading state.
    setTimeout(() => {
      const res = signIn(email, password);
      setLoading(false);
      if (res.ok) go();
      else setError(res.error ?? "התחברות נכשלה");
    }, 500);
  }

  return (
    <div
      className="theme-dark"
      dir="rtl"
      style={{
        minHeight: "100vh",
        display: "grid",
        gridTemplateColumns: "1fr",
        background: "var(--gradient-ink-magenta)",
        color: "#f4f4f6",
        fontFamily: "var(--font-sans)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
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
              <h1 style={{ fontSize: "var(--text-2xl)", fontWeight: "var(--weight-black)", marginBottom: 6 }}>
                לוחות חיים
              </h1>
              <p style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", lineHeight: "var(--leading-normal)" }}>
                התחברו כדי ליצור לוחות שיתופיים, להפעיל חדרים חיים ולהציג תוכן משתתפים בזמן אמת.
              </p>
            </div>
          </div>

          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
            <Button type="submit" variant="primary" size="lg" block disabled={loading}>
              {loading ? <Spinner size={18} color="#fff" /> : "כניסה"}
            </Button>
          </form>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-subtle)" }}>או</span>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          </div>

          <Button
            variant="secondary"
            size="md"
            block
            onClick={() => {
              signInDemo();
              go();
            }}
          >
            כניסה להדגמה
          </Button>

          <p style={{ fontSize: "var(--text-2xs)", color: "var(--text-subtle)", textAlign: "center", lineHeight: "var(--leading-normal)" }}>
            זוהי גרסת הדגמה. כל מייל ארגוני מזוהה מתקבל, או השתמשו בכניסה להדגמה.
            <br />
            חיבור SSO יתווסף בהמשך.
          </p>
        </div>
      </div>
    </div>
  );
}
