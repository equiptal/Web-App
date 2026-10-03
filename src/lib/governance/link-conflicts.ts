/**
 * What an off-platform bid actually failed, read off the supplier's own Yes/No answers.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────────────────────────
 *
 * `submissionToBidCard` returns `conflictCount: 0` for every shared-link submission. That is
 * correct for the surfaces it was written for — the comparison matrix and My Bids show the
 * confirmations themselves, one row per term, so a count would be a second rendering of the same
 * thing. The governance board is the one surface that counts rather than lists, and a hard zero
 * there means **every off-platform bid is recorded as having met every term**, which flatters the
 * "bids meeting every term" figure and the cheapest-compliant count wherever a link bid is in the
 * field.
 *
 * Owner, 2026-10-03: *"check the yes-no answers on each submission to find"*. They are right there
 * on the item: `requiredTerms` is what the renter asked for, `confirmations` is what the supplier
 * answered, and a term asked-for-and-not-confirmed is a miss.
 *
 * ── Why here and not in the mapper ──────────────────────────────────────────────────────────────
 *
 * `submissionToBidCard` is shared with the comparison and My Bids. Changing its `conflictCount`
 * would change what those two draw, and neither asked for it. This derives the same fact beside
 * it, for the one caller that needs it.
 *
 * ── The rule ────────────────────────────────────────────────────────────────────────────────────
 *
 * A term counts only when the renter ASKED for it: `requiredTerms[key]` present and non-empty. An
 * unanswered term the renter never asked about is not a miss, and counting it would mark every
 * supplier non-compliant against a bar nobody set.
 *
 * A certificate term may list several codes ("TUV, SASO"). The form then carries a per-code
 * answer, `equipmentCert::TUV`, so a supplier can confirm one and not the other, and the plain
 * aggregate is true only when every code is Yes. One unconfirmed code is one miss, named by code,
 * because "failed the certificate term" does not tell a reader which certificate is missing.
 */
import type { LinkBidItem } from "@/lib/contract/link-bids";
import { certCodesFromValue, certConfKey, prettyCert } from "@/lib/contract/link-bids";

/** The renter-facing name of each term the bid form asks about. */
const TERM_LABEL: Record<string, string> = {
  operator: "Operator included",
  nationality: "Operator nationality",
  nightShift: "Night shift",
  fatFood: "Operator food",
  fatTransport: "Operator transport and accommodation",
  fuel: "Fuel",
  fuelType: "Fuel type",
  year: "Minimum year",
  operatorCert: "Operator certificate",
  equipmentCert: "Equipment certificate",
  payment: "Payment terms",
  overtime: "Overtime rate",
  breakdownSla: "Breakdown response",
  maintenance: "Maintenance",
};

/** The two terms that can carry several codes, each answered on its own. */
const CERT_TERMS = ["equipmentCert", "operatorCert"] as const;

export interface LinkTermVerdict {
  /** The terms the renter asked for and the supplier did not confirm, by name. */
  missed: string[];
  /** The terms he asked for and the supplier did confirm. */
  met: string[];
}

/**
 * Judge one submitted item against what the request asked of it.
 *
 * Returns empty lists when the submission carries no `requiredTerms` at all — an older payload,
 * or a request with no stated terms. ⚠️ That is NOT the same as "met everything", and the caller
 * has to keep the two apart: a bid judged against nothing is unjudged, and recording it as
 * compliant is the bug this file exists to fix, one level up.
 */
export function linkTermVerdict(item: LinkBidItem | null | undefined): LinkTermVerdict {
  const missed: string[] = [];
  const met: string[] = [];
  const asked = (item?.requiredTerms ?? {}) as Record<string, string | null>;
  const said = (item?.confirmations ?? {}) as Record<string, boolean | undefined>;

  for (const [key, value] of Object.entries(asked)) {
    /* Not asked. An empty string counts as not asked: the form writes one for a term the renter
       left blank, and treating that as a requirement marks every supplier non-compliant against
       a bar nobody set. */
    if (value == null || String(value).trim() === "") continue;

    if ((CERT_TERMS as readonly string[]).includes(key)) {
      const codes = certCodesFromValue(value);
      if (!codes.length) continue;
      for (const code of codes) {
        /* Per-code answer where the form sent one, else the aggregate — the same ladder
           `submissionToBidCard` climbs to decide which certs it holds. */
        const per = said[certConfKey(key, code)];
        const ok = per !== undefined ? per === true : said[key] === true;
        const name = `${TERM_LABEL[key] ?? key}: ${prettyCert(code)}`;
        (ok ? met : missed).push(name);
      }
      continue;
    }

    const name = TERM_LABEL[key] ?? key;
    /* Only an explicit Yes is a pass. `undefined` means the supplier was never shown the
       question for this item even though the renter asked it, which is a gap in the answer and
       not an answer; `false` is a plain No. Both are misses, and neither is silence. */
    (said[key] === true ? met : missed).push(name);
  }

  return { missed, met };
}

/** How many terms this item was asked for and did not confirm. */
export const linkConflictCount = (item: LinkBidItem | null | undefined): number =>
  linkTermVerdict(item).missed.length;

/** Whether the request stated any terms for this item at all. See the warning on {@link linkTermVerdict}. */
export function linkTermsWereStated(item: LinkBidItem | null | undefined): boolean {
  const asked = (item?.requiredTerms ?? {}) as Record<string, string | null>;
  return Object.values(asked).some((v) => v != null && String(v).trim() !== "");
}
