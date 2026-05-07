import { NextResponse } from "next/server";
import { userIsGameMember } from "@/lib/server/ai/snapshot";
import { runAiTurn } from "@/lib/server/ai/runAiTurn";
import type { AiTurnResult } from "@/lib/server/ai/types";
import {
  fetchUser,
  isConfigured,
  parseBearerToken,
} from "@/lib/server/actions/executeBankActionRequest";

const OBSERVABLE_AI_STOPS = new Set([
  "lock_lost",
  "version_conflict",
  "action_rejected",
  "repeated_state",
]);

const logObservableAiStop = ({
  gameId,
  result,
}: {
  gameId: string;
  result: AiTurnResult;
}) => {
  if (!OBSERVABLE_AI_STOPS.has(result.stopped)) return;

  console.info("AI turn nudge stopped", {
    gameId,
    stopped: result.stopped,
    actionContext: result.actionContext,
    actions: result.actions,
    status: result.status,
    error: result.error,
  });
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  if (!isConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  const token = parseBearerToken(request.headers.get("authorization"));
  if (!token) {
    return NextResponse.json({ error: "Missing session." }, { status: 401 });
  }

  const user = await fetchUser(token);
  if (!user) {
    return NextResponse.json({ error: "Invalid session." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { gameId?: unknown } | null;
  if (!body || Array.isArray(body) || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const bodyKeys = Object.keys(body);
  if (bodyKeys.length !== 1 || bodyKeys[0] !== "gameId") {
    return NextResponse.json({ error: "AI turn nudges may only include gameId." }, { status: 400 });
  }

  const gameId = typeof body.gameId === "string" ? body.gameId : null;
  if (!gameId || !UUID_PATTERN.test(gameId)) {
    return NextResponse.json({ error: "Invalid gameId." }, { status: 400 });
  }

  if (!(await userIsGameMember(gameId, user.id))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const result = await runAiTurn({ gameId });
  logObservableAiStop({ gameId, result });
  return NextResponse.json(result);
}
