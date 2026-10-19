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
13. ✅ Open a board for **asynchronous collection** — one durable link,
    pinned instructions, a deadline, and a review surface for what accumulates
14. ✅ Author the board's **opening content** at edit time (text / image / video),
    present from the moment the board opens
15. ✅ **Reply** to posts — the facilitator always, participants when the board
    opts in
16. ✅ See a **real error** when a submission is refused, instead of a false
    success — and take back a mistake and send again

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
/join/[publicRoomId]/board        participant's scrollable read-only view of the board
/results/[roomId]                  session results + PNG export
```

---

## Hooking up Supabase for realtime

> **The shared NGG project.** NGG Boards no longer has a Supabase project of
> its own: it shares one with the other NGG apps (quiz, simulations, auction),
> and keeps every table, view, function and policy in the **`board` schema**
> so nothing collides. The browser client is created with
> `db: { schema: "board" }` and every Realtime subscription names the same
> schema (`DB_SCHEMA` in `src/lib/supabase.ts`).
>
> The shared project also means one `auth.users` for every app: a colleague
> signs in to the boards with the same account they use for the quiz and the
> simulations. Board access still comes only from a `board.profiles` row, which
> is created for @nggconsult.com accounts only.

The app is architected so this is an isolated swap — screens don't change. The
full step-by-step, for reference / a fresh project:

### 1. Apply the schema

In the shared project's **SQL Editor**, run every file in
`supabase/migrations` in order, starting with `0000_app_schema.sql` (it creates
the `board` schema and its grants). Each later file starts with
`set search_path to board;`, so its objects land in that schema. Then:

- **Project Settings → Data API → Exposed schemas:** add `board`. Until you
  do, every request fails with `Invalid schema: board`.
- `0012_shared_project_profiles.sql` gives a profile to every @nggconsult.com
  account that existed before the schema was installed.

### 2. Realtime

`0007_hardening.sql`, `0008_folders.sql` and `0010_open_collection.sql` add the
live tables (`board.submissions`, `board.live_rooms`,
`board.participant_sessions`, `board.boards`, `board.folders`,
`board.submission_comments`) to the `supabase_realtime` publication. To check:

```sql
select tablename from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'board';
```

Realtime respects RLS, so anonymous participants only receive the
**published** submissions and joinable rooms allowed by the policies in
`0002_rls.sql`.

### 3. Configure Auth

Auth settings are shared by every app in the project:

- **Authentication → URL Configuration → Redirect URLs** must include this
  app's domain. Sign-up passes `emailRedirectTo` (the app's own origin), so the
  confirmation link returns here rather than to the project's Site URL, which
  belongs to whichever app was set up first.
- New accounts get a profile from the `board_on_auth_user_created` trigger
  (`0005`, `0011`); sign-up is limited to @nggconsult.com.
- Keep participants anonymous — they never authenticate; they write through the
  `join_room` / `create_submission` RPCs (granted to the `anon` role).

### 4. Configure Storage

- Buckets `board-assets` (logos/backgrounds) and `board-submissions`
  (participant images) are created by `0003_storage.sql`, both public-read.
  Bucket ids are project-wide, hence the `board-` prefix.
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
YOUTUBE_API_KEY=your-youtube-data-api-key         # server-only (video search)
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

## Open collection boards (asynchronous)

A board can be put to work in one of two modes, chosen in the activation dialog:

- **מפגש חי** (`LiveRoom.mode = "live"`) — a facilitated session happening now.
  Unchanged behaviour: 25-minute warning, 30-minute auto-suspend, projector
  auto-cycling.
- **לוח פתוח לאיסוף** (`mode = "open"`) — the facilitator publishes the link
  once and participants contribute over days or weeks.

**The consequential rule:** an open room is never suspended for inactivity.
Days of quiet are its normal state, and a link that dies 30 minutes after being
sent reads to a participant as a broken system. It closes at `closes_at`
instead, or when the facilitator closes it. This is enforced in three places
that must agree — `src/lib/rooms.ts` (`accruesIdleTime` / `dueRoomStatus`), both
data backends' `checkAndApplyInactivity`, and `suspend_inactive_rooms()` in
`supabase/migrations/0010_open_collection.sql`.

Closing sends the room to **`read_only`**, not `ended`: collected content stays
on the board for review and presentation, and the board keeps counting it as its
current collection rather than dropping back to "no room yet". Ending it is a
separate, deliberate act.

- **`Board.instructions`** — the facilitator's multi-line brief, shown on the
  participant's opening screen, on the returning-participant screen, and pinned
  above the board in the guest view. Deliberately separate from
  `public_subtitle`, which is a one-line strapline sized for the projector
  header and cannot carry a brief. On an open board no facilitator is present to
  explain the task, which makes this the participant's only context.
- **Moderation defaults to approval** for open boards (nobody is watching content
  arrive), which only protects anyone if the queue is impossible to miss — hence
  the pending-count badge on the dashboard card and in the collection panel.
- **The facilitator's surface** is `CollectionPanel` on the board detail page:
  link + QR + code, copy and WhatsApp share, counts, pending queue, and deadline
  editing. The live control room is deliberately not reused — it is a
  projector-side cockpit for a room you are standing in front of.
- **Participant-facing states** are stated in the participant's own terms:
  "אפשר לשלוח עד <date>" while open, "האיסוף נסגר" afterwards (never a blank
  error), and "הקישור נשאר פעיל" on the confirmation screen.
- **Deadline enforcement is server-side too.** `create_submission` and
  `join_room` both reject a past-deadline open room independently of the sweep
  having run — a deadline enforced only in the browser is not enforced at all.
- **Supabase:** run `supabase/migrations/0010_open_collection.sql` (after
  `0009`). It adds `live_rooms.mode` / `live_rooms.closes_at` /
  `boards.instructions`, rewrites the sweep and the two participant RPCs, and
  re-creates `public_board_view` with the new fields.

**Known limitation, stated plainly:** a returning participant is recognised by a
`localStorage` key per browser (`ngg_participant_<publicId>`). Someone who
switches from phone to laptop, or clears their browser, arrives as a new
participant. Closing that properly means identifying people (an email or SMS
code), which contradicts the no-login promise that makes the participant side
work at all. The limitation is accepted rather than papered over.

## The board's opening content

The facilitator can author posts while building the board — guidance cards, a
reference image, a video to watch first — and they are on the board from the
moment it opens (editor section 8, "תוכן פתיחה של הלוח").

They live on the **board** (`Board.seed_posts`, jsonb) rather than as
submissions, because the board is edited before any room exists for a submission
to belong to. Activating a room copies them into that room's submissions, so
every session of the board opens with the same framing and the posts flow
through moderation, the display, results and PNG export as ordinary rows.

That copy is what forces two schema changes: a facilitator's post has no
participant session, so `submissions.participant_session_id` becomes nullable and
`submissions.author_profile_id` records who wrote it instead. Exactly one of the
two is set (enforced by a check constraint).

Consequences worth knowing:

- **Facilitator posts publish outright**, even on an approval board — sending her
  own guidance to her own approval queue would leave the board blank until she
  approved herself.
- **They don't count as contributions.** `db.countContributions(roomId)` excludes
  them, so the collection panel and dashboard card don't report a board holding
  three guidance cards as one with three contributions.
- **They're always attributed to the facilitator**, with a "מנחה" badge. The
  board's `hide_identity_on_display` setting protects participants; labelling the
  facilitator's own guidance "אנונימי" would read as a stray answer.
- **Continuing a previous session** carries participant content only. The current
  seed posts are materialized fresh, so continuing never doubles a guidance card
  and never resurrects wording that has since been edited.
- **Videos take a pasted link**, not the participant search picker: a facilitator
  at a desk already has the URL, and paste-only needs no YouTube API key. The
  stored URL is rebuilt from the parsed video id, never kept as typed.
- The editor's live preview shows the real opening cards once the board has any —
  it claims to show how the board will look, so it has to.

## Replies on posts

Any post on the board can be replied to (`submission_comments`).

- **The facilitator can always reply**, from the control room's published tab.
  She can also delete any reply.
- **Participants can reply only when the board opts in** —
  `participation.allow_participant_comments`, default **off**. A board where
  participants discuss each other's contributions is a different kind of board
  and should be a deliberate choice.
- **Threads appear on the guest board view and in the moderation card, never on
  the projector.** Reply text is unreadable from across a room and the projector
  is deliberately spare. `DisplayCanvas` takes a `renderFooter` render prop so
  the display components stay unaware that comments exist at all.
- **Replies follow their post.** Deleting or clearing a post soft-deletes its
  replies; a reply is never visible when the post it hangs off is not.
- **Server-side:** participants write through the `create_comment` RPC, which
  enforces room state, the collection deadline, session validity, a 3s rate
  limit, length caps and the board's blocked words.
- One deliberate departure from the file's convention: the
  `allow_participant_comments` check in `create_comment` **fails closed**, unlike
  the fail-open participation checks in `create_submission`. Participant replies
  are opt-in and default to off, so a board whose config predates the feature
  (no key at all) must not accept them — fail-open there would silently switch
  the feature on for every existing board.

## Sessions that looked empty on Supabase

**Symptom (reported after live sessions):** a session's content was missing
from its summary (`/results/<roomId>`), the board's session history counted
0 items, and a control room reopened from the dashboard or the board page
showed a blank board. Several sessions had also been suspended mid-session.

**Cause.** `SupabaseDB` serves reads from a cache and loads a room's content
the first time the room is asked for — but it decided "asked for before" by
whether the room *row* was cached. The dashboard, the active-rooms list and a
board's session history all cache room rows in bulk, without their content.
After visiting any of them, the summary, the history counts and the control
room found the row, assumed the room was loaded, and never read its posts or
opened its realtime channel. Two consequences:

1. **Stored content looked missing.** It was in the database all along; it was
   only never read. Pause, suspend and end never delete content (only an
   explicit delete, "reset board", "reset session" or a participant removing
   their own post does).
2. **Busy rooms were suspended, and posts then refused.** A control room with no
   channel never heard participants posting, so its idle timer ran on a stale
   `last_activity_at`, and 30 minutes later it suspended the room in the
   database. From then until someone reactivated it, the server refused every
   participant post (`room_not_accepting`). **Those posts were never stored and
   cannot be recovered.**

**Fix.** A room counts as loaded only once its content is in the cache
(`roomsWithContent`) and, for a facilitator's screen, its channel is open.
Session history, the dashboard's last-session line and the collection counters
read a room's content to count it (without opening a channel), and the board
page now refreshes when it arrives. The in-tab inactivity check re-reads the
room from the server before suspending, so a stale cache can no longer suspend
a busy room; the scheduled server sweep remains the authoritative suspender.
A failed content read is retried after a few seconds rather than on every
render.

Also fixed in the same pass: **"continue a previous session" now carries the
previous session's content on Supabase too.** It used to create an empty room
while the UI announced "a new session opened with the content collected". It
copies the participants' posts of the board's most recent ended session, as the
local backend does.

**Recovering an affected session.** Open its summary (board → session history →
the session) on a build with this fix; the stored content appears, and
**ייצוא כתמונה** exports it as a PNG. To check what is stored for recent
sessions, run this read-only query in the Supabase SQL editor:

```sql
select b.public_title, r.session_label, r.started_at, r.ended_at, r.status,
       r.participant_count,
       count(s.id) filter (where s.status = 'published') as published,
       count(s.id) filter (where s.status in ('pending', 'hidden', 'rejected')) as not_published
from live_rooms r
join boards b on b.id = r.board_id
left join submissions s on s.room_id = r.id
where r.started_at >= now() - interval '2 days'
group by r.id, b.public_title
order by r.started_at desc;
```

The summary shows **published** content only; posts still `pending` on an
approval board (never approved) are counted in `not_published`.

## When a participant's submission is refused

Participant writes on the Supabase backend are optimistic: the row lands in the
local cache and the RPC follows. Until this was fixed, an RPC rejection reached
only `console.warn`, and `ParticipantFlow` called `onDone()` on a 350ms timer
regardless — so a participant whose submission the server refused was still shown
**"התוכן שלכם עלה על הלוח"**.

`create_submission` has eight legitimate rejection paths (`invalid_session`,
`rate_limited`, `already_submitted`, `blocked_word`, `room_not_accepting`,
`text_too_long`, `*_not_allowed`, `invalid_video_url`) and every one of them
produced a success screen. On an **approval-mode board this was worse than a
silent drop**: the participant was told they were waiting for the facilitator
while the facilitator's queue was empty, so neither side had a reason to suspect
anything.

Three compounding effects made it hit only *some* participants and made a mistake
unrecoverable:

1. **`joinRoom` was fire-and-forget too.** A refused join left the participant
   holding a session id the server never created; from then on *every* submission
   failed `invalid_session`, silently, for as long as they kept the page open.
2. **The refused row was never rolled back.** It stayed in the client cache and
   poisoned the client's own guards — `limitReached` counted it, and the
   duplicate check refused to resend the same text. The client was refusing to
   resend something the server never received.
3. **`participation.allow_participant_delete` was read nowhere.** It has existed
   since the first schema and defaults to **true**, so boards were configured to
   let participants take their own post down while the UI never offered it. On a
   single-submission board, one mistake ended that person's participation.

What changed:

- `src/lib/write-errors.ts` maps a Postgres exception to a reason and a plain
  Hebrew message. Anything unrecognised becomes `unknown` rather than being
  guessed at.
- `SupabaseDB` tracks each participant write and exposes
  **`awaitWrite(id)`** — resolves on acceptance, rejects with a `WriteFailure`.
  On rejection it **rolls the optimistic row back** so nothing is left to trip
  over. `LocalDB.awaitWrite` resolves immediately (its write already happened).
- Every submit path awaits confirmation before showing the success screen, and
  shows the real reason otherwise. `invalid_session` self-heals: the stored
  session is cleared and the participant is returned to the join screen.
- Joining waits for the server to acknowledge before storing the session and
  advancing, so a refused join can no longer poison the whole visit.
- Anonymous sessions are remembered in `localStorage` by the adapter. RLS gives
  anon no read on `participant_sessions` and the cache dies on reload, so
  previously a participant who refreshed always came back as a *new* person —
  detached from what they had sent, and inflating `participant_count`.
- **"טעיתי — הסרה ושליחה מחדש"** on the done and limit-reached screens, honouring
  `allow_participant_delete` and backed by the `delete_own_submission` RPC
  (part 4 of migration 0010), which re-checks ownership server-side. Removing
  frees a single-submission board so the corrected answer can be sent.

## The shared screen at any resolution

The projector display and the board in the control room size everything —
cards, type, avatars, the header, the join QR and the overlays — in `em` off one
unit (`.ngg-stage-type` in `src/styles/globals.css`) that follows the size of
the board area. A 1280×720 projector and a 1920×1080 one therefore show the same
composition, instead of the larger screen leaving fixed-size cards huddled in
the middle at a size nobody at the back can read. The unit is bounded: never
under 15px (legible on a low-resolution projector), never over 34px (a 4K screen
keeps a sensible number of cards per screen). It uses container units, so the
control room's board scales to the space left beside the drawer; browsers
without them fall back to viewport units. The guest phone view and the results
export keep a fixed 16px base and are unaffected.

Room states (paused, view-only, suspended) are shown as a pill in the header
beside the title, never over it, and the QR overlay is opaque so the code, room
number and link stay readable.

### Fit to screen: the whole session at once

A projector is read by a room, not scrolled by it. The shared screen (and the
board in the control room) therefore fits itself: the content area is sized in
`em` of a `--density` multiplier, and `src/components/display/fit.ts` picks the
largest density at which every card is on screen. Cards, gaps and column widths
shrink together, so a smaller density puts more cards in each row rather than
only making them shorter. The header eases off gently with it (never below three
quarters of its size), and the NGG logo sits in the bottom corner instead of
taking a row.

- **Scrolling is the exception.** The fit stops at a legibility floor — type of
  about 0.93% of the screen's height (10px on 1080p, so card text ≈13.5px), and
  never under 8 physical pixels. Only a session too large to fit above that
  scrolls. A laptop at 125–150% display scaling gets the same composition as a
  1080p screen.
- **Large sessions get compact cards.** From 13 cards the wall wraps into as many
  cards per row as fit, long answers clamp to a few lines and photos become a
  wide, short strip. The facilitator can focus any card to show it full size.
- **Measured capacity** on one screen before any scrolling (mixed short, medium
  and long answers with some photos):

  | Screen | Wall | Mosaic | Zones (3) | Feed |
  | --- | --- | --- | --- | --- |
  | 1920×1080 | 60 | 60–80 | 40–55 | ~9 |
  | 1280×720 | 40 | 40 | 24–34 | ~8 |

  The feed is a single column by definition and reaches the floor early; for a
  large group, use the wall or mosaic.
- It re-fits before paint whenever cards arrive or leave, the layout or room
  state changes, the board area resizes (including opening and closing the
  control drawer), or the web font or an image finishes loading.

## Anonymous screens on Supabase

Supabase Realtime only delivers a row change to a client allowed to read the
new row, and anonymous visitors may read **published** submissions only. When
the facilitator hides, rejects or deletes a post, that change is therefore not
delivered to an anonymous screen — a projector PC nobody signed in on, or a
participant's "view the board" page — so the post would stay up there.

To close that gap, the facilitator's moderation also touches the room
(`live_rooms.last_activity_at`) once the change is stored, and anonymous screens
re-read the published set whenever the room changes. This matches the local
backend, where moderation (except pin/unpin) already counts as room activity.
Two related safeguards for screens left running for hours:

- **Bursts don't race.** One submissions reload runs per room at a time; events
  that arrive meanwhile trigger exactly one more, so an older response can
  never overwrite a newer one.
- **Reconnects catch up.** When the realtime connection drops and re-joins
  (Wi-Fi blip, laptop waking), the room is read again, because changes made
  while the socket was down are not replayed.

These paths are covered in `src/lib/data/supabase-db.test.ts` against a
scripted client. They have not been exercised against a live project from this
repository's tests; confirm on staging before an event (see the QA checklist).

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

## YouTube video submissions

Participants can search YouTube (or paste a video link) and send a video to
the board (`allow_youtube` toggle in the editor's participation section). A
pick is stored as a `video` submission whose `media_url` is the canonical
watch URL.

- **Key handling:** same pattern as Giphy — the browser calls `/api/youtube`,
  and the server signs the upstream request with the server-only
  `YOUTUBE_API_KEY` (YouTube Data API v3, created in Google Cloud Console).
  **Pasting a link needs no key at all**: the video id is parsed locally and
  the thumbnail comes from YouTube's public image CDN — so the feature
  degrades gracefully to link-paste when the key is missing.
- **Quota awareness:** a search costs 100 units of the API's default
  10,000/day quota (≈100 searches/day); identical requests are cached
  server-side for 60s. The picker's opening screen uses the cheap (1 unit)
  regional most-popular list instead of a search.
- **Display behaviour:** on the card wall a video renders as a lightweight
  thumbnail with a play badge; when the facilitator **focuses** it, it becomes
  a real embedded player (privacy-enhanced `youtube-nocookie.com`, autoplay).
  The moderation card links out to YouTube so facilitators can preview before
  approving. Embeds are always built from the parsed 11-character video id —
  never from the raw stored URL — so a crafted URL cannot inject an arbitrary
  iframe.
- **Search safety:** the proxy pins `safeSearch=strict` and only returns
  embeddable videos; Hebrew UI passes `relevanceLanguage=he` and a region of
  `IL` for the popular list.
- **Supabase backend:** run `supabase/migrations/0009_youtube.sql` (after
  `0008`) — it adds the `video` enum value and teaches `create_submission` to
  honour `allow_youtube` and validate the video URL shape.

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
- [ ] YouTube: popular on open, search, paste-link (with and without API key), preview, send; focus on display plays the video
- [ ] Correct confirmation (published vs "waiting for approval")
- [ ] Blocked from submitting to paused / suspended / ended rooms
- [ ] Duplicate + rapid-submit protection
- [ ] Multiple submissions vs single-submission limit
- [ ] "צפייה בלוח המשותף" scrolls through every item on a phone; zoned boards
      stack into sections; no horizontal overflow; the way back is one tap

**Open collection board**
- [ ] Activation dialog offers both modes with plain-language descriptions
- [ ] An open room survives 30+ minutes (and days) of inactivity — the link keeps working
- [ ] A live room on the same board still auto-suspends at 30 minutes
- [ ] Instructions appear on the join screen AND for a returning participant
- [ ] Deadline shown as a date; past it, participants see "האיסוף נסגר", not an error
- [ ] Collection panel: copy link, QR, code, WhatsApp, counts, pending badge
- [ ] Extending the deadline on a closed collection reopens it
- [ ] Dashboard card shows "פתוח לאיסוף" plus the pending-approval count

**Board opening content**
- [ ] Editor section 8 adds text / image / video items, reorders and removes them
- [ ] A pasted YouTube link previews a thumbnail; a bad link shows an error
- [ ] The live preview shows the real opening cards with a "מנחה" badge
- [ ] Activating a room opens the board with that content already on it
- [ ] It publishes even on an approval board, and is not counted as a contribution
- [ ] Continuing a previous session shows one copy, with the current wording

**Replies**
- [ ] Facilitator can reply from the control room's published tab, and delete replies
- [ ] With `allow_participant_comments` off, the guest board shows no reply box
- [ ] With it on, a participant can reply and is attributed correctly
- [ ] Replies never appear on the projector
- [ ] Deleting a post removes its replies

**Refused submissions and recovery**
- [ ] A refused submission shows the reason, not "התוכן שלכם עלה על הלוח"
- [ ] The same text can be resent after a refusal (no phantom row blocking it)
- [ ] A dead session returns the participant to the join screen with an explanation
- [ ] A participant who refreshes keeps their identity and their sent items
- [ ] "טעיתי — הסרה ושליחה מחדש" frees a single-submission board
- [ ] A participant cannot remove someone else's post or the board's opening content

**Projector display**
- [ ] Card wall / mosaic / live feed all readable from a distance
- [ ] Handles 1, 5, 20, 60, 100 submissions: everything on one screen up to ~60 at 1080p; scrolls only beyond
- [ ] Focus mode, QR overlay, paused/suspended/ended overlays
- [ ] Same composition at 1280×720, 1920×1080 and 1024×768; nothing tiny on the large screen
- [ ] The paused pill sits beside the title, never over it; the QR overlay is opaque
- [ ] The control-room board reads right-to-left, exactly like the projector
- [ ] With the control drawer closed, its handle doesn't cover the join QR
- [ ] New content animates in (respects reduced-motion)
- [ ] Supabase: hiding a post removes it from a display opened **without** signing in

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
file-type validation, text sanitisation, and the open-collection lifecycle
(inactivity exemption, deadline closing, deadline extension reopening, and
legacy rooms normalising to live mode), the board's opening content (copied into
every activation, published despite approval mode, empty items skipped, excluded
from contribution counts, and not duplicated when continuing a session), and
replies (facilitator and participant authorship, thread ordering, deletion, and
removal alongside their post), participant recovery (removing your own post
frees a single-submission board; ownership and board-setting checks refuse
otherwise), and the write-failure classifier in `src/lib/write-errors.test.ts`
(every server reason recognised, network drops distinguished from content
problems, unknown never guessed at). `src/lib/data/supabase-db.test.ts` covers
the Supabase adapter's realtime handling against a scripted client: bursts of
events reload in order, a re-joined channel catches up, and moderation reaches
anonymous screens. `src/components/display/fit.test.ts` covers the shared
screen's fit-to-screen search against a scripted layout: the largest density
that fits, the legibility floor on 720p, 1080p, 4K and scaled screens, and how
few layouts a new card costs.

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
