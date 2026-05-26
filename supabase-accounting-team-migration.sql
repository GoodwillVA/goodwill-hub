-- ============================================================
-- Goodwill Hub — Accounting Team Migration
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- ============================================================


-- -------------------------------------------------------
-- 1. team_members
-- -------------------------------------------------------
create table if not exists public.team_members (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  title text,
  notes text,                             -- "what they're working on"
  ai_thread jsonb not null default '[]'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz default now()
);

alter table public.team_members enable row level security;
create policy "auth_all" on public.team_members for all using (auth.role() = 'authenticated');


-- -------------------------------------------------------
-- 2. team_member_logs  (dated journal entries per member)
-- -------------------------------------------------------
create table if not exists public.team_member_logs (
  id uuid default uuid_generate_v4() primary key,
  member_id uuid not null references public.team_members(id) on delete cascade,
  content text not null,
  log_date date not null default current_date,
  created_at timestamptz default now()
);

alter table public.team_member_logs enable row level security;
create policy "auth_all" on public.team_member_logs for all using (auth.role() = 'authenticated');


-- -------------------------------------------------------
-- 3. team_member_goals  (quarterly / annual goals)
-- -------------------------------------------------------
create table if not exists public.team_member_goals (
  id uuid default uuid_generate_v4() primary key,
  member_id uuid not null references public.team_members(id) on delete cascade,
  title text not null,
  period text not null default '',        -- e.g. "Q1 FY26", "Annual FY26"
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'completed', 'at_risk')),
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz default now()
);

alter table public.team_member_goals enable row level security;
create policy "auth_all" on public.team_member_goals for all using (auth.role() = 'authenticated');


-- -------------------------------------------------------
-- 4. team_settings  (singleton — announcements draft pad)
-- -------------------------------------------------------
create table if not exists public.team_settings (
  id integer primary key default 1,
  announcements text,
  updated_at timestamptz default now(),
  constraint single_row check (id = 1)
);

alter table public.team_settings enable row level security;
create policy "auth_all" on public.team_settings for all using (auth.role() = 'authenticated');

-- Seed the singleton row
insert into public.team_settings (id) values (1) on conflict (id) do nothing;
