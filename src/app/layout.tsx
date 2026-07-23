import type { Metadata, Viewport } from "next";
import "@/styles/globals.css";
import { ToastProvider } from "@/components/ui";
import { LanguageInit } from "@/lib/i18n/react";

export const metadata: Metadata = {
  title: "NGG Boards — לוחות חיים",
  description:
    "פלטפורמת לוחות שיתופיים לסדנאות, כנסים ומפגשי למידה של נירם גיתן. יצירת לוח, הפעלת חדר חי, והצגת תוכן משתתפים בזמן אמת.",
  icons: { icon: "/brand/ngg-mark.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ec2a8c",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body>
        <LanguageInit />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
