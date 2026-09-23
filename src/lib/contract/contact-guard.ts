/**
 * **Does this chat message carry a phone number?**
 *
 * A VERBATIM port of the app's `apps/mobile/lib/features/deal_room/utils/contact_guard.dart`
 * (2026-09-21). Same separators, same runs, same three shapes, same accepted false positive.
 *
 * The deal room's contact policy is asymmetric, and the asymmetry is enforced on the server:
 * `getDealRoom` always returns the SUPPLIER's phone and withholds the RENTER's until the deal is
 * `CLOSED` (T10 / AC-09). The chat does not pass through that gate — it is Stream — so a number
 * typed into a bubble walks straight past it.
 *
 * 🔴 **Which is why the two sides are treated differently.** The renter already HAS the supplier's
 * number and a call button wired to it, so masking his digits protects nothing. This web client is
 * the RENTER's, so it warns and never blocks: sharing hers early is her call, and the platform's
 * job is to say she does not need to.
 *
 * ⚠️ **This rule is now written twice** — here and in `contact_guard.dart` — and a third copy is
 * owed in TypeScript for Stream's pre-send hook, which is the half that covers old builds and any
 * client we do not own. They WILL drift unless the fixtures move with them: a case added to
 * `contact-guard.test.ts` must be added to the app's `contact_guard_test.dart` too.
 */

/** Arabic-Indic (٠-٩) and Eastern Arabic-Indic (۰-۹) digits, folded to ASCII.
 *
 *  ⚠️ Without this the guard is bypassed by typing the number in Arabic numerals, which is one
 *  keyboard tap away on every phone sold here. */
const AR_INDIC = "٠١٢٣٤٥٦٧٨٩";
const EAST_AR_INDIC = "۰۱۲۳۴۵۶۷۸۹";

/** Characters people put BETWEEN the digits of a phone number. Stripped inside a run so
 *  `053 757 6005` and `053-757-6005` read as one number.
 *
 *  ⚠️ The comma is here too, which is what stops a price — `1,800` — becoming a four-digit run
 *  rather than two short ones. Letters are deliberately NOT separators: they BREAK a run, which is
 *  what keeps an equipment model like `JLG 460SJ` out of this entirely. */
const SEPARATORS = " \t-.()[]/‏‎,";

function foldDigits(input: string): string {
  let out = "";
  for (const ch of input) {
    const ai = AR_INDIC.indexOf(ch);
    if (ai >= 0) { out += String(ai); continue; }
    const ei = EAST_AR_INDIC.indexOf(ch);
    if (ei >= 0) { out += String(ei); continue; }
    out += ch;
  }
  return out;
}

/** Every maximal run of digits in `text`, with separators folded away. A run ends at any character
 *  that is neither a digit nor a separator — so a letter, an Arabic word or a newline all close it. */
export function digitRuns(text: string): string[] {
  const folded = foldDigits(text);
  const runs: string[] = [];
  let current = "";
  let sawDigitSinceSeparator = false;

  const flush = () => {
    if (current !== "") runs.push(current);
    current = "";
    sawDigitSinceSeparator = false;
  };

  for (const ch of folded) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x30 && code <= 0x39) {
      current += ch;
      sawDigitSinceSeparator = true;
      continue;
    }
    if (SEPARATORS.includes(ch)) {
      // A separator only holds a run together BETWEEN digits. Two separators in a row, or one
      // before any digit, end it — otherwise «١٨٠٠ ريال و ٥٠٠» would fuse two prices into one
      // long number.
      if (!sawDigitSinceSeparator) flush();
      else sawDigitSinceSeparator = false;
      continue;
    }
    flush();
  }
  flush();
  return runs;
}

/**
 * True when `text` contains something shaped like a Saudi mobile number.
 *
 * Matched, and ONLY these — each as a WHOLE run, never as a substring of a longer one, so a
 * 15-digit VAT number or a 10-digit commercial register cannot be read as a phone:
 *
 *   · `05XXXXXXXX`   — 10 digits, the way everyone writes it
 *   · `9665XXXXXXXX` — 12 digits, with or without a `+`
 *   · `5XXXXXXXX`    — 9 digits, the bare national form
 *
 * 🔴 **Deliberately NOT matched, and they are real evasions:** digits spelled out in words
 * («صفر خمسة ثلاثة…»), numbers split across two messages, and landlines. Chasing them in v1 buys
 * false positives, and the answer to a determined evader is the detection log, not a cleverer regex.
 *
 * ⚠️ **One known false positive**, accepted: a bare figure of exactly nine digits beginning with 5 —
 * five hundred million and change — reads as a phone. No rental in this product is priced there.
 */
export function containsPhoneNumber(text: string): boolean {
  if (!text) return false;
  for (const run of digitRuns(text)) {
    if (run.length === 10 && run.startsWith("05")) return true;
    if (run.length === 12 && run.startsWith("9665")) return true;
    if (run.length === 9 && run.startsWith("5")) return true;
  }
  return false;
}
