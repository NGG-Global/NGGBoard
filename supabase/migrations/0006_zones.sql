-- ============================================================================
-- NGG Boards — board zones (1–4 named regions).
--
-- Adds boards.zones + submissions.zone_id, threads zone_id through the
-- participant submission RPC, and exposes zones on the public view. Self-
-- contained: it also (re)creates the client-id join_room from 0004, so running
-- this alone is enough even if 0004 was skipped. Run AFTER 0002_rls.sql.
-- ============================================================================

alter table boards      add column if not exists zones   jsonb not null default '[]'::jsonb;
alter table submissions add column if not exists zone_id text;

-- join_room (client-supplied session id) — same as 0004, safe to re-run.
create or replace function join_room(p_public_id text, p_display_name text, p_session_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_room live_rooms%rowtype; v_inserted boolean := false;
begin
  select * into v_room from live_rooms where public_id = p_public_id;
  if not found then raise exception 'room_not_found'; end if;
  if v_room.status not in ('active','paused','read_only') then raise exception 'room_not_joinable'; end if;
  insert into participant_sessions (id, room_id, display_name)
  values (p_session_id, v_room.id, nullif(trim(coalesce(p_display_name,'')),''))
  on conflict (id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted then
    update live_rooms set participant_count = participant_count + 1, last_activity_at = now() where id = v_room.id;
    insert into activity_events (room_id, type, meaningful) values (v_room.id, 'participant_joined', true);
  end if;
  return p_session_id;
end; $$;

-- create_submission now takes p_zone_id (last arg).
create or replace function create_submission(
  p_id uuid, p_public_id text, p_session_id uuid, p_type submission_type,
  p_text text, p_media_url text, p_anonymous boolean, p_display_name text, p_zone_id text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_room live_rooms%rowtype; v_board boards%rowtype; v_mode text; v_status submission_status; v_last timestamptz;
begin
  select * into v_room from live_rooms where public_id = p_public_id;
  if not found then raise exception 'room_not_found'; end if;
  if v_room.status <> 'active' then raise exception 'room_not_accepting'; end if;
  if not exists (select 1 from participant_sessions s where s.id = p_session_id and s.room_id = v_room.id) then
    raise exception 'invalid_session'; end if;
  select max(created_at) into v_last from submissions where participant_session_id = p_session_id;
  if v_last is not null and now() - v_last < interval '3 seconds' then raise exception 'rate_limited'; end if;
  select * into v_board from boards where id = v_room.board_id;
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

-- Public view exposes zones so participants/display can render regions.
drop view if exists public_board_view;
create view public_board_view as
  select
    r.public_id, r.room_code, r.status, r.layout, r.focused_submission_id,
    r.qr_overlay_visible, r.participant_count, r.session_label,
    b.public_title, b.public_subtitle, b.appearance, b.participation, b.zones,
    (b.moderation ->> 'mode') as moderation_mode,
    (b.moderation ->> 'hide_identity_on_display')::boolean as hide_identity_on_display
  from live_rooms r
  join boards b on b.id = r.board_id
  where r.status in ('active','paused','read_only','suspended','ended');

grant select on public_board_view to anon;
grant execute on function join_room(text, text, uuid) to anon;
grant execute on function create_submission(uuid, text, uuid, submission_type, text, text, boolean, text, text) to anon;
