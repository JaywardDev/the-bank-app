# Python Simulation Lab

This directory contains an **offline-only Python simulation lab** for experimenting with simplified game-balance scenarios. It is intentionally separate from the production Next.js app and is not used by Vercel, Supabase, or `/play-v2` runtime code.

## Safety boundaries

- The simulator is experimental and **not authoritative** for live game outcomes.
- It must not mutate live games, production gameplay state, Supabase data, or deployment configuration.
- It does not expose a production API bridge and does not call application routes.
- It uses local JSON fixtures under `tools/python/exports/` and writes local summary files only.

## Phase 2 flow (generated fixture from canonical TypeScript boardpacks)

1. Export a sanitized simulation fixture from `src/lib/boardPacks.ts` boardpack data:

```bash
npm run export:sim-boardpack
```

By default, this exports `philippines-hard` to:
`tools/python/exports/generated_boardpack_fixture.json`.

2. Run the simulator against the generated fixture:

```bash
python tools/python/simulations/simulate_basic_game.py --fixture tools/python/exports/generated_boardpack_fixture.json --games 500 --seed 42 --max-rounds 150
```

3. Simulator output includes console stats and a generated summary JSON file:
`tools/python/exports/simulation_summary_*.json`.

## Backward compatibility with Phase 1 sample fixture

This still works and uses the sample fixture by default:

```bash
python tools/python/simulations/simulate_basic_game.py
```

## Notes on model scope

- Rules remain intentionally simplified and local.
- Unknown or unsupported tile types are skipped safely.
- Missing required fixture fields return clear validation errors.
- Property rent ladders are accepted but only base rent is used for now (no houses/hotels simulation).
