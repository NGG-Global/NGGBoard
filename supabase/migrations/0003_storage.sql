-- ============================================================================
-- NGG Boards — Storage buckets & policies
--
-- Buckets:
--   board-assets : logos & background images (org users write; public read)
--   submissions  : participant images (written via signed upload; public read
--                  of the room's assets only)
--
-- Run in the Supabase SQL editor (storage schema is managed by Supabase).
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('board-assets', 'board-assets', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('submissions', 'submissions', true)
on conflict (id) do nothing;

-- ---- board-assets: org users manage their own org folder -------------------
-- Convention: path = <organization_id>/<filename>
create policy "board-assets read" on storage.objects
  for select using (bucket_id = 'board-assets');

create policy "board-assets write (org users)" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'board-assets'
    and (storage.foldername(name))[1] = current_org()::text
  );

create policy "board-assets update (org users)" on storage.objects
  for update to authenticated
  using (bucket_id = 'board-assets' and (storage.foldername(name))[1] = current_org()::text);

-- ---- submissions: public read; writes go through signed upload URLs --------
-- The app requests a signed upload URL from an Edge Function after validating
-- room state + file type/size; direct anon insert is not granted here.
create policy "submissions read" on storage.objects
  for select using (bucket_id = 'submissions');

create policy "submissions write (org users)" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'submissions' and (storage.foldername(name))[1] = current_org()::text);

-- NOTE: enforce max file size and mime type at upload time (client + Edge
-- Function). Recommended limits: images only (jpeg/png/webp/gif), <= 8 MB.
