/**
 * Equipment safety certificates, read in the BROWSER (web-app/007, W-T21).
 *
 * ── Why this is not the model's job ──────────────────────────────────────────────────────────────
 *
 * `SAFETY_CERTIFICATES` is a closed list of two real marks — TÜV and Aramco — plus *other*. Two
 * words. Matching two words in a sentence is the same class of work the taxonomy matcher already
 * does for equipment names, which is why Tier 0 exists at all: **what the browser can answer for
 * certain, the browser answers.**
 *
 * ── The measurements that forced this ────────────────────────────────────────────────────────────
 *
 * Measured on staging, 2026-08-31, for `crawler excavator 30 ton with tuv`:
 *
 *   fast path (equipment_only, Haiku)   2.6 s   safety_certifications: []
 *   full path (Tier 2, Opus + job)     28.0 s   certificates.safety: ["tuv"]
 *
 * So the renter's choice was a wrong answer in under three seconds or a right one in twenty-eight —
 * for five words and two facts (owner, 2026-08-31: *"why is slow while i wrote only 2 fields"*).
 *
 * Neither number is a bug in isolation. The full path is the comprehension path: Opus, a 26k-token
 * prompt, a job row and a poll. It is priced for a paragraph with three attachments, and it charges
 * that price for five words because it cannot tell the difference.
 *
 * And the fast path CANNOT be fixed from here. It already receives the cert rules — they are item
 * rules, so the equipment-only build keeps them — but `EQUIPMENT_ONLY_OUTPUT_KEYS` is appended last,
 * on purpose, and says *"no equipment-age or safety-certificate fields"*. The last word wins, which
 * is why it emits the key and leaves it empty. Changing that is a one-line edit in the agent and a
 * deploy the owner has not authorised.
 *
 * ── What this buys ──────────────────────────────────────────────────────────────────────────────
 *
 * The cert is read here, the machine is read by whichever fast path fits, and nothing waits on a
 * model to recognise the word «TÜV». 2.6 s with the answer, instead of 28 s.
 *
 * ⚠️ **It only ever ADDS.** If the agent returns a cert, that wins — it read the whole sentence and
 * this read four words of it. This fills a gap; it never overrules.
 */

import type { SafetyCertificate } from "@/lib/contract/options";

/**
 * The spellings a renter actually types, per cert.
 *
 * TÜV with and without the umlaut, and the German ‑e ending people write from habit. Aramco in both
 * scripts, since the intake takes both. Deliberately NOT `saso`/`spsp`: those are operator licence
 * levels here, not equipment marks (`SAFETY_CERTIFICATES` has two entries and `other`), and putting
 * an operator cert in an equipment field is the exact confusion the agent's own rules spend a
 * paragraph preventing. `Partial`, therefore: the type carries codes this deliberately does not
 * match, and listing them with empty arrays would read as "we tried and found no spelling".
 */
const SPELLINGS: Partial<Record<SafetyCertificate, string[]>> = {
  tuv: ["tuv", "tüv", "tuev", "t.u.v"],
  aramco: ["aramco", "أرامكو", "ارامكو"],
};

/**
 * Word-boundary-ish match, so «tuv» does not fire inside another word.
 *
 * A plain `includes` would read «Tuvalu» or a supplier called «Tuvex» as a certificate. Arabic has
 * no case and its own letter forms, so those spellings are matched as-is: an Arabic reader writing
 * «أرامكو» inside a longer word is not a case this has to survive.
 */
function names(text: string, spellings: string[]): boolean {
  const t = text.toLowerCase();
  return spellings.some((w) => {
    if (!/^[a-z.]+$/.test(w)) return t.includes(w); // Arabic and punctuated forms
    return new RegExp(`(^|[^a-z])${w.replace(/\./g, "\.")}([^a-z]|$)`, "i").test(t);
  });
}

/** Every equipment cert the renter named, in the order this app lists them. */
export function certsInText(text: string): SafetyCertificate[] {
  if (!text) return [];
  const out: SafetyCertificate[] = [];
  for (const [cert, spellings] of Object.entries(SPELLINGS) as [SafetyCertificate, string[]][]) {
    if (names(text, spellings)) out.push(cert);
  }
  return out;
}
