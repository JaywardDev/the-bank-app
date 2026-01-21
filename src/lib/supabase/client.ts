import {
  createClient,
  type Session,
  type SupabaseClient,
} from "@supabase/supabase-js";
import {
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  getSiteUrl,
} from "@/lib/env";

const supabaseUrl = SUPABASE_URL;
const supabaseAnonKey = SUPABASE_ANON_KEY;

export type SupabaseSession = Session;

const baseHeaders = {
  ...(supabaseAnonKey ? { apikey: supabaseAnonKey } : {}),
  "Content-Type": "application/json",
};

const getSupabaseConfig = () => {
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return {
    supabaseUrl,
    supabaseAnonKey,
  };
};

const requireSupabaseConfig = () => {
  const config = getSupabaseConfig();
  if (!config) {
    throw new Error("Supabase is not configured.");
  }

  return config;
};

const isConfigured = () => Boolean(getSupabaseConfig());
let browserClient: SupabaseClient | null = null;

const getBrowserClient = () => {
  if (typeof window === "undefined") {
    return null;
  }

  const config = getSupabaseConfig();
  if (!config) {
    return null;
  }

  if (!browserClient) {
    browserClient = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }

  return browserClient;
};

const getRealtimeClient = () => getBrowserClient();

const getSession = async () => {
  const client = getBrowserClient();
  if (!client) {
    return null;
  }

  const { data, error } = await client.auth.getSession();
  if (error) {
    return null;
  }

  return data.session ?? null;
};

const signInWithOtp = async (email: string) => {
  const client = getBrowserClient();
  if (!client) {
    throw new Error("Supabase is not configured.");
  }

  const { error } = await client.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: getSiteUrl(),
    },
  });

  if (error) {
    throw new Error(error.message ?? "Unable to send magic link.");
  }
};

const signOut = async () => {
  const client = getBrowserClient();
  if (!client) {
    return;
  }

  await client.auth.signOut();
};

const fetchFromSupabase = async <T>(
  path: string,
  options: RequestInit = {},
  accessToken?: string,
): Promise<T> => {
  const config = requireSupabaseConfig();
  const response = await fetch(`${config.supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      ...baseHeaders,
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || "Supabase request failed.");
  }

  return (await response.json()) as T;
};

export const supabaseClient = {
  isConfigured,
  getRealtimeClient,
  getSession,
  signInWithOtp,
  signOut,
  fetchFromSupabase,
};
