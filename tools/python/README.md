# Python Simulation Lab

This directory contains an **offline-only Python simulation lab** for experimenting with simplified game-balance scenarios. It is intentionally separate from the production Next.js app and is not used by Vercel, Supabase, or `/play-v2` runtime code.

## Safety boundaries

- The simulator is experimental and **not authoritative** for live game outcomes.
- It must not mutate live games, production gameplay state, Supabase data, or deployment configuration.
- It does not expose a production API bridge and does not call application routes.
- It uses local JSON fixtures under `tools/python/exports/` and writes local summary files only.

## Phase 1 scope

The current Phase 1 simulator supports a deliberately small rules subset:

- Loading a static boardpack fixture from JSON.
- Creating local simulated players.
- Rolling two six-sided dice with a fixed random seed.
- Moving around the board and awarding GO salary when passing tile index `0`.
- Buying unowned properties when a player can keep a configurable cash reserve.
- Paying rent from visitors to property owners.
- Marking players bankrupt when their cash drops below zero.
- Running many games and printing aggregate summary statistics.
- Writing a generated JSON summary under `tools/python/exports/`.

The simulator intentionally excludes taxes, cards, loans, mortgages, inland exploration, betting markets, auctions, and any AI integration into the live application.

## Run the simulator

From the repository root, run:

```bash
python tools/python/simulations/simulate_basic_game.py
```

By default this reads `tools/python/exports/sample_boardpack_basic.json`, simulates many games with a fixed seed, prints summary stats to the console, and writes a generated `simulation_summary_*.json` file under `tools/python/exports/`.
