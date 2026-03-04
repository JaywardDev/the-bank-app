"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";

type WalletTab = "owned" | "loans" | "mortgages";

type WalletButtonProps = {
  open: boolean;
  onClick: () => void;
};

function WalletButton({ open, onClick }: WalletButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded border border-white/30 bg-neutral-900 px-2 py-1 text-xs font-semibold"
      aria-expanded={open}
      aria-controls="left-drawer"
    >
      WALLET
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
  turnPlayerLabel: string;
  lastRollLabel: string;
  lastDiceLabel?: string | null;
  isDoubleRoll?: boolean;
  loading: boolean;
  notice: string | null;
  debugPanel?: ReactNode;
  boardViewport: ReactNode;
  leftDrawerContent?: ReactNode;
  rightDrawerContent?: ReactNode;
  leftOpen?: boolean;
  onLeftOpenChange?: (open: boolean) => void;
  leftDrawerMode?: "info" | "wallet";
  onLeftDrawerModeChange?: (mode: "info" | "wallet") => void;
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
  auctionActive?: boolean;
  headerActions?: ReactNode;
};

export default function PlayV2Shell({
  cashLabel,
  netWorthLabel,
  turnPlayerLabel,
  lastRollLabel,
  lastDiceLabel = null,
  isDoubleRoll = false,
  loading,
  notice,
  boardViewport,
  leftDrawerContent,
  rightDrawerContent,
  leftOpen: controlledLeftOpen,
  onLeftOpenChange,
  leftDrawerMode: controlledLeftDrawerMode,
  onLeftDrawerModeChange,
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
  auctionActive = false,
  headerActions,
}: PlayV2ShellProps) {
  const [uncontrolledLeftOpen, setUncontrolledLeftOpen] = useState(false);
  const [uncontrolledLeftDrawerMode, setUncontrolledLeftDrawerMode] = useState<"info" | "wallet">("info");
  const [rightOpen, setRightOpen] = useState(false);
  const wasDecisionActive = useRef(decisionActive);
  const rightDrawerAutoOpenedForDecision = useRef(false);
  const leftOpen = controlledLeftOpen ?? uncontrolledLeftOpen;
  const leftDrawerMode = controlledLeftDrawerMode ?? uncontrolledLeftDrawerMode;

  useEffect(() => {
    if (!wasDecisionActive.current && decisionActive && !auctionActive) {
      const timer = window.setTimeout(() => {
        setRightOpen(true);
        rightDrawerAutoOpenedForDecision.current = true;
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
    }

    wasDecisionActive.current = decisionActive;
    return undefined;
  }, [auctionActive, decisionActive]);

  const setLeftDrawerMode = (nextMode: "info" | "wallet") => {
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

  const setLeftDrawerState = (nextState: { isOpen: boolean; mode: "info" | "wallet" }) => {
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

  const isRolling = actionLoading === "ROLL_DICE";
  const isEnding = actionLoading === "END_TURN";
  const rollEmphasized = canRoll && !isRolling;
  const endEmphasized = canEndTurn && !isEnding;
  const shouldPulse = rollEmphasized && showTurnActions && actionLoading === null;
  const decisionNeedsAttention = decisionActive && !rightOpen;

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-neutral-950 text-white">
      <div className="play-v2-shell-content">
        <section className="absolute inset-x-0 top-0 z-20 h-9 border-b border-white/10 bg-neutral-950 px-2.5 md:h-10 md:px-3">
          <div className="grid h-full grid-cols-2 items-center gap-2 pr-28 text-[11px] sm:grid-cols-4 sm:pr-64 sm:text-xs">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-white/55">Cash</p>
              <p className="font-semibold leading-tight">{cashLabel}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-white/55">Net Worth</p>
              <p className="font-semibold leading-tight">{netWorthLabel}</p>
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

          <div
            className={`absolute top-1/2 z-30 flex -translate-y-1/2 flex-col gap-2 transition-[left] duration-200 ${
              leftOpen ? "left-72" : "left-0"
            }`}
          >
            <button
              type="button"
              onClick={handleLeftToggle}
              className="rounded-r-lg border border-white/20 bg-neutral-900 px-2 py-3 text-xs font-semibold uppercase tracking-wide"
            >
              Left
            </button>
            <WalletButton
              open={leftOpen && leftDrawerMode === "wallet"}
              onClick={handleWalletToggle}
            />
          </div>

          <button
            type="button"
            onClick={() => {
              rightDrawerAutoOpenedForDecision.current = false;
              setRightOpen((value) => !value);
            }}
            className={`absolute top-1/2 z-30 -translate-y-1/2 rounded-l-lg border border-white/20 bg-neutral-900 px-2 py-3 text-xs font-semibold uppercase tracking-wide transition-[right] duration-200 ${
              rightOpen ? "right-72" : "right-0"
            }`}
          >
            Right
            {decisionNeedsAttention ? (
              <span className="absolute -left-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
                !
              </span>
            ) : null}
          </button>

          {showTurnActions ? (
            <section className="absolute bottom-2 right-2 z-20 flex flex-col items-center gap-3">
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
          ) : (
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
          )}
        </aside>

        <aside
          className={`absolute bottom-0 right-0 top-9 z-20 flex w-72 flex-col border-l border-white/15 bg-neutral-900 transition-transform duration-200 md:top-10 ${
            rightOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="min-h-0 flex-1 overflow-auto p-4">{rightDrawerContent}</div>
        </aside>
      </div>

      <section className="play-v2-shell-overlay absolute inset-0 z-50 hidden items-center justify-center bg-neutral-950/95 p-6 text-center">
        <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-neutral-900/90 p-6 shadow-2xl">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="mx-auto mb-4 h-10 w-10 text-white/80"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="7" y="2" width="10" height="20" rx="2.5" />
            <path d="M5 9 2.5 12 5 15" />
            <path d="M19 9 21.5 12 19 15" />
          </svg>
          <h2 className="text-xl font-semibold">Rotate your phone</h2>
          <p className="mt-2 text-sm text-white/75">This game plays best in landscape.</p>
          <p className="mt-3 text-xs text-white/55">If it doesn’t rotate, turn off rotation lock.</p>
        </div>
      </section>

      <style jsx>{`
        @media (orientation: portrait) {
          .play-v2-shell-content {
            pointer-events: none;
            user-select: none;
          }

          .play-v2-shell-overlay {
            display: flex;
          }
        }

        @media (orientation: landscape) {
          .play-v2-shell-overlay {
            display: none;
          }
        }
      `}</style>
    </main>
  );
}
