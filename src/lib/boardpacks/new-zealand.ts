import type {
  BoardPack,
  BoardPackEconomy,
  BoardTile,
  CardDefinition,
} from "../boardPacks";
import { NZ_MACRO_DECK, drawNZMacroCard } from "../macroDeckNZ";

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

export const NEW_ZEALAND_ECONOMY: BoardPackEconomy = {
  currency: {
    code: "NZD",
    symbol: "$",
  },
  houseRentMultipliersByGroup: {
    brown: [1, 12, 25, 55, 80],
    "light-blue": [1, 11, 23, 50, 70],
    pink: [1, 10, 22, 48, 62],
    orange: [1, 9, 20, 44, 56],
    red: [1, 8, 18, 40, 50],
    yellow: [1, 7, 16, 36, 45],
    green: [1, 6, 14, 32, 38],
    "dark-blue": [1, 6, 12, 28, 32],
  },
  hotelIncrementMultiplier: 1.35,
  railRentByCount: [0, 60_000, 120_000, 240_000, 480_000],
  utilityRentMultipliers: { single: 4, double: 10 },
  utilityBaseAmount: 2_400,
  startingBalance: 4_000_000,
  passGoAmount: 480_000,
  jailFineAmount: 120_000,
  auctionMinIncrement: 24_000,
};

const NEW_ZEALAND_PROPERTY_GROUPS: PropertyGroupConfig[] = [
  { id: "brown", houseCost: 120_000, tileIds: ["greymouth", "franz-josef"] },
  {
    id: "light-blue",
    houseCost: 120_000,
    tileIds: ["gore", "te-anau", "invercargill"],
  },
  { id: "pink", houseCost: 240_000, tileIds: ["ashburton", "lake-tekapo", "gisborne"] },
  {
    id: "orange",
    houseCost: 240_000,
    tileIds: ["blenheim", "picton", "napier"],
  },
  { id: "red", houseCost: 360_000, tileIds: ["arrowtown", "cromwell", "dunedin"] },
  {
    id: "yellow",
    houseCost: 360_000,
    tileIds: ["nelson", "wanaka", "christchurch"],
  },
  {
    id: "green",
    houseCost: 480_000,
    tileIds: ["waiheke-island", "lake-hayes", "queenstown"],
  },
  { id: "dark-blue", houseCost: 480_000, tileIds: ["wellington-cbd", "auckland-cbd"] },
];

export const newZealandChanceCards: CardDefinition[] = [
  {
    id: "new-zealand-chance-advance-go",
    title: "IRD Refund Lands Early",
    text: "Your PAYE refund clears sooner than expected. Advance to Go and collect NZ$480,000.",
    kind: "MOVE_TO",
    payload: { target_tile_id: "go" },
  },
  {
    id: "new-zealand-chance-ashburton",
    title: "Canterbury A&P Day Trip",
    text: "You promised whānau a proper day out at the Ashburton A&P Show. Advance to Ashburton.",
    kind: "MOVE_TO",
    payload: { target_tile_id: "ashburton" },
  },
  {
    id: "new-zealand-chance-dunedin",
    title: "Booked for the Dunedin Fringe",
    text: "A last-minute ticket drops for a sold-out Dunedin Fringe night. Advance to Dunedin.",
    kind: "MOVE_TO",
    payload: { target_tile_id: "dunedin" },
  },
  {
    id: "new-zealand-chance-auckland-cbd",
    title: "Pitch Meeting on Queen Street",
    text: "Your startup deck gets you a prime investor meeting in the city. Stroll to Auckland CBD.",
    kind: "MOVE_TO",
    payload: { target_tile_id: "auckland-cbd" },
  },
  {
    id: "new-zealand-chance-nearest-utility",
    title: "Call-Out from Meridian or Chorus",
    text: "A sudden outage means you are needed on-site now. Head to the nearest utility.",
    kind: "MOVE_TO",
    payload: { nearest_kind: "UTILITY" },
  },
  {
    id: "new-zealand-chance-nearest-railroad-1",
    title: "Last Call for Regional Transport",
    text: "The platform announcer gives one final warning over the PA. Proceed to the nearest station.",
    kind: "MOVE_TO",
    payload: { nearest_kind: "RAILROAD" },
  },
  {
    id: "new-zealand-chance-nearest-railroad-2",
    title: "Transit Card Still Loaded",
    text: "Too right — you've got just enough fare for one more leg. Catch the next station ahead.",
    kind: "MOVE_TO",
    payload: { nearest_kind: "RAILROAD" },
  },
  {
    id: "new-zealand-chance-kiwirail-freight",
    title: "Freight Slot Opens on KiwiRail",
    text: "A priority freight window opens and your goods can move tonight. Take a trip to KiwiRail Freight.",
    kind: "MOVE_TO",
    payload: { target_tile_id: "kiwirail-freight" },
  },
  {
    id: "new-zealand-chance-back-three",
    title: "Roadworks by Waka Kotahi",
    text: "Cones as far as the eye can see. Detour and move back three spaces.",
    kind: "MOVE_REL",
    payload: { relative_spaces: -3 },
  },
  {
    id: "new-zealand-chance-dividend",
    title: "KiwiSaver Fund Beats Forecast",
    text: "Your growth fund quietly outperforms this quarter. Collect NZ$120,000.",
    kind: "RECEIVE",
    payload: { amount: 120_000 },
  },
  {
    id: "new-zealand-chance-building-loan",
    title: "Kainga Ora Contract Finalised",
    text: "The final milestone payment arrives right on schedule. Collect NZ$360,000.",
    kind: "RECEIVE",
    payload: { amount: 360_000 },
  },
  {
    id: "new-zealand-chance-crossword",
    title: "Radio Hauraki Trivia Winner",
    text: "You nail the Friday stumper and the station pays out. Collect NZ$240,000.",
    kind: "RECEIVE",
    payload: { amount: 240_000 },
  },
  {
    id: "new-zealand-chance-speeding-fine",
    title: "Camera Car on the Motorway",
    text: "You were only doing 'a little over'... apparently not little enough. Pay NZ$36,000.",
    kind: "PAY",
    payload: { amount: 36_000 },
  },
  {
    id: "new-zealand-chance-poor-tax",
    title: "Emergency Rates Top-Up",
    text: "Council approves an urgent levy after storm damage. Pay NZ$36,000.",
    kind: "PAY",
    payload: { amount: 36_000 },
  },
  {
    id: "new-zealand-chance-go-to-jail",
    title: "Mandatory Court Appearance",
    text: "No detours, no coffees, no excuses. Head straight to jail.",
    kind: "GO_TO_JAIL",
    payload: {},
  },
  {
    id: "new-zealand-chance-get-out-of-jail",
    title: "Duty Solicitor Pulls a Miracle",
    text: "Your lawyer knows exactly who to call. Keep this card to get out of jail free.",
    kind: "GET_OUT_OF_JAIL_FREE",
    payload: {},
  },
];

export const newZealandCommunityCards: CardDefinition[] = [
  {
    id: "new-zealand-community-advance-go",
    title: "Payroll Hits Before Long Weekend",
    text: "Sweet as — your wages clear before everyone heads away. Advance to Go and collect NZ$480,000.",
    kind: "MOVE_TO",
    payload: { target_tile_id: "go" },
  },
  {
    id: "new-zealand-community-bank-error",
    title: "Core Banking Reversal in Your Favour",
    text: "A duplicate transfer gets corrected and lands in your account. Collect NZ$480,000.",
    kind: "RECEIVE",
    payload: { amount: 480_000 },
  },
  {
    id: "new-zealand-community-doctor",
    title: "After-Hours GP Visit",
    text: "You skip the queue but not the invoice. Pay NZ$120,000.",
    kind: "PAY",
    payload: { amount: 120_000 },
  },
  {
    id: "new-zealand-community-stock",
    title: "NZX Shares Sold at the Bell",
    text: "You timed the close perfectly on the NZX. Collect NZ$120,000.",
    kind: "RECEIVE",
    payload: { amount: 120_000 },
  },
  {
    id: "new-zealand-community-holiday-fund",
    title: "Airpoints Holiday Pot Cashed Out",
    text: "Your travel stash matures just in time for a Pacific escape. Collect NZ$240,000.",
    kind: "RECEIVE",
    payload: { amount: 240_000 },
  },
  {
    id: "new-zealand-community-tax-refund",
    title: "IRD Refund Processed",
    text: "You overpaid PAYE and IRD finally settles up. Collect NZ$48,000.",
    kind: "RECEIVE",
    payload: { amount: 48_000 },
  },
  {
    id: "new-zealand-community-life-insurance",
    title: "Policy Bonus Paid Out",
    text: "Your insurer confirms the maturity bonus is ready. Collect NZ$240,000.",
    kind: "RECEIVE",
    payload: { amount: 240_000 },
  },
  {
    id: "new-zealand-community-hospital",
    title: "Private Specialist Invoice Arrives",
    text: "The treatment helped, the bill stings. Pay NZ$240,000.",
    kind: "PAY",
    payload: { amount: 240_000 },
  },
  {
    id: "new-zealand-community-school-fees",
    title: "Term Fees and Uniform Top-Up",
    text: "New shoes, sports trip, and stationery all at once. Pay NZ$120,000.",
    kind: "PAY",
    payload: { amount: 120_000 },
  },
  {
    id: "new-zealand-community-consultancy",
    title: "Short Contract in Wellington",
    text: "A quick policy review job wraps early and pays promptly. Collect NZ$60,000.",
    kind: "RECEIVE",
    payload: { amount: 60_000 },
  },
  {
    id: "new-zealand-community-inherit",
    title: "Estate Distribution Finalised",
    text: "The family trust wraps up and your share is transferred. Collect NZ$240,000.",
    kind: "RECEIVE",
    payload: { amount: 240_000 },
  },
  {
    id: "new-zealand-community-beauty-contest",
    title: "A&P Show Ribbon Prize",
    text: "Your entry takes out a local category at the show. Collect NZ$24,000.",
    kind: "RECEIVE",
    payload: { amount: 24_000 },
  },
  {
    id: "new-zealand-community-get-out-of-jail",
    title: "Community Law Clinic Assist",
    text: "A volunteer solicitor offers a one-off lifeline. Keep this card to get out of jail free.",
    kind: "GET_OUT_OF_JAIL_FREE",
    payload: {},
  },
  {
    id: "new-zealand-community-go-to-jail",
    title: "Court Orders Immediate Detention",
    text: "The judge is not in a negotiating mood today. Go directly to jail.",
    kind: "GO_TO_JAIL",
    payload: {},
  },
  {
    id: "new-zealand-community-birthday",
    title: "Birthday Envelope from Nan",
    text: "There is always cash tucked in the card, even now. Collect NZ$120,000.",
    kind: "RECEIVE",
    payload: { amount: 120_000 },
  },
  {
    id: "new-zealand-community-street-repairs",
    title: "Storm Damage on Your Street",
    text: "Fence panels and drainage repairs cannot wait. Pay NZ$96,000.",
    kind: "PAY",
    payload: { amount: 96_000 },
  },
];

export const newZealandBoardPack: BoardPack = {
  id: "new-zealand",
  displayName: "New Zealand",
  properties: [],
  economy: NEW_ZEALAND_ECONOMY,
  rules: {
    mortgageLtv: 0.7,
    collateralLtv: 0.5,
    mortgageRatePerTurn: 0.015,
    mortgageTermTurns: 40,
    collateralRatePerTurn: 0.02,
    collateralTermTurns: 12,
  },
  macroDeck: {
    id: "macro-nz",
    name: "NZ Macro Deck",
    cards: NZ_MACRO_DECK,
    draw: drawNZMacroCard,
  },
  eventDecks: {
    chance: newZealandChanceCards,
    community: newZealandCommunityCards,
  },
  tiles: applyPropertyGroupConfig([
    { index: 0, tile_id: "go", type: "START", name: "Go" },
    { index: 1, tile_id: "greymouth", type: "PROPERTY", name: "Greymouth", price: 144_000, baseRent: 4_800 },
    { index: 2, tile_id: "community-chest-1", type: "EVENT", name: "Community Chest" },
    { index: 3, tile_id: "franz-josef", type: "PROPERTY", name: "Franz Josef", price: 144_000, baseRent: 9_600 },
    { index: 4, tile_id: "income-tax", type: "TAX", name: "Income Tax", taxAmount: 480_000 },
    { index: 5, tile_id: "interislander", type: "RAIL", name: "Interislander", price: 480_000, baseRent: 60_000 },
    { index: 6, tile_id: "gore", type: "PROPERTY", name: "Gore", price: 240_000, baseRent: 14_400 },
    { index: 7, tile_id: "chance-1", type: "EVENT", name: "Chance" },
    { index: 8, tile_id: "te-anau", type: "PROPERTY", name: "Te Anau", price: 240_000, baseRent: 14_400 },
    { index: 9, tile_id: "invercargill", type: "PROPERTY", name: "Invercargill", price: 288_000, baseRent: 19_200 },
    { index: 10, tile_id: "jail", type: "JAIL", name: "Jail" },
    { index: 11, tile_id: "ashburton", type: "PROPERTY", name: "Ashburton", price: 336_000, baseRent: 24_000 },
    { index: 12, tile_id: "meridian-energy", type: "UTILITY", name: "Meridian Energy", price: 360_000 },
    { index: 13, tile_id: "lake-tekapo", type: "PROPERTY", name: "Lake Tekapo", price: 336_000, baseRent: 24_000 },
    { index: 14, tile_id: "gisborne", type: "PROPERTY", name: "Gisborne", price: 384_000, baseRent: 28_800 },
    { index: 15, tile_id: "kiwirail-freight", type: "RAIL", name: "KiwiRail Freight", price: 480_000, baseRent: 60_000 },
    { index: 16, tile_id: "blenheim", type: "PROPERTY", name: "Blenheim", price: 432_000, baseRent: 33_600 },
    { index: 17, tile_id: "community-chest-2", type: "EVENT", name: "Community Chest" },
    { index: 18, tile_id: "picton", type: "PROPERTY", name: "Picton", price: 432_000, baseRent: 33_600 },
    { index: 19, tile_id: "napier", type: "PROPERTY", name: "Napier", price: 480_000, baseRent: 38_400 },
    { index: 20, tile_id: "free-parking", type: "FREE_PARKING", name: "Free Parking" },
    { index: 21, tile_id: "arrowtown", type: "PROPERTY", name: "Arrowtown", price: 528_000, baseRent: 43_200 },
    { index: 22, tile_id: "chance-2", type: "EVENT", name: "Chance" },
    { index: 23, tile_id: "cromwell", type: "PROPERTY", name: "Cromwell", price: 528_000, baseRent: 43_200 },
    { index: 24, tile_id: "dunedin", type: "PROPERTY", name: "Dunedin", price: 576_000, baseRent: 48_000 },
    { index: 25, tile_id: "port-of-tauranga", type: "RAIL", name: "Port of Tauranga", price: 480_000, baseRent: 60_000 },
    { index: 26, tile_id: "nelson", type: "PROPERTY", name: "Nelson", price: 624_000, baseRent: 52_800 },
    { index: 27, tile_id: "wanaka", type: "PROPERTY", name: "Wanaka", price: 624_000, baseRent: 52_800 },
    { index: 28, tile_id: "chorus-fibre", type: "UTILITY", name: "Chorus Fibre", price: 360_000 },
    { index: 29, tile_id: "christchurch", type: "PROPERTY", name: "Christchurch", price: 672_000, baseRent: 57_600 },
    { index: 30, tile_id: "go-to-jail", type: "GO_TO_JAIL", name: "Go To Jail" },
    { index: 31, tile_id: "waiheke-island", type: "PROPERTY", name: "Waiheke Island", price: 720_000, baseRent: 62_400 },
    { index: 32, tile_id: "lake-hayes", type: "PROPERTY", name: "Lake Hayes", price: 720_000, baseRent: 62_400 },
    { index: 33, tile_id: "community-chest-3", type: "EVENT", name: "Community Chest" },
    { index: 34, tile_id: "queenstown", type: "PROPERTY", name: "Queenstown", price: 768_000, baseRent: 67_200 },
    { index: 35, tile_id: "auckland-rail-network", type: "RAIL", name: "Auckland Rail Network", price: 480_000, baseRent: 60_000 },
    { index: 36, tile_id: "chance-3", type: "EVENT", name: "Chance" },
    { index: 37, tile_id: "wellington-cbd", type: "PROPERTY", name: "Wellington CBD", price: 840_000, baseRent: 84_000 },
    { index: 38, tile_id: "super-tax", type: "TAX", name: "Super Tax", taxAmount: 240_000 },
    { index: 39, tile_id: "auckland-cbd", type: "PROPERTY", name: "Auckland CBD", price: 960_000, baseRent: 120_000 },
  ], NEW_ZEALAND_PROPERTY_GROUPS, NEW_ZEALAND_ECONOMY),
};
