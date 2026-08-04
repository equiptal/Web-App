/**
 * Negotiation-round reconstruction from the deal-room chat (app parity — deal_room/data/negotiation_rounds.dart).
 *
 * There is NO rounds endpoint. The app rebuilds the price/units history from the GetStream `rate_proposal`
 * messages. The backend nests the round payload under the message's `custom` object (Dart reads it as
 * `extraData['custom']`; the JS SDK exposes the same object as `message.custom`, and some fields may be
 * spread onto the message root). We read BOTH defensively and fall back gracefully — if nothing is
 * reachable, callers use the room-payload values (never break the live flow).
 */

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

/** The `custom.type` vocabulary, parsed into exactly what each card carries. */
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
  | { type: "term_reopened"; termKey: string };

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
  /** Class suffix — the six types must be visually distinct (AC-06/AC-07). */
  tone: "rate" | "accepted" | "term-ok" | "term-counter" | "term-edit" | "term-reopen";
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
  /** How the outcome reads — an acceptance is good news, a superseded offer is just history. */
  outcomeTone: "accepted" | "history";
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

/** Typed card + room context → the view-model the card component renders. */
export function buildChatCardView(card: ChatCard, ctx: ChatCardCtx): ChatCardView {
  const { ar, L, terms } = ctx;
  const at = (() => {
    if (!ctx.at) return "";
    const d = ctx.at instanceof Date ? ctx.at : new Date(ctx.at);
    return Number.isNaN(d.getTime())
      ? ""
      : d.toLocaleTimeString(ar ? "ar-SA-u-ca-gregory" : "en-GB", { hour: "2-digit", minute: "2-digit" });
  })();
  const base = { at, transition: null, actions: false, outcome: null, outcomeTone: "accepted" } as const;
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
  }
}
