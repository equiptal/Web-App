import { describe, expect, it, afterEach, vi, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import type { RenterProfile } from "@/lib/contract/onboarding";

/**
 * ── Which endpoint a profile save goes to, and why the TIER cannot decide it ────────────────────
 *
 * Owner, 2026-09-13, on `+966566493886` stuck behind «أكمل ملفك الشخصي لنشر الطلبات» while his badge
 * read basic: *"is having this issue on beta despite he is basic so what??"*
 *
 * 🔴 **The backend holds TWO facts here and they can disagree.**
 *  · `getUserTier` (`apps/backend/src/services/profile.service.ts`) answers `basic` off
 *    `firstName && lastName && city && jobTitle` — it never reads the flag below.
 *  · `createRequest` (`apps/backend-agents/.../createRequest.ts`) refuses with
 *    `GUEST_CANNOT_POST_REQUESTS` / E10001 on `!owner.hasCompletedOnboarding` — it never reads the
 *    tier.
 *
 * Only `completeProfile` (`PUT /users/me/profile`) sets that flag; `updateProfile`
 * (`PUT /profile/me`) does not. So a renter whose four identity fields were filled some other way
 * reads as basic, is sent to the EDIT endpoint by this form, and can never clear the thing blocking
 * him — basic enough to be denied the fix, not onboarded enough to post.
 *
 * ⚠️ This is the SAME ACCOUNT as the 2026-09-10 fix, caught by the other half of the same trap.
 * That fix keyed on the tier, which was right for a guest and silently wrong for him.
 */
const SRC = readFileSync("src/components/profile/EditProfileForm.tsx", "utf8");
const ROUTE = readFileSync("src/app/api/me/route.ts", "utf8");

const calls = vi.hoisted(() => ({ complete: 0, update: 0 }));
vi.mock("@/lib/api/profile-client", () => ({
  completeProfile: async () => {
    calls.complete += 1;
    return { ok: true as const };
  },
  updateProfile: async () => {
    calls.update += 1;
    return { ok: true as const };
  },
}));

const session = vi.hoisted(() => ({ tier: "basic" as string }));
vi.mock("@/lib/session", () => ({
  useSession: () => ({ tier: session.tier, refresh: async () => {}, status: "authed", user: { id: 1 } }),
}));
vi.mock("@/lib/api/client", () => ({ fetchCities: async () => [], fetchJobTitles: async () => [] }));

const PROFILE = (over: Partial<RenterProfile> = {}): RenterProfile => ({
  id: 3581,
  phone: "+966566493886",
  tier: "basic",
  firstName: "Mohammed",
  lastName: "Noor",
  /* ⚠️ Named, because a FIRST save now requires it (app parity, 2026-09-21 — see the case at the
     foot of this file). These cases are about which ENDPOINT is called, so the fixture carries a
     company the way a renter completing his profile does; the refusal has its own case. */
  companyName: "Al Ghadeer Est.",
  city: "Riyadh",
  jobTitle: "Manager",
  email: "m@example.com",
  whatsapp: null,
  ...over,
});

beforeEach(() => {
  calls.complete = 0;
  calls.update = 0;
  session.tier = "basic";
});
afterEach(cleanup);

async function save(profile: RenterProfile) {
  const { EditProfileForm } = await import("@/components/profile/EditProfileForm");
  const { LocaleProvider } = await import("@/lib/i18n");
  render(
    <LocaleProvider initialLocale="en">
      <EditProfileForm profile={profile} onSaved={() => {}} onCancel={() => {}} />
    </LocaleProvider>,
  );
  const form = document.querySelector("form")!;
  fireEvent.submit(form);
}

describe("the endpoint follows the FLAG, not the badge", () => {
  it("Given basic but onboarding NOT complete, Then the first-save endpoint is used", async () => {
    /**
     * The stranded case. `updateProfile` would 200 and change nothing that matters: it does not
     * write `hasCompletedOnboarding`, so the next request submit is refused exactly as before.
     */
    await save(PROFILE({ hasCompletedOnboarding: false }));
    await waitFor(() => expect(calls.complete).toBe(1));
    expect(calls.update).toBe(0);
  });

  it("Given an ordinary complete account, Then it is an EDIT", async () => {
    await save(PROFILE({ hasCompletedOnboarding: true }));
    await waitFor(() => expect(calls.update).toBe(1));
    expect(calls.complete).toBe(0);
  });

  it("Given a backend that does not send the flag, Then it is an EDIT", async () => {
    /**
     * ⚠️ `undefined` is «we were not told», not «false». The complete account is the ordinary one by
     * far, and guessing the other way would push every healthy renter through the first-save
     * endpoint on a backend that simply predates the field.
     */
    await save(PROFILE());
    await waitFor(() => expect(calls.update).toBe(1));
    expect(calls.complete).toBe(0);
  });

  it("Given a GUEST, Then the 2026-09-10 fix still holds", async () => {
    // He cannot have completed onboarding, so both readings agree — but the tier arm is what
    // answers, and removing it would rely on the backend having sent the flag.
    session.tier = "guest";
    await save(PROFILE({ tier: "guest", hasCompletedOnboarding: undefined }));
    await waitFor(() => expect(calls.complete).toBe(1));
    expect(calls.update).toBe(0);
  });
});

describe("the flag reaches the form at all", () => {
  it("`/api/me` passes it through, `undefined` and all", () => {
    // Defaulting it in the BFF would erase the difference the form depends on.
    expect(ROUTE).toMatch(/hasCompletedOnboarding: me\.hasCompletedOnboarding,/);
    expect(ROUTE).not.toMatch(/hasCompletedOnboarding:[^,]*\?\?/);
  });

  it("the form reads BOTH facts, and tests the flag against `false` exactly", () => {
    expect(SRC).toMatch(/tier === "guest" \|\| profile\.hasCompletedOnboarding === false/);
  });
});

describe("the company name, on the pass that is asked for it", () => {
  /**
   * 🔴 **REQUIRED on a first save, and the app's own split.** `profile_form_page`'s
   * `_companyNameIsValid` is `!_isComplete || length >= 2`: the complete pass refuses a blank, an
   * edit does not. Since 2026-09-21 `profile.companyName` is the FOURTH rung of the one naming rule
   * (`counterparty-name.ts`), so a renter who completes without it is listed among firms under his
   * own personal name.
   *
   * ⚠️ Required on the FORM, never in the database: nothing backfills, so the accounts that
   * predate the rule keep working and are asked the next time they open this form.
   */
  it("Given a FIRST save with no company, Then it is refused and neither endpoint is called", async () => {
    await save(PROFILE({ hasCompletedOnboarding: false, companyName: null }));
    await waitFor(() => expect(screen.getByText("Enter your company name.")).toBeTruthy());
    expect(calls.complete).toBe(0);
    expect(calls.update).toBe(0);
  });

  it("Given an ordinary EDIT with no company, Then it saves", async () => {
    // He came here to change his phone; a field that was optional the day he signed up must not
    // block him. This is the half of the app's rule that is easy to lose.
    await save(PROFILE({ hasCompletedOnboarding: true, companyName: null }));
    await waitFor(() => expect(calls.update).toBe(1));
    expect(calls.complete).toBe(0);
  });
});
