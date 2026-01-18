export type BoardPack = {
  id: string;
  displayName: string;
  properties: string[];
  eventDecks: string[];
};

export const boardPacks: BoardPack[] = [
  {
    id: "classic",
    displayName: "Classic",
    properties: [],
    eventDecks: [],
  },
  {
    id: "philippines",
    displayName: "Philippines",
    properties: [],
    eventDecks: [],
  },
  {
    id: "new-zealand",
    displayName: "New Zealand",
    properties: [],
    eventDecks: [],
  },
];

export const defaultBoardPackId = boardPacks[0]?.id ?? "classic";

export const getBoardPackById = (id?: string | null) =>
  boardPacks.find((pack) => pack.id === id) ?? boardPacks[0] ?? null;
