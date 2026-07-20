"use client";

import { useRef, useState } from "react";
import { isAllowedImageType } from "@/lib/utils";
import { IconCamera, IconImage, IconX } from "@/components/ui/icons";
import { Spinner } from "@/components/ui";

/** Compress an image file to a JPEG data URL, max `maxDim` on the long edge. */
async function compressImage(file: File, maxDim = 1400, quality = 0.72): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("decode failed"));
    image.src = dataUrl;
  });
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}

export function ImageUploadField({
  value,
  onChange,
  maxSizeMb,
}: {
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  maxSizeMb: number;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    if (!isAllowedImageType(file.type)) {
      setError("סוג הקובץ אינו נתמך. יש לבחור תמונה (JPG, PNG, WEBP).");
      return;
    }
    if (file.size > maxSizeMb * 1024 * 1024) {
      setError(`הקובץ גדול מדי — עד ${maxSizeMb}MB.`);
      return;
    }
    setBusy(true);
    try {
      const compressed = await compressImage(file);
      onChange(compressed);
    } catch {
      setError("העלאת התמונה נכשלה. נסו שוב.");
    } finally {
      setBusy(false);
    }
  }

  if (value) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ position: "relative", borderRadius: "var(--radius-xl)", overflow: "hidden", border: "1px solid var(--border)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="תצוגה מקדימה" style={{ width: "100%", maxHeight: 320, objectFit: "contain", background: "var(--bg-muted)" }} />
          <button
            onClick={() => onChange(null)}
            aria-label="הסר תמונה"
            style={{ position: "absolute", top: 8, insetInlineEnd: 8, width: 34, height: 34, borderRadius: "50%", border: "none", background: "rgba(8,8,16,.6)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
          >
            <IconX size={16} />
          </button>
        </div>
        <button
          onClick={() => galleryRef.current?.click()}
          style={{ border: "1px solid var(--border-strong)", background: "var(--surface)", borderRadius: "var(--radius-lg)", padding: "10px", fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)", cursor: "pointer" }}
        >
          החלף תמונה
        </button>
        <input ref={galleryRef} type="file" accept="image/*" onChange={handleFile} style={{ display: "none" }} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={handleFile} style={{ display: "none" }} />
      <input ref={galleryRef} type="file" accept="image/*" onChange={handleFile} style={{ display: "none" }} />
      <div style={{ display: "flex", gap: 10 }}>
        <UploadButton onClick={() => cameraRef.current?.click()} icon={<IconCamera size={22} />} label="צלמו תמונה" disabled={busy} />
        <UploadButton onClick={() => galleryRef.current?.click()} icon={<IconImage size={22} />} label="בחרו מהגלריה" disabled={busy} />
      </div>
      {busy && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-muted)", fontSize: "var(--text-sm)" }}>
          <Spinner size={16} /> מעבד תמונה…
        </div>
      )}
      {error && <div style={{ color: "var(--danger)", fontSize: "var(--text-xs)", fontWeight: "var(--weight-semibold)" }}>{error}</div>}
    </div>
  );
}

function UploadButton({ onClick, icon, label, disabled }: { onClick: () => void; icon: React.ReactNode; label: string; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        minHeight: 96,
        border: "1.5px dashed var(--border-strong)",
        background: "var(--bg-subtle)",
        borderRadius: "var(--radius-xl)",
        color: "var(--text-muted)",
        fontSize: "var(--text-sm)",
        fontWeight: "var(--weight-semibold)",
        cursor: disabled ? "wait" : "pointer",
      }}
    >
      {icon}
      {label}
    </button>
  );
}
