-- ============================================================
-- File Attachments feature
-- Run in Supabase SQL editor
-- ============================================================

-- 1. Attachments metadata table
create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('meeting', 'project', 'team_member', 'team')),
  entity_id text not null,
  file_name text not null,
  file_size integer not null,
  mime_type text not null,
  storage_path text not null,
  extracted_text text,
  created_at timestamptz not null default now()
);

create index if not exists attachments_entity_idx
  on public.attachments (entity_type, entity_id);

alter table public.attachments enable row level security;

create policy "authenticated manage attachments"
  on public.attachments for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- 2. Storage bucket  (may error if already exists — that's fine)
insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 10485760)
on conflict (id) do nothing;

-- 3. Storage policies
create policy "auth read attachments storage"
  on storage.objects for select
  using (bucket_id = 'attachments' and auth.role() = 'authenticated');

create policy "auth upload attachments storage"
  on storage.objects for insert
  with check (bucket_id = 'attachments' and auth.role() = 'authenticated');

create policy "auth delete attachments storage"
  on storage.objects for delete
  using (bucket_id = 'attachments' and auth.role() = 'authenticated');
