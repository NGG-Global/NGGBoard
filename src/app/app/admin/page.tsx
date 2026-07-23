"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { db } from "@/lib/data";
import { getCurrentProfile } from "@/lib/auth";
import { useLiveQuery, useMounted } from "@/lib/hooks";
import { AppShell } from "@/components/app/AppShell";
import { Badge, Button, EmptyState } from "@/components/ui";
import { useI18n } from "@/lib/i18n/react";

const ROLE_LABELS: Record<string, string> = {
  org_admin: "מנהל ארגון",
  board_creator: "יוצר לוחות",
  co_editor: "עורך משנה",
  facilitator: "מנחה",
};

export default function AdminPage() {
  const router = useRouter();
  const mounted = useMounted();
  const { t } = useI18n();
  const org = useLiveQuery("board-list", () => db.getOrganization());
  const profiles = useLiveQuery("board-list", () => db.listProfiles());
  const boards = useLiveQuery("board-list", () => db.listBoards());
  const activeRooms = useLiveQuery("board-list", () => db.listActiveRooms());
  // Reactive so it settles after the profile hydrates (Supabase).
  const profile = useLiveQuery("board-list", () => (mounted ? getCurrentProfile() : null));

  // Guard: redirect only once a non-admin profile is known (avoids a flash
  // redirect while the profile is still hydrating).
  useEffect(() => {
    if (mounted && profile && profile.role !== "org_admin") router.replace("/app/boards");
  }, [mounted, profile, router]);

  if (!mounted) return null;
  if (profile && profile.role !== "org_admin") {
    return (
      <AppShell current="admin">
        <div style={{ padding: 40, maxWidth: 640, margin: "0 auto" }}>
          <EmptyState title={t("אין הרשאת גישה")} description={t("הגדרות הארגון זמינות למנהלי ארגון בלבד.")} />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell current="admin">
      <div style={{ padding: "26px 30px 48px", maxWidth: 960, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>
        <h1 style={{ fontSize: "var(--text-2xl)", fontWeight: "var(--weight-black)" }}>{t("הגדרות ארגון")}</h1>

        {/* Org identity */}
        <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", padding: 20, display: "flex", alignItems: "center", gap: 16 }}>
          {org.logo_url && <Image src={org.logo_url} alt={org.name} width={96} height={32} style={{ height: 32, width: "auto" }} />}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "var(--text-lg)", fontWeight: "var(--weight-extrabold)" }}>{org.name}</div>
            <div style={{ fontSize: "var(--text-sm)", color: "var(--text-subtle)" }}>{t("{users} משתמשים · {boards} לוחות", { users: profiles.length, boards: boards.length })}</div>
          </div>
        </section>

        {/* Usage stats */}
        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
          <StatBox value={boards.filter((b) => b.status !== "archived").length} label={t("לוחות פעילים")} />
          <StatBox value={activeRooms.length} label={t("חדרים חיים כעת")} />
          <StatBox value={boards.filter((b) => b.status === "draft").length} label={t("טיוטות")} />
          <StatBox value={boards.filter((b) => b.status === "archived").length} label={t("בארכיון")} />
        </section>

        {/* Members */}
        <section>
          <h2 style={{ fontSize: "var(--text-md)", fontWeight: "var(--weight-extrabold)", marginBottom: 12 }}>{t("משתמשים והרשאות")}</h2>
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
                <Badge color={p.role === "org_admin" ? "accent" : "neutral"} variant="soft">{(() => { const label = ROLE_LABELS[p.role]; return label ? t(label) : p.role; })()}</Badge>
              </div>
            ))}
          </div>
        </section>

        <section style={{ background: "var(--surface)", border: "1px dashed var(--border-strong)", borderRadius: "var(--radius-xl)", padding: 20 }}>
          <div style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-bold)", marginBottom: 6 }}>{t("בקרוב")}</div>
          <div style={{ fontSize: "var(--text-sm)", color: "var(--text-subtle)", lineHeight: "var(--leading-relaxed)" }}>
            {t("ניהול תבניות ארגוניות, חיבור SSO, מדיניות שמירת נתונים, יומני ביקורת ודוחות שימוש מתקדמים — יתווספו בגרסאות הבאות.")}
          </div>
          <div style={{ marginTop: 12 }}>
            <Button variant="secondary" onClick={() => { if (confirm(t("לאפס את נתוני ההדגמה למצב ההתחלתי?"))) db.resetToSeed(); }}>
              {t("איפוס נתוני הדגמה")}
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
