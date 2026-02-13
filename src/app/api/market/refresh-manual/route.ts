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
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    },
  );

  if (!response.ok) {
    throw new Error("Failed to fetch latest market update.");
  }

  const rows = (await response.json()) as MarketPriceRow[];
  return rows[0]?.updated_at ?? null;
};

export async function POST(request: Request) {
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  const token = parseBearerToken(request.headers.get("authorization"));
  if (!token) {
    return NextResponse.json({ error: "Missing session." }, { status: 401 });
  }

  const user = await fetchUser(token);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const latestUpdatedAt = await fetchLatestMarketUpdate(token);
    if (latestUpdatedAt) {
      const lastRefresh = new Date(latestUpdatedAt);
      const now = new Date();
      const diffMinutes = (now.getTime() - lastRefresh.getTime()) / 60000;

      if (diffMinutes < 10) {
        return NextResponse.json(
          {
            error: "REFRESH_COOLDOWN",
            minutesRemaining: Math.ceil(10 - diffMinutes),
          },
          { status: 429 },
        );
      }
    }

    await refreshMarketData();
    return NextResponse.json({ ok: true, refreshedAt: new Date().toISOString() });
  } catch (error) {
    if (error instanceof MarketRefreshHttpError) {
      return NextResponse.json(error.body, { status: error.status });
    }

    console.error("manual market refresh unexpected error", error);
    return NextResponse.json(
      { error: "Failed to refresh market prices." },
      { status: 500 },
    );
  }
}
