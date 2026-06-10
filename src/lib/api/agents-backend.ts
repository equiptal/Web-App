import { serverEnv } from "@/lib/config/env";

/**
 * SERVER-ONLY client for the Moedatech app agents-backend. Import only from route handlers — it
 * holds the Bearer token, which must never reach the browser. The backend wraps `/agents/*`
 * responses in a `{ success, data }` envelope — unwrap to `data` (per agent ALIGNMENT.md).
 */
async function agentsFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!serverEnv.agentsApiUrl || !serverEnv.agentsApiToken) {
    throw new Error("agents-backend not configured");
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
  if (!res.ok) throw new Error(`agents-backend ${path} → HTTP ${res.status}`);
  const json: unknown = await res.json();
  if (json && typeof json === "object" && "data" in json) {
    return (json as { data: T }).data;
  }
  return json as T;
}

export const agentsGet = <T>(path: string) => agentsFetch<T>(path);
export const agentsPost = <T>(path: string, body: unknown) => agentsFetch<T>(path, { method: "POST", body: JSON.stringify(body) });
