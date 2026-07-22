"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useState } from "react";
import { getCurrentProfile, signOut } from "@/lib/auth";
import { useLiveQuery, useMounted } from "@/lib/hooks";
import { db } from "@/lib/data";
import {
  IconArchive,
  IconFolder,
  IconGrid,
  IconPlus,
  IconSettings,
  IconTemplate,
  IconUsers,
} from "@/components/ui/icons";
import { LiveDot } from "@/components/ui";

export type DashView = "all" | "shared" | "active" | "templates" | "archive" | "admin";

const NAV: { key: DashView; label: string; href: string; icon: React.ReactNode }[] = [
  { key: "all", label: "הלוחות שלי", href: "/app/boards?view=all", icon: <IconGrid size={15} /> },
  { key: "shared", label: "שותפו איתי", href: "/app/boards?view=shared", icon: <IconUsers size={15} /> },
  { key: "active", label: "פעילים עכשיו", href: "/app/boards?view=active", icon: <LiveDot /> },
  { key: "templates", label: "תבניות", href: "/app/boards?view=templates", icon: <IconTemplate size={15} /> },
  { key: "archive", label: "ארכיון", href: "/app/boards?view=archive", icon: <IconArchive size={15} /> },
];

export function AppShell({
  current,
  activeFolder = null,
  children,
}: {
  current: DashView;
  /** Folder name currently filtered on the dashboard (highlights the sidebar). */
  activeFolder?: string | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const mounted = useMounted();
  // Reactive: re-reads once the profile hydrates (Supabase) or on any change.
  const profile = useLiveQuery("board-list", () => (mounted ? getCurrentProfile() : null));
  const activeCount = useLiveQuery("board-list", () => db.listActiveRooms().length);
  const folders = useLiveQuery("board-list", () => db.listFolders());
  const [menuOpen, setMenuOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newFolder, setNewFolder] = useState("");

  function createFolder() {
    const clean = newFolder.trim();
    if (clean) db.createFolder(clean);
    setNewFolder("");
    setAdding(false);
  }

  return (
    <div
      dir="rtl"
      style={{
        minHeight: "100vh",
        display: "flex",
        background: "var(--surface-sunken)",
        fontFamily: "var(--font-sans)",
        color: "var(--text)",
      }}
    >
      <aside
        style={{
          width: 216,
          flex: "none",
          background: "var(--surface)",
          borderInlineEnd: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          padding: "18px 12px",
          position: "sticky",
          top: 0,
          height: "100vh",
        }}
      >
        <Link href="/app/boards?view=all" aria-label="NGG Boards — דף הבית" style={{ alignSelf: "flex-start", margin: "0 8px 22px" }}>
          <Image src="/brand/ngg-logo.png" alt="NGG" width={80} height={26} style={{ height: 26, width: "auto" }} priority />
        </Link>

        <nav style={{ display: "flex", flexDirection: "column", gap: 2 }} aria-label="ניווט ראשי">
          {NAV.map((item) => {
            const active = current === item.key;
            return (
              <Link
                key={item.key}
                href={item.href}
                aria-current={active ? "page" : undefined}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 10px",
                  borderRadius: "var(--radius-lg)",
                  background: active ? "var(--accent-soft)" : "transparent",
                  color: active ? "var(--accent-text)" : "var(--text-muted)",
                  fontSize: "var(--text-sm)",
                  fontWeight: active ? "var(--weight-bold)" : "var(--weight-semibold)",
                }}
              >
                <span style={{ width: 15, display: "flex", justifyContent: "center" }}>{item.icon}</span>
                {item.label}
                {item.key === "active" && activeCount > 0 && (
                  <span
                    style={{
                      marginInlineStart: "auto",
                      background: "var(--accent-soft)",
                      color: "var(--accent-text)",
                      fontSize: "var(--text-2xs)",
                      fontWeight: "var(--weight-bold)",
                      padding: "1px 7px",
                      borderRadius: "var(--radius-pill)",
                    }}
                  >
                    {activeCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Folders */}
        <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 10px 6px" }}>
            <span style={{ fontSize: "var(--text-2xs)", fontWeight: "var(--weight-bold)", color: "var(--text-subtle)", letterSpacing: ".04em", flex: 1 }}>
              תיקיות
            </span>
            <button
              onClick={() => setAdding((v) => !v)}
              aria-label="תיקייה חדשה"
              title="תיקייה חדשה"
              className="ngg-hover"
              style={{ border: "none", background: "transparent", color: "var(--text-subtle)", cursor: "pointer", padding: 3, borderRadius: "var(--radius-sm)", display: "flex" }}
            >
              <IconPlus size={14} />
            </button>
          </div>

          {adding && (
            <input
              autoFocus
              value={newFolder}
              onChange={(e) => setNewFolder(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") createFolder(); if (e.key === "Escape") { setAdding(false); setNewFolder(""); } }}
              onBlur={createFolder}
              placeholder="שם התיקייה…"
              className="ngg-focusable"
              style={{ margin: "0 8px 6px", padding: "7px 9px", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-md)", fontSize: "var(--text-sm)", fontFamily: "var(--font-sans)", color: "var(--text)", background: "var(--surface)", outline: "none" }}
            />
          )}

          {folders.length === 0 && !adding && (
            <div style={{ padding: "2px 10px 4px", fontSize: "var(--text-2xs)", color: "var(--text-subtle)", lineHeight: "var(--leading-snug)" }}>
              צרו תיקייה כדי לארגן את הלוחות
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 240, overflowY: "auto" }}>
            {folders.map((f) => {
              const active = current === "all" && activeFolder === f.name;
              return (
                <Link
                  key={f.name}
                  href={`/app/boards?view=all&folder=${encodeURIComponent(f.name)}`}
                  aria-current={active ? "page" : undefined}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 10px",
                    borderRadius: "var(--radius-lg)",
                    background: active ? "var(--accent-soft)" : "transparent",
                    color: active ? "var(--accent-text)" : "var(--text-muted)",
                    fontSize: "var(--text-sm)",
                    fontWeight: active ? "var(--weight-bold)" : "var(--weight-semibold)",
                  }}
                >
                  <IconFolder size={15} />
                  <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.name}</span>
                  {f.count > 0 && (
                    <span style={{ fontSize: "var(--text-2xs)", color: active ? "var(--accent-text)" : "var(--text-subtle)" }}>{f.count}</span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>

        <div style={{ flex: 1 }} />

        {profile?.role === "org_admin" && (
          <Link
            href="/app/admin"
            aria-current={current === "admin" ? "page" : undefined}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "9px 10px",
              borderRadius: "var(--radius-lg)",
              background: current === "admin" ? "var(--accent-soft)" : "transparent",
              color: current === "admin" ? "var(--accent-text)" : "var(--text-subtle)",
              fontSize: "var(--text-xs)",
              fontWeight: "var(--weight-semibold)",
            }}
          >
            <IconSettings size={14} />
            הגדרות ארגון
          </Link>
        )}

        {/* User menu */}
        <div style={{ position: "relative", marginTop: 8, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="ngg-hover"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              width: "100%",
              border: "none",
              background: "transparent",
              padding: "8px 8px",
              borderRadius: "var(--radius-lg)",
              cursor: "pointer",
              textAlign: "start",
            }}
          >
            <span
              style={{
                width: 30,
                height: 30,
                borderRadius: "50%",
                background: "var(--accent-soft)",
                color: "var(--accent-text)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: "var(--weight-extrabold)",
                fontSize: "var(--text-sm)",
                flex: "none",
              }}
            >
              {profile?.full_name.charAt(0) ?? "?"}
            </span>
            <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
              <span
                style={{
                  fontSize: "var(--text-xs)",
                  fontWeight: "var(--weight-bold)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {profile?.full_name ?? "משתמש"}
              </span>
              <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-subtle)" }}>נירם גיתן</span>
            </span>
          </button>
          {menuOpen && (
            <>
              <div onClick={() => setMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 25 }} />
              <div
                style={{
                  position: "absolute",
                  bottom: 52,
                  insetInlineStart: 8,
                  insetInlineEnd: 8,
                  zIndex: 30,
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-lg)",
                  boxShadow: "var(--shadow-lg)",
                  padding: 5,
                }}
              >
                <button
                  onClick={() => {
                    void signOut().then(() => router.replace("/login"));
                  }}
                  className="ngg-hover"
                  style={{
                    width: "100%",
                    border: "none",
                    background: "transparent",
                    fontSize: "var(--text-xs)",
                    fontWeight: "var(--weight-semibold)",
                    color: "var(--text)",
                    padding: "9px 10px",
                    borderRadius: "var(--radius-md)",
                    cursor: "pointer",
                    textAlign: "start",
                  }}
                >
                  התנתקות
                </button>
              </div>
            </>
          )}
        </div>
      </aside>

      <main style={{ flex: 1, minWidth: 0, overflowX: "hidden" }}>{children}</main>
    </div>
  );
}
