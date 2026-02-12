import { NextResponse } from "next/server";
import { SUPABASE_URL } from "@/lib/env";

const STOOQ_SPY_CSV_URLS = [
  "https://stooq.pl/q/d/l/?s=spy.us&i=d",
  "https://stooq.com/q/d/l/?s=spy.us&i=d",
  "https://stooq.com/q/l/?s=spy.us&f=sd2t2ohlcv&h&e=csv",
];
const STOOQ_FETCH_TIMEOUT_MS = 10_000;

const supabaseUrl = (process.env.SUPABASE_URL ?? SUPABASE_URL ?? "").trim();
const supabaseServiceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

const adminHeaders = {
  apikey: supabaseServiceRoleKey,
  Authorization: `Bearer ${supabaseServiceRoleKey}`,
  "Content-Type": "application/json",
  Prefer: "resolution=merge-duplicates,return=representation",
};

type ParsedPriceRow = {
  date: string;
  close: number;
};

const parseStooqCsv = (csv: string): ParsedPriceRow | null => {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length <= 1) {
    return null;
  }

  const header = lines[0].split(",").map((cell) => cell.trim().toLowerCase());
  const dateIndex = header.indexOf("date");
  const closeIndex = header.indexOf("close");

  if (dateIndex < 0 || closeIndex < 0) {
    throw new Error("CSV missing Date/Close columns");
  }

  let latest: ParsedPriceRow | null = null;

  for (const line of lines.slice(1)) {
    const cells = line.split(",");
    const rawDate = cells[dateIndex]?.trim();
    const rawClose = cells[closeIndex]?.trim();

    if (!rawDate || !rawClose) {
      continue;
    }

    const parsedDate = new Date(`${rawDate}T00:00:00Z`);
    const parsedClose = Number(rawClose);

    if (Number.isNaN(parsedDate.getTime()) || Number.isNaN(parsedClose)) {
      continue;
    }

    if (!latest) {
      latest = { date: rawDate, close: parsedClose };
      continue;
    }

    const latestDate = new Date(`${latest.date}T00:00:00Z`);
    if (parsedDate.getTime() > latestDate.getTime()) {
      latest = { date: rawDate, close: parsedClose };
    }
  }

  return latest;
};

const parseStooqQuoteCsv = (csv: string): ParsedPriceRow | null => {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length <= 1) {
    return null;
  }

  const header = lines[0].split(",").map((cell) => cell.trim().toLowerCase());
  const row = lines[1].split(",").map((cell) => cell.trim());
  const closeIndex = header.indexOf("close");
  const dateIndex = header.indexOf("date");

  if (closeIndex < 0) {
    throw new Error("Quote CSV missing Close column");
  }

  const rawClose = row[closeIndex];
  if (!rawClose) {
    return null;
  }

  const close = Number(rawClose);
  if (Number.isNaN(close)) {
    return null;
  }

  const rawDate = row[dateIndex] ?? "";
  const parsedDate = rawDate ? new Date(`${rawDate}T00:00:00Z`) : null;
  const date = parsedDate && !Number.isNaN(parsedDate.getTime())
    ? rawDate
    : new Date().toISOString().slice(0, 10);

  return { date, close };
};

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
 * 3) Verify a row exists in public.market_prices for symbol SPY.
 */
export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return NextResponse.json(
      { error: "Market refresh service is not configured." },
      { status: 503 },
    );
  }

  let latestPriceRow: ParsedPriceRow | null = null;
  const attempts: Array<{ url: string; status: number | null; message: string }> = [];

  for (const url of STOOQ_SPY_CSV_URLS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), STOOQ_FETCH_TIMEOUT_MS);

    try {
      const csvResponse = await fetch(url, {
        method: "GET",
        cache: "no-store",
        headers: {
          "User-Agent": "Mozilla/5.0",
          Accept: "text/csv",
        },
        signal: controller.signal,
      });

      if (!csvResponse.ok) {
        attempts.push({
          url,
          status: csvResponse.status,
          message: csvResponse.statusText || "HTTP error",
        });
        continue;
      }

      const csvText = await csvResponse.text();
      latestPriceRow = url.includes("/q/d/l/") ? parseStooqCsv(csvText) : parseStooqQuoteCsv(csvText);

      if (!latestPriceRow) {
        attempts.push({
          url,
          status: csvResponse.status,
          message: "Stooq CSV is empty or invalid.",
        });
        continue;
      }

      break;
    } catch (error) {
      attempts.push({
        url,
        status: null,
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  if (!latestPriceRow) {
    return NextResponse.json(
      {
        error: "Failed to fetch SPY prices from Stooq.",
        attempts,
      },
      { status: 502 },
    );
  }

  try {
    const upsertResponse = await fetch(`${supabaseUrl}/rest/v1/market_prices?on_conflict=symbol`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify([
        {
          symbol: "SPY",
          price: latestPriceRow.close,
          as_of_date: latestPriceRow.date,
          source: "stooq",
          updated_at: new Date().toISOString(),
        },
      ]),
    });

    if (!upsertResponse.ok) {
      const dbErrorText = await upsertResponse.text();
      console.error("market refresh upsert failed", dbErrorText);
      return NextResponse.json(
        {
          error: "Failed to upsert market price cache.",
          details: dbErrorText || "Unknown database error",
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      symbol: "SPY",
      price: latestPriceRow.close,
      as_of_date: latestPriceRow.date,
      source: "stooq",
    });
  } catch (error) {
    console.error("market refresh parse/db error", error);
    return NextResponse.json(
      { error: "Failed to upsert market price cache." },
      { status: 500 },
    );
  }
}
