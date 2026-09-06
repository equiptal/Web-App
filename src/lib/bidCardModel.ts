/**
 * One model behind every surface that draws a bid link: the generated OG image, the clipboard card,
 * and the app-sent email that mirrors it.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────────────────────────────
 * The card used to be built by splitting the preview endpoint's two strings back into fields. Those
 * strings carry a city and a rental basis and nothing else — no items, no mobilization, no fuel, no
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
import { partyToken } from "@/lib/contract/labels";

export interface BidCardTerm {
  label: string;
  value: string;
}

/**
 * One machine on a multi-machine request.
 *
 * `terms` carries only what this item does NOT share with the others. Delivery, fuel and the F.A.T
 * split are modelled per item, so three machines can carry three answers — and a card that showed
 * one of the three, or collapsed them to "Varies", made a supplier price the wrong one and withdraw
 * at the deal room. What every item agrees on is lifted into the request's own block above.
 */
export interface BidCardItem {
  /** `Excavator 20 ton · with operator` */
  label: string;
  /** `2 units`, or empty for a single one. */
  units: string;
  /** This item's own answers, where they differ from the shared block. */
  terms: BidCardTerm[];
}

export interface BidCardModel {
  /** `EXC-170845` / `RFQ-00077`, or null on a request that predates the short-code sequence. */
  ref: string | null;
  /** The image's headline: the first machine, then `+n more`. Never more than one line's worth. */
  imageHeadline: string;
  /** The card's headline: the scale and the city, because the list sits under it. */
  cardTitle: string;
  /** Each machine, with the terms only IT carries. Empty for a single-machine request. */
  items: BidCardItem[];
  /** `Riyadh · 1 month · 18 Aug → 17 Sep 2026`, dropping whatever the request does not carry. */
  where: string | null;
  /**
   * The terms EVERY item agrees on — the request's own answers.
   *
   * Mobilization, demobilization, food, accommodation & transport, fuel, equipment year and the
   * certificates asked for. Only what is set: a request with no fuel answer prints no fuel row,
   * because "Fuel: —" teaches a supplier to skim the block and then he skims the row that mattered.
   */
  terms: BidCardTerm[];
  /** `Bidding closes 21 Aug 2026` while open, `Closed 21 Aug 2026. No longer accepting bids` after. */
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
    closed: (on: string) => `Closed ${on}. No longer accepting bids`,
    closedNoDate: "No longer accepting bids",
    machines: (n: number) => `${n} machines`,
    more: (n: number) => (n === 1 ? " + 1 other equipment item" : ` + ${n} other equipment items`),
    withOperator: "with operator",
    /** ⚠️ «12 units», not «×12» (owner, 2026-09-06). A multiplication sign is a spreadsheet's
        shorthand; a supplier reading a request reads a count. */
    units: (n: number) => `${n} ${n === 1 ? "unit" : "units"}`,
    onRenter: "Renter",
    onSupplier: "Supplier",
    days: (n: number) => `${n} ${n === 1 ? "day" : "days"}`,
    weeks: (n: number) => `${n} ${n === 1 ? "week" : "weeks"}`,
    months: (n: number) => `${n} ${n === 1 ? "month" : "months"}`,
    extendable: (period: string) => `${period} & extendable`,
    terms: {
      mob: "Mobilization",
      demob: "Demobilization",
      food: "Food",
      accom: "Accommodation & transport",
      fuel: "Fuel",
      year: "Equipment year",
      certEquipment: "Equipment cert",
      certOperator: "Operator cert",
    },
  },
  ar: {
    cta: "افتح الرابط لتقديم عرضك ←",
    ctaClosed: "لم يعد يقبل العروض",
    closes: (on: string) => `يُغلق الاستقبال ${on}`,
    closed: (on: string) => `أُغلق ${on}. لم يعد يقبل العروض`,
    closedNoDate: "لم يعد يقبل العروض",
    machines: (n: number) => `${n} معدات`,
    more: (n: number) => (n === 1 ? " + معدّة أخرى" : ` + ${n} معدات أخرى`),
    withOperator: "مع مشغّل",
    units: (n: number) => (n === 1 ? "وحدة واحدة" : n === 2 ? "وحدتان" : `${n} وحدات`),
    varies: "يختلف حسب المعدة",
    onRenter: "على المستأجر",
    onSupplier: "على المؤجّر",
    days: (n: number) => `${n} يوم`,
    weeks: (n: number) => `${n} أسبوع`,
    months: (n: number) => `${n} شهر`,
    extendable: (period: string) => `${period} وقابل للتمديد`,
    terms: {
      mob: "النقل إلى الموقع",
      demob: "النقل من الموقع",
      food: "الإعاشة",
      accom: "السكن والنقل",
      fuel: "الوقود",
      year: "سنة الصنع",
      certEquipment: "شهادة المعدة",
      certOperator: "شهادة المشغّل",
    },
  },
} as const;

/**
 * What an unfurling client will show before it cuts.
 *
 * WhatsApp gives roughly two lines, Slack a little more, Apple Mail more again. 200 is past the
 * backend's own 160 — this description is worth more room because it is the only prose the card has
 * now that the image says just the machine — and short enough that nothing important is cut.
 */
const DESCRIPTION_MAX = 200;

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

/**
 * A trailing country phrase on a segment that carries no comma of its own.
 *
 * ⚠️ **A comma-less label is not a rare shape, it is what a dropped PIN returns**, and it defeated
 * the segment walk entirely: `COUNTRY_SEGMENTS` matches a WHOLE segment, so `"Riyadh Saudi Arabia"`
 * is one segment that is not the country, and the whole string came back as the city.
 *
 * Measured against live staging on 2026-09-03: the card IMAGE for `CEX-020902` read `Diriyah` while
 * the e-mail BODY of the same request read `QFC4+RX Diriyah Saudi Arabia`. The agents backend had
 * fixed its copy of this function and this one had not, so one request said two different things in
 * one message.
 *
 * Longest first, so "Kingdom of Saudi Arabia" is not left as "Kingdom of" and the Arabic long form
 * is not left as its own first half. The short forms are suffixes of the long ones.
 */
const COUNTRY_TAILS = ["kingdom of saudi arabia", "المملكة العربية السعودية", "saudi arabia", "السعودية", "ksa"];

const stripCountryTail = (s: string) => {
  for (const tail of COUNTRY_TAILS) {
    const cut = s.length - tail.length;
    if (cut < 0) continue;
    // ⚠️ The tail must be its own WORD, not any suffix: `ksa` is three letters, and a bare
    // `endsWith` would turn a city transliterated "Miksa" into "Mi". `cut === 0` is the whole
    // segment being the country, which must still match.
    if (cut > 0 && !/\s/.test(s[cut - 1])) continue;
    // Lowercase only the CANDIDATE SUFFIX, never the whole string: folding can change a string's
    // length, and an index taken from the folded copy then cuts the original in the wrong place.
    if (s.slice(cut).toLowerCase() !== tail) continue;
    return s.slice(0, cut).trim();
  }
  return s;
};

/**
 * Google returns a PLUS CODE in place of a street number when the pin is not on a mapped address:
 * `"QFC4+RX Diriyah"` becomes `"Diriyah"`. It is a grid reference, so it names nothing a supplier
 * can read, and it LEADS the line, taking the room the city needs.
 *
 * Anchored with `$` as well as the space, so a bare plus code with nothing after it resolves to no
 * city at all rather than to itself.
 */
const stripPlusCode = (s: string) => s.replace(/^[A-Z0-9]{4,8}\+[A-Z0-9]{2,4}(\s+|$)/i, "").trim();

/** Postcode, then country tail, then plus code, in that order, since each can uncover the next. */
const cleanSegment = (s: string) => stripPlusCode(stripCountryTail(stripPostcode(s)));

export function cityOf(label: string | null | undefined): string | null {
  if (!label) return null;
  const parts = label.split(/[,،]/).map((p) => p.trim()).filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    const cleaned = cleanSegment(parts[i]);
    if (!cleaned) continue;
    if (COUNTRY_SEGMENTS.has(cleaned.toLowerCase())) continue;
    return cleaned;
  }
  /**
   * ⚠️ **Nothing readable was left, so this answers NULL.** It used to fall back to the raw last
   * segment, which put "Saudi Arabia" on the card as the site of the job. `where` drops a null part,
   * so the line reads "4 months & extendable . 1 Sep to 31 Dec 2026" instead: shorter, and true.
   */
  return null;
}

/** Whose responsibility a term is. Anything that is not one of the two parties shows as it arrived. */
function party(v: string | null | undefined, lang: "en" | "ar"): string | null {
  const s = partyToken(v);
  if (!s) return null;
  const u = s.toUpperCase();
  if (u === "RENTER" || u === "RENTEE") return COPY[lang].onRenter;
  if (u === "SUPPLIER" || u === "ME") return COPY[lang].onSupplier;
  return s;
}

/*
 * — `acrossItems` lived here —
 *
 * It answered a per-item term for the whole request, and said "Varies by machine" when the items
 * disagreed. That named the existence of a difference without naming the difference, so a supplier
 * priced one of the answers and found out which one at the deal room. Each machine now states its
 * own; what they agree on is lifted into the request's block. See `termsOf` and `shared`.
 */

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

/**
 * `1 month` / `2 weeks` / `9 days`, whichever is the honest round number for the window — and
 * `1 month & extendable` when the renter said the hire may run on.
 *
 * ⚠️ The word is drawn for `true` ONLY. `false` and `null` both say nothing: null means the renter
 * was never asked, and printing "not extendable" as a fact nobody stated is the failure this guards.
 * A supplier who is not told may price a flat month against a hire that was always meant to run on.
 */
function durationOf(
  start: string | null,
  end: string | null,
  lang: "en" | "ar",
  extendable: boolean | null = null,
): string | null {
  if (!start || !end) return null;
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return null;
  const days = Math.max(1, Math.round((b - a) / DAY_MS));
  const t = COPY[lang];
  const period = days >= 30 ? t.months(Math.round(days / 30)) : days >= 7 && days % 7 === 0 ? t.weeks(days / 7) : t.days(days);
  return extendable === true ? t.extendable(period) : period;
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
  /* ⚠️ «2 units», not «×2» (owner, 2026-09-06). A multiplication sign is a spreadsheet's
     shorthand; a supplier reading a request reads a count. One unit says nothing, because one is
     what a bare machine name already means. */
  const count = (n: number) => (n > 1 ? ` ${t.units(n)}` : "");
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
  /**
   * ── One item's own answers ─────────────────────────────────────────────────────────────────────
   *
   * Every term the card can draw, for ONE machine, in the order a supplier prices them: who moves it
   * there and back, who feeds and houses the operator, who fuels it, how old it may be, and what it
   * must be certified to.
   *
   * Nothing is invented. A term the request does not answer produces no row — never "Fuel: —",
   * because an empty row teaches a supplier to skim the block and then he skims the row that
   * mattered.
   */
  const termsOf = (i: BidFormItem): BidCardTerm[] => {
    const fuel = party(i.requiredTerms?.fuel, lang);
    const fuelType = i.requiredTerms?.fuelType?.trim();
    const year = i.requiredTerms?.year?.trim();
    /**
     * ⚠️ **Two certificates, and they are not the same question** (owner, 2026-09-05:
     * *"this on the card details must be specific equipment or operator cert"*).
     *
     * ~~Both joined under one «Certificates» row.~~ `Certificates: tuv` does not say whether the
     * MACHINE must hold a TUV inspection or the OPERATOR must hold a TUV licence, and a supplier
     * pricing the wrong one either quotes for a certificate he does not need or turns up without
     * the one he does. Two rows, each naming what it belongs to, and either can be absent.
     */
    const equipmentCert = i.requiredTerms?.equipmentCert?.trim();
    const operatorCert = i.requiredTerms?.operatorCert?.trim();
    return (
      [
        { label: t.terms.mob, value: party(i.deliveryBy, lang) },
        { label: t.terms.demob, value: party(i.returnBy, lang) },
        { label: t.terms.food, value: party(i.requiredTerms?.fatFood, lang) },
        { label: t.terms.accom, value: party(i.requiredTerms?.fatTransport, lang) },
        { label: t.terms.fuel, value: fuel && fuelType ? `${fuel} · ${fuelType.toLowerCase()}` : fuel },
        // "any" is the absence of a requirement, not a requirement to be any age.
        { label: t.terms.year, value: year && year.toLowerCase() !== "any" ? year : null },
        { label: t.terms.certEquipment, value: equipmentCert || null },
        { label: t.terms.certOperator, value: operatorCert || null },
      ] as { label: string; value: string | null }[]
    ).flatMap((r) => (r.value ? [{ label: r.label, value: r.value }] : []));
  };

  /**
   * ── What the request answers, and what each machine answers for itself ────────────────────────
   *
   * A term every item agrees on belongs to the REQUEST and is stated once, at the top, beside the
   * site and the dates. A term they disagree on belongs to the machine and is stated on its row.
   *
   * ~~`acrossItems` collapsed a disagreement to the word "Varies".~~ That told a supplier there was
   * something he needed to know without telling him what it was, so he priced one of the answers and
   * found out which at the deal room. Two excavators where one is delivered by the renter and one by
   * the supplier is an ordinary request, and it is now drawn as one.
   */
  const perItem = items.map(termsOf);
  const shared = perItem[0].filter((r) => perItem.every((list) => list.some((x) => x.label === r.label && x.value === r.value)));
  const isShared = (r: BidCardTerm) => shared.some((x) => x.label === r.label && x.value === r.value);
  const rows: BidCardTerm[] = shared;

  const startEnd = [fmtDate(form.projectTerms?.startDate ?? null, lang, false), fmtDate(form.projectTerms?.endDate ?? null, lang)]
    .filter(Boolean)
    .join(" → ");

  return {
    ref: preview?.reference ?? bidCardDetails(copy, lang, accepting).ref,
    imageHeadline,
    cardTitle,
    // A single-machine request already says the machine in the title; repeating it as a row below is
    // the same words twice in 14 vertical pixels. Its terms are all "shared" by definition, so they
    // sit in the request's own block.
    items: multi
      ? items.map((i, n) => ({
          label: itemLabel(i, lang),
          units: (i.numberOfUnits ?? 1) > 1 ? t.units(i.numberOfUnits ?? 1) : "",
          terms: perItem[n].filter((r) => !isShared(r)),
        }))
      : [],
    where: [
      // The site is stated once for the whole request, whether there is one machine or six — it is
      // the request's answer, not a machine's.
      city,
      durationOf(
        form.projectTerms?.startDate ?? null,
        form.projectTerms?.endDate ?? null,
        lang,
        form.projectTerms?.extendable ?? null,
      ),
      startEnd || null,
    ]
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
  /**
   * ⚠️ **There is a length, and the order is a priority order.**
   *
   * This used to join where + every term + the closing line and hand over whatever came out — around
   * 215 characters for an ordinary request. WhatsApp gives a description about two lines, and the
   * backend's own copy clamps at 160, so the tail was being cut by the client — and the tail was the
   * DEADLINE, which is the one line that decides whether a supplier acts today or next week.
   *
   * So: where, then the deadline, then as many terms as fit. A term that does not fit is on the page
   * one tap away; a deadline that does not fit is a bid that arrives too late.
   */
  const head = [m.where, m.closing].filter(Boolean).join(" · ");
  let out = head;
  for (const term of m.terms) {
    const next = `${out} · ${term.label}: ${term.value}`;
    if (next.length > DESCRIPTION_MAX) break;
    out = next;
  }
  // Only the head can exceed the budget on its own, and cutting a date in half is worse than an
  // ellipsis — so it is trimmed rather than clipped by whoever renders it.
  return out.length > DESCRIPTION_MAX ? `${out.slice(0, DESCRIPTION_MAX - 1).trimEnd()}…` : out;
}
