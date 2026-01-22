/**
 * DB Source of Truth: /supabase/migrations
 *
 * public.games:
 * - id (uuid)
 * - join_code (text)
 * - status (text)
 * - created_at (timestamptz)
 * - created_by (uuid, nullable)
 *
 * public.players:
 * - id (uuid)
 * - game_id (uuid)
 * - user_id (uuid)
 * - display_name (text)
 * - created_at (timestamptz)
 * - position (integer)
 */
export {};
// This file is intentionally left empty as a placeholder for database schema notes.
