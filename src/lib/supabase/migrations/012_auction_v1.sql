alter table public.game_state
  add column if not exists auction_active boolean not null default false,
  add column if not exists auction_tile_index integer,
  add column if not exists auction_initiator_player_id uuid,
  add column if not exists auction_current_bid integer not null default 0,
  add column if not exists auction_current_winner_player_id uuid,
  add column if not exists auction_turn_player_id uuid,
  add column if not exists auction_turn_ends_at timestamptz,
  add column if not exists auction_eligible_player_ids uuid[] not null default '{}'::uuid[],
  add column if not exists auction_passed_player_ids uuid[] not null default '{}'::uuid[],
  add column if not exists auction_min_increment integer not null default 10;

alter table public.game_state
  alter column rules set default '{"freeParkingJackpotEnabled": false, "loanCollateralEnabled": true, "collateralLtv": 0.5, "loanRatePerTurn": 0.008, "loanTermTurns": 10, "auctionEnabled": true, "auctionMinIncrement": 10, "auctionTurnSeconds": 60, "auctionAllowInitiatorToBid": true}'::jsonb;
