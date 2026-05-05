#!/usr/bin/env python3
"""Run a simple offline-only property game simulation.

This experimental Phase 1 simulator is intentionally local and non-authoritative.
It does not import production gameplay code, call app APIs, write Supabase data, or
change live game behavior.
"""

from __future__ import annotations

import json
import random
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[3]
PYTHON_TOOLS_ROOT = REPO_ROOT / "tools" / "python"
EXPORTS_DIR = PYTHON_TOOLS_ROOT / "exports"
DEFAULT_BOARDPACK_PATH = EXPORTS_DIR / "sample_boardpack_basic.json"

GAME_COUNT = 250
MAX_ROUNDS = 75
PLAYER_COUNT = 4
CASH_RESERVE = 100
RANDOM_SEED = 20260505


@dataclass
class Player:
    """Local-only simulation player state."""

    name: str
    cash: int
    position: int = 0
    bankrupt: bool = False
    owned_tiles: list[int] = field(default_factory=list)


@dataclass
class GameResult:
    """Summary for one local simulation run."""

    rounds: int
    bankruptcy_count: int
    ending_cash: list[int]
    owned_tile_counts: dict[int, int]


def load_boardpack(path: Path) -> dict[str, Any]:
    """Load and minimally validate the static local boardpack fixture."""

    with path.open("r", encoding="utf-8") as boardpack_file:
        boardpack = json.load(boardpack_file)

    tiles = boardpack.get("tiles", [])
    board_size = boardpack.get("board_size")
    if not isinstance(board_size, int) or board_size <= 0:
        raise ValueError("boardpack must define a positive integer board_size")
    if len(tiles) != board_size:
        raise ValueError("boardpack tile count must match board_size")
    if [tile.get("index") for tile in tiles] != list(range(board_size)):
        raise ValueError("boardpack tiles must be ordered by contiguous tile index")

    return boardpack


def roll_two_dice(rng: random.Random) -> int:
    """Roll two six-sided dice using the seeded local RNG."""

    return rng.randint(1, 6) + rng.randint(1, 6)


def move_player(player: Player, roll: int, board_size: int, go_salary: int) -> None:
    """Move a player and award GO salary when passing tile index 0."""

    previous_position = player.position
    player.position = (player.position + roll) % board_size
    if previous_position + roll >= board_size:
        player.cash += go_salary


def play_game(boardpack: dict[str, Any], rng: random.Random) -> GameResult:
    """Play one intentionally simplified offline game."""

    board_size = boardpack["board_size"]
    go_salary = boardpack["go_salary"]
    tiles = boardpack["tiles"]
    players = [
        Player(name=f"Player {player_number}", cash=boardpack["starting_cash"])
        for player_number in range(1, PLAYER_COUNT + 1)
    ]
    owners_by_tile: dict[int, Player] = {}

    rounds_played = 0
    for round_number in range(1, MAX_ROUNDS + 1):
        rounds_played = round_number
        active_players = [player for player in players if not player.bankrupt]
        if len(active_players) <= 1:
            break

        for player in active_players:
            if player.bankrupt:
                continue

            roll = roll_two_dice(rng)
            move_player(player, roll, board_size, go_salary)
            tile = tiles[player.position]

            if tile["type"] != "property":
                continue

            owner = owners_by_tile.get(player.position)
            if owner is None:
                price = tile["price"]
                if player.cash - price >= CASH_RESERVE:
                    player.cash -= price
                    player.owned_tiles.append(player.position)
                    owners_by_tile[player.position] = player
            elif owner is not player and not owner.bankrupt:
                rent = tile["rent"]
                player.cash -= rent
                owner.cash += rent
                if player.cash < 0:
                    player.bankrupt = True

    owned_tile_counts = {
        tile_index: len(owner.owned_tiles)
        for tile_index, owner in owners_by_tile.items()
    }
    return GameResult(
        rounds=rounds_played,
        bankruptcy_count=sum(1 for player in players if player.bankrupt),
        ending_cash=[player.cash for player in players],
        owned_tile_counts=owned_tile_counts,
    )


def summarize_results(boardpack: dict[str, Any], results: list[GameResult]) -> dict[str, Any]:
    """Aggregate local simulation results for console and JSON output."""

    tile_purchase_totals: dict[int, int] = {}
    for result in results:
        for tile_index in result.owned_tile_counts:
            tile_purchase_totals[tile_index] = tile_purchase_totals.get(tile_index, 0) + 1

    most_owned_tile_index = None
    if tile_purchase_totals:
        most_owned_tile_index = max(
            tile_purchase_totals,
            key=lambda tile_index: (tile_purchase_totals[tile_index], -tile_index),
        )
    most_owned_tile = None
    if most_owned_tile_index is not None:
        tile = boardpack["tiles"][most_owned_tile_index]
        most_owned_tile = {
            "index": most_owned_tile_index,
            "name": tile["name"],
            "games_owned": tile_purchase_totals[most_owned_tile_index],
        }

    bankruptcy_count = sum(result.bankruptcy_count for result in results)
    total_player_games = len(results) * PLAYER_COUNT
    all_ending_cash = [cash for result in results for cash in result.ending_cash]

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "offline_python_simulation_lab_phase_1",
        "boardpack": boardpack["name"],
        "settings": {
            "games": len(results),
            "max_rounds": MAX_ROUNDS,
            "players": PLAYER_COUNT,
            "cash_reserve": CASH_RESERVE,
            "random_seed": RANDOM_SEED,
        },
        "stats": {
            "games_simulated": len(results),
            "average_rounds": round(mean(result.rounds for result in results), 2),
            "bankruptcy_count": bankruptcy_count,
            "bankruptcy_rate": round(bankruptcy_count / total_player_games, 4),
            "most_owned_tile": most_owned_tile,
            "average_ending_cash": round(mean(all_ending_cash), 2),
        },
    }


def write_summary(summary: dict[str, Any]) -> Path:
    """Write a generated local summary JSON file under tools/python/exports/."""

    EXPORTS_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    summary_path = EXPORTS_DIR / f"simulation_summary_{timestamp}.json"
    with summary_path.open("w", encoding="utf-8") as summary_file:
        json.dump(summary, summary_file, indent=2)
        summary_file.write("\n")
    return summary_path


def print_summary(summary: dict[str, Any], summary_path: Path) -> None:
    """Print the key summary stats requested for Phase 1 verification."""

    stats = summary["stats"]
    most_owned_tile = stats["most_owned_tile"] or {"name": "None", "index": None, "games_owned": 0}
    print("Python Simulation Lab - Phase 1 (offline only)")
    print(f"Games simulated: {stats['games_simulated']}")
    print(f"Average rounds: {stats['average_rounds']}")
    print(
        f"Bankruptcy count/rate: {stats['bankruptcy_count']} "
        f"({stats['bankruptcy_rate']:.2%})"
    )
    print(
        "Most-owned tile: "
        f"{most_owned_tile['name']} "
        f"(index {most_owned_tile['index']}, owned in {most_owned_tile['games_owned']} games)"
    )
    print(f"Average ending cash: {stats['average_ending_cash']}")
    print(f"Summary JSON: {summary_path}")


def main() -> None:
    """Run many local-only simulations with a fixed random seed."""

    boardpack = load_boardpack(DEFAULT_BOARDPACK_PATH)
    rng = random.Random(RANDOM_SEED)
    results = [play_game(boardpack, rng) for _ in range(GAME_COUNT)]
    summary = summarize_results(boardpack, results)
    summary_path = write_summary(summary)
    print_summary(summary, summary_path)


if __name__ == "__main__":
    main()
