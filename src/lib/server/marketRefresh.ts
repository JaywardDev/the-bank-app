import { SUPABASE_URL } from "@/lib/env";

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

type FetchAttempt = {
  url: string;
  status: number | null;
  message: string;
};

type FetchLatestCloseResult = {
  close: number;
  asOfDate: string;
};

type RefreshResult = {
  ok: true;
  results: {
    SPY: { price: number; as_of_date: string };
    BTC: { price: number; as_of_date: string };
    AAPL: { price: number; as_of_date: string };
    MSFT: { price: number; as_of_date: string };
    AMZN: { price: number; as_of_date: string };
    NVDA: { price: number; as_of_date: string };
    GOOGL: { price: number; as_of_date: string };
    META: { price: number; as_of_date: string };
    TSLA: { price: number; as_of_date: string };
    NZDUSD: { rate: number; as_of_date: string };
    USDPHP: { rate: number; as_of_date: string };
  };
  source: "stooq";
};

export class MarketRefreshHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: Record<string, unknown>,
  ) {
    super(typeof body.error === "string" ? body.error : "Market refresh failed.");
  }
}

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
  const date =
    parsedDate && !Number.isNaN(parsedDate.getTime())
      ? rawDate
      : new Date().toISOString().slice(0, 10);

  return { date, close };
};

const getStooqUrlsForSymbol = (stooqSymbol: string) => [
  `https://stooq.pl/q/d/l/?s=${stooqSymbol}&i=d`,
  `https://stooq.com/q/d/l/?s=${stooqSymbol}&i=d`,
  `https://stooq.com/q/l/?s=${stooqSymbol}&f=sd2t2ohlcv&h&e=csv`,
];

class StooqFetchError extends Error {
  constructor(
    message: string,
    public readonly attempts: FetchAttempt[],
  ) {
    super(message);
  }
}

const fetchLatestCloseFromStooq = async (stooqSymbol: string): Promise<FetchLatestCloseResult> => {
  let latestPriceRow: ParsedPriceRow | null = null;
  const attempts: FetchAttempt[] = [];

  for (const url of getStooqUrlsForSymbol(stooqSymbol)) {
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
    throw new StooqFetchError(`Failed to fetch ${stooqSymbol.toUpperCase()} prices from Stooq.`, attempts);
  }

  return {
    close: latestPriceRow.close,
    asOfDate: latestPriceRow.date,
  };
};

export async function refreshMarketData(): Promise<RefreshResult> {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new MarketRefreshHttpError(503, { error: "Market refresh service is not configured." });
  }

  const stooqSymbols = {
    SPY: "spy.us",
    BTC: "btcusd",
    AAPL: "aapl.us",
    MSFT: "msft.us",
    AMZN: "amzn.us",
    NVDA: "nvda.us",
    GOOGL: "googl.us",
    META: "meta.us",
    TSLA: "tsla.us",
    NZDUSD: "nzdusd",
    USDPHP: "usdphp",
  } as const;

  const latestBySymbol: Record<keyof typeof stooqSymbols, FetchLatestCloseResult> = {
    SPY: { close: 0, asOfDate: "" },
    BTC: { close: 0, asOfDate: "" },
    AAPL: { close: 0, asOfDate: "" },
    MSFT: { close: 0, asOfDate: "" },
    AMZN: { close: 0, asOfDate: "" },
    NVDA: { close: 0, asOfDate: "" },
    GOOGL: { close: 0, asOfDate: "" },
    META: { close: 0, asOfDate: "" },
    TSLA: { close: 0, asOfDate: "" },
    NZDUSD: { close: 0, asOfDate: "" },
    USDPHP: { close: 0, asOfDate: "" },
  };

  const diagnosticsBySymbol: Record<string, FetchAttempt[] | null> = {
    SPY: null,
    BTC: null,
    AAPL: null,
    MSFT: null,
    AMZN: null,
    NVDA: null,
    GOOGL: null,
    META: null,
    TSLA: null,
    NZDUSD: null,
    USDPHP: null,
  };

  for (const [key, symbol] of Object.entries(stooqSymbols) as Array<[keyof typeof stooqSymbols, string]>) {
    try {
      latestBySymbol[key] = await fetchLatestCloseFromStooq(symbol);
    } catch (error) {
      if (error instanceof StooqFetchError) {
        diagnosticsBySymbol[key] = error.attempts;
        throw new MarketRefreshHttpError(502, {
          error: `Failed to fetch required symbol ${key} from Stooq.`,
          diagnostics: diagnosticsBySymbol,
        });
      }

      throw new MarketRefreshHttpError(502, {
        error: "Failed to fetch market data from Stooq.",
        diagnostics: diagnosticsBySymbol,
      });
    }
  }

  try {
    const marketSymbols = ["SPY", "BTC", "AAPL", "MSFT", "AMZN", "NVDA", "GOOGL", "META", "TSLA"] as const;
    const refreshedAt = new Date().toISOString();
    const marketPayload = marketSymbols.map((symbol) => ({
      symbol,
      price: latestBySymbol[symbol].close,
      as_of_date: latestBySymbol[symbol].asOfDate,
      source: "stooq",
      updated_at: refreshedAt,
    }));

    const upsertMarketResponse = await fetch(`${supabaseUrl}/rest/v1/market_prices?on_conflict=symbol`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify(marketPayload),
    });

    if (!upsertMarketResponse.ok) {
      const dbErrorText = await upsertMarketResponse.text();
      console.error("market refresh upsert failed", dbErrorText);
      throw new MarketRefreshHttpError(500, {
        error: "Failed to upsert market price cache.",
        details: dbErrorText || "Unknown database error",
      });
    }

    const upsertFxResponse = await fetch(`${supabaseUrl}/rest/v1/fx_rates?on_conflict=pair`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify([
        {
          pair: "NZDUSD",
          rate: latestBySymbol.NZDUSD.close,
          as_of_date: latestBySymbol.NZDUSD.asOfDate,
          source: "stooq",
          updated_at: refreshedAt,
        },
        {
          pair: "USDPHP",
          rate: latestBySymbol.USDPHP.close,
          as_of_date: latestBySymbol.USDPHP.asOfDate,
          source: "stooq",
          updated_at: refreshedAt,
        },
      ]),
    });

    if (!upsertFxResponse.ok) {
      const dbErrorText = await upsertFxResponse.text();
      console.error("market refresh fx upsert failed", dbErrorText);
      throw new MarketRefreshHttpError(500, {
        error: "Failed to upsert fx rate cache.",
        details: dbErrorText || "Unknown database error",
      });
    }

    return {
      ok: true,
      results: {
        SPY: {
          price: latestBySymbol.SPY.close,
          as_of_date: latestBySymbol.SPY.asOfDate,
        },
        BTC: {
          price: latestBySymbol.BTC.close,
          as_of_date: latestBySymbol.BTC.asOfDate,
        },
        AAPL: {
          price: latestBySymbol.AAPL.close,
          as_of_date: latestBySymbol.AAPL.asOfDate,
        },
        MSFT: {
          price: latestBySymbol.MSFT.close,
          as_of_date: latestBySymbol.MSFT.asOfDate,
        },
        AMZN: {
          price: latestBySymbol.AMZN.close,
          as_of_date: latestBySymbol.AMZN.asOfDate,
        },
        NVDA: {
          price: latestBySymbol.NVDA.close,
          as_of_date: latestBySymbol.NVDA.asOfDate,
        },
        GOOGL: {
          price: latestBySymbol.GOOGL.close,
          as_of_date: latestBySymbol.GOOGL.asOfDate,
        },
        META: {
          price: latestBySymbol.META.close,
          as_of_date: latestBySymbol.META.asOfDate,
        },
        TSLA: {
          price: latestBySymbol.TSLA.close,
          as_of_date: latestBySymbol.TSLA.asOfDate,
        },
        NZDUSD: {
          rate: latestBySymbol.NZDUSD.close,
          as_of_date: latestBySymbol.NZDUSD.asOfDate,
        },
        USDPHP: {
          rate: latestBySymbol.USDPHP.close,
          as_of_date: latestBySymbol.USDPHP.asOfDate,
        },
      },
      source: "stooq",
    };
  } catch (error) {
    if (error instanceof MarketRefreshHttpError) {
      throw error;
    }

    console.error("market refresh parse/db error", error);
    throw new MarketRefreshHttpError(500, { error: "Failed to upsert market price cache." });
  }
}
