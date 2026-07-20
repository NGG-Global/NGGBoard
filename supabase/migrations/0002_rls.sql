-- ============================================================================
-- NGG Boards — Row Level Security
--
-- Two audiences:
--   1. Authenticated organizational users  → may only touch their own org's data.
--   2. Anonymous participants (anon role)  → may only READ public room content,
--      and may only WRITE through the SECURITY DEFINER RPCs at the bottom, which
--      enforce room state, rate limits, and correct org stamping.
--
-- Private administrative fields are never exposed to anon directly; participants
-- read board framing through the `public_board_view` and rooms through a
-- narrowly-scoped SELECT policy.
-- ============================================================================

-- Helper: the organization of the current authenticated user.
create or replace function current_org() returns uuid
language sql stable security definer set search_path = public as $$
  select organization_id from profiles where id = auth.uid();
$$;

-- Helper: is the current user an admin of their org?
create or replace function is_org_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'org_admin');
$$;

alter table organizations        enable row level security;
alter table profiles             enable row level security;
alter table teams                enable row level security;
alter table team_members         enable row level security;
alter table boards               enable row level security;
alter table board_collaborators  enable row level security;
alter table board_tags           enable row level security;
alter table live_rooms           enable row level security;
alter table room_facilitators    enable row level security;
alter table participant_sessions enable row level security;
alter table submissions          enable row level security;
alter table moderation_actions   enable row level security;
alter table activity_events      enable row level security;
alter table uploaded_assets      enable row level security;

-- ---- organizations ---------------------------------------------------------
create policy org_read on organizations
  for select to authenticated using (id = current_org());

-- ---- profiles --------------------------------------------------------------
create policy profiles_read on profiles
  for select to authenticated using (organization_id = current_org());
create policy profiles_self_update on profiles
  for update to authenticated using (id = auth.uid());

-- ---- boards (org-scoped) ---------------------------------------------------
create policy boards_read on boards
  for select to authenticated using (organization_id = current_org());
create policy boards_insert on boards
  for insert to authenticated with check (organization_id = current_org() and created_by = auth.uid());
create policy boards_update on boards
  for update to authenticated using (
    organization_id = current_org()
    and (created_by = auth.uid()
         or is_org_admin()
         or exists (select 1 from board_collaborators bc where bc.board_id = id and bc.profile_id = auth.uid()))
  );
-- Boards are archived (soft-deleted), never hard-deleted from the UI.
create policy boards_delete on boards
  for delete to authenticated using (organization_id = current_org() and is_org_admin());

-- ---- collaborators / tags / teams (org-scoped) -----------------------------
create policy board_collab_rw on board_collaborators
  for all to authenticated
  using (exists (select 1 from boards b where b.id = board_id and b.organization_id = current_org()))
  with check (exists (select 1 from boards b where b.id = board_id and b.organization_id = current_org()));
create policy board_tags_rw on board_tags
  for all to authenticated
  using (exists (select 1 from boards b where b.id = board_id and b.organization_id = current_org()))
  with check (exists (select 1 from boards b where b.id = board_id and b.organization_id = current_org()));
create policy teams_rw on teams
  for all to authenticated using (organization_id = current_org()) with check (organization_id = current_org());
create policy team_members_rw on team_members
  for all to authenticated
  using (exists (select 1 from teams t where t.id = team_id and t.organization_id = current_org()))
  with check (exists (select 1 from teams t where t.id = team_id and t.organization_id = current_org()));

-- ---- live rooms ------------------------------------------------------------
-- Org users manage their rooms.
create policy rooms_org_all on live_rooms
  for all to authenticated using (organization_id = current_org()) with check (organization_id = current_org());
-- Participants may READ rooms that are (or were) joinable. Column exposure is
-- limited by only ever selecting public fields client-side; for stricter
-- guarantees use `public_board_view` + RPCs and revoke this policy.
create policy rooms_public_read on live_rooms
  for select to anon
  using (status in ('active', 'paused', 'read_only', 'suspended', 'ended'));

create policy room_facilitators_rw on room_facilitators
  for all to authenticated
  using (exists (select 1 from live_rooms r where r.id = room_id and r.organization_id = current_org()))
  with check (exists (select 1 from live_rooms r where r.id = room_id and r.organization_id = current_org()));

-- ---- participant sessions --------------------------------------------------
-- Org users can read their room's sessions; participants join via RPC only.
create policy participants_org_read on participant_sessions
  for select to authenticated
  using (exists (select 1 from live_rooms r where r.id = room_id and r.organization_id = current_org()));

-- ---- submissions -----------------------------------------------------------
-- Org users: full control of their org's submissions.
create policy submissions_org_all on submissions
  for all to authenticated using (organization_id = current_org()) with check (organization_id = current_org());
-- Participants: read only PUBLISHED submissions of joinable rooms (drives the
-- public display + participant preview via Supabase Realtime).
create policy submissions_public_read on submissions
  for select to anon
  using (
    status = 'published'
    and exists (select 1 from live_rooms r where r.id = room_id
                and r.status in ('active', 'paused', 'read_only', 'suspended', 'ended'))
  );

-- ---- audit tables (org-only) ----------------------------------------------
create policy moderation_org on moderation_actions
  for all to authenticated
  using (exists (select 1 from live_rooms r where r.id = room_id and r.organization_id = current_org()))
  with check (exists (select 1 from live_rooms r where r.id = room_id and r.organization_id = current_org()));
create policy activity_org on activity_events
  for all to authenticated
  using (exists (select 1 from live_rooms r where r.id = room_id and r.organization_id = current_org()))
  with check (exists (select 1 from live_rooms r where r.id = room_id and r.organization_id = current_org()));
create policy assets_org on uploaded_assets
  for all to authenticated using (organization_id = current_org()) with check (organization_id = current_org());

-- ============================================================================
-- Public read view — only participant-safe framing fields (no internal names,
-- descriptions, sharing config, or collaborators).
-- ============================================================================
create or replace view public_board_view as
  select
    r.public_id,
    r.room_code,
    r.status,
    r.layout,
    r.focused_submission_id,
    r.qr_overlay_visible,
    r.participant_count,
    r.session_label,
    b.public_title,
    b.public_subtitle,
    b.appearance,
    b.participation,
    (b.moderation ->> 'mode')                as moderation_mode,
    (b.moderation ->> 'hide_identity_on_display')::boolean as hide_identity_on_display
  from live_rooms r
  join boards b on b.id = r.board_id
  where r.status in ('active', 'paused', 'read_only', 'suspended', 'ended');

grant select on public_board_view to anon;

-- ============================================================================
-- Participant write path — SECURITY DEFINER RPCs. anon has NO direct INSERT.
-- ============================================================================

-- Join a room by its public id; returns the new session id.
create or replace function join_room(p_public_id text, p_display_name text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_room live_rooms%rowtype;
  v_session_id uuid;
begin
  select * into v_room from live_rooms where public_id = p_public_id;
  if not found then raise exception 'room_not_found'; end if;
  if v_room.status not in ('active', 'paused', 'read_only') then
    raise exception 'room_not_joinable';
  end if;

  insert into participant_sessions (room_id, display_name)
  values (v_room.id, nullif(trim(coalesce(p_display_name, '')), ''))
  returning id into v_session_id;

  update live_rooms
    set participant_count = participant_count + 1,
        last_activity_at = now()
  where id = v_room.id;

  insert into activity_events (room_id, type, meaningful) values (v_room.id, 'participant_joined', true);
  return v_session_id;
end;
$$;

-- Create a submission; enforces room state, session validity, and rate limit.
create or replace function create_submission(
  p_public_id text,
  p_session_id uuid,
  p_type submission_type,
  p_text text,
  p_media_url text,
  p_anonymous boolean,
  p_display_name text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_room live_rooms%rowtype;
  v_board boards%rowtype;
  v_mode text;
  v_status submission_status;
  v_last timestamptz;
  v_id uuid;
begin
  select * into v_room from live_rooms where public_id = p_public_id;
  if not found then raise exception 'room_not_found'; end if;
  if v_room.status <> 'active' then raise exception 'room_not_accepting'; end if;

  -- Session must belong to this room.
  if not exists (select 1 from participant_sessions s where s.id = p_session_id and s.room_id = v_room.id) then
    raise exception 'invalid_session';
  end if;

  -- Rate limit: max 1 submission / 3s per session.
  select max(created_at) into v_last from submissions where participant_session_id = p_session_id;
  if v_last is not null and now() - v_last < interval '3 seconds' then
    raise exception 'rate_limited';
  end if;

  select * into v_board from boards where id = v_room.board_id;
  v_mode := coalesce(v_board.moderation ->> 'mode', 'immediate');
  v_status := case when v_mode = 'approval' then 'pending' else 'published' end;

  insert into submissions (room_id, organization_id, type, text_content, media_url,
                           participant_session_id, display_name, anonymous, status)
  values (v_room.id, v_room.organization_id, p_type, p_text, p_media_url,
          p_session_id, case when p_anonymous then null else p_display_name end,
          coalesce(p_anonymous, false), v_status)
  returning id into v_id;

  update live_rooms set last_activity_at = now() where id = v_room.id;
  insert into activity_events (room_id, type, meaningful) values (v_room.id, 'submission_created', true);
  return v_id;
end;
$$;

grant execute on function join_room(text, text) to anon;
grant execute on function create_submission(text, uuid, submission_type, text, text, boolean, text) to anon;

-- ============================================================================
-- Inactivity sweep — call from a scheduled Edge Function / pg_cron every minute.
-- Suspends active/paused rooms idle > 30 minutes (server-timestamp based, so it
-- does not depend on any open browser tab).
-- ============================================================================
create or replace function suspend_inactive_rooms()
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  with suspended as (
    update live_rooms
      set status = 'suspended'
      where status in ('active', 'paused')
        and now() - last_activity_at > interval '30 minutes'
      returning id
  )
  select count(*) into v_count from suspended;
  return v_count;
end;
$$;
