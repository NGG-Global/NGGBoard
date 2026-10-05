import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { AttemptLimiter, DEFAULT_ORG_EMAIL_DOMAIN, isOrgEmail, normalizeEmail, safeEqual } from "@/lib/org-login";

/**
 * Organisation shared-password sign-in.
 *
 * Any address on the org domain (default @nggconsult.com) may sign in with the
 * single server-only `ORG_SHARED_PASSWORD`. On success the user is created if
 * needed (the `handle_new_user` trigger provisions the profile) and a one-time
 * magic-link token hash is returned, which the browser exchanges for a normal
 * Supabase session via `auth.verifyOtp`. No email is sent.
 *
 * Returns 503 `not_configured` when the shared password (or service key) is
 * unset, so the client falls back to per-user Supabase passwords.
 */

export const runtime = "nodejs";

// 10 attempts per IP per 15 minutes (per server instance).
const limiter = new AttemptLimiter(10, 15 * 60 * 1000);

function clientKey(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] ?? request.headers.get("x-real-ip") ?? "unknown").trim();
}

export async function POST(request: Request) {
  const sharedPassword = process.env.ORG_SHARED_PASSWORD;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!sharedPassword || !url || !serviceKey) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  if (!limiter.allow(clientKey(request))) {
    return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
  }

  const body = (await request.json().catch(() => null)) as
    | { email?: unknown; password?: unknown; fullName?: unknown }
    | null;
  const email = typeof body?.email === "string" ? normalizeEmail(body.email) : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const fullName = typeof body?.fullName === "string" ? body.fullName.trim().slice(0, 120) : "";

  const domain = process.env.ORG_EMAIL_DOMAIN || DEFAULT_ORG_EMAIL_DOMAIN;
  if (!isOrgEmail(email, domain)) {
    return NextResponse.json({ error: "domain_not_allowed" }, { status: 403 });
  }
  if (!safeEqual(password, sharedPassword)) {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: fullName ? { data: { full_name: fullName } } : undefined,
  });
  if (error || !data?.properties?.hashed_token) {
    console.error("org-login: generateLink failed", error?.message);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  return NextResponse.json(
    { tokenHash: data.properties.hashed_token, type: data.properties.verification_type },
    { headers: { "Cache-Control": "no-store" } },
  );
}
