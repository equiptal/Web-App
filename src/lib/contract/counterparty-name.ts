/**
 * **The ONE rule for naming a counterparty**, client-side.
 *
 * Mirrors the backend's `apps/backend/src/utils/identity-select.ts`
 * (`resolveCompanyBrandName` / `resolveCounterpartyDisplayName`), which is the AUTHORITY, and the
 * app's own port of it (`core/utils/counterparty_name.dart`, 2026-09-21). Every surface that names a
 * firm or a person — supplier or renter — goes through this file, so the web cannot drift from the
 * server, from the app, or from itself.
 *
 * **The order, and why each level exists:**
 *
 *  1. `companies.legalName` — the REGISTERED name, from the verification submission and the CR the
 *     classifier read. The main name by product decision: a firm is named the way its registration
 *     names it.
 *  2. `supplierProfile.companyLegalName` — the same fact on the older path, for someone who
 *     submitted before a `Company` row existed.
 *  3. `companies.name` — the trade name typed on the verification form. A SAFETY NET, not a
 *     preference: `legalName` is nullable and every firm approved before OCR carries only this,
 *     and without it those firms would fall through to a personal name.
 *  4. `supplierProfile.companyName` — typed on the BASIC profile. This is the one an unverified
 *     user has.
 *  5. the person's own name.
 *
 * 🔴 **NO VERIFICATION GATE** (product decision, 2026-09-21). The web's old rule had one — a firm's
 * name counted only `while the firm is actually verified and alive` — so a company name typed on the
 * basic profile was stored and never shown, and that user read by their PERSONAL name everywhere
 * until ops approved them. An unverified firm is now named; the thing that says whether anyone
 * CHECKED that name is the verified tick, which is computed separately and is untouched here.
 *
 * ⚠️ So a company name on any surface is now the user's CLAIM, not the platform's. Nothing in this
 * file asserts it was vetted; only the badge beside it does.
 *
 * 🔴 **The web's old order was also INVERTED**: it read the basic profile's `companyName` FIRST and
 * the company's own name second, and it never read either `legalName` column at all. So a verified
 * firm whose CR reads «Al Faisal Heavy Equipment Est.» showed as «Al Faisal» here and by its
 * registered name in the app — one counterparty, two names, depending which client you opened.
 *
 * **NO React, NO DOM, NO i18n.** Both roles and a dozen surfaces read this.
 */

const clean = (v: unknown): string | null => {
  const t = typeof v === "string" ? v.trim() : "";
  return t === "" ? null : t;
};

/** The four name columns, however a given payload spells them. */
export interface CompanyNameParts {
  /** `companies.legalName` */
  companyLegalName?: unknown;
  /** `supplierProfile.companyLegalName` */
  profileLegalName?: unknown;
  /** `companies.name` */
  companyName?: unknown;
  /** `supplierProfile.companyName` */
  profileCompanyName?: unknown;
}

/**
 * The firm's name, or null when none of the four columns holds one.
 *
 * Pass whichever levels the caller actually has — a payload that carries only a flattened
 * `companyName` (the deal room folds the resolved brand into that slot server-side) passes that
 * alone and gets the same answer.
 */
export function companyBrandName(p: CompanyNameParts): string | null {
  return clean(p.companyLegalName)
    ?? clean(p.profileLegalName)
    ?? clean(p.companyName)
    ?? clean(p.profileCompanyName);
}

/**
 * The name to show for a counterparty: the firm when there is one, else the person.
 *
 * Returns `""` when nothing at all is known, which every caller already treats as "draw the
 * placeholder" — deliberately NOT a hardcoded «Supplier», which is a word in one language on a
 * surface that has two.
 */
export function counterpartyDisplayName(p: CompanyNameParts & { personName?: unknown }): string {
  return companyBrandName(p) ?? clean(p.personName) ?? "";
}

/** Pull the four columns off a raw user/supplier object, tolerating the shapes the wire uses. */
export function companyNamePartsOf(raw: Record<string, unknown> | null | undefined): CompanyNameParts {
  const o = (v: unknown): Record<string, unknown> =>
    v != null && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const u = o(raw);
  const company = o(u.company);
  /* The profile's four spellings, and then the OBJECT ITSELF.
     ⚠️ **The object itself is a profile source and must stay one.** Several projections flatten the
     profile onto the supplier — `supplier: { id, companyName }` with no nested profile at all — and
     reading only the nested shapes renames every one of those to «Supplier». Nested first, flat
     last, which is the precedence the code this replaced already had.
     ⚠️ Only the two COMPANY-NAME keys are taken from it. `u.name` is deliberately not read: on a
     supplier object that is the person, and folding it in here would let a personal name outrank a
     firm's registration. */
  const profile = { ...o(u.profile), ...o(u.supplier_profile), ...o(u.supplierProfile) };
  const flat = (...keys: string[]): unknown => {
    for (const src of [profile, u]) for (const k of keys) if (src[k] != null && src[k] !== "") return src[k];
    return null;
  };
  return {
    companyLegalName: company.legalName ?? company.legal_name,
    profileLegalName: flat("companyLegalName", "company_legal_name"),
    companyName: company.name,
    profileCompanyName: flat("companyName", "company_name"),
  };
}
