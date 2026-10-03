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
  status: string | null;
  city: string | null;
  days: number;
  fri: number;
  billable: number;
  units: number;
  channel: string;
  /** Firms the link was sent to. Null on any route that is not a shared link. */
  sent: number | null;
  /** Firms that opened a shared link. Null on a marketplace request, where reach is not stored. */
  opened: number | null;
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
}

export interface BoardCert {
  doc: string;
  supplier: string;
  state: string;
  machine: string | null;
  req: string | null;
  expiry: string;
  hire: string | null;
  note: string;
  bad?: 1;
}

export interface BoardPayload {
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
      if (!b.price || b.price <= 0) continue;
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
    });
  }

  for (const req of input.requests) {
    const bids = input.bidsByRequest[req.id] ?? [];
    const win = bids.find(didWin) ?? null;
    const ref = req.groupRef || req.code || req.displayId;

    if (!win && !bids.length) {
      /* Name the statuses that WERE there. "No bid accepted yet" on every row of an account that
         plainly has awards means this test is reading the wrong field, and without the statuses
         beside it there is no way to tell that from a genuinely undecided account. */
      skipped.push({ ref, why: "no bids received" });
      continue;
    }

    /* With no award, the LEADING bid stands in for pricing the row: the cheapest that met every
       term, else simply the cheapest. It is never counted as money awarded — `awarded` stays false
       and every money figure skips it — but it is what lets the rate, the route and the supplier
       columns say something true about a request still out to the market. */
    const fit = bids.filter(metEveryTerm);
    const byPrice = (a: BidCard, b: BidCard) =>
      perDayRate(a.price ?? Infinity, a.priceUnit) - perDayRate(b.price ?? Infinity, b.priceUnit);
    const lead = win ?? [...(fit.length ? fit : bids)].sort(byPrice)[0];

    const charged = computeChargedDays({ startDate: req.startDate, endDate: req.endDate, rentalBasis: null });
    if (!charged.known) {
      skipped.push({ ref, why: "no start or end date, so it cannot be priced" });
      continue;
    }

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
        route: b.supplierId ? channel : CHANNEL.link,
        onPlatform: b.supplierId ? 1 : 0,
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
        total: cycleTotal(req, b, units, charged),
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
      end: req.endDate ?? null,
      created: req.createdAt ?? null,
      status: req.status ?? null,
      city: req.city ?? null,
      days: charged.totalDays,
      fri: charged.fridays,
      billable: charged.chargedDays,
      awarded: !!win,
      units: lead.unitsOffered || lead.numberOfUnits || req.item?.qty || 1,
      channel,
      sent: channel === CHANNEL.link ? share?.sent ?? 0 : null,
      opened: channel === CHANNEL.link ? share?.opened ?? 0 : channel === CHANNEL.direct ? 1 : null,
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
        acct: win.supplierId ? "Yes" : "No",
        ver: win.verified ? "Yes" : "No",
        cr: win.supplierCrNumber || "None on file",
        vat: win.supplierVatNumber || "None on file",
        address: win.supplierNationalAddress || "None on file",
        reg: lookup(win)?.vendorRegistered ? "Yes" : "No",
      },
      money: win ? moneyRows(win, winUnits, charged) : [],
      /* Zero, not the leading bid's value. Money awarded means money awarded. */
      total: win ? sar(cycleTotal(req, win, winUnits, charged)) : "0",
    };

    for (const b of bids) {
      const name = b.supplierName;
      const reg = lookup(b);
      /* Written once per firm, from the first bid that carries it. A later bid from the same firm
         with a thinner projection must not erase a registration number an earlier one had. */
      if (!SUPMETA[name] || (SUPMETA[name].cr === "None on file" && (b.supplierCrNumber || reg?.crNumber))) {
        SUPMETA[name] = {
          src: b.supplierId ? "Moedatech" : "Your list",
          ver: b.verified ? 1 : 0,
          cr: b.supplierCrNumber || reg?.crNumber || "None on file",
          vat: b.supplierVatNumber || "None on file",
          address: b.supplierNationalAddress || "None on file",
          city: b.supplierCity || "Not given",
          reg: reg?.vendorRegistered ? "Yes" : "No",
          groups: reg?.groups ?? [],
        };
      }
    }

    /* Papers come off the WINNING bid's offered units, because those are the papers the machine on
       site is actually working under: a certificate on a bid that lost covers nothing.
       ⚠️ `offeredUnitsDetail` is undefined on an off-platform shared-link bid, so a hire bought by
       link contributes no papers at all. That is a gap in what is stored, not an all-clear, and the
       blind-spots card has to keep saying so. */
    for (const unit of lead.offeredUnitsDetail ?? []) {
      for (const doc of unit.documentKeys ?? []) {
        if (!doc.expiryDate) continue;
        /* Measured against the HIRE, not against today. A certificate that lapses mid-hire is the
           finding; one that lapsed before a hire that already ended is history. */
        const expired = !!req.startDate && doc.expiryDate < req.startDate;
        CERT[`${req.id}:${unit.equipmentId}:${doc.type}`] = {
          doc: doc.type,
          supplier: lead.supplierName,
          state: expired ? "Expired" : "Expiring",
          machine: machineLabel(req),
          req: ref,
          expiry: doc.expiryDate,
          hire: req.startDate && req.endDate ? `${req.startDate} to ${req.endDate}` : null,
          note: expired
            ? "This paper had already lapsed when the hire began, so the machine worked the whole window uncovered"
            : "On file and in date. It is listed so the expiry is visible before the next hire is placed",
          ...(expired ? { bad: 1 as const } : {}),
        };
      }
    }
  }

  return { R, SUPMETA, CERT, period: { from, to }, skipped };
}
