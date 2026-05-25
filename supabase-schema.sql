-- Run this in your Supabase SQL editor to set up the AIBC HQ schema

create extension if not exists "uuid-ossp";

-- Ideas
create table public.ideas (
  id uuid default uuid_generate_v4() primary key,
  title text not null,
  body text,
  category text not null default 'other'
    check (category in ('quick-revenue','new-service','product','partnership','other')),
  ai_thread jsonb default '[]'::jsonb,
  status text not null default 'raw'
    check (status in ('raw','exploring','in-progress','implemented','shelved')),
  created_at timestamptz default now()
);

-- Contacts / CRM
create table public.contacts (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  company text,
  email text,
  phone text,
  stage text not null default 'discovery'
    check (stage in ('discovery','proposal','active','complete','lost')),
  notes text,
  proposal_value numeric(10,2),
  invoiced numeric(10,2),
  collected numeric(10,2),
  next_followup date,
  created_at timestamptz default now()
);

-- Projects
create table public.projects (
  id uuid default uuid_generate_v4() primary key,
  contact_id uuid references public.contacts(id) on delete set null,
  name text not null,
  description text,
  status text not null default 'scoping'
    check (status in ('scoping','in-progress','review','delivered')),
  start_date date,
  due_date date,
  value numeric(10,2),
  created_at timestamptz default now()
);

-- Tasks (belong to projects)
create table public.tasks (
  id uuid default uuid_generate_v4() primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  status text not null default 'todo'
    check (status in ('todo','done')),
  due_date date,
  created_at timestamptz default now()
);

-- Content items
create table public.content_items (
  id uuid default uuid_generate_v4() primary key,
  title text not null,
  type text not null default 'linkedin'
    check (type in ('linkedin','blog','email','other')),
  body text,
  status text not null default 'idea'
    check (status in ('idea','draft','scheduled','published')),
  publish_date date,
  tags text[] default '{}',
  notes text,
  case_study_ref text,
  created_at timestamptz default now()
);

-- Row Level Security — all tables, authenticated users only
alter table public.ideas enable row level security;
alter table public.contacts enable row level security;
alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.content_items enable row level security;

create policy "auth_all" on public.ideas for all using (auth.role() = 'authenticated');
create policy "auth_all" on public.contacts for all using (auth.role() = 'authenticated');
create policy "auth_all" on public.projects for all using (auth.role() = 'authenticated');
create policy "auth_all" on public.tasks for all using (auth.role() = 'authenticated');
create policy "auth_all" on public.content_items for all using (auth.role() = 'authenticated');
