import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntercomWidget } from "@/components/support/IntercomWidget";
import type { IntercomServerIdentity } from "@/lib/support/intercom";

/**
 * The messenger identifies a renter the way the mobile app does, and survives a workspace that says no.
 *
 * The app calls `loginIdentifiedUser` with no hash, so the web boots identified whether or not it has
 * a signature — one client must not describe a person differently from the other.
 *
 * A workspace CAN refuse that, and `w17eryax` did on 2026-08-27, with identity verification switched
 * on for web: an anonymous boot rendered, and every boot carrying an identity — `user_id`, or even a
 * bare `email` — came back 403 on `/messenger/web/ping`, after which the frame read «Something's
 * gone wrong — content could not be loaded». Nothing here can detect that (no callback fires, and a
 * refused boot leaves the same two nodes an unopened healthy one does), so it is a dashboard setting
 * and `.env.example` records which way it has to be set. These tests pin what the widget sends.
 */

const session = vi.hoisted(() => ({ value: { status: "loading" as string, user: null as unknown } }));
vi.mock("@/lib/session", () => ({ useSession: () => session.value }));
const locale = vi.hoisted(() => ({ value: { locale: "en", dir: "ltr" } }));
vi.mock("@/lib/i18n", () => ({ useLocale: () => locale.value }));

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

/**
 * The BOOT-LIFECYCLE calls only — `boot`, `shutdown`, `update`.
 *
 * The widget also registers `onUnreadCountChange`, which is a subscription rather than a step in the
 * lifecycle. Asserting on the raw list would tie every sequencing test below to where in the mount
 * that subscription happens, which is not what any of them is about.
 */
const LIFECYCLE = new Set(["boot", "shutdown", "update"]);
const lifecycle = () => commands().filter((c) => LIFECYCLE.has(c as string));

/** The payload of the last lifecycle call — the one describing the messenger as it now stands. */
const lastPayload = () => {
  const last = calls().filter((c) => LIFECYCLE.has(c[0] as string)).pop();
  return (last?.[1] ?? {}) as Record<string, unknown>;
};

beforeEach(() => {
  session.value = { status: "loading", user: null };
  locale.value = { locale: "en", dir: "ltr" };
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
    expect(lifecycle()).toEqual(["boot"]);
    expect(lastPayload()).not.toHaveProperty("user_id");
  });

  it("stays anonymous for a visitor who never signs in", async () => {
    session.value = { status: "anon", user: null };
    await renderWith(null);
    expect(lifecycle()).toEqual(["boot"]);
    expect(lastPayload()).not.toHaveProperty("user_id");
  });
});

describe("identifying a renter", () => {
  it("shuts the anonymous messenger down before booting identified", async () => {
    session.value = { status: "authed", user };
    await renderWith(identity());
    // A second `boot` over a live anonymous session does not promote it — it kills it.
    await waitFor(() => expect(lifecycle()).toEqual(["boot", "shutdown", "boot"]));
    const payload = lastPayload();
    expect(payload.user_id).toBe("42");
    expect(payload.user_hash).toBe("a".repeat(64));
  });

  it("boots identified WITHOUT a signature, as the mobile app does", async () => {
    session.value = { status: "authed", user };
    await renderWith(identity({ userHash: null, verified: false }));
    await waitFor(() => expect(lifecycle()).toEqual(["boot", "shutdown", "boot"]));
    const payload = lastPayload();
    expect(payload.user_id).toBe("42");
    // Omitted, never null: Intercom reads the key's PRESENCE, so a null reads as a failed signature.
    expect(payload).not.toHaveProperty("user_hash");
  });

  it("stays anonymous when the route fails outright — there is no identity to send", async () => {
    session.value = { status: "authed", user };
    await renderWith(null, false);
    await waitFor(() => expect(lifecycle()).toEqual(["boot"]));
    expect(lastPayload()).not.toHaveProperty("user_id");
  });
});


/**
 * The launcher is the app's bubble, not Intercom's.
 *
 * A renter who has used the app knows this control as an orange circle with a chat glyph in it;
 * Intercom's own is a blue circle carrying Intercom's mark. Hiding theirs and drawing ours is the
 * only way the two clients offer the same thing.
 */
describe("the launcher", () => {
  it("hides Intercom's own, so there is never a second one", async () => {
    await renderWith(null);
    expect(lastPayload().hide_default_launcher).toBe(true);
  });

  it("opens the messenger when pressed", async () => {
    const { getByRole } = await renderWith(null);
    await userEvent.click(getByRole("button", { name: "Support" }));
    expect(commands()).toContain("show");
  });

  it("follows the writing direction, as every other floating control does", async () => {
    locale.value = { locale: "ar", dir: "rtl" };
    const { getByRole } = await renderWith(null);
    expect(getByRole("button", { name: "الدعم" })).toBeTruthy();
  });

  /**
   * The bubble and the panel it opens must sit on the SAME side.
   *
   * `LocaleProvider` starts on the default locale and restores the stored one in a mount effect, so
   * the first boot always happens under a language the renter may not be reading. The anonymous
   * branch used to key its cache on the bare string "anon", which named neither the locale nor the
   * direction — so the flip that followed was compared, matched, and dropped. An Arabic renter got a
   * launcher bottom-left and a messenger bottom-right (owner, 2026-08-29).
   */
  it("moves the messenger when the language changes under an anonymous visitor", async () => {
    session.value = { status: "anon", user: null };
    const { rerender } = await renderWith(null);
    expect(lastPayload().alignment).toBe("right");
    expect(lastPayload().language_override).toBe("en");

    locale.value = { locale: "ar", dir: "rtl" };
    rerender(<IntercomWidget />);

    await waitFor(() => expect(lastPayload().alignment).toBe("left"));
    expect(lastPayload().language_override).toBe("ar");
    // `update`, not a second `boot`: it is the same anonymous conversation in a new language, and
    // re-booting would restart the session and lose the unread count with it.
    expect(lifecycle()).toEqual(["boot", "update"]);
  });

  /**
   * The unread badge needs its subscription to actually be registered.
   *
   * It used to be registered inside the launcher, and React runs a child's effects BEFORE its
   * parent's — so it ran before the snippet had installed its queueing stub, found no
   * `window.Intercom`, and on an empty dependency array never tried again. The badge could not
   * count, ever (owner, 2026-08-29).
   */
  it("subscribes to the unread count", async () => {
    await renderWith(null);
    expect(commands()).toContain("onUnreadCountChange");
  });
});
