import { NextResponse } from "next/server";
import { MarketRefreshHttpError, refreshMarketData } from "@/lib/server/marketRefresh";

const isAuthorized = (request: Request) => {
  const cronSecret = (process.env.CRON_SECRET ?? "").trim();
  if (!cronSecret) {
    return false;
  }

  const authHeader = request.headers.get("authorization") ?? "";
  return authHeader === `Bearer ${cronSecret}`;
};

/**
 * How to test:
 * 1) Set CRON_SECRET in your environment.
 * 2) Call POST /api/market/refresh with Authorization: Bearer <CRON_SECRET>.
 * 3) Verify rows exist in public.market_prices for symbols SPY/BTC and
 *    public.fx_rates for pairs NZDUSD/USDPHP.
 */
export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await refreshMarketData();
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof MarketRefreshHttpError) {
      return NextResponse.json(error.body, { status: error.status });
    }

    console.error("market refresh unexpected error", error);
    return NextResponse.json(
      { error: "Failed to upsert market price cache." },
      { status: 500 },
    );
  }
}
