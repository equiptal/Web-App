import type { AgentDraft, RfqRequestPayload, Taxonomy } from "@/lib/contract";

/** Error kinds the UI distinguishes: empty/unreadable input (AC-09) vs connectivity (AC-10). */
export type ApiErrorKind = "empty" | "network" | "unknown";

export class ApiError extends Error {
  kind: ApiErrorKind;
  constructor(kind: ApiErrorKind, message?: string) {
    super(message ?? kind);
    this.kind = kind;
    this.name = "ApiError";
  }
}

export interface ProcessInput {
  text: string;
  files: { name: string; type: string; data?: string }[];
  /** Dev affordance to exercise AC-10. */
  simulateError?: boolean;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError("network");
  }
  if (!res.ok) {
    let code: ApiErrorKind = "unknown";
    try {
      const data = (await res.json()) as { code?: ApiErrorKind };
      if (data.code === "empty" || data.code === "network") code = data.code;
    } catch {
      /* ignore */
    }
    if (code === "unknown") code = res.status >= 500 ? "network" : "unknown";
    throw new ApiError(code, `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Send the renter's input to the agent and get a drafted request (AC-04/05/06).
 * Starts an async job then polls — big RFQs take 30–60s, so a single request would time out.
 */
export async function processRfq(input: ProcessInput): Promise<AgentDraft> {
  const { jobId } = await postJson<{ jobId: string }>("/api/agent/process", input); // throws ApiError on empty/network
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    let res: Response;
    try {
      res = await fetch(`/api/agent/jobs/${encodeURIComponent(jobId)}`, { cache: "no-store" });
    } catch {
      throw new ApiError("network");
    }
    if (!res.ok) throw new ApiError("network");
    const data = (await res.json()) as { status: string; draft?: AgentDraft; code?: ApiErrorKind };
    if (data.status === "done" && data.draft) return data.draft;
    if (data.status === "error") throw new ApiError(data.code ?? "network");
    await sleep(2000);
  }
  throw new ApiError("network"); // timed out
}

/** Submit the assembled broadcast (AC-42/43). */
export function submitRequest(payload: RfqRequestPayload & { simulateError?: boolean }): Promise<{ requestId: string }> {
  return postJson<{ requestId: string }>("/api/requests", payload);
}

/** Fetch the equipment taxonomy. */
export async function fetchTaxonomy(): Promise<Taxonomy> {
  try {
    const res = await fetch("/api/taxonomy");
    if (!res.ok) throw new ApiError("network");
    return (await res.json()) as Taxonomy;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError("network");
  }
}
