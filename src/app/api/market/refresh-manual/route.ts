import { NextResponse } from "next/server";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";
import { MarketRefreshHttpError, refreshMarketData } from "@/lib/server/marketRefresh";

type SupabaseUser = {
  id: string;
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
