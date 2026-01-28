alter table public.game_state
  add column if not exists pending_card_active boolean not null default false,
  add column if not exists pending_card_deck text,
  add column if not exists pending_card_id text,
  add column if not exists pending_card_title text,
  add column if not exists pending_card_kind text,
  add column if not exists pending_card_payload jsonb,
  add column if not exists pending_card_drawn_by_player_id uuid,
  add column if not exists pending_card_drawn_at timestamptz,
  add column if not exists pending_card_source_tile_index integer;
