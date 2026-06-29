import type { AgentDraft, RfqRequestPayload, Taxonomy } from "@/lib/contract";
import type { RequestListItem, RequestRecord } from "@/lib/contract/requests";
import type { BidCard } from "@/lib/contract/bids";
import type { DealRoomView, DealRoomDocuments, QuotationView } from "@/lib/contract/deal-room";
import type { ComputedBid, RecommendResult, BidAskResult, BidParseResult, AwardNudgeResult, PreferencePreset, RankingPreference, RankedBid, BidEventInput } from "@/lib/contract/agent-bids";
import { mapBidFormData, mapLinkSubmissions, type BidFormData, type LinkBidSubmission, type SubmitBidFormPayload } from "@/lib/contract/link-bids";
import type { PendingResponse, RespondBody, RespondResult } from "@/lib/contract/survey";

/** Body of POST /api/me/bids/recommend. user_id is attached server-side. */
export interface RecommendPayload {
  request?: { hasRequirements?: boolean } | null;
  bids: ComputedBid[];
  preference?: RankingPreference | null;
  previous_ranking?: RankedBid[] | null;
}

/** Error kinds the UI distinguishes: empty/unreadable input (AC-09) vs connectivity (AC-10). */
export type ApiErrorKind = "empty" | "network" | "unknown";

export class ApiError extends Error {
  kind: ApiErrorKind;
  /** Backend's human-readable reason (EN) + Arabic, when the route forwards them. */
  detail?: string;
  messageAr?: string;
  backendCode?: string;
  status?: number;
  /** The real upstream backend HTTP status (e.g. agents-backend), distinct from our relay's status. */
  backendStatus?: number;
  constructor(
    kind: ApiErrorKind,
    message?: string,
    extra?: { detail?: string; messageAr?: string; backendCode?: string; status?: number; backendStatus?: number },
  ) {
    super(message ?? kind);
    this.kind = kind;
    this.name = "ApiError";
    this.detail = extra?.detail;
    this.messageAr = extra?.messageAr;
    this.backendCode = extra?.backendCode;
    this.status = extra?.status;
    this.backendStatus = extra?.backendStatus;
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
    let extra: { detail?: string; messageAr?: string; backendCode?: string; status?: number; backendStatus?: number } = { status: res.status };
    try {
      const data = (await res.json()) as { code?: ApiErrorKind; detail?: string; messageAr?: string; backendCode?: string; backendStatus?: number };
      if (data.code === "empty" || data.code === "network") code = data.code;
      extra = { ...extra, detail: data.detail, messageAr: data.messageAr, backendCode: data.backendCode, backendStatus: data.backendStatus };
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
 * How long to wait for the agent parse before giving up (AC-10 "Connection problem"). Big RFQs take
 * 30–60s, but the FIRST request after an idle period also pays a cold start (Railway wake + Lambda),
 * which can blow past 2 min — so we wait up to 4 min to ride that out before erroring.
 */
const PROCESS_TIMEOUT_MS = 240_000;

/**
 * Send the renter's input to the agent and get a drafted request (AC-04/05/06).
 * Starts an async job then polls — big RFQs take 30–60s, so a single request would time out.
 */
export async function processRfq(input: ProcessInput): Promise<AgentDraft> {
  // Tell the agent the UI locale so it writes free-text (notes/advisories/questions) in Arabic
  // even when the RFQ text is English. <html lang> is kept in sync with the locale by the i18n provider.
  const locale = typeof document !== "undefined" ? document.documentElement.lang : "en";
  const { jobId } = await postJson<{ jobId: string }>("/api/agent/process", { ...input, locale }); // throws ApiError on empty/network
  const deadline = Date.now() + PROCESS_TIMEOUT_MS;
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

/** The supplier's (other party's) documents the renter can view in a deal room. */
export function fetchDealRoomDocuments(id: string): Promise<DealRoomDocuments> {
  return getJson<DealRoomDocuments>(`/api/me/deal-rooms/${encodeURIComponent(id)}/documents`);
}

/** A bid's documents (company verification + equipment) as presigned entries — no deal room needed.
 *  Proxies the backend `GET /marketplace/bids/{id}/documents`; same shape as the deal-room docs sheet. */
export function fetchBidDocuments(id: string): Promise<DealRoomDocuments> {
  return getJson<DealRoomDocuments>(`/api/me/bids/${encodeURIComponent(id)}/documents`);
}

/** The official quotation PDF for a closed deal (app parity — backend-generated from the template). */
export function fetchQuotation(id: string): Promise<QuotationView> {
  return getJson<QuotationView>(`/api/me/deal-rooms/${encodeURIComponent(id)}/quotation`);
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
): Promise<{ requestId: string; requestIds?: string[]; requestUuids?: string[] }> {
  return postJson<{ requestId: string; requestIds?: string[]; requestUuids?: string[] }>("/api/requests", payload);
}

/* ----------------- Outcome Survey (renter) ----------------- */

/** The next pending outcome survey for the renter (one unit at a time; null when none due). */
export function fetchPendingSurvey(): Promise<PendingResponse> {
  return getJson<PendingResponse>("/api/me/surveys/pending");
}

/** Submit the renter's answer to one survey. Idempotent server-side on already-resolved surveys. */
export function respondSurvey(surveyId: string, body: RespondBody): Promise<RespondResult> {
  return postJson<RespondResult>(`/api/me/surveys/${encodeURIComponent(surveyId)}/respond`, body);
}

/* ----------------- web-app/007: Mansour judgement layer (soft) ----------------- */
// These never throw — on any miss they return the "no agent" shape so the comparison
// keeps its deterministic ranking. The matrix works fully without Mansour.

/** Ask Mansour to rank + recommend over the web-computed bids. `agent:false` → keep deterministic sort. */
export async function recommendBids(payload: RecommendPayload): Promise<{ agent: boolean; result?: RecommendResult }> {
  try {
    const res = await fetch("/api/me/bids/recommend", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), cache: "no-store" });
    if (!res.ok) return { agent: false };
    return (await res.json()) as { agent: boolean; result?: RecommendResult };
  } catch {
    return { agent: false };
  }
}

/** Conversational "Ask your assistant" — LLM reply grounded in the ranking; also returns a re-ranking. */
export async function askBids(payload: { message: string; request?: { hasRequirements?: boolean } | null; bids: ComputedBid[]; current_ranking?: RankedBid[] | null }): Promise<{ agent: boolean; result?: BidAskResult }> {
  try {
    const res = await fetch("/api/me/bids/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), cache: "no-store" });
    if (!res.ok) return { agent: false };
    return (await res.json()) as { agent: boolean; result?: BidAskResult };
  } catch {
    return { agent: false };
  }
}

/** Parse one uploaded supplier quote → a NormalizedBid (or a parse failure that adds no bid). */
export async function parseBid(payload: { message?: string; attachments?: { type: string; filename?: string; data: string }[]; request_context?: { subtype?: string | null; capacity?: string | null } }): Promise<{ agent: boolean; result?: BidParseResult }> {
  try {
    const res = await fetch("/api/me/bids/parse", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), cache: "no-store" });
    if (!res.ok) return { agent: false };
    return (await res.json()) as { agent: boolean; result?: BidParseResult };
  } catch {
    return { agent: false };
  }
}

/** Save the renter's ranking preference to their profile (durable once the agent's migration 0016 lands). */
export async function saveBidPreference(payload: { preset: PreferencePreset; require_supplier?: string[]; free_text?: string | null }): Promise<{ ok: boolean }> {
  try {
    const res = await fetch("/api/me/bids/preferences", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), cache: "no-store" });
    return (await res.json()) as { ok: boolean };
  } catch {
    return { ok: false };
  }
}

/** The post-award "make this my default" nudge. */
export async function awardLearning(payload: { awarded?: unknown; bids?: unknown[]; history?: unknown[]; confirm?: boolean }): Promise<{ agent: boolean; result?: AwardNudgeResult }> {
  try {
    const res = await fetch("/api/me/bids/award-learning", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), cache: "no-store" });
    if (!res.ok) return { agent: false };
    return (await res.json()) as { agent: boolean; result?: AwardNudgeResult };
  } catch {
    return { agent: false };
  }
}

/** Fire-and-forget capture of comparison-page actions for learning. */
export function captureBidEvents(events: BidEventInput[]): void {
  if (!events.length) return;
  try {
    fetch("/api/me/bids/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ events }), keepalive: true }).catch(() => {});
  } catch {
    /* never disrupt the UI */
  }
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

// ── web-app/006 (expanded) — shared-link bids ──────────────────────────────────────────────────

/** Public: bid-form render data for a shared-link token (request items + terms + renter name). */
export async function fetchBidFormData(token: string): Promise<BidFormData> {
  return mapBidFormData(await getJson<unknown>(`/api/bid-form/${encodeURIComponent(token)}`));
}

/** Public: submit an off-platform bid through the shared link. */
export async function submitBidForm(token: string, payload: SubmitBidFormPayload): Promise<{ id: string }> {
  return postJson<{ id: string }>(`/api/bid-form/${encodeURIComponent(token)}/submissions`, payload);
}

/** Authed (renter): a request's off-platform submissions + link tracker (opened/submitted + token). */
export async function fetchRequestSubmissions(
  requestId: string,
): Promise<{ renterName: string | null; openedCount: number; submittedCount: number; bidDeadline: string | null; logoUrl: string | null; submissions: LinkBidSubmission[] }> {
  const raw = await getJson<{ renterName?: string | null; openedCount?: number; submittedCount?: number; bidDeadline?: string | null; logoUrl?: string | null }>(
    `/api/me/requests/${encodeURIComponent(requestId)}/submissions`,
  );
  return {
    renterName: raw.renterName ?? null,
    openedCount: raw.openedCount ?? 0,
    submittedCount: raw.submittedCount ?? 0,
    bidDeadline: raw.bidDeadline ?? null,
    logoUrl: raw.logoUrl ?? null,
    submissions: mapLinkSubmissions(raw),
  };
}

/** Set / clear the request's optional bid-submission deadline (AC-04/05/06). `deadline` = ISO or null. */
export async function setBidDeadline(requestId: string, deadline: string | null): Promise<{ deadline: string | null }> {
  return postJsonMethod<{ deadline: string | null }>(`/api/me/requests/${encodeURIComponent(requestId)}/share-link`, { deadline }, "PUT");
}

/** Set / clear the renter's company logo on the request's shared bid form. `logoUrl` = data URL or null. */
export async function setShareLinkLogo(requestId: string, logoUrl: string | null): Promise<unknown> {
  return postJsonMethod(`/api/me/requests/${encodeURIComponent(requestId)}/share-link`, { logoUrl }, "PUT");
}

/** Build a request's public share link. The token IS the request's UUID; the renter-name slug is a
 *  cosmetic prefix. The /bid page extracts the trailing UUID, so a slug with dashes is safe. */
export function bidShareUrl(origin: string, requestId: string, renterName?: string | null): string {
  const slug = renterName ? renterName.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) : "";
  return `${origin}/bid/${slug ? `${slug}-` : ""}${requestId}`;
}
