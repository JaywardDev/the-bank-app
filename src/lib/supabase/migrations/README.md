# Supabase Schema (Source of Truth)

This folder is the canonical database schema for The Bank app.

## Rules
- Before writing or changing any database queries, check `supabase/migrations/*.sql`.
- App code must only reference columns/tables that exist in these migrations.
- If a new column/table is needed, add a new migration file (do not change old migrations).

## Current tables
- public.games
- public.players
