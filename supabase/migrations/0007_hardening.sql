-- ============================================================================
-- NGG Boards — 0007 hardening.
--
-- Three independent, self-contained changes. Run AFTER 0006. Every statement is
-- written to be idempotent / safe to re-run. NONE of it drops data.
--
--   A. Realtime publication — add the tables the client subscribes to, so live
--      updates work in production (the roster and cross-device board edits
--      currently never fire because the publication was only a manual README
--      step covering submissions + live_rooms).
--   B. public_board_view exposes the real room id, so ANONYMOUS viewers can
--      match a room's submissions. Without it the anon display/participant
--      queries submissions by a synthetic id and the board renders empty.
--   C. create_submission enforces the board's own participation/moderation
--      policy SERVER-SIDE (it previously trusted the client entirely, so the
--      anon RPC could be called directly to bypass moderation and limits).
--      All checks FAIL OPEN: if a board's config is missing/oddly shaped the
--      submission is still accepted, so this can never wrongly reject content.
--
-- NOTE (read before relying on this for isolation): the open-join model gives
-- the public anon key RLS read on published content of every *live* room, and
-- public_board_view is enumerable. That cross-room exposure is inherent to
-- anonymous + Supabase-Realtime and is NOT closed here; closing it requires
-- per-room access tokens (a scoped JWT claim), a larger change. This migration
-- does not widen that exposure.
-- ============================================================================

-- ---- A. Realtime publication (idempotent) ---------------------------------
do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['submissions','live_rooms','participant_sessions','boards'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- DELETE events over Realtime only carry the primary key unless the table
-- replicates full row images; the anon display filters live_rooms by public_id,
-- so it needs the full old row on delete/status changes.
alter table live_rooms  replica identity full;
alter table submissions replica identity full;

-- ---- B. Expose the real room id on the public view ------------------------
drop view if exists public_board_view;
create view public_board_view as
  select
    r.id as room_id,                 -- NEW: real room id (anon matches submissions by it)
    r.public_id, r.room_code, r.status, r.layout, r.focused_submission_id,
    r.qr_overlay_visible, r.participant_count, r.session_label,
    b.public_title, b.public_subtitle, b.appearance, b.participation, b.zones,
    (b.moderation ->> 'mode') as moderation_mode,
    (b.moderation ->> 'hide_identity_on_display')::boolean as hide_identity_on_display
  from live_rooms r
  join boards b on b.id = r.board_id
  where r.status in ('active','paused','read_only','suspended','ended');

grant select on public_board_view to anon;

-- ---- C. Server-side submission policy (fail-open) -------------------------
create or replace function create_submission(
  p_id uuid, p_public_id text, p_session_id uuid, p_type submission_type,
  p_text text, p_media_url text, p_anonymous boolean, p_display_name text, p_zone_id text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_room live_rooms%rowtype; v_board boards%rowtype;
  v_mode text; v_status submission_status; v_last timestamptz;
  v_part jsonb; v_limit int;
begin
  select * into v_room from live_rooms where public_id = p_public_id;
  if not found then raise exception 'room_not_found'; end if;
  if v_room.status <> 'active' then raise exception 'room_not_accepting'; end if;
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
  if p_type = 'text'  and v_part ? 'allow_text'  and (v_part->>'allow_text')  = 'false' then raise exception 'text_not_allowed';  end if;
  if p_type = 'image' and v_part ? 'allow_image' and (v_part->>'allow_image') = 'false' then raise exception 'image_not_allowed'; end if;

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
