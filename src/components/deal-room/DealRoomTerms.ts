/**
 * **What is left of the deal-room terms module: one formatter and one shape.**
 *
 * ~~`DealRoomTerms`~~ — a 278-line terms surface (progress meter, four groups, per-term cards with
 * accept / keep-mine / counter, and an inline counter editor typed by term kind) — is REMOVED. It was
 * never rendered: `DealRoom.tsx` imported only `valText` and `ResolutionsMap` from here, and its own
 * comment claimed step 1 of the counter flow "reuses `DealRoomTerms`" while that step hand-rolled a
 * quotation-paper table instead. Two components, one of them invisible, drifting apart.
 *
 * The one thing it had that the live surface did not was `ValueRows` — all three reference values
 * side by side. That is now on the live rows as a provenance line, from the `source` field the
 * backend was already sending, which answers the question the four rows only implied: which of them
 * is actually in force.
 *
 * Deleted rather than commented out. It is recoverable from git, and a commented-out component still
 * costs every reader of this directory the question "which of these two is the real one?" — the exact
 * question that let the stale comment stand.
 *
 * NO React and NO DOM below, deliberately: this file no longer renders anything.
 */

type LFn = (en: string, ar: string) => string;

/** A locally-collected resolution for one term (app parity: nothing is sent until Counter/Accept). */
import { partyToken } from "@/lib/contract/labels";

export type TermResolution = { action: "accept" | "counter"; value?: unknown };
export type ResolutionsMap = Record<string, TermResolution>;

/**
 * A term value as a renter reads it.
 *
 * The backend states responsibilities and booleans in its own vocabulary — `supplier`, `either`,
 * `not_included`, the string `"true"` — and several of them arrive in more than one spelling
 * depending on which side wrote the term. All of it collapses here so one value never prints two
 * ways on the same paper. An empty value is an em dash, never a blank cell: a term with no value is
 * a fact about the deal, and a blank reads as a rendering fault.
 */
export function valText(v: unknown, L: LFn): string {
  if (v == null || v === "") return "—";
  if (Array.isArray(v)) return v.length ? v.map((x) => String(x)).join(", ") : "—";
  if (typeof v === "boolean") return v ? L("Yes", "نعم") : L("No", "لا");
  // `partyToken` because the same 2026-09-02 change that prefixed the bid form's values did it
  // here too: `quotation.service.ts` and `term-matching.ts` now map SUPPLIER to "On Supplier".
  // The Arabic gained «على » the same way and is left as sent — it is already display text.
  const str = partyToken(String(v));
  if (str === "supplier") return L("Supplier", "المؤجّر");
  if (str === "rentee") return L("Rentee", "المستأجر");
  if (str === "either") return L("Either", "أيّهما");
  if (str === "shared") return L("Shared", "مشترك");
  if (str.toLowerCase() === "true" || str === "included" || str === "yes") return L("Yes", "نعم");
  if (str.toLowerCase() === "false" || str === "excluded" || str === "not_included" || str === "no") return L("No", "لا");
  return str;
}

