/**
 * Feature flags (build-inlined via NEXT_PUBLIC_ env vars, per-environment on Amplify).
 *
 * PUBLIC_WEB_ENABLED — the public-web + one-step-auth-gate epic. ON (default): the site is public to
 * browse, there is NO /login page (auth is an in-app modal form: phone + email → OTP → register if
 * new), sign-in offers SMS/Email OTP, and guest surfaces (open tabs, request-free compare, the submit
 * modal) are live. This is now the DEFAULT behaviour. Set NEXT_PUBLIC_PUBLIC_WEB_ENABLED=0 to fall
 * back to the legacy gated behaviour (whole app requires a session, standalone /login, SMS-only) —
 * e.g. a kill-switch to hold it back on a specific environment (prod). Same pattern as BID_VERIFY_ENABLED.
 *
 * NOTE: the edge middleware reads this env var directly at call time (for test toggling); keep both in
 * sync on the same NEXT_PUBLIC_PUBLIC_WEB_ENABLED variable (default ON, `=0` disables).
 */
export const PUBLIC_WEB_ENABLED = process.env.NEXT_PUBLIC_PUBLIC_WEB_ENABLED !== "0";

/**
 * BID_VERIFY_ENABLED — the "quote → transform → renter-verify → commit" flow. ON (default): a quote upload
 * runs /bids/transform and opens the verify screen; the renter confirms/edits each field (optional) before
 * the bid is committed into the comparison. Set NEXT_PUBLIC_BID_VERIFY_ENABLED=0 to fall back to the legacy
 * path (upload → parse → add straight to the matrix with the match-warning popup) — e.g. if the agent's
 * /bids/transform isn't available in an environment.
 */
export const BID_VERIFY_ENABLED = process.env.NEXT_PUBLIC_BID_VERIFY_ENABLED !== "0";

/**
 * EMAIL_FIRST_AUTH_ENABLED — Modal 1's Email tab + the email-first onboarding (verify email → add
 * phone). A plain code toggle (no env var): `false` keeps Modal 1 phone-only (email is collected in
 * Modal 2) — the fully-working path. The deployed `/auth/login` still rejects a phone-less email login
 * (VALIDATION_ERROR 400), so this stays `false`. **Flip to `true` here** once the backend accepts an
 * email-only login (email lookup → send code / EMAIL_AMBIGUOUS / needsSignup) — no other change needed.
 */
export const EMAIL_FIRST_AUTH_ENABLED: boolean = true;

/**
 * CUSTOM_EQUIPMENT_ENABLED — off-catalogue equipment: a `no-match` line the renter NAMES himself,
 * posted with `customEquipmentName` and no taxonomy ids.
 *
 * ON by default since 2026-09-06, when the backend half went live and the contract was verified
 * against it end to end (an item with the three id keys ABSENT is accepted; `null` ids and a partial
 * triple are both 422).
 *
 * `=0` is the kill switch, same shape as PUBLIC_WEB_ENABLED: it restores the old behaviour to the
 * letter — the no-match row is shown, never named, never posted — for an environment whose backend
 * is older than this. Build-time, like every NEXT_PUBLIC_ variable: rebuild the branch after
 * changing it.
 */
export const CUSTOM_EQUIPMENT_ENABLED = process.env.NEXT_PUBLIC_CUSTOM_EQUIPMENT !== "0";

/**
 * HELP_MANUAL_ENABLED — the «?» in the header and the manual behind it.
 *
 * OFF by default (owner, 2026-09-07: *"can you hide the manual for now"*). The seven sections and
 * their pictures are written and wired; what they are waiting for is the screenshots being recut
 * against a build with the CARTO key set, and the two flows whose clips are not finished. A manual
 * that shows a watermarked map teaches the watermark.
 *
 * Switched on with `NEXT_PUBLIC_HELP_MANUAL=1` — a flag rather than a deletion, so turning it back
 * on is one env var and no code archaeology.
 */
export const HELP_MANUAL_ENABLED = process.env.NEXT_PUBLIC_HELP_MANUAL === "1";

/**
 * TRIAL_REQUESTS_ENABLED — the «Trial Request» path (mobile/016): the first-request pop-up offering
 * Trial or Real, the amber trial ribbon, and `isTrial: true` on the submit.
 *
 * OFF (owner, 2026-09-06): *"no trial request on the web for now"*. A plain code toggle rather than
 * an env var, because it is a product decision and not a per-environment one. Hidden, not deleted:
 * the whole path is one flag away from coming back, and the backend still supports it.
 *
 * With it off, «Create request» goes straight into the form, `?mode=trial` is ignored (a bookmarked
 * link cannot create a trial), and `isTrial` is never sent.
 */
export const TRIAL_REQUESTS_ENABLED: boolean = false;

/**
 * EQUIPMENT_NAME_ON_EVERY_LINE — send the renter's own words beside the taxonomy, not instead of it.
 *
 * OFF until `backend-agents` ships **B1**, and this is not caution, it is a measured consequence:
 * `getBidFormPreview` computes `hasCustomEquipment` as *any line carries a name*, and the Supplier OS
 * suppresses its ENTIRE app handoff on that flag — the QR dialog and «Go To App». The moment every
 * line carries a name, that flag is true for every request in the product and every bid link loses
 * its QR. B1 re-derives the flag from the undefined predicate instead; this switch is thrown after it.
 *
 * With it off, the payload keeps today's shape — ids OR a name — and every other part of this change
 * (the card, the reading rule, the gate) is already live and safe, because none of them touches the
 * wire.
 */
export const EQUIPMENT_NAME_ON_EVERY_LINE = process.env.NEXT_PUBLIC_EQUIPMENT_NAME_EVERY_LINE === "1";

/**
 * Does the renter's own catalogue include HIDDEN nodes?
 *
 * Owner, 2026-09-13, on a TYPE search that found nothing: *"why is the hidden taxonomy not shown in
 * the dropdown? it must be matched from the agent and must appear in the dropdown anyway"*.
 *
 * 🔴 OFF, and it must stay off until the app backend's B2 ships
 * (`docs/plans/equipment-name-always/app-backend-changes.md`). `assertRequestable` REFUSES a hidden
 * subtype at create today, so a renter who picked one out of this list would fill in the whole card
 * and be 422'd on «Review & send», with nothing on screen he could fix. That is worse than not
 * offering it. B2 is what makes the create accept it and the dispatch skip it.
 *
 * A code toggle rather than a `NEXT_PUBLIC_*` env var, on the `TRIAL_REQUESTS_ENABLED` precedent: it
 * is a product decision that lands in one deploy, not a per-environment setting.
 */
export const TAXONOMY_INCLUDE_HIDDEN = false;
