-- ============================================================================
-- NGG Boards — Storage buckets & policies
--
-- Buckets:
--   board-assets : logos & background images (org users write; public read)
--   board-submissions : participant images (written via signed upload; public
--                       read of the room's assets only)
--
-- Bucket ids and storage.objects policy names are shared by every app in the
-- NGG Supabase project, so both carry the `board` prefix.
--
-- Run in the Supabase SQL editor (storage schema is managed by Supabase).
-- ============================================================================

-- Shared NGG Supabase project: this app lives in the `board` schema (see 0000).
set search_path to board;

insert into storage.buckets (id, name, public)
values ('board-assets', 'board-assets', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('board-submissions', 'board-submissions', true)
on conflict (id) do nothing;

-- ---- board-assets: org users manage their own org folder -------------------
-- Convention: path = <organization_id>/<filename>
create policy "board-assets read" on storage.objects
  for select using (bucket_id = 'board-assets');

create policy "board-assets write (org users)" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'board-assets'
    and (storage.foldername(name))[1] = board.current_org()::text
  );

create policy "board-assets update (org users)" on storage.objects
  for update to authenticated
  using (bucket_id = 'board-assets' and (storage.foldername(name))[1] = board.current_org()::text);

-- ---- board-submissions: public read; writes go through signed upload URLs --
-- The app requests a signed upload URL from an Edge Function after validating
-- room state + file type/size; direct anon insert is not granted here.
create policy "board-submissions read" on storage.objects
  for select using (bucket_id = 'board-submissions');

create policy "board-submissions write (org users)" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'board-submissions' and (storage.foldername(name))[1] = board.current_org()::text);

-- NOTE: enforce max file size and mime type at upload time (client + Edge
-- Function). Recommended limits: images only (jpeg/png/webp/gif), <= 8 MB.
