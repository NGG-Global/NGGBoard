-- ============================================================================
-- NGG Boards — 0010 open collection boards.
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
--      participants can be shown the brief and the deadline.
--
-- Safe to re-run. Run AFTER 0009.
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

-- ---- E. Expose the new fields to anonymous participants ---------------------
drop view if exists public_board_view;
create view public_board_view as
  select
    r.id as room_id,
    r.public_id, r.room_code, r.status, r.layout, r.focused_submission_id,
    r.qr_overlay_visible, r.participant_count, r.session_label,
    r.mode, r.closes_at,                      -- NEW: drives the deadline + closed states
    b.public_title, b.public_subtitle, b.instructions, b.appearance, b.participation, b.zones,
    (b.moderation ->> 'mode') as moderation_mode,
    (b.moderation ->> 'hide_identity_on_display')::boolean as hide_identity_on_display
  from live_rooms r
  join boards b on b.id = r.board_id
  where r.status in ('active','paused','read_only','suspended','ended');

grant select on public_board_view to anon;
