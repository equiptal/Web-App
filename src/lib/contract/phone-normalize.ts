/**
 * Phone numbers out of somebody's spreadsheet, into the one form that can be matched.
 *
 * ── Why the web normalises at all (owner, 2026-09-08: *"normalize the numbers"*) ────────────────
 *
 * The backend already does this — `normalizePhoneE164` in `apps/backend-agents/src/utils/phone.util.ts`
 * (SUP-BE-2) — and it is the authority: `phone_e164` is what the `(scope_key, phone_e164)` index
 * dedupes on and what SUP-BE-9 attaches a bid by. So why here too?
 *
 * Because the renter is shown his rows before anything is written, and what he was shown was the
 * sheet's own text: `9.66503E+11` in one row and `503372850` in the next. Both are the same supplier
 * in two spellings, one of them mangled, and the screen said nothing about either. The import then
 * "succeeded" with a row whose only contact had been dropped server-side, because an unparseable
 * value is stored as NULL rather than as itself — correctly, since a raw string in that column is a
 * key that can never match. Normalising in the preview makes the screen say what will be saved.
 *
 * **The rules below are the backend's, deliberately identical**, down to the traps: fold Arabic
 * digits, keep a country code that is already there, drop the trunk zero, and refuse rather than
 * invent. If the two ever disagree the backend wins — this is a mirror for the renter's eyes, not a
 * second authority.
 *
 * ⚠️ **No `libphonenumber-js`**, for the backend's reason and one of our own: ~150 KB of metadata for
 * one country's rules, in a bundle this app keeps small. Saudi numbering is a fixed shape.
 *
 * ── NO React, NO DOM ────────────────────────────────────────────────────────────────────────────
 */

/** Saudi Arabia — the default region, as on the backend. */
const SA_CC = "966";

/**
 * A Saudi subscriber number is exactly 9 digits and never starts with 0: mobile is `5XXXXXXXX`,
 * geographic `1XXXXXXXX`. The leading `0` typed locally is the national trunk prefix, which E.164
 * drops.
 *
 * ⚠️ Landlines are legal here — a supplier's tender desk is often an office line — so this must not
 * be narrowed to `5`.
 */
const SA_SUBSCRIBER = /^[1-9][0-9]{8}$/;

/** E.164: a country code that cannot start with 0, and 8 to 15 digits in total. */
const E164_DIGITS = /^[1-9][0-9]{7,14}$/;

/** Fold Arabic-Indic and Eastern-Arabic digits to Latin, as the backend and `cr.util.ts` do. */
function foldDigits(raw: string): string {
  return raw
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/**
 * What a cell that Excel wrote in scientific notation actually holds.
 *
 * ── The whole reason this file has a second function ────────────────────────────────────────────
 * A 12-digit phone typed into a General-formatted cell is stored as a NUMBER, displayed as
 * `9.66503E+11`, and written to CSV **as the displayed text**. At that point the number is gone:
 * 9.66503×10¹¹ is 966,503,000,000, and the last six digits it is missing were never in the file.
 *
 * So this returns three different things, and the difference is the point:
 *   · `{ digits }` — the notation was loss-free (`9.66503372850E+11`), so it is expanded
 *   · `"truncated"` — significant digits are missing; the value CANNOT be recovered and must not be
 *     guessed at, because a plausible wrong phone number is worse than a refusal
 *   · `null` — not scientific notation at all
 *
 * The cure for a truncated cell is the workbook itself, where the number is intact — which is why
 * `.xlsx` upload was added in the same change.
 */
export function readScientific(raw: string): { digits: string } | "truncated" | null {
  const m = /^([0-9]+)(?:[.,]([0-9]+))?[eE]\+?([0-9]+)$/.exec(foldDigits(raw).trim().replace(/\s/g, ""));
  if (!m) return null;
  const [, whole, frac = "", expText] = m;
  const exponent = Number(expText);
  const significant = whole + frac;
  // `9.66503E+11` needs 12 digits and carries 6: the rest would be zeros we made up.
  if (significant.length < exponent + 1) return "truncated";
  const digits = significant.padEnd(exponent + 1, "0");
  return { digits: digits.slice(0, Math.max(exponent + 1, significant.length)) };
}

/** Why a value could not become a phone number — each one is a different sentence to the renter. */
export type PhoneProblem = "truncated" | "unreadable";

/**
 * One cell → E.164, or the reason it cannot be.
 *
 * `null` in, `null` out: an empty phone column is not a problem, it is a supplier reached by e-mail.
 */
export function normalizePhone(raw: string | null | undefined): { e164: string } | { problem: PhoneProblem } | null {
  if (raw == null) return null;
  const folded = foldDigits(String(raw)).trim();
  if (!folded) return null;

  const sci = readScientific(folded);
  if (sci === "truncated") return { problem: "truncated" };

  // Keep a leading `+` if there is one; everything else reduces to digits, which removes separators,
  // letters, an `ext.` suffix and the invisible RTL marks an Arabic sheet carries.
  const hadPlus = folded.startsWith("+");
  let digits = sci ? sci.digits : folded.replace(/\D/g, "");
  if (!digits) return { problem: "unreadable" };

  if (hadPlus) {
    // Already international. Nothing to infer.
  } else if (digits.startsWith("00")) {
    // `00` is the written form of `+`.
    digits = digits.slice(2);
  } else if (digits.startsWith(SA_CC) && digits.length > SA_CC.length) {
    // `966503372850` — the country code with no prefix at all. The length test is what stops a
    // national number that merely begins `966…` being read as one.
  } else if (digits.startsWith("0")) {
    // National form with the trunk prefix: `0503372850`.
    digits = SA_CC + digits.slice(1);
  } else {
    // Bare subscriber digits: `503372850`, which is the other spelling in the owner's screenshot.
    digits = SA_CC + digits;
  }

  // ⚠️ `+966 0 50…` — the country code AND the trunk zero, a very common paste. Left alone it makes
  // a 10-digit "subscriber number" and a correctly dialled number would be thrown away.
  if (digits.startsWith(SA_CC) && digits[SA_CC.length] === "0") {
    digits = SA_CC + digits.slice(SA_CC.length + 1);
  }

  if (digits.startsWith(SA_CC)) {
    const subscriber = digits.slice(SA_CC.length);
    return SA_SUBSCRIBER.test(subscriber) ? { e164: `+${SA_CC}${subscriber}` } : { problem: "unreadable" };
  }
  // A renter's list legitimately holds a UAE or an Egyptian supplier; forcing those to +966 would
  // invent a number.
  return E164_DIGITS.test(digits) ? { e164: `+${digits}` } : { problem: "unreadable" };
}

/** The normalised number, or null — for the places that only want the value. */
export function phoneE164(raw: string | null | undefined): string | null {
  const out = normalizePhone(raw);
  return out && "e164" in out ? out.e164 : null;
}
