/**
 * Excluded operator nationalities (app parity, Moedatech-App release PR #548, 2026-10-09).
 *
 * `operatorNationality === "excluded"` means the operator must NOT hold any nationality in
 * `operatorNationalityCustom`, a comma-joined list of canonical English names. It is an exclusion
 * list, not an allow list: a legacy `"restricted"` meant the opposite ("must be one of"), and is left
 * as it was on every edit.
 *
 * Every rule here is the app's (`core/constants/term_options.dart`, `equipment_step.dart`) and the
 * backend's (`deal-room/term-matching.ts`), copied, not reinterpreted: the bid echoes the exact
 * string, so a web list that joins or orders differently is a list that no longer matches its bids.
 */

import { en } from "@/lib/i18n/en";
import { ar } from "@/lib/i18n/ar";

/** The stored mode for an exclusion list. */
export const EXCLUDED_NATIONALITY_MODE = "excluded";

/** Prefix of the resolved term value a bid declares and the deal room carries: `excluded:A,B`. */
export const EXCLUDED_NATIONALITY_PREFIX = "excluded:";

/** The `operator_nationality_custom` column's width. */
const CUSTOM_MAX = 100;

/** The list, in the app's order. Canonical English is what is stored. `Other` is never stored. */
export const NATIONALITY_OPTIONS = [
  "Egyptian",
  "Indian",
  "Pakistani",
  "Bangladeshi",
  "Filipino",
  "Sudanese",
  "Yemeni",
  "Syrian",
  "Jordanian",
  "Nepali",
] as const;

export const NATIONALITY_OTHER = "Other" as const;

/** Trimmed, empties dropped, de-duplicated case-insensitively, order kept. The backend's rule. */
export function parseExcludedNationalities(custom: string | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of (custom ?? "").split(",")) {
    const name = raw.trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push(name);
  }
  return out;
}

/** The list option a typed name matches, case-insensitively, or null. */
export function curatedNationality(name: string): string | null {
  const n = name.trim().toLowerCase();
  return NATIONALITY_OPTIONS.find((o) => o.toLowerCase() === n) ?? null;
}

/** What the picker shows for a stored item: ticked options, and the «Other» names as one text. */
export function hydrateExcluded(mode: string | null | undefined, custom: string | null | undefined): { picked: string[]; other: string } {
  if (mode !== EXCLUDED_NATIONALITY_MODE) return { picked: [], other: "" };
  const picked: string[] = [];
  const other: string[] = [];
  for (const name of parseExcludedNationalities(custom)) {
    const curated = curatedNationality(name);
    if (curated) picked.push(curated);
    else other.push(name);
  }
  return { picked, other: other.join(", ") };
}

/**
 * The list to save: picked options in list order, then the «Other» names, de-duplicated, and cut
 * from the END until the comma-joined value fits the 100-character column.
 */
export function composeExcluded(picked: readonly string[], otherText: string | null | undefined): string[] {
  const ordered = NATIONALITY_OPTIONS.filter((o) => picked.includes(o));
  const names = parseExcludedNationalities([...ordered, ...parseExcludedNationalities(otherText)].join(","));
  while (names.length && names.join(",").length > CUSTOM_MAX) names.pop();
  return names;
}

/**
 * The two columns to write.
 *
 * Something picked: `excluded` + the list. Nothing picked: an OLDER value (`any`, `restricted`,
 * `SAUDI`, `EXPAT`) is written back unchanged with its own text, so editing an old request does not
 * change what it asks; an emptied `excluded` list becomes null.
 */
export function saveExcluded(
  names: readonly string[],
  original: { mode: string | null | undefined; custom: string | null | undefined },
): { mode: string | null; custom: string | null } {
  if (names.length) return { mode: EXCLUDED_NATIONALITY_MODE, custom: names.join(",") };
  if (!original.mode || original.mode === EXCLUDED_NATIONALITY_MODE) return { mode: null, custom: null };
  return { mode: original.mode, custom: original.custom ?? null };
}

/** The excluded list a stored item carries, or empty for any other shape. */
export function excludedOfItem(mode: string | null | undefined, custom: string | null | undefined): string[] {
  return mode === EXCLUDED_NATIONALITY_MODE ? parseExcludedNationalities(custom) : [];
}

/** The list inside a resolved term value (`excluded:A,B`), or empty when the value is anything else. */
export function excludedOfTerm(value: string | null | undefined): string[] {
  const v = (value ?? "").trim();
  return v.toLowerCase().startsWith(EXCLUDED_NATIONALITY_PREFIX) ? parseExcludedNationalities(v.slice(EXCLUDED_NATIONALITY_PREFIX.length)) : [];
}

/** Names the dictionary can localize: the list, plus `Saudi`, which older requests may hold. */
export type NationalityNames = Record<(typeof NATIONALITY_OPTIONS)[number] | "Saudi" | "Other", string>;

/** A stored name in the reader's language when it is one we know; any other name as typed. */
export function nationalityLabel(name: string, names: NationalityNames): string {
  const key = (Object.keys(names) as (keyof NationalityNames)[]).find((k) => k.toLowerCase() === name.trim().toLowerCase());
  return key ? names[key] : name;
}

/**
 * A list as the reader says it, for surfaces that render outside a `useT` (the request-detail rows,
 * the deal room's paper): «Sudanese, Syrian» / «سوداني، سوري».
 */
export function excludedText(names: readonly string[], lang: "en" | "ar"): string {
  const d = lang === "ar" ? ar : en;
  return names.map((x) => nationalityLabel(x, d.nationality.names)).join(lang === "ar" ? "، " : ", ");
}

/** The same list as the deal room's «Not: …» line. */
export function excludedValueText(names: readonly string[], lang: "en" | "ar"): string {
  const d = lang === "ar" ? ar : en;
  return d.nationality.value.replace("{names}", excludedText(names, lang));
}

/** The field's own label, in either language, for the same surfaces. */
export function excludedLabel(lang: "en" | "ar"): string {
  return (lang === "ar" ? ar : en).nationality.label;
}
