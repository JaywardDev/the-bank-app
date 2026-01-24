export type BoardPack = {
  id: string;
  displayName: string;
  properties: string[];
  eventDecks: string[];
  tiles: BoardTile[];
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
};

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
      { index: 4, tile_id: "income-tax", type: "TAX", name: "Income Tax" },
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
      { index: 38, tile_id: "luxury-tax", type: "TAX", name: "Luxury Tax" },
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
