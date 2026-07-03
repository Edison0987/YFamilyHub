-- =============================================================================
-- Family Hub — Supabase / PostgreSQL schema
-- =============================================================================
-- Run this whole file once in the Supabase SQL Editor (Dashboard → SQL Editor).
-- It is safe to re-run: it uses "if not exists" / "drop policy if exists" guards.
--
-- What it sets up:
--   1. Tables (profiles, channels, messages, attachments, workflows, ...)
--   2. A trigger that auto-creates a profile row whenever someone signs up
--   3. Row Level Security (RLS) so only invited family members can read/write
--   4. A private Storage bucket ("attachments") for files/images
--   5. Realtime publication so the UI updates live
-- =============================================================================

-- Needed for gen_random_uuid()
create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. PROFILES  (one row per family member, linked to Supabase auth user)
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  avatar_url  text,
  role        text not null default 'member' check (role in ('admin', 'member')),
  timezone    text not null default 'Asia/Manila',
  created_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 2. CHANNELS
-- -----------------------------------------------------------------------------
create table if not exists public.channels (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  description    text,
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  lock_code_hash text     -- sha256 hex of an access code; null = not locked
);

-- Safe to re-run on a database created before this column existed:
alter table public.channels add column if not exists lock_code_hash text;

-- Optional explicit membership (kept for future private channels).
-- In this MVP every family member can see every channel.
create table if not exists public.channel_members (
  channel_id uuid not null references public.channels (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  added_at   timestamptz not null default now(),
  primary key (channel_id, user_id)
);

-- -----------------------------------------------------------------------------
-- 3. WORKFLOWS  (recurring reminder definitions — created by admins)
-- -----------------------------------------------------------------------------
create table if not exists public.workflows (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  body          text,
  channel_id    uuid not null references public.channels (id) on delete cascade,
  -- daily | weekly | monthly | once | cron
  schedule_type text not null check (schedule_type in ('daily', 'weekly', 'monthly', 'once', 'cron')),
  time_of_day   time not null default '09:00',          -- local wall-clock time
  timezone      text not null default 'Asia/Manila',
  day_of_week   int  check (day_of_week between 0 and 6),  -- 0=Sun .. 6=Sat (weekly)
  day_of_month  int  check (day_of_month between 1 and 31),-- (monthly)
  run_date      date,                                       -- (once)
  cron_expr     text,                                       -- (cron) e.g. "0 9 * * 1-5"
  active        boolean not null default true,
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  last_run_at   timestamptz
);

-- -----------------------------------------------------------------------------
-- 4. WORKFLOW OCCURRENCES  (one row per scheduled run — each has its own DONE)
-- -----------------------------------------------------------------------------
create table if not exists public.workflow_occurrences (
  id             uuid primary key default gen_random_uuid(),
  workflow_id    uuid not null references public.workflows (id) on delete cascade,
  scheduled_for  timestamptz not null,        -- the UTC instant this run was due
  occurrence_key text not null,               -- de-dupe key, e.g. "monthly-2026-06"
  status         text not null default 'pending' check (status in ('pending', 'done')),
  done_by        uuid references public.profiles (id) on delete set null,
  done_at        timestamptz,
  created_at     timestamptz not null default now(),
  -- This is what prevents duplicate reminders for the same scheduled slot:
  unique (workflow_id, occurrence_key)
);

-- -----------------------------------------------------------------------------
-- 5. MESSAGES  (unified: normal messages, thread replies, and workflow posts)
--    - parent_id  -> set for replies (points at the root message)
--    - type       -> 'user' (typed by a person) or 'workflow' (auto-generated)
--    - workflow_occurrence_id -> links a workflow post to its DONE state
-- -----------------------------------------------------------------------------
create table if not exists public.messages (
  id                     uuid primary key default gen_random_uuid(),
  channel_id             uuid not null references public.channels (id) on delete cascade,
  parent_id              uuid references public.messages (id) on delete cascade,
  author_id              uuid references public.profiles (id) on delete set null,
  body                   text,
  type                   text not null default 'user' check (type in ('user', 'workflow')),
  workflow_occurrence_id uuid references public.workflow_occurrences (id) on delete cascade,
  created_at             timestamptz not null default now(),
  edited_at              timestamptz,   -- set when the sender edits the body
  deleted_at             timestamptz    -- set when the sender "unsends" (delete for everyone)
);

-- Safe to re-run on a database created before these columns existed:
alter table public.messages add column if not exists edited_at  timestamptz;
alter table public.messages add column if not exists deleted_at timestamptz;

create index if not exists messages_channel_idx on public.messages (channel_id, created_at);
create index if not exists messages_parent_idx  on public.messages (parent_id);

-- -----------------------------------------------------------------------------
-- 5b. MESSAGE HIDES  ("delete for me" — hides a message from just one viewer)
-- -----------------------------------------------------------------------------
create table if not exists public.message_hides (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  hidden_at  timestamptz not null default now(),
  primary key (message_id, user_id)
);

-- -----------------------------------------------------------------------------
-- 6. ATTACHMENTS  (files/images linked to any message — incl. replies & workflow)
-- -----------------------------------------------------------------------------
create table if not exists public.attachments (
  id           uuid primary key default gen_random_uuid(),
  message_id   uuid not null references public.messages (id) on delete cascade,
  uploaded_by  uuid references public.profiles (id) on delete set null,
  storage_path text not null,        -- path inside the "attachments" storage bucket
  file_name    text not null,
  mime_type    text,
  size_bytes   bigint,
  created_at   timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 7. WORKFLOW LOGS  (audit trail of cron runs — handy for debugging)
-- -----------------------------------------------------------------------------
create table if not exists public.workflow_logs (
  id            uuid primary key default gen_random_uuid(),
  workflow_id   uuid references public.workflows (id) on delete cascade,
  occurrence_id uuid references public.workflow_occurrences (id) on delete set null,
  ran_at        timestamptz not null default now(),
  status        text,               -- 'created' | 'skipped' | 'error'
  detail        text
);

-- =============================================================================
-- AUTH TRIGGER: create a profile automatically when a new auth user appears
-- =============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'role', 'member')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- RLS HELPER FUNCTIONS
-- =============================================================================
-- A "family member" = anyone who has a profile row (only invited users do).
create or replace function public.is_family_member()
returns boolean
language sql security definer stable set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid());
$$;

create or replace function public.is_admin()
returns boolean
language sql security definer stable set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
alter table public.profiles             enable row level security;
alter table public.channels             enable row level security;
alter table public.channel_members      enable row level security;
alter table public.workflows            enable row level security;
alter table public.workflow_occurrences enable row level security;
alter table public.messages             enable row level security;
alter table public.message_hides        enable row level security;
alter table public.attachments          enable row level security;
alter table public.workflow_logs        enable row level security;

-- ---- profiles ---------------------------------------------------------------
drop policy if exists "profiles read"        on public.profiles;
drop policy if exists "profiles update self" on public.profiles;
drop policy if exists "profiles admin update" on public.profiles;
create policy "profiles read"        on public.profiles for select using (public.is_family_member());
create policy "profiles update self" on public.profiles for update using (id = auth.uid());
create policy "profiles admin update" on public.profiles for update using (public.is_admin());

-- ---- channels ---------------------------------------------------------------
drop policy if exists "channels read"  on public.channels;
drop policy if exists "channels admin" on public.channels;
create policy "channels read"  on public.channels for select using (public.is_family_member());
create policy "channels admin" on public.channels for all
  using (public.is_admin()) with check (public.is_admin());

-- ---- channel_members --------------------------------------------------------
drop policy if exists "members read"  on public.channel_members;
drop policy if exists "members admin" on public.channel_members;
create policy "members read"  on public.channel_members for select using (public.is_family_member());
create policy "members admin" on public.channel_members for all
  using (public.is_admin()) with check (public.is_admin());

-- ---- workflows (admins manage, everyone reads) ------------------------------
drop policy if exists "workflows read"  on public.workflows;
drop policy if exists "workflows admin" on public.workflows;
create policy "workflows read"  on public.workflows for select using (public.is_family_member());
create policy "workflows admin" on public.workflows for all
  using (public.is_admin()) with check (public.is_admin());

-- ---- workflow_occurrences ---------------------------------------------------
-- Everyone reads. Family members may UPDATE (to mark DONE / reopen).
-- INSERT is done by the cron route using the service role (which bypasses RLS).
drop policy if exists "occ read"   on public.workflow_occurrences;
drop policy if exists "occ update" on public.workflow_occurrences;
create policy "occ read"   on public.workflow_occurrences for select using (public.is_family_member());
create policy "occ update" on public.workflow_occurrences for update
  using (public.is_family_member()) with check (public.is_family_member());

-- ---- messages ---------------------------------------------------------------
-- Everyone reads. A family member may insert their OWN normal/reply messages.
-- Workflow messages (type='workflow') are inserted by the service role only.
drop policy if exists "messages read"   on public.messages;
drop policy if exists "messages insert" on public.messages;
drop policy if exists "messages modify" on public.messages;
create policy "messages read"   on public.messages for select using (public.is_family_member());
create policy "messages insert" on public.messages for insert
  with check (public.is_family_member() and author_id = auth.uid() and type = 'user');
create policy "messages modify" on public.messages for update
  using (author_id = auth.uid() or public.is_admin());
drop policy if exists "messages delete" on public.messages;
create policy "messages delete" on public.messages for delete
  using (author_id = auth.uid() or public.is_admin());

-- ---- message_hides (each family member manages only their own hidden list) --
drop policy if exists "hides read"   on public.message_hides;
drop policy if exists "hides insert" on public.message_hides;
drop policy if exists "hides delete" on public.message_hides;
create policy "hides read"   on public.message_hides for select using (user_id = auth.uid());
create policy "hides insert" on public.message_hides for insert with check (user_id = auth.uid());
create policy "hides delete" on public.message_hides for delete using (user_id = auth.uid());

-- ---- attachments ------------------------------------------------------------
drop policy if exists "attachments read"   on public.attachments;
drop policy if exists "attachments insert" on public.attachments;
create policy "attachments read"   on public.attachments for select using (public.is_family_member());
create policy "attachments insert" on public.attachments for insert
  with check (public.is_family_member() and uploaded_by = auth.uid());

-- ---- workflow_logs (admins only) --------------------------------------------
drop policy if exists "logs admin" on public.workflow_logs;
create policy "logs admin" on public.workflow_logs for select using (public.is_admin());

-- =============================================================================
-- STORAGE: private bucket for attachments + policies
-- =============================================================================
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

drop policy if exists "attachments storage read"   on storage.objects;
drop policy if exists "attachments storage insert" on storage.objects;
create policy "attachments storage read" on storage.objects for select
  using (bucket_id = 'attachments' and public.is_family_member());
create policy "attachments storage insert" on storage.objects for insert
  with check (bucket_id = 'attachments' and public.is_family_member());

-- =============================================================================
-- REALTIME: let the client subscribe to live inserts/updates
-- =============================================================================
-- (Wrapped so re-running the file doesn't error if already added.)
do $$
begin
  begin
    alter publication supabase_realtime add table public.messages;
  exception when duplicate_object then null; end;
  begin
    alter publication supabase_realtime add table public.workflow_occurrences;
  exception when duplicate_object then null; end;
end $$;

-- =============================================================================
-- DONE.  After your first sign-up, promote yourself to admin by running:
--
--   update public.profiles set role = 'admin'
--   where id = (select id from auth.users where email = 'you@example.com');
-- =============================================================================
