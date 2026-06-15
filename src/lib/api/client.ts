import type { AgentDraft, RfqRequestPayload, Taxonomy } from "@/lib/contract";
import type { RequestListItem, RequestRecord } from "@/lib/contract/requests";
import type { BidCard } from "@/lib/contract/bids";
import type { DealRoomView } from "@/lib/contract/deal-room";

/** Error kinds the UI distinguishes: empty/unreadable input (AC-09) vs connectivity (AC-10). */
export type ApiErrorKind = "empty" | "network" | "unknown";

export class ApiError extends Error {
  kind: ApiErrorKind;
  /** Backend's human-readable reason (EN) + Arabic, when the route forwards them. */
  detail?: string;
  messageAr?: string;
  backendCode?: string;
  status?: number;
  constructor(kind: ApiErrorKind, message?: string, extra?: { detail?: string; messageAr?: string; backendCode?: string; status?: number }) {
    super(message ?? kind);
    this.kind = kind;
    this.name = "ApiError";
    this.detail = extra?.detail;
    this.messageAr = extra?.messageAr;
    this.backendCode = extra?.backendCode;
    this.status = extra?.status;
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
    let extra: { detail?: string; messageAr?: string; backendCode?: string; status?: number } = { status: res.status };
    try {
      const data = (await res.json()) as { code?: ApiErrorKind; detail?: string; messageAr?: string; backendCode?: string };
      if (data.code === "empty" || data.code === "network") code = data.code;
      extra = { ...extra, detail: data.detail, messageAr: data.messageAr, backendCode: data.backendCode };
    } catch {
      /* ignore */
    }
    if (code === "unknown") code = res.status >= 500 ? "network" : "unknown";
    throw new ApiError(code, `HTTP ${res.status}`, extra);
  }
  return (await res.json()) as T;
}

/** Like postJson but with an explicit method (e.g. PATCH). */
async function postJsonMethod<T>(url: string, body: unknown, method: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new ApiError("network");
  }
  if (!res.ok) throw new ApiError(res.status >= 500 ? "network" : "unknown", `HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function getJson<T>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: "application/json" } });
  } catch {
    throw new ApiError("network");
  }
  if (!res.ok) throw new ApiError(res.status >= 500 ? "network" : "unknown", `HTTP ${res.status}`);
  return (await res.json()) as T;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Send the renter's input to the agent and get a drafted request (AC-04/05/06).
 * Starts an async job then polls — big RFQs take 30–60s, so a single request would time out.
 */
export async function processRfq(input: ProcessInput): Promise<AgentDraft> {
  // Tell the agent the UI locale so it writes free-text (notes/advisories/questions) in Arabic
  // even when the RFQ text is English. <html lang> is kept in sync with the locale by the i18n provider.
  const locale = typeof document !== "undefined" ? document.documentElement.lang : "en";
  const { jobId } = await postJson<{ jobId: string }>("/api/agent/process", { ...input, locale }); // throws ApiError on empty/network
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

/** Submit the assembled broadcast (AC-42/43). The server fans out one request per item, so
 *  `requestIds` carries every short code (`requestId` = the first, for back-compat). */
/** The renter's own requests (web-app/request-details-bids). One row per item (backend fan-out). */
export function fetchMyRequests(filter?: { status?: string; type?: string; groupId?: string }): Promise<{ requests: RequestListItem[] }> {
  const qs = new URLSearchParams();
  if (filter?.status) qs.set("status", filter.status);
  if (filter?.type) qs.set("type", filter.type);
  if (filter?.groupId) qs.set("groupId", filter.groupId);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return getJson<{ requests: RequestListItem[] }>(`/api/me/requests${suffix}`);
}

/** All requests in one submission group (multi-item view) — filtered by `requestGroupId`. */
export function fetchRequestGroup(groupId: string): Promise<{ requests: RequestListItem[] }> {
  return fetchMyRequests({ groupId });
}

/** Home activity counters (new bids, open/total requests, completed deals) for the renter hub. */
export interface ActivityCounts {
  newBids: number;
  openRequests: number;
  totalRequests: number;
  completedDeals: number;
}
export function fetchActivity(): Promise<ActivityCounts> {
  return getJson<ActivityCounts>("/api/me/activity");
}

/** Full detail for one request (every stored field + the single item + dealRoomId). */
export function fetchRequestDetail(id: string): Promise<RequestRecord> {
  return getJson<RequestRecord>(`/api/me/requests/${encodeURIComponent(id)}`);
}

/** Cancel a request (DELETE) — allowed while OPEN/ACTIVE. */
export async function cancelRequest(id: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`/api/me/requests/${encodeURIComponent(id)}`, { method: "DELETE" });
  } catch {
    throw new ApiError("network");
  }
  if (!res.ok) throw new ApiError(res.status >= 500 ? "network" : "unknown", `HTTP ${res.status}`);
}

/** Edit a request (PATCH a partial of its fields) — allowed while OPEN with 0 bids. */
export function updateRequest(id: string, patch: Record<string, unknown>): Promise<unknown> {
  return postJsonMethod(`/api/me/requests/${encodeURIComponent(id)}`, patch, "PATCH");
}

/** Bids received on a request (active then expired). */
export function fetchBids(requestId: string): Promise<{ bids: BidCard[] }> {
  return getJson<{ bids: BidCard[] }>(`/api/me/requests/${encodeURIComponent(requestId)}/bids`);
}

/** Accept a supplier's bid. */
export function acceptBid(bidId: string): Promise<unknown> {
  return postJson(`/api/me/bids/${encodeURIComponent(bidId)}/accept`, {});
}

/** Create (or fetch) the deal room for a bid → its id. */
export function startDealRoom(bidId: string): Promise<{ id: string }> {
  return postJson<{ id: string }>("/api/me/deal-rooms", { bidId });
}

/** A deal room the renter is party to. */
export function fetchDealRoom(id: string): Promise<DealRoomView> {
  return getJson<DealRoomView>(`/api/me/deal-rooms/${encodeURIComponent(id)}`);
}

/** GetStream token + channel for a deal room's live chat. */
export function fetchStreamToken(id: string): Promise<{ token: string | null; userId: string | null; channelId: string | null }> {
  return getJson(`/api/me/deal-rooms/${encodeURIComponent(id)}/stream-token`);
}

/** Counter the offer with a new rate. */
export function proposeRate(id: string, body: { proposedRate: number; priceUnit: string; message?: string }): Promise<unknown> {
  return postJson(`/api/me/deal-rooms/${encodeURIComponent(id)}/rate-proposal`, body);
}

/** Accept the current offer (accept all terms → confirm). */
export function acceptDeal(id: string, contractType = "platform"): Promise<unknown> {
  return postJson(`/api/me/deal-rooms/${encodeURIComponent(id)}/accept`, { contractType });
}

/** Resolve one negotiable term — accept the supplier's value, counter it, or reopen. */
export function resolveTerm(id: string, key: string, action: "accept" | "counter" | "reopen", value?: unknown): Promise<unknown> {
  return postJsonMethod(`/api/me/deal-rooms/${encodeURIComponent(id)}/terms/${encodeURIComponent(key)}`, { action, value }, "PATCH");
}

export function submitRequest(
  payload: RfqRequestPayload & { simulateError?: boolean },
): Promise<{ requestId: string; requestIds?: string[] }> {
  return postJson<{ requestId: string; requestIds?: string[] }>("/api/requests", payload);
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
