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
}

export const EMPTY_AWARD_BOOK: AwardBook = { requests: {}, workOrderItems: {} };

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
  return { requests: read(src.requests), workOrderItems: read(src.workOrderItems) };
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
  /** Its own period, or `null` when it inherits the project's. */
  when: { startDate: string | null; endDate: string | null } | null;
  items: ChartItem[];
}

/* ----------------------------- Derivations ----------------------------- */

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
