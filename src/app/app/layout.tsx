"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSessionUserId } from "@/lib/auth";
import { Spinner } from "@/components/ui";

/** Client-side auth guard. Redirects unauthenticated users to /login. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!getSessionUserId()) {
      router.replace("/login");
    } else {
      setChecked(true);
    }
  }, [router]);

  if (!checked) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--surface-sunken)" }}>
        <Spinner size={28} />
      </div>
    );
  }

  return <>{children}</>;
}
