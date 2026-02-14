import { NextResponse } from "next/server";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";
import { MarketRefreshHttpError, refreshMarketData } from "@/lib/server/marketRefresh";

type SupabaseUser = {
  id: string;
};

type MarketPriceRow = {
  updated_at: string | null;
};

const supabaseUrl = (process.env.SUPABASE_URL ?? SUPABASE_URL ?? "").trim();
const supabaseAnonKey = (process.env.SUPABASE_ANON_KEY ?? SUPABASE_ANON_KEY ?? "").trim();

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

const fetchUser = async (accessToken: string): Promise<SupabaseUser | null> => {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    cache: "no-store",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as SupabaseUser;
};

const fetchLatestMarketUpdate = async (accessToken: string): Promise<string | null> => {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/market_prices?select=updated_at&order=updated_at.desc&limit=1`,
    {
      cache: "no-store",
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    },
  );

  if (!response.ok) {
    return null;
  }

  const rows = (await response.json()) as unknown;
  if (!Array.isArray(rows)) {
    return null;
  }

  return (rows as MarketPriceRow[])[0]?.updated_at ?? null;
};

const MANUAL_REFRESH_COOLDOWN_MINUTES = 10;

const getCooldownMinutesRemaining = (latestUpdatedAt: string | null): number | null => {
  if (!latestUpdatedAt) {
    return null;
  }

  const lastRefresh = new Date(latestUpdatedAt);
  if (Number.isNaN(lastRefresh.getTime())) {
    return null;
  }

  const nowMs = Date.now();
  const elapsedMinutesRaw = (nowMs - lastRefresh.getTime()) / 60000;
  const elapsedMinutes = Math.max(0, elapsedMinutesRaw);

  if (elapsedMinutes >= MANUAL_REFRESH_COOLDOWN_MINUTES) {
    return null;
  }

  const unclampedRemaining = Math.ceil(MANUAL_REFRESH_COOLDOWN_MINUTES - elapsedMinutes);
  return Math.min(MANUAL_REFRESH_COOLDOWN_MINUTES, Math.max(1, unclampedRemaining));
};

export async function POST(request: Request) {
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  const token = parseBearerToken(request.headers.get("authorization"));
  if (!token) {
    return NextResponse.json({ error: "Missing session." }, { status: 401 });
  }

  try {
    const user = await fetchUser(token);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const latestUpdatedAt = await fetchLatestMarketUpdate(token);
    const minutesRemaining = getCooldownMinutesRemaining(latestUpdatedAt);
    if (minutesRemaining !== null) {
      return NextResponse.json(
        {
          error: "REFRESH_COOLDOWN",
          minutesRemaining,
        },
        { status: 429 },
      );
    }

    const result = await refreshMarketData();
    return NextResponse.json({ ok: true, refreshedAt: result.refreshedAt });
  } catch (error) {
    if (error instanceof MarketRefreshHttpError) {
      return NextResponse.json(error.body ?? { error: "MARKET_REFRESH_FAILED" }, { status: error.status });
    }

    console.error("manual market refresh unexpected error", error);
    return NextResponse.json({ error: "FAILED_TO_REFRESH_MARKET" }, { status: 500 });
  }
}
