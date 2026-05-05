#!/usr/bin/env python3
"""Run a simple offline-only property game simulation (Phase 3 approximations)."""

from __future__ import annotations

import argparse
import json
import random
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[3]
PYTHON_TOOLS_ROOT = REPO_ROOT / "tools" / "python"
EXPORTS_DIR = PYTHON_TOOLS_ROOT / "exports"
DEFAULT_BOARDPACK_PATH = EXPORTS_DIR / "sample_boardpack_basic.json"

DEFAULT_GAME_COUNT = 250
DEFAULT_MAX_ROUNDS = 75
PLAYER_COUNT = 4
DEFAULT_RANDOM_SEED = 20260505
DEFAULT_ALLOWED_DOWN_PAYMENT_PERCENTS = [30, 40, 50, 60, 70, 80]


@dataclass
class PurchaseMortgage:
    tile_index: int
    financed_amount: int
    payment_per_turn: int
    remaining_turns: int


@dataclass
class Player:
    name: str
    cash: int
    starting_cash: int
    position: int = 0
    bankrupt: bool = False
    pending_insolvency: bool = False
    owned_tiles: list[int] = field(default_factory=list)
    collateralized_tiles: set[int] = field(default_factory=set)
    active_collateral_loans: list[int] = field(default_factory=list)
    purchase_mortgages: dict[int, PurchaseMortgage] = field(default_factory=dict)
    income_tax_baseline_cash: int = 0


@dataclass
class SimulationConfig:
    player_policy: str
    cash_reserve_ratio: float
    low_cash_threshold_ratio: float
    healthy_cash_threshold_ratio: float
    max_collateral_loans_per_player: int
    collateral_loan_value_ratio: float
    enable_purchase_mortgage: bool
    down_payment_ratio: float
    purchase_mortgage_payment_ratio: float
    purchase_mortgage_term_turns: int
    passive_income_per_owned_property: int
    enable_betting: bool
    bet_probability: float
    bet_stake: int
    bet_win_probability: float
    bet_payout_multiplier: float
    enable_auctions: bool
    auction_bid_ratio: float
    mortgage_rate_per_turn: float
    mortgage_ltv: float
    purchase_mortgage_payment_model: str
    collateral_ltv_rules_field_exported: float | None
    collateral_rate_per_turn: float
    collateral_term_turns: int


@dataclass
class GameResult:
    rounds: int
    bankruptcy_count: int
    ending_cash: list[int]
    owned_counter: Counter[int]
    landed_counter: Counter[int]
    rent_earned_by_tile: Counter[int]
    insolvency_entries: int
    insolvency_by_reason: Counter[str]
    recovery_successes: int
    collateral_loans_taken: int
    collateral_cash_raised: int
    collateralized_properties_count: int
    purchase_mortgages_created: int
    purchase_mortgage_defaults: int
    passive_income_total: int
    passive_income_events: int
    bets_placed: int
    betting_staked: int
    betting_winnings: int
    auctions_started: int
    auctions_completed: int
    auction_cash_drained: int
    tax_paid: int
    tax_events: int
    income_tax_paid: int
    income_tax_events: int
    super_tax_paid: int
    super_tax_events: int
    fixed_tax_paid: int
    fixed_tax_events: int


# helpers omitted comments for brevity

def _read_int(data: dict[str, Any], keys: list[str], fallback: int | None = None) -> int | None:
    for key in keys:
        value = data.get(key)
        if isinstance(value, int):
            return value
    return fallback


def load_boardpack(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as boardpack_file:
        boardpack = json.load(boardpack_file)
    tiles = boardpack.get("tiles")
    if not isinstance(tiles, list) or not tiles:
        raise ValueError("boardpack must define a non-empty 'tiles' list")
    board_size = _read_int(boardpack, ["board_size", "tile_count"], len(tiles))
    starting_cash = _read_int(boardpack, ["starting_cash", "starting_cash_amount", "starting_balance"])
    go_salary = _read_int(boardpack, ["go_salary", "pass_go_amount"])
    if not isinstance(board_size, int) or board_size <= 0:
        raise ValueError("boardpack must define a positive board_size")
    if len(tiles) != board_size:
        raise ValueError("boardpack tile count must match board_size")
    if starting_cash is None or go_salary is None:
        raise ValueError("boardpack missing required starting cash or GO salary field")
    normalized_tiles = []
    for index, tile in enumerate(tiles):
        if not isinstance(tile, dict):
            continue
        if tile.get("index", index) != index:
            raise ValueError("boardpack tiles must be ordered by contiguous tile index")
        name = tile.get("name")
        if not isinstance(name, str):
            raise ValueError(f"tile at index {index} missing name")
        normalized_tiles.append({**tile, "index": index, "type": str(tile.get("type", "unknown")).lower(), "name": name})
    return {
        "name": boardpack.get("name") or "Unknown Boardpack",
        "id": boardpack.get("id") or "unknown",
        "starting_cash": starting_cash,
        "go_salary": go_salary,
        "board_size": board_size,
        "tiles": normalized_tiles,
        "loan_rules": boardpack.get("loan_rules"),
        "tax_rules": boardpack.get("tax_rules"),
    }


def roll_two_dice(rng: random.Random) -> int:
    return rng.randint(1, 6) + rng.randint(1, 6)


def _reserve(player: Player, cfg: SimulationConfig) -> int:
    return int(player.starting_cash * cfg.cash_reserve_ratio)


def _debit(player: Player, amount: int, reason: str, counters: Counter[str]) -> None:
    player.cash -= max(0, amount)
    if player.cash < 0 and not player.pending_insolvency:
        player.pending_insolvency = True
        counters[reason] += 1


def _price(tile: dict[str, Any]) -> int:
    return int(tile.get("price") or tile.get("value") or 0)


def _tax_subtype(tile: dict[str, Any]) -> str:
    candidates = [tile.get("tax_kind"), tile.get("tax_type"), tile.get("kind"), tile.get("tile_id"), tile.get("id")]
    for value in candidates:
        if isinstance(value, str):
            token = value.lower()
            if "income" in token:
                return "income"
            if "super" in token:
                return "super"
    name = str(tile.get("name") or "").lower()
    if "income" in name:
        return "income"
    if "super" in name:
        return "super"
    return "fixed"


def _estimated_net_worth(player: Player, boardpack: dict[str, Any]) -> int:
    owned_value = sum(_price(boardpack["tiles"][idx]) for idx in player.owned_tiles)
    # Simplification: subtract outstanding purchase-mortgage financed amounts as rough debt proxy.
    purchase_mortgage_debt = sum(max(0, mtg.financed_amount) for mtg in player.purchase_mortgages.values())
    # Simplification: collateral principal is not explicitly tracked in the simulator, so not deducted.
    return int(player.cash + owned_value - purchase_mortgage_debt)


def _round_to_nearest_allowed_percent(ratio: float, allowed_percents: list[int]) -> float:
    if not allowed_percents:
        return ratio
    target_percent = ratio * 100.0
    nearest = min(allowed_percents, key=lambda p: abs(p - target_percent))
    return nearest / 100.0


def _amortized_payment(principal: int, rate_per_turn: float, term_turns: int) -> int:
    if principal <= 0 or term_turns <= 0:
        return 0
    if rate_per_turn <= 0:
        return max(1, round(principal / term_turns))
    rate = rate_per_turn
    factor = (1 + rate) ** term_turns
    payment = principal * rate * factor / (factor - 1)
    return max(1, round(payment))


def play_game(boardpack: dict[str, Any], rng: random.Random, max_rounds: int, cfg: SimulationConfig, income_tax_rate: float, super_tax_rate: float) -> GameResult:
    players = [Player(name=f"Player {i}", cash=boardpack["starting_cash"], starting_cash=boardpack["starting_cash"], income_tax_baseline_cash=boardpack["starting_cash"]) for i in range(1, PLAYER_COUNT + 1)]
    owners_by_tile: dict[int, Player] = {}
    landed_counter: Counter[int] = Counter()
    rent_earned_by_tile: Counter[int] = Counter()
    insolvency_by_reason: Counter[str] = Counter()
    stats = Counter()
    rounds_played = 0

    for round_number in range(1, max_rounds + 1):
        rounds_played = round_number
        active_players = [p for p in players if not p.bankrupt]
        if len(active_players) <= 1:
            break
        for player in active_players:
            if player.bankrupt:
                continue

            # scheduled purchase mortgage payments
            for tile_idx in list(player.purchase_mortgages.keys()):
                mtg = player.purchase_mortgages[tile_idx]
                _debit(player, mtg.payment_per_turn, "PURCHASE_MORTGAGE_PAYMENT", insolvency_by_reason)
                if player.pending_insolvency:
                    if tile_idx in player.owned_tiles:
                        player.owned_tiles.remove(tile_idx)
                    owners_by_tile.pop(tile_idx, None)
                    player.purchase_mortgages.pop(tile_idx, None)
                    stats["purchase_mortgage_defaults"] += 1
                    break
                mtg.remaining_turns -= 1
                if mtg.remaining_turns <= 0:
                    player.purchase_mortgages.pop(tile_idx, None)

            if player.pending_insolvency:
                if player.cash >= 0:
                    player.pending_insolvency = False
                    stats["recovery_successes"] += 1
                else:
                    player.bankrupt = True
                    continue

            low_threshold = int(player.starting_cash * cfg.low_cash_threshold_ratio)
            healthy_threshold = int(player.starting_cash * cfg.healthy_cash_threshold_ratio)

            # proactive collateral loan
            if 0 <= player.cash < low_threshold and len(player.active_collateral_loans) < cfg.max_collateral_loans_per_player:
                candidates = [idx for idx in player.owned_tiles if idx not in player.collateralized_tiles]
                if candidates:
                    tile_idx = max(candidates, key=lambda t: _price(boardpack["tiles"][t]))
                    loan_cash = round(_price(boardpack["tiles"][tile_idx]) * cfg.collateral_loan_value_ratio)
                    if loan_cash > 0:
                        player.cash += loan_cash
                        player.collateralized_tiles.add(tile_idx)
                        player.active_collateral_loans.append(tile_idx)
                        stats["collateral_loans_taken"] += 1
                        stats["collateral_cash_raised"] += loan_cash

            # optional betting
            if cfg.enable_betting and player.cash > healthy_threshold and rng.random() < cfg.bet_probability:
                stats["bets_placed"] += 1
                stats["betting_staked"] += cfg.bet_stake
                _debit(player, cfg.bet_stake, "OTHER", insolvency_by_reason)
                if not player.pending_insolvency and rng.random() < cfg.bet_win_probability:
                    winnings = int(cfg.bet_stake * cfg.bet_payout_multiplier)
                    player.cash += winnings
                    stats["betting_winnings"] += winnings

            if player.pending_insolvency:
                if player.cash < 0:
                    player.bankrupt = True
                    continue
                player.pending_insolvency = False
                stats["recovery_successes"] += 1

            roll = roll_two_dice(rng)
            prev = player.position
            player.position = (player.position + roll) % boardpack["board_size"]
            if prev + roll >= boardpack["board_size"]:
                player.cash += boardpack["go_salary"]
            tile = boardpack["tiles"][player.position]
            landed_counter[player.position] += 1
            ttype = tile["type"]

            if ttype == "tax":
                subtype = _tax_subtype(tile)
                if subtype == "income":
                    taxable_gain = max(0, player.cash - player.income_tax_baseline_cash)
                    tax = int(income_tax_rate * taxable_gain)
                    if tax > 0:
                        _debit(player, tax, "INCOME_TAX", insolvency_by_reason)
                        stats["income_tax_paid"] += tax
                    stats["income_tax_events"] += 1
                    # Deterministic approximation: reset baseline after each income-tax tile visit to current
                    # cash (post-payment if taxed; unchanged if tax=0), mirroring periodic "gain since last tax".
                    player.income_tax_baseline_cash = player.cash
                elif subtype == "super":
                    net_worth_for_tax = max(0, _estimated_net_worth(player, boardpack))
                    tax = int(super_tax_rate * net_worth_for_tax)
                    if tax > 0:
                        _debit(player, tax, "SUPER_TAX", insolvency_by_reason)
                        stats["super_tax_paid"] += tax
                    stats["super_tax_events"] += 1
                else:
                    tax = int(tile.get("tax_amount") or 0)
                    if tax > 0:
                        _debit(player, tax, "FIXED_TAX", insolvency_by_reason)
                        stats["fixed_tax_paid"] += tax
                    stats["fixed_tax_events"] += 1
            elif ttype in {"property", "rail", "railroad", "transport", "utility"}:
                owner = owners_by_tile.get(player.position)
                if owner is None and not player.pending_insolvency:
                    price = _price(tile)
                    reserve = _reserve(player, cfg)
                    if price > 0 and player.cash - price >= reserve:
                        player.cash -= price
                        player.owned_tiles.append(player.position)
                        owners_by_tile[player.position] = player
                    elif cfg.enable_purchase_mortgage and price > 0:
                        down = round(price * cfg.down_payment_ratio)
                        if player.cash - down >= reserve and down > 0:
                            player.cash -= down
                            financed = max(0, price - down)
                            payment = _amortized_payment(financed, cfg.mortgage_rate_per_turn, cfg.purchase_mortgage_term_turns)
                            if payment > 0:
                                player.purchase_mortgages[player.position] = PurchaseMortgage(player.position, financed, payment, cfg.purchase_mortgage_term_turns)
                            player.owned_tiles.append(player.position)
                            owners_by_tile[player.position] = player
                            stats["purchase_mortgages_created"] += 1
                        elif cfg.enable_auctions:
                            stats["auctions_started"] += 1
                            bid = int(price * cfg.auction_bid_ratio)
                            bidders = [p for p in players if not p.bankrupt and p is not owner and p.cash - bid >= _reserve(p, cfg)]
                            if bidders and bid > 0:
                                winner = max(bidders, key=lambda p: p.cash)
                                _debit(winner, bid, "AUCTION_PAYMENT", insolvency_by_reason)
                                if winner.pending_insolvency and winner.cash < 0:
                                    winner.bankrupt = True
                                else:
                                    winner.owned_tiles.append(player.position)
                                    owners_by_tile[player.position] = winner
                                    stats["auctions_completed"] += 1
                                    stats["auction_cash_drained"] += bid
                elif owner is not player and owner is not None and not owner.bankrupt:
                    rent = int(tile.get("base_rent") or tile.get("rent") or max(0, _price(tile) * 0.1))
                    if ttype == "utility":
                        rent = int(tile.get("utility_base_amount") or rent)
                    _debit(player, rent, "RENT", insolvency_by_reason)
                    if not player.bankrupt:
                        owner.cash += rent
                        rent_earned_by_tile[player.position] += rent

            if player.pending_insolvency:
                if player.cash < 0:
                    player.bankrupt = True
                    continue
                player.pending_insolvency = False
                stats["recovery_successes"] += 1

            # passive income approximation
            if not player.bankrupt and cfg.passive_income_per_owned_property > 0:
                payout = cfg.passive_income_per_owned_property * len(player.owned_tiles)
                if payout > 0:
                    player.cash += payout
                    stats["passive_income_total"] += payout
                    stats["passive_income_events"] += 1

    return GameResult(
        rounds=rounds_played,
        bankruptcy_count=sum(1 for p in players if p.bankrupt),
        ending_cash=[p.cash for p in players],
        owned_counter=Counter([idx for p in players for idx in p.owned_tiles]),
        landed_counter=landed_counter,
        rent_earned_by_tile=rent_earned_by_tile,
        insolvency_entries=sum(insolvency_by_reason.values()),
        insolvency_by_reason=insolvency_by_reason,
        recovery_successes=stats["recovery_successes"],
        collateral_loans_taken=stats["collateral_loans_taken"],
        collateral_cash_raised=stats["collateral_cash_raised"],
        collateralized_properties_count=sum(len(p.collateralized_tiles) for p in players),
        purchase_mortgages_created=stats["purchase_mortgages_created"],
        purchase_mortgage_defaults=stats["purchase_mortgage_defaults"],
        passive_income_total=stats["passive_income_total"],
        passive_income_events=stats["passive_income_events"],
        bets_placed=stats["bets_placed"],
        betting_staked=stats["betting_staked"],
        betting_winnings=stats["betting_winnings"],
        auctions_started=stats["auctions_started"],
        auctions_completed=stats["auctions_completed"],
        auction_cash_drained=stats["auction_cash_drained"],
        tax_paid=stats["tax_paid"],
        tax_events=stats["tax_events"],
        income_tax_paid=stats["income_tax_paid"],
        income_tax_events=stats["income_tax_events"],
        super_tax_paid=stats["super_tax_paid"],
        super_tax_events=stats["super_tax_events"],
        fixed_tax_paid=stats["fixed_tax_paid"],
        fixed_tax_events=stats["fixed_tax_events"],
    )


def top_tiles(counter: Counter[int], boardpack: dict[str, Any], n: int = 5) -> list[dict[str, Any]]:
    return [{"index": idx, "name": boardpack["tiles"][idx]["name"], "count": count} for idx, count in counter.most_common(n)]


def summarize_results(boardpack: dict[str, Any], results: list[GameResult], settings: dict[str, Any], cfg: SimulationConfig) -> dict[str, Any]:
    agg = Counter()
    insolvency_by_reason = Counter()
    owned_totals, landed_totals, rent_totals = Counter(), Counter(), Counter()
    for r in results:
        agg.update({
            "bankruptcies": r.bankruptcy_count, "insolvency_entries": r.insolvency_entries, "recovery_successes": r.recovery_successes,
            "collateral_loans_taken": r.collateral_loans_taken, "collateral_cash_raised": r.collateral_cash_raised,
            "collateralized_properties_count": r.collateralized_properties_count, "purchase_mortgages_created": r.purchase_mortgages_created,
            "purchase_mortgage_defaults": r.purchase_mortgage_defaults, "passive_income_total": r.passive_income_total,
            "passive_income_events": r.passive_income_events, "bets_placed": r.bets_placed, "betting_staked": r.betting_staked,
            "betting_winnings": r.betting_winnings, "auctions_started": r.auctions_started, "auctions_completed": r.auctions_completed,
            "auction_cash_drained": r.auction_cash_drained,
            "income_tax_paid": r.income_tax_paid, "income_tax_events": r.income_tax_events,
            "super_tax_paid": r.super_tax_paid, "super_tax_events": r.super_tax_events,
            "fixed_tax_paid": r.fixed_tax_paid, "fixed_tax_events": r.fixed_tax_events,
        })
        insolvency_by_reason.update(r.insolvency_by_reason)
        owned_totals.update(r.owned_counter); landed_totals.update(r.landed_counter); rent_totals.update(r.rent_earned_by_tile)
    total_player_games = len(results) * PLAYER_COUNT
    total_tax_paid = agg["income_tax_paid"] + agg["super_tax_paid"] + agg["fixed_tax_paid"]
    total_tax_events = agg["income_tax_events"] + agg["super_tax_events"] + agg["fixed_tax_events"]
    return {"generated_at": datetime.now(timezone.utc).isoformat(), "source": "offline_python_simulation_lab_phase_5", "boardpack": {"id": boardpack["id"], "name": boardpack["name"]}, "settings": settings, "liquidity_settings": cfg.__dict__, "stats": {
        "games_simulated": len(results), "player_policy": cfg.player_policy, "average_rounds": round(mean(r.rounds for r in results), 2),
        "bankruptcy_count": agg["bankruptcies"], "bankruptcy_rate": round(agg["bankruptcies"] / total_player_games, 4),
        "insolvency_entries": agg["insolvency_entries"], "insolvency_by_reason": dict(insolvency_by_reason), "recovery_successes": agg["recovery_successes"],
        "collateral_loans_taken": agg["collateral_loans_taken"], "collateral_cash_raised": agg["collateral_cash_raised"], "collateralized_properties_count": agg["collateralized_properties_count"],
        "purchase_mortgages_created": agg["purchase_mortgages_created"], "purchase_mortgage_defaults": agg["purchase_mortgage_defaults"],
        "passive_income_total": agg["passive_income_total"], "passive_income_events": agg["passive_income_events"],
        "betting": {"enabled": cfg.enable_betting, "bets_placed": agg["bets_placed"], "betting_staked": agg["betting_staked"], "betting_winnings": agg["betting_winnings"], "betting_net": agg["betting_winnings"] - agg["betting_staked"]},
        "auctions": {"enabled": cfg.enable_auctions, "auctions_started": agg["auctions_started"], "auctions_completed": agg["auctions_completed"], "auction_cash_drained": agg["auction_cash_drained"]},
        "tax_paid": total_tax_paid, "tax_events": total_tax_events,
        "tax_breakdown": {
            "income_tax_paid": agg["income_tax_paid"], "income_tax_events": agg["income_tax_events"],
            "super_tax_paid": agg["super_tax_paid"], "super_tax_events": agg["super_tax_events"],
            "fixed_tax_paid": agg["fixed_tax_paid"], "fixed_tax_events": agg["fixed_tax_events"],
            "income_tax_rate_used": settings["income_tax_rate_used"], "super_tax_rate_used": settings["super_tax_rate_used"],
        },
        "most_owned_tiles_top_5": top_tiles(owned_totals, boardpack), "most_landed_on_tiles_top_5": top_tiles(landed_totals, boardpack), "highest_rent_earning_tiles_top_5": top_tiles(rent_totals, boardpack),
    }}


def write_summary(summary: dict[str, Any]) -> Path:
    EXPORTS_DIR.mkdir(parents=True, exist_ok=True)
    path = EXPORTS_DIR / f"simulation_summary_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.json"
    path.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    return path


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Offline-only Python simulation lab")
    p.add_argument("--fixture", type=Path, default=DEFAULT_BOARDPACK_PATH)
    p.add_argument("--games", type=int, default=DEFAULT_GAME_COUNT)
    p.add_argument("--seed", type=int, default=DEFAULT_RANDOM_SEED)
    p.add_argument("--max-rounds", type=int, default=DEFAULT_MAX_ROUNDS)
    p.add_argument("--player-policy", default="balanced", choices=["balanced"])
    p.add_argument("--cash-reserve-ratio", type=float, default=0.25)
    p.add_argument("--low-cash-threshold-ratio", type=float, default=0.35)
    p.add_argument("--healthy-cash-threshold-ratio", type=float, default=0.60)
    p.add_argument("--max-collateral-loans-per-player", type=int, default=2)
    p.add_argument("--collateral-loan-value-ratio", type=float, default=None)
    p.add_argument("--enable-purchase-mortgage", action="store_true", default=True)
    p.add_argument("--disable-purchase-mortgage", action="store_true")
    p.add_argument("--down-payment-ratio", type=float, default=None)
    p.add_argument("--purchase-mortgage-payment-ratio", type=float, default=None)
    p.add_argument("--purchase-mortgage-term-turns", type=int, default=None)
    p.add_argument("--passive-income-per-owned-property", type=int, default=0)
    p.add_argument("--enable-betting", action="store_true")
    p.add_argument("--bet-probability", type=float, default=0.2)
    p.add_argument("--bet-stake", type=int, default=100)
    p.add_argument("--bet-win-probability", type=float, default=0.45)
    p.add_argument("--bet-payout-multiplier", type=float, default=2.0)
    p.add_argument("--enable-auctions", action="store_true")
    p.add_argument("--auction-bid-ratio", type=float, default=0.70)
    return p.parse_args()


def main() -> None:
    args = parse_args()
    boardpack = load_boardpack(args.fixture)
    loan_rules = boardpack.get("loan_rules") if isinstance(boardpack.get("loan_rules"), dict) else None
    tax_rules = boardpack.get("tax_rules") if isinstance(boardpack.get("tax_rules"), dict) else None
    loan_warning: str | None = None
    tax_warning: str | None = None
    sources: set[str] = set()
    tax_sources: set[str] = set()
    if loan_rules is None:
        loan_warning = "Fixture loan_rules missing; using simulator fallback defaults."
        sources.add("fallback")
    if tax_rules is None:
        tax_warning = "Fixture tax_rules missing; using simulator fallback tax defaults."
        tax_sources.add("fallback")

    mortgage = loan_rules.get("mortgage", {}) if loan_rules else {}
    collateral = loan_rules.get("collateral", {}) if loan_rules else {}
    allowed_percents = mortgage.get("allowed_down_payment_percents") if isinstance(mortgage.get("allowed_down_payment_percents"), list) else DEFAULT_ALLOWED_DOWN_PAYMENT_PERCENTS
    allowed_percents = [int(p) for p in allowed_percents if isinstance(p, (int, float))]

    fallback_mortgage_ltv = 0.70
    fallback_mortgage_rate = 0.015
    fallback_mortgage_term = 20
    fallback_collateral_ltv = 0.50
    fallback_collateral_rate = 0.008
    fallback_collateral_term = 10

    mortgage_ltv = float(mortgage.get("ltv", fallback_mortgage_ltv))
    mortgage_rate = float(mortgage.get("rate_per_turn", fallback_mortgage_rate))
    mortgage_term = int(mortgage.get("term_turns", fallback_mortgage_term))
    collateral_ltv_effective = float(collateral.get("ltv_effective", fallback_collateral_ltv))
    collateral_ltv_rules_field = collateral.get("ltv_rules_field")
    collateral_rate = float(collateral.get("rate_per_turn", fallback_collateral_rate))
    collateral_term = int(collateral.get("term_turns", fallback_collateral_term))

    if args.down_payment_ratio is not None:
        down_payment_ratio = args.down_payment_ratio
        sources.add("cli_override")
    else:
        down_payment_ratio = _round_to_nearest_allowed_percent(1.0 - mortgage_ltv, allowed_percents)
        sources.add("fixture" if loan_rules else "fallback")

    if args.purchase_mortgage_term_turns is not None:
        mortgage_term = args.purchase_mortgage_term_turns
        sources.add("cli_override")
    else:
        sources.add("fixture" if loan_rules else "fallback")

    if args.collateral_loan_value_ratio is not None:
        collateral_ltv_effective = args.collateral_loan_value_ratio
        sources.add("cli_override")
    else:
        sources.add("fixture" if loan_rules else "fallback")

    if args.purchase_mortgage_payment_ratio is not None:
        loan_warning = (loan_warning + " " if loan_warning else "") + "--purchase-mortgage-payment-ratio is provided; simulator uses amortized_fixed_payment and ignores this override."
        sources.add("cli_override")

    loan_rules_source = "mixed" if len(sources) > 1 else (next(iter(sources)) if sources else "fallback")
    fallback_income_tax_rate = 0.2
    fallback_super_tax_rate = 0.1
    income_tax_rate = float(tax_rules.get("income_tax_rate", fallback_income_tax_rate)) if tax_rules else fallback_income_tax_rate
    super_tax_rate = float(tax_rules.get("super_tax_rate", fallback_super_tax_rate)) if tax_rules else fallback_super_tax_rate
    if tax_rules is not None:
        tax_sources.add("fixture")
    tax_rules_source = "mixed" if len(tax_sources) > 1 else (next(iter(tax_sources)) if tax_sources else "fallback")

    cfg = SimulationConfig(
        player_policy=args.player_policy, cash_reserve_ratio=args.cash_reserve_ratio, low_cash_threshold_ratio=args.low_cash_threshold_ratio,
        healthy_cash_threshold_ratio=args.healthy_cash_threshold_ratio, max_collateral_loans_per_player=args.max_collateral_loans_per_player,
        collateral_loan_value_ratio=collateral_ltv_effective, enable_purchase_mortgage=args.enable_purchase_mortgage and not args.disable_purchase_mortgage,
        down_payment_ratio=down_payment_ratio, purchase_mortgage_payment_ratio=0.0,
        purchase_mortgage_term_turns=mortgage_term, passive_income_per_owned_property=args.passive_income_per_owned_property,
        enable_betting=args.enable_betting, bet_probability=args.bet_probability, bet_stake=args.bet_stake, bet_win_probability=args.bet_win_probability,
        bet_payout_multiplier=args.bet_payout_multiplier, enable_auctions=args.enable_auctions, auction_bid_ratio=args.auction_bid_ratio,
        mortgage_rate_per_turn=mortgage_rate, mortgage_ltv=mortgage_ltv, purchase_mortgage_payment_model="amortized_fixed_payment",
        collateral_ltv_rules_field_exported=float(collateral_ltv_rules_field) if isinstance(collateral_ltv_rules_field, (int, float)) else None,
        collateral_rate_per_turn=collateral_rate, collateral_term_turns=collateral_term,
    )
    rng = random.Random(args.seed)
    results = [play_game(boardpack, rng, args.max_rounds, cfg, income_tax_rate, super_tax_rate) for _ in range(args.games)]
    settings = {
        "games": args.games, "max_rounds": args.max_rounds, "players": PLAYER_COUNT, "random_seed": args.seed, "fixture": str(args.fixture),
        "loan_rules_source": loan_rules_source, "mortgage_ltv_used": mortgage_ltv, "mortgage_rate_per_turn_used": mortgage_rate,
        "mortgage_term_turns_used": mortgage_term, "mortgage_down_payment_ratio_used": down_payment_ratio,
        "purchase_mortgage_payment_model": "amortized_fixed_payment", "collateral_ltv_effective_used": collateral_ltv_effective,
        "collateral_ltv_rules_field_exported": collateral_ltv_rules_field, "collateral_rate_per_turn_used": collateral_rate,
        "collateral_term_turns_used": collateral_term, "loan_config_warning": loan_warning,
        "tax_rules_source": tax_rules_source, "income_tax_rate_used": income_tax_rate, "super_tax_rate_used": super_tax_rate,
        "tax_config_warning": tax_warning,
    }
    summary = summarize_results(boardpack, results, settings, cfg)
    path = write_summary(summary)
    s = summary["stats"]
    print("Python Simulation Lab - Phase 5 (offline only, non-authoritative approximations)")
    print(f"Games simulated: {s['games_simulated']}")
    print(f"Boardpack: {boardpack['name']} ({boardpack['id']})")
    print(f"Player policy: {s['player_policy']}")
    print(f"Average rounds: {s['average_rounds']}")
    print(f"Bankruptcy count/rate: {s['bankruptcy_count']} ({s['bankruptcy_rate']:.2%})")
    print(f"Insolvency entries/by reason: {s['insolvency_entries']} {s['insolvency_by_reason']}")
    print(f"Collateral loans/cash raised: {s['collateral_loans_taken']} / {s['collateral_cash_raised']}")
    print(f"Purchase mortgages created/defaults: {s['purchase_mortgages_created']} / {s['purchase_mortgage_defaults']}")
    print(f"Passive income total/events: {s['passive_income_total']} / {s['passive_income_events']}")
    print(f"Betting stats: {s['betting']}")
    print(f"Auction stats: {s['auctions']}")
    print(f"Tax paid/events: {s['tax_paid']} / {s['tax_events']}")
    print(f"Income tax paid/events: {s['tax_breakdown']['income_tax_paid']} / {s['tax_breakdown']['income_tax_events']}")
    print(f"Super tax paid/events: {s['tax_breakdown']['super_tax_paid']} / {s['tax_breakdown']['super_tax_events']}")
    print(f"Fixed tax paid/events: {s['tax_breakdown']['fixed_tax_paid']} / {s['tax_breakdown']['fixed_tax_events']}")
    print(f"Most-owned tiles (top 5): {s['most_owned_tiles_top_5']}")
    print(f"Most-landed-on tiles (top 5): {s['most_landed_on_tiles_top_5']}")
    print(f"Highest rent-earning tiles (top 5): {s['highest_rent_earning_tiles_top_5']}")
    print(f"Liquidity settings used: {summary['liquidity_settings']}")
    if loan_warning:
        print(f"Loan config warning: {loan_warning}")
    if tax_warning:
        print(f"Tax config warning: {tax_warning}")
    print(f"Summary JSON: {path}")


if __name__ == "__main__":
    main()
