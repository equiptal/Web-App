/**
 * The governance dashboard's one computation: the renter's own requests, bids and awards, folded
 * into the shape the board renders from.
 *
 * ── Why this is a pure function ─────────────────────────────────────────────────────────────────
 *
 * Every card on that page — the four figures, the award table, the machine rates, the supplier
 * table, the channel comparison, the papers strip — derives from the object this returns. Nothing
 * on the page holds a number of its own. That was deliberate: the prototype carried typed figures
 * for a while and they drifted from the table underneath them four separate times, including two
 * cards that disagreed about who had won one request.
 *
 * So the fold happens HERE, once, with no network and no DOM, and the test file is the only place
 * the arithmetic is checked. A route fetches, this shapes, the page draws.
 *
 * ── Every bid is carried whole ──────────────────────────────────────────────────────────────────
 *
 * A bid used to arrive here as a five-slot tuple — firm, price, date, met-the-terms, won — so a
 * drill-down could only ever restate the row it was opened from. Everything a reader actually
 * wants on opening a row (which terms were missed, on what basis the rate was quoted, what the
 * machine was, what the firm's registration is, whether its papers expire mid-hire) was already on
 * the bid the route had fetched, and was discarded one function before the page could show it.
 * {@link BoardBid} now keeps it, and the modal reads nothing this fold did not compute.
 *
 * ── What it deliberately does not do ────────────────────────────────────────────────────────────
 *
 * It never infers a missing fact. A request whose reach is not stored comes back with `opened:
 * null`, not a zero and not a guess — the board prints "not stored" and says so again in the
 * blind-spots card. Collapsing absent into zero is how a request nobody saw and a request everybody
 * ignored end up looking identical.
 */
import type { RequestListItem } from "@/lib/contract/requests";
import type { BidCard, TermRow } from "@/lib/contract/bids";
import { computeChargedDays } from "@/lib/contract/charged-days";
import { computeCycleTotals } from "@/lib/contract/cycle-totals";
import { rentalDivisor, isKnownRentalUnit } from "@/lib/pricing/rental";
import { MARKET_RATES, MARKET_RATES_MEASURED } from "@/lib/governance/market-rates";

/**
 * One machine type's going rate.
 *
 * Taken from the BIDS the renter actually received for that machine type, not from the store
 * listings. A listing is an asking price nobody has tested; a bid is a price a supplier agreed to
 * be held to, on this renter's own dates, site and terms. Comparing an award against listings
 * answered a question nobody asked, and on a subtype with two listings it compared it against an
 * anecdote.
 */
export interface MarketBand {
  /** Median rate reduced to one day, so a weekly and a monthly quote sit on one scale. */
  med: number;
  /** How many bids the median was taken over. Below three it is not published at all. */
  n: number;
  lo: number;
  hi: number;
  /** How many separate firms those bids came from. Three bids from one firm is still one opinion. */
  firms: number;
  /**
   * Where the band came from.
   *
   * `"yours"` is the median of the renter's OWN bids for this machine type — specific to his
   * dates, site and terms, and the better comparison when there are enough of them.
   * `"platform"` is the frozen table in `market-rates.ts`, measured once across every bid on the
   * platform. The two answer different questions and the card has to name which it is showing:
   * "you are 12% over" means one thing against your own three quotes and another against 589
   * bids from 47 companies.
   */
  source: "yours" | "platform";
  /** Set only on a platform band: the date it was measured. A snapshot has to carry its date. */
  measured?: string;
}

/**
 * One row of the renter's own supplier registry, as the registry stores it.
 *
 * ⚠️ This lives on the AGENTS backend (`/agents/renter-suppliers`), not on app-backend. The route
 * asked app-backend for it for a while, caught the 404 and carried on with an empty set, so every
 * supplier on the board read "not registered" — a wrong answer that looks exactly like a renter
 * who has registered nobody.
 */
export interface RegistryEntry {
  supplierId: string | null;
  companyId: string | null;
  crNumber: string | null;
  name: string;
  /** The renter ticked this firm as an approved vendor. The registry's own boolean, not a guess. */
  vendorRegistered: boolean;
  onMoedatech: boolean;
  groups: string[];
  /**
   * What this firm has done with this renter, counted by the registry rather than by this page.
   *
   * It covers EVERY bid the firm has ever sent him, not only the ones inside the newest-sixty
   * window this board folds. A supplier who bid eleven times last quarter and twice this one reads
   * "2 of 5 requests" from the board's own arithmetic and "13 bids" from here, and both are true
   * of different questions. The card says which is which rather than picking one.
   */
  rollup: { bidsApp: number; bidsLink: number; awards: number; rooms: number; lastBidAt: string | null } | null;
}

export interface GovernanceInput {
  requests: RequestListItem[];
  /** Marketplace bids and link submissions already merged, keyed by request id. */
  bidsByRequest: Record<string, BidCard[]>;
  /** Link shares per request: how many firms it was sent to and how many opened it. */
  sharesByRequest: Record<string, { sent: number; opened: number } | undefined>;
  /** Larger machines the size filter held back, per request, from the bid list's `sizeCounts`. */
  heldByRequest: Record<string, number | undefined>;
  /** Project titles, so a row can name the site rather than print a cuid. */
  projectNames: Record<string, string | undefined>;
  /** The renter's own supplier registry. Empty is a legitimate answer: he has registered nobody. */
  registry: RegistryEntry[];
}

/** One supplier's offer on one request, carried whole so a drill-down answers without a refetch. */
export interface BoardBid {
  firm: string;
  /** The headline rate, in whatever basis the supplier quoted it in. */
  price: number;
  /** The same rate reduced to one day. Every comparison runs on this, never on `price`. */
  perDay: number;
  /** PER_DAY, PER_WEEK, PER_MONTH. Printed beside the rate so the two cannot be confused. */
  unit: string;
  units: number;
  at: string;
  /** Met every term. Whole bids only, never a share — see {@link metEveryTerm}. */
  ok: 0 | 1;
  won: 0 | 1;
  /** The terms this bid failed, by name. A count says "2 of 9"; this says which two. */
  missed: string[];
  /** The terms it answered and the renter accepted. */
  met: string[];
  route: string;
  /** Has a Moedatech account. A link submission does not, and that is the whole channel split. */
  onPlatform: 0 | 1;
  verified: 0 | 1;
  registered: 0 | 1;
  cr: string | null;
  vat: string | null;
  address: string | null;
  city: string | null;
  /** The machine offered, when the bid named one. */
  machine: string | null;
  year: number | null;
  mob: number | null;
  demob: number | null;
  /** What the whole hire costs at this bid, on the same calculation that prices the award. */
  total: number;
  /** Where the price started, when the deal room moved it. Null when it never moved. */
  from: number | null;
  /** Papers on the units offered, with the expiry the platform holds. */
  docs: Array<{ type: string; expiry: string | null }>;
}

export interface BoardRequest {
  ref: string;
  machine: string;
  /** Taxonomy subtype. The key the market band is grouped by. */
  subtype: string | null;
  project: string | null;
  /** ISO dates, so a drill-down can print the window rather than only its length. */
  start: string | null;
  end: string | null;
  created: string | null;
  /**
   * When bidding closed. Null on a request that carries no deadline at all.
   *
   * Three checks hang off this and nothing else did for a while: a bid that landed after it, a
   * window too short for a supplier who was not already expecting the request, and the pair of
   * timestamps a late award would have to be judged against. All three were listed as "needs
   * something the platform does not store" while `expiresAt` sat unread on the request list.
   */
  deadline: string | null;
  /** ASAP / urgent, as the renter set it when raising the request. */
  urgency: string | null;
  status: string | null;
  city: string | null;
  /**
   * The hire window, when there is one.
   *
   * ⚠️ NULL on an open-ended hire, which is the MAJORITY of requests: 390 of 655 on the platform
   * and 52 of this renter's 57 carry a start date, a rental basis (MONTHLY / WEEKLY / DAILY) and
   * no end date at all. That is a real business state, not bad data — you hire the machine from
   * the 17th, monthly, until you send it back.
   */
  days: number | null;
  fri: number | null;
  billable: number | null;
  /**
   * Whether the hire can be priced at all.
   *
   * The fold used to DROP a request it could not price, which threw away every open-ended hire
   * on the board — the renter saw an empty page and 52 lines of "cannot be priced" in a console
   * nobody reads. Only the MONEY needs an end date. Who bid, by what route, against which terms,
   * with what papers, at what rate per day: all of it is answerable without one, and all of it
   * is what this page is for.
   */
  priced: boolean;
  /**
   * Whether the hire window is the one on the request, or ONE CYCLE assumed from its rental
   * basis because the request is open ended.
   *
   * 52 of this renter's 57 requests, and 390 of 655 platform wide, carry a start date and a
   * basis (MONTHLY / WEEKLY / DAILY) with no end. Refusing to price them left every money card
   * at zero across an account with 214 real bids. Pricing one cycle answers the question the
   * reader is actually asking — "what does this machine cost me" — and the board says in plain
   * words that it is one month, not the whole hire.
   *
   * ⚠️ A one-cycle figure is NOT a commitment and must never be summed as though it were the
   * cost of the hire. Everywhere it is shown it carries its basis.
   */
  window: "stated" | "one-cycle";
  /** MONTHLY · WEEKLY · DAILY, when the request states one. */
  basis: string | null;
  units: number;
  channel: string;
  /** Firms the link was sent to. Null on any route that is not a shared link. */
  sent: number | null;
  /**
   * How many suppliers the request actually reached.
   *
   * On a shared link, the firms that opened it. On a marketplace request, the count dispatch
   * notified (`suppliersNotified`), which the backend has returned on `my-requests` since
   * 2026-09-24 and which this page simply never read — it printed "suppliers reached not stored"
   * on every marketplace row for as long as the field went unmapped. On a direct request, one.
   *
   * ⚠️ Still null, never zero, when the payload predates the field. A request nobody saw and a
   * request everybody ignored are different answers.
   */
  opened: number | null;
  /** What `opened` counts, so the card can label it rather than make the reader guess. */
  reach: "notified" | "opened" | "direct" | null;
  held: number;
  /** The renter edited the request after bids were already in. */
  edited: boolean;
  bids: BoardBid[];
  market: MarketBand | null;
  terms: Array<[string, string, 0 | 1]>;
  winner: {
    name: string;
    route: string;
    acct: string;
    ver: string;
    cr: string;
    vat: string;
    address: string;
    reg: string;
  } | null;
  /**
   * Whether this request has actually been awarded.
   *
   * A request with bids and no award still belongs on this page. Who bid, through which route,
   * whether they met the terms, what papers they carry and how their prices sit against the
   * market are all answerable the moment the bids arrive, and an account mid-flight is the normal
   * case rather than the exception. Only the MONEY questions need a winner, so only those read
   * this flag — everything else counts every row.
   */
  awarded: boolean;
  /** Set only when the award names a different firm from the accepted bid. */
  award?: string;
  disputed?: 1;
  money: Array<[string, string]>;
  total: string;
}

export interface BoardSupplier {
  src: string;
  ver: 0 | 1;
  cr: string;
  vat: string;
  address: string;
  city: string;
  reg: string;
  /** The groups the renter files this firm under, from his own registry. */
  groups: string[];
  /** The registry's own count of everything this firm has sent, across all time. Null if unlisted. */
  rollup: { bidsApp: number; bidsLink: number; awards: number; rooms: number; lastBidAt: string | null } | null;
}

export interface BoardCert {
  doc: string;
  supplier: string;
  /** Expired · Expiring · On file · Not held · Not required. */
  state: string;
  machine: string | null;
  req: string | null;
  /**
   * ⚠️ Null means the platform holds the document but records no expiry for it, NOT that it never
   * expires. The papers card was built only from documents that carried a date, so an account
   * whose certificates are all undated drew an empty card and read as an account with no
   * certificates at all. A paper with no date is a finding of its own.
   */
  expiry: string | null;
  hire: string | null;
  note: string;
  /** The request asked for this one. A missing paper only matters against a request that wanted it. */
  required?: 1;
  bad?: 1;
}

export interface BoardPayload {
  /**
   * What the money cards are counting.
   *
   * `"awarded"` is the real thing: a bid was accepted and the figures are what it costs.
   * `"leading"` is the ordinary state of an account mid-flight — bids in, nothing accepted yet —
   * where every money figure would otherwise be a column of zeros. The board then reports the
   * LEADING bid on each request instead, and every card that does says so in its own label.
   *
   * ⚠️ This is the one place the board reports something that has not happened. It is a
   * projection, never an award: `BoardRequest.awarded` stays false on every row, no supplier is
   * credited with a win, and the wording changes from "awarded" to "on the table". A renter whose
   * dashboard quietly counted his leading bids as spend would be reading a forecast as a fact.
   */
  basis: "awarded" | "leading";
  R: Record<string, BoardRequest>;
  SUPMETA: Record<string, BoardSupplier>;
  CERT: Record<string, BoardCert>;
  /** What the header prints, and the window every figure is scoped to. */
  period: { from: string | null; to: string | null };
  /** Named so the board can say what it could not read, rather than rendering a shorter truth. */
  skipped: Array<{ ref: string; why: string }>;
}

const CHANNEL = {
  market: "Moedatech marketplace",
  link: "Your own shared link",
  direct: "Direct to one named firm",
} as const;

const sar = (n: number) => Math.round(n).toLocaleString("en-US");

/** A bid won if the deal room accepted it, or the renter reported it as the winner in a survey. */
const didWin = (b: BidCard) => b.status === "ACCEPTED" || b.wonViaSurvey === true;

/**
 * Whole bids, never a share of terms. `conflictCount` is the backend's own count of the request's
 * requirements this bid fails, so a near miss on a certificate is a miss — the same rule the
 * comparison applies, rather than a second opinion about compliance living on this page.
 */
const metEveryTerm = (b: BidCard): 0 | 1 => (b.conflictCount === 0 ? 1 : 0);

/**
 * Did this offer come from a Moedatech account, or from outside the platform.
 *
 * ⚠️ NOT `supplierId != null`. `submissionToBidCard` gives every off-platform submission a
 * SYNTHETIC `supplierId` of `link-<id>` so the comparison can treat each one as its own column,
 * so that test called every link bid a Moedatech bid and the channel card reported zero
 * off-platform offers on accounts full of them. `viaSharedLink` is the real flag, and
 * `converted` is a link submission the backend later materialised into a first-class app bid —
 * still off-platform in origin, which is what this board is counting.
 */
const onPlatform = (b: BidCard): 0 | 1 => (b.viaSharedLink || b.converted ? 0 : 1);

/**
 * The rate reduced to one day.
 *
 * Every comparison on this board — against the market, between two bids, across a machine type —
 * runs on this and never on the headline. A weekly quote of 5,400 and a daily quote of 950 are
 * roughly the same price, and a median taken over the headlines would have called the first one
 * five times the second. An unrecognized basis is left at face value, matching
 * `computeRentalTotal`, which treats it the same way rather than dividing by a number it lacks.
 */
const perDayRate = (rate: number, unit: string | null | undefined): number =>
  isKnownRentalUnit(unit) && rentalDivisor(unit) > 0 ? rate / rentalDivisor(unit) : rate;

const termRows = (b: BidCard): TermRow[] => [
  ...(b.terms?.equipment ?? []),
  ...(b.terms?.contract ?? []),
  ...(b.terms?.supplier ?? []),
];

function machineLabel(r: RequestListItem): string {
  const name = r.item?.name?.trim() || "Equipment";
  const qty = r.item?.qty ?? 1;
  return qty > 1 ? `${name} ×${qty}` : name;
}

/** The route a request went out by. Reach, and everything compared by channel, hangs off this. */
function channelOf(r: RequestListItem, shared: boolean): string {
  if (r.type === "DIRECT") return CHANNEL.direct;
  return shared ? CHANNEL.link : CHANNEL.market;
}

/**
 * Match a bid to a row in the renter's own supplier registry.
 *
 * Four keys, tried in the order of how much each one proves: the company, then the user, then the
 * commercial registration, then the name. The last is a weak fallback — two firms can share a
 * trading name — but a registry row typed in by hand carries no ids at all, and refusing to match
 * it would report every manually added supplier as unregistered.
 */
function registryIndex(rows: RegistryEntry[]) {
  const byCompany = new Map<string, RegistryEntry>();
  const bySupplier = new Map<string, RegistryEntry>();
  const byCr = new Map<string, RegistryEntry>();
  const byName = new Map<string, RegistryEntry>();
  for (const e of rows) {
    if (e.companyId) byCompany.set(String(e.companyId), e);
    if (e.supplierId) bySupplier.set(String(e.supplierId), e);
    if (e.crNumber) byCr.set(e.crNumber.trim(), e);
    if (e.name) byName.set(e.name.trim().toLowerCase(), e);
  }
  return (b: BidCard): RegistryEntry | null =>
    (b.supplierCompanyId ? byCompany.get(String(b.supplierCompanyId)) : null) ??
    (b.supplierId ? bySupplier.get(String(b.supplierId)) : null) ??
    (b.supplierCrNumber ? byCr.get(b.supplierCrNumber.trim()) : null) ??
    byName.get((b.supplierName ?? "").trim().toLowerCase()) ??
    null;
}

/**
 * What the request asked for, against what the winning bid answered.
 *
 * Built from the bid's own compliance block rather than from a document scan: that block is what
 * `conflictCount` is computed over, so the list a reader opens and the count beside it cannot
 * disagree. A requirement the request never made is left out entirely instead of being shown as
 * met, which would read as credit for clearing a bar nobody set.
 */
function termsFor(r: RequestListItem, win: BidCard | null): Array<[string, string, 0 | 1]> {
  if (!win) return [];
  const out: Array<[string, string, 0 | 1]> = [];
  const yes = (ok: boolean): [string, 0 | 1] => (ok ? ["Yes", 1] : ["No", 0]);

  for (const cert of r.requiredCerts ?? []) {
    const held = cert === "TUV" || cert === "SPSP" ? win.compliance.safety : cert === "SASO" ? win.compliance.saso : true;
    out.push([`${cert} certificate`, held ? "Held" : "Not held", held ? 1 : 0]);
  }
  if (r.mobByRentee === false) out.push(["Transport on supplier", ...yes(true)]);
  if (r.demobByRentee === false) out.push(["Return on supplier", ...yes(true)]);
  /* The minimum-year requirement rides on the BID, not the request: `reqMinYear` is the request's
     ask as the bid list echoes it back, which is also the only place the deprecated `maxEquipmentAge`
     alias has already been resolved. Reading it off the request would miss every legacy row. */
  if (win.reqMinYear != null && win.equipment?.year != null) {
    const ok = win.equipment.year >= win.reqMinYear;
    out.push([`Minimum year ${win.reqMinYear}`, String(win.equipment.year), ok ? 1 : 0]);
  }
  out.push(["Commercial registration", win.compliance.activityLicense ? "On file" : "None", win.compliance.activityLicense ? 1 : 0]);
  out.push(["National address", win.compliance.nationalAddress ? "On file" : "None", win.compliance.nationalAddress ? 1 : 0]);
  /* Every term the comparison counted as a conflict, named. The count tells a reader that two
     terms failed; only this tells him which two, which is the form of the fact he can act on. */
  for (const t of termRows(win)) {
    if (t.state === "conflict") out.push([t.labelEn, t.detail?.en || "Not met", 0]);
  }
  return out;
}

/**
 * The money, through the same calculation the quotation prices with.
 *
 * Not `rate × days`: that ignores the rental basis, the Fridays nobody bills, and the mobilization
 * legs, and it is wrong by a different amount on every request. `computeCycleTotals` is the one
 * place those rules live, and this page is not allowed a second copy of them.
 */
function cycleTotal(
  r: RequestListItem,
  b: BidCard,
  units: number,
  charged: ReturnType<typeof computeChargedDays>,
): number {
  const totals = computeCycleTotals({
    rate: b.price,
    priceUnit: b.priceUnit,
    units,
    startDate: r.startDate,
    durationDays: charged.totalDays,
    mob: { amount: b.mobPrice, excluded: b.mobExcluded, units: b.mobUnits },
    demob: { amount: b.demobPrice, excluded: b.demobExcluded, units: b.demobUnits },
  } as Parameters<typeof computeCycleTotals>[0]);
  return totals.duration?.rental != null
    ? totals.duration.rental + (totals.duration.oneOff ?? 0)
    : (b.price ?? 0) * units * charged.chargedDays;
}

function moneyRows(b: BidCard, units: number, charged: ReturnType<typeof computeChargedDays>): Array<[string, string]> {
  const rows: Array<[string, string]> = [
    ["Rate per day", sar(perDayRate(b.price ?? 0, b.priceUnit))],
    ["Units", `×${units}`],
    ["Calendar days", String(charged.totalDays)],
    ["Fridays, not billed", `−${charged.fridays}`],
    ["Billable days", String(charged.chargedDays)],
  ];
  /* A weekly or monthly quote is shown as it was written BEFORE the daily rate it reduces to, so a
     reader checking the figure against the supplier's own quotation meets his own number first. */
  if (b.priceUnit && b.priceUnit !== "PER_DAY") {
    rows.unshift(["Quoted as", `${sar(b.price ?? 0)} ${b.priceUnit.replace("PER_", "per ").toLowerCase()}`]);
  }
  if (b.mobPrice) rows.push(["Mobilization", sar(b.mobPrice)]);
  if (b.demobPrice) rows.push(["Demobilization", sar(b.demobPrice)]);
  return rows;
}

export function buildGovernance(input: GovernanceInput): BoardPayload {
  const R: Record<string, BoardRequest> = {};
  const SUPMETA: Record<string, BoardSupplier> = {};
  const CERT: Record<string, BoardCert> = {};
  const skipped: BoardPayload["skipped"] = [];
  const lookup = registryIndex(input.registry ?? []);
  let from: string | null = null;
  let to: string | null = null;

  /* ── Pass one: the market band, from the renter's own bids ────────────────────────────────────
     Every bid on every request he raised for this machine type, reduced to a daily rate. It runs
     before the rows are built because a row prints its own position inside the band. */
  const byType = new Map<string, Array<{ perDay: number; firm: string }>>();
  for (const req of input.requests) {
    const subtype = req.item?.categoryId;
    if (!subtype) continue;
    for (const b of input.bidsByRequest[req.id] ?? []) {
      /* ⚠️ A rate outside this range is a data-entry error, not a price: staging carries bids at
         0 and at 130,000 SAR a day. The median survives them; `lo` and `hi` do not, and they are
         what the price rail is drawn against. The bid is still shown on its own row — it was
         really submitted — it just does not get to set the market. */
      if (!b.price || b.price <= 0) continue;
      const perDayCheck = perDayRate(b.price, b.priceUnit);
      if (perDayCheck < 100 || perDayCheck > 50000) continue;
      const list = byType.get(subtype) ?? [];
      list.push({ perDay: perDayRate(b.price, b.priceUnit), firm: b.supplierCompanyId || b.supplierId || b.supplierName });
      byType.set(subtype, list);
    }
  }
  const marketBySubtype = new Map<string, MarketBand>();
  for (const [subtype, list] of byType) {
    /* Three is the floor. Two bids have a midpoint, not a median, and a board printing "12% above
       market" off two numbers would be stating a rounding error as a finding. */
    if (list.length < 3) continue;
    const prices = list.map((x) => x.perDay).sort((a, b) => a - b);
    marketBySubtype.set(subtype, {
      med: prices[Math.floor(prices.length / 2)],
      n: prices.length,
      lo: prices[0],
      hi: prices[prices.length - 1],
      firms: new Set(list.map((x) => x.firm)).size,
      source: "yours",
    });
  }

  /* Where the renter has too few bids of his own, fall back to the measured platform band. That
     is most of his machine types on a young account, and it is the difference between a card that
     says "no band" and one that answers the question. The fallback never OVERRIDES his own bids:
     his are specific to his dates, site and terms, and are the better comparison when there are
     enough of them. */
  for (const req of input.requests) {
    const subtype = req.item?.categoryId;
    if (!subtype || marketBySubtype.has(subtype)) continue;
    const seeded = MARKET_RATES[subtype];
    if (seeded) marketBySubtype.set(subtype, { ...seeded, source: "platform", measured: MARKET_RATES_MEASURED });
  }

  for (const req of input.requests) {
    const bids = input.bidsByRequest[req.id] ?? [];
    const win = bids.find(didWin) ?? null;
    const ref = req.groupRef || req.code || req.displayId;

    /* ⚠️ NOTHING is filtered out any more — not by status, not by date, not by whether anybody
       bid. Owner, 2026-10-03: *"dont filter the requests date or status so it must appear"*.
       A request that drew no bids is not an absence of data, it is the finding: you asked and
       nobody answered. Dropping it made the board agree with itself about a market that had
       ignored him. The row carries `bids: []`, prices nothing, and says so. */

    /* With no award, the LEADING bid stands in for pricing the row: the cheapest that met every
       term, else simply the cheapest. It is never counted as money awarded — `awarded` stays false
       and every money figure skips it — but it is what lets the rate, the route and the supplier
       columns say something true about a request still out to the market. */
    /* ⚠️ Priced bids only, for the LEAD. Staging carries bids at 0 and at 5 SAR a day, and the
       lead is the cheapest — so one data-entry error became the leading bid on its request and
       priced the whole hire at nothing. A bid with no usable price is still shown in the field;
       it just cannot stand in for the award. */
    const usable = bids.filter((b) => (b.price ?? 0) > 0);
    const pool = usable.length ? usable : bids;
    const fit = pool.filter(metEveryTerm);
    const byPrice = (a: BidCard, b: BidCard) =>
      perDayRate(a.price ?? Infinity, a.priceUnit) - perDayRate(b.price ?? Infinity, b.priceUnit);
    /* Null on a request nobody bid on, which is now a row like any other. */
    const lead: BidCard | null = win ?? [...(fit.length ? fit : pool)].sort(byPrice)[0] ?? null;

    /* An open-ended hire is priced for ONE CYCLE of its own rental basis rather than refused.
       The basis is on the request; the end date is what is missing, and a renter who asks for a
       machine "monthly from the 17th" is asking what a month costs. */
    const CYCLE: Record<string, number> = { MONTHLY: 30, WEEKLY: 7, DAILY: 1 };
    const cycleDays = CYCLE[String(req.rentalType ?? "").toUpperCase()] ?? null;
    let endDate = req.endDate;
    let window: "stated" | "one-cycle" = "stated";
    if (!endDate && req.startDate && cycleDays) {
      const d = new Date(req.startDate);
      /* Inclusive: a one-day hire starts and ends on the same date. */
      d.setUTCDate(d.getUTCDate() + cycleDays - 1);
      endDate = d.toISOString().slice(0, 10);
      window = "one-cycle";
    }
    const charged = computeChargedDays({ startDate: req.startDate, endDate, rentalBasis: null });
    const priced = charged.known;

    const share = input.sharesByRequest[req.id];
    const channel = channelOf(req, !!share?.sent);
    const subtype = req.item?.categoryId ?? null;
    const winUnits = win ? win.unitsOffered || win.numberOfUnits || req.item?.qty || 1 : 0;

    if (req.createdAt && (!from || req.createdAt < from)) from = req.createdAt;
    if (req.createdAt && (!to || req.createdAt > to)) to = req.createdAt;

    const boardBids = bids.map<BoardBid>((b) => {
      const reg = lookup(b);
      const units = b.unitsOffered || b.numberOfUnits || req.item?.qty || 1;
      const rows = termRows(b);
      return {
        firm: b.supplierName,
        price: b.price ?? 0,
        perDay: perDayRate(b.price ?? 0, b.priceUnit),
        unit: b.priceUnit || "PER_DAY",
        units,
        at: b.submittedAt ?? "",
        ok: metEveryTerm(b),
        won: didWin(b) ? 1 : 0,
        missed: rows.filter((t) => t.state === "conflict").map((t) => t.labelEn),
        met: rows.filter((t) => t.state === "matched" || t.state === "agreed").map((t) => t.labelEn),
        /* A bid's route is the REQUEST's route for everything except a link submission, which can
           arrive on a request that also went to the marketplace. `supplierId` is the tell: an
           off-platform submission has no Moedatech user behind it. */
        route: onPlatform(b) ? channel : CHANNEL.link,
        onPlatform: onPlatform(b),
        verified: b.verified ? 1 : 0,
        registered: reg?.vendorRegistered ? 1 : 0,
        cr: b.supplierCrNumber ?? reg?.crNumber ?? null,
        vat: b.supplierVatNumber ?? null,
        address: b.supplierNationalAddress ?? null,
        city: b.supplierCity ?? null,
        machine: b.equipment ? [b.equipment.make, b.equipment.model].filter(Boolean).join(" ") || null : null,
        year: b.equipment?.year ?? null,
        mob: b.mobPrice,
        demob: b.demobPrice,
        total: priced ? cycleTotal({ ...req, endDate }, b, units, charged) : 0,
        /* Only when the room actually moved it. Equal values mean the price never changed, and
           "from 4,500 to 4,500" reads as a negotiation that happened and achieved nothing. */
        from: b.openingPrice != null && b.openingPrice !== b.price ? b.openingPrice : null,
        docs: (b.offeredUnitsDetail ?? []).flatMap((u) =>
          (u.documentKeys ?? []).map((d) => ({ type: d.type, expiry: d.expiryDate ?? null })),
        ),
      };
    });

    R[req.id] = {
      ref,
      machine: machineLabel(req),
      subtype,
      project: req.projectId ? input.projectNames[req.projectId] ?? "Unnamed project" : null,
      start: req.startDate ?? null,
      end: endDate ?? null,
      created: req.createdAt ?? null,
      deadline: req.expiresAt ?? null,
      urgency: req.urgency ?? null,
      status: req.status ?? null,
      city: req.city ?? null,
      days: priced ? charged.totalDays : null,
      fri: priced ? charged.fridays : null,
      billable: priced ? charged.chargedDays : null,
      priced,
      window,
      basis: req.rentalType ?? null,
      awarded: !!win,
      units: lead ? lead.unitsOffered || lead.numberOfUnits || req.item?.qty || 1 : req.item?.qty || 1,
      channel,
      sent: channel === CHANNEL.link ? share?.sent ?? 0 : null,
      opened:
        channel === CHANNEL.link ? share?.opened ?? 0
        : channel === CHANNEL.direct ? 1
        /* ⚠️ ZERO is not a reach of zero. The backend derives this from a batched `MatchEvent`
           count and its own changelog says it is 0 for any request older than match tracking
           (which began 2026-04-06). "0 suppliers were notified" and "nobody recorded who was
           notified" are different sentences, and only one of them is safe to print. */
        : req.suppliersNotified || null,
      reach:
        channel === CHANNEL.link ? "opened"
        : channel === CHANNEL.direct ? "direct"
        : req.suppliersNotified ? "notified" : null,
      held: input.heldByRequest[req.id] ?? 0,
      edited: !!req.renteeEditUsed,
      bids: boardBids,
      market: (subtype && marketBySubtype.get(subtype)) || null,
      terms: termsFor(req, lead),
      /* Null when nothing has been awarded: the column reads "not awarded yet" rather than naming
         whoever happens to be in front, which would be a decision nobody made. */
      winner: !win ? null : {
        name: win.supplierName,
        route: channel === CHANNEL.market ? "Marketplace bid" : channel === CHANNEL.link ? "Submitted through your shared link" : "Direct request, nobody else could bid",
        acct: onPlatform(win) ? "Yes" : "No",
        ver: win.verified ? "Yes" : "No",
        cr: win.supplierCrNumber || "None on file",
        vat: win.supplierVatNumber || "None on file",
        address: win.supplierNationalAddress || "None on file",
        reg: lookup(win)?.vendorRegistered ? "Yes" : "No",
      },
      money: win && priced ? moneyRows(win, winUnits, charged) : [],
      /* Zero, not the leading bid's value. Money awarded means money awarded. */
      total: win && priced ? sar(cycleTotal({ ...req, endDate }, win, winUnits, charged)) : "0",
    };

    for (const b of bids) {
      const name = b.supplierName;
      const reg = lookup(b);
      /* Written once per firm, from the first bid that carries it. A later bid from the same firm
         with a thinner projection must not erase a registration number an earlier one had. */
      if (!SUPMETA[name] || (SUPMETA[name].cr === "None on file" && (b.supplierCrNumber || reg?.crNumber))) {
        SUPMETA[name] = {
          src: onPlatform(b) ? "Moedatech" : "Off platform",
          ver: b.verified ? 1 : 0,
          cr: b.supplierCrNumber || reg?.crNumber || "None on file",
          vat: b.supplierVatNumber || "None on file",
          address: b.supplierNationalAddress || "None on file",
          city: b.supplierCity || "Not given",
          reg: reg?.vendorRegistered ? "Yes" : "No",
          groups: reg?.groups ?? [],
          rollup: reg?.rollup ?? null,
        };
      }
    }

    /* ── Papers ───────────────────────────────────────────────────────────────────────────────
       Built from the certificate CODES the bid carries, not only from documents that happen to
       hold an expiry date. The card used to read `offeredUnitsDetail[].documentKeys[].expiryDate`
       and nothing else, so an account whose papers are on file but undated drew an empty card —
       which reads as "this supplier has no certificates", the opposite of the truth.

       Three sources, in the order a reader cares about them:
         1. every certificate the REQUEST asked for, and whether the leading bid holds it;
         2. every certificate it holds that the request did not ask for;
         3. the expiry, where one is recorded, measured against the hire rather than against today.
       ⚠️ An off-platform shared-link bid carries no machine record, so it contributes no expiry
       dates at all. It can still answer 1 and 2, which is why those come first. */
    const expiryOf = new Map<string, string>();
    for (const unit of lead?.offeredUnitsDetail ?? []) {
      for (const doc of unit.documentKeys ?? []) {
        if (!doc.expiryDate) continue;
        /* The EARLIEST expiry across the units offered. A fleet is only covered until its first
           lapse, and reporting the latest would call a hire covered on the strength of one
           machine while another sits on site uncertified. */
        const prev = expiryOf.get(doc.type);
        if (!prev || doc.expiryDate < prev) expiryOf.set(doc.type, doc.expiryDate);
      }
    }

    const held = new Set<string>([
      ...(lead?.heldCertCodes ?? []),
      ...(lead?.companyCertCodes ?? []),
      ...(lead?.equipmentCertCodes ?? []),
    ]);
    const asked = new Set<string>(req.requiredCerts ?? []);
    const hire = req.startDate && req.endDate ? `${req.startDate} to ${req.endDate}` : null;

    for (const code of new Set([...asked, ...held, ...expiryOf.keys()])) {
      const has = held.has(code) || expiryOf.has(code);
      const expiry = expiryOf.get(code) ?? null;
      /* Measured against the HIRE, not against today. A certificate that lapses mid-hire is the
         finding; one that lapsed before a hire that already ended is history. */
      const expired = !!expiry && !!req.startDate && expiry < req.startDate;
      const want = asked.has(code);

      const state = !has ? "Not held" : expired ? "Expired" : expiry ? "Expiring" : "On file";
      const note =
        !has ? `Your request asked for ${code} and the leading bid does not hold it`
        : expired ? "This paper had already lapsed when the hire began, so the machine worked the whole window uncovered"
        : expiry ? "On file and in date. It is listed so the expiry is visible before the next hire is placed"
        : "On file, but the platform records no expiry date for it, so nothing here can say when it lapses";

      CERT[`${req.id}:${code}`] = {
        doc: code,
        supplier: lead?.supplierName ?? "nobody",
        state,
        machine: machineLabel(req),
        req: ref,
        expiry,
        hire,
        note,
        ...(want ? { required: 1 as const } : {}),
        ...(expired || !has ? { bad: 1 as const } : {}),
      };
    }

    /* Ownership papers are not certificates and carry no expiry, but "no registration document on
       file for the machine you are paying for" is the same kind of finding. */
    for (const doc of lead?.ownershipDocs ?? []) {
      CERT[`${req.id}:own:${doc.key}`] = {
        doc: doc.labelEn,
        supplier: lead?.supplierName ?? "nobody",
        state: "On file",
        machine: machineLabel(req),
        req: ref,
        expiry: null,
        hire,
        note: "An ownership or registration document for the machine offered. It carries no expiry",
      };
    }
  }

  /* Awards win whenever there is even one: a board with three awards and twenty live requests is
     reporting the three, and mixing a projection into them would make the total unreconcilable
     with the award table under it. */
  const basis = Object.values(R).some((r) => r.awarded) ? "awarded" : "leading";
  return { basis, R, SUPMETA, CERT, period: { from, to }, skipped };
}
