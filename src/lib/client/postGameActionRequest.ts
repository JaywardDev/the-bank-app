import { supabaseClient } from "@/lib/supabase/client";

type PostGameActionRequestParams = {
  payload: unknown;
  accessToken?: string | null;
};

type PostGameActionRequestResult = {
  status: number;
  ok: boolean;
  body: unknown;
  refreshedSession: boolean;
};

const parseJsonSafely = async (response: Response): Promise<unknown> => {
  const rawBody = await response.text();
  if (!rawBody) {
    return null;
  }

  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    return null;
  }
};

export const postGameActionRequest = async ({
  payload,
  accessToken,
}: PostGameActionRequestParams): Promise<PostGameActionRequestResult> => {
  const executePostRequest = (token?: string | null) =>
    fetch("/api/bank/action", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    });

  let response = await executePostRequest(accessToken);
  let refreshedSession = false;

  if (response.status === 401) {
    const refreshed = await supabaseClient.refreshSession();
    if (refreshed?.access_token) {
      refreshedSession = true;
      response = await executePostRequest(refreshed.access_token);
    }
  }

  const body = await parseJsonSafely(response);

  return {
    status: response.status,
    ok: response.ok,
    body,
    refreshedSession,
  };
};

export type { PostGameActionRequestParams, PostGameActionRequestResult };
