-- ============================================================
-- Goodwill Hub — Accounting Team v2 Migration
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- ============================================================


-- -------------------------------------------------------
-- 1. team_members — add manage-tab columns
-- -------------------------------------------------------
alter table public.team_members
  add column if not exists agenda_items jsonb not null default '[]'::jsonb,
  add column if not exists pending_asks jsonb not null default '[]'::jsonb,
  add column if not exists status_draft text;


-- -------------------------------------------------------
-- 2. team_settings — add team AI thread
-- -------------------------------------------------------
alter table public.team_settings
  add column if not exists ai_thread jsonb not null default '[]'::jsonb;


-- -------------------------------------------------------
-- 3. meetings — add 'team' and '1-1' types
-- -------------------------------------------------------
alter table public.meetings drop constraint if exists meetings_type_check;
alter table public.meetings
  add constraint meetings_type_check
  check (type in (
    'client-call', 'discovery', 'internal', 'follow-up',
    'board', 'training', 'external', 'other', 'team', '1-1'
  ));
