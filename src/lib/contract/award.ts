/**
 * The AWARD — who supplies how many, arrived when, left when (PROJ, spec §8).
 *
 * **This is the row on the renter's chart**, not the item. Because a machine line can come from two
 * vendors: three excavators as two from Zahid and one from Al-Rajhi. Those two move independently —
 * they arrive on different days, carry different POs, and are mobilized separately — so each is its
 * own row, its own bar, its own marks and its own papers.
 *
 * An item nobody has awarded draws **one hatched row** saying *awaiting award*, with no marks and no
 * documents. That is not a rule anyone enforces: there is simply no award to hang them on, so
 * "award first" is structural rather than remembered.
 *
 * ── It is not the marketplace accept ─────────────────────────────────────────────────────────────
 *
 * *Award* also means **accept a bid** elsewhere in this product, and this deliberately is not that:
 * it reads nothing from the deal room, writes nothing to it, and may legitimately name a different
 * supplier from whoever won the bid. Inside a private tracking page there is nothing to confuse it
 * with, and *Award* is what procurement calls it.
 *
 * ── Where they live ──────────────────────────────────────────────────────────────────────────────
 *
 * On the PROJECT, in one `awards` blob, as a dictionary keyed by what is being supplied:
 *
 * ```
 *   { requests:       { <requestId>:       [award, …] },
 *     workOrderItems: { <workOrderItemId>: [award, …] } }
 * ```
 *
 * Keyed, not a flat list, and that is the whole design. A machine can be deleted — the work-order
 * form removes any machine left out of the payload — and its awards have to go with it. Keyed by
 * parent id that is one key deletion, which is small enough to be impossible to half-do. A flat
 * array would be a scan on every delete path, and a missed one leaves an award naming a machine that
 * no longer exists.
 *
 * Two consequences follow from holding them in a blob rather than a table, and both are handled
 * rather than avoided:
 *
 *  - **Nothing validates the shape**, so {@link isAward} guards every read of a payload.
 *  - **The whole blob is written at once**, so every write carries the `version` it read and a
 *    mismatch comes back 409. That covers two people on one site, and equally one person
 *    double-tapping Save.
 */

/** What a document attached to an award is. Ours-generated quotations are NOT one of these. */
export type AwardDocumentKind = "po" | "contract" | "quotation" | "other";

export interface AwardDocument {
  id: string;
  kind: AwardDocumentKind;
  filename: string;
  uploadedAt: string | null;
}

/** Which map an award sits in. A request and a machine are different things with different ids. */
export type AwardParentKind = "requests" | "workOrderItems";

export interface Award {
  /**
   * Minted on create and never reused. Not decoration: it is what a document is filed under and what
   * an edit or a delete addresses. An entry without one cannot carry papers.
   */
  id: string;

  /**
   * The supplier registry's row, once that feature answers.
   *
   * `supplierName` is written **either way** — even when the link exists. That is what makes the
   * dependency safe: a row renders from a name it already holds, so it survives the registry being
   * unavailable, a supplier later leaving the list, or a match never being confirmed.
   */
  supplierId: string | null;
  supplierName: string;

  /** The split. Without it, *2 from Zahid, 1 from Al-Rajhi* is two entries that cannot say how many. */
  units: number;
  rentalBasis: "daily" | "weekly" | "monthly" | null;
  /** Nullable — a renter who never recorded a price simply has none, which is not an error. */
  rateAmount: number | null;

  /**
   * What it costs to get the machine here, and away again — per unit, like the rate.
   *
   * Separate from `rateAmount` because they are separate negotiations, and because comparing two
   * suppliers on the rate alone compares the wrong number: the cheaper monthly rate often carries
   * the longer haul. A line comes to `(rate + mobilization + demobilization) × units`.
   *
   * `null` means nobody has quoted the haulage yet, which is not a haulage of zero.
   */
  mobilizationAmount: number | null;
  demobilizationAmount: number | null;

  /**
   * The two marks. **Dates, not flags.**
   *
   * A boolean would say it arrived; a date says *when*, which is the only thing that can be drawn —
   * the mark has to sit somewhere on the timeline — and the only thing worth comparing: agreed
   * 1 Sep, arrived 4 Sep, three days late, and you can see it. The boolean is free from the date
   * (`mobilizedAt != null`), which is the same reason the five states were removed.
   *
   * There is no `startDate` / `endDate` here: a bar comes from its request or work order, widened by
   * these two once they are set. The known cost is that a hire renegotiated past a closed request's
   * end shows the original end until the machine is demobilized.
   */
  mobilizedAt: string | null;
  demobilizedAt: string | null;

  documents: AwardDocument[];
  awardedAt: string | null;
}

/** The project's whole `awards` blob. Either map may be missing on a row written by an older deploy. */
export interface AwardBook {
  requests: Record<string, Award[]>;
  workOrderItems: Record<string, Award[]>;
  /**
   * The renter's own name for a row on the chart, keyed by request id.
   *
   * ⚠️ **Requests only.** A work order has `title` of its own, which belongs to the order and
   * follows it anywhere. A request has no title column at all, so its name is kept here — which
   * means it belongs to the FILING: unfile the request and the name goes with it. Ruled by the owner
   * on 2026-08-31, over adding a column to `equipment_requests` for a nickname that is only ever
   * read on the board it was typed on.
   */
  labels: Record<string, string>;
  /**
   * Arrived and left, per MACHINE rather than per award.
   *
   * A machine arriving on site is a fact about the machine; who supplies it is a different fact,
   * recorded at a different time and sometimes never. Marks therefore do not wait on an award
   * (owner, 2026-08-31: *"I don't want the user to follow a specific sequence"*).
   *
   * ⚠️ Does NOT replace `Award.mobilizedAt`, which is deliberate and finer (PROJ-AC-13): two units
   * from one vendor can arrive while a third from another has not. A row WITH awards is read from
   * its awards; a row without is read from here.
   */
  marks: Record<string, { mobilizedAt: string | null; demobilizedAt: string | null }>;
}

export const EMPTY_AWARD_BOOK: AwardBook = { requests: {}, workOrderItems: {}, labels: {}, marks: {} };

/* ----------------------------- Reading the blob ----------------------------- */

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * True when a value really is an award.
 *
 * A JSON column has no types, so this is the only thing standing between a malformed entry and a
 * chart that throws while a renter is looking at it. Anything failing it is dropped rather than
 * rendered half-drawn — a missing award is visible and reportable; a crashed page is neither.
 */
export function isAward(v: unknown): v is Award {
  if (!isRecord(v)) return false;
  return (
    typeof v.id === "string" &&
    v.id !== "" &&
    typeof v.supplierName === "string" &&
    v.supplierName.trim() !== "" &&
    typeof v.units === "number" &&
    v.units >= 1
  );
}

function mapAward(raw: Record<string, unknown>): Award {
  const docs = Array.isArray(raw.documents) ? raw.documents : [];
  return {
    id: String(raw.id),
    supplierId: typeof raw.supplierId === "string" ? raw.supplierId : null,
    supplierName: String(raw.supplierName),
    units: Number(raw.units),
    rentalBasis: (raw.rentalBasis as Award["rentalBasis"]) ?? null,
    rateAmount: typeof raw.rateAmount === "number" ? raw.rateAmount : null,
    // Absent reads as null, never 0 — "not quoted" and "free" are different answers.
    mobilizationAmount: typeof raw.mobilizationAmount === "number" ? raw.mobilizationAmount : null,
    demobilizationAmount: typeof raw.demobilizationAmount === "number" ? raw.demobilizationAmount : null,
    mobilizedAt: typeof raw.mobilizedAt === "string" ? raw.mobilizedAt : null,
    demobilizedAt: typeof raw.demobilizedAt === "string" ? raw.demobilizedAt : null,
    documents: docs.filter(isRecord).map((d) => ({
      id: String(d.id ?? ""),
      kind: (d.kind as AwardDocumentKind) ?? "other",
      filename: String(d.filename ?? ""),
      uploadedAt: typeof d.uploadedAt === "string" ? d.uploadedAt : null,
    })),
    awardedAt: typeof raw.awardedAt === "string" ? raw.awardedAt : null,
  };
}

/**
 * Backend blob → {@link AwardBook}. **Tolerant on purpose**: a missing map, a key holding something
 * that is not a list, or one bad entry among five must not stop the other four from drawing.
 */
export function mapAwardBook(raw: unknown): AwardBook {
  const src = isRecord(raw) ? raw : {};
  const read = (m: unknown): Record<string, Award[]> => {
    if (!isRecord(m)) return {};
    const out: Record<string, Award[]> = {};
    for (const [key, list] of Object.entries(m)) {
      if (!Array.isArray(list)) continue;
      const kept = list.filter(isAward).map((a) => mapAward(a as unknown as Record<string, unknown>));
      if (kept.length) out[key] = kept;
    }
    return out;
  };
  /* Names, read the same defensive way as the awards: anything that is not a non-empty string is
     dropped rather than rendered. A row whose name did not survive is called by its reference, which
     is what it was called before anyone renamed it. */
  const labels: Record<string, string> = {};
  if (isRecord(src.labels)) {
    for (const [rowId, name] of Object.entries(src.labels)) {
      if (typeof name === "string" && name.trim()) labels[rowId] = name.trim();
    }
  }

  /* Marks, read as defensively as the awards: a date that is not a string is dropped rather than
     rendered, and a row with neither date is simply absent. */
  const marks: AwardBook["marks"] = {};
  if (isRecord(src.marks)) {
    for (const [rowId, v] of Object.entries(src.marks)) {
      if (!isRecord(v)) continue;
      const mob = typeof v.mobilizedAt === "string" ? v.mobilizedAt : null;
      const demob = typeof v.demobilizedAt === "string" ? v.demobilizedAt : null;
      if (mob || demob) marks[rowId] = { mobilizedAt: mob, demobilizedAt: demob };
    }
  }

  return { requests: read(src.requests), workOrderItems: read(src.workOrderItems), labels, marks };
}

/** Every award under a project, in no particular order — the roll-up and the "×2 of 3" counts. */
export function allAwards(book: AwardBook): Award[] {
  return [...Object.values(book.requests), ...Object.values(book.workOrderItems)].flat();
}

/** What is filed under one request or one machine. Never undefined — an un-awarded item is `[]`. */
export function awardsFor(book: AwardBook, kind: AwardParentKind, parentId: string): Award[] {
  return book[kind][parentId] ?? [];
}

/* ----------------------------- The chart ----------------------------- */

/** One machine line, with however many awards are under it. */
export interface ChartItem {
  id: string;
  label: string;
  labelAr: string | null;
  quantity: number;
  /**
   * What was asked for on this machine, when the source stores it.
   *
   * Work orders do — the blob comes straight through. Requests keep the same answers in ten
   * separate columns under different names, so their rows carry nothing here yet and show no terms
   * line, which is the stated behaviour: show them when they are set, otherwise show nothing.
   */
  terms?: Record<string, unknown> | null;
  awards: Award[];
}

/** A work order or a request, and the machines under it. */
export interface ChartGroup {
  kind: "request" | "work_order";
  id: string;
  ref: string;
  title: string | null;
  /** Requests only — what the marketplace thinks, used for the edit rule and nothing else. */
  status?: string | null;
  bidCount?: number;
  renteeEditUsed?: boolean;
  /**
   * Its own period, or `null` when it inherits the project's.
   *
   * `rentalBasis` is what an AWARD on this row is priced against (owner, 2026-09-01) — the work
   * order's own footing, or the copy a request took at submit. Optional because the chart endpoint
   * is not guaranteed to send it on every row: the work-order feed does (`listWorkOrders` maps a
   * `when.rentalBasis` straight out of the payload), and where it is absent the award falls back to
   * the site's default rather than asking the renter to restate it.
   */
  when: {
    startDate: string | null;
    endDate: string | null;
    rentalBasis?: "daily" | "weekly" | "monthly" | null;
  } | null;
  items: ChartItem[];
}


/**
 * The few terms worth putting on a chart row.
 *
 * Certificates, operator and model year — the three a renter scans for when they look at a board
 * (owner, 2026-08-31). Not the whole block: thirteen values on one line is a paragraph, and the row
 * is there to be scanned rather than read.
 *
 * Only what is SET. An unanswered field contributes nothing rather than a dash, because a row of
 * dashes teaches the eye to skip the line that sometimes carries the answer.
 */
export function termsSummary(
  terms: Record<string, unknown> | null | undefined,
  label: (code: string) => string,
  words: { operator: string; noOperator: string; year: string },
): string[] {
  if (!terms) return [];
  const out: string[] = [];

  const certs = terms.safety;
  if (Array.isArray(certs) && certs.length) out.push(certs.map((c) => label(String(c))).join(" + "));

  // Both answers are worth saying: "no operator" is a decision, not a blank.
  if (terms.operator === "yes") out.push(words.operator);
  else if (terms.operator === "no") out.push(words.noOperator);

  const year = terms.year;
  if (typeof year === "string" && year.trim()) out.push(`${words.year} ${year.trim()}`);

  return out;
}

/* ----------------------------- Derivations ----------------------------- */

/**
 * The window one award's bar is drawn across.
 *
 * **An award has no period of its own.** It records who supplies how many, and the two marks. The
 * bar is its parent's PLANNED period — the request's or the work order's, or the site's where that
 * group inherits — and nothing else moves it.
 *
 * ── The marks do NOT widen it ────────────────────────────────────────────────────────────────────
 *
 * ~~Widened to meet a mark falling outside it, so a bar never contradicts a pin beside it.~~
 * Reversed by the owner on 2026-08-31: *"for mebo and demo doesnt change strat or end date of the
 * work order or the request or the project so they are different dates in the chart"*.
 *
 * He is right, and the old behaviour was quietly destructive of meaning. Marking a machine as
 * arrived on the 31st moved a bar that starts on the 1st, and the bar then PRINTED «2026-08-31 →
 * 2026-12-31» — so a renter reading the chart saw the work order's period as a date nobody had
 * agreed. What was planned and what happened are two different facts, and the bar is the first one.
 *
 * They are still both visible, and now legibly so: the bar is the plan, the two diamonds are the
 * events, and a diamond outside the bar is exactly the picture a renter needs — *it came early*, *it
 * is still standing there*. `chartDates` keeps every mark in the axis span, so a pin outside the bar
 * still has room on the timeline rather than being clipped at its edge.
 */
export function awardWindow(
  group: Pick<ChartGroup, "when">,
  _award: Pick<Award, "mobilizedAt" | "demobilizedAt">,
  projectWindow: { startDate: string | null; endDate: string | null },
): { start: string | null; end: string | null } {
  /* `_award` is kept in the signature deliberately. Every caller has the award in hand, and a
     parameter list that stops asking for it is a parameter list somebody re-adds the widening to. */
  return {
    start: group.when?.startDate ?? projectWindow.startDate,
    end: group.when?.endDate ?? projectWindow.endDate,
  };
}

/** Units already promised for an item — the guard, and the "×2 of 3" label. */
export function awardedUnits(item: Pick<ChartItem, "awards">): number {
  return item.awards.reduce((n, a) => n + (a.units || 0), 0);
}

/** True when an item has no award — it draws one hatched row and nothing else. */
export function isUnawarded(item: Pick<ChartItem, "awards">): boolean {
  return item.awards.length === 0;
}

/**
 * Every date the chart has to be able to draw: the own-period of any group that carries one —
 * including groups nobody has awarded yet, whose ghost bar still has to fit on the axis — **and**
 * every mark, since a machine that arrived late or is still standing there after the period ended
 * has to stay on the axis rather than being clipped off its edge.
 */
export function chartDates(groups: ChartGroup[]): string[] {
  const out: string[] = [];
  for (const g of groups) {
    if (g.when?.startDate) out.push(g.when.startDate);
    if (g.when?.endDate) out.push(g.when.endDate);
    for (const item of g.items) {
      for (const a of item.awards) {
        if (a.mobilizedAt) out.push(a.mobilizedAt);
        if (a.demobilizedAt) out.push(a.demobilizedAt);
      }
    }
  }
  return out;
}

/**
 * The axis: the project's own window, widened to hold everything under it. Returns `null` when there
 * is nothing to draw at all — an Unassigned row has no project, so no inherited dates and no bar.
 */
export function chartSpan(
  groups: ChartGroup[],
  projectWindow: { startDate: string | null; endDate: string | null },
): { from: string; to: string } | null {
  const dates = chartDates(groups).concat(
    [projectWindow.startDate, projectWindow.endDate].filter((d): d is string => !!d),
  );
  if (!dates.length) return null;
  return { from: dates.reduce((a, b) => (a < b ? a : b)), to: dates.reduce((a, b) => (a > b ? a : b)) };
}

/**
 * What storage will accept — the backend's own closed list, by extension.
 *
 * It used to offer Word and Excel too. Those were refused on the way out with a bare validation
 * error, so the renter picked a file, waited, and was told nothing useful. A format that cannot be
 * stored should not be offered, and the file picker is the place to say so.
 *
 * Keyed by extension rather than by the browser's `file.type` because that string is empty often
 * enough to matter — a PDF dragged from some mail clients arrives with no type at all.
 */
const ACCEPTED: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

/** The content type storage will be told, or `null` when this file cannot be stored at all. */
export function contentTypeFor(filename: string): string | null {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return ACCEPTED[ext] ?? null;
}
