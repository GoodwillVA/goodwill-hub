-- Migration: singleton table holding the "All Meetings" AI conversation
-- Run this in the Supabase SQL editor

create table if not exists public.meetings_ai_settings (
  id integer primary key default 1,
  ai_thread jsonb not null default '[]'::jsonb,
  updated_at timestamptz default now(),
  constraint single_row check (id = 1)
);

alter table public.meetings_ai_settings enable row level security;
create policy "auth_all" on public.meetings_ai_settings for all using (auth.role() = 'authenticated');

insert into public.meetings_ai_settings (id) values (1) on conflict (id) do nothing;
