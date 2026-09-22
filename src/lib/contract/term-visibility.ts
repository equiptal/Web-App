/**
 * **Term keys hidden from EVERY renter-facing surface** — request, bid and deal room.
 *
 * The web half of the app's `kHiddenTermKeys` (owner, 2026-09-21, on the app: *"remove operator
 * nationality from all surfaces now, in request, bid, deal room"*, then on the web, 2026-09-22:
 * *"operator nationality is removed in the app, check it there and align web to it"*). Mirrors
 * `Moedatech-App/apps/mobile/lib/core/constants/term_options.dart` line for line, including the
 * case-insensitive predicate beside it.
 *
 * 🔴 **DISPLAY ONLY. Nothing here changes what a request or a bid CARRIES.** The field is still
 * stored on the request item, still declared on the bid payload and still rendered by the admin
 * panel — the app is explicit about all three. A request created before the term was hidden keeps
 * its value, and editing that request preserves it rather than silently clearing it; a NEW request
 * simply leaves it null, because the control that used to set it is no longer drawn.
 *
 * ⚠️ **Case-insensitive, and that is load-bearing rather than tidy.** Deviation keys and T3
 * declarations arrive in both forms (`operator_nationality`, `operatorNationality`), so a payload
 * that cases a key differently would otherwise smuggle a retired term back onto a surface.
 *
 * ⚠️ **It is a set of ONE today and is written as a set anyway**, because the app's is — the next
 * term to be retired is one entry here and one entry there, in step, rather than a rewrite.
 */
export const HIDDEN_TERM_KEYS = new Set<string>(["operator_nationality"]);

/** Whether `key` must be dropped before it reaches a renter-facing surface. */
export const isHiddenTermKey = (key: string): boolean =>
  HIDDEN_TERM_KEYS.has(key) || HIDDEN_TERM_KEYS.has(key.toLowerCase());
