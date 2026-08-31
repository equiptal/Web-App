/**
 * The PROJECT — a renter's site, stated once (web-app/007, PROJ).
 *
 * A renter running a real job re-types the same terms on every request: Qiddiya Zone 4, September to
 * December, monthly, 10 hours a day, 30-day payment. Only the machine changes. A project holds that
 * once and prefills it, so the next request is one line of typing.
 *
 * **It holds six fields and nothing else** (spec §5.1) — where · title · rental basis · start · end ·
 * extendable · payment terms — and the rule that decides membership is narrow on purpose: *the
 * project holds only what the create flow actually asks the renter for, AND only what is true of the
 * place rather than of one hire.* A field the backend receives but nobody is ever shown is a silent
 * default, and a project setting for a question that is never put is a setting for nothing. That
 * rule is what keeps four fields out:
 *
 *  - `workingDaysPerWeek` — sent as part of the payload, but there is NO control for it anywhere in
 *    `/create`. It is seeded to 6 (`defaultProjectDetails`) and shipped silently.
 *  - `overtimeRate` — a real control today, being removed from every renter surface (spec §5.4).
 *  - `terrain` — `RequestRecord.terrainType` exists and the edit modal offers it, but the create
 *    payload never carries it, so a project default would have nothing to fill.
 *  - `hoursPerDay` — **removed 2026-08-30.** It reads like a site fact and is not one: a crane on
 *    night shift and a generator running around the clock are the same site in the same week. It
 *    stays in the request's *More details*, beside the overtime rate it belongs with.
 *
 * Everything else a renter might expect to find here — budget, payment method, maintenance, SLA,
 * supplier filters, the bid window — belongs to the REQUEST. Those are decisions about one machine
 * or one shopping trip; a project is a fact about a place.
 *
 * **Nothing is derived and stored.** `estimatedDurationDays` and `urgency` are computed from the
 * dates at submit (`computeDurationDays` / `computeUrgency` in `app-adapters.ts`), so a copy here
 * would be a second source of truth that goes stale the moment a date moves. Likewise there is no
 * `status`: a project is *ended* when the last date under it has passed, which {@link projectEnded}
 * computes and nobody sets.
 */

import type { TimingHours } from "./draft";
import type { PaymentTerm } from "./options";
import { type AwardBook, mapAwardBook } from "./award";

/* ----------------------------- The project ----------------------------- */

/**
 * Where the site is. The label is shown everywhere; the pin is what the map picker sets.
 *
 * Named `SiteLocation`, not `ProjectLocation`: `draft.ts` already owns that name for a REQUEST's
 * location, which is a different thing — it carries `confirmed`, a `source` and a text/file
 * conflict, because a request's location is something the agent extracted and the renter has to
 * approve. A project's is simply where the site is.
 */
export interface SiteLocation {
  label: string;
  lat: number | null;
  lng: number | null;
}

/**
 * The seven fields, assembled from the pieces the draft already defines rather than retyped —
 * {@link TimingHours} is exactly the five "when" values a project holds, so it is reused whole. A
 * parallel shape here would drift from `draft.ts` the first time a field moves.
 */
export interface ProjectDefaults {
  /**
   * Four of the five `TimingHours` values. `hoursPerDay` is omitted rather than left unset, so the
   * type itself says a project does not answer that question — see the note at the top of this file.
   * Still derived from `TimingHours` so the other four cannot drift from `draft.ts`.
   */
  timing: Omit<TimingHours, "hoursPerDay">;
  /** AC-36's payment term — the one commercial term a company applies to every machine on every
   *  site, because it comes from their finance department rather than from the equipment. */
  paymentTerms: PaymentTerm | null;
}

export interface Project {
  id: string;
  /** The renter's own name for it. `null` falls back to the location's short name (see
   *  {@link projectTitle}) and is shown marked as a default. */
  title: string | null;
  location: SiteLocation;
  defaults: ProjectDefaults;
  /**
   * Bumped on every edit of `defaults` or `location`, **and on every award write**.
   *
   * It is not a stamp — a request copies the site's values at submit, so it already records what it
   * was posted under, in full. This is the optimistic-concurrency check: {@link Project.awards} is
   * one blob written whole, so a write carries the version it read and a mismatch comes back 409
   * rather than quietly overwriting somebody else's award.
   */
  version: number;

  /**
   * Who supplies what on this site — see `award.ts`. Held here, keyed by request id and machine id,
   * rather than in a table of its own: the tracking layer is the project's, and a keyed dictionary
   * makes removing a deleted machine's awards a single key deletion.
   */
  awards: AwardBook;
  /** Displayed ("created by Ahmed"), never a permission check — every member of the company can
   *  create, edit, award and delete. */
  ownerUserId: string | null;
  ownerName: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

/**
 * A project plus the counts the rail and the meta bar show. **Computed by the backend**, never here:
 * the alternative is that opening the page with five projects fetches every request of every project
 * and adds them up in the browser — slow, and wrong the moment one of those fetches fails.
 *
 * `firstStart` / `lastEnd` are derived from everything filed under the project — the own-period of
 * every work order and request, including un-awarded ones, widened by any mobilized or demobilized
 * mark falling outside it. A work order running past the site's own end has to be inside that range
 * or the chart clips its bar off the right edge.
 */
export interface ProjectSummary extends Project {
  requestCount: number;
  workOrderCount: number;
  unitsAwarded: number;
  firstStart: string | null;
  lastEnd: string | null;
}

/* ----------------------------- Defaults ----------------------------- */

/** A blank project. Dates stay null — a site with no dates yet is honest; inventing them is not. */
export function defaultProjectDefaults(): ProjectDefaults {
  return {
    // No hoursPerDay: it is a per-hire question, asked in the request's *More details*.
    timing: { rentalBasis: null, extendable: false, startDate: null, endDate: null },
    paymentTerms: null,
  };
}

/* ----------------------------- Naming ----------------------------- */

/**
 * The shortest thing that still says WHERE: the first (most specific) segment of the address, with
 * any postcode stripped. "Qiddiya Zone 4, Qiddiya City, Riyadh 13513" → "Qiddiya Zone 4".
 */
export function shortSite(address: string | null | undefined): string {
  const first = String(address ?? "").split(",")[0].trim();
  return first.replace(/\s*\d{4,}\s*/g, " ").trim() || String(address ?? "").trim();
}

/** The renter's own title if they set one, else the location's short name. Never empty. */
export function projectTitle(p: Pick<Project, "title" | "location">): string {
  return (p.title ?? "").trim() || shortSite(p.location.label);
}

/** True when the title shown is our fallback rather than the renter's own — the UI marks it. */
export function titleIsDerived(p: Pick<Project, "title">): boolean {
  return !(p.title ?? "").trim();
}

/* ----------------------------- Ended ----------------------------- */

/**
 * A project is ENDED when the last date under it has passed. **Derived, never stored** — which is
 * why there is no archive: a site that stops being used stops being used, and asking a renter to
 * tell us so is asking them to do our arithmetic.
 *
 * Falls back to the project's own end date while nothing is filed under it yet. A project with no
 * end date at all is never ended — an open-ended site is running until someone says otherwise.
 *
 * Ended projects sort last and carry a tag. They are **not hidden**: a date passing is not proof a
 * site is finished, and a renter who extended the hire verbally would lose their chip with no
 * explanation. Recency does the hiding instead — a site you stop using stops being picked.
 */
export function projectEnded(p: Pick<ProjectSummary, "lastEnd" | "defaults">, today: string): boolean {
  const last = p.lastEnd ?? p.defaults.timing.endDate;
  return !!last && last < today;
}

/** Live sites first, ended ones after. Stable within each half — the caller sorts by recency first. */
export function endedLast<T extends Pick<ProjectSummary, "lastEnd" | "defaults">>(list: T[], today: string): T[] {
  return list
    .map((p, i) => ({ p, i, ended: projectEnded(p, today) }))
    .sort((a, b) => Number(a.ended) - Number(b.ended) || a.i - b.i)
    .map((x) => x.p);
}

/* ----------------------------- Adapters ----------------------------- */

const num = (v: unknown): number | null => (typeof v === "number" && !Number.isNaN(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

/**
 * Backend row → {@link Project}. Tolerant by design: a project whose `defaults` blob is missing a
 * key must still render, because the blob's shape moves with `draft.ts` and a project written by an
 * older deploy is not corrupt — it is just older.
 */
export function mapProject(raw: Record<string, unknown>): Project {
  // The wire's `defaults` is FLAT — rentalBasis · extendable · startDate · endDate · paymentTerms —
  // and its basis is the request enum (`MONTHLY`), because a site default that cannot be expressed
  // as a request would be a default nothing can use. `timing` is this app's own grouping and never
  // crosses the wire; `.strict()` on the backend rejects it outright, which is a 422 and not a
  // dropped field, so the two shapes cannot quietly drift.
  const d = (raw.defaults ?? {}) as Record<string, unknown>;
  const t = d;
  return {
    id: String(raw.id ?? ""),
    title: str(raw.title),
    location: {
      label: str(raw.locationLabel) ?? str(raw.location_label) ?? "",
      lat: num(raw.locationLat) ?? num(raw.location_lat),
      lng: num(raw.locationLng) ?? num(raw.location_lng),
    },
    defaults: {
      timing: {
        rentalBasis: basisFromWire(str(t.rentalBasis)),
        extendable: t.extendable === true,
        startDate: str(t.startDate),
        endDate: str(t.endDate),
      },
      paymentTerms: (str(d.paymentTerms) as PaymentTerm | null) ?? null,
    },
    version: num(raw.version) ?? 1,
    awards: mapAwardBook(raw.awards),
    ownerUserId: str(raw.ownerUserId) ?? (num(raw.ownerUserId) != null ? String(raw.ownerUserId) : null),
    ownerName: str(raw.ownerName),
    createdAt: str(raw.createdAt),
    updatedAt: str(raw.updatedAt),
  };
}

export function mapProjectSummary(raw: Record<string, unknown>): ProjectSummary {
  return {
    ...mapProject(raw),
    requestCount: num(raw.requestCount) ?? 0,
    workOrderCount: num(raw.workOrderCount) ?? 0,
    unitsAwarded: num(raw.unitsAwarded) ?? 0,
    firstStart: str(raw.firstStart),
    lastEnd: str(raw.lastEnd),
  };
}

/** {@link Project} → the create/update body. Only the seven fields ever leave here. */
export function projectToPayload(p: Pick<Project, "title" | "location" | "defaults">): Record<string, unknown> {
  return {
    title: (p.title ?? "").trim() || null,
    location: { label: p.location.label, lat: p.location.lat, lng: p.location.lng },
    // Flat, and only the keys that have a value: the backend's schema is `.strict()`, so an extra
    // key is a 422 rather than a silently ignored field, and a null where it wants a string is the
    // same. Omitting is how "not set" is expressed on this wire.
    defaults: prune({
      rentalBasis: basisToWire(p.defaults.timing.rentalBasis),
      extendable: p.defaults.timing.extendable,
      startDate: p.defaults.timing.startDate,
      endDate: p.defaults.timing.endDate,
      paymentTerms: p.defaults.paymentTerms,
    }),
  };
}

/** Drop every key whose value is null or empty — see the note in {@link projectToPayload}. */
function prune(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === null || v === undefined || v === "") continue;
    out[k] = v;
  }
  return out;
}

/**
 * This app's basis (`monthly`) ↔ the wire's (`MONTHLY`).
 *
 * The wire uses the `RentalType` enum `equipment_requests` already stores, deliberately: a site
 * default that could not be expressed as a request would be a default nothing can use.
 */
const BASIS_TO_WIRE: Record<string, string> = { daily: "DAILY", weekly: "WEEKLY", monthly: "MONTHLY" };

export function basisToWire(b: string | null | undefined): string | null {
  return b ? (BASIS_TO_WIRE[b] ?? null) : null;
}

export function basisFromWire(b: string | null | undefined): TimingHours["rentalBasis"] {
  if (!b) return null;
  const hit = Object.entries(BASIS_TO_WIRE).find(([, wire]) => wire === b.toUpperCase());
  // An enum this app has no control for — PER_JOB, LONG_TERM — reads as unset rather than as a
  // value no dropdown can show.
  return (hit?.[0] as TimingHours["rentalBasis"]) ?? null;
}


/* ----------------------------- Propagating an edit ----------------------------- */

/**
 * What one filed row can do with a project edit, and whether it starts ticked.
 *
 * **Nothing propagates on its own.** A request copied the site's values at submit and never reads
 * its project again, so editing Qiddiya in November cannot reach an RFQ posted in September. The
 * only way across is this list, and only for rows the renter explicitly ticks.
 */
export type PropagationState =
  /** No bids yet. Edit freely, as often as you like. */
  | "free"
  /** Bids have landed. Editing spends the ONE post-bid edit the rules allow. */
  | "costs_the_edit"
  /** That one edit is already spent. The row cannot take the change at all. */
  | "edit_used"
  /** Closed or cancelled. Nothing reaches it. */
  | "closed"
  /** A work order goes to nobody, so it is always editable and costs nothing. */
  | "work_order";

export interface PropagationRow {
  id: string;
  kind: "request" | "work_order";
  /** RFQ-1042, or the work order's title. */
  ref: string;
  state: PropagationState;
  /** Can the renter tick it at all? */
  eligible: boolean;
  /**
   * Ticked when the dialog opens.
   *
   * **Only the free ones and the work orders.** A pre-ticked request that has bids spends the
   * renter's single post-bid edit on a change they came here to make to the SITE — and they would
   * find out afterwards, on a row they were not looking at. Making them tick it themselves is the
   * whole protection.
   */
  preTicked: boolean;
}

/** Classify one marketplace request, from the same rule the drawer's Edit button uses. */
export function propagationForRequest(req: {
  id: string;
  ref: string;
  status: string;
  bidCount: number;
  renteeEditUsed: boolean;
}): PropagationRow {
  const live = req.status === "OPEN" || req.status === "ACTIVE";
  const hasBids = req.bidCount > 0;

  const state: PropagationState = !live
    ? "closed"
    : !hasBids
      ? "free"
      : req.renteeEditUsed
        ? "edit_used"
        : "costs_the_edit";

  return {
    id: req.id,
    kind: "request",
    ref: req.ref,
    state,
    eligible: state === "free" || state === "costs_the_edit",
    preTicked: state === "free",
  };
}

/** A work order. Always editable, never pre-ticked away from the renter's attention. */

/* ─────────────────────────── What disagrees with the site ─────────────────────────── */

/**
 * A row whose own dates differ from what the site is about to say.
 *
 * Editing a project is editing the PROJECT (owner, 2026-08-31). Nothing under it is mentioned, and
 * nothing is ticked, because in the ordinary case there is nothing to decide: a work order with no
 * period of its own already follows the site, and a request whose dates match it is not in
 * disagreement with anything. Listing all of them anyway asked the renter to review a decision they
 * did not have.
 *
 * What does need a decision is a row that will now say something different from its own site. That
 * is what this finds, and it is the only thing the renter is asked about.
 */
export interface SiteConflict {
  id: string;
  kind: "request" | "work_order";
  ref: string;
  /** What the row says today. */
  startDate: string | null;
  endDate: string | null;
  /** Can it be changed at all? A closed request, or one whose single post-bid edit is spent, cannot. */
  editable: boolean;
  /** Why not — shown instead of a choice, so the renter learns rather than being refused. */
  reason: PropagationState;
}

/**
 * Two periods, compared only on the fields a site actually states.
 *
 * Exported because the chart's *own dates* chip has to ask the same question. It used to ask a
 * different one — *does this row carry a period at all* — and a request ALWAYS does: the backend
 * copies one onto it at submit and says so in `getChart`. So every request on every site wore the
 * warning, and opening it showed a comparison table with no rows in it (owner, 2026-08-31: *"I
 * created a project from this request directly, so how do they differ in location? impossible"*).
 */
export function periodDiffers(
  own: { startDate: string | null; endDate: string | null } | null,
  site: { startDate: string | null; endDate: string | null },
): boolean {
  // No period of its own means it follows the site, and cannot disagree with it.
  if (!own) return false;
  return (own.startDate ?? null) !== (site.startDate ?? null) || (own.endDate ?? null) !== (site.endDate ?? null);
}

/**
 * Everything under this site that would now read differently from it.
 *
 * `groups` come from the chart, which already answers the one question that matters: a work order's
 * `when` is `null` when it inherits, and a request's is always its own copy.
 */
export function siteConflicts(
  groups: {
    id: string;
    kind: "request" | "work_order";
    ref: string;
    title?: string | null;
    status?: string | null;
    bidCount?: number | null;
    renteeEditUsed?: boolean | null;
    when: { startDate: string | null; endDate: string | null } | null;
  }[],
  site: { startDate: string | null; endDate: string | null },
): SiteConflict[] {
  return groups
    .filter((g) => periodDiffers(g.when, site))
    .map((g) => {
      const row =
        g.kind === "request"
          ? propagationForRequest({
              id: g.id,
              ref: g.ref,
              status: g.status ?? "OPEN",
              bidCount: g.bidCount ?? 0,
              renteeEditUsed: g.renteeEditUsed ?? false,
            })
          : propagationForWorkOrder({ id: g.id, ref: g.title?.trim() || g.ref });

      return {
        id: g.id,
        kind: g.kind,
        ref: row.ref,
        startDate: g.when?.startDate ?? null,
        endDate: g.when?.endDate ?? null,
        editable: row.eligible,
        reason: row.state,
      };
    });
}

export function propagationForWorkOrder(wo: { id: string; ref: string }): PropagationRow {
  return { id: wo.id, kind: "work_order", ref: wo.ref, state: "work_order", eligible: true, preTicked: true };
}
