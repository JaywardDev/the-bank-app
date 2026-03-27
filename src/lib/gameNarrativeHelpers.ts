import type { BoardPack } from "@/lib/boardPacks";
import { formatCurrency, getCurrencyMetaFromBoardPack } from "@/lib/currency";

type PendingCardInput = {
  id: string | null;
  deck: "CHANCE" | "COMMUNITY" | null;
};

const formatMoney = (amount: number, currencyCode: string | null | undefined, currencySymbol = "$") =>
  formatCurrency(Math.round(amount), { code: currencyCode, symbol: currencySymbol });

export const resolvePendingCardText = (
  pendingCard: PendingCardInput | null,
  boardPack: BoardPack | null,
) => {
  if (!pendingCard?.id || !pendingCard.deck) {
    return null;
  }

  const eventDecks = boardPack?.eventDecks;
  const eventDeck =
    pendingCard.deck === "CHANCE"
      ? eventDecks?.chance ?? []
      : pendingCard.deck === "COMMUNITY"
        ? eventDecks?.community ?? []
        : [];
  const card = eventDeck.find((entry) => entry.id === pendingCard.id);
  return card?.text ?? null;
};

export const getPendingCardDescription = (
  kind: string | null,
  payload: Record<string, unknown> | null,
  boardPack: BoardPack | null,
  currencySymbol = "$",
) => {
  if (!kind) {
    return "Card effect pending.";
  }
  const data = payload ?? {};
  const boardPackCurrency = getCurrencyMetaFromBoardPack(boardPack);
  const currencyCode = boardPackCurrency.code ?? undefined;
  const activeCurrencySymbol = currencySymbol ?? boardPackCurrency.symbol ?? "$";
  if (kind === "PAY" || kind === "RECEIVE") {
    const amount =
      typeof data.amount === "number"
        ? data.amount
        : typeof data.amount === "string"
          ? Number.parseInt(data.amount, 10)
          : null;
    if (amount !== null) {
      return kind === "PAY"
        ? `Pay ${formatMoney(amount, currencyCode, activeCurrencySymbol)}.`
        : `Receive ${formatMoney(amount, currencyCode, activeCurrencySymbol)}.`;
    }
    return kind === "PAY" ? "Pay the bank." : "Receive money from the bank.";
  }
  if (kind === "MOVE_TO") {
    const tileIndex =
      typeof data.tile_index === "number"
        ? data.tile_index
        : typeof data.tile_index === "string"
          ? Number.parseInt(data.tile_index, 10)
          : null;
    const tileName =
      tileIndex !== null
        ? boardPack?.tiles?.find((tile) => tile.index === tileIndex)?.name ??
          `Tile ${tileIndex}`
        : "a specific tile";
    return `Move to ${tileName}.`;
  }
  if (kind === "MOVE_REL") {
    const spaces =
      typeof data.relative_spaces === "number"
        ? data.relative_spaces
        : typeof data.spaces === "number"
          ? data.spaces
          : typeof data.relative_spaces === "string"
            ? Number.parseInt(data.relative_spaces, 10)
            : typeof data.spaces === "string"
              ? Number.parseInt(data.spaces, 10)
              : null;
    if (spaces !== null) {
      return spaces >= 0
        ? `Move forward ${spaces} spaces.`
        : `Move back ${Math.abs(spaces)} spaces.`;
    }
    return "Move to a new space.";
  }
  if (kind === "GET_OUT_OF_JAIL_FREE") {
    return "Keep this card to use later.";
  }
  if (kind === "TAX_EXEMPTION_PASS") {
    return "Keep this card to skip paying Income Tax or Super Tax once.";
  }
  if (kind === "GO_TO_JAIL") {
    return "Go directly to jail.";
  }
  return "Card effect pending.";
};
