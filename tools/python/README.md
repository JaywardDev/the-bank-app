# Python Simulation Lab

This directory contains an **offline-only Python simulation lab** for experimenting with simplified game-balance scenarios. It is intentionally separate from the production Next.js app and is not used by Vercel, Supabase, or `/play-v2` runtime code.

## Safety boundaries

- The simulator is experimental and **not authoritative** for live game outcomes.
- It must not mutate live games, production gameplay state, Supabase data, or deployment configuration.
- It does not expose a production API bridge and does not call application routes.
- It uses local JSON fixtures under `tools/python/exports/` and writes local summary files only.

## Phase 4 flow (fixture-driven loan rules + liquidity approximations)

These Phase 4 rules are **approximations only**. They are for designer feedback and economy pressure testing, and **no live gameplay uses these Python rules**.

- Balanced player policy is default and prioritizes liquidity survival before insolvency.
- Proactive collateral loans are modeled as simplified action-based liquidity (not emergency auto-mortgage behavior).
- Purchase mortgages are modeled as acquisition obligations with scheduled payments and default behavior.
- Passive inland income, betting, and auctions are simplified approximations for macro-economy pressure testing.
- Generated fixtures now include boardpack-derived `loan_rules` from runtime `GameRules` resolution.
- The simulator uses fixture `loan_rules` by default.
- CLI values override fixture loan values only when explicitly passed.
- Collateral principal currently uses effective runtime parity LTV `0.6` even if `rules.collateralLtv` differs.

1. Export a sanitized simulation fixture from `src/lib/boardPacks.ts` boardpack data:

```bash
npm run export:sim-boardpack
```

2. Run baseline simulation:

```bash
python tools/python/simulations/simulate_basic_game.py --fixture tools/python/exports/generated_boardpack_fixture.json --games 500 --seed 42 --max-rounds 150
```

3. Balanced liquidity:

```bash
python tools/python/simulations/simulate_basic_game.py --fixture tools/python/exports/generated_boardpack_fixture.json --games 500 --seed 42 --max-rounds 150 --player-policy balanced --passive-income-per-owned-property 50
```

4. Override example (explicit CLI beats fixture value):

```bash
python tools/python/simulations/simulate_basic_game.py --fixture tools/python/exports/generated_boardpack_fixture.json --games 500 --seed 42 --max-rounds 150 --down-payment-ratio 0.5
```

5. Balanced liquidity + betting:

```bash
python tools/python/simulations/simulate_basic_game.py --fixture tools/python/exports/generated_boardpack_fixture.json --games 500 --seed 42 --max-rounds 150 --player-policy balanced --passive-income-per-owned-property 50 --enable-betting --bet-probability 0.2 --bet-stake 100 --bet-win-probability 0.45 --bet-payout-multiplier 2
```

6. Balanced liquidity + auctions:

```bash
python tools/python/simulations/simulate_basic_game.py --fixture tools/python/exports/generated_boardpack_fixture.json --games 500 --seed 42 --max-rounds 150 --player-policy balanced --passive-income-per-owned-property 50 --enable-auctions --auction-bid-ratio 0.7
```

7. Output includes console stats and generated summary JSON files under:
`tools/python/exports/simulation_summary_*.json`.

To test real boardpack loan changes:
1. Edit boardpack loan rules.
2. Run `npm run export:sim-boardpack`.
3. Run the Python simulation using the generated fixture.

## Backward compatibility with Phase 1 sample fixture

This still works and uses the sample fixture by default:

```bash
python tools/python/simulations/simulate_basic_game.py
```

## Notes on model scope

- Rules remain intentionally simplified and local.
- Unknown or unsupported tile types are skipped safely.
- Missing required fixture fields return clear validation errors.
- Property rent ladders are partially approximated.
- Collateralized properties remain rent-earning in Phase 3 approximation until deeper gameplay audit confirms otherwise.
