-- ============================================================================
-- NGG Boards — 0008 dashboard folders.
--
-- A per-organization folder registry so the dashboard can group boards and so
-- empty folders persist. Boards continue to link to a folder by NAME
-- (boards.folder text, unchanged) — this table adds identity, ordering and
-- empty-folder persistence on top of that. Run AFTER 0002 (needs current_org()).
-- Idempotent; drops no data.
-- ============================================================================

create table if not exists folders (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations (id) on delete cascade,
  name             text not null,
  sort             integer not null default 0,
  created_at       timestamptz not null default now(),
  unique (organization_id, name)
);

create index if not exists folders_org_idx on folders (organization_id);

alter table folders enable row level security;

-- Org members manage their own org's folders (mirrors boards_* policies).
drop policy if exists folders_org_all on folders;
create policy folders_org_all on folders
  for all to authenticated
  using (organization_id = current_org())
  with check (organization_id = current_org());

-- Live updates for the dashboard folder list across devices.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'folders'
     ) then
    alter publication supabase_realtime add table public.folders;
  end if;
end $$;
