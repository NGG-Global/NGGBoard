"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { db } from "@/lib/data/local-db";
import { getCurrentProfile } from "@/lib/auth";
import { useLiveQuery, useMounted } from "@/lib/hooks";
import { AppShell } from "@/components/app/AppShell";
import { Badge, Button, EmptyState } from "@/components/ui";

const ROLE_LABELS: Record<string, string> = {
  org_admin: "מנהל ארגון",
  board_creator: "יוצר לוחות",
  co_editor: "עורך משנה",
  facilitator: "מנחה",
};

export default function AdminPage() {
  const router = useRouter();
  const mounted = useMounted();
  const org = useLiveQuery("board-list", () => db.getOrganization());
  const profiles = useLiveQuery("board-list", () => db.listProfiles());
  const boards = useLiveQuery("board-list", () => db.listBoards());
  const activeRooms = useLiveQuery("board-list", () => db.listActiveRooms());

  // Guard: only org admins.
  useEffect(() => {
    if (mounted && getCurrentProfile()?.role !== "org_admin") router.replace("/app/boards");
  }, [mounted, router]);

  if (!mounted) return null;
  if (getCurrentProfile()?.role !== "org_admin") {
    return (
      <AppShell current="admin">
        <div style={{ padding: 40, maxWidth: 640, margin: "0 auto" }}>
          <EmptyState title="אין הרשאת גישה" description="הגדרות הארגון זמינות למנהלי ארגון בלבד." />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell current="admin">
      <div style={{ padding: "26px 30px 48px", maxWidth: 960, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>
        <h1 style={{ fontSize: "var(--text-2xl)", fontWeight: "var(--weight-black)" }}>הגדרות ארגון</h1>

        {/* Org identity */}
        <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", padding: 20, display: "flex", alignItems: "center", gap: 16 }}>
          {org.logo_url && <Image src={org.logo_url} alt={org.name} width={96} height={32} style={{ height: 32, width: "auto" }} />}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "var(--text-lg)", fontWeight: "var(--weight-extrabold)" }}>{org.name}</div>
            <div style={{ fontSize: "var(--text-sm)", color: "var(--text-subtle)" }}>{profiles.length} משתמשים · {boards.length} לוחות</div>
          </div>
        </section>

        {/* Usage stats */}
        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
          <StatBox value={boards.filter((b) => b.status !== "archived").length} label="לוחות פעילים" />
          <StatBox value={activeRooms.length} label="חדרים חיים כעת" />
          <StatBox value={boards.filter((b) => b.status === "draft").length} label="טיוטות" />
          <StatBox value={boards.filter((b) => b.status === "archived").length} label="בארכיון" />
        </section>

        {/* Members */}
        <section>
          <h2 style={{ fontSize: "var(--text-md)", fontWeight: "var(--weight-extrabold)", marginBottom: 12 }}>משתמשים והרשאות</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {profiles.map((p) => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "12px 14px" }}>
                <span style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--accent-soft)", color: "var(--accent-text)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "var(--weight-extrabold)", flex: "none" }}>
                  {p.full_name.charAt(0)}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-bold)" }}>{p.full_name}</div>
                  <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-subtle)" }}>{p.email}</div>
                </div>
                <Badge color={p.role === "org_admin" ? "accent" : "neutral"} variant="soft">{ROLE_LABELS[p.role] ?? p.role}</Badge>
              </div>
            ))}
          </div>
        </section>

        <section style={{ background: "var(--surface)", border: "1px dashed var(--border-strong)", borderRadius: "var(--radius-xl)", padding: 20 }}>
          <div style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-bold)", marginBottom: 6 }}>בקרוב</div>
          <div style={{ fontSize: "var(--text-sm)", color: "var(--text-subtle)", lineHeight: "var(--leading-relaxed)" }}>
            ניהול תבניות ארגוניות, חיבור SSO, מדיניות שמירת נתונים, יומני ביקורת ודוחות שימוש מתקדמים — יתווספו בגרסאות הבאות.
          </div>
          <div style={{ marginTop: 12 }}>
            <Button variant="secondary" onClick={() => { if (confirm("לאפס את נתוני ההדגמה למצב ההתחלתי?")) db.resetToSeed(); }}>
              איפוס נתוני הדגמה
            </Button>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function StatBox({ value, label }: { value: number; label: string }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", padding: "18px 20px", display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontSize: "var(--text-3xl)", fontWeight: "var(--weight-black)" }}>{value}</div>
      <div style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)" }}>{label}</div>
    </div>
  );
}
