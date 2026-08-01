/**
 * THE EXPORT-TEMPLATES BOUNDARY — mock only.
 *
 * Lets the whole template UI be walked locally with **no database and no S3**: the picker, the
 * upload + naming modal, the review screen, resolutions and the pre-flight panel. Activated
 * only when `useRealApp` is false (i.e. `AGENTS_API_URL` / `AGENTS_API_TOKEN` are unset), the
 * same gate `/api/requests` and `/api/taxonomy` already use.
 *
 * What is REAL in mock mode: the mapping. The route still calls Mansour at `MANSOUR_URL`, so the
 * review screen shows genuine candidates, confidences, reasoning and derivation chains — which is
 * the part actually worth looking at.
 *
 * What is FAKE: storage (an in-memory Map, wiped on restart) and the uploaded file. The mapper is
 * given one of the built-in sample layouts below rather than the bytes you picked, because
 * parsing .xlsx needs exceljs and that belongs in the backend, not in this app. To map YOUR OWN
 * spreadsheet, run the backend script — it parses the real file.
 *
 * Nothing here runs when the agents backend is configured.
 */

export type MockStatus = "mapping" | "needs_review" | "ready" | "failed";

interface MockTemplate {
  id: string;
  name: string;
  status: MockStatus;
  originalFileName: string;
  createdByUserId: number;
  createdAt: string;
  updatedAt: string;
  spec?: Record<string, unknown>;
  mappingError?: string | null;
}

/** Module-level so it survives across requests in `next dev`; wiped on restart. */
const store = new Map<string, MockTemplate>();

/* ─────────────────────────── the sample layouts the mapper sees ──────────────────────── */

interface Cell {
  ref: string;
  value: string;
  numFmt?: string;
  bold?: boolean;
}

const money = "#,##0.00";

/** An EMPTY company sheet — labels, headers and number formats, no data. The common upload. */
const EMPTY_LAYOUT: Cell[] = [
  { ref: "A1", value: "COMPARISON OF QUOTATIONS", bold: true },
  { ref: "A2", value: "Project" },
  { ref: "A3", value: "Request No." },
  { ref: "A4", value: "Date" },
  { ref: "A6", value: "Description" },
  { ref: "B6", value: "Vendor 1", bold: true },
  { ref: "C6", value: "Vendor 2", bold: true },
  { ref: "D6", value: "Vendor 3", bold: true },
  { ref: "A7", value: "Vendor Name" },
  { ref: "A8", value: "CR No." },
  { ref: "A9", value: "Rate/day (excl. VAT)", numFmt: money },
  { ref: "A10", value: "Mob/Demob", numFmt: money },
  { ref: "A11", value: "Total (incl. VAT)", numFmt: money },
  { ref: "A12", value: "Delivery period" },
  { ref: "A13", value: "Payment terms" },
  { ref: "A14", value: "Remarks" },
  { ref: "A16", value: "Recommended vendor" },
  { ref: "A17", value: "Prepared by" },
];

/** The same sheet already filled with ANOTHER request's vendors — the leak-risk case. */
const PREFILLED_LAYOUT: Cell[] = [
  ...EMPTY_LAYOUT,
  { ref: "B7", value: "PREVIOUS Vendor A" },
  { ref: "C7", value: "PREVIOUS Vendor B" },
  { ref: "D7", value: "PREVIOUS Vendor C" },
  { ref: "B9", value: "8111", numFmt: money },
  { ref: "C9", value: "8222", numFmt: money },
  { ref: "D9", value: "8333", numFmt: money },
  { ref: "B11", value: "91111", numFmt: money },
  { ref: "C11", value: "92222", numFmt: money },
  { ref: "D11", value: "93333", numFmt: money },
];

/**
 * Pick a layout from the file name so both shapes can be exercised: name the file with
 * "filled" or "sample" to get the pre-filled one, anything else gets the empty one.
 */
export function mockDumpFor(fileName: string) {
  const filled = /filled|sample|prev/i.test(fileName);
  const cells = filled ? PREFILLED_LAYOUT : EMPTY_LAYOUT;
  return {
    dump: {
      sheetName: "Comparison",
      usedRange: "A1:D17",
      rowCount: 17,
      colCount: 4,
      cells,
      merges: ["A1:D1"],
    },
    sheetNames: ["Comparison"],
  };
}

/* ───────────────────────── the vocabulary the mapper is given ────────────────────────── */

/**
 * A representative SUBSET of the real field catalogue, which lives in the backend and normally
 * arrives in its create response. Enough to get a genuine mapping and a populated review screen
 * without this app holding a second copy of the whole thing — deliberately partial, so nobody
 * mistakes it for the source of truth.
 */
export const MOCK_VOCABULARY = [
  { key: "requestDisplayId", scope: "header", type: "string", unit: null, label: "Request no.", expected: true, note: null },
  { key: "itemName", scope: "header", type: "string", unit: null, label: "Equipment", expected: true, note: null },
  { key: "location", scope: "header", type: "string", unit: null, label: "Location", expected: true, note: null },
  { key: "exportDate", scope: "header", type: "date", unit: null, label: "Date", expected: true, note: null },
  { key: "durationDays", scope: "header", type: "number", unit: "days", label: "Duration", expected: true, note: null },
  { key: "units", scope: "header", type: "number", unit: "count", label: "Units", expected: true, note: null },
  { key: "rankingSource", scope: "header", type: "string", unit: null, label: "Ranked by", expected: true, note: null },
  { key: "recommendedSupplierName", scope: "header", type: "string", unit: null, label: "Recommended quote", expected: true,
    note: "A CLAIM. Only available when a live agent recommendation exists — never the top-ranked bid." },
  { key: "renterCompanyName", scope: "header", type: "string", unit: null, label: "Company", expected: false, note: null },
  { key: "preparedByName", scope: "header", type: "string", unit: null, label: "Prepared by", expected: false, note: null },

  { key: "supplierName", scope: "supplier", type: "string", unit: null, label: "Supplier", expected: true, note: null },
  { key: "rank", scope: "supplier", type: "number", unit: "count", label: "Rank", expected: true, note: null },
  { key: "grandTotalInclVat", scope: "supplier", type: "money", unit: "SAR", label: "Total (incl. VAT & your costs)", expected: true, note: null },
  { key: "rentalRate", scope: "supplier", type: "money", unit: "SAR", label: "Rental rate", expected: true,
    note: "Per-unit rate as quoted, for the period in rateUnit — NOT a total." },
  { key: "rateUnit", scope: "supplier", type: "string", unit: null, label: "Rate period", expected: false, note: null },
  { key: "rentalTotal", scope: "supplier", type: "money", unit: "SAR", label: "Rental cost", expected: true, note: null },
  { key: "mobDemobTotal", scope: "supplier", type: "money", unit: "SAR", label: "Mobilization + demob", expected: true, note: null },
  { key: "costResponsibilities", scope: "supplier", type: "list", unit: null, label: "Who handles the costs", expected: true, note: null },
  { key: "equipmentYear", scope: "supplier", type: "number", unit: "year", label: "Year", expected: true, note: null },
  { key: "distanceKm", scope: "supplier", type: "number", unit: "km", label: "Distance to site", expected: true, note: null },
  { key: "verified", scope: "supplier", type: "bool", unit: null, label: "Verified supplier", expected: true, note: null },
  { key: "operatorCertDeclared", scope: "supplier", type: "string", unit: null, label: "Operator certificate", expected: true, note: null },
  { key: "companyDocs", scope: "supplier", type: "list", unit: null, label: "Company documents", expected: true, note: null },
  { key: "equipmentCerts", scope: "supplier", type: "list", unit: null, label: "Equipment certificates", expected: true, note: null },
  { key: "ownershipDocs", scope: "supplier", type: "list", unit: null, label: "Ownership documents", expected: true, note: null },
  { key: "supplierCrNumber", scope: "supplier", type: "string", unit: null, label: "CR no.", expected: false, note: null },
  { key: "supplierVatNumber", scope: "supplier", type: "string", unit: null, label: "VAT no.", expected: false, note: null },
  { key: "bidValidityPeriod", scope: "supplier", type: "string", unit: null, label: "Quote validity", expected: false, note: null },
  { key: "bidNotes", scope: "supplier", type: "string", unit: null, label: "Notes", expected: false, note: null },
];

/** Mirrors the backend's closed derivation set. */
export const MOCK_DERIVATIONS = [
  "identity", "vat.exclude", "vat.include", "vat.amount",
  "rate.perHour", "rate.perDay", "rate.perWeek", "rate.perMonth",
  "multiply.units", "multiply.duration", "bool.yesNo", "list.join", "enum.side", "blank",
];

/* ──────────────────────────────────── the store ─────────────────────────────────────── */

export function mockList(userId: number) {
  const templates = [...store.values()]
    .filter((t) => t.createdByUserId === userId)
    // The stored spec is deliberately not returned in the list — the picker only needs the
    // summary, and the review screen fetches the full view by id.
    .map((t) => ({
      id: t.id,
      name: t.name,
      status: t.status,
      originalFileName: t.originalFileName,
      createdByUserId: t.createdByUserId,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { templates, scope: "personal" as const, mock: true };
}

export function mockCreate(userId: number, name: string, originalFileName: string): MockTemplate {
  const now = new Date().toISOString();
  const row: MockTemplate = {
    id: `mock-${Math.random().toString(36).slice(2, 10)}`,
    name,
    status: "mapping",
    originalFileName,
    createdByUserId: userId,
    createdAt: now,
    updatedAt: now,
  };
  store.set(row.id, row);
  return row;
}

export function mockGetRow(id: string): MockTemplate | undefined {
  return store.get(id);
}

export function mockSetSpec(id: string, spec: Record<string, unknown> | null, error?: string) {
  const row = store.get(id);
  if (!row) return;
  row.spec = spec ?? undefined;
  row.status = spec ? "needs_review" : "failed";
  row.mappingError = error ?? null;
  row.updatedAt = new Date().toISOString();
}

export function mockDelete(id: string) {
  store.delete(id);
}

/** Same shape the real backend returns for the review screen. */
export function mockReconciliation(id: string) {
  const row = store.get(id);
  if (!row) return null;
  const spec = (row.spec ?? null) as {
    sheet?: string;
    supplierBlock?: { sampleCount?: number };
    theirsUnfilled?: Array<Record<string, unknown>>;
    oursNoHome?: Array<Record<string, unknown>>;
  } | null;

  const theirsUnfilled = (spec?.theirsUnfilled ?? []).map((u) => ({
    cell: String(u.cell ?? ""),
    theirLabel: String(u.theirLabel ?? ""),
    candidate: (u.candidate as string | null) ?? null,
    // The real backend expands this from the catalogue; the key is close enough to read.
    candidateLabel: (u.candidate as string | null) ?? null,
    // Carried through so accepting applies the chain the mapper worked out, matching the
    // real reconciliation payload rather than silently defaulting to identity.
    candidateDerivations: (u.candidateDerivations as string[] | null) ?? null,
    confidence: Number(u.confidence ?? 0),
    why: String(u.why ?? ""),
    resolved: u.resolution != null,
  }));
  const oursNoHome = (spec?.oursNoHome ?? []).map((n) => ({
    field: String(n.field ?? ""),
    label: String(n.field ?? ""),
    candidateCell: (n.candidateCell as string | null) ?? null,
    resolved: n.resolution != null,
  }));

  return {
    templateId: row.id,
    name: row.name,
    status: row.status,
    sheet: spec?.sheet,
    supplierCapacity: spec?.supplierBlock?.sampleCount,
    theirsUnfilled,
    oursNoHome,
    unresolvedCount:
      theirsUnfilled.filter((u) => !u.resolved).length + oursNoHome.filter((n) => !n.resolved).length,
    mappingError: row.mappingError ?? null,
    mock: true,
  };
}

/** Apply resolutions onto the stored spec, exactly as the backend would. */
export function mockResolve(
  id: string,
  body: {
    theirsUnfilled?: Record<string, unknown>;
    oursNoHome?: Record<string, unknown>;
    name?: string;
  }
) {
  const row = store.get(id);
  if (!row?.spec) return null;
  const spec = row.spec as {
    theirsUnfilled?: Array<Record<string, unknown>>;
    oursNoHome?: Array<Record<string, unknown>>;
  };

  for (const [cell, resolution] of Object.entries(body.theirsUnfilled ?? {})) {
    const entry = spec.theirsUnfilled?.find((u) => u.cell === cell);
    if (entry) entry.resolution = resolution;
  }
  for (const [field, resolution] of Object.entries(body.oursNoHome ?? {})) {
    const entry = spec.oursNoHome?.find((n) => n.field === field);
    if (entry) entry.resolution = resolution;
  }
  if (body.name?.trim()) row.name = body.name.trim();

  row.status = "ready";
  row.updatedAt = new Date().toISOString();
  return mockReconciliation(id);
}

/* ────────────────────────────── the annotated sheet view ────────────────────────────── */

const A1 = /^([A-Za-z]+)(\d+)$/;

function parseRef(ref: string): { r: number; c: number } | null {
  const m = A1.exec(ref.trim());
  if (!m) return null;
  let c = 0;
  for (const ch of m[1].toUpperCase()) c = c * 26 + (ch.charCodeAt(0) - 64);
  return { r: parseInt(m[2], 10), c };
}

function colName(index: number): string {
  let n = index;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out || "A";
}

/**
 * The dev-mode twin of the backend's `getSheetView`.
 *
 * Deliberately mirrors the same resolution order — supplier offsets walked from the anchor on
 * the stride, then unfilled flags overriding mappings — because a mock that annotates cells
 * differently from the real thing would make the grid look right locally and wrong in staging,
 * which is worse than having no mock at all.
 */
export function mockSheetView(id: string) {
  const row = store.get(id);
  if (!row) return null;

  const { dump } = mockDumpFor(row.originalFileName ?? "");
  const spec = (row.spec ?? null) as {
    sheet?: string;
    header?: Array<{ cell: string; field: string; derivations?: string[] }>;
    supplierBlock?: {
      anchor: string;
      axis: string;
      stride: number;
      sampleCount: number;
      fields?: Array<{ offset: { r: number; c: number }; field: string; derivations?: string[] }>;
    };
    theirsUnfilled?: Array<Record<string, unknown>>;
  } | null;

  const annotation = new Map<string, Record<string, unknown>>();

  for (const h of spec?.header ?? []) {
    annotation.set(h.cell, {
      kind: "filled",
      field: h.field,
      fieldLabel: MOCK_VOCABULARY.find((v) => v.key === h.field)?.label ?? h.field,
      derivations: h.derivations ?? ["identity"],
    });
  }

  const block = spec?.supplierBlock;
  const anchor = block ? parseRef(block.anchor) : null;
  if (block && anchor) {
    for (let i = 0; i < (block.sampleCount ?? 0); i++) {
      const step = i * (block.stride || 1);
      for (const f of block.fields ?? []) {
        const at =
          block.axis === "column"
            ? { r: anchor.r + f.offset.r, c: anchor.c + f.offset.c + step }
            : { r: anchor.r + f.offset.r + step, c: anchor.c + f.offset.c };
        annotation.set(`${colName(at.c)}${at.r}`, {
          kind: "filled",
          field: f.field,
          fieldLabel: MOCK_VOCABULARY.find((v) => v.key === f.field)?.label ?? f.field,
          derivations: f.derivations ?? ["identity"],
          supplierIndex: i,
        });
      }
    }
  }

  // Unfilled beats filled on a contested cell — showing it settled would hide the question.
  for (const u of spec?.theirsUnfilled ?? []) {
    annotation.set(String(u.cell), {
      kind: "unfilled",
      unfilled: {
        theirLabel: String(u.theirLabel ?? ""),
        candidate: (u.candidate as string | null) ?? null,
        candidateLabel:
          MOCK_VOCABULARY.find((v) => v.key === u.candidate)?.label ??
          ((u.candidate as string | null) ?? null),
        candidateDerivations: (u.candidateDerivations as string[] | null) ?? null,
        confidence: Number(u.confidence ?? 0),
        why: String(u.why ?? ""),
        resolved: u.resolution != null,
      },
    });
  }

  const cells: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  for (const cell of dump.cells as Array<{ ref: string; value: string; bold?: boolean }>) {
    const at = parseRef(cell.ref);
    if (!at) continue;
    seen.add(cell.ref);
    const ann = annotation.get(cell.ref);
    cells.push({ ref: cell.ref, r: at.r, c: at.c, value: cell.value, bold: cell.bold, kind: "label", ...(ann ?? {}) });
  }
  // Blank write targets have no dump entry, and they are the cells the review is most about.
  for (const [ref, ann] of annotation) {
    if (seen.has(ref)) continue;
    const at = parseRef(ref);
    if (!at) continue;
    cells.push({ ref, r: at.r, c: at.c, value: "", kind: "label", ...ann });
  }
  cells.sort((a, b) =>
    (a.r as number) === (b.r as number)
      ? (a.c as number) - (b.c as number)
      : (a.r as number) - (b.r as number)
  );

  return {
    sheet: spec?.sheet ?? dump.sheetName,
    rowCount: Math.max(dump.rowCount, ...cells.map((c) => c.r as number), 1),
    colCount: Math.max(dump.colCount, ...cells.map((c) => c.c as number), 1),
    cells,
    // Carried through like the real view: exceljs repeats a merge's value in every cell it
    // covers, so a mock without them would render duplicates the real backend does not.
    merges: (dump as { merges?: string[] }).merges ?? [],
    ...(block ? { supplierBlock: { anchor: block.anchor, axis: block.axis, stride: block.stride, sampleCount: block.sampleCount } } : {}),
    mock: true,
  };
}
