-- ============================================================
-- Add 'series' to attachments entity_type constraint
-- Run in Supabase SQL editor
-- ============================================================

-- Drop the existing inline check constraint (auto-named by Postgres)
alter table public.attachments
  drop constraint if exists attachments_entity_type_check;

-- Re-create with 'series' added
alter table public.attachments
  add constraint attachments_entity_type_check
  check (entity_type in ('meeting', 'project', 'team_member', 'team', 'series'));
