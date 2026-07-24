# Deploying NGG Boards to Vercel

Vercel is the recommended host — it runs Next.js 15 natively, keeps the clean
join/display URLs participants rely on, and needs no code changes. No
`vercel.json` is required; Vercel auto-detects the framework.

## 1. Connect the repository

1. Sign in at [vercel.com](https://vercel.com) with the GitHub account that has
   access to `NGG-Global/NGGBoard`.
2. **Add New… → Project → Import** `NGG-Global/NGGBoard`.
3. Framework preset: **Next.js** (auto-detected). Leave build & output settings
   at their defaults (`next build`).
4. Pick the branch to deploy (e.g. `main` after merge, or the feature branch for
   a preview).

## 2. Set environment variables

Under **Settings → Environment Variables**, add these for **Production** (and
Preview if you want preview deploys to hit Supabase too):

| Name | Value |
|---|---|
| `NEXT_PUBLIC_DATA_BACKEND` | `supabase` |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://ljrnmcpnbduuzjjnmdpw.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | *your anon (public) key* |
| `NEXT_PUBLIC_APP_URL` | your Vercel URL, e.g. `https://ngg-boards.vercel.app` |
| `GIPHY_API_KEY` | *your Giphy API key* (server-only secret — enables the participant GIF/sticker picker) |
| `YOUTUBE_API_KEY` | *your YouTube Data API v3 key* (server-only secret — enables video search; link-paste works without it) |

The four `NEXT_PUBLIC_*` entries are public client values (the anon key is
designed to ship in the browser bundle). `GIPHY_API_KEY` is a **server-only
secret**: it is read exclusively by the `/api/giphy` route and must not be
renamed with a `NEXT_PUBLIC_` prefix. Do **not** add the Supabase service-role
key here — it's only for the server-side inactivity sweep (Supabase Edge
Function / pg_cron).

> To leave production on the safe local demo backend instead, set
> `NEXT_PUBLIC_DATA_BACKEND=local` (or omit it).

## 3. Point Supabase Auth at the deployed domain

In the Supabase dashboard → **Authentication → URL Configuration**:

- **Site URL:** your Vercel production URL.
- **Redirect URLs:** add the Vercel URL (and any preview domains) so signup
  confirmation / magic-link emails return users to the app.

## 4. Deploy & verify

1. Click **Deploy**. First build takes ~1–2 minutes.
2. Open the URL → you should land on the login screen (Supabase mode).
3. Complete the four Supabase setup steps from the README's *Hooking up
   Supabase* section (run migrations `0004` + `0005`, confirm the two tables are
   in the `supabase_realtime` publication, confirm the signup email or enable
   auto-confirm).
4. Sign up → create and activate a board → open the display and join from a
   phone. Submissions should flow live across devices.

## ⚠️ Keep joining OPEN — disable Vercel Deployment Protection

Participants scan a QR / open a link with **no account**. Vercel can put an
authentication wall in front of the whole site, which would block them. The app
itself never gates `/join`, `/display`, or `/results` (no auth guard, no
middleware — verified), so any lock comes from Vercel settings:

1. **Vercel dashboard → Project → Settings → Deployment Protection.**
   - **Vercel Authentication:** set to **Disabled** for **Production** (it's ON
     for Preview by default). If you must protect previews, that's fine — just
     never share a *preview* QR/link with participants.
   - **Password Protection:** **Off** (or it prompts every participant).
   - **Trusted IPs:** **Off** (it would block participants' networks).
2. **Always run live sessions from the PRODUCTION domain.** Preview URLs
   (`…-git-branch-….vercel.app`) are protected by default, and the QR/link the
   app generates points at whatever origin the facilitator is on — so if the
   facilitator opens a preview URL, the QR will point to a locked preview.

### Verify joining is open (run after deploy)

```bash
# Should print 200. A 401 means Deployment Protection is still on.
curl -s -o /dev/null -w "%{http_code}\n" https://YOUR-DOMAIN/join
```

Or open `https://YOUR-DOMAIN/join` in a private browser window with no Vercel
account — you should see the room-code entry screen, not a Vercel login.

## Custom domain (optional)

**Settings → Domains** → add e.g. `boards.nggconsult.com`, then update
`NEXT_PUBLIC_APP_URL` and the Supabase redirect URLs to match. If you want the
short `ngg.live/739428` join links shown in the UI to be real, point that host
at the app and update the display copy in `src/lib/constants.ts`
(`JOIN_LINK_LABEL_HOST`).

## Notes

- Every push to the connected branch triggers an automatic deploy; PRs get
  preview URLs.
- Security headers are set in `next.config.mjs`.
- The 30-minute auto-suspend has a server-authoritative path
  (`suspend_inactive_rooms()`); schedule it via Supabase pg_cron / an Edge
  Function (see README) since Vercel's hobby tier has no always-on cron.
