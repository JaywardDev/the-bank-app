import type {
  BoardPack,
  BoardPackEconomy,
  BoardTile,
  CardDefinition,
} from "../boardPacks";

type PropertyGroupConfig = {
  id: string;
  tileIds: string[];
  houseCost: number;
};

const DEFAULT_HOUSE_RENT_MULTIPLIERS = [1, 5, 15, 45, 80];

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
      entry.tileIds.includes(tile.tile_id)
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
      rentByHouses:
        tile.rentByHouses ?? buildRentByHouses(baseRent, rentMultipliers),
    };
  });

export const CLASSIC_UK_ECONOMY: BoardPackEconomy = {
  currency: {
    code: "GBP",
    symbol: "£",
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
  railRentByCount: [0, 25, 50, 100, 200],
  utilityRentMultipliers: { single: 4, double: 10 },
  startingBalance: 1500,
  passGoAmount: 200,
};

export const classicUkChanceCards: CardDefinition[] = [
  {
    id: "classic-uk-chance-advance-go",
    title: "Move to Go and collect salary",
    kind: "MOVE_TO",
    payload: { target_tile_id: "go" },
  },
  {
    id: "classic-uk-chance-pall-mall",
    title: "Advance to Pall Mall",
    kind: "MOVE_TO",
    payload: { target_tile_id: "pall-mall" },
  },
  {
    id: "classic-uk-chance-trafalgar",
    title: "Advance to Trafalgar Square",
    kind: "MOVE_TO",
    payload: { target_tile_id: "trafalgar-square" },
  },
  {
    id: "classic-uk-chance-mayfair",
    title: "Stroll to Mayfair",
    kind: "MOVE_TO",
    payload: { target_tile_id: "mayfair" },
  },
  {
    id: "classic-uk-chance-nearest-utility",
    title: "Head to the nearest utility",
    kind: "MOVE_TO",
    payload: { nearest_kind: "UTILITY" },
  },
  {
    id: "classic-uk-chance-nearest-railroad-1",
    title: "Proceed to the nearest station",
    kind: "MOVE_TO",
    payload: { nearest_kind: "RAILROAD" },
  },
  {
    id: "classic-uk-chance-nearest-railroad-2",
    title: "Catch the next station ahead",
    kind: "MOVE_TO",
    payload: { nearest_kind: "RAILROAD" },
  },
  {
    id: "classic-uk-chance-marylebone",
    title: "Take a trip to Marylebone Station",
    kind: "MOVE_TO",
    payload: { target_tile_id: "marylebone-station" },
  },
  {
    id: "classic-uk-chance-back-three",
    title: "Move back three spaces",
    kind: "MOVE_REL",
    payload: { relative_spaces: -3 },
  },
  {
    id: "classic-uk-chance-dividend",
    title: "Collect a dividend from the bank",
    kind: "RECEIVE",
    payload: { amount: 50 },
  },
  {
    id: "classic-uk-chance-building-loan",
    title: "Building loan matures",
    kind: "RECEIVE",
    payload: { amount: 150 },
  },
  {
    id: "classic-uk-chance-crossword",
    title: "Win a competition prize",
    kind: "RECEIVE",
    payload: { amount: 100 },
  },
  {
    id: "classic-uk-chance-speeding-fine",
    title: "Pay a speeding fine",
    kind: "PAY",
    payload: { amount: 15 },
  },
  {
    id: "classic-uk-chance-poor-tax",
    title: "Pay the poor tax",
    kind: "PAY",
    payload: { amount: 15 },
  },
  {
    id: "classic-uk-chance-go-to-jail",
    title: "Head straight to jail",
    kind: "GO_TO_JAIL",
    payload: {},
  },
  {
    id: "classic-uk-chance-get-out-of-jail",
    title: "Keep a get out of jail free pass",
    kind: "GET_OUT_OF_JAIL_FREE",
    payload: {},
  },
];

export const classicUkCommunityCards: CardDefinition[] = [
  {
    id: "classic-uk-community-advance-go",
    title: "Advance to Go and collect salary",
    kind: "MOVE_TO",
    payload: { target_tile_id: "go" },
  },
  {
    id: "classic-uk-community-bank-error",
    title: "Bank correction in your favor",
    kind: "RECEIVE",
    payload: { amount: 200 },
  },
  {
    id: "classic-uk-community-doctor",
    title: "Pay the doctor's bill",
    kind: "PAY",
    payload: { amount: 50 },
  },
  {
    id: "classic-uk-community-stock",
    title: "Collect proceeds from a stock sale",
    kind: "RECEIVE",
    payload: { amount: 50 },
  },
  {
    id: "classic-uk-community-holiday-fund",
    title: "Holiday fund matures",
    kind: "RECEIVE",
    payload: { amount: 100 },
  },
  {
    id: "classic-uk-community-tax-refund",
    title: "Receive an income tax refund",
    kind: "RECEIVE",
    payload: { amount: 20 },
  },
  {
    id: "classic-uk-community-life-insurance",
    title: "Life insurance matures",
    kind: "RECEIVE",
    payload: { amount: 100 },
  },
  {
    id: "classic-uk-community-hospital",
    title: "Pay hospital fees",
    kind: "PAY",
    payload: { amount: 100 },
  },
  {
    id: "classic-uk-community-school-fees",
    title: "Pay school fees",
    kind: "PAY",
    payload: { amount: 50 },
  },
  {
    id: "classic-uk-community-consultancy",
    title: "Receive a consultancy fee",
    kind: "RECEIVE",
    payload: { amount: 25 },
  },
  {
    id: "classic-uk-community-inherit",
    title: "Receive an inheritance",
    kind: "RECEIVE",
    payload: { amount: 100 },
  },
  {
    id: "classic-uk-community-beauty-contest",
    title: "Collect a contest prize",
    kind: "RECEIVE",
    payload: { amount: 10 },
  },
  {
    id: "classic-uk-community-get-out-of-jail",
    title: "Keep a get out of jail free pass",
    kind: "GET_OUT_OF_JAIL_FREE",
    payload: {},
  },
  {
    id: "classic-uk-community-go-to-jail",
    title: "Go directly to jail",
    kind: "GO_TO_JAIL",
    payload: {},
  },
  {
    id: "classic-uk-community-birthday",
    title: "Receive a birthday gift from the bank",
    kind: "RECEIVE",
    payload: { amount: 50 },
  },
  {
    id: "classic-uk-community-street-repairs",
    title: "Pay for neighborhood repairs",
    kind: "PAY",
    payload: { amount: 40 },
  },
];

export const CLASSIC_UK_PROPERTY_GROUPS: PropertyGroupConfig[] = [
  { id: "brown", houseCost: 50, tileIds: ["old-kent-road", "whitechapel-road"] },
  {
    id: "light-blue",
    houseCost: 50,
    tileIds: ["the-angel-islington", "euston-road", "pentonville-road"],
  },
  { id: "pink", houseCost: 100, tileIds: ["pall-mall", "whitehall", "northumberland-avenue"] },
  {
    id: "orange",
    houseCost: 100,
    tileIds: ["bow-street", "marlborough-street", "vine-street"],
  },
  { id: "red", houseCost: 150, tileIds: ["strand", "fleet-street", "trafalgar-square"] },
  { id: "yellow", houseCost: 150, tileIds: ["leicester-square", "coventry-street", "piccadilly"] },
  { id: "green", houseCost: 200, tileIds: ["regent-street", "oxford-street", "bond-street"] },
  { id: "dark-blue", houseCost: 200, tileIds: ["park-lane", "mayfair"] },
];

export const classicUkBoardPack: BoardPack = {
  id: "classic-uk",
  displayName: "Classic (UK)",
  properties: [],
  economy: CLASSIC_UK_ECONOMY,
  eventDecks: {
    chance: classicUkChanceCards,
    community: classicUkCommunityCards,
  },
  tiles: applyPropertyGroupConfig([
    { index: 0, tile_id: "go", type: "START", name: "Go" },
    { index: 1, tile_id: "old-kent-road", type: "PROPERTY", name: "Old Kent Road", price: 60, baseRent: 2 },
    { index: 2, tile_id: "community-chest-1", type: "EVENT", name: "Community Chest" },
    { index: 3, tile_id: "whitechapel-road", type: "PROPERTY", name: "Whitechapel Road", price: 60, baseRent: 4 },
    { index: 4, tile_id: "income-tax", type: "TAX", name: "Income Tax", taxAmount: 200 },
    { index: 5, tile_id: "kings-cross-station", type: "RAIL", name: "King's Cross Station", price: 200, baseRent: 25 },
    { index: 6, tile_id: "the-angel-islington", type: "PROPERTY", name: "The Angel Islington", price: 100, baseRent: 6 },
    { index: 7, tile_id: "chance-1", type: "EVENT", name: "Chance" },
    { index: 8, tile_id: "euston-road", type: "PROPERTY", name: "Euston Road", price: 100, baseRent: 6 },
    { index: 9, tile_id: "pentonville-road", type: "PROPERTY", name: "Pentonville Road", price: 120, baseRent: 8 },
    { index: 10, tile_id: "jail", type: "JAIL", name: "Jail" },
    { index: 11, tile_id: "pall-mall", type: "PROPERTY", name: "Pall Mall", price: 140, baseRent: 10 },
    { index: 12, tile_id: "electric-company", type: "UTILITY", name: "Electric Company", price: 150 },
    { index: 13, tile_id: "whitehall", type: "PROPERTY", name: "Whitehall", price: 140, baseRent: 10 },
    { index: 14, tile_id: "northumberland-avenue", type: "PROPERTY", name: "Northumberland Avenue", price: 160, baseRent: 12 },
    { index: 15, tile_id: "marylebone-station", type: "RAIL", name: "Marylebone Station", price: 200, baseRent: 25 },
    { index: 16, tile_id: "bow-street", type: "PROPERTY", name: "Bow Street", price: 180, baseRent: 14 },
    { index: 17, tile_id: "community-chest-2", type: "EVENT", name: "Community Chest" },
    { index: 18, tile_id: "marlborough-street", type: "PROPERTY", name: "Marlborough Street", price: 180, baseRent: 14 },
    { index: 19, tile_id: "vine-street", type: "PROPERTY", name: "Vine Street", price: 200, baseRent: 16 },
    { index: 20, tile_id: "free-parking", type: "FREE_PARKING", name: "Free Parking" },
    { index: 21, tile_id: "strand", type: "PROPERTY", name: "Strand", price: 220, baseRent: 18 },
    { index: 22, tile_id: "chance-2", type: "EVENT", name: "Chance" },
    { index: 23, tile_id: "fleet-street", type: "PROPERTY", name: "Fleet Street", price: 220, baseRent: 18 },
    { index: 24, tile_id: "trafalgar-square", type: "PROPERTY", name: "Trafalgar Square", price: 240, baseRent: 20 },
    { index: 25, tile_id: "fenchurch-street-station", type: "RAIL", name: "Fenchurch St Station", price: 200, baseRent: 25 },
    { index: 26, tile_id: "leicester-square", type: "PROPERTY", name: "Leicester Square", price: 260, baseRent: 22 },
    { index: 27, tile_id: "coventry-street", type: "PROPERTY", name: "Coventry Street", price: 260, baseRent: 22 },
    { index: 28, tile_id: "water-works", type: "UTILITY", name: "Water Works", price: 150 },
    { index: 29, tile_id: "piccadilly", type: "PROPERTY", name: "Piccadilly", price: 280, baseRent: 24 },
    { index: 30, tile_id: "go-to-jail", type: "GO_TO_JAIL", name: "Go To Jail" },
    { index: 31, tile_id: "regent-street", type: "PROPERTY", name: "Regent Street", price: 300, baseRent: 26 },
    { index: 32, tile_id: "oxford-street", type: "PROPERTY", name: "Oxford Street", price: 300, baseRent: 26 },
    { index: 33, tile_id: "community-chest-3", type: "EVENT", name: "Community Chest" },
    { index: 34, tile_id: "bond-street", type: "PROPERTY", name: "Bond Street", price: 320, baseRent: 28 },
    { index: 35, tile_id: "liverpool-street-station", type: "RAIL", name: "Liverpool Street Station", price: 200, baseRent: 25 },
    { index: 36, tile_id: "chance-3", type: "EVENT", name: "Chance" },
    { index: 37, tile_id: "park-lane", type: "PROPERTY", name: "Park Lane", price: 350, baseRent: 35 },
    { index: 38, tile_id: "super-tax", type: "TAX", name: "Super Tax", taxAmount: 100 },
    { index: 39, tile_id: "mayfair", type: "PROPERTY", name: "Mayfair", price: 400, baseRent: 50 },
  ], CLASSIC_UK_PROPERTY_GROUPS, CLASSIC_UK_ECONOMY),
};
