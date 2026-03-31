import { useMemo, useState } from "react";
import {
  formatBetLabel,
  getBetPayoutMultiplier,
  type BettingMarketBetKind,
  type BettingMarketBetSelection,
  type BettingMarketState,
} from "@/lib/bettingMarket";

type BetTypeTab = "TOTAL" | "PARITY" | "COMBINATION";
type CombinationMode = "ANY_ORDER" | "EXACT_ORDER";

type BettingMarketPanelV2Props = {
  bettingConfig: {
    minStakePerBet: number;
    maxTotalStakePerRoll: number;
  } | null;
  bettingState: BettingMarketState;
  currentPlayerId: string | null;
  currentCash: number;
  canInteract: boolean;
  disabledReason: string | null;
  isPlacing: boolean;
  cancelingBetId: string | null;
  inlineError: string | null;
  successMessage: string | null;
  onPlaceBet: (payload: {
    kind: BettingMarketBetKind;
    selection: BettingMarketBetSelection;
    stake: number;
  }) => void;
  onCancelBet: (betId: string) => void;
  formatMoney: (amount: number | null) => string;
};

export default function BettingMarketPanelV2({
  bettingConfig,
  bettingState,
  currentPlayerId,
  currentCash,
  canInteract,
  disabledReason,
  isPlacing,
  cancelingBetId,
  inlineError,
  successMessage,
  onPlaceBet,
  onCancelBet,
  formatMoney,
}: BettingMarketPanelV2Props) {
  const [betType, setBetType] = useState<BetTypeTab>("TOTAL");
  const [selectedTotal, setSelectedTotal] = useState(7);
  const [selectedParity, setSelectedParity] = useState<"EVEN" | "ODD">("EVEN");
  const [combinationMode, setCombinationMode] = useState<CombinationMode>("ANY_ORDER");
  const [die1, setDie1] = useState(1);
  const [die2, setDie2] = useState(1);
  const [stakeInput, setStakeInput] = useState("");

  const committedStake = useMemo(() => {
    if (!currentPlayerId) {
      return 0;
    }
    return bettingState.total_stake_by_player[currentPlayerId] ?? 0;
  }, [bettingState.total_stake_by_player, currentPlayerId]);

  const remainingStakeRoom = Math.max(
    (bettingConfig?.maxTotalStakePerRoll ?? 0) - committedStake,
    0,
  );

  const yourPendingBets = useMemo(() => {
    if (!currentPlayerId) {
      return [];
    }
    return bettingState.bets.filter(
      (bet) =>
        bet.player_id === currentPlayerId &&
        bet.target_roll_seq === bettingState.next_roll_seq,
    );
  }, [bettingState.bets, bettingState.next_roll_seq, currentPlayerId]);

  const stake = useMemo(() => {
    const parsed = Number.parseInt(stakeInput, 10);
    if (!Number.isFinite(parsed)) {
      return null;
    }
    return parsed;
  }, [stakeInput]);

  const draft = useMemo(() => {
    if (!bettingConfig) {
      return null;
    }

    if (betType === "TOTAL") {
      const kind: BettingMarketBetKind = "TOTAL";
      const selection: BettingMarketBetSelection = { total: selectedTotal };
      return { kind, selection };
    }

    if (betType === "PARITY") {
      const kind: BettingMarketBetKind = "PARITY";
      const selection: BettingMarketBetSelection = { parity: selectedParity };
      return { kind, selection };
    }

    const kind: BettingMarketBetKind =
      combinationMode === "ANY_ORDER"
        ? "COMBINATION_ANY_ORDER"
        : "COMBINATION_EXACT_ORDER";
    const selection: BettingMarketBetSelection = { die1, die2 };
    return { kind, selection };
  }, [betType, bettingConfig, combinationMode, die1, die2, selectedParity, selectedTotal]);

  const payoutMultiplier = draft
    ? getBetPayoutMultiplier(draft.kind, draft.selection)
    : null;

  const validationMessage = useMemo(() => {
    if (!bettingConfig) {
      return "Betting is unavailable for this board pack.";
    }
    if (!canInteract) {
      return disabledReason;
    }
    if (stake === null) {
      return "Enter your stake amount.";
    }
    if (!Number.isInteger(stake) || stake <= 0) {
      return "Stake must be a positive whole number.";
    }
    if (stake < bettingConfig.minStakePerBet) {
      return `Minimum bet is ${formatMoney(bettingConfig.minStakePerBet)}.`;
    }
    if (stake > currentCash) {
      return "Insufficient cash to place this bet.";
    }
    if (stake > remainingStakeRoom) {
      return "This stake exceeds your remaining room for the next roll.";
    }
    return null;
  }, [
    bettingConfig,
    canInteract,
    currentCash,
    disabledReason,
    formatMoney,
    remainingStakeRoom,
    stake,
  ]);

  const canSubmit = draft !== null && validationMessage === null && !isPlacing;
  const projectedPayout =
    stake !== null && payoutMultiplier !== null && stake > 0
      ? Math.floor(stake * payoutMultiplier)
      : null;

  return (
    <section className="space-y-3 text-sm text-white/85">
      <div className="rounded-lg border border-white/10 bg-white/5 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-white/60">
          Betting Market
        </p>
        <p className="mt-1 text-xs text-white/70">Place optional bets on the next roll.</p>
        <p className="text-xs text-white/70">Bets resolve automatically on the next normal dice roll.</p>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-lg border border-white/10 bg-white/5 p-3 text-xs sm:grid-cols-4">
        <p className="space-y-1">
          <span className="block text-white/60">Minimum bet</span>
          <span className="font-semibold text-white">
            {bettingConfig ? formatMoney(bettingConfig.minStakePerBet) : "—"}
          </span>
        </p>
        <p className="space-y-1">
          <span className="block text-white/60">Max per next roll</span>
          <span className="font-semibold text-white">
            {bettingConfig ? formatMoney(bettingConfig.maxTotalStakePerRoll) : "—"}
          </span>
        </p>
        <p className="space-y-1">
          <span className="block text-white/60">Your committed</span>
          <span className="font-semibold text-white">{formatMoney(committedStake)}</span>
        </p>
        <p className="space-y-1">
          <span className="block text-white/60">Remaining room</span>
          <span className="font-semibold text-white">{formatMoney(remainingStakeRoom)}</span>
        </p>
      </div>

      <div className="space-y-3 rounded-lg border border-white/10 bg-white/5 p-3">
        <div className="grid grid-cols-3 gap-1.5 text-xs">
          {[
            { value: "TOTAL", label: "Total" },
            { value: "PARITY", label: "Even / Odd" },
            { value: "COMBINATION", label: "Combination" },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setBetType(option.value as BetTypeTab)}
              className={`rounded-md border px-2 py-1.5 font-medium transition ${
                betType === option.value
                  ? "border-emerald-300/70 bg-emerald-500/20 text-emerald-100"
                  : "border-white/15 bg-white/5 text-white/75 hover:bg-white/10"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {betType === "TOTAL" ? (
          <label className="block text-xs text-white/70">
            Total
            <select
              className="mt-1 w-full rounded-md border border-white/15 bg-neutral-900 px-2 py-2 text-sm text-white"
              value={selectedTotal}
              onChange={(event) => setSelectedTotal(Number(event.target.value))}
            >
              {Array.from({ length: 11 }, (_, index) => index + 2).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {betType === "PARITY" ? (
          <label className="block text-xs text-white/70">
            Pick parity
            <select
              className="mt-1 w-full rounded-md border border-white/15 bg-neutral-900 px-2 py-2 text-sm text-white"
              value={selectedParity}
              onChange={(event) => setSelectedParity(event.target.value as "EVEN" | "ODD")}
            >
              <option value="EVEN">Even</option>
              <option value="ODD">Odd</option>
            </select>
          </label>
        ) : null}

        {betType === "COMBINATION" ? (
          <div className="space-y-2">
            <label className="block text-xs text-white/70">
              Combination mode
              <select
                className="mt-1 w-full rounded-md border border-white/15 bg-neutral-900 px-2 py-2 text-sm text-white"
                value={combinationMode}
                onChange={(event) => setCombinationMode(event.target.value as CombinationMode)}
              >
                <option value="ANY_ORDER">Any order</option>
                <option value="EXACT_ORDER">Exact order</option>
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs text-white/70">
                Die 1
                <select
                  className="mt-1 w-full rounded-md border border-white/15 bg-neutral-900 px-2 py-2 text-sm text-white"
                  value={die1}
                  onChange={(event) => setDie1(Number(event.target.value))}
                >
                  {Array.from({ length: 6 }, (_, index) => index + 1).map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs text-white/70">
                Die 2
                <select
                  className="mt-1 w-full rounded-md border border-white/15 bg-neutral-900 px-2 py-2 text-sm text-white"
                  value={die2}
                  onChange={(event) => setDie2(Number(event.target.value))}
                >
                  {Array.from({ length: 6 }, (_, index) => index + 1).map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        ) : null}

        <label className="block text-xs text-white/70">
          Stake
          <input
            type="number"
            min={bettingConfig?.minStakePerBet ?? 1}
            step={1}
            value={stakeInput}
            onChange={(event) => setStakeInput(event.target.value)}
            placeholder={bettingConfig ? String(bettingConfig.minStakePerBet) : ""}
            className="mt-1 w-full rounded-md border border-white/15 bg-neutral-900 px-2 py-2 text-sm text-white"
          />
        </label>

        <div className="rounded-md border border-white/10 bg-black/20 px-2.5 py-2 text-xs text-white/80">
          <p className="flex items-center justify-between gap-2">
            <span>Payout multiplier</span>
            <span className="font-semibold text-white">{payoutMultiplier ? `${payoutMultiplier}x` : "—"}</span>
          </p>
          <p className="mt-1 flex items-center justify-between gap-2">
            <span>Projected payout</span>
            <span className="font-semibold text-emerald-200">
              {projectedPayout !== null ? formatMoney(projectedPayout) : "—"}
            </span>
          </p>
        </div>

        {inlineError ? <p className="text-xs text-red-300">{inlineError}</p> : null}
        {!inlineError && successMessage ? (
          <p className="text-xs text-emerald-300">{successMessage}</p>
        ) : null}
        {validationMessage ? <p className="text-xs text-amber-200">{validationMessage}</p> : null}

        <button
          type="button"
          onClick={() => {
            if (!canSubmit || !draft || stake === null) {
              return;
            }
            onPlaceBet({ kind: draft.kind, selection: draft.selection, stake });
          }}
          disabled={!canSubmit}
          className="w-full rounded-md border border-emerald-300/50 bg-emerald-500/20 px-3 py-2 text-sm font-semibold text-emerald-100 transition enabled:hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPlacing ? "Placing…" : "Place Bet"}
        </button>
      </div>

      <div className="space-y-2 rounded-lg border border-white/10 bg-white/5 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-white/60">Your Bets for Next Roll</p>
        {yourPendingBets.length === 0 ? (
          <p className="text-xs text-white/65">No pending bets for roll #{bettingState.next_roll_seq}.</p>
        ) : (
          <ul className="space-y-2">
            {yourPendingBets.map((bet) => {
              const multiplier = getBetPayoutMultiplier(bet.kind, bet.selection);
              const projected = Math.floor(bet.stake * multiplier);
              const isCancellable = bet.target_roll_seq === bettingState.next_roll_seq;
              return (
                <li key={bet.id} className="rounded-md border border-white/10 bg-black/20 p-2.5 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-white">{formatBetLabel(bet.kind, bet.selection)}</p>
                      <p className="mt-0.5 text-white/70">Stake: {formatMoney(bet.stake)}</p>
                      <p className="text-white/70">Multiplier: {multiplier}x</p>
                      <p className="text-emerald-200">Projected: {formatMoney(projected)}</p>
                    </div>
                    {isCancellable ? (
                      <button
                        type="button"
                        onClick={() => onCancelBet(bet.id)}
                        disabled={!canInteract || cancelingBetId === bet.id}
                        title={!canInteract ? disabledReason ?? undefined : undefined}
                        className="rounded border border-red-300/40 bg-red-500/10 px-2 py-1 text-[11px] font-semibold text-red-200 transition enabled:hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {cancelingBetId === bet.id ? "Canceling…" : "Cancel"}
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {bettingState.last_resolution ? (
        <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-white/75">
          <p className="font-semibold uppercase tracking-wide text-white/60">Last resolved result</p>
          <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-4">
            <p>
              <span className="text-white/55">Roll</span>
              <span className="ml-1 text-white">#{bettingState.last_resolution.roll_seq}</span>
            </p>
            <p>
              <span className="text-white/55">Dice</span>
              <span className="ml-1 text-white">
                {bettingState.last_resolution.dice[0]} + {bettingState.last_resolution.dice[1]}
              </span>
            </p>
            <p>
              <span className="text-white/55">Resolved</span>
              <span className="ml-1 text-white">{bettingState.last_resolution.resolved_bet_count}</span>
            </p>
            <p>
              <span className="text-white/55">Winners</span>
              <span className="ml-1 text-white">{bettingState.last_resolution.winner_count}</span>
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
