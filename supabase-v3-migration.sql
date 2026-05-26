-- ============================================================
-- Goodwill Hub — v3 Migration
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- ============================================================


-- -------------------------------------------------------
-- 1. day_focus_items  (3-day dashboard focus list)
-- -------------------------------------------------------
create table if not exists public.day_focus_items (
  id uuid default uuid_generate_v4() primary key,
  focus_date date not null,
  item_type text not null default 'freeform'
    check (item_type in ('task', 'monthly_task', 'freeform')),
  title text,                          -- display text (freeform or cached label)
  task_id uuid references public.tasks(id) on delete cascade,
  monthly_task_id uuid references public.monthly_tasks(id) on delete cascade,
  sort_order integer not null default 0,
  completed boolean not null default false,
  created_at timestamptz default now()
);

alter table public.day_focus_items enable row level security;
create policy "auth_all" on public.day_focus_items for all using (auth.role() = 'authenticated');


-- -------------------------------------------------------
-- 2. projects — add AI thread + General flag
-- -------------------------------------------------------
alter table public.projects
  add column if not exists ai_thread jsonb not null default '[]'::jsonb,
  add column if not exists is_general boolean not null default false;

-- Create the pinned General AI Workspace project (idempotent)
insert into public.projects (name, description, status, is_general, ai_thread)
select
  'General',
  'General AI workspace — brainstorm ideas, draft documents, or ask anything',
  'in-progress',
  true,
  '[]'::jsonb
where not exists (
  select 1 from public.projects where is_general = true
);


-- -------------------------------------------------------
-- 3. saved_attendees — add organization column
-- -------------------------------------------------------
alter table public.saved_attendees
  add column if not exists organization text;


-- -------------------------------------------------------
-- 4. meetings — update type constraint to include new types
-- -------------------------------------------------------
alter table public.meetings drop constraint if exists meetings_type_check;
alter table public.meetings
  add constraint meetings_type_check
  check (type in ('client-call', 'discovery', 'internal', 'follow-up', 'board', 'training', 'external', 'other'));
