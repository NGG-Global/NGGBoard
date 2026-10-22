-- ============================================================================
-- NGG Boards — 0012 profiles for accounts that predate the board schema.
--
-- The board shares its Supabase project, and with it auth.users, with the
-- other NGG apps. An account created before this schema was installed (or
-- carried over from another app's project) never fired
-- board_on_auth_user_created, so it has no profile and every board screen
-- treats it as a stranger. This gives each such account the profile the
-- trigger would have created: the same organisation, the same @nggconsult.com
-- rule, and org_admin for the earliest account when the organisation has no
-- profile yet.
--
-- Run AFTER 0011. Safe to re-run: existing profiles are never touched.
-- ============================================================================

-- Shared NGG Supabase project: this app lives in the `board` schema (see 0000).
set search_path to board;

do $$
declare
  u record;
  v_org_id uuid;
begin
  for u in
    select au.id, au.email, au.raw_user_meta_data
    from auth.users as au
    where au.email is not null
      and lower(au.email) ~ '^[^@[:space:]]+@nggconsult\.com$'
      and not exists (select 1 from profiles p where p.id = au.id)
    order by au.created_at, au.id
  loop
    select id into v_org_id from organizations order by created_at asc limit 1;
    if v_org_id is null then
      insert into organizations (name, logo_url)
        values ('נירם גיתן — NGG', '/brand/ngg-logo.png')
        returning id into v_org_id;
    end if;

    insert into profiles (id, organization_id, full_name, email, role)
    values (
      u.id,
      v_org_id,
      coalesce(u.raw_user_meta_data ->> 'full_name', split_part(u.email, '@', 1)),
      u.email,
      case when exists (select 1 from profiles where organization_id = v_org_id)
           then 'facilitator'::user_role else 'org_admin'::user_role end
    )
    on conflict (id) do nothing;
  end loop;
end $$;
