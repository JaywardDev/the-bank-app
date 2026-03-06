import type { BoardPack, BoardPackEconomy } from "@/lib/boardPacks";

type CurrencyMeta = {
  code?: string | null;
  symbol?: string | null;
};

type CurrencyFormatOptions = {
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
};

const FALLBACK_CODE = "USD";
const FALLBACK_SYMBOL = "$";

const safeCurrencyCode = (code?: string | null) => {
  if (!code) return FALLBACK_CODE;
  const normalized = code.toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : FALLBACK_CODE;
};

export const getCurrencyMetaFromBoardPack = (
  boardPack: BoardPack | null,
): CurrencyMeta => boardPack?.economy.currency ?? { code: FALLBACK_CODE, symbol: FALLBACK_SYMBOL };

export const getCurrencyMetaFromEconomy = (
  economy: BoardPackEconomy | null | undefined,
): CurrencyMeta => economy?.currency ?? { code: FALLBACK_CODE, symbol: FALLBACK_SYMBOL };

export const getCurrencySymbol = (currency: CurrencyMeta): string => {
  const code = safeCurrencyCode(currency.code);
  try {
    const formatter = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    });
    const currencyPart = formatter.formatToParts(0).find((part) => part.type === "currency")?.value;
    return currencyPart ?? currency.symbol ?? FALLBACK_SYMBOL;
  } catch {
    return currency.symbol ?? FALLBACK_SYMBOL;
  }
};

export const formatCurrency = (
  amount: number,
  currency: CurrencyMeta,
  options: CurrencyFormatOptions = {},
): string => {
  const code = safeCurrencyCode(currency.code);
  const minimumFractionDigits = options.minimumFractionDigits ?? 0;
  const maximumFractionDigits = options.maximumFractionDigits ?? 0;

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      minimumFractionDigits,
      maximumFractionDigits,
    }).format(amount);
  } catch {
    const symbol = currency.symbol ?? FALLBACK_SYMBOL;
    return `${symbol}${amount.toLocaleString(undefined, { minimumFractionDigits, maximumFractionDigits })}`;
  }
};

export const formatSignedCurrency = (
  amount: number,
  currency: CurrencyMeta,
  options: CurrencyFormatOptions = {},
): string => `${amount < 0 ? "-" : "+"}${formatCurrency(Math.abs(amount), currency, options)}`;
