-- ============================================================================
-- NGG Boards — 0000 app schema in the shared NGG Supabase project.
--
-- The NGG apps (boards, quiz, simulations, auction) share one Supabase
-- project. Each app keeps its tables, functions and policies in a schema of
-- its own so their names never collide; this app's schema is `board`. Every
-- later migration starts with `set search_path to board;`, so its unqualified
-- names land here, and every SECURITY DEFINER function pins the same path.
--
-- The grants mirror what Supabase gives the `public` schema: the API roles may
-- use the schema and receive the default privileges on new objects. RLS, the
-- RPC grants and the views in later migrations narrow access exactly as they
-- did when the app had a project of its own.
--
-- Run this first, then 0001 onward. The schema must also be listed under
-- Project Settings → Data API → Exposed schemas, or the API answers every
-- request with "Invalid schema: board".
-- ============================================================================

create schema if not exists board;

grant usage on schema board to anon, authenticated, service_role;

alter default privileges in schema board grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema board grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema board grant all on functions to anon, authenticated, service_role;
