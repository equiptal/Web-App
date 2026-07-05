/**
 * web-app/multi-item-requests — quotation identity for the Compare-bids tab.
 *
 * We generate the quotation PDF ourselves, so instead of reading/extracting an uploaded file we
 * STAMP it with the submission group's id (in the filename + visibly on the PDF) and recognise that
 * id on re-upload — then pull the real bids we already have. No OCR/AI, 100% accurate.
 *
 * The token IS the `requestGroupId` (a UUID). The download names the file
 * `moedatech-quotation-<groupId>.pdf`; the Compare tab reads the group id straight back from the
 * filename (or a pasted comparison code).
 */

export const QUOTATION_FILE_PREFIX = "moedatech-quotation-";
/** Separates the group id from the list of request codes the quotation actually covers. */
const ITEMS_MARKER = "__items__";

/**
 * Document title for the printed quotation → the browser's default "Save as PDF" filename.
 * Optionally stamps the request codes (e.g. REQ-00132) the quotation covers, so on re-upload the
 * Compare tab can show ONLY those equipment items — not every item in the group.
 */
export function quotationFileTitle(groupId: string, reqCodes: string[] = []): string {
  const base = `${QUOTATION_FILE_PREFIX}${groupId}`;
  const codes = [...new Set(reqCodes)].map((c) => String(c).replace(/[^A-Za-z0-9-]/g, "")).filter(Boolean);
  return codes.length ? `${base}${ITEMS_MARKER}${codes.join("__")}` : base;
}

/**
 * Human-readable download filename / print `<title>` for a quotation: the request GROUP short code
 * (`RFQ-NNNNN`) when the quotation covers a group, else the single request id (`REQ-NNNNN`). Covered
 * item codes are still stamped via ITEMS_MARKER so a re-upload can scope the comparison.
 *
 * NOTE: unlike `quotationFileTitle`, this does NOT embed the group UUID — so `groupIdFromFileName`
 * cannot recover a group id from it. The Compare re-upload path should recognise the short code
 * (`RFQ-`/`REQ-`) or the renter pastes it; auto-recognition by UUID only applies to legacy files.
 */
export function quotationDownloadName(primaryCode: string | null | undefined, reqCodes: string[] = []): string {
  const clean = (s: string) => String(s ?? "").replace(/[^A-Za-z0-9-]/g, "");
  const base = clean(primaryCode ?? "") || "quotation";
  const codes = [...new Set(reqCodes)].map(clean).filter(Boolean).filter((c) => c !== base);
  return codes.length ? `${base}${ITEMS_MARKER}${codes.join("__")}` : base;
}

/** The request codes a quotation filename was stamped with (empty when none / renamed away). */
export function itemCodesFromFileName(fileName: string): string[] {
  const base = fileName.replace(/\.pdf$/i, "");
  const i = base.indexOf(ITEMS_MARKER);
  if (i === -1) return [];
  return base.slice(i + ITEMS_MARKER.length).split("__").map((c) => c.trim()).filter(Boolean);
}

/** A UUID (the requestGroupId) — used to validate a pasted/extracted comparison code. */
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Pull the group id back out of an uploaded quotation's filename (tolerates browser pre/suffixing). */
export function groupIdFromFileName(fileName: string): string | null {
  const base = fileName.replace(/\.pdf$/i, "");
  // Prefer a UUID anywhere in the name — robust against " (1)" suffixes and partial renames.
  const uuid = base.match(UUID_RE)?.[0];
  if (uuid) return uuid;
  // Fallback: our prefix with a non-UUID id.
  const i = base.indexOf(QUOTATION_FILE_PREFIX);
  if (i !== -1) {
    const rest = base.slice(i + QUOTATION_FILE_PREFIX.length).trim();
    if (rest) return rest;
  }
  return null;
}

/** Validate/normalise a manually pasted comparison code. */
export function normalizeComparisonCode(input: string): string | null {
  const v = input.trim();
  if (!v) return null;
  return v.match(UUID_RE)?.[0] ?? (groupIdFromFileName(v) || v);
}
