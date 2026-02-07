import { classicPhBoardPack } from "./boardpacks/classic-ph";
import { classicUkBoardPack } from "./boardpacks/classic-uk";
import type { MacroCardV1 } from "./macroDeckV1";

export { classicUkChanceCards, classicUkCommunityCards } from "./boardpacks/classic-uk";

export type BoardPack = {
  id: string;
  displayName: string;
  properties: string[];
  economy: BoardPackEconomy;
  macroDeck?: {
    id: string;
    name: string;
    cards: MacroCardV1[];
    draw: (lastCardId?: string) => MacroCardV1;
  };
  eventDecks?: EventDecks;
  tiles: BoardTile[];
};

export type BoardPackEconomy = {
  currency: {
    code: string;
    symbol: string;
  };
  houseRentMultipliersByGroup: Record<string, number[]>;
  hotelIncrementMultiplier: number;
  railRentByCount: number[];
  utilityRentMultipliers: {
    single: number;
    double: number;
  };
  utilityBaseAmount?: number;
  startingBalance?: number;
  passGoAmount?: number;
  jailFineAmount?: number;
  auctionMinIncrement?: number;
};

export type CardKind =
  | "PAY"
  | "RECEIVE"
  | "MOVE_TO"
  | "MOVE_REL"
  | "GO_TO_JAIL"
  | "GET_OUT_OF_JAIL_FREE";

export type CardNearestKind = "RAILROAD" | "UTILITY";

export type CardPayload = {
  amount?: number;
  tile_index?: number;
  target_tile_id?: string;
  nearest_kind?: CardNearestKind;
  spaces?: number;
  relative_spaces?: number;
  utility_roll_override?: boolean;
  [key: string]: number | string | boolean | null | undefined;
};

export type CardDefinition = {
  id: string;
  title: string;
  kind: CardKind;
  payload: CardPayload;
};

export type EventDecks = {
  chance: CardDefinition[];
  community: CardDefinition[];
};

export type BoardTileType =
  | "START"
  | "PROPERTY"
  | "TAX"
  | "EVENT"
  | "CHANCE"
  | "COMMUNITY_CHEST"
  | "JAIL"
  | "FREE_PARKING"
  | "GO_TO_JAIL"
  | "RAIL"
  | "UTILITY";

export type BoardTile = {
  index: number;
  tile_id: string;
  type: BoardTileType;
  name: string;
  price?: number;
  baseRent?: number;
  taxAmount?: number;
  colorGroup?: string;
  houseCost?: number;
  rentByHouses?: number[];
};

type PropertyGroupConfig = {
  id: string;
  tileIds: string[];
  houseCost: number;
};

const DEFAULT_HOUSE_RENT_MULTIPLIERS = [1, 5, 15, 45, 80];
const DEFAULT_RAIL_RENT_BY_COUNT = [0, 25, 50, 100, 200];
const DEFAULT_UTILITY_RENT_MULTIPLIERS = { single: 4, double: 10 };

const buildRentByHouses = (
  baseRent: number,
  multipliers: number[] = DEFAULT_HOUSE_RENT_MULTIPLIERS,
) => multipliers.map((multiplier) => baseRent * multiplier);

const applyPropertyGroupConfig = (
  tiles: BoardTile[],
  groups: PropertyGroupConfig[],
  economy: BoardPackEconomy,
) =>
  tiles.map((tile) => {
    if (tile.type !== "PROPERTY") {
      return tile;
    }
    const group = groups.find((entry) =>
      entry.tileIds.includes(tile.tile_id),
    );
    if (!group) {
      return tile;
    }
    const baseRent = tile.baseRent ?? 0;
    const rentMultipliers =
      economy.houseRentMultipliersByGroup[group.id] ??
      DEFAULT_HOUSE_RENT_MULTIPLIERS;
    return {
      ...tile,
      colorGroup: group.id,
      houseCost: group.houseCost,
      rentByHouses: tile.rentByHouses ??
        buildRentByHouses(baseRent, rentMultipliers),
    };
  });

const CLASSIC_US_ECONOMY: BoardPackEconomy = {
  currency: {
    code: "USD",
    symbol: "$",
  },
  houseRentMultipliersByGroup: {
    brown: [1, 5, 15, 45, 80],
    "light-blue": [1, 5, 14, 40, 70],
    pink: [1, 5, 13, 36, 62],
    orange: [1, 5, 12, 33, 56],
    red: [1, 5, 11, 30, 50],
    yellow: [1, 5, 10, 28, 45],
    green: [1, 5, 9, 24, 38],
    "dark-blue": [1, 5, 8, 22, 32],
  },
  hotelIncrementMultiplier: 1.25,
  railRentByCount: DEFAULT_RAIL_RENT_BY_COUNT,
  utilityRentMultipliers: DEFAULT_UTILITY_RENT_MULTIPLIERS,
  startingBalance: 1500,
  passGoAmount: 200,
  jailFineAmount: 50,
};

const NEW_ZEALAND_ECONOMY: BoardPackEconomy = {
  currency: {
    code: "NZD",
    symbol: "$",
  },
  houseRentMultipliersByGroup: {},
  hotelIncrementMultiplier: 1.25,
  railRentByCount: DEFAULT_RAIL_RENT_BY_COUNT,
  utilityRentMultipliers: DEFAULT_UTILITY_RENT_MULTIPLIERS,
};

export const DEFAULT_BOARD_PACK_ECONOMY = CLASSIC_US_ECONOMY;

export const chanceCards: CardDefinition[] = [
  {
    id: "chance-advance-go",
    title: "Advance to Go (Collect $200)",
    kind: "MOVE_TO",
    payload: { tile_index: 0 },
  },
  {
    id: "chance-dividend",
    title: "Bank pays you dividend of $50",
    kind: "RECEIVE",
    payload: { amount: 50 },
  },
  {
    id: "chance-go-to-jail",
    title: "Go to Jail",
    kind: "GO_TO_JAIL",
    payload: {},
  },
  {
    id: "chance-go-back",
    title: "Go back 3 spaces",
    kind: "MOVE_REL",
    payload: { spaces: -3 },
  },
  {
    id: "chance-poor-tax",
    title: "Pay poor tax of $15",
    kind: "PAY",
    payload: { amount: 15 },
  },
  {
    id: "chance-illinois",
    title: "Advance to Illinois Avenue",
    kind: "MOVE_TO",
    payload: { tile_index: 24 },
  },
];

export const communityCards: CardDefinition[] = [
  {
    id: "community-advance-go",
    title: "Advance to Go (Collect $200)",
    kind: "MOVE_TO",
    payload: { tile_index: 0 },
  },
  {
    id: "community-bank-error",
    title: "Bank error in your favor. Collect $200",
    kind: "RECEIVE",
    payload: { amount: 200 },
  },
  {
    id: "community-doctor",
    title: "Doctor's fees. Pay $50",
    kind: "PAY",
    payload: { amount: 50 },
  },
  {
    id: "community-go-to-jail",
    title: "Go to Jail",
    kind: "GO_TO_JAIL",
    payload: {},
  },
  {
    id: "community-stock",
    title: "From sale of stock you get $50",
    kind: "RECEIVE",
    payload: { amount: 50 },
  },
  {
    id: "community-get-out-of-jail-free",
    title: "Get Out of Jail Free",
    kind: "GET_OUT_OF_JAIL_FREE",
    payload: {},
  },
  {
    id: "community-hospital",
    title: "Pay hospital fees of $100",
    kind: "PAY",
    payload: { amount: 100 },
  },
];

export const classicUsChanceCards: CardDefinition[] = [
  {
    id: "classic-us-chance-advance-go",
    title: "Move to Go and collect salary",
    kind: "MOVE_TO",
    payload: { target_tile_id: "go" },
  },
  {
    id: "classic-us-chance-illinois",
    title: "Advance to Illinois Avenue",
    kind: "MOVE_TO",
    payload: { target_tile_id: "illinois-avenue" },
  },
  {
    id: "classic-us-chance-st-charles",
    title: "Advance to St. Charles Place",
    kind: "MOVE_TO",
    payload: { target_tile_id: "st-charles-place" },
  },
  {
    id: "classic-us-chance-nearest-utility",
    title: "Head to the nearest utility",
    kind: "MOVE_TO",
    payload: { nearest_kind: "UTILITY" },
  },
  {
    id: "classic-us-chance-nearest-railroad-1",
    title: "Proceed to the nearest railroad",
    kind: "MOVE_TO",
    payload: { nearest_kind: "RAILROAD" },
  },
  {
    id: "classic-us-chance-nearest-railroad-2",
    title: "Catch the next railroad ahead",
    kind: "MOVE_TO",
    payload: { nearest_kind: "RAILROAD" },
  },
  {
    id: "classic-us-chance-reading-railroad",
    title: "Travel to Reading Railroad",
    kind: "MOVE_TO",
    payload: { target_tile_id: "reading-railroad" },
  },
  {
    id: "classic-us-chance-boardwalk",
    title: "Stroll to Boardwalk",
    kind: "MOVE_TO",
    payload: { target_tile_id: "boardwalk" },
  },
  {
    id: "classic-us-chance-back-three",
    title: "Move back three spaces",
    kind: "MOVE_REL",
    payload: { relative_spaces: -3 },
  },
  {
    id: "classic-us-chance-dividend",
    title: "Collect a dividend from the bank",
    kind: "RECEIVE",
    payload: { amount: 50 },
  },
  {
    id: "classic-us-chance-building-loan",
    title: "Building loan matures",
    kind: "RECEIVE",
    payload: { amount: 150 },
  },
  {
    id: "classic-us-chance-crossword",
    title: "Win a competition prize",
    kind: "RECEIVE",
    payload: { amount: 100 },
  },
  {
    id: "classic-us-chance-speeding-fine",
    title: "Pay a speeding fine",
    kind: "PAY",
    payload: { amount: 15 },
  },
  {
    id: "classic-us-chance-poor-tax",
    title: "Pay the poor tax",
    kind: "PAY",
    payload: { amount: 15 },
  },
  {
    id: "classic-us-chance-go-to-jail",
    title: "Head straight to jail",
    kind: "GO_TO_JAIL",
    payload: {},
  },
  {
    id: "classic-us-chance-get-out-of-jail",
    title: "Keep a get out of jail free pass",
    kind: "GET_OUT_OF_JAIL_FREE",
    payload: {},
  },
];

export const classicUsCommunityCards: CardDefinition[] = [
  {
    id: "classic-us-community-advance-go",
    title: "Advance to Go and collect salary",
    kind: "MOVE_TO",
    payload: { target_tile_id: "go" },
  },
  {
    id: "classic-us-community-bank-error",
    title: "Bank correction in your favor",
    kind: "RECEIVE",
    payload: { amount: 200 },
  },
  {
    id: "classic-us-community-doctor",
    title: "Pay the doctor's bill",
    kind: "PAY",
    payload: { amount: 50 },
  },
  {
    id: "classic-us-community-stock",
    title: "Collect proceeds from a stock sale",
    kind: "RECEIVE",
    payload: { amount: 50 },
  },
  {
    id: "classic-us-community-holiday-fund",
    title: "Holiday fund matures",
    kind: "RECEIVE",
    payload: { amount: 100 },
  },
  {
    id: "classic-us-community-tax-refund",
    title: "Receive an income tax refund",
    kind: "RECEIVE",
    payload: { amount: 20 },
  },
  {
    id: "classic-us-community-life-insurance",
    title: "Life insurance matures",
    kind: "RECEIVE",
    payload: { amount: 100 },
  },
  {
    id: "classic-us-community-hospital",
    title: "Pay hospital fees",
    kind: "PAY",
    payload: { amount: 100 },
  },
  {
    id: "classic-us-community-school-fees",
    title: "Pay school fees",
    kind: "PAY",
    payload: { amount: 50 },
  },
  {
    id: "classic-us-community-consultancy",
    title: "Receive a consultancy fee",
    kind: "RECEIVE",
    payload: { amount: 25 },
  },
  {
    id: "classic-us-community-inherit",
    title: "Receive an inheritance",
    kind: "RECEIVE",
    payload: { amount: 100 },
  },
  {
    id: "classic-us-community-beauty-contest",
    title: "Collect a contest prize",
    kind: "RECEIVE",
    payload: { amount: 10 },
  },
  {
    id: "classic-us-community-get-out-of-jail",
    title: "Keep a get out of jail free pass",
    kind: "GET_OUT_OF_JAIL_FREE",
    payload: {},
  },
  {
    id: "classic-us-community-go-to-jail",
    title: "Go directly to jail",
    kind: "GO_TO_JAIL",
    payload: {},
  },
  {
    id: "classic-us-community-birthday",
    title: "Receive a birthday gift from the bank",
    kind: "RECEIVE",
    payload: { amount: 50 },
  },
  {
    id: "classic-us-community-street-repairs",
    title: "Pay for neighborhood repairs",
    kind: "PAY",
    payload: { amount: 40 },
  },
];

const CLASSIC_US_PROPERTY_GROUPS: PropertyGroupConfig[] = [
  {
    id: "brown",
    houseCost: 50,
    tileIds: ["mediterranean-avenue", "baltic-avenue"],
  },
  {
    id: "light-blue",
    houseCost: 50,
    tileIds: ["oriental-avenue", "vermont-avenue", "connecticut-avenue"],
  },
  {
    id: "pink",
    houseCost: 100,
    tileIds: ["st-charles-place", "states-avenue", "virginia-avenue"],
  },
  {
    id: "orange",
    houseCost: 100,
    tileIds: ["st-james-place", "tennessee-avenue", "new-york-avenue"],
  },
  {
    id: "red",
    houseCost: 150,
    tileIds: ["kentucky-avenue", "indiana-avenue", "illinois-avenue"],
  },
  {
    id: "yellow",
    houseCost: 150,
    tileIds: ["atlantic-avenue", "ventnor-avenue", "marvin-gardens"],
  },
  {
    id: "green",
    houseCost: 200,
    tileIds: ["pacific-avenue", "north-carolina-avenue", "pennsylvania-avenue"],
  },
  {
    id: "dark-blue",
    houseCost: 200,
    tileIds: ["park-place", "boardwalk"],
  },
];

export const boardPacks: BoardPack[] = [
  {
    id: "classic-us",
    displayName: "Classic (US)",
    properties: [],
    economy: CLASSIC_US_ECONOMY,
    eventDecks: {
      chance: classicUsChanceCards,
      community: classicUsCommunityCards,
    },
    tiles: applyPropertyGroupConfig([
      { index: 0, tile_id: "go", type: "START", name: "Go" },
      {
        index: 1,
        tile_id: "mediterranean-avenue",
        type: "PROPERTY",
        name: "Mediterranean Avenue",
        price: 60,
        baseRent: 2,
      },
      {
        index: 2,
        tile_id: "community-chest-1",
        type: "EVENT",
        name: "Community Chest",
      },
      {
        index: 3,
        tile_id: "baltic-avenue",
        type: "PROPERTY",
        name: "Baltic Avenue",
        price: 60,
        baseRent: 4,
      },
      {
        index: 4,
        tile_id: "income-tax",
        type: "TAX",
        name: "Income Tax",
        taxAmount: 100,
      },
      {
        index: 5,
        tile_id: "reading-railroad",
        type: "RAIL",
        name: "Reading Railroad",
        price: 200,
        baseRent: 25,
      },
      {
        index: 6,
        tile_id: "oriental-avenue",
        type: "PROPERTY",
        name: "Oriental Avenue",
        price: 100,
        baseRent: 6,
      },
      { index: 7, tile_id: "chance-1", type: "EVENT", name: "Chance" },
      {
        index: 8,
        tile_id: "vermont-avenue",
        type: "PROPERTY",
        name: "Vermont Avenue",
        price: 100,
        baseRent: 6,
      },
      {
        index: 9,
        tile_id: "connecticut-avenue",
        type: "PROPERTY",
        name: "Connecticut Avenue",
        price: 120,
        baseRent: 8,
      },
      { index: 10, tile_id: "jail", type: "JAIL", name: "Jail" },
      {
        index: 11,
        tile_id: "st-charles-place",
        type: "PROPERTY",
        name: "St. Charles Place",
        price: 140,
        baseRent: 10,
      },
      {
        index: 12,
        tile_id: "electric-company",
        type: "UTILITY",
        name: "Electric Company",
        price: 150,
      },
      {
        index: 13,
        tile_id: "states-avenue",
        type: "PROPERTY",
        name: "States Avenue",
        price: 140,
        baseRent: 10,
      },
      {
        index: 14,
        tile_id: "virginia-avenue",
        type: "PROPERTY",
        name: "Virginia Avenue",
        price: 160,
        baseRent: 12,
      },
      {
        index: 15,
        tile_id: "pennsylvania-railroad",
        type: "RAIL",
        name: "Pennsylvania Railroad",
        price: 200,
        baseRent: 25,
      },
      {
        index: 16,
        tile_id: "st-james-place",
        type: "PROPERTY",
        name: "St. James Place",
        price: 180,
        baseRent: 14,
      },
      {
        index: 17,
        tile_id: "community-chest-2",
        type: "EVENT",
        name: "Community Chest",
      },
      {
        index: 18,
        tile_id: "tennessee-avenue",
        type: "PROPERTY",
        name: "Tennessee Avenue",
        price: 180,
        baseRent: 14,
      },
      {
        index: 19,
        tile_id: "new-york-avenue",
        type: "PROPERTY",
        name: "New York Avenue",
        price: 200,
        baseRent: 16,
      },
      {
        index: 20,
        tile_id: "free-parking",
        type: "FREE_PARKING",
        name: "Free Parking",
      },
      {
        index: 21,
        tile_id: "kentucky-avenue",
        type: "PROPERTY",
        name: "Kentucky Avenue",
        price: 220,
        baseRent: 18,
      },
      { index: 22, tile_id: "chance-2", type: "EVENT", name: "Chance" },
      {
        index: 23,
        tile_id: "indiana-avenue",
        type: "PROPERTY",
        name: "Indiana Avenue",
        price: 220,
        baseRent: 18,
      },
      {
        index: 24,
        tile_id: "illinois-avenue",
        type: "PROPERTY",
        name: "Illinois Avenue",
        price: 240,
        baseRent: 20,
      },
      {
        index: 25,
        tile_id: "b-and-o-railroad",
        type: "RAIL",
        name: "B. & O. Railroad",
        price: 200,
        baseRent: 25,
      },
      {
        index: 26,
        tile_id: "atlantic-avenue",
        type: "PROPERTY",
        name: "Atlantic Avenue",
        price: 260,
        baseRent: 22,
      },
      {
        index: 27,
        tile_id: "ventnor-avenue",
        type: "PROPERTY",
        name: "Ventnor Avenue",
        price: 260,
        baseRent: 22,
      },
      {
        index: 28,
        tile_id: "water-works",
        type: "UTILITY",
        name: "Water Works",
        price: 150,
      },
      {
        index: 29,
        tile_id: "marvin-gardens",
        type: "PROPERTY",
        name: "Marvin Gardens",
        price: 280,
        baseRent: 24,
      },
      {
        index: 30,
        tile_id: "go-to-jail",
        type: "GO_TO_JAIL",
        name: "Go To Jail",
      },
      {
        index: 31,
        tile_id: "pacific-avenue",
        type: "PROPERTY",
        name: "Pacific Avenue",
        price: 300,
        baseRent: 26,
      },
      {
        index: 32,
        tile_id: "north-carolina-avenue",
        type: "PROPERTY",
        name: "North Carolina Avenue",
        price: 300,
        baseRent: 26,
      },
      {
        index: 33,
        tile_id: "community-chest-3",
        type: "EVENT",
        name: "Community Chest",
      },
      {
        index: 34,
        tile_id: "pennsylvania-avenue",
        type: "PROPERTY",
        name: "Pennsylvania Avenue",
        price: 320,
        baseRent: 28,
      },
      {
        index: 35,
        tile_id: "short-line",
        type: "RAIL",
        name: "Short Line",
        price: 200,
        baseRent: 25,
      },
      { index: 36, tile_id: "chance-3", type: "EVENT", name: "Chance" },
      {
        index: 37,
        tile_id: "park-place",
        type: "PROPERTY",
        name: "Park Place",
        price: 350,
        baseRent: 35,
      },
      {
        index: 38,
        tile_id: "luxury-tax",
        type: "TAX",
        name: "Luxury Tax",
        taxAmount: 200,
      },
      {
        index: 39,
        tile_id: "boardwalk",
        type: "PROPERTY",
        name: "Boardwalk",
        price: 400,
        baseRent: 50,
      },
    ], CLASSIC_US_PROPERTY_GROUPS, CLASSIC_US_ECONOMY),
  },
  classicUkBoardPack,
  classicPhBoardPack,
  {
    id: "new-zealand",
    displayName: "New Zealand",
    properties: [],
    economy: NEW_ZEALAND_ECONOMY,
    tiles: [],
  },
];

export const defaultBoardPackId = boardPacks[0]?.id ?? "classic";

export const getBoardPackById = (id?: string | null) =>
  boardPacks.find((pack) => pack.id === id) ?? boardPacks[0] ?? null;
