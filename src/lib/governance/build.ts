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
 * ── What it deliberately does not do ────────────────────────────────────────────────────────────
 *
 * It never infers a missing fact. A request whose reach is not stored comes back with `reached:
 * null`, not a zero and not a guess — the board prints "not stored" and says so again in the
 * blind-spots card. Collapsing absent into zero is how a request nobody saw and a request everybody
 * ignored end up looking identical.
 */
import type { RequestListItem } from "@/lib/contract/requests";
import type { BidCard } from "@/lib/contract/bids";
import { computeChargedDays } from "@/lib/contract/charged-days";
import { computeCycleTotals } from "@/lib/contract/cycle-totals";

/** One machine type's going rate, from the marketplace listings for that subtype. */
export interface MarketBand {
  med: number;
  /** How many live listings the median was taken over. Below a handful it is an anecdote. */
  n: number;
  lo: number;
  hi: number;
}

export interface GovernanceInput {
  requests: RequestListItem[];
  /** Marketplace bids and link submissions already merged, keyed by request id. */
  bidsByRequest: Record<string, BidCard[]>;
  /** Link shares per request: how many firms it was sent to and how many opened it. */
  sharesByRequest: Record<string, { sent: number; opened: number } | undefined>;
  /** Larger machines the size filter held back, per request, from the bid list's `sizeCounts`. */
  heldByRequest: Record<string, number | undefined>;
  /** Market band per taxonomy subtype id. A subtype with no listings is simply absent. */
  marketBySubtype: Record<string, MarketBand | undefined>;
  /** Project names, so a row can say the site rather than a cuid. */
  projectNames: Record<string, string | undefined>;
  /** Supplier company ids the renter has registered on his own list. */
  registeredSupplierIds: Set<string>;
}

/** A bid as the board reads it: firm, price, when it arrived, did it meet every term, did it win. */
export type BoardBid = [string, number, string, 0 | 1, 0 | 1];

export interface BoardRequest {
  ref: string;
  machine: string;
  project: string | null;
  days: number;
  fri: number;
  billable: number;
  units: number;
  channel: string;
  /** Firms that opened a shared link. Null on a marketplace request, where reach is not stored. */
  opened: number | null;
  held: number;
  bids: BoardBid[];
  market: MarketBand | null;
  terms: Array<[string, string, 0 | 1]>;
  winner: { name: string; route: string; acct: string; ver: string; cr: string; reg: string } | null;
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
  reg: string;
}

export interface BoardCert {
  doc: string;
  firm: string;
  state: string;
  machine: string | null;
  req: string | null;
  expiry: string;
  hire: string | null;
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

/**
 * A firm, not a person. Two colleagues of one company are one counterparty, which is how the
 * backend scopes bids and how the deal room seats them, so a supplier table that split them would
 * show one supplier as two and halve both their win rates.
 */
const firmKey = (b: BidCard) => b.supplierCompanyId || b.supplierId || b.supplierName;

/** A bid won if the deal room accepted it, or the renter reported it as the winner in a survey. */
const didWin = (b: BidCard) => b.status === "ACCEPTED" || b.wonViaSurvey === true;

/**
 * Whole bids, never a share of terms. `conflictCount` is the backend's own count of the request's
 * requirements this bid fails, so a near miss on a certificate is a miss — the same rule the
 * comparison applies, rather than a second opinion about compliance living on this page.
 */
const metEveryTerm = (b: BidCard): 0 | 1 => (b.conflictCount === 0 ? 1 : 0);

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
  return out;
}

/**
 * The money, through the same calculation the quotation prices with.
 *
 * Not `rate × days`: that ignores the rental basis, the Fridays nobody bills, and the mobilization
 * legs, and it is wrong by a different amount on every request. `computeCycleTotals` is the one
 * place those rules live, and this page is not allowed a second copy of them.
 */
function moneyFor(r: RequestListItem, win: BidCard, charged: ReturnType<typeof computeChargedDays>) {
  const units = win.unitsOffered || win.numberOfUnits || r.item?.qty || 1;
  const totals = computeCycleTotals({
    rate: win.price,
    priceUnit: win.priceUnit,
    units,
    days: charged.chargedDays,
    mob: { amount: win.mobPrice, excluded: win.mobExcluded, units: win.mobUnits },
    demob: { amount: win.demobPrice, excluded: win.demobExcluded, units: win.demobUnits },
  } as Parameters<typeof computeCycleTotals>[0]);

  const total = totals.duration?.rental != null ? totals.duration.rental + (totals.duration.oneOff ?? 0) : (win.price ?? 0) * units * charged.chargedDays;

  const rows: Array<[string, string]> = [
    ["Rate per day", sar(win.price ?? 0)],
    ["Units", `×${units}`],
    ["Calendar days", String(charged.totalDays)],
    ["Fridays, not billed", `−${charged.fridays}`],
    ["Billable days", String(charged.chargedDays)],
  ];
  if (win.mobPrice) rows.push(["Mobilization", sar(win.mobPrice)]);
  if (win.demobPrice) rows.push(["Demobilization", sar(win.demobPrice)]);
  return { rows, total };
}

export function buildGovernance(input: GovernanceInput): BoardPayload {
  const R: Record<string, BoardRequest> = {};
  const SUPMETA: Record<string, BoardSupplier> = {};
  const CERT: Record<string, BoardCert> = {};
  const skipped: BoardPayload["skipped"] = [];
  let from: string | null = null;
  let to: string | null = null;

  for (const req of input.requests) {
    const bids = input.bidsByRequest[req.id] ?? [];
    const win = bids.find(didWin) ?? null;
    const ref = req.groupRef || req.code || req.displayId;

    /* A request nobody has awarded has no money, no winner and no decision to check. It belongs on
       a request list, not on a page about awards, so it is named in `skipped` rather than drawn as
       an empty row that reads like a finding. */
    if (!win) {
      skipped.push({ ref, why: bids.length ? "no bid accepted yet" : "no bids received" });
      continue;
    }

    const charged = computeChargedDays({ startDate: req.startDate, endDate: req.endDate, rentalBasis: null });
    if (!charged.known) {
      skipped.push({ ref, why: "no start or end date, so it cannot be priced" });
      continue;
    }

    const share = input.sharesByRequest[req.id];
    const channel = channelOf(req, !!share?.sent);
    const money = moneyFor(req, win, charged);
    const subtype = req.item?.categoryId ?? null;

    if (req.createdAt && (!from || req.createdAt < from)) from = req.createdAt;
    if (req.createdAt && (!to || req.createdAt > to)) to = req.createdAt;

    R[req.id] = {
      ref,
      machine: machineLabel(req),
      project: req.projectId ? input.projectNames[req.projectId] ?? "Unnamed project" : null,
      days: charged.totalDays,
      fri: charged.fridays,
      billable: charged.chargedDays,
      units: win.unitsOffered || win.numberOfUnits || req.item?.qty || 1,
      channel,
      opened: channel === CHANNEL.link ? share?.opened ?? 0 : channel === CHANNEL.direct ? 1 : null,
      held: input.heldByRequest[req.id] ?? 0,
      bids: bids.map<BoardBid>((b) => [b.supplierName, b.price ?? 0, b.submittedAt ?? "", metEveryTerm(b), didWin(b) ? 1 : 0]),
      market: (subtype && input.marketBySubtype[subtype]) || null,
      terms: termsFor(req, win),
      winner: {
        name: win.supplierName,
        route: channel === CHANNEL.market ? "Marketplace bid" : channel === CHANNEL.link ? "Submitted through your shared link" : "Direct request, nobody else could bid",
        acct: win.supplierId ? "Yes" : "No",
        ver: win.verified ? "Yes" : "No",
        cr: win.supplierCrNumber || "None on file",
        reg: win.supplierCompanyId && input.registeredSupplierIds.has(win.supplierCompanyId) ? "Yes" : "No",
      },
      money: money.rows,
      total: sar(money.total),
    };

    for (const b of bids) {
      const name = b.supplierName;
      /* Written once per firm, from the first bid that carries it. A later bid from the same firm
         with a thinner projection must not erase a registration number an earlier one had. */
      if (!SUPMETA[name] || (SUPMETA[name].cr === "None on file" && b.supplierCrNumber)) {
        SUPMETA[name] = {
          src: b.supplierId ? "Moedatech" : "Your list",
          ver: b.verified ? 1 : 0,
          cr: b.supplierCrNumber || "None on file",
          reg: b.supplierCompanyId && input.registeredSupplierIds.has(b.supplierCompanyId) ? "Yes" : "No",
        };
      }
      void firmKey(b);
    }

    /* Papers come off the WINNING bid's offered units, because those are the papers the machine on
       site is actually working under: a certificate on a bid that lost covers nothing.
       ⚠️ `offeredUnitsDetail` is undefined on an off-platform shared-link bid, so a hire bought by
       link contributes no papers at all. That is a gap in what is stored, not an all-clear, and the
       blind-spots card has to keep saying so. */
    for (const unit of win.offeredUnitsDetail ?? []) {
      for (const doc of unit.documentKeys ?? []) {
        if (!doc.expiryDate) continue;
        /* Measured against the HIRE, not against today. A certificate that lapses mid-hire is the
           finding; one that lapsed before a hire that already ended is history. */
        const expired = !!req.startDate && doc.expiryDate < req.startDate;
        CERT[`${req.id}:${unit.equipmentId}:${doc.type}`] = {
          doc: doc.type,
          firm: win.supplierName,
          state: expired ? "Expired" : "Expiring",
          machine: machineLabel(req),
          req: ref,
          expiry: doc.expiryDate,
          hire: req.startDate && req.endDate ? `${req.startDate} to ${req.endDate}` : null,
          ...(expired ? { bad: 1 as const } : {}),
        };
      }
    }
  }

  return { R, SUPMETA, CERT, period: { from, to }, skipped };
}
