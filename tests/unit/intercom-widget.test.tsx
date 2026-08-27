import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { IntercomWidget } from "@/components/support/IntercomWidget";
import type { IntercomServerIdentity } from "@/lib/support/intercom";

/**
 * The messenger must never be handed an identity the workspace will refuse.
 *
 * The `w17eryax` workspace has identity verification switched ON for web. Verified by hand on
 * 2026-08-27: an anonymous boot renders, and every boot carrying an identity — `user_id`, or even a
 * bare `email` — is refused with a 403 on `/messenger/web/ping`, after which the frame reads
 * «Something's gone wrong — content could not be loaded» and the launcher is gone until a reload.
 *
 * So an unsigned identity is worth less than no identity at all, and these tests pin that: the
 * widget boots identified only once the server has answered with a `user_hash`, and it tears the
 * anonymous messenger down first, because a second `boot` over a live session does not promote it.
 */

const session = vi.hoisted(() => ({ value: { status: "loading" as string, user: null as unknown } }));
vi.mock("@/lib/session", () => ({ useSession: () => session.value }));
vi.mock("@/lib/i18n", () => ({ useLocale: () => ({ locale: "en", dir: "ltr" }) }));

const user = { id: 42, phone: "+966501234567", tier: "basic" };

const identity = (over: Partial<IntercomServerIdentity> = {}): IntercomServerIdentity => ({
  userId: "42",
  name: "Yara",
  email: "yara@moedatech.net",
  phone: "+966501234567",
  company: null,
  userHash: "a".repeat(64),
  verified: true,
  ...over,
});

/**
 * Every call the widget made, in order, as `[command, payload]` pairs.
 *
 * Read off the SNIPPET'S OWN QUEUE rather than a spy, because that is where a real cold start puts
 * them: `window.Intercom` starts undefined, the snippet installs a queueing stub, and the remote
 * script — which jsdom never fetches — would drain it on arrival. Pre-installing a function instead
 * would send `loadIntercom` down its reattach path and test a page that had already loaded once.
 */
const calls = () => (window.Intercom?.q ?? []) as unknown[][];
const commands = () => calls().map((c) => c[0]);
const lastPayload = () => calls()[calls().length - 1][1] as Record<string, unknown>;

beforeEach(() => {
  session.value = { status: "loading", user: null };
  delete (window as { Intercom?: unknown }).Intercom;
  document.head.innerHTML = "";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** The route answers `body`; render, then let the fetch settle. */
async function renderWith(body: IntercomServerIdentity | null, ok = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok, json: async () => body })),
  );
  const view = render(<IntercomWidget />);
  await waitFor(() => expect(calls().length).toBeGreaterThan(0));
  return view;
}

describe("booting before anyone is identified", () => {
  it("boots anonymous while the session is still resolving", async () => {
    await renderWith(null);
    expect(commands()).toEqual(["boot"]);
    expect(lastPayload()).not.toHaveProperty("user_id");
  });

  it("stays anonymous for a visitor who never signs in", async () => {
    session.value = { status: "anon", user: null };
    await renderWith(null);
    expect(commands()).toEqual(["boot"]);
    expect(lastPayload()).not.toHaveProperty("user_id");
  });
});

describe("an identity the workspace would refuse", () => {
  it("stays ANONYMOUS when the server has no signature to give", async () => {
    session.value = { status: "authed", user };
    await renderWith(identity({ userHash: null, verified: false }));
    // Nothing after the anonymous boot: no identified boot, signed or otherwise.
    await waitFor(() => expect(commands()).toEqual(["boot"]));
    expect(lastPayload()).not.toHaveProperty("user_id");
    expect(lastPayload()).not.toHaveProperty("email");
  });

  it("stays anonymous when the route fails outright", async () => {
    session.value = { status: "authed", user };
    await renderWith(null, false);
    await waitFor(() => expect(commands()).toEqual(["boot"]));
    expect(lastPayload()).not.toHaveProperty("user_id");
  });
});

describe("a signed identity", () => {
  it("shuts the anonymous messenger down before booting identified", async () => {
    session.value = { status: "authed", user };
    await renderWith(identity());
    await waitFor(() => expect(commands()).toEqual(["boot", "shutdown", "boot"]));
    const payload = lastPayload();
    expect(payload.user_id).toBe("42");
    expect(payload.user_hash).toBe("a".repeat(64));
  });
});
