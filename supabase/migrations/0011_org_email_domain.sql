-- ============================================================================
-- NGG Boards — restrict accounts to the organisation email domain.
--
-- Until now handle_new_user (0005) placed ANY new auth user into the NGG
-- organisation, so anyone able to call Supabase signUp with the public anon
-- key could read the org's boards and rooms. This rejects every new auth user
-- whose email is not exactly @nggconsult.com (the insert into auth.users is
-- rolled back), regardless of whether it came through the app, the shared-
-- password route or the Supabase API directly.
--
-- Keep the domain in sync with ORG_EMAIL_DOMAIN if you change it.
-- Run AFTER 0005_auth_bootstrap.sql. Existing users are not affected; audit
-- them with:
--   select id, email from auth.users
--   where lower(split_part(email, '@', 2)) <> 'nggconsult.com';
-- ============================================================================

create or replace function handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_org_id uuid;
  v_is_first boolean;
begin
  if new.email is null
     or lower(new.email) !~ '^[^@[:space:]]+@nggconsult\.com$' then
    raise exception 'Sign-up is restricted to @nggconsult.com addresses'
      using errcode = '42501';
  end if;

  -- Find (or create) the default organization.
  select id into v_org_id from organizations order by created_at asc limit 1;
  if v_org_id is null then
    insert into organizations (name, logo_url)
      values ('נירם גיתן — NGG', '/brand/ngg-logo.png')
      returning id into v_org_id;
  end if;

  select not exists (select 1 from profiles where organization_id = v_org_id) into v_is_first;

  insert into profiles (id, organization_id, full_name, email, role)
  values (
    new.id,
    v_org_id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.email,
    case when v_is_first then 'org_admin'::user_role else 'facilitator'::user_role end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;
