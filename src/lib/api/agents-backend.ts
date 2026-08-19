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
  /** Arabic copy from the backend envelope, when it sent one — surfaced verbatim in the UI. */
  messageAr?: string;
  /**
   * The envelope's `details`, when present. Some errors are instructions rather than dead ends
   * — an export against a not-yet-ready template returns `{ fallback: "builtin_export" }`, which
   * the caller acts on. Dropping this would silently turn a graceful degrade into a hard error.
   */
  details?: unknown;
  constructor(status: number, message: string, code?: string, messageAr?: string, details?: unknown) {
    super(message);
    this.name = "AgentsBackendError";
    this.status = status;
    this.code = code;
    this.messageAr = messageAr;
    this.details = details;
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
    // Pull the backend's error code/message out of `{ error: { code, message, messageAr } }` (or the body).
    let code: string | undefined;
    let message: string | undefined;
    let messageAr: string | undefined;
    let details: unknown;
    try {
      const body = (await res.json()) as {
        error?: { code?: string; message?: string; messageAr?: string; details?: unknown };
        message?: string;
        details?: unknown;
      };
      code = body.error?.code;
      message = body.error?.message ?? body.message;
      messageAr = body.error?.messageAr;
      details = body.error?.details ?? body.details;
    } catch {
      /* non-JSON body */
    }
    throw new AgentsBackendError(
      res.status,
      message ?? `agents-backend ${path} → HTTP ${res.status}`,
      code,
      messageAr,
      details
    );
  }
  const json: unknown = await res.json();
  if (json && typeof json === "object" && "data" in json) {
    return (json as { data: T }).data;
  }
  return json as T;
}

export const agentsGet = <T>(path: string) => agentsFetch<T>(path);
export const agentsPost = <T>(path: string, body: unknown) => agentsFetch<T>(path, { method: "POST", body: JSON.stringify(body) });
export const agentsPatch = <T>(path: string, body: unknown) =>
  agentsFetch<T>(path, { method: "PATCH", body: JSON.stringify(body) });
/** No body by design — DELETE bodies are unreliable across proxies; put params in the query string. */
export const agentsDelete = <T>(path: string) => agentsFetch<T>(path, { method: "DELETE" });
