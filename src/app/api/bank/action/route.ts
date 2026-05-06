import { NextResponse } from "next/server";
import {
  executeBankActionRequest,
  fetchUser,
  isConfigured,
  parseBearerToken,
  type BankActionRequest,
} from "@/lib/server/actions/executeBankActionRequest";

export async function POST(request: Request) {
  try {
    if (!isConfigured()) {
      return NextResponse.json(
        { error: "Supabase is not configured." },
        { status: 500 },
      );
    }

    const token = parseBearerToken(request.headers.get("authorization"));
    if (!token) {
      return NextResponse.json({ error: "Missing session." }, { status: 401 });
    }

    const user = await fetchUser(token);
    if (!user) {
      return NextResponse.json({ error: "Invalid session." }, { status: 401 });
    }

    const body = (await request.json()) as BankActionRequest;
    return await executeBankActionRequest({ body, user });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
