import { serverEnv } from "@/lib/config/env";

/**
 * SERVER-ONLY client for the Moedatech app agents-backend. Import only from route handlers — it
 * holds the Bearer token, which must never reach the browser. The backend wraps responses in a
 * `{ success|ok, data }` envelope (and errors in `{ success:false, error:{ code, message } }`).
 */

/** Carries the real backend status + error code/message so the relay can surface it (not a blank 503). */
export class AgentsBackendError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "AgentsBackendError";
    this.status = status;
    this.code = code;
  }
}

async function agentsFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!serverEnv.agentsApiUrl || !serverEnv.agentsApiToken) {
    throw new AgentsBackendError(0, "agents-backend not configured", "not_configured");
  }
  const res = await fetch(`${serverEnv.agentsApiUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serverEnv.agentsApiToken}`,
      ...init?.headers,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    // Pull the backend's error code/message out of `{ error: { code, message } }` (or the body).
    let code: string | undefined;
    let message: string | undefined;
    try {
      const body = (await res.json()) as { error?: { code?: string; message?: string }; message?: string };
      code = body.error?.code;
      message = body.error?.message ?? body.message;
    } catch {
      /* non-JSON body */
    }
    throw new AgentsBackendError(res.status, message ?? `agents-backend ${path} → HTTP ${res.status}`, code);
  }
  const json: unknown = await res.json();
  if (json && typeof json === "object" && "data" in json) {
    return (json as { data: T }).data;
  }
  return json as T;
}

export const agentsGet = <T>(path: string) => agentsFetch<T>(path);
export const agentsPost = <T>(path: string, body: unknown) => agentsFetch<T>(path, { method: "POST", body: JSON.stringify(body) });
