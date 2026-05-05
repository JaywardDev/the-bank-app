#!/usr/bin/env python3
"""Run a simple offline-only property game simulation."""

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
CASH_RESERVE = 100
DEFAULT_RANDOM_SEED = 20260505


@dataclass
class Player:
    name: str
    cash: int
    position: int = 0
    bankrupt: bool = False
    owned_tiles: list[int] = field(default_factory=list)


@dataclass
class GameResult:
    rounds: int
    bankruptcy_count: int
    ending_cash: list[int]
    owned_counter: Counter[int]
    landed_counter: Counter[int]
    rent_earned_by_tile: Counter[int]


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
    if starting_cash is None:
        raise ValueError("boardpack missing required starting cash field")
    if go_salary is None:
        raise ValueError("boardpack missing required GO salary field")

    normalized_tiles: list[dict[str, Any]] = []
    for index, tile in enumerate(tiles):
        if not isinstance(tile, dict):
            continue
        tile_index = tile.get("index", index)
        if tile_index != index:
            raise ValueError("boardpack tiles must be ordered by contiguous tile index")
        name = tile.get("name")
        tile_type = str(tile.get("type", "unknown")).lower()
        if not isinstance(name, str):
            raise ValueError(f"tile at index {index} missing name")
        normalized_tiles.append({**tile, "index": index, "type": tile_type, "name": name})

    return {
        "name": boardpack.get("name") or boardpack.get("boardpack", {}).get("name") or "Unknown Boardpack",
        "id": boardpack.get("id") or boardpack.get("boardpack", {}).get("id") or "unknown",
        "starting_cash": starting_cash,
        "go_salary": go_salary,
        "board_size": board_size,
        "tiles": normalized_tiles,
    }


def roll_two_dice(rng: random.Random) -> int:
    return rng.randint(1, 6) + rng.randint(1, 6)


def move_player(player: Player, roll: int, board_size: int, go_salary: int) -> None:
    previous_position = player.position
    player.position = (player.position + roll) % board_size
    if previous_position + roll >= board_size:
        player.cash += go_salary


def tile_rent(tile: dict[str, Any], roll: int, owned_tile_count_for_owner: int) -> int:
    tile_type = tile["type"]
    if tile_type in {"property", "rail", "railroad", "transport"}:
        if tile_type in {"rail", "railroad", "transport"} and isinstance(tile.get("rail_rent_by_count"), list):
            ladder = [value for value in tile["rail_rent_by_count"] if isinstance(value, int)]
            if ladder:
                count = min(owned_tile_count_for_owner, len(ladder) - 1)
                return max(0, ladder[count])
        return int(tile.get("base_rent") or tile.get("rent") or tile.get("price", 0) * 0.1)
    if tile_type == "utility":
        multiplier = tile.get("utility_multiplier")
        if isinstance(multiplier, int):
            return roll * multiplier
        base = tile.get("utility_base_amount")
        if isinstance(base, int):
            return base
        return int(tile.get("base_rent") or 30)
    return 0


def play_game(boardpack: dict[str, Any], rng: random.Random, max_rounds: int) -> GameResult:
    players = [Player(name=f"Player {i}", cash=boardpack["starting_cash"]) for i in range(1, PLAYER_COUNT + 1)]
    owners_by_tile: dict[int, Player] = {}
    landed_counter: Counter[int] = Counter()
    rent_earned_by_tile: Counter[int] = Counter()
    rounds_played = 0

    for round_number in range(1, max_rounds + 1):
        rounds_played = round_number
        active_players = [player for player in players if not player.bankrupt]
        if len(active_players) <= 1:
            break

        for player in active_players:
            roll = roll_two_dice(rng)
            move_player(player, roll, boardpack["board_size"], boardpack["go_salary"])
            tile = boardpack["tiles"][player.position]
            landed_counter[player.position] += 1
            ttype = tile["type"]

            if ttype == "tax":
                tax = tile.get("tax_amount")
                if isinstance(tax, int):
                    player.cash -= tax
                    if player.cash < 0:
                        player.bankrupt = True
                continue

            if ttype not in {"property", "rail", "railroad", "transport", "utility"}:
                continue

            owner = owners_by_tile.get(player.position)
            if owner is None:
                price = tile.get("price") or tile.get("value")
                if isinstance(price, int) and price > 0 and player.cash - price >= CASH_RESERVE:
                    player.cash -= price
                    player.owned_tiles.append(player.position)
                    owners_by_tile[player.position] = player
            elif owner is not player and not owner.bankrupt:
                rent = tile_rent(tile, roll, len(owner.owned_tiles))
                if rent > 0:
                    player.cash -= rent
                    owner.cash += rent
                    rent_earned_by_tile[player.position] += rent
                if player.cash < 0:
                    player.bankrupt = True

    return GameResult(
        rounds=rounds_played,
        bankruptcy_count=sum(1 for p in players if p.bankrupt),
        ending_cash=[p.cash for p in players],
        owned_counter=Counter([idx for p in players for idx in p.owned_tiles]),
        landed_counter=landed_counter,
        rent_earned_by_tile=rent_earned_by_tile,
    )


def top_tiles(counter: Counter[int], boardpack: dict[str, Any], n: int = 5) -> list[dict[str, Any]]:
    return [
        {"index": idx, "name": boardpack["tiles"][idx]["name"], "count": count}
        for idx, count in counter.most_common(n)
    ]


def summarize_results(boardpack: dict[str, Any], results: list[GameResult], settings: dict[str, Any]) -> dict[str, Any]:
    bankruptcy_count = sum(result.bankruptcy_count for result in results)
    total_player_games = len(results) * PLAYER_COUNT
    all_ending_cash = [cash for result in results for cash in result.ending_cash]
    owned_totals: Counter[int] = Counter()
    landed_totals: Counter[int] = Counter()
    rent_totals: Counter[int] = Counter()
    for result in results:
        owned_totals.update(result.owned_counter)
        landed_totals.update(result.landed_counter)
        rent_totals.update(result.rent_earned_by_tile)

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "offline_python_simulation_lab_phase_2",
        "boardpack": {"id": boardpack["id"], "name": boardpack["name"]},
        "settings": settings,
        "stats": {
            "games_simulated": len(results),
            "average_rounds": round(mean(result.rounds for result in results), 2),
            "bankruptcy_count": bankruptcy_count,
            "bankruptcy_rate": round(bankruptcy_count / total_player_games, 4),
            "average_ending_cash": round(mean(all_ending_cash), 2),
            "most_owned_tiles_top_5": top_tiles(owned_totals, boardpack),
            "most_landed_on_tiles_top_5": top_tiles(landed_totals, boardpack),
            "highest_rent_earning_tiles_top_5": top_tiles(rent_totals, boardpack),
        },
    }


def write_summary(summary: dict[str, Any]) -> Path:
    EXPORTS_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = EXPORTS_DIR / f"simulation_summary_{timestamp}.json"
    with path.open("w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)
        f.write("\n")
    return path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Offline-only Python simulation lab")
    parser.add_argument("--fixture", type=Path, default=DEFAULT_BOARDPACK_PATH)
    parser.add_argument("--games", type=int, default=DEFAULT_GAME_COUNT)
    parser.add_argument("--seed", type=int, default=DEFAULT_RANDOM_SEED)
    parser.add_argument("--max-rounds", type=int, default=DEFAULT_MAX_ROUNDS)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    boardpack = load_boardpack(args.fixture)
    rng = random.Random(args.seed)
    results = [play_game(boardpack, rng, args.max_rounds) for _ in range(args.games)]
    summary = summarize_results(boardpack, results, {
        "games": args.games,
        "max_rounds": args.max_rounds,
        "players": PLAYER_COUNT,
        "cash_reserve": CASH_RESERVE,
        "random_seed": args.seed,
        "fixture": str(args.fixture),
    })
    path = write_summary(summary)
    stats = summary["stats"]
    print("Python Simulation Lab - Phase 2 (offline only)")
    print(f"Games simulated: {stats['games_simulated']}")
    print(f"Boardpack: {boardpack['name']} ({boardpack['id']})")
    print(f"Average rounds: {stats['average_rounds']}")
    print(f"Bankruptcy count/rate: {stats['bankruptcy_count']} ({stats['bankruptcy_rate']:.2%})")
    print(f"Average ending cash: {stats['average_ending_cash']}")
    print(f"Most-owned tiles (top 5): {stats['most_owned_tiles_top_5']}")
    print(f"Most-landed-on tiles (top 5): {stats['most_landed_on_tiles_top_5']}")
    print(f"Highest rent-earning tiles (top 5): {stats['highest_rent_earning_tiles_top_5']}")
    print(f"Summary JSON: {path}")


if __name__ == "__main__":
    main()
