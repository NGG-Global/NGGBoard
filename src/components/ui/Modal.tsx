"use client";

import React, { useEffect } from "react";
import { Button } from "./Button";
import { useI18n } from "@/lib/i18n/react";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  labelledBy?: string;
  width?: number;
}

export function Modal({ open, onClose, children, labelledBy, width = 400 }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(8,8,16,.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 80,
        padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface)",
          borderRadius: "var(--radius-2xl)",
          padding: 26,
          width: "100%",
          maxWidth: width,
          display: "flex",
          flexDirection: "column",
          gap: 14,
          boxShadow: "0 24px 60px rgba(8,8,16,.35)",
          fontFamily: "var(--font-sans)",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        {children}
      </div>
    </div>
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "אישור",
  cancelLabel = "ביטול",
  danger,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useI18n();
  return (
    <Modal open={open} onClose={onCancel} labelledBy="confirm-title" width={400}>
      <h2 id="confirm-title" style={{ fontSize: "var(--text-lg)", fontWeight: "var(--weight-extrabold)" }}>
        {title}
      </h2>
      {description && (
        <p style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", lineHeight: "var(--leading-normal)" }}>
          {description}
        </p>
      )}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 6 }}>
        <Button variant="ghost" onClick={onCancel}>
          {t(cancelLabel)}
        </Button>
        <Button variant={danger ? "danger" : "primary"} onClick={onConfirm}>
          {t(confirmLabel)}
        </Button>
      </div>
    </Modal>
  );
}
