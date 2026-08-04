-- ============================================================================
-- NGG Boards — 0010 open collection boards, opening content, and replies.
--
-- Three features in one migration because none of them has been applied yet.
-- Run AFTER 0009. Every statement is written to be safe to re-run, and none of
-- it drops data.
--
--   PART 1 — open collection boards (mode, closes_at, deadline enforcement).
--   PART 2 — facilitator-authored opening content (boards.seed_posts, plus a
--            nullable participant_session_id and submissions.author_profile_id
--            so a post can belong to a facilitator rather than a participant).
--   PART 3 — replies on posts (submission_comments + the create_comment RPC).
--
-- ============================================================================
-- PART 1 — OPEN COLLECTION BOARDS
-- ============================================================================
--
-- A board can now collect content in one of two ways:
--   'live' — a facilitated session happening now (everything up to 0009).
--   'open' — an ongoing collection window. The facilitator publishes the link
--            once and participants contribute over days or weeks.
--
-- The consequential change is to the inactivity sweep. Before this migration
-- `suspend_inactive_rooms()` suspends ANY active/paused room idle for more than
-- 30 minutes — which for an open board means the link dies half an hour after
-- it is sent out, and every participant who opens it afterwards is told the
-- room is suspended. Open rooms are therefore exempt from idle suspension and
-- are instead closed by their own deadline.
--
-- Changes:
--   A. live_rooms.mode + live_rooms.closes_at.
--   B. boards.instructions — the facilitator's multi-line brief. Separate from
--      public_subtitle, which is a one-line strapline sized for the projector
--      header and cannot carry a brief.
--   C. suspend_inactive_rooms() skips open rooms and closes due ones
--      (-> 'read_only', so collected content stays on the board and the room
--      remains the board's current collection rather than dropping to 'ended').
--   D. create_submission() rejects content once an open room's deadline has
--      passed, independently of the sweep having run. A deadline enforced only
--      in the browser is not enforced at all.
--   E. public_board_view exposes mode / closes_at / instructions so anonymous
--      participants can be shown the brief and the deadline. (Re-created at the
--      end of this file, once PART 2's columns exist.)
-- ============================================================================

-- ---- A. Room mode + deadline ------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'room_mode') then
    create type room_mode as enum ('live', 'open');
  end if;
end $$;

alter table live_rooms add column if not exists mode      room_mode   not null default 'live';
alter table live_rooms add column if not exists closes_at timestamptz;

-- The sweep filters on these two columns on every run.
create index if not exists live_rooms_mode_idx on live_rooms (mode, status);
create index if not exists live_rooms_closes_at_idx on live_rooms (closes_at)
  where closes_at is not null;

comment on column live_rooms.mode is
  'live = facilitated session (auto-suspends when idle); open = ongoing collection window (never suspended for inactivity).';
comment on column live_rooms.closes_at is
  'Open rooms only: when collection stops accepting. NULL = open until closed by hand.';

-- ---- B. The facilitator's brief ---------------------------------------------
alter table boards add column if not exists instructions text not null default '';

comment on column boards.instructions is
  'Multi-line brief shown to participants before submitting and pinned above the board. On an open board there is no facilitator present to explain the task, so this is the participant''s only context.';

-- ---- C. Inactivity sweep: exempt open rooms, close due ones -----------------
create or replace function suspend_inactive_rooms()
returns integer language plpgsql security definer set search_path = public as $$
declare v_suspended integer; v_closed integer;
begin
  -- Live sessions: unchanged 30-minute idle suspension.
  with suspended as (
    update live_rooms
      set status = 'suspended'
      where mode = 'live'
        and status in ('active', 'paused')
        and now() - last_activity_at > interval '30 minutes'
      returning id
  )
  select count(*) into v_suspended from suspended;

  -- Open collections: never suspended for inactivity; closed at their deadline.
  -- The log entry is written from the UPDATE's own output, so only rooms this
  -- run actually closed are recorded.
  with closed as (
    update live_rooms
      set status = 'read_only'
      where mode = 'open'
        and status in ('active', 'paused')
        and closes_at is not null
        and now() >= closes_at
      returning id
  ), logged as (
    insert into activity_events (room_id, type, meaningful)
    select id, 'collection_closed', false from closed
    returning 1
  )
  select count(*) into v_closed from logged;

  return v_suspended + v_closed;
end;
$$;

comment on function suspend_inactive_rooms() is
  'Scheduled every minute (pg_cron / Edge Function). Suspends idle LIVE rooms and closes OPEN rooms whose deadline has passed. Returns the number of rooms changed.';

-- ---- D. Deadline enforced on the write path ---------------------------------
-- Identical to 0009 except for the closes_at guard marked below: the sweep runs
-- at most once a minute, and an open room's status may still read 'active' when
-- a submission arrives after the deadline.
create or replace function create_submission(
  p_id uuid, p_public_id text, p_session_id uuid, p_type submission_type,
  p_text text, p_media_url text, p_anonymous boolean, p_display_name text, p_zone_id text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_room live_rooms%rowtype; v_board boards%rowtype;
  v_mode text; v_status submission_status; v_last timestamptz;
  v_part jsonb; v_limit int; v_is_giphy boolean;
begin
  select * into v_room from live_rooms where public_id = p_public_id;
  if not found then raise exception 'room_not_found'; end if;
  if v_room.status <> 'active' then raise exception 'room_not_accepting'; end if;

  -- NEW: an open collection past its deadline stops accepting, even if the
  -- minute-by-minute sweep has not flipped its status yet.
  if v_room.mode = 'open' and v_room.closes_at is not null and now() >= v_room.closes_at then
    raise exception 'collection_closed';
  end if;

  if not exists (select 1 from participant_sessions s where s.id = p_session_id and s.room_id = v_room.id) then
    raise exception 'invalid_session'; end if;
  select max(created_at) into v_last from submissions where participant_session_id = p_session_id;
  if v_last is not null and now() - v_last < interval '3 seconds' then raise exception 'rate_limited'; end if;

  select * into v_board from boards where id = v_room.board_id;
  v_part := coalesce(v_board.participation, '{}'::jsonb);

  -- Absolute payload guard (DoS), independent of board config.
  if p_text is not null and char_length(p_text) > 10000 then raise exception 'text_too_long'; end if;
  if p_media_url is not null and char_length(p_media_url) > 5000000 then raise exception 'media_too_large'; end if;

  -- Type must be permitted by the board (enforce only when explicitly disabled).
  if p_type = 'text' and v_part ? 'allow_text' and (v_part->>'allow_text') = 'false' then raise exception 'text_not_allowed'; end if;
  if p_type = 'image' then
    v_is_giphy := p_media_url is not null and p_media_url ~* '^https://([a-z0-9-]+\.)*giphy\.com/';
    if v_is_giphy then
      if v_part ? 'allow_giphy' and (v_part->>'allow_giphy') = 'false' then raise exception 'giphy_not_allowed'; end if;
    else
      if v_part ? 'allow_image' and (v_part->>'allow_image') = 'false' then raise exception 'image_not_allowed'; end if;
    end if;
  end if;
  if p_type = 'video' then
    if v_part ? 'allow_youtube' and (v_part->>'allow_youtube') = 'false' then raise exception 'video_not_allowed'; end if;
    if p_media_url is null or p_media_url !~ '^https://(www\.)?(youtube\.com/watch\?v=|youtu\.be/)[A-Za-z0-9_-]{11}' then
      raise exception 'invalid_video_url';
    end if;
  end if;

  -- Per-board character limit (enforce only when present and numeric).
  if p_type = 'text' and p_text is not null and v_part ? 'text_char_limit'
     and (v_part->>'text_char_limit') ~ '^[0-9]+$' then
    v_limit := (v_part->>'text_char_limit')::int;
    if char_length(p_text) > v_limit then raise exception 'text_too_long'; end if;
  end if;

  -- One submission per participant (enforce only when explicitly disabled).
  if v_part ? 'multiple_submissions' and (v_part->>'multiple_submissions') = 'false'
     and exists (select 1 from submissions
                 where participant_session_id = p_session_id and status <> 'deleted') then
    raise exception 'already_submitted';
  end if;

  -- Blocked words (enforce only when a non-empty list is present).
  if p_text is not null and jsonb_typeof(v_board.moderation -> 'blocked_words') = 'array' then
    if exists (
      select 1 from jsonb_array_elements_text(v_board.moderation -> 'blocked_words') w
      where length(trim(w)) > 0 and position(lower(trim(w)) in lower(p_text)) > 0
    ) then raise exception 'blocked_word'; end if;
  end if;

  -- Drop an unknown zone id rather than reject the submission.
  if p_zone_id is not null and jsonb_typeof(v_board.zones) = 'array'
     and not exists (select 1 from jsonb_array_elements(v_board.zones) z where z->>'id' = p_zone_id) then
    p_zone_id := null;
  end if;

  v_mode := coalesce(v_board.moderation ->> 'mode', 'immediate');
  v_status := case when v_mode = 'approval' then 'pending' else 'published' end;
  insert into submissions (id, room_id, organization_id, type, text_content, media_url, zone_id,
                           participant_session_id, display_name, anonymous, status)
  values (p_id, v_room.id, v_room.organization_id, p_type, p_text, p_media_url, p_zone_id,
          p_session_id, case when p_anonymous then null else p_display_name end,
          coalesce(p_anonymous,false), v_status)
  on conflict (id) do nothing;
  update live_rooms set last_activity_at = now() where id = v_room.id;
  insert into activity_events (room_id, type, meaningful) values (v_room.id, 'submission_created', true);
  return p_id;
end; $$;

grant execute on function create_submission(uuid, text, uuid, submission_type, text, text, boolean, text, text) to anon;

-- Joining is also barred past the deadline, so a participant who opens a stale
-- link is told the collection closed instead of joining a room that then
-- refuses every submission.
-- Identical to 0004 (including the insert-actually-happened guard, so an
-- optimistic retry cannot double-count participants) except for the deadline
-- check marked below.
create or replace function join_room(p_public_id text, p_display_name text, p_session_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_room live_rooms%rowtype;
  v_inserted boolean := false;
begin
  select * into v_room from live_rooms where public_id = p_public_id;
  if not found then raise exception 'room_not_found'; end if;
  if v_room.status not in ('active', 'paused', 'read_only') then
    raise exception 'room_not_joinable';
  end if;

  -- NEW: a stale link is answered with 'collection_closed' rather than letting
  -- someone join a room that will then refuse everything they send.
  if v_room.mode = 'open' and v_room.closes_at is not null and now() >= v_room.closes_at then
    raise exception 'collection_closed';
  end if;

  insert into participant_sessions (id, room_id, display_name)
  values (p_session_id, v_room.id, nullif(trim(coalesce(p_display_name, '')), ''))
  on conflict (id) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted then
    update live_rooms set participant_count = participant_count + 1, last_activity_at = now()
      where id = v_room.id;
    insert into activity_events (room_id, type, meaningful) values (v_room.id, 'participant_joined', true);
  end if;
  return p_session_id;
end;
$$;

grant execute on function join_room(text, text, uuid) to anon;


-- ============================================================================
-- PART 2 — FACILITATOR-AUTHORED OPENING CONTENT
--
-- The facilitator writes posts while building the board — guidance cards, a
-- reference image, a video to watch first — and they are on the board from the
-- moment it opens.
--
-- They live on the BOARD (`boards.seed_posts`, a jsonb array) rather than as
-- submissions, because the board is edited before any room exists for a
-- submission to belong to. Activating a room copies them into that room's
-- submissions, so every session of the board opens with the same framing and
-- the posts flow through moderation, the display, results and export as
-- ordinary rows.
--
-- That copy is what forces the two column changes below: a facilitator's post
-- has no participant session, and needs to be attributable to her instead.
-- ============================================================================

alter table submissions alter column participant_session_id drop not null;
alter table submissions add column if not exists author_profile_id uuid references profiles (id) on delete set null;

create index if not exists submissions_author_idx on submissions (author_profile_id)
  where author_profile_id is not null;

-- Every post belongs to exactly one author — a participant session or a
-- facilitator profile. Guarded so the migration stays re-runnable (ADD
-- CONSTRAINT has no IF NOT EXISTS).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'submissions_author_ck'
  ) then
    alter table submissions add constraint submissions_author_ck
      check (participant_session_id is not null or author_profile_id is not null);
  end if;
end $$;

comment on column submissions.author_profile_id is
  'Set when the post is the facilitator''s own (materialized from boards.seed_posts, or added mid-session). NULL for participant submissions, which carry participant_session_id instead.';

alter table boards add column if not exists seed_posts jsonb not null default '[]'::jsonb;

comment on column boards.seed_posts is
  'Posts the facilitator authored at edit time, copied into each room on activation. Array of {id, type, text, media_url, zone_id, pinned}.';

-- ============================================================================
-- PART 3 — REPLIES ON POSTS
--
-- The facilitator can always reply to a post. Participants can too, but only
-- when the board opts in via participation.allow_participant_comments — a board
-- where participants discuss each other's contributions is a different kind of
-- board and should be a deliberate choice.
--
-- Comments reuse `submission_status` rather than introducing an enum of their
-- own; only 'published', 'hidden' and 'deleted' are used.
-- ============================================================================

create table if not exists submission_comments (
  id                      uuid primary key default gen_random_uuid(),
  submission_id           uuid not null references submissions (id) on delete cascade,
  -- Denormalised from the submission so RLS, realtime filters and the "all
  -- replies in this room" read can all work without a join.
  room_id                 uuid not null references live_rooms (id) on delete cascade,
  organization_id         uuid not null references organizations (id) on delete cascade,
  body                    text not null,
  author_profile_id       uuid references profiles (id) on delete set null,
  participant_session_id  uuid references participant_sessions (id) on delete cascade,
  display_name            text,
  anonymous               boolean not null default false,
  status                  submission_status not null default 'published',
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists submission_comments_submission_idx on submission_comments (submission_id, created_at);
create index if not exists submission_comments_room_idx on submission_comments (room_id, status);

-- Same one-author rule as submissions.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'submission_comments_author_ck') then
    alter table submission_comments add constraint submission_comments_author_ck
      check (participant_session_id is not null or author_profile_id is not null);
  end if;
end $$;

drop trigger if exists submission_comments_updated_at on submission_comments;
create trigger submission_comments_updated_at before update on submission_comments
  for each row execute function set_updated_at();

alter table submission_comments enable row level security;

-- Org users: full control of their org's replies (this is also the facilitator's
-- own write path — she inserts directly, no RPC).
drop policy if exists comments_org_all on submission_comments;
create policy comments_org_all on submission_comments
  for all to authenticated
  using (organization_id = current_org())
  with check (organization_id = current_org());

-- Participants: read visible replies on published posts of joinable rooms.
-- Mirrors submissions_public_read, so a reply is never more visible than the
-- post it hangs off.
drop policy if exists comments_public_read on submission_comments;
create policy comments_public_read on submission_comments
  for select to anon
  using (
    status = 'published'
    and exists (
      select 1 from submissions s
      join live_rooms r on r.id = s.room_id
      where s.id = submission_id
        and s.status = 'published'
        and r.status in ('active', 'paused', 'read_only', 'suspended', 'ended')
    )
  );

-- anon has NO direct INSERT; participant replies go through this RPC.
create or replace function create_comment(
  p_id uuid, p_public_id text, p_session_id uuid, p_submission_id uuid,
  p_body text, p_anonymous boolean, p_display_name text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_room live_rooms%rowtype; v_board boards%rowtype; v_sub submissions%rowtype;
  v_part jsonb; v_last timestamptz;
begin
  select * into v_room from live_rooms where public_id = p_public_id;
  if not found then raise exception 'room_not_found'; end if;
  if v_room.status <> 'active' then raise exception 'room_not_accepting'; end if;
  if v_room.mode = 'open' and v_room.closes_at is not null and now() >= v_room.closes_at then
    raise exception 'collection_closed';
  end if;

  if not exists (select 1 from participant_sessions s where s.id = p_session_id and s.room_id = v_room.id) then
    raise exception 'invalid_session';
  end if;

  -- Reply only to a post that is actually on this board.
  select * into v_sub from submissions where id = p_submission_id;
  if not found or v_sub.room_id <> v_room.id or v_sub.status <> 'published' then
    raise exception 'submission_not_available';
  end if;

  select * into v_board from boards where id = v_room.board_id;
  v_part := coalesce(v_board.participation, '{}'::jsonb);

  -- NOTE: this check FAILS CLOSED, unlike the fail-open checks in
  -- create_submission. Participant replies are opt-in and the app's default is
  -- false, so a board whose config predates this feature (no key at all) must
  -- NOT accept them. Fail-open here would silently switch the feature on for
  -- every existing board.
  if coalesce(v_part->>'allow_participant_comments', 'false') <> 'true' then
    raise exception 'comments_not_allowed';
  end if;

  if p_body is null or length(trim(p_body)) = 0 then raise exception 'empty_comment'; end if;
  if char_length(p_body) > 2000 then raise exception 'comment_too_long'; end if;

  -- Rate limit: max 1 reply / 3s per session, matching submissions.
  select max(created_at) into v_last from submission_comments where participant_session_id = p_session_id;
  if v_last is not null and now() - v_last < interval '3 seconds' then raise exception 'rate_limited'; end if;

  -- Blocked words (enforce only when a non-empty list is present).
  if jsonb_typeof(v_board.moderation -> 'blocked_words') = 'array' then
    if exists (
      select 1 from jsonb_array_elements_text(v_board.moderation -> 'blocked_words') w
      where length(trim(w)) > 0 and position(lower(trim(w)) in lower(p_body)) > 0
    ) then raise exception 'blocked_word'; end if;
  end if;

  insert into submission_comments (id, submission_id, room_id, organization_id, body,
                                   participant_session_id, display_name, anonymous, status)
  values (p_id, v_sub.id, v_room.id, v_room.organization_id, trim(p_body),
          p_session_id, case when p_anonymous then null else p_display_name end,
          coalesce(p_anonymous, false), 'published')
  on conflict (id) do nothing;

  update live_rooms set last_activity_at = now() where id = v_room.id;
  insert into activity_events (room_id, type, meaningful) values (v_room.id, 'comment_created', true);
  return p_id;
end; $$;

grant execute on function create_comment(uuid, text, uuid, uuid, text, boolean, text) to anon;

-- Realtime + full old rows on delete, so a removed reply disappears for
-- everyone watching (same reasoning as live_rooms/submissions in 0007).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'submission_comments'
  ) then
    alter publication supabase_realtime add table public.submission_comments;
  end if;
end $$;

alter table submission_comments replica identity full;

-- ============================================================================
-- The participant-facing view, re-created last so it sees every column added
-- above. Exposes the open-collection fields and the brief; `participation`
-- already carries allow_participant_comments, and seed posts reach participants
-- as ordinary submission rows rather than through here.
-- ============================================================================
drop view if exists public_board_view;
create view public_board_view as
  select
    r.id as room_id,
    r.public_id, r.room_code, r.status, r.layout, r.focused_submission_id,
    r.qr_overlay_visible, r.participant_count, r.session_label,
    r.mode, r.closes_at,                      -- drives the deadline + closed states
    b.public_title, b.public_subtitle, b.instructions, b.appearance, b.participation, b.zones,
    (b.moderation ->> 'mode') as moderation_mode,
    (b.moderation ->> 'hide_identity_on_display')::boolean as hide_identity_on_display
  from live_rooms r
  join boards b on b.id = r.board_id
  where r.status in ('active','paused','read_only','suspended','ended');

grant select on public_board_view to anon;
