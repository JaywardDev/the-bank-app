import type { BoardPack } from "@/lib/boardPacks";
import { formatCurrency, formatSignedCurrency, getCurrencyMetaFromBoardPack } from "@/lib/currency";
export type EventFeedPlayer = { id: string; display_name: string | null };

export type GameEventRow = {
  id: string;
  event_type: string;
  payload: Record<string, unknown> | null;
  created_at: string;
  version: number;
};

export type TransactionRow = {
  id: string;
  ts: string | null;
  title: string;
  subtitle: string | null;
  amount: number;
  sourceEventVersion: number;
  sourceEventId: string;
};

const formatMoney = (amount: number, currencyCode?: string, currencySymbol = "$") =>
  formatCurrency(amount, { code: currencyCode, symbol: currencySymbol });

const formatSignedMoney = (amount: number, currencyCode?: string, currencySymbol = "$") =>
  formatSignedCurrency(amount, { code: currencyCode, symbol: currencySymbol });

const parseNumber = (value: unknown): number | null => {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
};

const getTurnsRemainingFromPayload = (payload: unknown): number | null => {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const value =
    "turns_remaining" in record
      ? record.turns_remaining
      : record.turns_remaining_after;
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
};

export const formatEventDescription = (
  event: GameEventRow,
  ctx: { players: EventFeedPlayer[]; boardPack: BoardPack | null; currencySymbol?: string; ownershipByTile?: Record<number, { owner_player_id: string }> }
) => {
  const players = ctx.players;
  const boardPack = ctx.boardPack;
  const boardPackCurrency = getCurrencyMetaFromBoardPack(boardPack);
  const currencyCode = boardPackCurrency.code ?? undefined;
  const currencySymbol = ctx.currencySymbol ?? boardPackCurrency.symbol ?? "$";
  const getTileNameByIndex = (tileIndex: number | null) => {
    if (tileIndex === null || Number.isNaN(tileIndex)) {
      return "Tile";
    }
    return boardPack?.tiles?.find((entry) => entry.index === tileIndex)?.name ?? `Tile ${tileIndex}`;
  };
  const getOwnershipLabel = (tileIndex: number | null) => {
    if (tileIndex === null || Number.isNaN(tileIndex)) {
      return null;
    }
    const ownership = ctx.ownershipByTile?.[tileIndex];
    if (!ownership) {
      return "Unowned";
    }
    const owner = players.find((player) => player.id === ownership.owner_player_id);
    return `Owned by ${owner?.display_name ?? "Player"}`;
  };

    const payload =
      event.payload && typeof event.payload === "object" ? event.payload : null;

    const dice = payload?.dice;
    const diceDisplay =
      Array.isArray(dice) &&
      dice.length >= 2 &&
      typeof dice[0] === "number" &&
      typeof dice[1] === "number"
        ? `🎲 ${dice[0]} + ${dice[1]}`
        : null;
    const doublesCount =
      typeof payload?.doubles_count === "number"
        ? payload.doubles_count
        : null;

    if (event.event_type === "ROLL_DICE") {
      if (diceDisplay) {
        return `Rolled ${diceDisplay}`;
      }
      if (typeof payload?.roll === "number") {
        return `Rolled ${payload.roll}`;
      }
      return "Dice rolled";
    }

    if (event.event_type === "CARD_UTILITY_ROLL") {
      if (diceDisplay) {
        return `Rolled ${diceDisplay} for utility rent (card effect)`;
      }
      if (typeof payload?.roll === "number") {
        return `Rolled ${payload.roll} for utility rent (card effect)`;
      }
      return "Rolled for utility rent (card effect)";
    }

    if (event.event_type === "BETTING_MARKET_BET_PLACED") {
      const playerName =
        typeof payload?.player_name === "string" ? payload.player_name : "Player";
      const betLabel =
        typeof payload?.bet_label === "string" ? payload.bet_label : "dice";
      return `${playerName} placed a bet on ${betLabel}`;
    }

    if (event.event_type === "BETTING_MARKET_BET_WON") {
      const playerName =
        typeof payload?.player_name === "string" ? payload.player_name : "Player";
      const betLabel =
        typeof payload?.bet_label === "string" ? payload.bet_label : "dice";
      return `${playerName} won on ${betLabel}`;
    }

    if (event.event_type === "ROLLED_DOUBLE") {
      return doublesCount !== null
        ? `Double rolled (streak ${doublesCount})`
        : "Double rolled";
    }

    if (event.event_type === "END_TURN" && payload?.to_player_name) {
      return `Turn → ${payload.to_player_name}`;
    }

    if (event.event_type === "INLAND_PASSIVE_INCOME") {
      const playerName =
        typeof payload?.player_name === "string" ? payload.player_name : "Player";
      const amount = parseNumber(payload?.amount);
      const amountLabel =
        amount !== null ? formatMoney(amount, currencyCode, currencySymbol) : "income";
      return `${playerName} collected inland passive income (${amountLabel})`;
    }

    if (event.event_type === "INTERIOR_RESOURCE_BONUS_GRANTED") {
      const playerName =
        typeof payload?.player_name === "string" ? payload.player_name : "Player";
      const buildGranted = parseNumber(payload?.free_build_tokens_granted) ?? 0;
      const upgradeGranted = parseNumber(payload?.free_upgrade_tokens_granted) ?? 0;
      if (buildGranted > 0) {
        return `${playerName} found timber and gained +${buildGranted} build voucher`;
      }
      if (upgradeGranted > 0) {
        return `${playerName} found rare earth and gained +${upgradeGranted} upgrade voucher`;
      }
      return `${playerName} gained an inland voucher reward`;
    }

    if (event.event_type === "INTERIOR_RESOURCE_EMPTY") {
      const playerName =
        typeof payload?.player_name === "string" ? payload.player_name : "Player";
      return `${playerName} explored inland but found empty land`;
    }

    if (event.event_type === "HOUSE_BUILD_VOUCHER_USED") {
      const playerName =
        typeof payload?.player_name === "string" ? payload.player_name : "Player";
      const voucherType =
        typeof payload?.voucher_type === "string"
          ? payload.voucher_type.toLowerCase()
          : "construction";
      return `${playerName} used a ${voucherType} voucher to develop property`;
    }

    if (event.event_type === "TRADE_PROPOSED") {
      const proposerId =
        typeof payload?.proposer_player_id === "string"
          ? payload.proposer_player_id
          : null;
      const counterpartyId =
        typeof payload?.counterparty_player_id === "string"
          ? payload.counterparty_player_id
          : null;
      const proposerName = proposerId
        ? players.find((player) => player.id === proposerId)?.display_name ??
          "Player"
        : "Player";
      const counterpartyName = counterpartyId
        ? players.find((player) => player.id === counterpartyId)?.display_name ??
          "Player"
        : "Player";
      return `Trade proposed · ${proposerName} → ${counterpartyName}`;
    }

    if (event.event_type === "TRADE_ACCEPTED") {
      const proposerId =
        typeof payload?.proposer_player_id === "string"
          ? payload.proposer_player_id
          : null;
      const counterpartyId =
        typeof payload?.counterparty_player_id === "string"
          ? payload.counterparty_player_id
          : null;
      const proposerName = proposerId
        ? players.find((player) => player.id === proposerId)?.display_name ??
          "Player"
        : "Player";
      const counterpartyName = counterpartyId
        ? players.find((player) => player.id === counterpartyId)?.display_name ??
          "Player"
        : "Player";
      return `Trade executed · ${proposerName} ⇄ ${counterpartyName}`;
    }

    if (event.event_type === "TRADE_REJECTED") {
      const rejectedId =
        typeof payload?.rejected_by_player_id === "string"
          ? payload.rejected_by_player_id
          : null;
      const rejectedName = rejectedId
        ? players.find((player) => player.id === rejectedId)?.display_name ??
          "Player"
        : "Player";
      return `Trade rejected · ${rejectedName}`;
    }

    if (event.event_type === "PROPERTY_TRANSFERRED") {
      const tileIndex = parseNumber(payload?.tile_index);
      const tileName = getTileNameByIndex(tileIndex);
      const fromId =
        typeof payload?.from_player_id === "string"
          ? payload.from_player_id
          : null;
      const toId =
        typeof payload?.to_player_id === "string"
          ? payload.to_player_id
          : null;
      const fromName = fromId
        ? players.find((player) => player.id === fromId)?.display_name ??
          "Player"
        : "Player";
      const toName = toId
        ? players.find((player) => player.id === toId)?.display_name ??
          "Player"
        : "Player";
      return `Property transferred · ${tileName} (${fromName} → ${toName})`;
    }

    if (event.event_type === "LOAN_ASSUMED") {
      const tileIndex = parseNumber(payload?.tile_index);
      const tileName = getTileNameByIndex(tileIndex);
      const toId =
        typeof payload?.to_player_id === "string"
          ? payload.to_player_id
          : null;
      const toName = toId
        ? players.find((player) => player.id === toId)?.display_name ??
          "Player"
        : "Player";
      return `Loan assumed · ${tileName} (${toName})`;
    }

    if (event.event_type === "START_GAME") {
      return "Game started";
    }

    if (event.event_type === "MACRO_EVENT") {
      const eventName =
        typeof payload?.event_name === "string"
          ? payload.event_name
          : "Macroeconomic shift";
      const rarityRaw = typeof payload?.rarity === "string" ? payload.rarity : null;
      const rarity = rarityRaw ? rarityRaw.replaceAll("_", " ") : null;
      const duration =
        typeof payload?.duration_rounds === "number"
          ? payload.duration_rounds
          : typeof payload?.duration_rounds === "string"
            ? Number.parseInt(payload.duration_rounds, 10)
            : null;
      const durationLabel = duration !== null ? ` · ${duration} rounds` : "";
      const rarityLabel = rarity ? ` (${rarity})` : "";
      return `Macro event: ${eventName}${rarityLabel}${durationLabel}`;
    }

    if (event.event_type === "MACRO_EVENT_TRIGGERED") {
      const eventName =
        typeof payload?.event_name === "string"
          ? payload.event_name
          : "Macroeconomic shift";
      const rarityRaw = typeof payload?.rarity === "string" ? payload.rarity : null;
      const rarity = rarityRaw ? rarityRaw.replaceAll("_", " ") : null;
      const duration =
        typeof payload?.duration_rounds === "number"
          ? payload.duration_rounds
          : typeof payload?.duration_rounds === "string"
            ? Number.parseInt(payload.duration_rounds, 10)
            : null;
      const durationLabel = duration !== null ? ` · ${duration} rounds` : "";
      const rarityLabel = rarity ? ` (${rarity})` : "";
      return `Macro event triggered: ${eventName}${rarityLabel}${durationLabel}`;
    }

    if (
      event.event_type === "MACRO_EVENT_EXPIRED" ||
      event.event_type === "MACRO_EXPIRED"
    ) {
      const eventName =
        typeof payload?.event_name === "string"
          ? payload.event_name
          : "Macroeconomic shift";
      return `Macro event expired: ${eventName}`;
    }

    if (event.event_type === "MACRO_MAINTENANCE_CHARGED") {
      const perHouse =
        typeof payload?.per_house === "number"
          ? payload.per_house
          : typeof payload?.per_house === "string"
            ? Number.parseInt(payload.per_house, 10)
          : null;
      const eventName =
        typeof payload?.event_name === "string"
          ? payload.event_name
          : "Macro maintenance";
      return perHouse !== null
        ? `${eventName} maintenance charged (${formatMoney(perHouse, currencyCode, currencySymbol)} per house)`
        : `${eventName} maintenance charged`;
    }

    if (event.event_type === "MACRO_INTEREST_SURCHARGE") {
      const amount =
        typeof payload?.amount === "number"
          ? payload.amount
          : typeof payload?.amount === "string"
            ? Number.parseInt(payload.amount, 10)
            : null;
      const tileIndexRaw = payload?.tile_index;
      const tileIndex =
        typeof tileIndexRaw === "number"
          ? tileIndexRaw
          : typeof tileIndexRaw === "string"
            ? Number.parseInt(tileIndexRaw, 10)
            : null;
      const tileNameFromBoard =
        tileIndex !== null
          ? boardPack?.tiles?.find((entry) => entry.index === tileIndex)?.name
          : null;
      const tileLabel =
        tileNameFromBoard ?? (tileIndex !== null ? `Tile ${tileIndex}` : "tile");
      return amount !== null
        ? `Macro interest surcharge: ${formatMoney(amount, currencyCode, currencySymbol)} (${tileLabel})`
        : `Macro interest surcharge (${tileLabel})`;
    }

    if (event.event_type === "COLLECT_GO") {
      const amount =
        typeof payload?.amount === "number"
          ? payload.amount
          : typeof payload?.amount === "string"
            ? Number.parseInt(payload.amount, 10)
            : null;
      const playerName =
        typeof payload?.player_name === "string"
          ? payload.player_name
          : "Player";
      const reason =
        typeof payload?.reason === "string" ? payload.reason : "PASS_START";
      const reasonLabel = reason === "LAND_GO" ? "for landing on GO" : "for passing GO";
      return amount !== null
        ? `${playerName} collected ${formatMoney(amount, currencyCode, currencySymbol)} ${reasonLabel}`
        : `${playerName} collected GO salary`;
    }

    if (event.event_type === "LAND_ON_TILE") {
      const tileIndexRaw = payload?.tile_index;
      const tileIndex =
        typeof tileIndexRaw === "number"
          ? tileIndexRaw
          : typeof tileIndexRaw === "string"
            ? Number.parseInt(tileIndexRaw, 10)
            : null;
      const tile = boardPack?.tiles?.find((entry) => entry.index === tileIndex);
      const tileLabel = tile
        ? `${tile.index} ${tile.name}`
        : tileIndex !== null
          ? `Tile ${tileIndex}`
          : "Tile";
      const ownershipLabel = getOwnershipLabel(tileIndex);
      return ownershipLabel
        ? `Landed on ${tileLabel} · ${ownershipLabel}`
        : `Landed on ${tileLabel}`;
    }

    if (event.event_type === "DRAW_CARD") {
      const deck =
        typeof payload?.deck === "string" ? payload.deck : "Card";
      const cardTitle =
        typeof payload?.card_title === "string" ? payload.card_title : "Card";
      const playerName =
        typeof payload?.player_name === "string"
          ? payload.player_name
          : "Player";
      return `${playerName} drew ${deck}: ${cardTitle}`;
    }

    if (event.event_type === "CARD_REVEALED") {
      const deck =
        typeof payload?.deck === "string" ? payload.deck : "Card";
      const cardTitle =
        typeof payload?.card_title === "string" ? payload.card_title : "Card";
      return `${deck} card revealed: ${cardTitle}`;
    }

    if (event.event_type === "CARD_PAY") {
      const amount =
        typeof payload?.amount === "number"
          ? payload.amount
          : typeof payload?.amount === "string"
            ? Number.parseInt(payload.amount, 10)
            : null;
      const cardTitle =
        typeof payload?.card_title === "string" ? payload.card_title : "Card";
      const playerName =
        typeof payload?.player_name === "string"
          ? payload.player_name
          : "Player";
      return amount !== null
        ? `${playerName} paid ${formatMoney(amount, currencyCode, currencySymbol)} (${cardTitle})`
        : `${playerName} paid (${cardTitle})`;
    }

    if (event.event_type === "CARD_RECEIVE") {
      const amount =
        typeof payload?.amount === "number"
          ? payload.amount
          : typeof payload?.amount === "string"
            ? Number.parseInt(payload.amount, 10)
            : null;
      const cardTitle =
        typeof payload?.card_title === "string" ? payload.card_title : "Card";
      const playerName =
        typeof payload?.player_name === "string"
          ? payload.player_name
          : "Player";
      return amount !== null
        ? `${playerName} received ${formatMoney(amount, currencyCode, currencySymbol)} (${cardTitle})`
        : `${playerName} received (${cardTitle})`;
    }

    if (
      event.event_type === "CARD_MOVE_TO" ||
      event.event_type === "CARD_MOVE_REL"
    ) {
      const toIndexRaw = payload?.to_tile_index;
      const toIndex =
        typeof toIndexRaw === "number"
          ? toIndexRaw
          : typeof toIndexRaw === "string"
            ? Number.parseInt(toIndexRaw, 10)
            : null;
      const tileNameFromBoard =
        toIndex !== null
          ? boardPack?.tiles?.find((entry) => entry.index === toIndex)?.name
          : null;
      const tileLabel =
        tileNameFromBoard ?? (toIndex !== null ? `Tile ${toIndex}` : "tile");
      const cardTitle =
        typeof payload?.card_title === "string" ? payload.card_title : "Card";
      const playerName =
        typeof payload?.player_name === "string"
          ? payload.player_name
          : "Player";
      return `${playerName} moved to ${tileLabel} (${cardTitle})`;
    }

    if (event.event_type === "CARD_GO_TO_JAIL") {
      const cardTitle =
        typeof payload?.card_title === "string" ? payload.card_title : "Card";
      const playerName =
        typeof payload?.player_name === "string"
          ? payload.player_name
          : "Player";
      return `${playerName} went to jail (${cardTitle})`;
    }

    if (event.event_type === "CARD_GET_OUT_OF_JAIL_FREE_RECEIVED") {
      const cardTitle =
        typeof payload?.card_title === "string"
          ? payload.card_title
          : "Get Out of Jail Free";
      const playerName =
        typeof payload?.player_name === "string"
          ? payload.player_name
          : "Player";
      const totalCards =
        typeof payload?.total_cards === "number"
          ? payload.total_cards
          : typeof payload?.total_cards === "string"
            ? Number.parseInt(payload.total_cards, 10)
            : null;
      return totalCards !== null
        ? `${playerName} received a ${cardTitle} card (${totalCards} total)`
        : `${playerName} received a ${cardTitle} card`;
    }

    if (event.event_type === "CARD_GET_OUT_OF_JAIL_FREE_USED") {
      const playerName =
        typeof payload?.player_name === "string"
          ? payload.player_name
          : "Player";
      const remainingCards =
        typeof payload?.remaining_cards === "number"
          ? payload.remaining_cards
          : typeof payload?.remaining_cards === "string"
            ? Number.parseInt(payload.remaining_cards, 10)
            : null;
      return remainingCards !== null
        ? `${playerName} used a Get Out of Jail Free card (${remainingCards} left)`
        : `${playerName} used a Get Out of Jail Free card`;
    }

    if (event.event_type === "CARD_TAX_EXEMPTION_PASS_RECEIVED") {
      const cardTitle =
        typeof payload?.card_title === "string"
          ? payload.card_title
          : "Tax Exemption Pass";
      const playerName =
        typeof payload?.player_name === "string"
          ? payload.player_name
          : "Player";
      const totalCards =
        typeof payload?.total_cards === "number"
          ? payload.total_cards
          : typeof payload?.total_cards === "string"
            ? Number.parseInt(payload.total_cards, 10)
            : null;
      return totalCards !== null
        ? `${playerName} received a ${cardTitle} (${totalCards} total)`
        : `${playerName} received a ${cardTitle}`;
    }

    if (event.event_type === "CARD_TAX_EXEMPTION_PASS_USED") {
      const playerName =
        typeof payload?.player_name === "string"
          ? payload.player_name
          : "Player";
      const taxKind =
        payload?.tax_kind === "INCOME_TAX"
          ? "Income Tax"
          : payload?.tax_kind === "SUPER_TAX"
            ? "Super Tax"
            : "tax";
      const preventedAmount =
        typeof payload?.prevented_amount === "number"
          ? payload.prevented_amount
          : typeof payload?.prevented_amount === "string"
            ? Number.parseInt(payload.prevented_amount, 10)
            : null;
      const remainingCards =
        typeof payload?.remaining_cards === "number"
          ? payload.remaining_cards
          : typeof payload?.remaining_cards === "string"
            ? Number.parseInt(payload.remaining_cards, 10)
            : null;
      const savedLabel =
        preventedAmount !== null
          ? ` and skipped ${formatMoney(preventedAmount, currencyCode, currencySymbol)}`
          : "";
      return remainingCards !== null
        ? `${playerName} used a Tax Exemption Pass for ${taxKind}${savedLabel} (${remainingCards} left)`
        : `${playerName} used a Tax Exemption Pass for ${taxKind}${savedLabel}`;
    }

    if (event.event_type === "OFFER_PURCHASE") {
      const tileIndexRaw = payload?.tile_index;
      const tileIndex =
        typeof tileIndexRaw === "number"
          ? tileIndexRaw
          : typeof tileIndexRaw === "string"
            ? Number.parseInt(tileIndexRaw, 10)
            : null;
      const tileNameFromPayload =
        typeof payload?.tile_name === "string" ? payload.tile_name : null;
      const tileNameFromBoard =
        tileIndex !== null
          ? boardPack?.tiles?.find((entry) => entry.index === tileIndex)?.name
          : null;
      const tileLabel =
        tileNameFromBoard ??
        tileNameFromPayload ??
        (tileIndex !== null ? `Tile ${tileIndex}` : "this tile");
      const price =
        typeof payload?.price === "number"
          ? payload.price
          : typeof payload?.price === "string"
            ? Number.parseInt(payload.price, 10)
            : null;
      const basePrice =
        typeof payload?.base_price === "number"
          ? payload.base_price
          : typeof payload?.base_price === "string"
            ? Number.parseInt(payload.base_price, 10)
            : null;
      const discountPctRaw =
        typeof payload?.property_purchase_discount_pct === "number"
          ? payload.property_purchase_discount_pct
          : typeof payload?.property_purchase_discount_pct === "string"
            ? Number.parseFloat(payload.property_purchase_discount_pct)
            : null;
      const discountPct =
        typeof discountPctRaw === "number" && Number.isFinite(discountPctRaw)
          ? Math.max(0, discountPctRaw)
          : 0;
      const macroName =
        typeof payload?.property_purchase_discount_macro_name === "string"
          ? payload.property_purchase_discount_macro_name
          : "Macro event";

      if (price !== null && discountPct > 0 && basePrice !== null) {
        return `Offer: Buy ${tileLabel} for ${formatMoney(price, currencyCode, currencySymbol)} · ${macroName} active: price reduced from ${formatMoney(basePrice, currencyCode, currencySymbol)} to ${formatMoney(price, currencyCode, currencySymbol)}.`;
      }

      return price !== null
        ? `Offer: Buy ${tileLabel} for ${formatMoney(price, currencyCode, currencySymbol)}`
        : `Offer: Buy ${tileLabel}`;
    }

    if (event.event_type === "DECLINE_PROPERTY") {
      const tileIndexRaw = payload?.tile_index;
      const tileIndex =
        typeof tileIndexRaw === "number"
          ? tileIndexRaw
          : typeof tileIndexRaw === "string"
            ? Number.parseInt(tileIndexRaw, 10)
            : null;
      const tileNameFromBoard =
        tileIndex !== null
          ? boardPack?.tiles?.find((entry) => entry.index === tileIndex)?.name
          : null;
      const tileLabel =
        tileNameFromBoard ?? (tileIndex !== null ? `Tile ${tileIndex}` : "tile");
      return `Auction: ${tileLabel}`;
    }

    if (event.event_type === "AUCTION_STARTED") {
      const tileIndexRaw = payload?.tile_index;
      const tileIndex =
        typeof tileIndexRaw === "number"
          ? tileIndexRaw
          : typeof tileIndexRaw === "string"
            ? Number.parseInt(tileIndexRaw, 10)
            : null;
      const tileNameFromBoard =
        tileIndex !== null
          ? boardPack?.tiles?.find((entry) => entry.index === tileIndex)?.name
          : null;
      const tileLabel =
        tileNameFromBoard ?? (tileIndex !== null ? `Tile ${tileIndex}` : "tile");
      const minIncrement =
        typeof payload?.min_increment === "number"
          ? payload.min_increment
          : typeof payload?.min_increment === "string"
            ? Number.parseInt(payload.min_increment, 10)
            : null;
      return minIncrement !== null
        ? `Auction started for ${tileLabel} (min ${formatSignedMoney(minIncrement, currencyCode, currencySymbol)})`
        : `Auction started for ${tileLabel}`;
    }

    if (event.event_type === "AUCTION_BID") {
      const amount =
        typeof payload?.amount === "number"
          ? payload.amount
          : typeof payload?.amount === "string"
            ? Number.parseInt(payload.amount, 10)
            : null;
      const playerId =
        typeof payload?.player_id === "string" ? payload.player_id : null;
      const playerName =
        players.find((player) => player.id === playerId)?.display_name ??
        "Player";
      const tileIndexRaw = payload?.tile_index;
      const tileIndex =
        typeof tileIndexRaw === "number"
          ? tileIndexRaw
          : typeof tileIndexRaw === "string"
            ? Number.parseInt(tileIndexRaw, 10)
            : null;
      const tileNameFromBoard =
        tileIndex !== null
          ? boardPack?.tiles?.find((entry) => entry.index === tileIndex)?.name
          : null;
      const tileLabel =
        tileNameFromBoard ?? (tileIndex !== null ? `Tile ${tileIndex}` : "tile");
      return amount !== null
        ? `${playerName} bid ${formatMoney(amount, currencyCode, currencySymbol)} on ${tileLabel}`
        : `${playerName} bid on ${tileLabel}`;
    }

    if (event.event_type === "AUCTION_PASS") {
      const playerId =
        typeof payload?.player_id === "string" ? payload.player_id : null;
      const playerName =
        players.find((player) => player.id === playerId)?.display_name ??
        "Player";
      const tileIndexRaw = payload?.tile_index;
      const tileIndex =
        typeof tileIndexRaw === "number"
          ? tileIndexRaw
          : typeof tileIndexRaw === "string"
            ? Number.parseInt(tileIndexRaw, 10)
            : null;
      const tileNameFromBoard =
        tileIndex !== null
          ? boardPack?.tiles?.find((entry) => entry.index === tileIndex)?.name
          : null;
      const tileLabel =
        tileNameFromBoard ?? (tileIndex !== null ? `Tile ${tileIndex}` : "tile");
      const isAuto = payload?.auto === true;
      return isAuto
        ? `${playerName} auto-passed on ${tileLabel}`
        : `${playerName} passed on ${tileLabel}`;
    }

    if (event.event_type === "AUCTION_WON") {
      const winnerId =
        typeof payload?.winner_id === "string" ? payload.winner_id : null;
      const winnerName =
        players.find((player) => player.id === winnerId)?.display_name ??
        "Player";
      const amount =
        typeof payload?.amount === "number"
          ? payload.amount
          : typeof payload?.amount === "string"
            ? Number.parseInt(payload.amount, 10)
            : null;
      const tileIndexRaw = payload?.tile_index;
      const tileIndex =
        typeof tileIndexRaw === "number"
          ? tileIndexRaw
          : typeof tileIndexRaw === "string"
            ? Number.parseInt(tileIndexRaw, 10)
            : null;
      const tileNameFromBoard =
        tileIndex !== null
          ? boardPack?.tiles?.find((entry) => entry.index === tileIndex)?.name
          : null;
      const tileLabel =
        tileNameFromBoard ?? (tileIndex !== null ? `Tile ${tileIndex}` : "tile");
      return amount !== null
        ? `${winnerName} won ${tileLabel} for ${formatMoney(amount, currencyCode, currencySymbol)}`
        : `${winnerName} won ${tileLabel}`;
    }

    if (event.event_type === "AUCTION_SKIPPED") {
      const tileIndexRaw = payload?.tile_index;
      const tileIndex =
        typeof tileIndexRaw === "number"
          ? tileIndexRaw
          : typeof tileIndexRaw === "string"
            ? Number.parseInt(tileIndexRaw, 10)
            : null;
      const tileNameFromBoard =
        tileIndex !== null
          ? boardPack?.tiles?.find((entry) => entry.index === tileIndex)?.name
          : null;
      const tileLabel =
        tileNameFromBoard ?? (tileIndex !== null ? `Tile ${tileIndex}` : "tile");
      return `Auction skipped for ${tileLabel}`;
    }

    if (event.event_type === "PAY_RENT") {
      const tileIndexRaw = payload?.tile_index;
      const tileIndex =
        typeof tileIndexRaw === "number"
          ? tileIndexRaw
          : typeof tileIndexRaw === "string"
            ? Number.parseInt(tileIndexRaw, 10)
            : null;
      const tileNameFromBoard =
        tileIndex !== null
          ? boardPack?.tiles?.find((entry) => entry.index === tileIndex)?.name
          : null;
      const tileLabel =
        tileNameFromBoard ?? (tileIndex !== null ? `Tile ${tileIndex}` : "tile");
      const rentAmount =
        typeof payload?.amount === "number"
          ? payload.amount
          : typeof payload?.amount === "string"
            ? Number.parseInt(payload.amount, 10)
            : null;
      const ownerId =
        typeof payload?.to_player_id === "string" ? payload.to_player_id : null;
      const ownerName =
        players.find((player) => player.id === ownerId)?.display_name ??
        "Player";
      const diceTotal =
        typeof payload?.dice_total === "number"
          ? payload.dice_total
          : typeof payload?.dice_total === "string"
            ? Number.parseInt(payload.dice_total, 10)
            : null;
      const multiplier =
        typeof payload?.multiplier === "number"
          ? payload.multiplier
          : typeof payload?.multiplier === "string"
            ? Number.parseInt(payload.multiplier, 10)
            : null;
      const rentType =
        typeof payload?.rent_type === "string" ? payload.rent_type : null;
      const detailLabel =
        rentType === "UTILITY" && diceTotal !== null && multiplier !== null
          ? ` (dice ${diceTotal} × ${multiplier})`
          : "";
      const rentMultiplierTotal = parseNumber(payload?.rent_multiplier_total);
      const macroLabel =
        rentMultiplierTotal !== null && rentMultiplierTotal !== 1
          ? ` (macro ×${rentMultiplierTotal.toFixed(2)})`
          : "";

      return rentAmount !== null
        ? `Paid ${formatMoney(rentAmount, currencyCode, currencySymbol)} rent to ${ownerName} (${tileLabel})${detailLabel}${macroLabel}`
        : `Paid rent to ${ownerName} (${tileLabel})${macroLabel}`;
    }

    if (event.event_type === "RENT_SKIPPED_COLLATERAL") {
      const tileIndexRaw = payload?.tile_index;
      const tileIndex =
        typeof tileIndexRaw === "number"
          ? tileIndexRaw
          : typeof tileIndexRaw === "string"
            ? Number.parseInt(tileIndexRaw, 10)
            : null;
      const tileNameFromBoard =
        tileIndex !== null
          ? boardPack?.tiles?.find((entry) => entry.index === tileIndex)?.name
          : null;
      const tileLabel =
        tileNameFromBoard ?? (tileIndex !== null ? `Tile ${tileIndex}` : "tile");
      return `Rent skipped on ${tileLabel} (collateralized)`;
    }

    if (event.event_type === "OIL_RAIL_SYNERGY_PAYOUT") {
      const playerId =
        typeof payload?.player_id === "string" ? payload.player_id : null;
      const playerName =
        players.find((player) => player.id === playerId)?.display_name ??
        "Player";
      const payout = parseNumber(payload?.payout);
      const refineryCount = parseNumber(payload?.oil_refinery_count);
      const payoutLabel =
        payout !== null ? formatMoney(payout, currencyCode, currencySymbol) : null;
      const refineryLabel =
        refineryCount !== null ? ` (${refineryCount} oil site${refineryCount === 1 ? "" : "s"})` : "";
      return payoutLabel
        ? `${playerName} received ${payoutLabel} Oil ↔ Railroad synergy${refineryLabel}`
        : `${playerName} received Oil ↔ Railroad synergy${refineryLabel}`;
    }

    if (event.event_type === "VERTICAL_INTEGRATION_BONUS") {
      const ownerId =
        typeof payload?.railroad_owner_player_id === "string"
          ? payload.railroad_owner_player_id
          : null;
      const ownerName =
        players.find((player) => player.id === ownerId)?.display_name ??
        "Player";
      const payout = parseNumber(payload?.payout);
      const payoutLabel =
        payout !== null ? formatMoney(payout, currencyCode, currencySymbol) : null;
      return payoutLabel
        ? `${ownerName} received ${payoutLabel} Vertical Integration Bonus`
        : `${ownerName} received Vertical Integration Bonus`;
    }

    if (event.event_type === "COAL_UTILITY_SYNERGY_PAYOUT") {
      const playerId =
        typeof payload?.player_id === "string" ? payload.player_id : null;
      const playerName =
        players.find((player) => player.id === playerId)?.display_name ??
        "Player";
      const payout = parseNumber(payload?.payout);
      const coalSiteCount = parseNumber(payload?.coal_site_count);
      const payoutLabel =
        payout !== null ? formatMoney(payout, currencyCode, currencySymbol) : null;
      const coalSiteLabel =
        coalSiteCount !== null
          ? ` (${coalSiteCount} power plant site${coalSiteCount === 1 ? "" : "s"})`
          : "";
      return payoutLabel
        ? `${playerName} received ${payoutLabel} Coal ↔ Electric Utility synergy${coalSiteLabel}`
        : `${playerName} received Coal ↔ Electric Utility synergy${coalSiteLabel}`;
    }

    if (event.event_type === "COAL_VERTICAL_INTEGRATION_BONUS") {
      const ownerId =
        typeof payload?.electric_utility_owner_player_id === "string"
          ? payload.electric_utility_owner_player_id
          : null;
      const ownerName =
        players.find((player) => player.id === ownerId)?.display_name ??
        "Player";
      const payout = parseNumber(payload?.payout);
      const payoutLabel =
        payout !== null ? formatMoney(payout, currencyCode, currencySymbol) : null;
      return payoutLabel
        ? `${ownerName} received ${payoutLabel} Coal Vertical Integration Bonus`
        : `${ownerName} received Coal Vertical Integration Bonus`;
    }

    if (event.event_type === "WATER_UTILITY_SYNERGY_PAYOUT") {
      const playerId =
        typeof payload?.player_id === "string" ? payload.player_id : null;
      const playerName =
        players.find((player) => player.id === playerId)?.display_name ??
        "Player";
      const payout = parseNumber(payload?.payout);
      const waterSiteCount = parseNumber(payload?.water_site_count);
      const payoutLabel =
        payout !== null ? formatMoney(payout, currencyCode, currencySymbol) : null;
      const waterSiteLabel =
        waterSiteCount !== null
          ? ` (${waterSiteCount} water reservoir site${waterSiteCount === 1 ? "" : "s"})`
          : "";
      return payoutLabel
        ? `${playerName} received ${payoutLabel} Water ↔ Water Utility synergy${waterSiteLabel}`
        : `${playerName} received Water ↔ Water Utility synergy${waterSiteLabel}`;
    }

    if (event.event_type === "WATER_VERTICAL_INTEGRATION_BONUS") {
      const ownerId =
        typeof payload?.water_utility_owner_player_id === "string"
          ? payload.water_utility_owner_player_id
          : null;
      const ownerName =
        players.find((player) => player.id === ownerId)?.display_name ??
        "Player";
      const payout = parseNumber(payload?.payout);
      const payoutLabel =
        payout !== null ? formatMoney(payout, currencyCode, currencySymbol) : null;
      return payoutLabel
        ? `${ownerName} received ${payoutLabel} Water Vertical Integration Bonus`
        : `${ownerName} received Water Vertical Integration Bonus`;
    }

    if (event.event_type === "COLLATERAL_LOAN_TAKEN") {
      const tileIndexRaw = payload?.tile_index;
      const tileIndex =
        typeof tileIndexRaw === "number"
          ? tileIndexRaw
          : typeof tileIndexRaw === "string"
            ? Number.parseInt(tileIndexRaw, 10)
            : null;
      const tileNameFromBoard =
        tileIndex !== null
          ? boardPack?.tiles?.find((entry) => entry.index === tileIndex)?.name
          : null;
      const tileLabel =
        tileNameFromBoard ?? (tileIndex !== null ? `Tile ${tileIndex}` : "tile");
      const principal =
        typeof payload?.principal === "number"
          ? payload.principal
          : typeof payload?.principal === "string"
            ? Number.parseInt(payload.principal, 10)
            : null;
      const payment =
        typeof payload?.payment_per_turn === "number"
          ? payload.payment_per_turn
          : typeof payload?.payment_per_turn === "string"
            ? Number.parseInt(payload.payment_per_turn, 10)
            : null;
      const termTurns =
        typeof payload?.term_turns === "number"
          ? payload.term_turns
          : typeof payload?.term_turns === "string"
            ? Number.parseInt(payload.term_turns, 10)
            : null;
      const principalLabel =
        principal !== null ? ` for ${formatMoney(principal, currencyCode, currencySymbol)}` : "";
      const paymentLabel =
        payment !== null && termTurns !== null
          ? ` · ${formatMoney(payment, currencyCode, currencySymbol)}/turn × ${termTurns}`
          : "";
      return `Collateral loan on ${tileLabel}${principalLabel}${paymentLabel}`;
    }

    if (event.event_type === "COLLATERAL_LOAN_PAYMENT") {
      const tileIndexRaw = payload?.tile_index;
      const tileIndex =
        typeof tileIndexRaw === "number"
          ? tileIndexRaw
          : typeof tileIndexRaw === "string"
            ? Number.parseInt(tileIndexRaw, 10)
            : null;
      const tileNameFromBoard =
        tileIndex !== null
          ? boardPack?.tiles?.find((entry) => entry.index === tileIndex)?.name
          : null;
      const tileLabel =
        tileNameFromBoard ?? (tileIndex !== null ? `Tile ${tileIndex}` : "tile");
      const payment =
        typeof payload?.amount === "number"
          ? payload.amount
          : typeof payload?.amount === "string"
            ? Number.parseInt(payload.amount, 10)
            : null;
      const turnsRemaining = getTurnsRemainingFromPayload(payload);
      if (payment !== null && turnsRemaining !== null) {
        return `Loan payment ${formatMoney(payment, currencyCode, currencySymbol)} on ${tileLabel} · ${turnsRemaining} turns left`;
      }
      if (payment !== null) {
        return `Loan payment ${formatMoney(payment, currencyCode, currencySymbol)} on ${tileLabel}`;
      }
      return `Loan payment on ${tileLabel}`;
    }

    if (event.event_type === "COLLATERAL_LOAN_PAID") {
      const tileIndexRaw = payload?.tile_index;
      const tileIndex =
        typeof tileIndexRaw === "number"
          ? tileIndexRaw
          : typeof tileIndexRaw === "string"
            ? Number.parseInt(tileIndexRaw, 10)
            : null;
      const tileNameFromBoard =
        tileIndex !== null
          ? boardPack?.tiles?.find((entry) => entry.index === tileIndex)?.name
          : null;
      const tileLabel =
        tileNameFromBoard ?? (tileIndex !== null ? `Tile ${tileIndex}` : "tile");
      return `Loan paid off on ${tileLabel}`;
    }

    if (event.event_type === "LOAN_PAID_OFF") {
      const tileIndexRaw = payload?.tile_index;
      const tileIndex =
        typeof tileIndexRaw === "number"
          ? tileIndexRaw
          : typeof tileIndexRaw === "string"
            ? Number.parseInt(tileIndexRaw, 10)
            : null;
      const tileNameFromBoard =
        tileIndex !== null
          ? boardPack?.tiles?.find((entry) => entry.index === tileIndex)?.name
          : null;
      const tileLabel =
        tileNameFromBoard ?? (tileIndex !== null ? `Tile ${tileIndex}` : "tile");
      const amount =
        typeof payload?.amount === "number"
          ? payload.amount
          : typeof payload?.amount === "string"
            ? Number.parseInt(payload.amount, 10)
            : null;
      if (amount !== null) {
        return `Loan paid off early on ${tileLabel} for ${formatMoney(amount, currencyCode, currencySymbol)}`;
      }
      return `Loan paid off early on ${tileLabel}`;
    }

    if (event.event_type === "PROPERTY_SOLD_TO_MARKET") {
      const tileIndexRaw = payload?.tile_index;
      const tileIndex =
        typeof tileIndexRaw === "number"
          ? tileIndexRaw
          : typeof tileIndexRaw === "string"
            ? Number.parseInt(tileIndexRaw, 10)
            : null;
      const tileNameFromBoard =
        tileIndex !== null
          ? boardPack?.tiles?.find((entry) => entry.index === tileIndex)?.name
          : null;
      const tileLabel =
        tileNameFromBoard ?? (tileIndex !== null ? `Tile ${tileIndex}` : "tile");
      const playerId =
        typeof payload?.player_id === "string" ? payload.player_id : null;
      const playerName =
        players.find((player) => player.id === playerId)?.display_name ??
        "Player";
      const payout =
        typeof payload?.payout === "number"
          ? payload.payout
          : typeof payload?.payout === "string"
            ? Number.parseInt(payload.payout, 10)
            : null;
      return payout !== null
        ? `${playerName} sold ${tileLabel} to market for ${formatMoney(payout, currencyCode, currencySymbol)}`
        : `${playerName} sold ${tileLabel} to market`;
    }

    if (event.event_type === "PROPERTY_DEFAULTED") {
      const tileIndexRaw = payload?.tile_index;
      const tileIndex =
        typeof tileIndexRaw === "number"
          ? tileIndexRaw
          : typeof tileIndexRaw === "string"
            ? Number.parseInt(tileIndexRaw, 10)
            : null;
      const tileNameFromBoard =
        tileIndex !== null
          ? boardPack?.tiles?.find((entry) => entry.index === tileIndex)?.name
          : null;
      const tileLabel =
        tileNameFromBoard ?? (tileIndex !== null ? `Tile ${tileIndex}` : "tile");
      const playerId =
        typeof payload?.player_id === "string" ? payload.player_id : null;
      const playerName =
        players.find((player) => player.id === playerId)?.display_name ??
        "Player";
      return `${playerName} defaulted on ${tileLabel}`;
    }

    if (event.event_type === "PAY_TAX") {
      const tileIndexRaw = payload?.tile_index;
      const tileIndex =
        typeof tileIndexRaw === "number"
          ? tileIndexRaw
          : typeof tileIndexRaw === "string"
            ? Number.parseInt(tileIndexRaw, 10)
            : null;
      const tileNameFromBoard =
        tileIndex !== null
          ? boardPack?.tiles?.find((entry) => entry.index === tileIndex)?.name
          : null;
      const tileLabel =
        tileNameFromBoard ?? (tileIndex !== null ? `Tile ${tileIndex}` : "tile");
      const taxAmount =
        typeof payload?.amount === "number"
          ? payload.amount
          : typeof payload?.amount === "string"
            ? Number.parseInt(payload.amount, 10)
            : null;
      const payerName =
        typeof payload?.payer_display_name === "string"
          ? payload.payer_display_name
          : "Player";

      return taxAmount !== null
        ? `${payerName} paid ${formatMoney(taxAmount, currencyCode, currencySymbol)} tax (${tileLabel})`
        : `${payerName} paid tax (${tileLabel})`;
    }

    if (event.event_type === "BANKRUPTCY") {
      const playerId =
        typeof payload?.player_id === "string" ? payload.player_id : null;
      const playerName =
        players.find((player) => player.id === playerId)?.display_name ??
        "Player";
      const reason =
        typeof payload?.reason === "string" ? payload.reason : "PAYMENT";
      const returnedIds = Array.isArray(payload?.returned_property_ids)
        ? payload.returned_property_ids
        : [];
      const propertyCount =
        returnedIds.length > 0 ? ` (${returnedIds.length} properties)` : "";
      return `${playerName} went bankrupt (${reason})${propertyCount}`;
    }

    if (event.event_type === "JAIL_PAY_FINE") {
      const fineAmount =
        typeof payload?.amount === "number"
          ? payload.amount
          : typeof payload?.amount === "string"
            ? Number.parseInt(payload.amount, 10)
            : null;
      const playerName =
        typeof payload?.player_name === "string"
          ? payload.player_name
          : "Player";
      return fineAmount !== null
        ? `${playerName} paid ${formatMoney(fineAmount, currencyCode, currencySymbol)} to get out of jail`
        : `${playerName} paid a jail fine`;
    }

    if (event.event_type === "JAIL_DOUBLES_SUCCESS") {
      const dice = Array.isArray(payload?.dice) ? payload?.dice : null;
      const diceValues =
        dice && dice.length >= 2 && dice.every((value) => typeof value === "number")
          ? dice.slice(0, 2)
          : null;
      const playerName =
        typeof payload?.player_name === "string"
          ? payload.player_name
          : "Player";
      return diceValues
        ? `${playerName} rolled doubles to leave jail (${diceValues[0]} + ${diceValues[1]})`
        : `${playerName} rolled doubles to leave jail`;
    }

    if (event.event_type === "JAIL_DOUBLES_FAIL") {
      const dice = Array.isArray(payload?.dice) ? payload?.dice : null;
      const diceValues =
        dice && dice.length >= 2 && dice.every((value) => typeof value === "number")
          ? dice.slice(0, 2)
          : null;
      const turnsRemaining = getTurnsRemainingFromPayload(payload);
      const playerName =
        typeof payload?.player_name === "string"
          ? payload.player_name
          : "Player";
      if (diceValues && turnsRemaining !== null) {
        return `${playerName} missed doubles (${diceValues[0]} + ${diceValues[1]}). Turns remaining: ${turnsRemaining}`;
      }
      if (diceValues) {
        return `${playerName} missed doubles (${diceValues[0]} + ${diceValues[1]})`;
      }
      return `${playerName} missed doubles in jail`;
    }

    if (event.event_type === "GO_TO_JAIL") {
      const fromIndexRaw = payload?.from_tile_index;
      const fromIndex =
        typeof fromIndexRaw === "number"
          ? fromIndexRaw
          : typeof fromIndexRaw === "string"
            ? Number.parseInt(fromIndexRaw, 10)
            : null;
      const toIndexRaw = payload?.to_jail_tile_index;
      const toIndexCandidate =
        toIndexRaw ?? (payload?.tile_index as typeof toIndexRaw);
      const toIndex =
        typeof toIndexCandidate === "number"
          ? toIndexCandidate
          : typeof toIndexCandidate === "string"
            ? Number.parseInt(toIndexCandidate, 10)
            : null;
      const fromLabel =
        fromIndex !== null ? `tile ${fromIndex}` : "Go To Jail";
      const toLabel = toIndex !== null ? `jail ${toIndex}` : "jail";
      const playerName =
        typeof payload?.display_name === "string"
          ? payload.display_name
          : typeof payload?.player_name === "string"
            ? payload.player_name
            : "Player";
      return `${playerName} went to ${toLabel} from ${fromLabel}`;
    }

    if (event.event_type === "GAME_OVER") {
      const winnerName =
        typeof payload?.winner_player_name === "string"
          ? payload.winner_player_name
          : "Player";
      return `Game over · Winner: ${winnerName}`;
    }

    return "Update received";

};

export const deriveWalletTransactions = (
  events: GameEventRow[],
  ctx: { players: EventFeedPlayer[]; boardPack: BoardPack | null; currentPlayerId?: string | null; ownershipByTile?: Record<number, { owner_player_id: string }> }
): TransactionRow[] => {
  const currentPlayerId = ctx.currentPlayerId ?? null;
  const players = ctx.players;
  const boardPack = ctx.boardPack;

  const getPlayerName = (playerId: string | null) =>
    players.find((player) => player.id === playerId)?.display_name ?? "Player";
  const getTileName = (tileIndex: number | null) => {
    if (tileIndex === null) {
      return "Tile";
    }
    return boardPack?.tiles?.find((entry) => entry.index === tileIndex)?.name ?? `Tile ${tileIndex}`;
  };

  const transactions: TransactionRow[] = [];

  for (const event of events) {
    const payload = event.payload && typeof event.payload === "object" ? event.payload : null;
    if (!payload) continue;
    if (event.event_type !== "CASH_DEBIT" && event.event_type !== "CASH_CREDIT") continue;
    const playerId = typeof payload.player_id === "string" ? payload.player_id : null;
    if (currentPlayerId && playerId !== currentPlayerId) continue;
    const reason = typeof payload.reason === "string" ? payload.reason : null;
    const amountRaw = parseNumber(payload.amount);
    if (amountRaw === null) continue;
    const debit = event.event_type === "CASH_DEBIT";
    const tileName = getTileName(parseNumber(payload.tile_index));
    const base = { id: event.id, ts: event.created_at ?? null, sourceEventVersion: event.version, sourceEventId: event.id };
    const actor = getPlayerName(playerId);
    const reasonLabel = reason ? reason.replaceAll("_", " ").toLowerCase() : "cash movement";
    transactions.push({
      ...base,
      title: `${actor} · ${debit ? 'Debit' : 'Credit'}`,
      subtitle: tileName !== 'Tile' ? `${reasonLabel} · ${tileName}` : reasonLabel,
      amount: debit ? -amountRaw : amountRaw,
    });
  }

  return transactions;
};
