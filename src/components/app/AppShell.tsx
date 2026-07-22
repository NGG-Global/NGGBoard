"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useState } from "react";
import { getCurrentProfile, signOut } from "@/lib/auth";
import { useLiveQuery, useMediaQuery, useMounted } from "@/lib/hooks";
import { db } from "@/lib/data";
import {
  IconArchive,
  IconFolder,
  IconGrid,
  IconMenu,
  IconPlus,
  IconSettings,
  IconTemplate,
  IconUsers,
  IconX,
} from "@/components/ui/icons";
import { LiveDot, useToast } from "@/components/ui";
import { BOARD_DND_MIME, DashDndProvider, useDashDnd } from "./dnd";

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
  const [menuOpen, setMenuOpen] = useState(false);
  const mobile = useMediaQuery("(max-width: 860px)");
  const [navOpen, setNavOpen] = useState(false);

  return (
    <DashDndProvider>
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
      {/* Mobile backdrop */}
      {mobile && navOpen && (
        <div onClick={() => setNavOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(8,8,16,.45)", zIndex: 85 }} />
      )}

      <aside
        // On mobile the sidebar becomes a right-anchored slide-in drawer.
        onClick={(e) => { if (mobile && (e.target as HTMLElement).closest("a")) setNavOpen(false); }}
        style={{
          width: mobile ? 268 : 216,
          flex: "none",
          background: "var(--surface)",
          borderInlineEnd: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          padding: "18px 12px",
          ...(mobile
            ? {
                position: "fixed",
                top: 0,
                right: 0,
                height: "100vh",
                zIndex: 90,
                transform: navOpen ? "translateX(0)" : "translateX(100%)",
                transition: "transform .25s var(--ease-out, ease)",
                boxShadow: navOpen ? "var(--shadow-xl)" : "none",
              }
            : { position: "sticky", top: 0, height: "100vh" }),
        }}
      >
        {mobile && (
          <button
            onClick={() => setNavOpen(false)}
            aria-label="סגירת התפריט"
            className="ngg-hover"
            style={{ position: "absolute", top: 14, insetInlineStart: 12, border: "none", background: "transparent", color: "var(--text-muted)", cursor: "pointer", padding: 4, borderRadius: "var(--radius-sm)", display: "flex" }}
          >
            <IconX size={18} />
          </button>
        )}
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

        <FolderNav current={current} activeFolder={activeFolder} />

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

      <main style={{ flex: 1, minWidth: 0, overflowX: "hidden" }}>
        {mobile && (
          <div style={{ position: "sticky", top: 0, zIndex: 40, display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
            <button
              onClick={() => setNavOpen(true)}
              aria-label="פתיחת התפריט"
              className="ngg-hover"
              style={{ border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", cursor: "pointer", padding: "7px 9px", borderRadius: "var(--radius-md)", display: "flex" }}
            >
              <IconMenu size={18} />
            </button>
            <Image src="/brand/ngg-logo.png" alt="NGG" width={68} height={22} style={{ height: 22, width: "auto" }} />
            {activeCount > 0 && (
              <span style={{ marginInlineStart: "auto", display: "inline-flex", alignItems: "center", gap: 6, background: "var(--accent-soft)", color: "var(--accent-text)", fontSize: "var(--text-2xs)", fontWeight: "var(--weight-bold)", padding: "3px 9px", borderRadius: "var(--radius-pill)" }}>
                <LiveDot />
                {activeCount} פעיל
              </span>
            )}
          </div>
        )}
        {children}
      </main>
    </div>
    </DashDndProvider>
  );
}

/**
 * The sidebar "folders" section: create, filter, and drop boards onto folders.
 * Lives in its own component so it can consume the drag context provided above.
 */
function FolderNav({ current, activeFolder }: { current: DashView; activeFolder: string | null }) {
  const toast = useToast();
  const dnd = useDashDnd();
  const folders = useLiveQuery("board-list", () => db.listFolders());
  const [adding, setAdding] = useState(false);
  const [newFolder, setNewFolder] = useState("");
  const [dropTarget, setDropTarget] = useState<string | null>(null); // folder name, or "__unfiled"
  const [draggingFolder, setDraggingFolder] = useState<string | null>(null);

  function reorder(targetName: string) {
    if (!draggingFolder || draggingFolder === targetName) return;
    const order = folders.map((f) => f.name).filter((n) => n !== draggingFolder);
    const idx = order.indexOf(targetName);
    order.splice(idx < 0 ? order.length : idx, 0, draggingFolder);
    db.reorderFolders(order);
    setDraggingFolder(null);
    setDropTarget(null);
  }

  function createFolder() {
    const clean = newFolder.trim();
    if (clean) db.createFolder(clean);
    setNewFolder("");
    setAdding(false);
  }

  function dropBoard(e: React.DragEvent, folder: string | null) {
    e.preventDefault();
    const id = e.dataTransfer.getData(BOARD_DND_MIME) || dnd.draggingId;
    setDropTarget(null);
    dnd.end();
    if (!id) return;
    const before = db.getBoard(id);
    if (before && (before.folder ?? null) === folder) return; // no-op
    db.setBoardFolder(id, folder);
    toast.show(
      folder ? `הלוח הועבר לתיקייה "${folder}"` : "הלוח הוסר מהתיקייה",
      before ? () => db.setBoardFolder(id, before.folder) : undefined,
    );
  }

  const dragging = !!dnd.draggingId;

  return (
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

      {folders.length === 0 && !adding && !dragging && (
        <div style={{ padding: "2px 10px 4px", fontSize: "var(--text-2xs)", color: "var(--text-subtle)", lineHeight: "var(--leading-snug)" }}>
          צרו תיקייה כדי לארגן את הלוחות — או גררו לוח לכאן
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 260, overflowY: "auto" }}>
        {folders.map((f) => {
          const active = current === "all" && activeFolder === f.name;
          const over = dropTarget === f.name;
          return (
            <Link
              key={f.name}
              href={`/app/boards?view=all&folder=${encodeURIComponent(f.name)}`}
              aria-current={active ? "page" : undefined}
              // Draggable to reorder; also a drop target for board filing.
              draggable
              onDragStart={(e) => { setDraggingFolder(f.name); e.dataTransfer.effectAllowed = "move"; }}
              onDragEnd={() => { setDraggingFolder(null); setDropTarget(null); }}
              onDragOver={(e) => {
                const reordering = draggingFolder && draggingFolder !== f.name;
                if (dragging || reordering) { e.preventDefault(); setDropTarget(f.name); }
              }}
              onDragLeave={() => setDropTarget((t) => (t === f.name ? null : t))}
              onDrop={(e) => { if (draggingFolder) { e.preventDefault(); reorder(f.name); } else dropBoard(e, f.name); }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 10px",
                borderRadius: "var(--radius-lg)",
                background: over ? "var(--accent)" : active ? "var(--accent-soft)" : "transparent",
                color: over ? "#fff" : active ? "var(--accent-text)" : "var(--text-muted)",
                outline: over && !draggingFolder ? "2px solid var(--accent)" : "none",
                opacity: draggingFolder === f.name ? 0.4 : 1,
                borderTop: over && draggingFolder ? "2px solid var(--accent)" : "2px solid transparent",
                transition: "background .12s",
                fontSize: "var(--text-sm)",
                fontWeight: active || over ? "var(--weight-bold)" : "var(--weight-semibold)",
                cursor: "grab",
              }}
            >
              <IconFolder size={15} />
              <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.name}</span>
              {f.count > 0 && (
                <span style={{ fontSize: "var(--text-2xs)", color: over ? "#fff" : active ? "var(--accent-text)" : "var(--text-subtle)" }}>{f.count}</span>
              )}
            </Link>
          );
        })}

        {/* Unfile drop target — only while dragging. */}
        {dragging && (
          <div
            onDragOver={(e) => { e.preventDefault(); setDropTarget("__unfiled"); }}
            onDragLeave={() => setDropTarget((t) => (t === "__unfiled" ? null : t))}
            onDrop={(e) => dropBoard(e, null)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 10px",
              marginTop: 2,
              borderRadius: "var(--radius-lg)",
              border: "1.5px dashed var(--border-strong)",
              background: dropTarget === "__unfiled" ? "var(--accent)" : "transparent",
              color: dropTarget === "__unfiled" ? "#fff" : "var(--text-subtle)",
              fontSize: "var(--text-xs)",
              fontWeight: "var(--weight-semibold)",
            }}
          >
            הסרה מתיקייה
          </div>
        )}
      </div>
    </div>
  );
}
