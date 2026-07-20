"use client";

import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { UNDO_WINDOW_MS } from "@/lib/constants";

interface ToastState {
  id: number;
  message: string;
  undo?: () => void;
}

interface ToastApi {
  /** Show a toast. Provide `undo` to render an inline undo action. */
  show: (message: string, undo?: () => void) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const counter = useRef(0);

  const show = useCallback((message: string, undo?: () => void) => {
    if (timer.current) clearTimeout(timer.current);
    const id = ++counter.current;
    setToast({ id, message, undo });
    timer.current = setTimeout(() => setToast((t) => (t?.id === id ? null : t)), UNDO_WINDOW_MS);
  }, []);

  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setToast(null);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          dir="rtl"
          style={{
            position: "fixed",
            bottom: 22,
            insetInlineStart: "50%",
            transform: "translateX(-50%)",
            background: "var(--ink-800)",
            color: "#f4f4f6",
            padding: "11px 18px",
            borderRadius: "var(--radius-lg)",
            display: "flex",
            gap: 16,
            alignItems: "center",
            boxShadow: "0 10px 30px rgba(8,8,16,.35)",
            fontSize: "var(--text-sm)",
            zIndex: 90,
            maxWidth: "min(92vw, 460px)",
            animation: "ngg-toast-in .25s ease-out",
          }}
        >
          <span>{toast.message}</span>
          {toast.undo && (
            <button
              onClick={() => {
                toast.undo?.();
                dismiss();
              }}
              style={{
                border: "none",
                background: "none",
                color: "var(--magenta-300)",
                fontWeight: "var(--weight-bold)",
                fontSize: "var(--text-sm)",
                cursor: "pointer",
                padding: 0,
                whiteSpace: "nowrap",
              }}
            >
              ביטול
            </button>
          )}
        </div>
      )}
    </ToastContext.Provider>
  );
}
