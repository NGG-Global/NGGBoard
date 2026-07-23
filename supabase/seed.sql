-- ============================================================================
-- NGG Boards — demo seed (Supabase)
--
-- Run AFTER 0001_init.sql. Profiles reference auth.users, so create the auth
-- users first (Supabase dashboard → Authentication → Add user, or the Admin
-- API) and paste their UUIDs where indicated below.
-- ============================================================================

-- 1) Organization
insert into organizations (id, name, logo_url)
values ('00000000-0000-0000-0000-0000000000ng', 'נירם גיתן — NGG', '/brand/ngg-logo.png')
on conflict (id) do nothing;

-- 2) Profiles — replace the UUIDs with real auth.users ids before running.
-- insert into profiles (id, organization_id, full_name, email, role) values
--   ('<AUTH_UID_1>', '00000000-0000-0000-0000-0000000000ng', 'דור ואנונו', 'Dor_va@nggconsult.com', 'org_admin'),
--   ('<AUTH_UID_2>', '00000000-0000-0000-0000-0000000000ng', 'דנה פרידמן', 'dana@nggconsult.com', 'board_creator');

-- 3) A ready demo board (owner = AUTH_UID_1)
-- insert into boards (organization_id, created_by, internal_name, public_title, public_subtitle,
--                     status, appearance, participation, moderation, sharing, default_layout)
-- values (
--   '00000000-0000-0000-0000-0000000000ng', '<AUTH_UID_1>',
--   'סדנת חדשנות — הנהלה 2026', 'קיר רעיונות — סדנת חדשנות 2026',
--   'איזה רעיון אחד תרצו שנאמץ כבר השנה?',
--   'ready',
--   '{"background_theme":"ink","show_org_logo":true,"card_style":"elevated","font_scale":"md","client_logo_url":null,"background_color":null,"background_image_url":null}'::jsonb,
--   '{"allow_text":true,"allow_image":true,"allow_giphy":true,"name_policy":"optional","anonymous_allowed":true,"multiple_submissions":true,"text_char_limit":280,"image_size_limit_mb":8,"allow_participant_edit":false,"allow_participant_delete":true}'::jsonb,
--   '{"mode":"immediate","hide_identity_on_display":false,"blocked_words":[]}'::jsonb,
--   'organization', 'wall'
-- );

-- The running app also ships a full in-browser demo dataset (see
-- src/lib/data/seed.ts) that loads automatically on first visit when using the
-- local backend — no SQL needed for local development.
