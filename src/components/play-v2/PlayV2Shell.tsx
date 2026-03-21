"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import type { BoardPackEconomy } from "@/lib/boardPacks";
import { formatCurrency, getCurrencyMetaFromEconomy } from "@/lib/currency";

type WalletTab = "owned" | "loans" | "mortgages";

type WalletButtonProps = {
  open: boolean;
  onClick: () => void;
};

type MarketButtonProps = {
  open: boolean;
  onClick: () => void;
};

type DecisionButtonProps = {
  open: boolean;
  onClick: () => void;
  disabled?: boolean;
  showAttention?: boolean;
};

type TradeButtonProps = {
  open: boolean;
  onClick: () => void;
  disabled?: boolean;
  showAttention?: boolean;
};

type MacroButtonProps = {
  open: boolean;
  onClick: () => void;
  disabled?: boolean;
  showIndicator?: boolean;
};

const utilityButtonClass =
  "inline-flex h-12 w-12 items-center justify-center rounded-xl border border-white/30 bg-neutral-900 p-0 text-white shadow-lg transition hover:bg-neutral-800";

function WalletButton({ open, onClick }: WalletButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={utilityButtonClass}
      aria-expanded={open}
      aria-controls="left-drawer"
      aria-label="Open bank panel"
      title="Open bank panel"
    >
      <span className="bank-icon" aria-hidden>
        🏦
      </span>
    </button>
  );
}

function MarketButton({ open, onClick }: MarketButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={utilityButtonClass}
      aria-expanded={open}
      aria-controls="left-drawer"
      aria-label="Open market panel"
      title="Open market panel"
    >
      <span className="market-icon" aria-hidden>
        📈
      </span>
    </button>
  );
}

function DecisionButton({ open, onClick, disabled = false, showAttention = false }: DecisionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${utilityButtonClass} relative disabled:cursor-not-allowed disabled:opacity-40`}
      aria-expanded={open}
      aria-controls="right-drawer"
      aria-label="Open decisions panel"
      title="Open decisions panel"
      disabled={disabled}
    >
      <span className="decision-icon" aria-hidden>
        ⚖️
      </span>
      {showAttention ? (
        <span className="absolute -left-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
          !
        </span>
      ) : null}
    </button>
  );
}

function TradeButton({ open, onClick, disabled = false, showAttention = false }: TradeButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${utilityButtonClass} relative disabled:cursor-not-allowed disabled:opacity-40`}
      aria-expanded={open}
      aria-controls="right-drawer"
      aria-label="Open trade panel"
      title="Open trade panel"
      disabled={disabled}
    >
      <span className="trade-icon" aria-hidden>
        🤝
      </span>
      {showAttention ? (
        <span className="absolute -left-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
          !
        </span>
      ) : null}
    </button>
  );
}

function MacroButton({ open, onClick, disabled = false, showIndicator = false }: MacroButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${utilityButtonClass} relative disabled:cursor-not-allowed disabled:opacity-40`}
      aria-expanded={open}
      aria-controls="right-drawer"
      aria-label="Open active macro effects panel"
      title="Open active macro effects panel"
      disabled={disabled}
    >
      <span className="macro-icon" aria-hidden>
        🌐
      </span>
      {showIndicator ? (
        <span className="absolute -left-0.5 -top-0.5 inline-flex h-2.5 w-2.5 rounded-full border border-sky-100/40 bg-sky-300 shadow-[0_0_0_2px_rgba(10,10,10,0.55)]" />
      ) : null}
    </button>
  );
}

type WalletPanelProps = {
  ownedCount: number;
  loanCount: number;
  mortgageCount: number;
  ownedContent: ReactNode;
  loansContent?: ReactNode;
  mortgagesContent?: ReactNode;
};

function WalletPanel({
  ownedCount,
  loanCount,
  mortgageCount,
  ownedContent,
  loansContent,
  mortgagesContent,
}: WalletPanelProps) {
  const [activeTab, setActiveTab] = useState<WalletTab>("owned");

  const tabs: { id: WalletTab; label: string; count: number }[] = [
    { id: "owned", label: "Owned", count: ownedCount },
    { id: "loans", label: "Loans", count: loanCount },
    { id: "mortgages", label: "Mortgages", count: mortgageCount },
  ];

  return (
    <>
      <div className="border-b border-white/10 px-2 py-2">
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-md px-2 py-1 text-xs font-semibold uppercase tracking-wide transition ${
                activeTab === tab.id ? "bg-white/20 text-white" : "bg-transparent text-white/60 hover:bg-white/10"
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {activeTab === "owned" ? ownedContent : null}
        {activeTab === "loans"
          ? loansContent ?? (
              <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white/80">Coming soon</div>
            )
          : null}
        {activeTab === "mortgages"
          ? mortgagesContent ?? (
              <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white/80">Coming soon</div>
            )
          : null}
      </div>
    </>
  );
}


type PlayV2ShellProps = {
  cashLabel: string;
  netWorthLabel: string;
  netWorthBreakdown?: {
    cash: number;
    assets: number;
    liabilities: number;
    netWorth: number;
  };
  turnPlayerLabel: string;
  lastRollLabel: string;
  lastDiceLabel?: string | null;
  isDoubleRoll?: boolean;
  loading: boolean;
  notice: string | null;
  debugPanel?: ReactNode;
  boardViewport: ReactNode;
  leftDrawerContent?: ReactNode;
  marketDrawerContent?: ReactNode;
  decisionDrawerContent?: ReactNode;
  tradeDrawerContent?: ReactNode;
  macroDrawerContent?: ReactNode;
  leftOpen?: boolean;
  onLeftOpenChange?: (open: boolean) => void;
  leftDrawerMode?: "info" | "wallet" | "market";
  onLeftDrawerModeChange?: (mode: "info" | "wallet" | "market") => void;
  rightOpen?: boolean;
  onRightOpenChange?: (open: boolean) => void;
  rightDrawerMode?: "decision" | "trade" | "macro";
  onRightDrawerModeChange?: (mode: "decision" | "trade" | "macro") => void;
  showTurnActions?: boolean;
  canRoll?: boolean;
  canEndTurn?: boolean;
  actionLoading?: string | null;
  rollDiceDisabledReason?: string | null;
  onRollDice?: () => void;
  onEndTurn?: () => void;
  walletOwnedCount?: number;
  walletLoanCount?: number;
  walletMortgageCount?: number;
  walletOwnedContent?: ReactNode;
  walletLoansContent?: ReactNode;
  walletMortgagesContent?: ReactNode;
  decisionActive?: boolean;
  tradeNeedsAttention?: boolean;
  tradeAccessibleDuringDecision?: boolean;
  macroEffectsActive?: boolean;
  rightDrawerLocked?: boolean;
  auctionActive?: boolean;
  headerActions?: ReactNode;
  onRecenterBoard?: () => void;
  onMenuToggle?: () => void;
  menuOpen?: boolean;
  boardPackEconomy: BoardPackEconomy;
};

export default function PlayV2Shell({
  cashLabel,
  netWorthLabel,
  netWorthBreakdown,
  turnPlayerLabel,
  lastRollLabel,
  lastDiceLabel = null,
  isDoubleRoll = false,
  loading,
  notice,
  boardViewport,
  leftDrawerContent,
  marketDrawerContent,
  decisionDrawerContent,
  tradeDrawerContent,
  macroDrawerContent,
  leftOpen: controlledLeftOpen,
  onLeftOpenChange,
  leftDrawerMode: controlledLeftDrawerMode,
  onLeftDrawerModeChange,
  rightOpen: controlledRightOpen,
  onRightOpenChange,
  rightDrawerMode: controlledRightDrawerMode,
  onRightDrawerModeChange,
  showTurnActions = true,
  canRoll = false,
  canEndTurn = false,
  actionLoading = null,
  rollDiceDisabledReason = null,
  onRollDice,
  onEndTurn,
  walletOwnedCount = 0,
  walletLoanCount = 0,
  walletMortgageCount = 0,
  walletOwnedContent,
  walletLoansContent,
  walletMortgagesContent,
  decisionActive = false,
  tradeNeedsAttention = false,
  tradeAccessibleDuringDecision = false,
  macroEffectsActive = false,
  rightDrawerLocked = false,
  auctionActive = false,
  headerActions,
  onRecenterBoard,
  onMenuToggle,
  menuOpen = false,
  boardPackEconomy,
}: PlayV2ShellProps) {
  const [uncontrolledLeftOpen, setUncontrolledLeftOpen] = useState(false);
  const [uncontrolledLeftDrawerMode, setUncontrolledLeftDrawerMode] = useState<"info" | "wallet" | "market">("info");
  const [uncontrolledRightOpen, setUncontrolledRightOpen] = useState(false);
  const [uncontrolledRightDrawerMode, setUncontrolledRightDrawerMode] = useState<"decision" | "trade" | "macro">("decision");
  const [showNetWorthPopover, setShowNetWorthPopover] = useState(false);
  const wasDecisionActive = useRef(decisionActive);
  const rightDrawerAutoOpenedForDecision = useRef(false);
  const previousModeBeforeDecisionOverride = useRef<"decision" | "trade" | "macro" | null>(null);
  const netWorthPopoverRef = useRef<HTMLDivElement | null>(null);
  const leftOpen = controlledLeftOpen ?? uncontrolledLeftOpen;
  const leftDrawerMode = controlledLeftDrawerMode ?? uncontrolledLeftDrawerMode;
  const rightOpen = controlledRightOpen ?? uncontrolledRightOpen;
  const rightDrawerMode = controlledRightDrawerMode ?? uncontrolledRightDrawerMode;

  useEffect(() => {
    if (!showNetWorthPopover) {
      return undefined;
    }

    const handlePointerDownOutside = (event: MouseEvent) => {
      if (!netWorthPopoverRef.current?.contains(event.target as Node)) {
        setShowNetWorthPopover(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowNetWorthPopover(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDownOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDownOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [showNetWorthPopover]);


  const setRightDrawerMode = useCallback((nextMode: "decision" | "trade" | "macro") => {
    if (controlledRightDrawerMode === undefined) {
      setUncontrolledRightDrawerMode(nextMode);
    }
    onRightDrawerModeChange?.(nextMode);
  }, [controlledRightDrawerMode, onRightDrawerModeChange]);

  const setRightOpen = useCallback((nextOpen: boolean) => {
    if (controlledRightOpen === undefined) {
      setUncontrolledRightOpen(nextOpen);
    }
    onRightOpenChange?.(nextOpen);
  }, [controlledRightOpen, onRightOpenChange]);

  const setRightDrawerState = (nextState: { isOpen: boolean; mode: "decision" | "trade" | "macro" }) => {
    setRightDrawerMode(nextState.mode);
    setRightOpen(nextState.isOpen);
  };


  useEffect(() => {
    if (rightDrawerLocked) {
      const timer = window.setTimeout(() => {
        setRightOpen(false);
        rightDrawerAutoOpenedForDecision.current = false;
        previousModeBeforeDecisionOverride.current = null;
      }, 0);
      return () => window.clearTimeout(timer);
    }

    if (!wasDecisionActive.current && decisionActive && !auctionActive) {
      if (rightDrawerMode !== "decision") {
        previousModeBeforeDecisionOverride.current = rightDrawerMode;
      }
      const timer = window.setTimeout(() => {
        setRightDrawerMode("decision");
        setRightOpen(true);
        if (!rightOpen) {
          rightDrawerAutoOpenedForDecision.current = true;
        }
      }, 0);
      wasDecisionActive.current = decisionActive;
      return () => window.clearTimeout(timer);
    }

    if (wasDecisionActive.current && !decisionActive) {
      const shouldAutoCloseRightDrawer = rightDrawerAutoOpenedForDecision.current;
      rightDrawerAutoOpenedForDecision.current = false;

      if (shouldAutoCloseRightDrawer) {
        const timer = window.setTimeout(() => {
          setRightOpen(false);
        }, 0);
        wasDecisionActive.current = decisionActive;
        return () => window.clearTimeout(timer);
      }

      const modeToRestore = previousModeBeforeDecisionOverride.current;
      if (modeToRestore && rightOpen) {
        const timer = window.setTimeout(() => {
          setRightDrawerMode(modeToRestore);
        }, 0);
        previousModeBeforeDecisionOverride.current = null;
        wasDecisionActive.current = decisionActive;
        return () => window.clearTimeout(timer);
      }

      previousModeBeforeDecisionOverride.current = null;
    }

    wasDecisionActive.current = decisionActive;
    return undefined;
  }, [auctionActive, decisionActive, rightDrawerLocked, rightDrawerMode, rightOpen, setRightDrawerMode, setRightOpen]);

  const setLeftDrawerMode = (nextMode: "info" | "wallet" | "market") => {
    if (controlledLeftDrawerMode === undefined) {
      setUncontrolledLeftDrawerMode(nextMode);
    }
    onLeftDrawerModeChange?.(nextMode);
  };

  const setLeftOpen = (nextOpen: boolean) => {
    if (controlledLeftOpen === undefined) {
      setUncontrolledLeftOpen(nextOpen);
    }
    onLeftOpenChange?.(nextOpen);
  };

  const setLeftDrawerState = (nextState: { isOpen: boolean; mode: "info" | "wallet" | "market" }) => {
    setLeftDrawerMode(nextState.mode);
    setLeftOpen(nextState.isOpen);
  };

  const handleLeftToggle = () => {
    if (!leftOpen) {
      setLeftDrawerState({ isOpen: true, mode: "info" });
      return;
    }

    if (leftDrawerMode === "info") {
      setLeftDrawerState({ isOpen: false, mode: "info" });
      return;
    }

    setLeftDrawerState({ isOpen: true, mode: "info" });
  };

  const handleWalletToggle = () => {
    if (!leftOpen) {
      setLeftDrawerState({ isOpen: true, mode: "wallet" });
      return;
    }

    if (leftDrawerMode === "wallet") {
      setLeftDrawerState({ isOpen: false, mode: "wallet" });
      return;
    }

    setLeftDrawerState({ isOpen: true, mode: "wallet" });
  };

  const handleMarketToggle = () => {
    if (!leftOpen) {
      setLeftDrawerState({ isOpen: true, mode: "market" });
      return;
    }

    if (leftDrawerMode === "market") {
      setLeftDrawerState({ isOpen: false, mode: "market" });
      return;
    }

    setLeftDrawerState({ isOpen: true, mode: "market" });
  };

  const handleDecisionToggle = () => {
    if (rightDrawerLocked) {
      return;
    }

    rightDrawerAutoOpenedForDecision.current = false;
    previousModeBeforeDecisionOverride.current = null;

    if (!rightOpen) {
      setRightDrawerState({ isOpen: true, mode: "decision" });
      return;
    }

    if (rightDrawerMode === "decision") {
      setRightDrawerState({ isOpen: false, mode: "decision" });
      return;
    }

    setRightDrawerState({ isOpen: true, mode: "decision" });
  };

  const handleTradeToggle = () => {
    if (rightDrawerLocked || (decisionActive && !tradeAccessibleDuringDecision)) {
      return;
    }

    rightDrawerAutoOpenedForDecision.current = false;
    previousModeBeforeDecisionOverride.current = null;

    if (!rightOpen) {
      setRightDrawerState({ isOpen: true, mode: "trade" });
      return;
    }

    if (rightDrawerMode === "trade") {
      setRightDrawerState({ isOpen: false, mode: "trade" });
      return;
    }

    setRightDrawerState({ isOpen: true, mode: "trade" });
  };

  const handleMacroToggle = () => {
    if (rightDrawerLocked || decisionActive) {
      return;
    }

    rightDrawerAutoOpenedForDecision.current = false;
    previousModeBeforeDecisionOverride.current = null;

    if (!rightOpen) {
      setRightDrawerState({ isOpen: true, mode: "macro" });
      return;
    }

    if (rightDrawerMode === "macro") {
      setRightDrawerState({ isOpen: false, mode: "macro" });
      return;
    }

    setRightDrawerState({ isOpen: true, mode: "macro" });
  };

  const isRolling = actionLoading === "ROLL_DICE";
  const isEnding = actionLoading === "END_TURN";
  const rollEmphasized = canRoll && !isRolling;
  const endEmphasized = canEndTurn && !isEnding;
  const shouldPulse = rollEmphasized && showTurnActions && actionLoading === null;
  const decisionNeedsAttention = decisionActive && !rightOpen;
  const netWorthPopoverId = "net-worth-breakdown-popover";
  const currency = getCurrencyMetaFromEconomy(boardPackEconomy);
  const formatMoney = (value: number) => formatCurrency(value, currency);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-neutral-950 text-white">
      <div className="play-v2-shell-content">
        <section className="absolute inset-x-0 top-0 z-20 h-9 border-b border-white/10 bg-neutral-950 px-2.5 md:h-10 md:px-3">
          <div className="grid h-full grid-cols-2 items-center gap-2 pr-28 text-[11px] sm:grid-cols-4 sm:pr-64 sm:text-xs">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-white/55">Cash</p>
              <p className="font-semibold leading-tight">{cashLabel}</p>
            </div>
            <div className="relative" ref={netWorthPopoverRef}>
              <button
                type="button"
                className="rounded px-1 py-0.5 -mx-1 -my-0.5 text-left transition hover:bg-white/10"
                onClick={() => setShowNetWorthPopover((current) => !current)}
                aria-expanded={showNetWorthPopover}
                aria-controls={netWorthPopoverId}
              >
                <p className="text-[10px] uppercase tracking-wide text-white/55">Net Worth</p>
                <p className="font-semibold leading-tight">{netWorthLabel}</p>
              </button>
              {showNetWorthPopover && netWorthBreakdown ? (
                <div
                  id={netWorthPopoverId}
                  className="absolute left-0 top-full z-[60] mt-1.5 min-w-52 rounded-lg border border-white/15 bg-neutral-950/95 p-2.5 text-xs shadow-xl shadow-black/40 backdrop-blur"
                  role="dialog"
                  aria-label="Net worth breakdown"
                >
                  <div className="space-y-1">
                    <p className="flex items-center justify-between gap-4 text-white/85">
                      <span>Cash</span>
                      <span className="tabular-nums">{formatMoney(netWorthBreakdown.cash)}</span>
                    </p>
                    <p className="flex items-center justify-between gap-4 text-white/85">
                      <span>Assets</span>
                      <span className="tabular-nums">{formatMoney(netWorthBreakdown.assets)}</span>
                    </p>
                    <p className="flex items-center justify-between gap-4 text-white/85">
                      <span>Liabilities</span>
                      <span className="tabular-nums">{formatMoney(netWorthBreakdown.liabilities)}</span>
                    </p>
                  </div>
                  <div className="my-2 h-px bg-white/10" />
                  <p className="flex items-center justify-between gap-4 font-semibold text-white">
                    <span>Net Worth</span>
                    <span className="tabular-nums">{formatMoney(netWorthBreakdown.netWorth)}</span>
                  </p>
                </div>
              ) : null}
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-white/55">Turn</p>
              <p className="font-semibold leading-tight">{turnPlayerLabel}</p>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wide text-white/55">Last Roll</p>
              <p className="flex flex-wrap items-center gap-1 font-semibold leading-tight">
                <span>{lastRollLabel}</span>
                {lastDiceLabel ? <span className="text-white/80">· {lastDiceLabel}</span> : null}
                {isDoubleRoll ? (
                  <span className="rounded-full bg-amber-200/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-200">
                    DOUBLE!
                  </span>
                ) : null}
              </p>
            </div>
          </div>
          {headerActions ? (
            <div className="absolute right-2 top-1/2 z-10 flex -translate-y-1/2 items-center gap-1.5 md:right-3">
              {headerActions}
            </div>
          ) : null}
        </section>

        {loading ? (
          <p className="absolute right-3 top-11 z-20 text-xs text-white/70 md:top-[2.8rem]">Loading…</p>
        ) : null}
        {notice ? (
          <p className="absolute left-3 top-11 z-20 text-xs text-red-300 md:top-[2.8rem]">{notice}</p>
        ) : null}

        <section className="absolute inset-x-0 bottom-0 top-9 md:top-10">
          {boardViewport}

          {leftOpen ? (
            <button
              type="button"
              className="absolute inset-y-0 left-72 right-0 z-10 bg-transparent"
              onClick={() => setLeftOpen(false)}
              aria-label="Close left drawer"
            />
          ) : null}

          {rightOpen && !rightDrawerLocked ? (
            <button
              type="button"
              className="absolute inset-y-0 left-0 right-72 z-10 bg-transparent"
              onClick={() => setRightOpen(false)}
              aria-label="Close right drawer"
            />
          ) : null}

          <div
            className={`control-stack control-stack-left absolute left-0 top-0 z-20 flex flex-col transition-[left] duration-200 ${
              leftOpen ? "control-stack-left-open" : ""
            }`}
          >
            <button
              type="button"
              onClick={onRecenterBoard}
              aria-label="Recenter"
              title="Recenter"
              className={utilityButtonClass}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="utility-svg-icon" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3.5" />
                <path d="M12 2v3" />
                <path d="M12 19v3" />
                <path d="M2 12h3" />
                <path d="M19 12h3" />
              </svg>
            </button>
            <button
              type="button"
              onClick={handleLeftToggle}
              className={utilityButtonClass}
              aria-label="Open tile information panel"
              title="Tile information"
            >
              <span className="info-icon" aria-hidden>
                ⓘ
              </span>
            </button>
            <WalletButton
              open={leftOpen && leftDrawerMode === "wallet"}
              onClick={handleWalletToggle}
            />
            <MarketButton
              open={leftOpen && leftDrawerMode === "market"}
              onClick={handleMarketToggle}
            />
          </div>

          <div
            className={`control-stack control-stack-right absolute right-0 top-0 z-20 flex flex-col transition-[right] duration-200 ${
              rightOpen ? "control-stack-right-open" : ""
            }`}
          >
            <button
              type="button"
              onClick={onMenuToggle}
              className={utilityButtonClass}
              aria-label="Menu"
              title="Open menu"
              aria-expanded={menuOpen}
            >
              <span className="menu-icon" aria-hidden>
                ≡
              </span>
            </button>
            <DecisionButton
              open={rightOpen && rightDrawerMode === "decision"}
              onClick={handleDecisionToggle}
              disabled={rightDrawerLocked}
              showAttention={decisionNeedsAttention}
            />
            <TradeButton
              open={rightOpen && rightDrawerMode === "trade"}
              onClick={handleTradeToggle}
              disabled={rightDrawerLocked || (decisionActive && !tradeAccessibleDuringDecision)}
              showAttention={tradeNeedsAttention}
            />
            <MacroButton
              open={rightOpen && rightDrawerMode === "macro"}
              onClick={handleMacroToggle}
              disabled={rightDrawerLocked || decisionActive}
              showIndicator={macroEffectsActive}
            />
          </div>

          {showTurnActions ? (
            <section className="action-stack absolute bottom-0 right-0 z-20 flex flex-col items-center">
              <button
                type="button"
                className={`flex h-14 w-14 items-center justify-center rounded-full border shadow-lg transition ${
                  rollEmphasized
                    ? "border-emerald-600 bg-emerald-600 text-white shadow-emerald-600/30"
                    : "border-emerald-200 bg-emerald-100 text-emerald-300 shadow-emerald-200/40 opacity-70"
                } ${shouldPulse ? "player-ready-pulse" : ""}`}
                onClick={onRollDice}
                disabled={!canRoll || isRolling}
                aria-label={isRolling ? "Rolling dice" : "Roll dice"}
                title={rollDiceDisabledReason ?? "Roll dice"}
              >
                <span className="sr-only">{isRolling ? "Rolling…" : "Roll dice"}</span>
                <Image
                  src="/icons/dice.svg"
                  alt=""
                  width={30}
                  height={30}
                  className="h-10 w-10 object-contain"
                  aria-hidden
                />
              </button>
              <button
                type="button"
                className={`flex h-12 w-12 items-center justify-center rounded-full border text-xs font-semibold shadow-lg transition ${
                  endEmphasized
                    ? "border-rose-600 bg-rose-600 text-white shadow-rose-600/30"
                    : "border-rose-200 bg-rose-100 text-rose-300 shadow-rose-200/40 opacity-70"
                }`}
                onClick={onEndTurn}
                disabled={!canEndTurn || isEnding}
                aria-label={isEnding ? "Ending turn" : "End turn"}
              >
                {isEnding ? "..." : "END"}
              </button>
            </section>
          ) : null}
        </section>

        <aside
          id="left-drawer"
          className={`absolute bottom-0 left-0 top-9 z-20 flex w-72 flex-col border-r border-white/15 bg-neutral-900 transition-transform duration-200 md:top-10 ${
            leftOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {leftDrawerMode === "info" ? (
            <div className="min-h-0 flex-1 overflow-auto p-3">{leftDrawerContent}</div>
          ) : leftDrawerMode === "wallet" ? (
            <WalletPanel
              ownedCount={walletOwnedCount}
              loanCount={walletLoanCount}
              mortgageCount={walletMortgageCount}
              ownedContent={
                walletOwnedContent ?? (
                  <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white/80">Coming soon</div>
                )
              }
              loansContent={walletLoansContent}
              mortgagesContent={walletMortgagesContent}
            />
          ) : (
            <div className="min-h-0 flex-1 overflow-auto p-3">{marketDrawerContent}</div>
          )}
        </aside>

        <aside
          id="right-drawer"
          className={`absolute bottom-0 right-0 top-9 z-20 flex w-72 flex-col border-l border-white/15 bg-neutral-900 transition-transform duration-200 md:top-10 ${
            rightOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="min-h-0 flex-1 overflow-auto p-4">
            {rightDrawerMode === "decision"
              ? decisionDrawerContent
              : rightDrawerMode === "trade"
                ? tradeDrawerContent
                : macroDrawerContent}
          </div>
        </aside>
      </div>

      <style jsx>{`
        .control-stack {
          --stack-offset: 0.875rem;
          --stack-side-offset: 0.875rem;
          --stack-gap: 0.5rem;
          gap: var(--stack-gap);
        }

        .control-stack-left,
        .control-stack-right {
          top: calc(var(--stack-offset) + env(safe-area-inset-top, 0px));
        }

        .control-stack-left {
          left: calc(var(--stack-side-offset) + env(safe-area-inset-left, 0px));
        }

        .control-stack-left.control-stack-left-open {
          left: calc(18.5rem + var(--stack-side-offset) + env(safe-area-inset-left, 0px));
        }

        .control-stack-right {
          right: calc(var(--stack-side-offset) + env(safe-area-inset-right, 0px));
        }

        .control-stack-right.control-stack-right-open {
          right: calc(18.5rem + var(--stack-side-offset) + env(safe-area-inset-right, 0px));
        }

        .action-stack {
          --action-stack-offset: 0.875rem;
          --action-stack-gap: 0.75rem;
          bottom: calc(var(--action-stack-offset) + env(safe-area-inset-bottom, 0px));
          right: calc(var(--action-stack-offset) + env(safe-area-inset-right, 0px));
          gap: var(--action-stack-gap);
        }

        .utility-svg-icon {
          height: 20px;
          width: 20px;
          flex-shrink: 0;
        }

        .menu-icon,
        .bank-icon,
        .market-icon,
        .decision-icon,
        .trade-icon,
        .macro-icon,
        .info-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 20px;
          height: 20px;
          font-size: 20px;
          line-height: 1;
          flex-shrink: 0;
        }

        .bank-icon {
          font-size: 19px;
        }

        .market-icon {
          font-size: 18px;
        }

        .decision-icon,
        .trade-icon,
        .macro-icon {
          font-size: 18px;
        }

        .menu-icon,
        .info-icon {
          font-size: 20px;
        }

        @media (max-height: 760px) {
          .control-stack {
            --stack-offset: 0.625rem;
            --stack-side-offset: 0.625rem;
            --stack-gap: 0.35rem;
          }

          .action-stack {
            --action-stack-offset: 0.625rem;
            --action-stack-gap: 0.5rem;
          }
        }
      `}</style>
    </main>
  );
}
