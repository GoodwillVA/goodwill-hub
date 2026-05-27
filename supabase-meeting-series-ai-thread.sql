-- Migration: add ai_thread column to meeting_series
-- Run this in the Supabase SQL editor

alter table public.meeting_series
  add column if not exists ai_thread jsonb not null default '[]'::jsonb;
