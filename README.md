# NGG Boards — Collaborative Live Boards Platform

A production-quality MVP for an internal NGG platform where employees create
branded collaborative **boards**, activate temporary **live rooms**, invite
participants by QR code / link / room code, and display participant-generated
content (text and images) on a shared screen **in real time**.

Hebrew-first, fully RTL, built on the NGG design system.

> **It runs today with no backend.** The app ships with a local, browser-based
> data layer that provides **genuine cross-tab/window realtime** via
> `BroadcastChannel` — open the facilitator control room, the projector display,
> and a participant phone view in separate windows and watch content flow live.
> When you're ready for multi-device, cross-network realtime, follow
> **[Hooking up Supabase](#hooking-up-supabase-for-realtime)** below.

---

## Quick start

```bash
npm install
npm run dev
# open http://localhost:3000
```

- **Sign in:** any organizational email is accepted, or click **"כניסה להדגמה"**
  (enter demo). Auth is mocked locally for the MVP.
- The dashboard is pre-seeded with realistic Hebrew demo data (an active
  workshop board, a draft, a shared board, an archived board, and sample
  submissions including one awaiting approval).

### Try the full live loop locally

1. Open a board → **הפעל חדר חי** (activate live room) → you land in the
   **facilitator control room**.
2. Click **פתח תצוגה** (open display) — the projector view opens in a new tab.
3. Scan the QR (or copy the join link) and open **`/join/<publicId>`** in a
   third window sized like a phone.
4. Submit text/images from the participant view → they appear live in the
   control room and, once published, on the projector display.
5. Try pause/resume, hide/pin/focus, change layout, and end session.

```bash
npm run build      # production build
npm start          # run the production build
npm test           # unit tests (Vitest) for the high-risk paths
npm run typecheck  # strict TypeScript check
npm run seed       # dump the demo dataset to supabase/seed.local.json
```

---

## What's implemented (definition of done)

An authenticated employee can:

1. ✅ Create and visually customize a board (guided sectioned editor + live preview)
2. ✅ Configure text and image submissions, names, anonymity, limits, moderation
3. ✅ Activate a **fresh** live room (or continue a previous session)
4. ✅ Display a QR code, join link, and room code
5. ✅ Open a clean 16:9 projector display (card wall / mosaic / live feed)
6. ✅ Receive participant submissions from a mobile browser **in real time**
7. ✅ Moderate: approve / reject / hide / restore / delete (with undo) / pin / focus
8. ✅ Pause and resume submissions; read-only mode
9. ✅ Auto-suspend the room after 30 minutes of inactivity (server-timestamp based)
10. ✅ Reactivate a suspended room without losing content
11. ✅ Review previous sessions (session history + results)
12. ✅ Export a visual record of the session (PNG)

Plus: login, dashboard with all views/search/filters, board detail, org admin
overview, template gallery placeholder, and intentional empty / loading /
paused / suspended / offline / not-found / permission states throughout.

---

## Architecture summary

**Stack:** Next.js 15 (App Router) · React 19 · TypeScript (strict) · Tailwind
(wired to NGG design tokens) · Zod · `qrcode` · `html-to-image`.

**The key design decision** is a single data-layer contract behind which either
backend can sit:

```
UI (screens/components)
        │  imports `db` + `useLiveQuery`
        ▼
src/lib/data/local-db.ts        ← concrete local backend (localStorage)
src/lib/data/realtime.ts        ← BroadcastChannel realtime bus
        ▲
        └── swap for SupabaseDB (same method surface) — see the .example file
```

- **`src/lib/types.ts`** — the domain model; column names are snake_case to line
  up 1:1 with the Postgres schema in `supabase/migrations`.
- **`src/lib/data/local-db.ts`** — every operation the UI needs (boards, rooms,
  participants, submissions, moderation, activity, session history, inactivity).
  Persists to `localStorage`; publishes a realtime signal on every mutation;
  reloads its cache when another tab writes.
- **`src/lib/data/realtime.ts`** — transport abstraction. Local impl uses
  `BroadcastChannel`; the Supabase impl uses `supabase.channel(...)` +
  `postgres_changes`. UI only depends on `subscribe(scope, cb)`.
- **`src/lib/hooks.ts`** — `useLiveQuery(scope, selector)` re-runs a selector on
  matching realtime signals; the whole UI is reactive through this one hook.
- **`src/lib/useInactivity.ts`** — 25-min warning / 30-min suspend, computed from
  the stored `last_activity_at` so it survives tab reloads (and maps directly to
  a scheduled Supabase function).
- **RTL & i18n-ready:** every layout uses CSS logical properties
  (`inset-inline-*`, `border-inline-*`), Hebrew-first copy, and design tokens.

### Route structure

```
/login
/app/boards                        dashboard (views via ?view=all|shared|active|templates|archive)
/app/boards/new                    board editor (create)
/app/boards/[boardId]              board detail
/app/boards/[boardId]/edit         board editor (edit)
/app/boards/[boardId]/sessions/[roomId]  → redirects to results
/app/rooms/[roomId]/control        facilitator control room
/app/admin                         organization settings (admins only)
/display/[publicRoomId]            public projector display (fullscreen)
/join                              enter room code
/join/[publicRoomId]              participant join + submit (mobile-first)
/results/[roomId]                  session results + PNG export
```

---

## Hooking up Supabase for realtime

> **Status for the connected project (`ljrnmcpnbduuzjjnmdpw`):** the client,
> the cache-backed realtime adapter (`src/lib/data/supabase-db.ts`), the backend
> selector, and real Supabase Auth are all implemented and wired. `.env.local`
> points at the project with `NEXT_PUBLIC_DATA_BACKEND=supabase`. Verified live:
> the schema/RLS/`public_board_view` are in place, anonymous REST reads work
> from the browser, and the Realtime channel subscribes. **Remaining actions
> (yours):**
> 1. Run `supabase/migrations/0004_client_ids.sql` — **required**; the
>    participant-write RPCs the adapter calls (`join_room`/`create_submission`
>    with client-generated ids) don't exist until you do.
> 2. Run `supabase/migrations/0005_auth_bootstrap.sql` — so a signup is
>    auto-provisioned with an organization + profile.
> 3. Confirm `submissions` and `live_rooms` are in the `supabase_realtime`
>    publication (step 2 below).
> 4. Email confirmation is currently **on**, so a new signup must confirm its
>    email before first login (or enable auto-confirm under Auth → settings for
>    smoother onboarding). This is why the authenticated facilitator flow can't
>    be exercised headlessly and needs a real confirmed user.

The app is architected so this is an isolated swap — screens don't change. The
full step-by-step, for reference / a fresh project:

### 1. Create the Supabase project & apply the schema

1. Create a project at [supabase.com](https://supabase.com).
2. In **SQL Editor**, run the migrations in order:
   - `supabase/migrations/0001_init.sql` — tables, enums, indexes, triggers
   - `supabase/migrations/0002_rls.sql` — row-level security, the
     `public_board_view`, and the participant RPCs (`join_room`,
     `create_submission`, `suspend_inactive_rooms`)
   - `supabase/migrations/0003_storage.sql` — storage buckets + policies

### 2. Enable Realtime on the live tables

In **Database → Replication** (or **Realtime**), add these tables to the
`supabase_realtime` publication:

- `submissions` (new/updated content, approvals, hide/pin)
- `live_rooms` (status, layout, focus, QR overlay, participant count)

```sql
alter publication supabase_realtime add table submissions;
alter publication supabase_realtime add table live_rooms;
```

Realtime respects RLS, so anonymous participants only receive the
**published** submissions and joinable rooms allowed by the policies in
`0002_rls.sql`.

### 3. Configure Auth

- Enable **Email** (magic link or password) for organizational users under
  **Authentication → Providers**. SSO can be added later.
- Create a row in `profiles` for each user (id = their `auth.users` id), setting
  `organization_id` and `role`. See `supabase/seed.sql` for the shape.
- Keep participants anonymous — they never authenticate; they write through the
  `join_room` / `create_submission` RPCs (granted to the `anon` role).

### 4. Configure Storage

- Buckets `board-assets` (logos/backgrounds) and `submissions` (participant
  images) are created by `0003_storage.sql`, both public-read.
- Path convention: `<organization_id>/<filename>`.
- Enforce **image types only** (jpeg/png/webp/gif) and **≤ 8 MB** at upload time
  (already enforced client-side in `ImageUploadField`; add the same check in an
  Edge Function that mints signed upload URLs for participants).

### 5. Wire the environment

```bash
cp .env.example .env.local
```

Set:

```
NEXT_PUBLIC_DATA_BACKEND=supabase
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key   # server-only
NEXT_PUBLIC_APP_URL=https://boards.yourdomain.com
GIPHY_API_KEY=your-giphy-api-key                  # server-only (GIF picker)
```

### 6. The Supabase data client (already implemented)

This is done in `src/lib/data/supabase-db.ts` and selected by
`src/lib/data/index.ts` (`@supabase/supabase-js` is installed). It keeps the
app's **synchronous read API** by serving reads from an in-memory cache that:

- hydrates the org's boards/profiles after login and lazily loads a room graph
  (room → board → submissions) on first access;
- stays live via Supabase Realtime (`postgres_changes` on `submissions` and
  `live_rooms`), re-emitting the app's internal realtime signal so
  `useLiveQuery` re-renders;
- does **optimistic writes** with client-generated UUIDs (which is why the RPCs
  in `0004` accept an id) and reconciles when the authoritative row arrives.

No screen changed — every component imports `db` from `@/lib/data`.
`src/lib/data/supabase-client.ts.example` remains as an annotated reference.

### 7. Schedule the inactivity sweep

Room suspension must not depend on an open tab. Call `suspend_inactive_rooms()`
every minute via **pg_cron** or a scheduled **Edge Function**:

```sql
select cron.schedule('suspend-inactive-rooms', '* * * * *',
  $$ select suspend_inactive_rooms(); $$);
```

The client-side `useInactivityMonitor` still drives the **25-minute facilitator
warning**; the server function is the authoritative 30-minute suspension.

---

## GIF & sticker submissions (Giphy)

Participants can search and send GIFs / stickers from the Giphy library (a
third content option next to text and images; toggled per board in the editor's
participation section, `allow_giphy`).

- **Key handling:** the browser never sees the Giphy key. The picker calls the
  app's `/api/giphy` route, and the server signs the upstream request with the
  `GIPHY_API_KEY` environment variable (no `NEXT_PUBLIC_` prefix — server-only).
  Set it in `.env.local` for development and in the host's environment
  variables for production. If unset, the picker shows a friendly
  "temporarily unavailable" state; everything else keeps working.
- **Content rating** is pinned server-side to `pg` (workshop-appropriate), and
  the proxy clamps/sanitises all client-supplied parameters.
- **Storage:** a chosen GIF is a regular `image` submission whose `media_url`
  points at Giphy's CDN — a short URL, so it flows through moderation, the
  projector display, results and both data backends with no schema change.
- Hebrew searches are passed with `lang=he` for better results, and the picker
  shows trending content before the participant types.
- **Supabase backend:** run `supabase/migrations/0008_giphy.sql` (after `0007`)
  so the server-side submission policy honours `allow_giphy` — it lets a board
  accept GIFs while photo uploads are off, and vice versa.

## Manual QA checklist

**Desktop facilitator flow**
- [ ] Create board → all six sections save; live preview updates in real time
- [ ] Validation blocks save without a public title (section 1 highlights)
- [ ] Activate room → control room opens with QR, code, and join link
- [ ] Approve / reject in approval mode; hide / restore / delete with working undo
- [ ] Pin, focus (item shows on display), unfocus
- [ ] Pause → participants blocked; resume → accepting again
- [ ] Change layout live without losing content
- [ ] End session → confirmation → results page

**Mobile participant flow**
- [ ] Join by link and by 6-digit code
- [ ] Name required / optional / disabled behaves per board config
- [ ] Text submit with char counter; image capture + gallery + replace/remove
- [ ] GIF/sticker picker: trending on open, Hebrew search, tab switch, load more, replace, caption, send
- [ ] Correct confirmation (published vs "waiting for approval")
- [ ] Blocked from submitting to paused / suspended / ended rooms
- [ ] Duplicate + rapid-submit protection
- [ ] Multiple submissions vs single-submission limit

**Projector display**
- [ ] Card wall / mosaic / live feed all readable from a distance
- [ ] Handles 1, 5, 20, 100 submissions (pagination cycles above one screen)
- [ ] Focus mode, QR overlay, paused/suspended/ended overlays
- [ ] New content animates in (respects reduced-motion)

**Cross-cutting**
- [ ] RTL correct across all screens (nav, forms, cards, overlays)
- [ ] Realtime across windows (participant → control → display)
- [ ] Offline/reconnect banner on the participant view
- [ ] Empty states: no boards, no shared, no active rooms, empty moderation queue
- [ ] Permission: non-admin redirected from `/app/admin`; room/board not-found states
- [ ] Inactivity: 25-min warning appears; 30-min auto-suspend; reactivate restores

---

## Testing

`npm test` runs Vitest against the highest-risk paths (see
`src/lib/data/local-db.test.ts`): board creation & validation, room activation,
participant join, immediate vs approval publishing, approval flow, hide/restore
+ focus drop, **inactivity suspension**, reactivation, organization isolation,
file-type validation, and text sanitisation.

---

## Known limitations & next increments

**Current MVP limitations**
- **Local backend is single-browser.** `BroadcastChannel` realtime works across
  tabs/windows on one machine (great for a demo and for a facilitator+projector
  on one laptop) but not across devices or networks — that's what the Supabase
  step delivers. Data lives in `localStorage`.
- **Auth is mocked** (any org email / demo button). Replace with Supabase Auth.
- **Images are stored as compressed data URLs** in `localStorage` on the local
  backend, so very large or numerous images can hit the storage quota. Supabase
  Storage removes this limit.
- Sharing implements private / selected / organization (team & link-only are
  modeled but not fully surfaced in the UI).
- Two remaining transitive npm audit advisories come from Next.js's bundled
  build dependencies; the only "fix" downgrades Next to v9 (a breaking
  regression), so we stay on the latest patched 15.x line.

**Recommended next increments** (architecture already leaves room)
- Voting & reactions; multi-stage guided activities; board sections/categories
- Reusable organizational templates (gallery is stubbed)
- AI clustering & session summaries; advanced analytics
- CSV / PDF / PowerPoint export (PNG shipped)
- SSO, audit logs, retention policies, multiple simultaneous facilitators,
  external guest facilitators, white-label client themes

---

## Design system

Built on the **NGG design system** (magenta `#EC2A8C` + metallic-silver/ink
ramps, Heebo type, sharp geometric radii, restrained motion). Tokens live in
`src/styles/tokens/` and are consumed both directly (CSS variables) and via
Tailwind. Brand assets are in `public/brand/`.

> Note: the design system's Hebrew font is currently **Heebo** (a documented
> stand-in). If NGG's licensed brand font files are available, drop the `.woff2`
> files into the project and replace the `@import` in
> `src/styles/tokens/fonts.css`.
