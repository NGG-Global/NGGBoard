-- ============================================================================
-- NGG Boards — 0008 Giphy GIF & sticker submissions.
--
-- A Giphy pick is stored as a regular `image` submission whose media_url
-- points at Giphy's CDN, so no table change is needed (`participation` is
-- jsonb and now carries an `allow_giphy` flag). This migration only updates
-- the server-side policy in create_submission: an image-type submission is
-- checked against `allow_giphy` when its media_url is a Giphy URL, and
-- against `allow_image` otherwise — so a board can allow GIFs while photo
-- uploads are off (and vice versa). All checks remain FAIL OPEN, matching
-- 0007: missing/odd config never wrongly rejects content.
--
-- Safe to re-run. Run AFTER 0007.
-- ============================================================================

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
