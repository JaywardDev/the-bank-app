export type BoardPack = {
  id: string;
  displayName: string;
  properties: string[];
  eventDecks: string[];
  tiles: BoardTile[];
};

export type CardKind = "PAY" | "RECEIVE" | "MOVE_TO" | "MOVE_REL" | "GO_TO_JAIL";

export type CardDefinition = {
  id: string;
  title: string;
  kind: CardKind;
  payload: Record<string, number | string | boolean | null>;
};

export type BoardTileType =
  | "START"
  | "PROPERTY"
  | "TAX"
  | "EVENT"
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
};

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
    id: "community-hospital",
    title: "Pay hospital fees of $100",
    kind: "PAY",
    payload: { amount: 100 },
  },
];

export const boardPacks: BoardPack[] = [
  {
    id: "classic",
    displayName: "Classic",
    properties: [],
    eventDecks: [],
    tiles: [
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
    ],
  },
  {
    id: "monopoly-uk",
    displayName: "Monopoly UK",
    properties: [],
    eventDecks: [],
    tiles: [
      { index: 0, tile_id: "go", type: "START", name: "Go" },
      {
        index: 1,
        tile_id: "old-kent-road",
        type: "PROPERTY",
        name: "Old Kent Road",
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
        tile_id: "whitechapel-road",
        type: "PROPERTY",
        name: "Whitechapel Road",
        price: 60,
        baseRent: 4,
      },
      {
        index: 4,
        tile_id: "income-tax",
        type: "TAX",
        name: "Income Tax",
        taxAmount: 200,
      },
      {
        index: 5,
        tile_id: "kings-cross-station",
        type: "RAIL",
        name: "King's Cross Station",
        price: 200,
        baseRent: 25,
      },
      {
        index: 6,
        tile_id: "the-angel-islington",
        type: "PROPERTY",
        name: "The Angel Islington",
        price: 100,
        baseRent: 6,
      },
      { index: 7, tile_id: "chance-1", type: "EVENT", name: "Chance" },
      {
        index: 8,
        tile_id: "euston-road",
        type: "PROPERTY",
        name: "Euston Road",
        price: 100,
        baseRent: 6,
      },
      {
        index: 9,
        tile_id: "pentonville-road",
        type: "PROPERTY",
        name: "Pentonville Road",
        price: 120,
        baseRent: 8,
      },
      { index: 10, tile_id: "jail", type: "JAIL", name: "Jail" },
      {
        index: 11,
        tile_id: "pall-mall",
        type: "PROPERTY",
        name: "Pall Mall",
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
        tile_id: "whitehall",
        type: "PROPERTY",
        name: "Whitehall",
        price: 140,
        baseRent: 10,
      },
      {
        index: 14,
        tile_id: "northumberland-avenue",
        type: "PROPERTY",
        name: "Northumberland Avenue",
        price: 160,
        baseRent: 12,
      },
      {
        index: 15,
        tile_id: "marylebone-station",
        type: "RAIL",
        name: "Marylebone Station",
        price: 200,
        baseRent: 25,
      },
      {
        index: 16,
        tile_id: "bow-street",
        type: "PROPERTY",
        name: "Bow Street",
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
        tile_id: "marlborough-street",
        type: "PROPERTY",
        name: "Marlborough Street",
        price: 180,
        baseRent: 14,
      },
      {
        index: 19,
        tile_id: "vine-street",
        type: "PROPERTY",
        name: "Vine Street",
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
        tile_id: "strand",
        type: "PROPERTY",
        name: "Strand",
        price: 220,
        baseRent: 18,
      },
      { index: 22, tile_id: "chance-2", type: "EVENT", name: "Chance" },
      {
        index: 23,
        tile_id: "fleet-street",
        type: "PROPERTY",
        name: "Fleet Street",
        price: 220,
        baseRent: 18,
      },
      {
        index: 24,
        tile_id: "trafalgar-square",
        type: "PROPERTY",
        name: "Trafalgar Square",
        price: 240,
        baseRent: 20,
      },
      {
        index: 25,
        tile_id: "fenchurch-street-station",
        type: "RAIL",
        name: "Fenchurch St Station",
        price: 200,
        baseRent: 25,
      },
      {
        index: 26,
        tile_id: "leicester-square",
        type: "PROPERTY",
        name: "Leicester Square",
        price: 260,
        baseRent: 22,
      },
      {
        index: 27,
        tile_id: "coventry-street",
        type: "PROPERTY",
        name: "Coventry Street",
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
        tile_id: "piccadilly",
        type: "PROPERTY",
        name: "Piccadilly",
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
        tile_id: "regent-street",
        type: "PROPERTY",
        name: "Regent Street",
        price: 300,
        baseRent: 26,
      },
      {
        index: 32,
        tile_id: "oxford-street",
        type: "PROPERTY",
        name: "Oxford Street",
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
        tile_id: "bond-street",
        type: "PROPERTY",
        name: "Bond Street",
        price: 320,
        baseRent: 28,
      },
      {
        index: 35,
        tile_id: "liverpool-street-station",
        type: "RAIL",
        name: "Liverpool Street Station",
        price: 200,
        baseRent: 25,
      },
      { index: 36, tile_id: "chance-3", type: "EVENT", name: "Chance" },
      {
        index: 37,
        tile_id: "park-lane",
        type: "PROPERTY",
        name: "Park Lane",
        price: 350,
        baseRent: 35,
      },
      {
        index: 38,
        tile_id: "super-tax",
        type: "TAX",
        name: "Super Tax",
        taxAmount: 100,
      },
      {
        index: 39,
        tile_id: "mayfair",
        type: "PROPERTY",
        name: "Mayfair",
        price: 400,
        baseRent: 50,
      },
    ],
  },
  {
    id: "philippines",
    displayName: "Philippines",
    properties: [],
    eventDecks: [],
    tiles: [],
  },
  {
    id: "new-zealand",
    displayName: "New Zealand",
    properties: [],
    eventDecks: [],
    tiles: [],
  },
];

export const defaultBoardPackId = boardPacks[0]?.id ?? "classic";

export const getBoardPackById = (id?: string | null) =>
  boardPacks.find((pack) => pack.id === id) ?? boardPacks[0] ?? null;
