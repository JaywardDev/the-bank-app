import { NextResponse } from "next/server";
import { MARKET_CONFIG } from "@/lib/marketConfig";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";

type TradeRequestBody = {
  symbol?: "SPY" | "BTC";
  side?: "BUY" | "SELL";
  qty?: number;
};

type SupabaseUser = {
  id: string;
};

type PlayerRow = {
  id: string;
  game_id: string;
  created_at: string | null;
};

type GameRow = {
  id: string;
  status: string | null;
};

type TradeRpcResultRow = {
  symbol: "SPY" | "BTC";
  side: "BUY" | "SELL";
  qty: number;
  price: number;
  fee: number;
  tax: number;
  new_cash_balance: number;
};

const supabaseUrl = (process.env.SUPABASE_URL ?? SUPABASE_URL ?? "").trim();
const supabaseAnonKey = (process.env.SUPABASE_ANON_KEY ?? SUPABASE_ANON_KEY ?? "").trim();
const supabaseServiceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

const playerHeaders = {
  apikey: supabaseAnonKey,
  "Content-Type": "application/json",
};

const bankHeaders = {
  apikey: supabaseServiceRoleKey,
  Authorization: `Bearer ${supabaseServiceRoleKey}`,
  "Content-Type": "application/json",
};

const parseBearerToken = (authorization: string | null) => {
  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.split(" ");
  if (scheme !== "Bearer" || !token) {
    return null;
  }

  return token;
};

const parseSupabaseResponse = async <T>(response: Response): Promise<T> => {
  const bodyText = await response.text();

  if (!response.ok) {
    if (!bodyText) {
      throw new Error("Supabase request failed.");
    }

    let parsedMessage: string | null = null;
    try {
      const parsed = JSON.parse(bodyText) as { message?: string; error?: string };
      parsedMessage = parsed.message ?? parsed.error ?? null;
    } catch {
      parsedMessage = null;
    }
    throw new Error(parsedMessage ?? bodyText);
  }

  if (!bodyText) {
    throw new Error("Supabase returned no data.");
  }

  return JSON.parse(bodyText) as T;
};

const fetchUser = async (accessToken: string) => {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      ...playerHeaders,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as SupabaseUser;
};

const pickCurrentPlayer = async (userId: string) => {
  const playersResponse = await fetch(
    `${supabaseUrl}/rest/v1/players?select=id,game_id,created_at&user_id=eq.${userId}&order=created_at.desc`,
    {
      headers: bankHeaders,
    },
  );
  const players = await parseSupabaseResponse<PlayerRow[]>(playersResponse);

  if (players.length === 0) {
    return null;
  }

  if (players.length === 1) {
    return players[0];
  }

  const gameIds = Array.from(new Set(players.map((row) => row.game_id)));
  const gamesResponse = await fetch(
    `${supabaseUrl}/rest/v1/games?select=id,status&id=in.(${gameIds.join(",")})`,
    {
      headers: bankHeaders,
    },
  );
  const games = await parseSupabaseResponse<GameRow[]>(gamesResponse);
  const gameById = new Map(games.map((game) => [game.id, game]));

  const inProgressPlayers = players.filter(
    (player) => gameById.get(player.game_id)?.status === "in_progress",
  );

  if (inProgressPlayers.length === 1) {
    return inProgressPlayers[0];
  }

  if (inProgressPlayers.length > 1) {
    return null;
  }

  return players[0];
};

const mapTradeErrorToResponse = (error: string) => {
  switch (error) {
    case "INVALID_SYMBOL":
    case "INVALID_SIDE":
    case "INVALID_QTY":
      return { status: 400, message: "Invalid trade payload." };
    case "PRICE_NOT_FOUND":
      return { status: 400, message: "Price not found for symbol." };
    case "INSUFFICIENT_CASH":
      return { status: 400, message: "Insufficient cash for this trade." };
    case "INSUFFICIENT_HOLDINGS":
      return { status: 400, message: "Insufficient holdings for this trade." };
    case "PLAYER_NOT_FOUND":
      return { status: 404, message: "Player not found." };
    default:
      return null;
  }
};

export async function POST(request: Request) {
  try {
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
    }

    const token = parseBearerToken(request.headers.get("authorization"));
    if (!token) {
      return NextResponse.json({ error: "Missing session." }, { status: 401 });
    }

    const user = await fetchUser(token);
    if (!user) {
      return NextResponse.json({ error: "Invalid session." }, { status: 401 });
    }

    const body = (await request.json()) as TradeRequestBody;
    const symbol = body.symbol;
    const side = body.side;
    const qty = Number(body.qty);

    if ((symbol !== "SPY" && symbol !== "BTC") || (side !== "BUY" && side !== "SELL") || !Number.isFinite(qty) || qty <= 0) {
      return NextResponse.json({ error: "Invalid trade payload." }, { status: 400 });
    }

    const player = await pickCurrentPlayer(user.id);
    if (!player) {
      return NextResponse.json(
        { error: "Unable to resolve the current player for this account." },
        { status: 400 },
      );
    }

    const tradeResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/trade_player_asset`, {
      method: "POST",
      headers: bankHeaders,
      body: JSON.stringify({
        p_player_id: player.id,
        p_symbol: symbol,
        p_side: side,
        p_qty: qty,
        p_trading_fee_rate: MARKET_CONFIG.tradingFeeRate,
        p_capital_gains_tax_rate: MARKET_CONFIG.capitalGainsTaxRate,
        p_allow_short_selling: MARKET_CONFIG.allowShortSelling,
      }),
    });

    const tradeRows = await parseSupabaseResponse<TradeRpcResultRow[]>(tradeResponse);
    const trade = tradeRows[0];

    if (!trade) {
      return NextResponse.json({ error: "Trade execution failed." }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      symbol: trade.symbol,
      side: trade.side,
      qty: trade.qty,
      price: trade.price,
      fee: trade.fee,
      tax: trade.tax,
      new_cash_balance: trade.new_cash_balance,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error.";
    const mapped = mapTradeErrorToResponse(message);

    if (mapped) {
      return NextResponse.json({ error: mapped.message }, { status: mapped.status });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
