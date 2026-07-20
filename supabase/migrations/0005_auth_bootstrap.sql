-- ============================================================================
-- NGG Boards — auto-provision org + profile on signup.
--
-- On a new auth user, create a profile linked to the default NGG organization
-- (creating that organization on the very first signup). The first user in the
-- org becomes org_admin; subsequent users become facilitators. This lets an
-- organizational user sign up and immediately have a working workspace.
--
-- Adjust the org name / default role to your policy as needed.
-- Run AFTER 0001_init.sql.
-- ============================================================================

create or replace function handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_org_id uuid;
  v_is_first boolean;
begin
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
