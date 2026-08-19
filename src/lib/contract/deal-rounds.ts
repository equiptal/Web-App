/**
 * Negotiation-round reconstruction from the deal-room chat (app parity — deal_room/data/negotiation_rounds.dart).
 *
 * There is NO rounds endpoint. The app rebuilds the price/units history from the GetStream `rate_proposal`
 * messages. The backend nests the round payload under the message's `custom` object (Dart reads it as
 * `extraData['custom']`; the JS SDK exposes the same object as `message.custom`, and some fields may be
 * spread onto the message root). We read BOTH defensively and fall back gracefully — if nothing is
 * reachable, callers use the room-payload values (never break the live flow).
 */

import {
  RENTEE_REQUEST_CARD_TYPE,
  RENTEE_REQUEST_REPLY_CARD_TYPE,
  parseRenteeRequestCard,
  parseRenteeRequestReply,
  renteeRequestState,
  type RenteeRequestCardPayload,
  type RenteeRequestReplyPayload,
  type RenteeRequestResolution,
  type RenteeRequestState,
  type RequestTargetMachine,
} from "./rentee-request";
import { replyAnswerLine, type RequestThreadCard } from "./request-card";

export type RoundRole = "supplier" | "rentee";

export interface DealRound {
  role: RoundRole;
  rate: number | null;
  priceUnit: string | null;
  mobPrice: number | null;
  demobPrice: number | null;
  rentalUnits: number | null;
  mobUnits: number | null;
  demobUnits: number | null;
  mobExcluded: boolean;
  demobExcluded: boolean;
  at: string | null;
}

const num = (v: unknown): number | null => {
  const x = typeof v === "string" ? Number(v) : v;
  return typeof x === "number" && !Number.isNaN(x) ? x : null;
};
const str = (v: unknown): string | null => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  const s = String(v);
  return s.trim() ? s : null;
};

/** Read the round payload off a raw Stream message — prefer `message.custom`, fall back to the root. */
function proposalOf(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  const custom = m.custom && typeof m.custom === "object" ? (m.custom as Record<string, unknown>) : {};
  // Merge with `custom` winning; the app's `type:'rate_proposal'` lives in custom (Stream's own
  // `message.type` is 'regular'/'system'/… and must not be confused with it).
  const merged = { ...m, ...custom };
  const type = custom.type ?? merged.customType ?? merged.messageKind;
  if (type !== "rate_proposal") return null;
  return merged;
}

/** Map the chat's `rate_proposal` messages → rounds, oldest-first (chat order). */
export function reconstructRounds(rawMessages: unknown[]): DealRound[] {
  const out: DealRound[] = [];
  for (const raw of rawMessages ?? []) {
    const p = proposalOf(raw);
    if (!p) continue;
    const role = String(p.proposedByRole ?? p.role ?? "").toLowerCase() === "supplier" ? "supplier" : "rentee";
    out.push({
      role,
      rate: num(p.proposedRate ?? p.rate),
      priceUnit: str(p.priceUnit),
      mobPrice: num(p.mobPrice),
      demobPrice: num(p.demobPrice),
      rentalUnits: num(p.rentalUnits),
      mobUnits: num(p.mobUnits),
      demobUnits: num(p.demobUnits),
      mobExcluded: p.mobExcluded === true,
      demobExcluded: p.demobExcluded === true,
      at: str((raw as Record<string, unknown>).created_at) ?? str(p.at),
    });
  }
  return out;
}

/** Fold CONSECUTIVE same-role rounds — an edit-while-waiting supersedes the earlier one (keep latest). */
export function collapseRounds(rounds: DealRound[]): DealRound[] {
  const out: DealRound[] = [];
  for (const r of rounds) {
    const last = out[out.length - 1];
    if (last && last.role === r.role) out[out.length - 1] = r;
    else out.push(r);
  }
  return out;
}

/** Latest round proposed by a given party (null if none). */
export function latestRoundBy(rounds: DealRound[], role: RoundRole): DealRound | null {
  for (let i = rounds.length - 1; i >= 0; i--) if (rounds[i].role === role) return rounds[i];
  return null;
}

/** Synthesize the supplier's opening round from the room's standing values, so the history always has a
 *  supplier round-0 even before any counter (app parity: openingBid). Best-effort — the room flattens
 *  the bid, so these are the current on-table numbers. */
export function withOpeningRound(
  rounds: DealRound[],
  opening: {
    rate: number | null; priceUnit: string | null; mobPrice: number | null; demobPrice: number | null;
    rentalUnits: number | null; mobUnits: number | null; demobUnits: number | null;
    mobExcluded: boolean; demobExcluded: boolean;
  },
): DealRound[] {
  if (rounds.length > 0 && rounds[0].role === "supplier") return rounds;
  return [{ role: "supplier", at: null, ...opening }, ...rounds];
}

// ─────────────────────────────────────────────────────────────────────────────
// Chat cards — the structured `custom` payload the backend attaches to every
// negotiation system message (DRCARD)
// ─────────────────────────────────────────────────────────────────────────────
//
// The backend has always posted a typed `custom` object alongside each narration message
// (`stream.service.ts`'s UNREAD_INFLATING_CARD_TYPES is the same vocabulary). The web used to throw all
// of it away and render every type as one grey `.sysev` pill showing `message.text` — which for
// `rate_proposal`/`rate_response` is ENGLISH, because the backend's fallback text is English while the
// product is Arabic. Rendering from `custom` is what lets the web fix the language with no backend
// deploy, and it is the only place a `counter`'s figures exist at all.
//
// Two rules hold this together:
//   • `parseChatCard` NEVER throws and never returns a partial card. Anything it can't fully account
//     for returns null, and the caller renders `message.text` exactly as before. A throw inside a list
//     render blanks the whole conversation — a far worse failure than an ugly pill.
//   • `termKey` is ALWAYS localised. `PRICE` is not a user-facing string.

/** The `custom.type` vocabulary, parsed into exactly what each card carries.
 *
 *  **Extended, not forked, by V11.** The negotiation vocabulary and the request loop travel in the
 *  same channel and must render as cards in the same list (004a §2, RM3-AC-48) — a second parser
 *  would mean a message is a card in one tab's renderer and a bare grey pill in the other's. */
export type ChatCard =
  | {
      type: "rate_proposal"; rate: number; priceUnit: string; byRole: RoundRole;
      status: "pending" | "accepted" | "countered";
      mobPrice: number | null; demobPrice: number | null; rentalUnits: number | null;
      originalMessageId: string | null;
    }
  | { type: "rate_response"; response: "accepted"; originalMessageId: string | null }
  | { type: "term_accepted"; termKey: string; value: unknown }
  | { type: "counter"; termKey: string; oldValue: unknown; newValue: unknown }
  | { type: "term_updated"; termKey: string; oldValue: unknown; newValue: unknown }
  | { type: "term_reopened"; termKey: string }
  /** The renter's ask about one machine (spec 004 §7.3). */
  | { type: "rentee_request"; card: RenteeRequestCardPayload }
  /** The supplier's answer to one ask, threaded by its `ref`. */
  | { type: "rentee_request_reply"; reply: RenteeRequestReplyPayload };

/** Strict number — unlike `num()` above, a numeric STRING is not a rate. A card is either fully
 *  structured or it is not a card; the lenient coercion belongs to round reconstruction, where a
 *  best-effort read beats no history at all. */
const fnum = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * `custom` → a typed card, or null to fall back to `message.text`.
 *
 * Returns null for: no `custom`, a non-object, an unknown `type`, and any known type missing a field
 * it is defined by. Never throws.
 */
export function parseChatCard(custom: unknown): ChatCard | null {
  if (!custom || typeof custom !== "object" || Array.isArray(custom)) return null;
  const c = custom as Record<string, unknown>;
  const type = typeof c.type === "string" ? c.type : null;
  if (!type) return null;
  const termKey = typeof c.termKey === "string" && c.termKey.trim() ? c.termKey : null;
  const origin = typeof c.originalMessageId === "string" && c.originalMessageId.trim() ? c.originalMessageId : null;

  switch (type) {
    case "rate_proposal": {
      // A proposal with no rate is not a proposal (AC-10). priceUnit is defaulted rather than
      // required: the backend's counter branch omits it on some paths, and the room's unit is the
      // right assumption — but a missing RATE has no safe default.
      const rate = fnum(c.proposedRate);
      if (rate == null) return null;
      const status = c.status === "accepted" || c.status === "countered" ? c.status : "pending";
      return {
        type, rate,
        priceUnit: typeof c.priceUnit === "string" && c.priceUnit.trim() ? c.priceUnit : "PER_DAY",
        byRole: String(c.proposedByRole ?? "").toLowerCase() === "supplier" ? "supplier" : "rentee",
        status,
        mobPrice: fnum(c.mobPrice), demobPrice: fnum(c.demobPrice), rentalUnits: fnum(c.rentalUnits),
        originalMessageId: origin,
      };
    }
    case "rate_response":
      // Only `accepted` is posted as a rate_response — a rejection comes back as a fresh rate_proposal
      // carrying `originalMessageId`. Anything else is not a card we understand.
      if (c.response !== "accepted") return null;
      return { type, response: "accepted", originalMessageId: origin };
    case "term_accepted":
      if (!termKey) return null;
      return { type, termKey, value: c.value };
    case "counter":
    case "term_updated":
      if (!termKey) return null;
      return { type, termKey, oldValue: c.oldValue, newValue: c.newValue };
    case "term_reopened":
      if (!termKey) return null;
      return { type, termKey };
    // The request loop. Both payloads are parsed by the module that owns their contract, so the
    // wire shape has one reader; a card either parses whole or falls back to `message.text`.
    case RENTEE_REQUEST_CARD_TYPE: {
      const parsed = parseRenteeRequestCard({ ...c, type: RENTEE_REQUEST_CARD_TYPE });
      return parsed ? { type: RENTEE_REQUEST_CARD_TYPE, card: parsed } : null;
    }
    case RENTEE_REQUEST_REPLY_CARD_TYPE: {
      const parsed = parseRenteeRequestReply({ ...c, type: RENTEE_REQUEST_REPLY_CARD_TYPE });
      return parsed ? { type: RENTEE_REQUEST_REPLY_CARD_TYPE, reply: parsed } : null;
    }
    default:
      return null;
  }
}

/**
 * A raw Stream message → its card. Same defensive read as {@link reconstructRounds}: the payload is
 * sent as `custom: {...}` and comes back as `message.custom`, but any field spread onto the message root
 * is picked up too.
 *
 * `type` is taken ONLY from `custom` — Stream has its own `message.type` ('regular' | 'system' | …) and
 * confusing the two would parse every message as a card.
 */
export function chatCardOfMessage(raw: unknown): ChatCard | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  const custom = m.custom && typeof m.custom === "object" && !Array.isArray(m.custom)
    ? (m.custom as Record<string, unknown>)
    : null;
  if (!custom || typeof custom.type !== "string") return null;
  return parseChatCard({ ...m, ...custom, type: custom.type });
}

/**
 * **The request loop's own cards, out of a message list and in load order** — the ONE projection every
 * reading of a conversation's asks shares.
 *
 * Three of them, and they must agree or the surface contradicts itself:
 *   · `outstandingAskIdentities` — which questions are still with the lessor, which gates the map's
 *     ask controls (owner's "one ask, one card", 2026-08-10);
 *   · `replyCardView` — the search for the ask a reply answers, so the answer arrives in the card of
 *     the question (owner, 2026-08-11);
 *   · the render itself, on BOTH surfaces.
 *
 * It lived inline in `ChatDock.tsx` until `/deal-room/[id]` had to render the same pair of cards
 * (owner, 2026-08-11: *"i want it like request card"*). Lifted here rather than copied there: this
 * module already owns `chatCardOfMessage`, and two copies of "which messages are asks" is two answers
 * to a question the two surfaces ask about ONE channel.
 *
 * **Ordinary chat and the negotiation vocabulary travel the list as empty entries**, deliberately.
 * Dropping them would compact the list; keeping them one-to-one with the messages means an index into
 * either list means the same thing, and neither an empty entry nor a rate proposal can be mistaken
 * for an ask or block a control.
 *
 * Order-independent by construction — a channel read is not guaranteed to be ordered, so a reply that
 * arrives before its own ask is still paired with it by `ref`.
 */
export function requestThreadCards(messages: readonly unknown[]): RequestThreadCard[] {
  return messages.map((m) => {
    const card = chatCardOfMessage(m);
    if (card?.type === RENTEE_REQUEST_CARD_TYPE) return { ask: card.card };
    if (card?.type === RENTEE_REQUEST_REPLY_CARD_TYPE) return { reply: card.reply };
    return {};
  });
}

/**
 * `ref` → the supplier's answer, read out of the conversation itself.
 *
 * The other half of what a `RequestCardCtx` needs, and the other thing both surfaces were deriving
 * separately. There is no status column behind a request (§7.3): the channel IS the record, so this
 * is the only place an answer can come from.
 */
export function requestRepliesByRef(
  thread: readonly RequestThreadCard[],
): Map<string, ReplyStanding> {
  const map = new Map<string, ReplyStanding>();
  for (const c of thread) {
    // `deliveredTypes` travels WITH the resolution, because a `partial` is not fully described by
    // its name: the line the renter reads names the papers that landed (owner ruling, 2026-08-11,
    // §8). Plain assignment leaves the LAST reply for a `ref` standing, which is what "the answer
    // that stands" means — a supplier who sent the wrong paper and has since sent the right one is
    // read as having sent the right one.
    if (c.reply) {
      map.set(c.reply.inReplyTo, {
        resolution: c.reply.resolution,
        deliveredTypes: c.reply.deliveredTypes,
      });
    }
  }
  return map;
}

/** The answer that stands on one `ref`, as every surface reads it. */
export interface ReplyStanding {
  resolution: RenteeRequestResolution;
  /** Null when he named no papers — an older client, or any resolution but `partial`. */
  deliveredTypes: string[] | null;
}

/**
 * Term label fallback, mirroring the backend's `term-matching.ts` TERM_LABELS.
 *
 * A card's `termKey` normally resolves against the room's own terms — but `mapDealRoom` strips
 * HIDDEN_DEAL_ROOM_TERM_KEYS (the synthetic `PRICE`, the mob/demob pricing lines, certs…) from
 * `room.terms`, and those are exactly the keys the most common cards carry. Without this map a PRICE
 * counter would print the raw key.
 */
export const CHAT_TERM_LABELS: Record<string, [string, string]> = {
  PRICE: ["Price", "السعر"],
  fat: ["Operator FAT", "وقت الحضور المجاني"],
  fat_food: ["Operator FAT — Food", "الإعاشة (F.A.T) — الطعام"],
  fat_accommodation_transport: ["Operator FAT — Accommodation/Transport", "الإعاشة (F.A.T) — الإقامة/النقل"],
  diesel_included: ["Fuel Responsibility", "مسؤولية الوقود"],
  breakdown_response_sla: ["Breakdown SLA", "اتفاقية مستوى الخدمة للأعطال"],
  maintenance_responsibility: ["Maintenance", "الصيانة"],
  fuel_responsibility: ["Fuel Responsibility", "مسؤولية الوقود"],
  payment_terms: ["Payment Terms", "شروط الدفع"],
  overtime_rate: ["Overtime Rate", "معدل العمل الإضافي"],
  mobilization: ["Mobilization", "النقل"],
  demobilization: ["Demobilization", "إزالة التعبئة"],
  mobilization_pricing: ["Mobilization Pricing", "تسعير النقل"],
  demobilization_pricing: ["Demobilization Pricing", "تسعير إزالة التعبئة"],
  mobilization_lead_time: ["Mobilization Lead Time", "مهلة النقل"],
  working_hours: ["Working Hours", "ساعات العمل"],
  insurance: ["Insurance", "التأمين"],
  operator_nationality: ["Operator Nationality", "جنسية المشغل"],
  operator_certification: ["Operator Certifications", "شهادات المشغل"],
  operator_included: ["Operator Included", "تشمل مشغل"],
  working_days: ["Working Days", "أيام العمل"],
  equipment_attachment: ["Equipment Attachment", "ملحقات المعدة"],
  verified_suppliers_only: ["Verified Supplier", "مورد موثّق"],
  saso_registration: ["SASO Registration", "تسجيل ساسو"],
};

/** Just enough of a DealTerm to localise a key + its value (avoids a contract → contract import cycle). */
export interface ChatCardTerm {
  key: string;
  label: string;
  labelAr: string;
  options?: { value: string; labelEn: string; labelAr: string }[];
}

/** `termKey` → a human label: the room's own term first, then the mirrored map, then a humanised key
 *  (`payment_terms` → "Payment terms") — never the raw key. */
export function chatCardTermLabel(termKey: string, terms: ChatCardTerm[], ar: boolean): string {
  const t = terms.find((x) => x.key === termKey);
  if (t) return (ar ? t.labelAr || t.label : t.label || t.labelAr) || termKey;
  const m = CHAT_TERM_LABELS[termKey];
  if (m) return ar ? m[1] : m[0];
  const words = termKey.replace(/[_-]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1).toLowerCase() : termKey;
}

type LFn = (en: string, arr: string) => string;

/** A term VALUE off a card payload → display text. Resolves the term's own option labels first (the
 *  backend does the same when it composes `text`), then the shared yes/no & party normalisations that
 *  `valText` applies on the terms panel. */
export function chatCardValue(v: unknown, termKey: string, terms: ChatCardTerm[], ar: boolean, L: LFn): string {
  if (v == null || v === "") return "—";
  const opts = terms.find((x) => x.key === termKey)?.options;
  if (opts?.length && !Array.isArray(v)) {
    const hit = opts.find((o) => o.value === String(v));
    if (hit) return (ar ? hit.labelAr || hit.labelEn : hit.labelEn || hit.labelAr) || String(v);
  }
  if (Array.isArray(v)) return v.length ? v.map((x) => String(x)).join(", ") : "—";
  if (typeof v === "boolean") return v ? L("Yes", "نعم") : L("No", "لا");
  const s0 = String(v);
  const low = s0.toLowerCase();
  if (low === "supplier") return L("Supplier", "المؤجّر");
  if (low === "rentee" || low === "renter") return L("Rentee", "المستأجر");
  if (low === "either") return L("Either", "أيّهما");
  if (low === "shared") return L("Shared", "مشترك");
  if (low === "true" || low === "included" || low === "yes") return L("Yes", "نعم");
  if (low === "false" || low === "excluded" || low === "not_included" || low === "no") return L("No", "لا");
  return s0;
}

/** IDs of proposals a later `rate_response` has settled. AC-13: a proposal's outcome is read from the
 *  response message in the stream, never from local component state — a reload must show the same thing. */
export function respondedProposalIds(rawMessages: unknown[]): Set<string> {
  const out = new Set<string>();
  for (const raw of rawMessages ?? []) {
    const card = chatCardOfMessage(raw);
    if (card?.type === "rate_response" && card.originalMessageId) out.add(card.originalMessageId);
  }
  return out;
}

/** Stream id of the LAST rate proposal in the conversation, or null.
 *
 *  A proposal is settled by a `rate_response` — but it is equally dead once either party posts a NEWER
 *  proposal, which is how a rate counter travels (`respondToRate`'s reject branch posts a fresh
 *  `rate_proposal` carrying `originalMessageId`). Without this, scrolling back would offer Accept on a
 *  superseded number, and the bottom bar and the card would disagree about what is on the table. */
export function latestProposalId(rawMessages: unknown[]): string | null {
  let id: string | null = null;
  for (const raw of rawMessages ?? []) {
    if (chatCardOfMessage(raw)?.type !== "rate_proposal") continue;
    const mid = (raw as Record<string, unknown>).id;
    if (typeof mid === "string" && mid) id = mid;
  }
  return id;
}

/** One label/value line on a card. `ltr` marks a numeric run that must stay LTR inside an RTL bubble. */
export interface ChatCardRow { label: string; value: string; ltr?: boolean }

/** Everything the card renders — composed here, from the payload + i18n, so `message.text` (which may
 *  be English) is never displayed. Pure: no React, no DOM, unit-testable. */
export interface ChatCardView {
  kind: ChatCard["type"];
  /** Material icon name. */
  icon: string;
  /** Class suffix — the types must be visually distinct (AC-06/AC-07). `ask`/`ask-reply` are V11's
   *  request loop; they are deliberately their own tones rather than borrowing a negotiation one,
   *  because a question about a machine is not a move on the price. */
  tone: "rate" | "accepted" | "term-ok" | "term-counter" | "term-edit" | "term-reopen" | "ask" | "ask-reply";
  title: string;
  rows: ChatCardRow[];
  /** An old → new move. The renderer picks the arrow glyph from direction; never a hardcoded `→`. */
  transition: { from: string; to: string } | null;
  /** Formatted message time — every card carries one, like every other message (AC-16). */
  at: string;
  /** Accept / counter affordances. Only ever on a live, unsettled proposal from the other party. */
  actions: boolean;
  /** Settled outcome text, shown in place of the actions. */
  outcome: string | null;
  /** How the outcome reads — an acceptance is good news, a superseded offer is just history, an
   *  unanswered ask is neither (and must never read as a refusal — RM3-AC-20's rule, applied to the
   *  card). */
  /** `partial` is the supplier's third answer (owner ruling, 2026-08-11, §8) and carries its own
   *  amber — never the green of `accepted`, never the red-warm of `refused`. */
  outcomeTone: "accepted" | "history" | "waiting" | "refused" | "partial";
  /** Material icon for the outcome line, when the tone's default is not specific enough. */
  outcomeIcon: string | null;
}

export interface ChatCardCtx {
  ar: boolean;
  L: LFn;
  /** The room's negotiable terms, for localising `termKey` + its values. */
  terms: ChatCardTerm[];
  /** When the message was posted. */
  at: string | Date | null | undefined;
  /** True when a later `rate_response` names this proposal (see {@link respondedProposalIds}). */
  responded: boolean;
  /** True when a NEWER rate proposal has replaced this one (see {@link latestProposalId}). */
  superseded: boolean;
  /** The room is still negotiable — a closed/abandoned/awaiting room offers no card actions. */
  live: boolean;
  /**
   * V11 — what the request loop needs to state a card's verdict.
   *
   * **Optional on purpose.** A card built without it still states the ask, the machine and the
   * reference; it simply cannot say whether the machine has since satisfied it. Showing less beats
   * guessing.
   *
   * This used to be how `/deal-room/[id]` rendered the request loop — through `ChatCard`, with no
   * fleet in hand. That route now fetches the bid's fleet and draws the full `RequestCard` (owner,
   * 2026-08-11: *"i want it like request card"*), so what reaches this branch there is the FALLBACK:
   * a reply whose ask is not in the loaded window, and any card drawn before the fleet lands.
   */
  requestCtx?: {
    /** The machine as the fleet response holds it **right now** — re-read on every render, because
     *  nothing about a request's state is stored (RM3-AC-18). Null when it is not in the response. */
    machine: (equipmentId: string) => (RequestTargetMachine & { label?: string | null }) | null;
    /** The supplier's answer carrying this `ref`, if he posted one. `deliveredTypes` rides along for
     *  `partial`, whose line names the papers that landed (owner ruling, 2026-08-11, §8). */
    reply: (ref: string) => {
      resolution: RenteeRequestResolution;
      deliveredTypes?: readonly string[] | null;
    } | null;
    /*
     * A `company: () => RequestTargetCompany | null` resolver lived here, for a company-scope document
     * ask. That ask is withdrawn (product owner, 2026-08-08): a document request names a machine, and a
     * company paper is read from the panel rather than requested. Removed outright rather than left as
     * an optional nobody passes.
     */
    /** A wire document type → the renter's word for it, so a card never prints `operating_license`. */
    docLabel?: (docType: string) => string;
  };
}

const cnf = (n: number) => Math.round(n).toLocaleString("en-US");

/** Price-unit period label — the SAME mapping the price bar uses, so a card and the bar never disagree. */
function periodOf(unit: string, L: LFn): string {
  switch ((unit || "PER_DAY").toUpperCase()) {
    case "PER_WEEK": return L("week", "أسبوع");
    case "PER_MONTH": return L("month", "شهر");
    case "PER_JOB": return L("job", "مهمة");
    default: return L("day", "يوم");
  }
}

/**
 * A message's time, as every card in a conversation prints it (AC-16).
 *
 * Exported because the renter's request card is drawn by `RequestCard` rather than by `ChatCard`
 * (V12) and still has to carry one. Two formatters would be two clock faces in one thread.
 */
export function chatCardTime(at: string | Date | null | undefined, ar: boolean): string {
  if (!at) return "";
  const d = at instanceof Date ? at : new Date(at);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleTimeString(ar ? "ar-SA-u-ca-gregory" : "en-GB", { hour: "2-digit", minute: "2-digit" });
}

/** Typed card + room context → the view-model the card component renders. */
export function buildChatCardView(card: ChatCard, ctx: ChatCardCtx): ChatCardView {
  const { ar, L, terms } = ctx;
  const at = chatCardTime(ctx.at, ar);
  const base = { at, transition: null, actions: false, outcome: null, outcomeTone: "accepted", outcomeIcon: null } as const;
  const label = (k: string) => chatCardTermLabel(k, terms, ar);
  const val = (v: unknown, k: string) => chatCardValue(v, k, terms, ar, L);

  switch (card.type) {
    case "rate_proposal": {
      const mine = card.byRole === "rentee"; // the web renter IS the rentee
      const rows: ChatCardRow[] = [
        { label: L("Rate", "السعر"), value: `${cnf(card.rate)} ${L("SAR", "ر.س")} / ${periodOf(card.priceUnit, L)}`, ltr: true },
      ];
      if (card.mobPrice != null) rows.push({ label: L("Mobilization", "التعبئة — موب"), value: `${cnf(card.mobPrice)} ${L("SAR", "ر.س")}`, ltr: true });
      if (card.demobPrice != null) rows.push({ label: L("Return", "الإرجاع — ديموب"), value: `${cnf(card.demobPrice)} ${L("SAR", "ر.س")}`, ltr: true });
      if (card.rentalUnits != null) rows.push({ label: L("Units", "عدد الوحدات"), value: cnf(card.rentalUnits), ltr: true });
      const accepted = ctx.responded || card.status === "accepted";
      return {
        ...base,
        kind: card.type, icon: "local_offer", tone: "rate",
        title: mine ? L("You proposed a rate", "اقترحت سعرًا") : L("Supplier proposed a rate", "اقترح المؤجّر سعرًا"),
        rows,
        // A party cannot accept their own proposal (AC-12); an accepted one offers nothing (AC-13); and
        // neither does one a newer proposal has already replaced.
        actions: ctx.live && !mine && !accepted && !ctx.superseded && card.status === "pending",
        // Only an ACCEPTANCE is an outcome. A superseded proposal is just history — labelling it
        // "accepted" would state something untrue.
        outcome: accepted ? L("Rate accepted", "تم قبول السعر") : ctx.superseded ? L("Superseded by a newer offer", "تجاوزه عرض أحدث") : null,
        outcomeTone: accepted ? "accepted" : "history",
      };
    }
    case "rate_response":
      return {
        ...base,
        kind: card.type, icon: "task_alt", tone: "accepted",
        title: L("Rate accepted", "تم قبول السعر"), rows: [],
      };
    case "term_accepted":
      return {
        ...base,
        kind: card.type, icon: "check_circle", tone: "term-ok",
        title: L("Term accepted", "تم قبول البند"),
        rows: [
          { label: L("Term", "البند"), value: label(card.termKey) },
          ...(card.value == null || card.value === "" ? [] : [{ label: L("Value", "القيمة"), value: val(card.value, card.termKey) }]),
        ],
      };
    case "counter":
      return {
        ...base,
        kind: card.type, icon: "swap_horiz", tone: "term-counter",
        title: L("Counter-offer on a term", "عرض مضاد على بند"),
        rows: [{ label: L("Term", "البند"), value: label(card.termKey) }],
        // The counter's figures live ONLY in `custom` — the fallback text names the term and no value,
        // so before this the renter saw a counter-offer with nothing in it (AC-04).
        transition: { from: val(card.oldValue, card.termKey), to: val(card.newValue, card.termKey) },
      };
    case "term_updated":
      return {
        ...base,
        kind: card.type, icon: "edit", tone: "term-edit",
        title: L("Term updated", "تم تعديل البند"),
        rows: [{ label: L("Term", "البند"), value: label(card.termKey) }],
        transition: { from: val(card.oldValue, card.termKey), to: val(card.newValue, card.termKey) },
      };
    case "term_reopened":
      return {
        ...base,
        kind: card.type, icon: "lock_open", tone: "term-reopen",
        title: L("Term reopened for negotiation", "أُعيد فتح البند للتفاوض"),
        rows: [{ label: L("Term", "البند"), value: label(card.termKey) }],
      };
    case RENTEE_REQUEST_CARD_TYPE:
      return renteeRequestCardView(card.card, ctx, base);
    case RENTEE_REQUEST_REPLY_CARD_TYPE:
      /* ── The BARE reply — the fallback, not the shape a reply is meant to take (owner, 2026-08-11)
         The ruling is that *"the supplier response must arrive in the same format of the sent card
         but with supplier answer"*, and `replyCardView` does exactly that wherever the ask it answers
         is in hand: the ask's own card, with the answer where its waiting state was.

         This branch is what is left when it is NOT in hand — an older page, a partial channel read.
         Both surfaces that render this conversation now try `replyCardView` first and fall through to
         here (`/deal-room/[id]` since the ruling of 2026-08-11), so this is the one shape a reply
         takes when nothing better is honest.
         It states the reference and the answer and names NO equipment, because resolving one from a
         matching reference alone would put a machine's name under a supplier's answer on a guess.

         The answer's words come from `replyAnswerLine` with the kind removed — one table for both
         renderings, so the bare form can never say something the full card would contradict. "Done"
         is gone from both: it was not an answer to anything. */
      return {
        ...base,
        kind: card.type, icon: "reply", tone: "ask-reply",
        // «المورّد», never «المؤجّر» — one word for the counterparty across the surface.
        title: L("The supplier answered", "ردّ المورّد"),
        rows: [
          { label: L("Reference", "المرجع"), value: card.reply.inReplyTo, ltr: true },
          {
            label: L("Answer", "الردّ"),
            value: replyAnswerLine(
              {
                kind: null,
                resolution: card.reply.resolution,
                /* A `partial` still NAMES what arrived here (owner ruling, 2026-08-11, §8) — that
                   half comes off the reply itself and needs no ask. What is still missing does need
                   one, and there is none in this window by definition, so `askedTypes` stays absent
                   and the line degrades to *"…— but not everything that was asked for"*. Naming a
                   paper as missing off an unread question would be the same guess this branch
                   already refuses to make about the equipment. */
                deliveredTypes: card.reply.deliveredTypes,
                docLabel: ctx.requestCtx?.docLabel,
              },
              L,
            ).label,
          },
        ],
      };
  }
}

/** The ask itself — «اطلب تأكيد التوفّر» / «اطلب مستنداً» / «اطلب معدّة أخرى», as it reads in the
 *  conversation, with its verdict re-derived from the machine on every render (RM3-AC-18). */
function renteeRequestCardView(
  payload: RenteeRequestCardPayload,
  ctx: ChatCardCtx,
  base: Omit<ChatCardView, "kind" | "icon" | "tone" | "title" | "rows">,
): ChatCardView {
  const { L, ar } = ctx;
  const resolved = payload.equipmentId ? ctx.requestCtx?.machine(payload.equipmentId) ?? null : null;
  // No request context at all — a surface with no fleet behind this conversation. The card still
  // states the ask, the machine and the reference; it simply says nothing about whether it was
  // answered, because it has nothing to derive that from.
  const state: RenteeRequestState | null = ctx.requestCtx
    ? renteeRequestState(payload, resolved, ctx.requestCtx.reply(payload.ref))
    : null;

  const title = ((): string => {
    switch (payload.kind) {
      case "availability": return L("You asked him to confirm availability", "طلبت منه تأكيد التوفّر");
      case "document": return L("You asked for a document", "طلبت مستنداً");
      case "alternative":
        // The shortfall ask names no machine — it asks FOR one. Saying "instead of" would describe a
        // swap the renter never proposed.
        return payload.equipmentId
          ? L("You asked for different equipment", "طلبت معدّة أخرى")
          : L("You asked him to add the missing units", "طلبت منه إضافة الوحدات الناقصة");
    }
  })();

  const rows: ChatCardRow[] = [{ label: L("Reference", "المرجع"), value: payload.ref, ltr: true }];
  // The machine, named the way the renter sees it — the label from the fleet row when we hold it,
  // else the serial the backend stamped. A card that named only an id would be unreadable.
  const machineName = resolved?.label ?? payload.serial;
  if (machineName) rows.push({ label: L("Equipment", "المعدّة"), value: machineName, ltr: !resolved?.label });
  if (payload.docTypes?.length) {
    const naming = ctx.requestCtx?.docLabel;
    rows.push({
      label: L("Documents", "المستندات"),
      value: payload.docTypes.map((t) => naming?.(t) ?? t).join(ar ? " · " : " · "),
    });
  }

  const outcome = ((): { text: string; tone: ChatCardView["outcomeTone"]; icon: string } | null => {
    switch (state) {
      case null:
        return null;
      case "answered":
        return { text: L("Answered — his file now shows it", "تم الردّ — ظهر على ملفه"), tone: "accepted", icon: "task_alt" };
      case "refused":
        // «المورّد», never «المؤجّر» — the request loop names the counterparty one way, and the reply
        // card beside this one says the same word.
        return { text: L("He declined", "اعتذر المورّد"), tone: "refused", icon: "do_not_disturb_on" };
      case "unavailable":
        return { text: L("He answered: not available", "ردّ: غير متوفّرة"), tone: "refused", icon: "do_not_disturb_on" };
      /* ── `partial` — amber, and named (owner ruling, 2026-08-11, §8) ──────────────────────────
         This is the SMALLER of the two renderings of an ask — the one drawn where no fleet is in
         hand — so it words the same sentence `replyAnswerLine` words on the full card, from the same
         table, with the same two lists. Two wordings of one answer is precisely what V12c withdrew a
         whole card to stop.

         Its own tone, never `accepted` and never `refused`: he did not answer, and he did not
         refuse. The glyph says "part of it", not a cross. */
      case "partial":
        return {
          text: replyAnswerLine(
            {
              kind: payload.kind,
              resolution: "partial",
              deliveredTypes: ctx.requestCtx?.reply(payload.ref)?.deliveredTypes ?? null,
              askedTypes: payload.docTypes,
              docLabel: ctx.requestCtx?.docLabel,
            },
            L,
          ).label,
          tone: "partial",
          icon: "incomplete_circle",
        };
      case "unknown":
        // Not in the fleet response — we cannot check, so we neither claim he owes an answer nor
        // strike the card through as history (`.cc-out-history` does exactly that to a superseded
        // offer, and this ask is not superseded; it is uncheckable).
        return { text: L("This equipment isn't in his current list", "هذه المعدّة ليست ضمن قائمته الحالية"), tone: "waiting", icon: "help_outline" };
      default:
        // NEVER "he refused". An unanswered ask is unanswered.
        return { text: L("Waiting for his answer", "بانتظار ردّه"), tone: "waiting", icon: "schedule" };
    }
  })();

  return {
    ...base,
    kind: RENTEE_REQUEST_CARD_TYPE,
    icon: payload.kind === "document" ? "description" : payload.kind === "availability" ? "event_available" : "swap_calls",
    tone: "ask",
    title,
    rows,
    outcome: outcome?.text ?? null,
    outcomeTone: outcome?.tone ?? "history",
    outcomeIcon: outcome?.icon ?? null,
  };
}

/* ══════════════ the room's LIVE position (app parity: `resolveLivePosition`) ══════════════ */

/**
 * The room's own position — **the latest round from either side**.
 *
 * The app resolves this with `perspective: null` and describes what it is for in as many words:
 * *"what the deal is worth right now — the price bar, the breakdown, the quotation."* Its ladder puts
 * the latest round FIRST, ahead of the room's `agreedUnits`.
 *
 * That ordering is the whole point and is easy to get backwards. `agreedUnits` is the last thing both
 * parties SETTLED; the latest round is what is on the table. A room mid-negotiation is about the
 * second, and the surfaces that read it already label whose position it is.
 *
 * Null only for a round list that is empty, which `withOpeningRound` prevents for any real room — it
 * synthesises round 0 from the room's own columns, so a room nobody has countered in resolves to
 * exactly the figures it always did.
 */
export function liveRound(rounds: readonly DealRound[]): DealRound | null {
  return rounds.length > 0 ? rounds[rounds.length - 1] : null;
}

/**
 * One round as a `computeDealTotals` override — the rest of the app's chain, written once.
 *
 * A field the round does not carry passes through as `null`, and `computeDealTotals` then falls back
 * to the room's own column: that is `latest?.x ?? roomX ?? bid.x` expressed as two steps instead of
 * three. Shared by the price bar, the compare card and the quotation, so the three cannot price one
 * round three ways.
 *
 * **The rental count is clamped to [1, requested]**, as the app clamps its own. The backend enforces
 * the same bound, so a count outside it is a stale or malformed message rather than a real proposal —
 * and pricing five units against a request for three states a deal that cannot close. A `null` count
 * is left alone: it means the round named none, not that it named zero.
 */
export function roundOverride(room: { requestedUnits: number }, r: DealRound) {
  // A room that does not know what was requested imposes NO ceiling. Treating a missing cap as 1 —
  // which `Math.max(1, requestedUnits)` quietly does — would shrink every counter to a single unit on
  // exactly the rooms whose payload is thinnest.
  const cap = room.requestedUnits > 0 ? room.requestedUnits : null;
  const units = r.rentalUnits == null
    ? null
    : cap == null
      ? Math.max(1, r.rentalUnits)
      : Math.min(Math.max(1, r.rentalUnits), cap);
  /*
   * **The legs are clamped to the rental count on the LIVE path, and only there** (app parity).
   *
   * The app looks like it contradicts itself here and does not. `resolveLivePosition` clamps
   * (`(latest?.mobUnits ?? roomMobUnits ?? rentalUnits).clamp(0, rentalUnits)`) and
   * `QuotationModel.effectiveMobUnits` does not (`mobExcluded ? 0 : (mobUnits ?? numberOfUnits)`) —
   * but they govern different surfaces. The first is the live room, where a leg count above the
   * rental count is an illegal position the backend would refuse. The second reads a FROZEN
   * quotation snapshot, which records what was actually agreed and must not be second-guessed after
   * the fact.
   *
   * So the clamp belongs here, on the round, and NOT in `computeDealTotals` — whose unclamped default
   * is what the quotation and the price footer read. Putting it there would rewrite signed snapshots.
   */
  const legCap = units == null ? null : units;
  const leg = (n: number | null) => (n == null || legCap == null ? n : Math.min(Math.max(0, n), legCap));
  return {
    rate: r.rate, priceUnit: r.priceUnit, mobPrice: r.mobPrice, demobPrice: r.demobPrice,
    rentalUnits: units,
    mobUnits: leg(r.mobUnits), demobUnits: leg(r.demobUnits),
    mobExcluded: r.mobExcluded, demobExcluded: r.demobExcluded,
  };
}
