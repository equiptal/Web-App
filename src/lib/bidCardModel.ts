/**
 * One model behind every surface that draws a bid link: the generated OG image, the clipboard card,
 * and the app-sent email that mirrors it.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────────────────────────────
 * The card used to be built by splitting the preview endpoint's two strings back into fields. Those
 * strings carry a city and a rental basis and nothing else — no items, no mobilisation, no fuel, no
 * dates — which is why the card never showed a term: they were never in the string to begin with
 * (found in production, 2026-09-01).
 *
 * The values exist. `GET /public/bid-form/{token}` carries every one of them, publicly and without
 * auth: items with size and count, `projectTerms`, per-item `requiredTerms`, delivery and return
 * party, the deadline and the status. So that is what the card reads.
 *
 * ⚠️ **That endpoint bumps `request_share_links.opened_count`** (`getBidForm.ts:56`), so every unfurl
 * bot counts as a supplier opening the link. Accepted deliberately (owner, 2026-09-01): nothing reads
 * that number today. If it ever becomes a metric a renter is shown, the fields have to move onto the
 * read-only `/preview` endpoint instead — that is the whole of the fix, and nothing else here moves.
 *
 * Everything degrades: no form payload, and the card falls back to splitting the preview strings, as
 * it does today. An unfurl bot has no user to apologise to, so every path here ends in a card.
 */

import type { BidPreview } from "@/lib/api/bidPreview";
import { bidCardDetails } from "@/lib/bidCardDetails";
import type { BidFormData, BidFormItem } from "@/lib/contract/link-bids";

export interface BidCardTerm {
  label: string;
  value: string;
}

export interface BidCardModel {
  /** `EXC-170845` / `RFQ-00077`, or null on a request that predates the short-code sequence. */
  ref: string | null;
  /** The image's headline: the first machine, then `+n more`. Never more than one line's worth. */
  imageHeadline: string;
  /** The card's headline: the scale and the city, because the list sits under it. */
  cardTitle: string;
  /** Each machine on its own row. Empty for a single-machine request — the title already said it. */
  items: BidCardTerm[];
  /** `Riyadh · 1 month · 18 Aug → 17 Sep 2026`, dropping whatever the request does not carry. */
  where: string | null;
  /** Mobilisation, demobilisation, food, accommodation & transport, fuel. Only what is set. */
  terms: BidCardTerm[];
  /** `Bidding closes 21 Aug 2026` while open, `Closed 21 Aug 2026 — no longer accepting bids` after. */
  closing: string | null;
  accepting: boolean;
  /** The one line the image asks for: bid, or do not bother. */
  cta: string;
}

const COPY = {
  en: {
    cta: "Open the link to submit your bid →",
    ctaClosed: "No longer accepting bids",
    closes: (on: string) => `Bidding closes ${on}`,
    closed: (on: string) => `Closed ${on} — no longer accepting bids`,
    closedNoDate: "No longer accepting bids",
    machines: (n: number) => `${n} machines`,
    more: (n: number) => ` +${n} more`,
    withOperator: "with operator",
    varies: "Varies by machine",
    onRenter: "Renter",
    onSupplier: "Supplier",
    days: (n: number) => `${n} ${n === 1 ? "day" : "days"}`,
    weeks: (n: number) => `${n} ${n === 1 ? "week" : "weeks"}`,
    months: (n: number) => `${n} ${n === 1 ? "month" : "months"}`,
    terms: {
      mob: "Mobilisation",
      demob: "Demobilisation",
      food: "Food",
      accom: "Accommodation & transport",
      fuel: "Fuel",
    },
  },
  ar: {
    cta: "افتح الرابط لتقديم عرضك ←",
    ctaClosed: "لم يعد يقبل العروض",
    closes: (on: string) => `يُغلق الاستقبال ${on}`,
    closed: (on: string) => `أُغلق ${on} — لم يعد يقبل العروض`,
    closedNoDate: "لم يعد يقبل العروض",
    machines: (n: number) => `${n} معدات`,
    more: (n: number) => ` +${n} أخرى`,
    withOperator: "مع مشغّل",
    varies: "يختلف حسب المعدة",
    onRenter: "على المستأجر",
    onSupplier: "على المؤجّر",
    days: (n: number) => `${n} يوم`,
    weeks: (n: number) => `${n} أسبوع`,
    months: (n: number) => `${n} شهر`,
    terms: {
      mob: "النقل إلى الموقع",
      demob: "النقل من الموقع",
      food: "الإعاشة",
      accom: "السكن والنقل",
      fuel: "الوقود",
    },
  },
} as const;

const MONTHS = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  ar: ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"],
} as const;

/** Riyadh, always. A card rendered in a Lambda running UTC would put a date a day out. */
const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function fmtDate(iso: string | null, lang: "en" | "ar", withYear = true): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const t = new Date(d.getTime() + RIYADH_OFFSET_MS);
  const day = `${t.getUTCDate()} ${MONTHS[lang][t.getUTCMonth()]}`;
  return withYear ? `${day} ${t.getUTCFullYear()}` : day;
}

/**
 * The city out of a project address label.
 *
 * NOT the last comma-segment: a Google-formatted address ends in the country and usually carries a
 * postcode on the city segment, so the last segment is "Saudi Arabia" on nearly every request. Walk
 * backwards, skip the country, strip the postcode. Mirrors `cityFromAddressLabel` in the agents
 * backend, which is where the same rule already runs for the preview strings.
 *
 * The city and never the address: a card is scraped without auth, so a link forwarded twice must not
 * carry a customer's yard.
 */
const COUNTRY_SEGMENTS = new Set([
  "saudi arabia",
  "ksa",
  "kingdom of saudi arabia",
  "السعودية",
  "المملكة العربية السعودية",
]);

const stripPostcode = (s: string) => s.replace(/\b\d{4,6}\b/g, " ").replace(/\s+/g, " ").trim();

export function cityOf(label: string | null | undefined): string | null {
  if (!label) return null;
  const parts = label.split(/[,،]/).map((p) => p.trim()).filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    const cleaned = stripPostcode(parts[i]);
    if (!cleaned) continue;
    if (COUNTRY_SEGMENTS.has(cleaned.toLowerCase())) continue;
    return cleaned;
  }
  return parts.length ? stripPostcode(parts[parts.length - 1]) || parts[parts.length - 1] : null;
}

/** Whose responsibility a term is. Anything that is not one of the two parties shows as it arrived. */
function party(v: string | null | undefined, lang: "en" | "ar"): string | null {
  const s = (v ?? "").trim();
  if (!s) return null;
  const u = s.toUpperCase();
  if (u === "RENTER" || u === "RENTEE") return COPY[lang].onRenter;
  if (u === "SUPPLIER" || u === "ME") return COPY[lang].onSupplier;
  return s;
}

/**
 * One answer for the whole request, or the admission that there is more than one.
 *
 * Delivery, return and the F.A.T terms are modelled PER ITEM, so three machines can carry three
 * answers. Showing one of the three is worse than saying there are three: a supplier who prices on
 * the wrong one has to withdraw, and the renter finds out at the deal room.
 */
function acrossItems(items: BidFormItem[], pick: (i: BidFormItem) => string | null | undefined, lang: "en" | "ar"): string | null {
  const values = items.map((i) => party(pick(i), lang)).filter((v): v is string => !!v);
  if (!values.length) return null;
  return values.every((v) => v === values[0]) ? values[0] : COPY[lang].varies;
}

/** `Tower light 9m · with operator` — size and operator only when the request carries them. */
function itemLabel(it: BidFormItem, lang: "en" | "ar"): string {
  const label = (lang === "ar" ? it.labelAr || it.label : it.label) ?? "";
  const size = (lang === "ar" ? it.sizeAr || it.size : it.size) ?? "";
  const head = [label, size].filter(Boolean).join(" ").trim();
  // Positive only on a token that plainly means yes. A card that invents "with operator" prices a job
  // the renter did not ask for.
  const op = (it.requiredTerms?.operator ?? "").trim().toUpperCase();
  const withOp = ["YES", "TRUE", "WITH", "WITH_OPERATOR", "REQUIRED", "INCLUDED"].includes(op);
  return withOp ? `${head} · ${COPY[lang].withOperator}` : head;
}

/** `1 month` / `2 weeks` / `9 days`, whichever is the honest round number for the window. */
function durationOf(start: string | null, end: string | null, lang: "en" | "ar"): string | null {
  if (!start || !end) return null;
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return null;
  const days = Math.max(1, Math.round((b - a) / DAY_MS));
  const t = COPY[lang];
  if (days >= 30) return t.months(Math.round(days / 30));
  if (days >= 7 && days % 7 === 0) return t.weeks(days / 7);
  return t.days(days);
}

/**
 * Build the model.
 *
 * `form` is the request's own payload and is the source for everything it carries; `preview` supplies
 * the reference and the fallback strings. Either may be null.
 */
export function bidCardModel(
  preview: BidPreview | null,
  copy: { title: string; description: string },
  lang: "en" | "ar" = "en",
  form: BidFormData | null = null,
): BidCardModel {
  const t = COPY[lang];
  const accepting = form ? form.status !== "closed" : preview ? preview.status !== "closed" : true;

  if (!form || !form.items.length) {
    // The string path. `d.status` is the backend's own closing line, already localised.
    const d = bidCardDetails(copy, lang, accepting);
    return {
      ref: preview?.reference ?? d.ref,
      imageHeadline: d.headline,
      cardTitle: d.headline,
      items: [],
      where: d.rows.map((r) => r.value).join(" · ") || null,
      terms: [],
      closing: d.status || null,
      accepting,
      cta: accepting ? t.cta : t.ctaClosed,
    };
  }

  const items = form.items;
  const multi = items.length > 1;
  const count = (n: number) => (n > 1 ? ` ×${n}` : "");
  const first = `${itemLabel(items[0], lang)}${count(items[0].numberOfUnits ?? 1)}`;
  const city = cityOf(form.projectTerms?.location);

  // The image names the first machine and counts the rest. Three headlines do not fit at 78px, and
  // shrinking them to fit makes the one a supplier is scanning for as small as the two he is not.
  const imageHeadline = multi ? `${first}${t.more(items.length - 1)}` : first;
  // The card has room for a list, so its title carries the scale and the city and the list does the rest.
  const cardTitle = multi ? [t.machines(items.length), city].filter(Boolean).join(" · ") : first;

  const closesOn = fmtDate(form.deadline, lang);
  const closing = accepting
    ? closesOn
      ? t.closes(closesOn)
      : null
    : closesOn
      ? t.closed(closesOn)
      : t.closedNoDate;

  /**
   * Fuel carries its type when the renter set one — "Renter · diesel" is a different job from
   * "Renter", and it is the kind of thing a supplier prices wrong once and remembers.
   */
  const fuel = acrossItems(items, (i) => i.requiredTerms?.fuel, lang);
  const fuelType = items[0]?.requiredTerms?.fuelType?.trim();
  const rows: BidCardTerm[] = [
    { label: t.terms.mob, value: acrossItems(items, (i) => i.deliveryBy, lang) },
    { label: t.terms.demob, value: acrossItems(items, (i) => i.returnBy, lang) },
    { label: t.terms.food, value: acrossItems(items, (i) => i.requiredTerms?.fatFood, lang) },
    { label: t.terms.accom, value: acrossItems(items, (i) => i.requiredTerms?.fatTransport, lang) },
    { label: t.terms.fuel, value: fuel && fuelType ? `${fuel} · ${fuelType.toLowerCase()}` : fuel },
    // What the request does not answer is not drawn. Never "Fuel: —": an empty row teaches a supplier
    // to skim the block, and then he skims the row that mattered.
  ].flatMap((r) => (r.value ? [{ label: r.label, value: r.value }] : []));

  const startEnd = [fmtDate(form.projectTerms?.startDate ?? null, lang, false), fmtDate(form.projectTerms?.endDate ?? null, lang)]
    .filter(Boolean)
    .join(" → ");

  return {
    ref: preview?.reference ?? bidCardDetails(copy, lang, accepting).ref,
    imageHeadline,
    cardTitle,
    // A single-machine request already says the machine in the title; repeating it as a row below is
    // the same words twice in 14 vertical pixels.
    items: multi ? items.map((i) => ({ label: itemLabel(i, lang), value: `×${i.numberOfUnits ?? 1}` })) : [],
    where: [multi ? null : city, durationOf(form.projectTerms?.startDate ?? null, form.projectTerms?.endDate ?? null, lang), startEnd || null]
      .filter(Boolean)
      .join(" · ") || null,
    terms: rows,
    closing,
    accepting,
    cta: accepting ? t.cta : t.ctaClosed,
  };
}

/**
 * The description an unfurling client shows under the title.
 *
 * WhatsApp, Slack and Apple Mail draw the image, the title and this — and no markup at all. So now
 * that the image says only what is being rented, this line is where the detail goes: it reflows, it
 * is selectable, and it survives a recipient who has images turned off.
 *
 * On a closed request the state is ADDED to it, never put in its place: the preview endpoint replaces
 * the whole description with "no longer accepting bids", so a link forwarded a week later keeps the
 * machine (it is in the title) and loses the city and the dates. Here the request stays named and the
 * state sits beside it.
 */
export function bidCardDescription(m: BidCardModel): string {
  return [m.where, m.terms.map((x) => `${x.label}: ${x.value}`).join(" · ") || null, m.closing]
    .filter(Boolean)
    .join(" · ");
}
