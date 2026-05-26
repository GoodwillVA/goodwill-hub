-- Run this in Supabase SQL Editor to add the Meetings module

create table public.meetings (
  id uuid default uuid_generate_v4() primary key,
  title text not null,
  meeting_date date not null,
  meeting_time time,
  duration_minutes integer,
  type text not null default 'client-call'
    check (type in ('client-call','discovery','internal','follow-up','other')),
  contact_id uuid references public.contacts(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  notes text,
  transcript text,
  summary text,
  action_items jsonb default '[]'::jsonb,
  followup_email text,
  status text not null default 'scheduled'
    check (status in ('scheduled','completed','cancelled')),
  created_at timestamptz default now()
);

alter table public.meetings enable row level security;
create policy "auth_all" on public.meetings for all using (auth.role() = 'authenticated');
