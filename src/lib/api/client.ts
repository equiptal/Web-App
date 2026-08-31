import type { AgentDraft, RfqRequestPayload, Taxonomy } from "@/lib/contract";
import type { RequestListItem, RequestRecord } from "@/lib/contract/requests";
import type { BidCard } from "@/lib/contract/bids";
import type { FleetMachine } from "@/lib/contract/fleet";
import type { CompanyDocsPayload } from "@/lib/contract/company-documents";
import type { DealRoomView, DealRoomDocuments, QuotationView } from "@/lib/contract/deal-room";
import type { ComputedBid, RecommendResult, BidAskResult, BidParseResult, AwardNudgeResult, PreferencePreset, RankingPreference, RankedBid, BidEventInput, NormalizedBid, TermMatch, QuoteMatchCheck } from "@/lib/contract/agent-bids";
import type { TransformRequestCtx } from "@/lib/contract/bid-form";
import { mapBidFormData, mapLinkSubmissions, type BidFormData, type LinkBidSubmission, type SubmitBidFormPayload } from "@/lib/contract/link-bids";
// DISABLED (Outcome Survey): import type { PendingResponse, RespondBody, RespondResult } from "@/lib/contract/survey";
import type { InboxBid } from "@/lib/contract/inbox";
import type { RenteeRequestDraft } from "@/lib/contract/rentee-request";
import type { NotificationList, NotificationFilter } from "@/lib/contract/notifications";
import type { Project, ProjectSummary } from "@/lib/contract/project";
import { mapProjectSummary, projectToPayload } from "@/lib/contract/project";
import { contentTypeFor } from "@/lib/contract/award";
import type { Award, AwardDocument, ChartGroup } from "@/lib/contract/award";
import type { WorkOrderItem, WorkOrderGroup } from "@/lib/contract/work-order";
import { groupWorkOrderItems, termsFromWire } from "@/lib/contract/work-order";
import type { TemplateOption } from "@/lib/contract/project-apply";
import { machineTermsOfRequestItem } from "@/lib/contract/project-apply";
import type { MachineTerms } from "@/lib/contract/work-order";

/** Body of POST /api/me/bids/recommend. user_id is attached server-side. */
export interface RecommendPayload {
  request?: { hasRequirements?: boolean } | null;
  bids: ComputedBid[];
  preference?: RankingPreference | null;
  previous_ranking?: RankedBid[] | null;
}

/** Error kinds the UI distinguishes: empty/unreadable input (AC-09) vs connectivity (AC-10). */
export type ApiErrorKind = "empty" | "network" | "unknown" | "guest_limit";

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
  const started = await postJson<{ jobId?: string; guestLimit?: boolean }>("/api/agent/process", { ...input, locale }); // throws ApiError on empty/network
  // Server guest-parse backstop (signed-out visitor over the free limit) — surface it as a distinct kind
  // the UI maps to the sign-in/account prompt, NOT a scary error.
  if (started.guestLimit) throw new ApiError("guest_limit");
  const jobId = started.jobId;
  if (!jobId) throw new ApiError("network");
  const deadline = Date.now() + PROCESS_TIMEOUT_MS;
  while (Date.now() < deadline) {
    let res: Response;
    try {
      res = await fetch(`/api/agent/jobs/${encodeURIComponent(jobId)}`, { cache: "no-store" });
    } catch {
      throw new ApiError("network");
    }
    if (!res.ok) throw new ApiError("network");
    const data = (await res.json()) as { status: string; draft?: AgentDraft; code?: ApiErrorKind; detail?: string; messageAr?: string; backendStatus?: number };
    if (data.status === "done" && data.draft) return data.draft;
    if (data.status === "error") throw new ApiError(data.code ?? "network", "agent job error", { detail: data.detail, messageAr: data.messageAr, backendStatus: data.backendStatus });
    await sleep(2000);
  }
  throw new ApiError("network"); // timed out
}

/**
 * A5 — teach Mansour from the renter's draft-vs-final edits (the web_review learning signal). Pure
 * fire-and-forget: never awaited on the submit path, swallows every error, and uses `keepalive` so the
 * POST survives the navigation to the confirmation screen. `patch` is the full corrected RFQ shape from
 * `draftToRfqCorrection`; `corrector_id`/`source` are set server-side.
 */
export async function postRfqCorrection(rfqId: string, patch: unknown, reason?: string): Promise<void> {
  try {
    await fetch(`/api/agent/rfq/${encodeURIComponent(rfqId)}/correct`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patch, reason }),
      keepalive: true,
    });
  } catch {
    /* learning is best-effort — a miss must never affect request creation */
  }
}

/** Submit the assembled broadcast (AC-42/43). The server fans out one request per item, so
 *  `requestIds` carries every short code (`requestId` = the first, for back-compat). */
/** The renter's own requests (web-app/request-details-bids). One row per item (backend fan-out). */
export function fetchMyRequests(filter?: { status?: string; type?: string; groupId?: string; page?: number; limit?: number }): Promise<{ requests: RequestListItem[] }> {
  const qs = new URLSearchParams();
  if (filter?.status) qs.set("status", filter.status);
  if (filter?.type) qs.set("type", filter.type);
  if (filter?.groupId) qs.set("groupId", filter.groupId);
  if (filter?.page) qs.set("page", String(filter.page));
  if (filter?.limit) qs.set("limit", String(filter.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return getJson<{ requests: RequestListItem[] }>(`/api/me/requests${suffix}`);
}

/**
 * Every request the renter has, across all pages. The list endpoint defaults to 20 newest and the
 * response drops the pagination `total`, so a renter with many requests would hide bids on their older
 * ones (they fall past page 1). The comparison needs the FULL set so no bid-bearing request is missed:
 * page through at the backend max (100/page) until a short page signals the end. `filter` forwards
 * status/type/groupId (never page/limit — those are managed here).
 */
export async function fetchAllMyRequests(filter?: { status?: string; type?: string; groupId?: string }): Promise<{ requests: RequestListItem[] }> {
  const PAGE = 100; // backend caps `limit` at 100 (getPagination Math.min(100, …))
  const all: RequestListItem[] = [];
  for (let page = 1; ; page++) {
    const { requests } = await fetchMyRequests({ ...filter, page, limit: PAGE });
    all.push(...requests);
    if (requests.length < PAGE) break; // last (short) page reached
    if (page >= 50) break; // hard stop (≤5000 requests) — guards against an unexpected full-page loop
  }
  return { requests: all };
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

/**
 * RMAP T16 — every qualifying machine the BID's supplier owns, for the map's fleet pins.
 *
 * Keyed by BID, not by supplier: one firm can hold several bids on one request, and `inBid` /
 * `yardConfirmed` differ between them — so a supplier-keyed cache would show one bid's offer on
 * another's map. Callers cache by `bidId` for the same reason.
 */
export function fetchBidFleet(bidId: string): Promise<{ machines: FleetMachine[] }> {
  return getJson<{ machines: FleetMachine[] }>(`/api/me/bids/${encodeURIComponent(bidId)}/fleet`);
}

/**
 * V14/V15 — the BID supplier's company papers, presigned, for the renter's company panel
 * (RM3-AC-68 / AC-69 / AC-70). The sibling of `fetchBidFleet`: one serves the firm's machines, this
 * one its paperwork, and both are bid-scoped because the backend derives the supplier FROM the bid.
 *
 * **A READ, and only a read.** Opening the company panel creates no deal room (004a §4.5) — a
 * `DealRoom` row freezes the supplier's offered count — so this is a `GET` all the way down and must
 * never be routed through `startDealRoom`.
 *
 * Cached by `bidId` by its caller, for `fetchBidFleet`'s reason: one firm can hold several bids on one
 * request, and the papers are fetched through the bid's own access check.
 */
export function fetchBidCompanyDocuments(bidId: string): Promise<CompanyDocsPayload> {
  return getJson<CompanyDocsPayload>(`/api/me/bids/${encodeURIComponent(bidId)}/company-documents`);
}

/**
 * Spec 004 V1 — ONE bid and the request it answers, by `bidId` alone.
 *
 * The equipment-verification surface is a route (`/bids/[bidId]/equipment`), so it has no request id
 * to list by and no caller to inherit one from. This is a READ: opening the surface creates no deal
 * room, because a `DealRoom` row would freeze the supplier's offered count.
 */
export function fetchBidDetail(bidId: string): Promise<{ bid: BidCard; request: RequestRecord | null }> {
  return getJson<{ bid: BidCard; request: RequestRecord | null }>(`/api/me/bids/${encodeURIComponent(bidId)}`);
}

/** Accept a supplier's bid. */
export function acceptBid(bidId: string): Promise<unknown> {
  return postJson(`/api/me/bids/${encodeURIComponent(bidId)}/accept`, {});
}

/** Create (or fetch) the deal room for a bid → its id.
 *
 *  **This WRITES.** A `DealRoom` row freezes the supplier's offered count (`BID_OFFER_LOCKED`), so it
 *  is called only by the three room-creating acts (004a §4.5): negotiate/accept, sending a request
 *  card, and sending the first chat message. Never by opening, selecting or reading. */
export function startDealRoom(bidId: string): Promise<{ id: string }> {
  return postJson<{ id: string }>("/api/me/deal-rooms", { bidId });
}

/** V11 — post one `rentee_request` card into a deal room's conversation (spec 004 §6.7).
 *  `ref` is minted and `serial` stamped server-side; neither is accepted from here (§7.3). */
export function sendRenteeRequest(
  dealRoomId: string,
  draft: RenteeRequestDraft,
): Promise<{ ref: string; messageId: string }> {
  return postJson<{ ref: string; messageId: string }>(
    `/api/me/deal-rooms/${encodeURIComponent(dealRoomId)}/requests`,
    draft,
  );
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
export function proposeRate(
  id: string,
  body: {
    proposedRate: number; priceUnit: string; mobPrice?: number; demobPrice?: number; message?: string;
    // deal-room/negotiation — per-type unit counts (pending, ride the rate_proposal chat) + leg exclusion.
    rentalUnits?: number; mobUnits?: number; demobUnits?: number; mobExcluded?: boolean; demobExcluded?: boolean;
  },
): Promise<unknown> {
  return postJson(`/api/me/deal-rooms/${encodeURIComponent(id)}/rate-proposal`, body);
}

/** A batched term resolution — matches the app's `{ termKey, action, value? }`. */
export type TermUpdate = { termKey: string; action: string; value?: unknown };

/**
 * Accept the current offer (accept-all-terms). App parity: `contractType` defaults to `"formal"`, the
 * locally-collected `termResolutions` are submitted together, and `agreedUnits` is only sent for
 * assembled multi-supplier deals (the web has none → omit it).
 */
export function acceptDeal(
  id: string,
  contractType = "formal",
  opts?: {
    termResolutions?: TermUpdate[]; agreedUnits?: number;
    // deal-room/negotiation — matched mob/demob unit counts + leg exclusion, written on accept.
    mobUnits?: number; demobUnits?: number; mobExcluded?: boolean; demobExcluded?: boolean;
  },
): Promise<unknown> {
  const body: Record<string, unknown> = { contractType };
  if (opts?.termResolutions && opts.termResolutions.length) body.termResolutions = opts.termResolutions;
  if (opts?.agreedUnits != null) body.agreedUnits = opts.agreedUnits;
  if (opts?.mobUnits != null) body.mobUnits = opts.mobUnits;
  if (opts?.demobUnits != null) body.demobUnits = opts.demobUnits;
  if (opts?.mobExcluded != null) body.mobExcluded = opts.mobExcluded;
  if (opts?.demobExcluded != null) body.demobExcluded = opts.demobExcluded;
  return postJson(`/api/me/deal-rooms/${encodeURIComponent(id)}/accept`, body);
}

/** Reopen an accepted (CLOSED) deal room for re-negotiation (app parity: "release"). Flips CLOSED →
 *  NEGOTIATING and re-arms the bid so the renter can re-negotiate + re-confirm (re-issues the quotation). */
export function releaseDeal(id: string, reason?: string): Promise<unknown> {
  return postJson(`/api/me/deal-rooms/${encodeURIComponent(id)}/release`, reason ? { reason } : {});
}

/**
 * Abandon this negotiation, with the renter's stated reason (app parity: the cancel-reasons modal).
 *
 * Distinct from every other exit the room has. `releaseDeal` reopens a deal already WON;
 * `withdrawAcceptance` takes back a pending acceptance. This one ends a negotiation that never got
 * there — the room goes ABANDONED and the reason is posted into the conversation, so the supplier is
 * told rather than left watching a room go quiet.
 */
export function closeDealRoom(id: string, reasonText?: string): Promise<unknown> {
  return postJson(`/api/me/deal-rooms/${encodeURIComponent(id)}/close`, reasonText ? { reasonText } : {});
}

/** Withdraw a pending acceptance (app parity: "withdraw acceptance"). Flips
 *  AWAITING_SUPPLIER_CONFIRMATION → NEGOTIATING, clears reserved units, re-arms the bid. */
export function withdrawAcceptance(id: string): Promise<unknown> {
  return postJson(`/api/me/deal-rooms/${encodeURIComponent(id)}/withdraw`, {});
}

/** Submit all locally-collected term resolutions at once (app parity — batched with the rate counter). */
export function batchUpdateTerms(id: string, updates: TermUpdate[], note?: string): Promise<unknown> {
  return postJson(`/api/me/deal-rooms/${encodeURIComponent(id)}/terms/batch`, { updates, note });
}

/** Resolve one negotiable term (legacy single-term PATCH — retained for callers outside the deal room). */
export function resolveTerm(id: string, key: string, action: "accept" | "counter" | "reopen", value?: unknown): Promise<unknown> {
  return postJsonMethod(`/api/me/deal-rooms/${encodeURIComponent(id)}/terms/${encodeURIComponent(key)}`, { action, value }, "PATCH");
}

export function submitRequest(
  payload: RfqRequestPayload & { simulateError?: boolean; isTrial?: boolean },
): Promise<{
  requestId: string;
  requestIds?: string[];
  requestUuids?: string[];
  isTrial?: boolean;
  trialExpiresAt?: string | null;
}> {
  return postJson("/api/requests", payload);
}

/**
 * mobile/016 (AC-09) — tell the backend a trial's sample bids have rendered, which consumes the
 * account's first-request slot so the home "Start Your Request" pop-up stops appearing. Fire once per
 * trial, only after bids are actually on screen; failures are ignored (the slot just stays open).
 */
export function confirmTrialRendered(requestId: string): Promise<{ consumed?: boolean }> {
  return postJson(`/api/me/requests/${encodeURIComponent(requestId)}/trial-rendered`, {});
}

/* ----------------- Outcome Survey (renter) — DISABLED ----------------- */
/* Feature switched off; see docs/surveys-disabled.md. Both callers lived in SurveyProvider,
   which is itself commented out, so nothing references these.

/** The next pending outcome survey for the renter (one unit at a time; null when none due). *\/
export function fetchPendingSurvey(): Promise<PendingResponse> {
  return getJson<PendingResponse>("/api/me/surveys/pending");
}

/** Submit the renter's answer to one survey. Idempotent server-side on already-resolved surveys. *\/
export function respondSurvey(surveyId: string, body: RespondBody): Promise<RespondResult> {
  return postJson<RespondResult>(`/api/me/surveys/${encodeURIComponent(surveyId)}/respond`, body);
}
*/

/* ----------------- Inbox / deal-room-per-bid (renter) ----------------- */

/** Every bid offered to the renter (across all RFQs) + per-bid deal-room status & unread count. */
export function fetchReceivedBids(filter?: { status?: string; page?: number; limit?: number }): Promise<{ bids: InboxBid[] }> {
  const qs = new URLSearchParams();
  if (filter?.status) qs.set("status", filter.status);
  if (filter?.page) qs.set("page", String(filter.page));
  if (filter?.limit) qs.set("limit", String(filter.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return getJson<{ bids: InboxBid[] }>(`/api/me/received-bids${suffix}`);
}

/** Total unread deal-room messages for the renter (role-scoped) — drives the inbox badge. */
export function fetchDealRoomUnread(): Promise<{ total: number }> {
  return getJson<{ total: number }>("/api/me/deal-rooms/unread-count");
}

/* ----------------- notifications (bell) ----------------- */

/** One page of the renter's notifications (already localized by the BFF from the UI locale). */
export function fetchNotifications(opts?: { page?: number; filter?: NotificationFilter }): Promise<NotificationList> {
  const qs = new URLSearchParams();
  qs.set("page", String(opts?.page ?? 1));
  if (opts?.filter) qs.set("filter", opts.filter);
  return getJson<NotificationList>(`/api/me/notifications?${qs.toString()}`);
}

/** Unread notification count for the bell badge — the backend has no count endpoint, so we read
 *  `meta.total` from an unread-filtered list (page 1). */
export async function fetchNotificationsUnreadCount(): Promise<number> {
  const list = await fetchNotifications({ page: 1, filter: "unread" });
  return list.meta.total;
}

/** Mark one notification read. */
export function markNotificationRead(id: string): Promise<unknown> {
  return postJsonMethod(`/api/me/notifications/${encodeURIComponent(id)}/read`, {}, "PUT");
}

/** Mark every notification read → the number cleared. */
export function markAllNotificationsRead(): Promise<{ count: number }> {
  return postJsonMethod<{ count: number }>("/api/me/notifications/read-all", {}, "PUT");
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

/** Result of /bids/transform — a raw extracted bid + per-term signals for the renter-verify screen. */
export interface BidTransformResult {
  bid: NormalizedBid;
  term_matches: TermMatch[];
  match: QuoteMatchCheck;
  has_request: boolean;
}

/** Quote → raw bid + term signals (renter then verifies). `request` optional — omit for a bare quote. */
export async function transformBid(payload: { attachments: { type: string; filename?: string; data: string }[]; message?: string; request?: TransformRequestCtx | null }): Promise<{ agent: boolean; result?: BidTransformResult }> {
  try {
    const res = await fetch("/api/me/bids/transform", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), cache: "no-store" });
    if (!res.ok) return { agent: false };
    return (await res.json()) as { agent: boolean; result?: BidTransformResult };
  } catch {
    return { agent: false };
  }
}

/** Commit the renter-verified draft → a comparison-ready bid (agent strips VAT + feeds the learn loop). */
export async function commitBid(payload: { source_file: string | null; extracted: NormalizedBid; corrected: NormalizedBid; vat_mode: "incl" | "excl" }): Promise<{ agent: boolean; result?: { bid: NormalizedBid; changed: boolean } }> {
  try {
    const res = await fetch("/api/me/bids/commit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), cache: "no-store" });
    if (!res.ok) return { agent: false };
    return (await res.json()) as { agent: boolean; result?: { bid: NormalizedBid; changed: boolean } };
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

/** Content types + size the bid-form upload accepts (mirrors the agents backend). */
export const BID_UPLOAD_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"] as const;
export const BID_UPLOAD_MAX_BYTES = 10 * 1024 * 1024; // 10MB

export interface BidUploadInput { file: File; folder: "photos" | "documents"; type: string }
export interface BidUploadedFile { key: string; type: string; filename: string }

/** Throws a user-facing reason if a file isn't an allowed type / is too big (AC-06). */
export function validateBidFile(file: File): string | null {
  if (!(BID_UPLOAD_TYPES as readonly string[]).includes(file.type)) return "unsupported_type";
  if (file.size > BID_UPLOAD_MAX_BYTES) return "too_large";
  return null;
}

/**
 * Presign (via the BFF) then PUT each file straight to S3, returning the classified {key,type,filename}
 * to include in the submit payload. Pre-validates type + size. Throws on a failed presign/PUT so the
 * caller can surface it. `key` is the plain S3 key (NOT the presigned URL) — that's what submit expects.
 */
export async function uploadBidFiles(token: string, inputs: BidUploadInput[]): Promise<BidUploadedFile[]> {
  if (!inputs.length) return [];
  for (const i of inputs) {
    const bad = validateBidFile(i.file);
    if (bad) throw new Error(bad);
  }
  const presign = await postJson<{ uploads: { filename: string; key: string; url: string; contentType: string }[] }>(
    `/api/bid-form/${encodeURIComponent(token)}/upload-urls`,
    { files: inputs.map((i) => ({ filename: i.file.name, contentType: i.file.type, folder: i.folder })) },
  );
  const uploads = presign.uploads ?? [];
  await Promise.all(
    uploads.map(async (u, k) => {
      const res = await fetch(u.url, { method: "PUT", headers: { "Content-Type": inputs[k].file.type }, body: inputs[k].file });
      if (!res.ok) throw new Error("upload_failed");
    }),
  );
  return uploads.map((u, k) => ({ key: u.key, type: inputs[k].type, filename: u.filename }));
}

/** Authed (renter): a request's off-platform submissions + link tracker (opened/submitted + token). */
export async function fetchRequestSubmissions(
  requestId: string,
): Promise<{ renterName: string | null; openedCount: number; submittedCount: number; bidDeadline: string | null; logoUrl: string | null; groupRef: string | null; submissions: LinkBidSubmission[] }> {
  const raw = await getJson<{ renterName?: string | null; openedCount?: number; submittedCount?: number; bidDeadline?: string | null; logoUrl?: string | null; groupRef?: string | null }>(
    `/api/me/requests/${encodeURIComponent(requestId)}/submissions`,
  );
  const submissions = mapLinkSubmissions(raw);
  return {
    renterName: raw.renterName ?? null,
    openedCount: raw.openedCount ?? 0,
    submittedCount: raw.submittedCount ?? 0,
    bidDeadline: raw.bidDeadline ?? null,
    logoUrl: raw.logoUrl ?? null,
    // The RFQ group short code (RFQ-NNNNN). The backend returns it per-submission (and/or top-level) —
    // surface whichever is present so the RFQ tabs + quotation show it.
    groupRef: raw.groupRef ?? submissions.find((x) => x.groupRef)?.groupRef ?? null,
    submissions,
  };
}

/** Set / clear the request's optional bid-submission deadline (AC-04/05/06). `deadline` = ISO or null. */
export async function setBidDeadline(requestId: string, deadline: string | null): Promise<{ deadline: string | null }> {
  return postJsonMethod<{ deadline: string | null }>(`/api/me/requests/${encodeURIComponent(requestId)}/share-link`, { deadline }, "PUT");
}

/** Renter's pre-conversion "Negotiate" message on an off-platform submission (relay → agents).
 *  Appends `{ text, at }` to the submission's `rentee_messages`; ops is emailed on the first. */
export async function postSubmissionMessage(requestId: string, submissionId: string, text: string): Promise<void> {
  await postJson(`/api/me/requests/${encodeURIComponent(requestId)}/bid-submissions/${encodeURIComponent(submissionId)}/messages`, { text });
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


/* ============================================================================================== *
 * PROJECTS — the renter's sites, their work orders, and who supplies what (web-app/007, W-T3)
 * ============================================================================================== */

/**
 * Somebody else wrote to this site first.
 *
 * Awards live in one blob on the project row, so every write carries the `version` it read and the
 * backend refuses a stale one. That is not an edge case to hide: two people share a site, and one
 * person double-tapping Save or retrying a flaky request produces exactly the same thing.
 *
 * It carries `currentVersion` so a caller can re-read and re-apply rather than telling the renter
 * "something went wrong" and leaving them to retry into the same wall.
 */
export class ProjectVersionConflict extends Error {
  currentVersion: number | null;
  constructor(currentVersion: number | null) {
    super("project_version_stale");
    this.name = "ProjectVersionConflict";
    this.currentVersion = currentVersion;
  }
}

/**
 * The two other 409s an award write can answer with. Both are instructions, not dead ends:
 * `units_exceed_quantity` means the line has fewer units left than were promised, and
 * `request_not_filed` means the request has no site yet — so the UI opens the project picker
 * instead of showing an error.
 */
export type AwardRefusal = "units_exceed_quantity" | "request_not_filed";

export class AwardRefused extends Error {
  reason: AwardRefusal;
  details: unknown;
  constructor(reason: AwardRefusal, details: unknown) {
    super(reason);
    this.name = "AwardRefused";
    this.reason = reason;
    this.details = details;
  }
}

type ProjectFetchInit = { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown };

/**
 * One fetch for every project call.
 *
 * It exists rather than reusing `postJsonMethod` for one reason: that helper collapses any failure
 * into `ApiError("unknown")`, and here the backend's **code** is the whole message. A stale version,
 * a units overrun and an unfiled request are three different things a renter can act on, and they
 * all arrive as 409.
 */
async function projectFetch<T>(url: string, init: ProjectFetchInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? "GET",
      headers: init.body === undefined ? { Accept: "application/json" } : { "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError("network");
  }

  /**
   * A 204 has no body to parse. `deleteProject` answers one, and `res.json()` on an empty body
   * rejects — so a delete that had already succeeded threw its way out as a network error.
   */
  if (res.status === 204) return undefined as T;
  if (res.ok) return (await res.json()) as T;

  let code: string | undefined;
  let details: unknown;
  try {
    const body = (await res.json()) as { code?: string; error?: { code?: string }; details?: unknown };
    code = body.code ?? body.error?.code;
    details = body.details;
  } catch {
    /* non-JSON body */
  }

  if (res.status === 409) {
    /**
     * TWO codes, one meaning. The awards handlers answer `PROJECT_VERSION_STALE`; `updateProject`
     * and the two work-order writes answer `PROJECT_VERSION_CONFLICT`. Both carry `currentVersion`
     * and both want the same response — re-read, re-apply — so both land here. Knowing only one of
     * them turned "somebody saved first" into a bare unknown error with no way forward.
     */
    if (code === "PROJECT_VERSION_STALE" || code === "PROJECT_VERSION_CONFLICT") {
      const current = (details as { currentVersion?: number } | undefined)?.currentVersion;
      throw new ProjectVersionConflict(typeof current === "number" ? current : null);
    }
    if (code === "UNITS_EXCEED_QUANTITY") throw new AwardRefused("units_exceed_quantity", details);
    if (code === "REQUEST_NOT_FILED") throw new AwardRefused("request_not_filed", details);
  }

  throw new ApiError(res.status >= 500 ? "network" : "unknown", `HTTP ${res.status}`, {
    status: res.status,
    backendCode: code,
  });
}

const projectPath = (id: string) => `/api/projects/${encodeURIComponent(id)}`;

/* ----------------------------- Sites ----------------------------- */

/** Every site this company has, newest first, with the roll-up each card shows. */
export async function listProjects(): Promise<ProjectSummary[]> {
  const rows = await projectFetch<Record<string, unknown>[]>("/api/projects");
  return rows.map(mapProjectSummary);
}

export async function fetchProject(id: string): Promise<ProjectSummary> {
  return mapProjectSummary(await projectFetch<Record<string, unknown>>(projectPath(id)));
}

export async function createProject(p: Pick<Project, "title" | "location" | "defaults">): Promise<ProjectSummary> {
  return mapProjectSummary(await projectFetch<Record<string, unknown>>("/api/projects", { method: "POST", body: projectToPayload(p) }));
}

/**
 * Edit a site.
 *
 * `applyToRequests` is the renter's explicit tick, and the ONLY way a project edit reaches anything
 * already filed under it. Left empty, nothing propagates — which is the point of the whole design:
 * a request copied its values at submit and never reads its project again, so a site edited in
 * November cannot silently rewrite an RFQ posted in September.
 */
export async function updateProject(
  id: string,
  /**
   * The version the form was opened on. **Required by the backend**, not optional — an edit without
   * it fails its schema before any handler code runs, which is why every save of an existing site
   * used to answer 422 while creating a new one worked.
   */
  expectedVersion: number,
  p: Pick<Project, "title" | "location" | "defaults">,
  applyToRequests: string[] = [],
): Promise<ProjectSummary> {
  const body = { ...projectToPayload(p), expectedVersion, applyToRequests };
  return mapProjectSummary(await projectFetch<Record<string, unknown>>(projectPath(id), { method: "PATCH", body }));
}

/** Refused with 409 while anything is filed under the site — never a cascade. */
/**
 * Name one row on a site's chart, or clear its name with `null`.
 *
 * A MERGE on the backend: only this key moves. Sending the whole map would let two renters renaming
 * two different rows overwrite each other, and the version check could not tell — both writes are
 * well formed.
 *
 * Work orders do NOT come through here: they have a title of their own, written by the work-order
 * PATCH, which follows the order wherever it goes.
 */
export async function renameRequestRow(
  projectId: string,
  expectedVersion: number,
  requestId: string,
  title: string | null,
): Promise<void> {
  await projectFetch(projectPath(projectId), {
    method: "PATCH",
    body: { expectedVersion, labels: { [requestId]: title } },
  });
}

/**
 * Record that a machine arrived, or left — without needing an award to hang it on.
 *
 * A MERGE on the backend, per row and per field: sending only `mobilizedAt` cannot clear a
 * `demobilizedAt` recorded an hour ago, and two renters marking two different machines cannot
 * overwrite one another.
 *
 * Awards keep their own marks, which are finer: two units from one vendor can arrive while a third
 * from another has not. This is the row's own answer, for the case where nobody has been awarded
 * anything yet.
 */
export async function markRow(
  projectId: string,
  expectedVersion: number,
  rowId: string,
  patch: { mobilizedAt?: string | null; demobilizedAt?: string | null },
): Promise<void> {
  await projectFetch(projectPath(projectId), {
    method: "PATCH",
    body: { expectedVersion, marks: { [rowId]: patch } },
  });
}

export async function deleteProject(id: string): Promise<void> {
  await projectFetch(projectPath(id), { method: "DELETE" });
}

/**
 * File a request under a site, move it between sites, or unfile it with `null`.
 *
 * **Filing changes no value on the request**, even where the new site says something different, and
 * it is allowed after bids because it is not an edit. Moving between sites does drop the request's
 * awards — name what is lost in the confirm before calling this.
 */
export async function assignToProject(requestId: string, projectId: string | null): Promise<void> {
  // NOT `/api/me/requests/{id}` — that is the edit, which is refused after bids and spends the
  // renter's one edit. Filing has its own route for exactly that reason.
  await projectFetch(`/api/me/requests/${encodeURIComponent(requestId)}/project`, { method: "PATCH", body: { projectId } });
}

/* ----------------------------- The chart ----------------------------- */

export interface ProjectChart {
  project: ProjectSummary;
  /** The version every award write must send back. Read it here, not from a stale card. */
  version: number;
  groups: ChartGroup[];
  /**
   * Papers filed against the SITE rather than any one award — a framework agreement, a permit.
   *
   * ⚠️ The backend has sent these since the chart existed and this client **dropped them on the
   * floor**, so a paper filed at site level was invisible in the web: attachable through the API,
   * listed nowhere. Nothing failed, which is why it lasted.
   */
  documents: AwardDocument[];
}

/** Everything the site's timeline draws, in one call. */
export async function fetchChart(projectId: string): Promise<ProjectChart> {
  const raw = await projectFetch<{
    project: Record<string, unknown>;
    version?: number;
    groups?: ChartGroup[];
    documents?: AwardDocument[];
  }>(`${projectPath(projectId)}/chart`);
  return {
    project: mapProjectSummary(raw.project),
    version: typeof raw.version === "number" ? raw.version : (mapProjectSummary(raw.project).version ?? 1),
    groups: raw.groups ?? [],
    documents: raw.documents ?? [],
  };
}

/* ----------------------------- Work orders ----------------------------- */

/** The site's own machines, already grouped into work orders. */
export async function listWorkOrders(projectId: string): Promise<WorkOrderGroup[]> {
  /**
   * ⚠️ **The backend already groups these.** It answers
   * `{ version, workOrders: [{ workOrderGroupId, title, when, items: [...] }] }`, and this function
   * used to hand that OBJECT to `groupWorkOrderItems`, which expects a flat array of machines each
   * carrying its own `workOrderGroupId`. So it re-grouped data that was already grouped, reading a
   * key that does not exist at item level.
   *
   * The damage was quiet, which is why it lasted. Every group came back with `id: undefined`, so:
   *
   *  · `fetchTemplateTerms` looked its group up by id, never matched, and returned `null` — a
   *    work-order template silently copied NO terms, which is exactly the thing a template is for.
   *  · `startEditOrder` could not find the order either, and refused to open the form. That refusal
   *    is what surfaced it (owner, 2026-08-31), because it is the one path that says so out loud
   *    instead of quietly doing nothing.
   *
   * Read the shape the backend actually sends. `groupWorkOrderItems` stays for the callers that do
   * receive a flat list.
   */
  const raw = await projectFetch<{ workOrders?: unknown[] } | unknown[]>(
    `${projectPath(projectId)}/work-orders`,
  );

  // Tolerant of both shapes: a flat array is still grouped the old way rather than dropped.
  if (Array.isArray(raw)) return groupWorkOrderItems(raw as WorkOrderItem[]);

  const groups = Array.isArray(raw?.workOrders) ? raw.workOrders : [];

  return groups.map((g) => {
    const row = (g ?? {}) as Record<string, unknown>;
    const when = (row.when ?? {}) as Record<string, unknown>;
    const items = Array.isArray(row.items) ? (row.items as Record<string, unknown>[]) : [];
    const groupId = String(row.workOrderGroupId ?? "");

    const header: WorkOrderGroup["when"] = {
      rentalBasis: (when.rentalBasis ?? null) as WorkOrderGroup["when"]["rentalBasis"],
      extendable: (when.extendable ?? null) as boolean | null,
      startDate: (when.startDate ?? null) as string | null,
      endDate: (when.endDate ?? null) as string | null,
      hoursPerDay: (when.hoursPerDay ?? null) as number | null,
    };

    return {
      id: groupId,
      projectId: (row.projectId ?? null) as string | null,
      title: (row.title ?? null) as string | null,
      when: header,
      whenConflictAck: row.whenConflictAck === true,
      items: items.map((it, i) => ({
        id: String(it.id ?? ""),
        // Restored from the group, which is the only place the backend puts it.
        workOrderGroupId: groupId,
        sortOrder: typeof it.sortOrder === "number" ? it.sortOrder : i,
        projectId: (row.projectId ?? null) as string | null,
        title: (row.title ?? null) as string | null,
        when: header,
        whenConflictAck: row.whenConflictAck === true,
        ref: {
          categoryId: (it.categoryId ?? null) as string | null,
          subcategoryId: (it.subcategoryId ?? null) as string | null,
          measurementId: (it.measurementId ?? null) as string | null,
        },
        rawLabel: (it.rawLabel ?? null) as string | null,
        rawSize: (it.rawSize ?? null) as string | null,
        quantity: typeof it.quantity === "number" ? it.quantity : 1,
        attachmentIds: Array.isArray(it.attachmentIds) ? (it.attachmentIds as string[]) : [],
        customAttachments: Array.isArray(it.customAttachments) ? (it.customAttachments as string[]) : [],
        // The stored blob → the app's shape. This is the value the edit form reads back.
        terms: termsFromWire(it.terms),
        notes: (it.notes ?? null) as string | null,
      })) as WorkOrderItem[],
    };
  });
}

/**
 * Save a work order — create when `groupId` is absent, edit when it is there.
 *
 * **Send every machine's `id`.** The backend upserts by id; a machine sent without one is created
 * fresh, and the awards, marks and purchase orders keyed to the id it used to have are scrubbed —
 * because the renter renamed it. This is the single most expensive mistake available on this call.
 */
/**
 * Create or update one work order.
 *
 * `groupId` decides the route and **never travels in the body**: both work-order schemas are
 * `.strict()`, so an unknown key is a 422 rather than a field politely ignored. `expectedVersion` is
 * required on create (the order writes awards into the project's blob) and absent on update (it does
 * not). That asymmetry is the backend's, not ours — sending the field to the update would fail the
 * same strict check.
 */
export async function saveWorkOrder(
  projectId: string,
  expectedVersion: number,
  payload: { groupId?: string; body: Record<string, unknown> },
): Promise<void> {
  if (payload.groupId) {
    await projectFetch(`/api/work-orders/${encodeURIComponent(payload.groupId)}`, { method: "PATCH", body: payload.body });
    return;
  }
  await projectFetch(`${projectPath(projectId)}/work-orders`, {
    method: "POST",
    body: { ...payload.body, expectedVersion },
  });
}

/** Deletes the machines AND their awards. The confirm counts both before this is called. */
export async function deleteWorkOrder(groupId: string): Promise<void> {
  await projectFetch(`/api/work-orders/${encodeURIComponent(groupId)}`, { method: "DELETE" });
}

/* ----------------------------- Awards ----------------------------- */

export interface AwardInput {
  requestId?: string | null;
  workOrderItemId?: string | null;
  supplierId?: string | null;
  supplierName: string;
  units: number;
  rentalBasis?: Award["rentalBasis"];
  rateAmount?: number | null;
  /**
   * Haulage, priced separately from the rental because it is charged once and the rate recurs.
   *
   * OMIT rather than send 0: the backend's schema is `.partial()`, and "not recorded" and "agreed,
   * free" are different facts about a supplier. Declared here so the award dialog's two new boxes
   * are typed rather than riding through on a spread that TypeScript does not check.
   */
  mobilizationAmount?: number | null;
  demobilizationAmount?: number | null;
}

/** Every award write answers with the site's new version. Hold it — the next write sends it. */
export interface AwardWriteResult {
  award?: Award;
  version: number;
}

export async function saveAward(projectId: string, expectedVersion: number, input: AwardInput): Promise<AwardWriteResult> {
  return projectFetch<AwardWriteResult>(`${projectPath(projectId)}/awards`, {
    method: "POST",
    /**
     * `rentalBasis` is REQUIRED and non-nullable on the way out, while the dialog lets it sit empty
     * — a renter recording *who and how many* has often not been told *per what* yet. Monthly is the
     * backend's own default for the same field on a work order, so an unanswered question reads the
     * same on both paths instead of refusing the award outright.
     */
    body: { ...input, rentalBasis: input.rentalBasis ?? "monthly", expectedVersion },
  });
}

/**
 * Set or clear a mark. `mobilizedAt: null` undoes it.
 *
 * Dates, not flags, and no ordering rule between the two: *when* is the only thing the timeline can
 * draw, and the only thing worth comparing against the date that was agreed.
 */
export async function markAward(
  projectId: string,
  awardId: string,
  expectedVersion: number,
  marks: { mobilizedAt?: string | null; demobilizedAt?: string | null },
): Promise<AwardWriteResult> {
  return projectFetch<AwardWriteResult>(`${projectPath(projectId)}/awards/${encodeURIComponent(awardId)}`, {
    method: "PATCH",
    body: { ...marks, expectedVersion },
  });
}

/**
 * Un-award. Never refused, including with documents attached — they go with it.
 *
 * The version rides in the query string because a `DELETE` body is not reliably forwarded by every
 * layer between here and the backend.
 */
export async function deleteAward(projectId: string, awardId: string, expectedVersion: number): Promise<AwardWriteResult> {
  return projectFetch<AwardWriteResult>(
    `${projectPath(projectId)}/awards/${encodeURIComponent(awardId)}?expectedVersion=${expectedVersion}`,
    { method: "DELETE" },
  );
}

/**
 * Run an award write, and re-run it once against a fresher version if somebody got there first.
 *
 * The retry is safe for the marks and for a delete, which land on the same value whatever order
 * they arrive in. **It is not offered for creating an award**: replaying a create after someone
 * else's write can promise the same units twice, so `saveAward` is called directly and its conflict
 * is shown to the renter.
 */
export async function withFreshVersion<T>(
  projectId: string,
  version: number,
  write: (version: number) => Promise<T>,
): Promise<T> {
  try {
    return await write(version);
  } catch (err) {
    if (!(err instanceof ProjectVersionConflict)) throw err;
    const fresh = err.currentVersion ?? (await fetchChart(projectId)).version;
    return write(fresh);
  }
}

/* ----------------------------- Templates ----------------------------- */

/**
 * What this site can be started FROM: its work orders and the requests already posted for it.
 *
 * Read off the chart, which already carries both kinds with their refs, their first machine and
 * their own period — so the picker costs the one call the page was going to make anyway.
 *
 * **Project-scoped.** A renter's first request on a new site has nothing to copy, even though their
 * last site's terms are usually right. Cross-project templates are deliberately out of v1: the
 * moment the list spans sites it needs grouping, search and a rule about which site's terms win,
 * and none of that earns its place before anyone has asked for it.
 */
export async function listTemplates(projectId: string): Promise<TemplateOption[]> {
  const chart = await fetchChart(projectId);
  /* One entry per MACHINE. Per group, a renter with a crane and a generator on one order could
     reach the crane and never the generator — and terms belong to a machine, not to the order it
     happens to sit in. */
  return chart.groups.flatMap((g) =>
    g.items.map((it) => ({
      id: g.id,
      kind: g.kind,
      ref: g.title?.trim() || g.ref,
      itemId: it.id,
      machine: it.label,
      quantity: it.quantity,
      when: g.when,
    })),
  );
}

/**
 * The terms behind one template, fetched only when the renter actually picks it.
 *
 * **A one-time copy.** The source is never read again, so deleting that work order next month
 * changes nothing about the requests that started from it.
 *
 * It copies the machine TERMS and nothing else. Never the equipment — category, subtype, size,
 * quantity and accessories always come from the text the renter typed, because a template that
 * silently added a machine would post an RFQ for something nobody asked for. And never the budget:
 * a ceiling is a number about one hire, and a stale one filters out every real bid with no error
 * shown to anyone.
 */
export async function fetchTemplateTerms(projectId: string, option: TemplateOption): Promise<MachineTerms | null> {
  if (option.kind === "work_order") {
    const groups = await listWorkOrders(projectId);
    const group = groups.find((g) => g.id === option.id);
    /* THAT machine's terms, by id — not the group's first. Machines on one order legitimately
       differ, and copying the first one's answers while naming the second is worse than copying
       nothing: the renter has no reason to doubt what they asked for.

       ⚠️ Looked up ACROSS every group rather than inside the one whose id matches. The group lookup
       above returned undefined for months, because `listWorkOrders` re-grouped already-grouped data
       and lost every group id — so this returned null and a work-order template copied no terms at
       all, silently. The machine id is unique on its own; going through the group added a way to
       fail and nothing else.

       ⚠️ And NO second conversion. `listWorkOrders` already returns `MachineTerms`; this used to run
       `termsFromWire` over that result, which reads WIRE keys (`delivery`, `ret`, `year`, `operator`)
       off an object that carries the app's (`deliveryOverride`, `returnOverride`, …). It found none,
       so it answered a fully blank terms object — non-null, so the intake's pills rendered, every
       one of them empty, and OPERATOR read *Yes* because the pill treats a null as yes. Copying
       nothing while saying «terms copied» is worse than the null it replaced. */
    const row =
      groups.flatMap((g) => g.items).find((it) => it.id === option.itemId) ?? group?.items[0];
    return row ? row.terms : null;
  }

  const record = (await fetchRequestDetail(option.id)) as unknown as {
    equipmentItems?: (Parameters<typeof machineTermsOfRequestItem>[0] & { id?: string })[];
  };
  const items = record.equipmentItems ?? [];
  const item = items.find((it) => it.id === option.itemId) ?? items[0];
  return item ? machineTermsOfRequestItem(item) : null;
}

/* ----------------------------- The fast path ----------------------------- */

/** What `/rfq/quick` answers with. `fallback` means take the job path instead. */
export interface QuickRfqResult {
  tier?: 0 | 1;
  fallback?: boolean;
  reason?: string;
  line_items?: Array<Record<string, unknown>>;
  missing_required_fields?: unknown[];
  field_notes?: unknown[];
  rfq_id?: string | null;
}

/**
 * Tier 1 — the equipment-only parse, answered synchronously.
 *
 * **Never throws.** Any failure comes back as `{ fallback: true }` and the caller runs the job path,
 * because a renter must not lose their request because an optimisation was unavailable: the worst
 * outcome here is the speed we already have.
 */
export async function processQuick(input: {
  text: string;
  language?: string;
}): Promise<QuickRfqResult> {
  try {
    const res = await fetch("/api/agent/quick", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: input.text, language: input.language, source: "web_rfq" }),
    });
    if (!res.ok) return { fallback: true, reason: `http_${res.status}` };
    return (await res.json()) as QuickRfqResult;
  } catch {
    return { fallback: true, reason: "network" };
  }
}

/**
 * Tell the corpus about a match the BROWSER made. Fire-and-forget in the strict sense: it is never
 * awaited and never surfaced.
 *
 * Without it a client-side match writes no row, and once the fast path takes its share half the
 * traffic stops teaching the learned rules — a decline that arrives over months and that nothing in
 * any log would attribute to this change.
 */
export function ingestClientMatch(text: string, lineItems: Array<Record<string, unknown>>): void {
  void fetch("/api/agent/ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: text, line_items: lineItems, source: "web_rfq" }),
    keepalive: true, // survives the navigation into the canvas
  }).catch(() => {});
}

/**
 * Ask the agent to warm its prompt cache for the equipment-only path.
 *
 * A cache write costs more than a read, and the write happens on whichever call arrives first. If
 * that is the renter's, they pay for it while watching a spinner; if it is this one, they do not.
 *
 * **Best-effort in the strict sense** — never awaited, never surfaced, and a failure changes
 * nothing except that the renter pays today's price. It is an optimisation, and an optimisation
 * that can make a request worse is not one.
 */
export function warmAgentCache(): void {
  void fetch("/api/agent/quick", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "warm", warm: true }),
  }).catch(() => {});
}

/* ----------------------------- An award's papers ----------------------------- */

/**
 * Attach a paper to one award.
 *
 * `data` is a data URL. It rides in the JSON body rather than as multipart because every hop
 * between here and storage already speaks JSON, and a purchase order is a page — the 10 MB ceiling
 * the dialog enforces keeps that honest.
 *
 * These do NOT carry the project version. A document is its own row in the shared document store,
 * keyed to the award's id; it never rewrites the awards blob, so there is nothing for a concurrent
 * write to lose.
 */
/**
 * `-` in the award slot files a paper against the SITE rather than one award.
 *
 * The backend has always accepted it (*"a framework agreement covering the whole job belongs to no
 * single award"*); nothing in the web used it. It is what lets *Attach a document* be offered on a
 * row nobody has awarded yet — see `SITE_LEVEL_AWARD` at the call site.
 */
export const SITE_DOCUMENT = "-";

export async function attachDocument(
  projectId: string,
  awardId: string,
  expectedVersion: number,
  file: File,
  kind: string,
): Promise<{ version: number }> {
  // 1 · ask where to put it. The key is namespaced by project on the backend, so this app never
  //     invents a path and cannot write one project's paper under another's prefix.
  const contentType = contentTypeFor(file.name);
  if (!contentType) throw new ApiError("unknown", `unsupported file type: ${file.name}`);

  const presign = await projectFetch<{ key: string; url: string }>(`${projectPath(projectId)}/documents/upload-url`, {
    method: "POST",
    // From the NAME, not `file.type`: the backend's enum has four entries and no fallback, and a
    // file dragged in with an empty type would otherwise be announced as octet-stream and refused.
    body: { filename: file.name, contentType },
  });

  // 2 · the bytes go STRAIGHT to storage. Not through this app, not through the agents backend —
  //     a 40 MB scan would otherwise be a 40 MB JSON body crossing two hops to reach the same place.
  const put = await fetch(presign.url, {
    method: "PUT",
    // Must match what the URL was signed for, or storage rejects the PUT.
    headers: { "Content-Type": contentType },
    body: file,
  });
  if (!put.ok) throw new ApiError("network", `upload failed (${put.status})`);

  // 3 · only now does the award learn about it, by KEY. The version rides along because attaching
  //     rewrites the awards blob like any other write.
  return projectFetch<{ version: number }>(`${projectPath(projectId)}/awards/${encodeURIComponent(awardId)}/documents`, {
    method: "POST",
    body: { kind, key: presign.key, filename: file.name, expectedVersion },
  });
}

/**
 * A short-lived link to one of the site's papers, for opening or saving it.
 *
 * ⚠️ **Fetched at the moment of the click, never held.** The URL is a credential with ten minutes on
 * it: stored on the document row it would be stale by the time the renter pressed it, and rendered
 * into the page it would sit in the DOM for anyone with the tab open. So this asks, and the caller
 * uses the answer immediately.
 *
 * The DOCUMENT id goes out, never the S3 key — the chart does not publish the key, which is what
 * made these papers write-only until the backend gained this endpoint.
 */
export async function documentUrl(projectId: string, docId: string): Promise<string> {
  const res = await projectFetch<{ url?: string }>(
    `${projectPath(projectId)}/documents/${encodeURIComponent(docId)}/url`,
  );
  const url = res?.url;
  if (!url) throw new ApiError("unknown", "no url returned for document");
  return url;
}

/** Removes the row AND the stored file. Nothing cascades here, so this is the only thing that does. */
export async function removeDocument(projectId: string, awardId: string, docId: string): Promise<void> {
  await projectFetch(
    `${projectPath(projectId)}/awards/${encodeURIComponent(awardId)}/documents/${encodeURIComponent(docId)}`,
    { method: "DELETE" },
  );
}

/* ----------------------------- The supplier list ----------------------------- */

export interface RenterSupplier {
  id: string;
  kind: "platform" | "own";
  name: string;
  vendorRegistered: boolean;
}

/**
 * The renter's own suppliers, for the award picker.
 *
 * **Another feature owns this list**, and it ships before projects reach production. An empty array
 * is a normal answer here, not a failure: the award dialog falls back to a typed supplier name,
 * which is why an award always stores `supplierName` even when it has an id.
 */
export async function listRenterSuppliers(): Promise<RenterSupplier[]> {
  try {
    return await projectFetch<RenterSupplier[]>("/api/renter-suppliers");
  } catch {
    return [];
  }
}
