export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL;
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const getSiteUrl = () => {
  if (!SITE_URL) {
    throw new Error("NEXT_PUBLIC_SITE_URL is required.");
  }

  const trimmed = SITE_URL.trim();
  if (!trimmed.startsWith("https://")) {
    throw new Error("NEXT_PUBLIC_SITE_URL must start with https://.");
  }

  return trimmed;
};

export const getConfigErrors = () => {
  const errors: string[] = [];

  if (!SUPABASE_URL) {
    errors.push("Missing NEXT_PUBLIC_SUPABASE_URL.");
  }

  if (!SUPABASE_ANON_KEY) {
    errors.push("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }

  if (!SITE_URL) {
    errors.push("Missing NEXT_PUBLIC_SITE_URL.");
  } else if (!SITE_URL.trim().startsWith("https://")) {
    errors.push("NEXT_PUBLIC_SITE_URL must start with https://.");
  }

  return errors;
};
