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

/** Document title for the printed quotation → the browser's default "Save as PDF" filename. */
export function quotationFileTitle(groupId: string): string {
  return `${QUOTATION_FILE_PREFIX}${groupId}`;
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
