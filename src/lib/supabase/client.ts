import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  getSiteUrl,
} from "@/lib/env";

const supabaseUrl = SUPABASE_URL;
const supabaseAnonKey = SUPABASE_ANON_KEY;

const storageKey = "bank.supabase.session";

export type SupabaseUser = {
  id: string;
  email: string | null;
};

export type SupabaseSession = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  token_type: string;
  user: SupabaseUser;
};

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
let realtimeClient: SupabaseClient | null = null;

const getRealtimeClient = () => {
  if (typeof window === "undefined") {
    return null;
  }

  const config = getSupabaseConfig();
  if (!config) {
    return null;
  }

  if (!realtimeClient) {
    realtimeClient = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        persistSession: false,
      },
    });
  }

  return realtimeClient;
};

const readStoredSession = (): SupabaseSession | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(storageKey);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as SupabaseSession;
  } catch {
    return null;
  }
};

const storeSession = (session: SupabaseSession) => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(session));
};

const clearSession = () => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(storageKey);
};

const fetchUser = async (supabaseUrl: string, accessToken: string) => {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      ...baseHeaders,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as { id: string; email: string | null };
  return data;
};

const refreshSession = async (supabaseUrl: string, refreshToken: string) => {
  const response = await fetch(
    `${supabaseUrl}/auth/v1/token?grant_type=refresh_token`,
    {
      method: "POST",
      headers: baseHeaders,
      body: JSON.stringify({ refresh_token: refreshToken }),
    },
  );

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
    user: SupabaseUser;
  };

  const session: SupabaseSession = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + data.expires_in,
    token_type: data.token_type,
    user: data.user,
  };

  storeSession(session);
  return session;
};

const parseSessionFromUrl = async (supabaseUrl: string) => {
  if (typeof window === "undefined") {
    return null;
  }

  if (!window.location.hash) {
    return null;
  }

  const hashParams = new URLSearchParams(window.location.hash.substring(1));
  const accessToken = hashParams.get("access_token");
  const refreshToken = hashParams.get("refresh_token");
  const expiresIn = hashParams.get("expires_in");
  const tokenType = hashParams.get("token_type") ?? "bearer";

  if (!accessToken || !refreshToken || !expiresIn) {
    return null;
  }

  const user = await fetchUser(supabaseUrl, accessToken);
  if (!user) {
    return null;
  }

  const session: SupabaseSession = {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: Math.floor(Date.now() / 1000) + Number(expiresIn),
    token_type: tokenType,
    user,
  };

  storeSession(session);
  window.history.replaceState({}, document.title, window.location.pathname);
  return session;
};

const getSession = async () => {
  const config = getSupabaseConfig();
  if (!config) {
    return null;
  }

  const urlSession = await parseSessionFromUrl(config.supabaseUrl);
  if (urlSession) {
    return urlSession;
  }

  const stored = readStoredSession();
  if (!stored) {
    return null;
  }

  if (stored.expires_at > Math.floor(Date.now() / 1000)) {
    return stored;
  }

  return refreshSession(config.supabaseUrl, stored.refresh_token);
};

const signInWithOtp = async (email: string) => {
  const config = requireSupabaseConfig();

  const redirectTo = getSiteUrl();

  const payload = {
    email,
    options: {
      email_redirect_to: redirectTo,
    },
  };

  const response = await fetch(`${config.supabaseUrl}/auth/v1/otp`, {
    method: "POST",
    headers: baseHeaders,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = (await response.json()) as { message?: string };
    throw new Error(error.message ?? "Unable to send magic link.");
  }
};

const signOut = async (accessToken: string) => {
  const config = requireSupabaseConfig();
  await fetch(`${config.supabaseUrl}/auth/v1/logout`, {
    method: "POST",
    headers: {
      ...baseHeaders,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  clearSession();
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
