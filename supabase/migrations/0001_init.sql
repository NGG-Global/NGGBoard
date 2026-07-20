-- ============================================================================
-- NGG Boards — core schema
-- Postgres / Supabase. Mirrors src/lib/types.ts (snake_case columns).
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---- enums -----------------------------------------------------------------
create type user_role        as enum ('org_admin', 'board_creator', 'co_editor', 'facilitator');
create type board_status     as enum ('draft', 'ready', 'archived');
create type sharing_level    as enum ('private', 'selected', 'team', 'organization', 'link');
create type display_layout   as enum ('wall', 'mosaic', 'feed');
create type room_status      as enum ('draft', 'ready', 'active', 'paused', 'read_only', 'suspended', 'ended', 'archived');
create type submission_type  as enum ('text', 'image');
create type submission_status as enum ('pending', 'published', 'hidden', 'rejected', 'deleted');

-- ---- organizations & people ------------------------------------------------
create table organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  logo_url    text,
  created_at  timestamptz not null default now()
);

-- Profiles extend Supabase auth.users (id === auth.uid()).
create table profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  organization_id  uuid not null references organizations (id) on delete cascade,
  full_name        text not null,
  email            text not null,
  role             user_role not null default 'facilitator',
  avatar_url       text,
  created_at       timestamptz not null default now()
);

create table teams (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations (id) on delete cascade,
  name             text not null,
  created_at       timestamptz not null default now()
);

create table team_members (
  team_id     uuid not null references teams (id) on delete cascade,
  profile_id  uuid not null references profiles (id) on delete cascade,
  primary key (team_id, profile_id)
);

-- ---- boards ----------------------------------------------------------------
create table boards (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references organizations (id) on delete cascade,
  created_by            uuid not null references profiles (id),
  internal_name         text not null default '',
  public_title          text not null,
  public_subtitle       text not null default '',
  internal_description  text not null default '',
  status                board_status not null default 'draft',
  -- Grouped config stored as JSONB (validated app-side with Zod).
  appearance            jsonb not null default '{}'::jsonb,
  participation         jsonb not null default '{}'::jsonb,
  moderation            jsonb not null default '{}'::jsonb,
  sharing               sharing_level not null default 'private',
  default_layout        display_layout not null default 'wall',
  default_sort          text not null default 'newest',
  tags                  text[] not null default '{}',
  folder                text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  archived_at           timestamptz,
  last_activated_at     timestamptz
);
create index boards_org_idx on boards (organization_id);
create index boards_created_by_idx on boards (created_by);

create table board_collaborators (
  board_id    uuid not null references boards (id) on delete cascade,
  profile_id  uuid not null references profiles (id) on delete cascade,
  primary key (board_id, profile_id)
);

create table board_tags (
  board_id  uuid not null references boards (id) on delete cascade,
  tag       text not null,
  primary key (board_id, tag)
);

-- ---- live rooms ------------------------------------------------------------
create table live_rooms (
  id                     uuid primary key default gen_random_uuid(),
  board_id               uuid not null references boards (id) on delete cascade,
  organization_id        uuid not null references organizations (id) on delete cascade,
  public_id              text not null unique,       -- non-guessable, used in /join & /display
  room_code              text not null,              -- 6-digit human code
  session_label          text,
  status                 room_status not null default 'active',
  layout                 display_layout not null default 'wall',
  focused_submission_id  uuid,
  qr_overlay_visible     boolean not null default false,
  participant_count      integer not null default 0,
  started_at             timestamptz,
  ended_at               timestamptz,
  last_activity_at       timestamptz not null default now(),
  created_by             uuid not null references profiles (id),
  created_at             timestamptz not null default now()
);
create index live_rooms_board_idx on live_rooms (board_id);
create index live_rooms_public_idx on live_rooms (public_id);
create index live_rooms_code_idx on live_rooms (room_code);
create index live_rooms_status_idx on live_rooms (status);

create table room_facilitators (
  room_id     uuid not null references live_rooms (id) on delete cascade,
  profile_id  uuid not null references profiles (id) on delete cascade,
  primary key (room_id, profile_id)
);

-- ---- participants ----------------------------------------------------------
create table participant_sessions (
  id            uuid primary key default gen_random_uuid(),
  room_id       uuid not null references live_rooms (id) on delete cascade,
  display_name  text,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);
create index participant_sessions_room_idx on participant_sessions (room_id);

-- ---- submissions -----------------------------------------------------------
create table submissions (
  id                      uuid primary key default gen_random_uuid(),
  room_id                 uuid not null references live_rooms (id) on delete cascade,
  organization_id         uuid not null references organizations (id) on delete cascade,
  type                    submission_type not null,
  text_content            text,
  media_url               text,
  participant_session_id  uuid not null references participant_sessions (id) on delete cascade,
  display_name            text,
  anonymous               boolean not null default false,
  status                  submission_status not null default 'published',
  pinned                  boolean not null default false,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index submissions_room_idx on submissions (room_id);
create index submissions_status_idx on submissions (room_id, status);

alter table live_rooms
  add constraint live_rooms_focus_fk
  foreign key (focused_submission_id) references submissions (id) on delete set null;

-- ---- audit / activity ------------------------------------------------------
create table moderation_actions (
  id             uuid primary key default gen_random_uuid(),
  room_id        uuid not null references live_rooms (id) on delete cascade,
  submission_id  uuid references submissions (id) on delete set null,
  actor_id       uuid references profiles (id),
  action         text not null,
  created_at     timestamptz not null default now()
);

create table activity_events (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references live_rooms (id) on delete cascade,
  type        text not null,
  actor_id    uuid references profiles (id),
  meaningful  boolean not null default false,
  created_at  timestamptz not null default now()
);
create index activity_events_room_idx on activity_events (room_id, created_at desc);

create table uploaded_assets (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations (id) on delete cascade,
  bucket           text not null,
  path             text not null,
  created_by       uuid references profiles (id),
  created_at       timestamptz not null default now()
);

-- ---- keep updated_at fresh -------------------------------------------------
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger boards_updated_at before update on boards
  for each row execute function set_updated_at();
create trigger submissions_updated_at before update on submissions
  for each row execute function set_updated_at();
