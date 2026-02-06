import type {
  BoardPack,
  BoardPackEconomy,
  BoardTile,
  CardDefinition,
} from "../boardPacks";
import { CLASSIC_UK_ECONOMY } from "./classic-uk";

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

const CLASSIC_PH_ECONOMY: BoardPackEconomy = {
  ...CLASSIC_UK_ECONOMY,
  currency: {
    code: "PHP",
    symbol: "₱",
  },
};

const CLASSIC_PH_PROPERTY_GROUPS: PropertyGroupConfig[] = [
  { id: "brown", houseCost: 50, tileIds: ["cavite", "bulacan"] },
  {
    id: "light-blue",
    houseCost: 50,
    tileIds: ["paranaque", "las-pinas", "muntinlupa"],
  },
  { id: "pink", houseCost: 100, tileIds: ["intramuros", "ermita", "malate"] },
  {
    id: "orange",
    houseCost: 100,
    tileIds: ["quezon-city", "pasig", "mandaluyong"],
  },
  { id: "red", houseCost: 150, tileIds: ["pasay", "marikina", "ortigas-center"] },
  { id: "yellow", houseCost: 150, tileIds: ["rockwell", "greenhills", "eastwood"] },
  {
    id: "green",
    houseCost: 200,
    tileIds: ["dasmarinas-village", "ayala-alabang", "mckinley-hills"],
  },
  { id: "dark-blue", houseCost: 200, tileIds: ["forbes-park", "bonifacio-high-street"] },
];

export const classicPhChanceCards: CardDefinition[] = [
  {
    id: "classic-ph-chance-advance-go",
    title: "Business Opportunity Opens — Advance to GO and collect salary",
    kind: "MOVE_TO",
    payload: { target_tile_id: "go" },
  },
  {
    id: "classic-ph-chance-intramuros",
    title: "Proceed to Intramuros",
    kind: "MOVE_TO",
    payload: { target_tile_id: "intramuros" },
  },
  {
    id: "classic-ph-chance-ortigas-center",
    title: "Advance to Ortigas Center",
    kind: "MOVE_TO",
    payload: { target_tile_id: "ortigas-center" },
  },
  {
    id: "classic-ph-chance-bonifacio-high-street",
    title: "Stroll to Bonifacio High Street",
    kind: "MOVE_TO",
    payload: { target_tile_id: "bonifacio-high-street" },
  },
  {
    id: "classic-ph-chance-nearest-utility",
    title: "Proceed to the nearest utility provider",
    kind: "MOVE_TO",
    payload: { nearest_kind: "UTILITY" },
  },
  {
    id: "classic-ph-chance-nearest-railroad-1",
    title: "Proceed to the nearest transport line",
    kind: "MOVE_TO",
    payload: { nearest_kind: "RAILROAD" },
  },
  {
    id: "classic-ph-chance-nearest-railroad-2",
    title: "Catch the next transport line ahead",
    kind: "MOVE_TO",
    payload: { nearest_kind: "RAILROAD" },
  },
  {
    id: "classic-ph-chance-lrt",
    title: "Take a trip to LRT",
    kind: "MOVE_TO",
    payload: { target_tile_id: "lrt" },
  },
  {
    id: "classic-ph-chance-back-three",
    title: "EDSA Traffic Jam — Move back three spaces",
    kind: "MOVE_REL",
    payload: { relative_spaces: -3 },
  },
  {
    id: "classic-ph-chance-dividend",
    title: "Investment Dividend Received",
    kind: "RECEIVE",
    payload: { amount: 400000 },
  },
  {
    id: "classic-ph-chance-building-loan",
    title: "Construction Project Completed",
    kind: "RECEIVE",
    payload: { amount: 1200000 },
  },
  {
    id: "classic-ph-chance-business-pitch",
    title: "You Won a Business Pitch",
    kind: "RECEIVE",
    payload: { amount: 800000 },
  },
  {
    id: "classic-ph-chance-traffic-violation",
    title: "Traffic Violation Fine",
    kind: "PAY",
    payload: { amount: 120000 },
  },
  {
    id: "classic-ph-chance-local-government-fee",
    title: "Local Government Fee",
    kind: "PAY",
    payload: { amount: 120000 },
  },
  {
    id: "classic-ph-chance-go-to-jail",
    title: "Caught in Legal Trouble — Go to Jail",
    kind: "GO_TO_JAIL",
    payload: {},
  },
  {
    id: "classic-ph-chance-get-out-of-jail",
    title: "Legal Connection — Get Out of Jail Free",
    kind: "GET_OUT_OF_JAIL_FREE",
    payload: {},
  },
];

export const classicPhCommunityCards: CardDefinition[] = [
  {
    id: "classic-ph-community-advance-go",
    title: "Barangay Clearance Completed — Advance to GO and collect salary",
    kind: "MOVE_TO",
    payload: { target_tile_id: "go" },
  },
  {
    id: "classic-ph-community-bank-adjustment",
    title: "Bank Adjustment in Your Favor",
    kind: "RECEIVE",
    payload: { amount: 1600000 },
  },
  {
    id: "classic-ph-community-clinic-consultation",
    title: "Clinic Consultation Fee",
    kind: "PAY",
    payload: { amount: 400000 },
  },
  {
    id: "classic-ph-community-stock-profit",
    title: "Stock Investment Profit",
    kind: "RECEIVE",
    payload: { amount: 400000 },
  },
  {
    id: "classic-ph-community-13th-month-bonus",
    title: "13th Month Bonus Released",
    kind: "RECEIVE",
    payload: { amount: 800000 },
  },
  {
    id: "classic-ph-community-tax-refund",
    title: "Tax Refund Processed",
    kind: "RECEIVE",
    payload: { amount: 160000 },
  },
  {
    id: "classic-ph-community-insurance-claim",
    title: "Insurance Claim Approved",
    kind: "RECEIVE",
    payload: { amount: 800000 },
  },
  {
    id: "classic-ph-community-hospital-expenses",
    title: "Hospital Expenses",
    kind: "PAY",
    payload: { amount: 800000 },
  },
  {
    id: "classic-ph-community-tuition-fee",
    title: "Tuition Fee Payment",
    kind: "PAY",
    payload: { amount: 400000 },
  },
  {
    id: "classic-ph-community-freelance-project",
    title: "Freelance Project Completed",
    kind: "RECEIVE",
    payload: { amount: 200000 },
  },
  {
    id: "classic-ph-community-inheritance",
    title: "Inheritance Received",
    kind: "RECEIVE",
    payload: { amount: 800000 },
  },
  {
    id: "classic-ph-community-local-contest",
    title: "Local Contest Prize",
    kind: "RECEIVE",
    payload: { amount: 80000 },
  },
  {
    id: "classic-ph-community-get-out-of-jail",
    title: "Bail / Legal Assistance — Get Out of Jail Free",
    kind: "GET_OUT_OF_JAIL_FREE",
    payload: {},
  },
  {
    id: "classic-ph-community-go-to-jail",
    title: "Legal Case Filed — Go to Jail",
    kind: "GO_TO_JAIL",
    payload: {},
  },
  {
    id: "classic-ph-community-birthday-angpao",
    title: "Birthday Angpao Received",
    kind: "RECEIVE",
    payload: { amount: 400000 },
  },
  {
    id: "classic-ph-community-home-maintenance",
    title: "Home Maintenance & Repairs",
    kind: "PAY",
    payload: { amount: 320000 },
  },
];

export const classicPhBoardPack: BoardPack = {
  id: "classic-ph",
  displayName: "Philippines",
  properties: [],
  economy: CLASSIC_PH_ECONOMY,
  eventDecks: {
    chance: classicPhChanceCards,
    community: classicPhCommunityCards,
  },
  tiles: applyPropertyGroupConfig([
    { index: 0, tile_id: "go", type: "START", name: "Go" },
    { index: 1, tile_id: "cavite", type: "PROPERTY", name: "Cavite", price: 480000, baseRent: 16000 },
    { index: 2, tile_id: "community-chest-1", type: "EVENT", name: "Community Chest" },
    { index: 3, tile_id: "bulacan", type: "PROPERTY", name: "Bulacan", price: 480000, baseRent: 32000 },
    { index: 4, tile_id: "income-tax", type: "TAX", name: "Income Tax", taxAmount: 200 },
    { index: 5, tile_id: "slex", type: "RAIL", name: "SLEX", price: 1600000, baseRent: 200000 },
    { index: 6, tile_id: "paranaque", type: "PROPERTY", name: "Parañaque", price: 800000, baseRent: 48000 },
    { index: 7, tile_id: "chance-1", type: "EVENT", name: "Chance" },
    { index: 8, tile_id: "las-pinas", type: "PROPERTY", name: "Las Piñas", price: 800000, baseRent: 48000 },
    { index: 9, tile_id: "muntinlupa", type: "PROPERTY", name: "Muntinlupa", price: 960000, baseRent: 64000 },
    { index: 10, tile_id: "jail", type: "JAIL", name: "Jail" },
    { index: 11, tile_id: "intramuros", type: "PROPERTY", name: "Intramuros", price: 1120000, baseRent: 80000 },
    { index: 12, tile_id: "meralco", type: "UTILITY", name: "MERALCO", price: 1200000 },
    { index: 13, tile_id: "ermita", type: "PROPERTY", name: "Ermita", price: 1120000, baseRent: 80000 },
    { index: 14, tile_id: "malate", type: "PROPERTY", name: "Malate", price: 1280000, baseRent: 96000 },
    { index: 15, tile_id: "lrt", type: "RAIL", name: "LRT", price: 1600000, baseRent: 200000 },
    { index: 16, tile_id: "quezon-city", type: "PROPERTY", name: "Quezon City", price: 1440000, baseRent: 112000 },
    { index: 17, tile_id: "community-chest-2", type: "EVENT", name: "Community Chest" },
    { index: 18, tile_id: "pasig", type: "PROPERTY", name: "Pasig", price: 1440000, baseRent: 112000 },
    { index: 19, tile_id: "mandaluyong", type: "PROPERTY", name: "Mandaluyong", price: 1600000, baseRent: 128000 },
    { index: 20, tile_id: "free-parking", type: "FREE_PARKING", name: "Free Parking" },
    { index: 21, tile_id: "pasay", type: "PROPERTY", name: "Pasay", price: 1760000, baseRent: 144000 },
    { index: 22, tile_id: "chance-2", type: "EVENT", name: "Chance" },
    { index: 23, tile_id: "marikina", type: "PROPERTY", name: "Marikina", price: 1760000, baseRent: 144000 },
    { index: 24, tile_id: "ortigas-center", type: "PROPERTY", name: "Ortigas Center", price: 1920000, baseRent: 160000 },
    { index: 25, tile_id: "nlex", type: "RAIL", name: "NLEX", price: 1600000, baseRent: 200000 },
    { index: 26, tile_id: "rockwell", type: "PROPERTY", name: "Rockwell", price: 2080000, baseRent: 176000 },
    { index: 27, tile_id: "greenhills", type: "PROPERTY", name: "Greenhills", price: 2080000, baseRent: 176000 },
    { index: 28, tile_id: "manila-water", type: "UTILITY", name: "Manila Water", price: 1200000 },
    { index: 29, tile_id: "eastwood", type: "PROPERTY", name: "Eastwood", price: 2240000, baseRent: 192000 },
    { index: 30, tile_id: "go-to-jail", type: "GO_TO_JAIL", name: "Go To Jail" },
    { index: 31, tile_id: "dasmarinas-village", type: "PROPERTY", name: "Dasmariñas Village", price: 2400000, baseRent: 208000 },
    { index: 32, tile_id: "ayala-alabang", type: "PROPERTY", name: "Ayala Alabang", price: 2400000, baseRent: 208000 },
    { index: 33, tile_id: "community-chest-3", type: "EVENT", name: "Community Chest" },
    { index: 34, tile_id: "mckinley-hills", type: "PROPERTY", name: "McKinley Hills", price: 2560000, baseRent: 224000 },
    { index: 35, tile_id: "mrt", type: "RAIL", name: "MRT", price: 1600000, baseRent: 200000 },
    { index: 36, tile_id: "chance-3", type: "EVENT", name: "Chance" },
    { index: 37, tile_id: "forbes-park", type: "PROPERTY", name: "Forbes Park", price: 2800000, baseRent: 280000 },
    { index: 38, tile_id: "super-tax", type: "TAX", name: "Super Tax", taxAmount: 100 },
    { index: 39, tile_id: "bonifacio-high-street", type: "PROPERTY", name: "Bonifacio High Street", price: 3200000, baseRent: 400000 },
  ], CLASSIC_PH_PROPERTY_GROUPS, CLASSIC_PH_ECONOMY),
};
