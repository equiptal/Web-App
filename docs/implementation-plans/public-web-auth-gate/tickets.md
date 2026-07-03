# Tickets — public-web-auth-gate

Order matches plan phases. Each ticket notes scope + Given/When/Then. Backend-dependency tickets are
marked **⚠ Backend (Moedatech-App)** and must be carried by `/web:link-backend`.

> **Shared-backend / mobile-safety note.** Web and the mobile app share one `Moedatech-App` backend
> (same `/auth/*`, profile endpoints, tenant). **T1–T4 and T6 make ZERO backend contract changes** and
> therefore cannot affect the mobile app. The **only** shared-backend change is **T5 (email OTP)** —
> now **IN SCOPE** (Yara, 2026-07-03: "i want it now also"), so it is on the **critical path** and must
> be strictly additive (see its safety clause). Verified on `staging`: `completeProfileSchema.email` is
> `.optional().nullable()` (T3 is web-client-only); `User.email` is `String?` with a **non-unique**
> index (no collision risk).
>
> **⚠ Critical-path note:** the web toggle (T4) and the email path in T2 **cannot function until the
> backend PR (T5) merges** — the web can't send an email code the shared backend rejects. T5 leads;
> T4's Email option stays disabled in prod until T5 is live.

---

## T1 — Open the web: public-by-default middleware
**Scope:** Web UI (middleware). **Mobile impact:** none. **Satisfies:** "web open for everyone to browse/see without auth".

Flip `src/middleware.ts` from allow-list (`PUBLIC_PREFIXES`) to **block-list**: only
`/profile`, `/requests`, `/deal-room`, `/inbox`, `/dashboard` redirect to `/login`; all other pages
public. Keep `handoff` handling and the `/login`→next redirect for authed users.

- **Given** a signed-out visitor, **When** they open `/`, `/create`, `/stores/<id>`, or `/compare`,
  **Then** the page renders (200), no redirect to `/login`.
- **Given** a signed-out visitor, **When** they open `/profile` or `/requests`,
  **Then** they are redirected to `/login?next=<path>`.
- **Given** an authed user, **When** they open `/login`, **Then** they are redirected to `next`/home
  (unchanged).

## T2 — Combined AccountModal: phone → OTP → profile in one step
**Scope:** Web UI. **Mobile impact:** none (reuses existing endpoints/payloads). **Satisfies:** "auth + registering an account in 1 step when he tries to make a request".

Turn `src/components/onboarding/AccountModal.tsx` into a 3-phase state machine reusing `PhoneEntry`,
`CodeEntry`, `OnboardingForm`. On OTP verify → `signIn(user)` then advance to profile (no navigation).
On profile `onDone` → close + `actions.submit()` (existing `Step4Preview` wiring). Entry phase:
`basic`/`verified` → skip modal; existing guest session → start at profile; no session → start at phone.

- **Given** a fully signed-out guest with a complete draft, **When** they press Submit,
  **Then** the modal opens on the phone step.
- **Given** they enter a phone and a valid OTP, **When** verification succeeds,
  **Then** the modal advances to the profile form (still open, session now guest-authed).
- **Given** they complete the profile, **When** it saves (guest→basic),
  **Then** the modal closes and the RFQ is auto-posted.
- **Given** a returning guest who already has a session, **When** they Submit,
  **Then** the modal opens directly on the profile step (no re-OTP).

## T3 — Email required in the combined register step
**Scope:** Web UI (client validation only). **Mobile impact:** none — backend email stays optional. **Satisfies:** "email will be required".

Add `requireEmail?: boolean` to `OnboardingForm`. When true (combined modal): email field gets `*`,
loses the "optional" tag, and is validated (non-empty + email format) before submit. Default false
keeps the standalone `/onboarding` route unchanged. **No backend change** — `completeProfileSchema.email`
is already `.optional().nullable()`, so requiring it on the web does not alter backend behavior and the
mobile app keeps saving profiles without email.

- **Given** the combined modal profile step, **When** the user submits with an empty/invalid email,
  **Then** an inline email error shows and submit is blocked.
- **Given** a valid email, **When** they submit, **Then** the profile saves with the email persisted.
- **Given** the standalone `/onboarding` route, **When** rendered, **Then** email remains optional
  (no regression).

## T4 — OTP-method toggle (SMS active, Email coming-soon)
**Scope:** Web UI (+ optional BFF pass-through). **Mobile impact:** none — SMS path identical to today. **Satisfies:** "option to auth through otp on email or on sms".

Add a segmented SMS · Email toggle to `PhoneEntry` (behind a prop). SMS default/active. **Phone stays
required always** (it's the account); picking Email reveals a "Send the code to" email field. Email
**disabled** with a "coming soon" tooltip until T5 lands. Thread the chosen `otpMethod` (+ `otpEmail`
when Email) through `POST /api/auth/request-code` (currently hardcodes `"SMS"`), validated so the web
can never send a value the shared backend doesn't accept yet.

- **Given** the combined modal phone step, **When** rendered, **Then** an SMS/Email toggle shows with
  SMS selected and Email disabled + "coming soon".
- **Given** SMS selected, **When** a code is requested, **Then** the SMS OTP flow runs as today.
- **Given** the standalone `/login` route, **When** rendered, **Then** its look is unchanged unless
  the toggle prop is enabled.

## T5 — ⚠ Backend (Moedatech-App): email-OTP delivery  [IN SCOPE — critical path]
**Scope:** Backend-dependency — carry via `/web:link-backend`. **Satisfies:** email-OTP half of "email or sms". **Blocks:** T4 Email option + T2 email path going live.

**Model: delivery-only (decided).** Email is a delivery channel for the code; **phone stays the account
identity**. So `verifyOtp` is UNCHANGED (`{ phone, code }`); only the *send* path branches. Backend auth
today: `auth.schema.ts` `otpMethod: 'SMS' | 'WHATSAPP'`; `auth.service.ts` `sendOtp` sends via SMS,
OTP record keyed by phone. The prisma `EMAIL` at schema:1886 is the `ContactMethod` enum, not an OTP
method. Change needed:
- Add `EMAIL` to the `otpMethod` enum in `loginSchema`/`registerSchema` (`auth.schema.ts`) and to
  `type OtpMethod` (`auth.service.ts`).
- Accept an optional **`otpEmail`** on `login`/`resend` (the destination address); `sendOtp` branches:
  `EMAIL` → send the 4-digit code to `otpEmail`; else SMS as today. **OTP record still keyed by phone.**
- No Cognito change (identity is still the phone). Verify + token issuance untouched.

**🔒 Mobile-safety clause (enforce in the backend PR):**
- `EMAIL` is a **new** enum value; **default stays `SMS`**; `SMS`/`WHATSAPP` paths byte-unchanged.
- The email branch is **send-only** and never touches the phone-keyed OTP record shape or `verifyOtp`.
- Existing mobile requests (phone + `SMS`/`WHATSAPP`) produce identical responses before/after.

- **Given** the backend accepts `otpMethod:"EMAIL"` + `otpEmail`, **When** the web sends an email-OTP
  request for a phone, **Then** the code is emailed and `verifyOtp({phone,code})` issues a session —
  at which point T4's Email option is enabled.
- **Given** an existing mobile phone+SMS OTP request, **When** replayed after the change,
  **Then** the response is identical to before (regression guard).
- **Note:** cannot ship from the web repo. `/web:link-backend "email OTP delivery"` opens the backend PR.

## T8 — Tabs visible to guests with empty-state + CTA  [DONE]
**Scope:** Web UI. **Satisfies:** "why can't I view other tabs" — keep tabs, show empty+CTA.

Middleware `GATED_PREFIXES` reduced to `["/deal-room","/dashboard"]` (tabs no longer gated); AppShell
shows **all** nav to guests; page-level guards render a guest empty-state (`SignInPrompt`, now with a
configurable CTA/icon) on Requests (→ "Create request"), Inbox + Profile (→ "Sign in"). Middleware
tests updated. `tsc`/`eslint`/201 tests green.

## T9 — Guest bid-comparison mode (upload → compare → agent, no request/account)  [DONE]
**Scope:** Web UI. **Satisfies:** "can they upload/compare/use agent without requests or bids".

Feasible web-only: `/api/me/bids/{parse,recommend,ask}` use `relayToMansour` (NO auth). Add a
"no-request context" mode to `BidComparisonWorkspace`: a guest can upload supplier quotes, compare
them side-by-side, and use the agent (rank/ask) with no request and no account. Replaces the current
anon `SignInPrompt` on `/compare`. Account still required only to **start a deal room / award**.

- **Given** a signed-out visitor on `/compare`, **When** they upload ≥2 quotes, **Then** they compare
  + can rank/ask the agent, no sign-in.
- **Given** they try to start a deal / award, **Then** the account gate (combined modal) fires.

## T10 — Per-device soft limit on both agents before account  [DONE]
**Scope:** Web UI. **Satisfies:** "limit per user to use the request agent before creating a request".

A guest has no identity, so enforce a **per-device** counter (localStorage) on both the RFQ create
agent (`/api/agent/process`) and the compare agent (parse/recommend/ask). After N free runs (default
3), show an account prompt instead of running. Signed-in users are unlimited. Soft (bypassable by
clearing storage) — a nudge, not hard enforcement; a hard per-IP cap would need a Mansour change.

- **Given** a guest who has run an agent N times, **When** they trigger it again, **Then** the account
  gate is shown instead of a run.
- **Given** a signed-in user, **When** they use an agent, **Then** no limit applies.

## T7 — ⚠ Backend (Moedatech-App): public read-only supplier/store browse  [IN SCOPE — guarded, bundle with T5]
**Scope:** Backend-dependency (2nd shared change) + web wiring. **Satisfies:** "web open for everyone to browse/see". **Bundle:** one guarded backend pass with T5.

**Problem.** `/`, `/stores/[id]`, `/compare` don't crash for guests (verified), but their data routes
return **401**, so guests see error/retry panels instead of real browse content. On `staging`
`serverless.yml`, three read-only routes are behind `cognitoAuthorizer`:
`GET /stores`, `GET /stores/{storeId}`, `GET /stores/{storeId}/equipment`.

**Design — prefer a NEW public endpoint over relaxing the shared authorizer (most guarded):**
- **(Recommended)** Add public read-only endpoints (e.g. `GET /public/stores`, `GET /public/stores/{id}`,
  `.../equipment`) backed by an **explicit safe projection** — leaves the existing authed routes AND
  the mobile app 100% untouched, and gives explicit control over exposed fields.
- (Alternative) Drop the authorizer on the existing 3 routes — smaller diff but exposes the **raw**
  backend payload publicly and changes shared-route behavior.

**🔒 Guard clause (enforce in the backend PR):**
- **Field-safety audit on the BACKEND projection**, not just the web mapper. Web-visible fields are
  already safe (directory/marketing only — audited: no phone/email/CR/VAT/contact). But a public route
  exposes whatever the Prisma `select` returns — audit it for supplier contact info, owner/user IDs,
  internal flags; the public projection must include **only** the fields the web maps
  (`StoreCard`/`StoreDetail`/`EquipmentCard` in `src/lib/contract/stores.ts`).
- **Additive / mobile-safe:** existing authed `/stores*` responses byte-unchanged; mobile regression-guarded.
- View-count side effect on `/stores/{id}` should still behave (or be no-op) for anon.

**Web wiring (after the endpoint exists):** point `/api/stores*` (and taxonomy) at the public endpoint
when there's no session; flip the T6-interim empty states to render real data for guests.

- **Given** a signed-out visitor on `/` or `/stores/{id}`, **When** the public endpoint is live,
  **Then** suggested suppliers + store detail render real read-only data (no sign-in wall, no error panel).
- **Given** a direct call to the public endpoint, **When** inspected, **Then** the payload contains
  only the audited safe fields (no contact/owner/internal data).
- **Given** an existing mobile `/stores*` call, **When** replayed after the change, **Then** identical response.

## T6 — Browse-mode affordances (no dead ends for guests)
**Scope:** Web UI. **Mobile impact:** none. **Satisfies:** public browse UX.

Signed-out header shows a "Sign in" affordance; authed-only nav items (Requests, Inbox, Deal room,
Profile) hide or route through the gate for guests. Ensure no signed-out page dead-ends.

- **Given** a signed-out visitor on any public page, **When** the shell renders, **Then** a "Sign in"
  action is visible and authed-only nav is hidden or gate-routed.
- **Given** a guest clicks an authed-only nav item, **When** followed, **Then** they hit `/login`
  (or the combined step where appropriate), never a broken page.
