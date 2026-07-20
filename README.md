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

The app is architected so this is an isolated swap — screens don't change. Follow
these steps.

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
```

### 6. Implement the Supabase data client

1. `npm i @supabase/supabase-js`
2. Rename `src/lib/data/supabase-client.ts.example` → `supabase-client.ts` and
   implement the remaining methods (the template already covers realtime
   subscriptions, board reads/writes, and the participant RPCs — the method
   names, arguments, and return shapes match `LocalDB` exactly).
3. Add `src/lib/data/index.ts` that exports the right backend:

   ```ts
   import { db as localDb } from "./local-db";
   // import { SupabaseDB } from "./supabase-client";
   export const db =
     process.env.NEXT_PUBLIC_DATA_BACKEND === "supabase"
       ? /* new SupabaseDB() */ localDb
       : localDb;
   ```

   Then update imports from `@/lib/data/local-db` to `@/lib/data`. Because the
   surface is identical, no screen needs changing. (Async note: `LocalDB`
   methods are synchronous; the Supabase versions return promises — wrap reads
   in the existing `useLiveQuery` with `await`, or keep an optimistic local
   cache and reconcile on the realtime signal.)

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
