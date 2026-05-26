-- ============================================================
-- Goodwill Hub — Controller Feature Migration
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- ============================================================


-- -------------------------------------------------------
-- 1. meeting_series  (named groupings for recurring meetings)
-- -------------------------------------------------------
create table if not exists public.meeting_series (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  created_at timestamptz default now()
);

alter table public.meeting_series enable row level security;
create policy "auth_all" on public.meeting_series for all using (auth.role() = 'authenticated');


-- -------------------------------------------------------
-- 2. saved_attendees  (autocomplete for meeting attendees)
-- -------------------------------------------------------
create table if not exists public.saved_attendees (
  id uuid default uuid_generate_v4() primary key,
  name text not null unique,
  position text,
  created_at timestamptz default now()
);

alter table public.saved_attendees enable row level security;
create policy "auth_all" on public.saved_attendees for all using (auth.role() = 'authenticated');


-- -------------------------------------------------------
-- 3. monthly_tasks  (month-end close checklists)
-- -------------------------------------------------------
create table if not exists public.monthly_tasks (
  id uuid default uuid_generate_v4() primary key,
  month_year text not null,        -- format: 'YYYY-MM'
  title text not null,
  completed boolean not null default false,
  completed_at timestamptz,
  due_date date,
  notes text,
  sort_order integer not null default 0,
  is_recurring boolean not null default false,
  created_at timestamptz default now()
);

alter table public.monthly_tasks enable row level security;
create policy "auth_all" on public.monthly_tasks for all using (auth.role() = 'authenticated');


-- -------------------------------------------------------
-- 4. meetings — add attendees (JSONB) and series columns
-- -------------------------------------------------------
alter table public.meetings
  add column if not exists attendees jsonb not null default '[]'::jsonb,
  add column if not exists series_id uuid references public.meeting_series(id) on delete set null;


-- -------------------------------------------------------
-- 5. projects — add area column
-- -------------------------------------------------------
alter table public.projects
  add column if not exists area text;


-- -------------------------------------------------------
-- 6. ideas — replace category constraint with Controller set
-- -------------------------------------------------------

-- Remap any old category values so no rows are left invalid
update public.ideas
set category = 'other'
where category not in ('process-improvement', 'reporting', 'controls', 'technology', 'team', 'other');

-- Drop the original check constraint (auto-named by Postgres)
alter table public.ideas drop constraint if exists ideas_category_check;

-- Add new Controller-focused categories
alter table public.ideas
  add constraint ideas_category_check
  check (category in ('process-improvement', 'reporting', 'controls', 'technology', 'team', 'other'));

-- Update column default
alter table public.ideas alter column category set default 'other';
