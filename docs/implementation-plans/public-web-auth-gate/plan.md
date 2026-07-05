# Public web + one-step auth-and-register gate

**Slug:** `public-web-auth-gate` · **Source:** free-form (Yara, 2026-07-03) · **Status:** planning

## Goal
Open the renter web app for public browsing (no account to view/see anything), and collapse
login + account registration into a **single step that fires only when a guest submits a request**:
phone → OTP → profile, all in one modal, producing a `basic` user in one pass. Email becomes a
**required** field. Session persists **30 days** (already the case). OTP delivery stays **SMS**;
the UI carries a method toggle wired for a future **email-OTP** backend.

## Decisions (2026-07-03)
1. **Email OTP → IN SCOPE now** (Yara: "i want it now also"). Backend auth is phone-only today
   (`otpMethod: 'SMS' | 'WHATSAPP'`, no email identifier — verified on `staging`
   `apps/backend/src/validators/auth.schema.ts` + `services/auth.service.ts:22`), so this makes the
   epic **full-stack with the backend on the critical path**: the web toggle can't send an email code
   until the backend accepts `otpMethod: EMAIL`. Email is also a required *profile* field. The backend
   change (T5) leads; carried via `/web:link-backend`. **Open product fork below must be answered.**
2. **Guest scope → browse + build a full RFQ draft, gate at Submit.** Matches today's `/create`
   design (`create/page.tsx`: guests run the whole wizard, gate at Step 4 → `AccountModal`).
3. **Prototype → standalone themed HTML mockup** (`prototype.html` in this folder).

## What already exists (most plumbing is present)
- **Gate-on-action** is already the create-flow model. `Step4Preview.tsx:30` —
  `tier === "guest" ? setShowAccount(true) : actions.submit()`.
- **`AccountModal`** (`src/components/onboarding/AccountModal.tsx`) reuses **`OnboardingForm`** but
  only does the **profile** step (`POST /api/profile/complete`, guest→basic). It **assumes an
  already-OTP-authed session** (renders `user.phone` read-only). This is the core thing to change.
- **OTP screens** `PhoneEntry` → `CodeEntry` (`src/components/auth/*`) driven by
  `/api/auth/request-code` → `/api/auth/verify`. Session = 30-day `mt_refresh` cookie
  (`auth-server.ts`).
- **The gate:** `src/middleware.ts:64` redirects every non-allow-listed page to `/login`
  (`PUBLIC_PREFIXES = ["/bid"]`).

## The change, precisely
Today (private web): `middleware → /login (OTP) → guest session → browse → /create → AccountModal
(profile only) → basic`.

Target (public web): `browse freely (no session) → /create wizard as guest → Submit →
AccountModal(**phone → OTP → profile**) → basic → auto-post`.

So the **OTP auth moves out of the standalone `/login` gate and into the combined modal**, and the
**middleware stops forcing login** on browse.

## Architecture & data

### Web UI
- **`AccountModal` → combined mini state-machine.** Phases `phone → code → profile`:
  - `phone`: render `PhoneEntry` (+ OTP-method toggle, see below).
  - `code`: render `CodeEntry`; on verify, call `signIn(user)` (creates the guest session) then
    advance to `profile` **without navigating**.
  - `profile`: render `OnboardingForm` with `onDone` → close + `actions.submit()` (unchanged wiring
    from `Step4Preview`).
  - Skip straight to `profile` if a session already exists but tier is still `guest` (mobile handoff
    / returning guest). Skip the modal entirely if already `basic`/`verified`.
- **`OnboardingForm` email required.** Add a `requireEmail` prop (default false to preserve the
  standalone `/onboarding` route). When true: email gets `*`, drops the "optional" tag, and
  validates a real email before submit. Backend already accepts `email` on `completeProfile`.
- **OTP-method toggle** on `PhoneEntry` (segmented control: SMS · Email). SMS active/default; Email
  **disabled with a "coming soon" tooltip** until the backend ticket lands. Behind a prop so the
  standalone `/login` route can keep the current single-method look if desired.
- **Browse-mode affordances.** Signed-out header shows a "Sign in" affordance; authed-only nav items
  (Requests, Inbox, Deal room, Profile) either hide or route through the gate when clicked by a guest.

### Middleware (the one real-risk change)
- Invert the gate: **public by default.** Two viable shapes —
  - **(A) allow-list flips to a small block-list**: only `/profile`, `/requests`, `/deal-room`,
    `/inbox`, `/dashboard` stay gated to `/login`; everything else public. Lowest blast radius.
  - **(B) gate nothing in middleware**; let each authed page's BFF calls return 401 and the client
    redirect. Cleanest conceptually but touches every authed page's fetch-error handling.
  - **Recommendation: (A)** for this epic — smallest, safest, reversible. Keep `/login` working as a
    standalone route (deep links, mobile handoff, the block-listed pages still use it).
- Keep the `handoff` and `PUBLIC_PREFIXES` logic intact.

### BFF routes
- No new route for the SMS path. `POST /api/auth/request-code` already sends `otpMethod:"SMS"`.
  Add an **optional `otpMethod` pass-through** so the toggle can send the chosen method later
  (validated against what the backend accepts; email rejected client-side until backend supports it).

### Contract / adapters
- No contract change needed for SMS + email-required (email already on `RenterProfile` and accepted
  by `completeProfile`).

### Backend dependency (Moedatech-App — cannot ship from web)
- **Email OTP.** Requires: `otpMethod` enum gains `EMAIL` (`auth.schema.ts`), an email identifier
  path in `unifiedLogin`/`sendOtp`/`verifyOtp` (`auth.service.ts` is phone-keyed today), an
  email-OTP delivery channel, and almost certainly Cognito changes. Carry via `/web:link-backend`.

## Backend & mobile-app impact (verified on `staging`)
Web and the mobile app **share one `Moedatech-App` backend** (same `/auth/*`, profile endpoints,
tenant), so shared surfaces were checked explicitly.

- **T1, T2, T4, T6 — zero backend contract change.** Web-side only (middleware, React, existing
  endpoints with existing payloads). Mobile **cannot** be affected.
- **T3 (email required) — web-client-only.** `completeProfileSchema.email` is `.optional().nullable()`
  on the backend, and `User.email` is `String?` with a **non-unique** `@@index` (not `@unique`).
  Requiring email on the web does not change backend behavior and cannot collide with mobile users —
  mobile keeps saving profiles without email.
- **T5 (email OTP) — the ONLY shared-backend change, now IN SCOPE.** Must be strictly additive:
  `EMAIL` as a new `otpMethod` value (default stays `SMS`), email login as a new branch that never
  touches the phone-keyed OTP path or its records. With that clause enforced in the backend PR, the
  mobile app is unaffected. The prisma `EMAIL` at schema:1886 is the `ContactMethod` enum, not an OTP
  method — it does not shortcut this work.

**Net: T1–T4/T6 leave mobile untouched. There are TWO shared-backend changes, both deferred and
guarded (additive, mobile-regression-guarded), to be built in one backend pass at the end:**
- **T5** — email-OTP on `/auth/*` (delivery-only; phone stays identity).
- **T7** — public read-only supplier/store browse on `/stores*` (so guests see real browse data instead
  of 401 error panels). Guard: field-safety audit on the backend projection; prefer a NEW public
  endpoint with an explicit safe projection over relaxing the shared authorizer. Verified: the
  web-mapped fields (`stores.ts`) are directory-only (no contact/CR/VAT), but the backend projection
  must be audited before exposure.

**Guest browse — interim (web-only, now):** until T7 lands, the anon-facing surfaces that would 401
(suggested suppliers, store detail, compare, home activity cards) render a "sign in" empty state
instead of an error/retry panel. Compare + activity cards stay empty-state permanently (personal data,
nothing to browse); suppliers + store detail flip to real data once T7 is live.

## Email-OTP identity model — DECIDED (Yara, 2026-07-03): delivery-only
**Email = alternate *delivery channel*; phone stays the account identity.** The user always enters a
phone (the account, as today); when they pick "Email" they also enter an email address that the 4-digit
code is sent to. Email is **not** a separate account and **not** a login identifier — so:
- **Account model is unchanged** → lowest mobile risk. Phone-keyed users/OTP records stay exactly as-is.
- **`verifyOtp` needs no change** — it's still `{ phone, code }`. Only the *send* path branches on the
  chosen channel. This is a small, additive backend change.
- The delivery email pre-fills the required profile email at the details step.

## Phases
1. **Open the web (middleware).** Flip to public-by-default (shape A). Exit: guest can load `/`,
   `/create`, `/stores/*`, `/compare` without redirect; block-listed pages still gate.
2. **Combined AccountModal.** Re-sequence to phone→code→profile reusing existing components. Exit:
   a fully signed-out guest can complete a request end-to-end (OTP + profile) in the modal and the
   RFQ auto-posts.
3. **Email required + method toggle.** `requireEmail` on `OnboardingForm`; segmented OTP toggle
   (Email disabled). i18n EN+AR. Exit: submit blocked without a valid email; toggle renders, Email
   shows "coming soon".
4. **Browse-mode polish.** Signed-out header/nav, sign-in affordance, guest→gate on authed nav.
   Exit: no dead ends for a signed-out user.
5. **(Backend dep, critical path) Email OTP.** T5 + `/web:link-backend`; **must merge before** T4's
   Email option and T2's email path go live. Blocked on the identity-model fork above.

## Risks & dependencies
- **Authed pages must not silently break when public** — the middleware flip is the key correctness
  item; every block-listed/authed page must still redirect a guest sensibly (shape A handles this).
- **`OnboardingForm` reuse** — the `requireEmail`/combined-mode props must not regress the standalone
  `/onboarding` and `/login` routes.
- **Email-OTP is a genuine backend change** — do not imply it's live in the UI (disabled state).
- **Mobile parity** — mobile is phone-only too; a phone-first combined step stays consistent.
- **No env changes** needed (reuses `APP_API_URL`, `TENANT_ID`).
