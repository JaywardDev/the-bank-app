import { NextResponse } from "next/server";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";

const supabaseUrl = (process.env.SUPABASE_URL ?? SUPABASE_URL ?? "").trim();
const supabaseAnonKey = (
  process.env.SUPABASE_ANON_KEY ?? SUPABASE_ANON_KEY ?? ""
).trim();
const supabaseServiceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

const isConfigured = () =>
  Boolean(supabaseUrl && supabaseAnonKey && supabaseServiceRoleKey);

const adminHeaders = {
  apikey: supabaseServiceRoleKey,
  Authorization: `Bearer ${supabaseServiceRoleKey}`,
  "Content-Type": "application/json",
};

type ResolveRequest = {
  joinCode?: string;
};

type GameLookupRow = {
  id: string;
  status: string | null;
};

export async function POST(request: Request) {
  if (!isConfigured()) {
    return NextResponse.json(
      { error: "Board services are not configured." },
      { status: 503 },
    );
  }

  const payload = (await request.json().catch(() => null)) as ResolveRequest | null;
  const joinCode = payload?.joinCode?.trim().toUpperCase() ?? "";

  if (!joinCode) {
    return NextResponse.json(
      { error: "Enter a join code to continue." },
      { status: 400 },
    );
  }

  const response = await fetch(
    `${supabaseUrl}/rest/v1/games?select=id,status&join_code=eq.${encodeURIComponent(joinCode)}&limit=1`,
    {
      method: "GET",
      headers: adminHeaders,
      cache: "no-store",
    },
  );

  if (!response.ok) {
    return NextResponse.json(
      { error: "Unable to validate that join code right now." },
      { status: 503 },
    );
  }

  const [game] = (await response.json()) as GameLookupRow[];
  const isWatchable = game?.status === "lobby" || game?.status === "in_progress";

  if (!game || !isWatchable) {
    return NextResponse.json(
      { error: "That join code is invalid or the game is no longer watchable." },
      { status: 404 },
    );
  }

  return NextResponse.json({ gameId: game.id });
}
