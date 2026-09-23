import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AccountModal } from "@/components/onboarding/AccountModal";
import { LocaleProvider } from "@/lib/i18n";
import { SessionProvider } from "@/lib/session";
import { en } from "@/lib/i18n/en";

/**
 * **Sign in and create the account are ONE flow** (owner, 2026-09-06: *"the create account must be
 * directly after the sign in, like as one form, like in prod behaviour"* — asked as a check: does it
 * already do this?).
 *
 * The answer has to be a test rather than a reading, because the failure mode is invisible in the
 * code: every branch of `afterVerified` looks reasonable in isolation, and the bad outcome — the
 * modal closing on a verified code and leaving a half-made account behind — is one `onCreated()`
 * away in any of them. So this drives the real modal through the real steps with only the network
 * stubbed, and asserts on both halves: the account form appears, and nothing reported completion.
 */

const api = vi.hoisted(() => ({
  /** What `POST /api/auth/verify` answers. The three shapes that matter live in the tests below. */
  verify: {} as Record<string, unknown>,
  calls: [] as string[],
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {} }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

const created = vi.fn();

beforeEach(() => {
  created.mockReset();
  api.calls = [];
  api.verify = { user: { id: 7, phone: "+966501112233", tier: "guest" } };
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    api.calls.push(`${init?.method ?? "GET"} ${url}`);
    const body = url.includes("/api/auth/request-code")
      ? { ok: true }
      : url.includes("/api/auth/verify")
        ? api.verify
        : url.includes("/api/me")
          ? { user: { id: 7, phone: "+966501112233", tier: "guest" } }
          : {};
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  });
});
afterEach(cleanup);

const draw = () =>
  render(
    <LocaleProvider initialLocale="en">
      <SessionProvider initialUser={null}>
        <AccountModal open onClose={() => {}} onCreated={created} />
      </SessionProvider>
    </LocaleProvider>,
  );

/** Type a phone, ask for the code, then type the code — the two steps before the account form. */
const signIn = async () => {
  draw();
  // The phone step: one `tel` input and the «Send code» button.
  const phone = await screen.findByPlaceholderText("5X XXX XXXX");
  fireEvent.change(phone, { target: { value: "0501112233" } });
  fireEvent.click(screen.getByText(/Send code/).closest("button")!);

  // The code step: four boxes, filled one digit each, which submits on the last.
  await waitFor(() => expect(api.calls.some((c) => c.includes("/api/auth/request-code"))).toBe(true));
  const boxes = await waitFor(() => {
    const found = [...document.querySelectorAll<HTMLInputElement>("input[inputmode='numeric'], input[type='tel']")].filter(
      (i) => i.maxLength === 1,
    );
    if (found.length < 4) throw new Error(`code boxes not up yet (${found.length})`);
    return found;
  });
  for (const [i, box] of boxes.entries()) fireEvent.change(box, { target: { value: String(i + 1) } });
  const form = boxes[0].closest("form");
  if (form) fireEvent.submit(form);
};

describe("the code hands straight over to the account form", () => {
  it("does NOT close on a verified code for a new account", async () => {
    // `tier: "guest"` is a verified phone with no profile behind it — the case that must continue.
    await signIn();
    // The account form itself, in the SAME modal — the positive half of the claim.
    expect(await screen.findByText(en.onboarding.firstName)).toBeTruthy();
    // And the thing that would be wrong: reporting completion and closing on a verified code.
    expect(created).not.toHaveBeenCalled();
  });

  it("continues when the backend says the account has to be made (needsSignup)", async () => {
    api.verify = { needsSignup: true, onboardingToken: "tok-1", email: "bandar@zahid.sa" };
    await signIn();
    expect(await screen.findByText(en.onboarding.firstName)).toBeTruthy();
    expect(created).not.toHaveBeenCalled();
  });

  it("closes only for an account that is already complete", async () => {
    // A returning renter has nothing to fill in, so the flow ends where it used to.
    api.verify = { user: { id: 7, phone: "+966501112233", tier: "basic" } };
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      api.calls.push(`${init?.method ?? "GET"} ${url}`);
      const body = url.includes("/api/auth/verify")
        ? api.verify
        : url.includes("/api/me")
          ? { user: { id: 7, phone: "+966501112233", tier: "basic" } }
          : { ok: true };
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    });
    await signIn();
    await waitFor(() => expect(created).toHaveBeenCalled());
  });
});
