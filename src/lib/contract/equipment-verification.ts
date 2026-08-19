/**
 * **The one definition of "this equipment is verified"** — a mechanical port of the app's
 * `apps/mobile/lib/core/utils/equipment_verification.dart`, which is the reference implementation
 * (owner's standing ruling: the app is the reference for shared logic; where web and app disagree,
 * the web changes).
 *
 * Its Dart twin, verbatim:
 *
 * ```dart
 * bool isEquipmentVerified(String? verificationStatus, String? source) =>
 *     verificationStatus == 'VERIFIED';
 * ```
 *
 * ── Why a whole file for one comparison ──────────────────────────────────────────────────────────
 * Because every surface that has ever drawn this tick got it wrong by reading something ELSE — some
 * field that correlates with verification on the fixtures in front of the author and diverges on real
 * data. The rentee map's equipment card is the latest: it drew the green ✓ off `certs.length > 0`,
 * i.e. off whether the REQUEST had named any certificate at all, so on a request asking for a TÜV
 * every machine in the fleet rendered as verified — including the ones an admin had REJECTED. The
 * mistake is not a typo anyone would catch in review; it is a plausible-looking proxy. A named
 * function is the thing a reviewer can check a call site against.
 *
 * ── `VERIFIED` only, and specifically NOT `ACCEPTED` ─────────────────────────────────────────────
 * `EquipmentVerificationStatus` (backend `prisma/schema.prisma`) has five members:
 * `PENDING_REVIEW` · `VERIFIED` · `REJECTED` · `UNVERIFIED` · `ACCEPTED`. The backend's own
 * `equipment-where.ts` folds `VERIFIED` **and** `ACCEPTED` together into `ACCEPTED_STATUSES` — but
 * that fold answers a DIFFERENT question ("can renters see this listing at all?", the `live`/`hidden`
 * shopfront stage), and borrowing it here would put the trust mark on a machine our team accepted
 * into the marketplace without verifying. The tick is a claim the PLATFORM makes about the machine's
 * papers, so it takes the narrower state, exactly as the app does.
 *
 * Measured on staging, 2026-08-11 — the two are not interchangeable: of the 1104 listings the rentee
 * map is eligible to plot (`isActive`, not deleted), 649 are VERIFIED, **271 ACCEPTED**, 164
 * UNVERIFIED, 15 REJECTED and 5 PENDING_REVIEW. Reading `ACCEPTED_STATUSES` would over-tick 271
 * machines; reading nothing at all (the bug this replaces) over-ticked all 455 unverified ones.
 *
 * ── `source` is accepted and ignored, on purpose ─────────────────────────────────────────────────
 * The app's signature carries it and its body does not use it. There WAS a gate — a listing uploaded
 * through the documentation-free wizard (`source == 'WIZARD'`) was ineligible for the tick — and the
 * #197 UAT directive removed it (*"show verified whatever the source is"*). The parameter stayed for
 * call-site compatibility. It stays here too, so the port is checkable against its twin line by line
 * and so a future reader who finds the Dart signature does not conclude the web dropped a rule.
 *
 * ── Absent ⇒ not verified ────────────────────────────────────────────────────────────────────────
 * `null`/`undefined` means this payload did not carry the state (an older projection, a preview, a
 * partial parse), which is a different fact from "we checked and it is unverified" — but it renders
 * the same way, because an absent tick is the only safe rendering of an unknown. Never invent one.
 */

/**
 * @param verificationStatus the LISTING's `verificationStatus` — never a document's `verifyStatus`,
 *   which is one PAPER's review state and is one character away from this one.
 * @param source the listing's upload origin. Accepted for parity with the Dart twin; unused.
 */
export function isEquipmentVerified(
  verificationStatus: string | null | undefined,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  source?: string | null,
): boolean {
  return verificationStatus === "VERIFIED";
}
