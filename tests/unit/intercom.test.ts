import { describe, it, expect } from "vitest";
import {
  buildIntercomPayload,
  intercomEmail,
  intercomName,
  INTERCOM_APP_ID,
  noteSupportError,
  recentSupportError,
} from "@/lib/support/intercom";
import { chatContext } from "@/components/support/IntercomWidget";

/**
 * Parity with the app's `buildIntercomUserPayload` (`intercom_service.dart`).
 *
 * The backend's `conversation.admin.replied` webhook resolves a recipient by mapping Intercom's
 * `user.user_id` back to a `User` row. If the web sent anything else there — an email, a cuid, a
 * string id with a prefix — a support agent's reply would reach nobody, silently. Everything below
 * exists to keep the two clients describing one person the same way.
 */

describe("intercomEmail", () => {
  it("prefers the real address — the one the user actually owns", () => {
    expect(intercomEmail("+966 50 123 4567", "yara@moedatech.net")).toBe("yara@moedatech.net");
  });

  it("derives one from the phone when there is none, digits only, as the app does", () => {
    expect(intercomEmail("+966 50 123 4567")).toBe("966501234567@moedatech.app");
    expect(intercomEmail("+966501234567", "   ")).toBe("966501234567@moedatech.app");
  });

  it("answers null rather than an empty string, which Intercom would store as a value", () => {
    expect(intercomEmail("")).toBeNull();
    expect(intercomEmail(null)).toBeNull();
    expect(intercomEmail(undefined, null)).toBeNull();
  });
});

describe("intercomName", () => {
  it("uses the given name, trimmed", () => {
    expect(intercomName(42, "  Yara  ")).toBe("Yara");
  });

  it("falls back to the app's own «User <id>» rather than leaving it blank", () => {
    expect(intercomName(42)).toBe("User 42");
    expect(intercomName(42, "   ")).toBe("User 42");
    expect(intercomName(42, null)).toBe("User 42");
  });
});

describe("buildIntercomPayload", () => {
  const user = { id: 42, phone: "+966501234567", tier: "verified" as const };
  const payload = buildIntercomPayload({ user, locale: "ar", appVersion: "1.4.0" });

  it("sends the DATABASE id as user_id, as a string — what the webhook maps back", () => {
    expect(payload.user_id).toBe("42");
  });

  it("carries every field a support agent reads, at the TOP level", () => {
    // Nested under `customAttributes` (the mobile SDK's shape) they would file under one unusable key.
    expect(payload).toMatchObject({
      name: "User 42",
      email: "966501234567@moedatech.app",
      phone: "+966501234567",
      user_type: "rentee",
      tier: "verified",
      locale: "ar",
      device_os: "web",
      platform: "web-rentee",
      app_version: "1.4.0",
    });
  });

  it("is always a rentee — there is no supplier surface on the web to be anything else", () => {
    const guest = buildIntercomPayload({ user: { ...user, tier: "guest" }, locale: "en", appVersion: "1.0.0" });
    expect(guest.user_type).toBe("rentee");
    expect(guest.tier).toBe("guest");
  });

  it("carries the support context the server answered (Intercom context ticket)", () => {
    const full = buildIntercomPayload({
      user,
      locale: "en",
      appVersion: "1.0.0",
      server: {
        userId: "42", name: "Yara F", email: null, phone: "+966501234567", company: "Acme",
        companyId: "c0ffee00-0000-4000-8000-000000000001", companyRole: "owner", companyCreatedAt: 1735689600,
        registeredAt: 1767225600, testAccount: false,
        requests: { total: 7, open: 2, last: { id: "req-1", status: "ACCEPTED", offers: 3, notified: 12 } },
        userHash: null, verified: false,
      },
    });
    expect(full).toMatchObject({
      side: "rentee",
      is_guest: false,
      test_account: false,
      company_id: "c0ffee00-0000-4000-8000-000000000001",
      company_role: "owner",
      registered_at: 1767225600,
      requests_total: 7,
      requests_open: 2,
      last_request_id: "req-1",
      last_request_status: "ACCEPTED",
      last_request_offers: 3,
      last_request_notified: 12,
      company: { company_id: "c0ffee00-0000-4000-8000-000000000001", name: "Acme", created_at: 1735689600 },
    });
  });

  it("omits last_request_notified on a backend that does not send it, rather than reading it as 0", () => {
    const p = buildIntercomPayload({
      user, locale: "en", appVersion: "1.0.0",
      server: {
        userId: "42", name: null, email: null, phone: null, company: null, companyId: null, companyRole: null,
        companyCreatedAt: null, registeredAt: null, testAccount: null,
        requests: { total: 1, open: 1, last: { id: "req-1", status: "OPEN", offers: 0, notified: null } },
        userHash: null, verified: false,
      },
    });
    expect(p).toHaveProperty("last_request_offers", 0);
    expect(p).not.toHaveProperty("last_request_notified");
    expect(p).not.toHaveProperty("test_account");
  });

  it("OMITS what the server could not answer, rather than sending null or zero", () => {
    for (const k of ["company_id", "company_role", "company", "registered_at", "requests_total", "requests_open", "last_request_id"]) {
      expect(payload).not.toHaveProperty(k);
    }
    const none = buildIntercomPayload({
      user, locale: "en", appVersion: "1.0.0",
      server: {
        userId: "42", name: null, email: null, phone: null, company: null, companyId: null, companyRole: null,
        companyCreatedAt: null, registeredAt: null, testAccount: null,
        requests: { total: 0, open: 0, last: null }, userHash: null, verified: false,
      },
    });
    // No requests at all IS a fact worth sending; a last request that does not exist is not.
    expect(none).toMatchObject({ requests_total: 0, requests_open: 0 });
    expect(none).not.toHaveProperty("last_request_id");
  });

  it("takes a richer name and email when a caller has them", () => {
    const rich = buildIntercomPayload({ user, locale: "en", appVersion: "1.0.0", name: "Yara F", email: "yara@moedatech.net" });
    expect(rich.name).toBe("Yara F");
    expect(rich.email).toBe("yara@moedatech.net");
  });
});

describe("chatContext", () => {
  it("names the request open in the workspace", () => {
    expect(chatContext("/requests", "?r=cm1abc&g=x")).toEqual({ last_screen: "/requests", last_object_type: "request", last_object_id: "cm1abc", last_error: null });
  });

  it("names the bid, the equipment and the store from their routes", () => {
    expect(chatContext("/bids/b-9/equipment", "")).toMatchObject({ last_object_type: "bid", last_object_id: "b-9" });
    expect(chatContext("/equipment/e-4", "")).toMatchObject({ last_object_type: "equipment", last_object_id: "e-4" });
    expect(chatContext("/stores/s-2", "")).toMatchObject({ last_object_type: "store", last_object_id: "s-2" });
  });

  it("says none, and clears the id, on a screen with no object", () => {
    expect(chatContext("/requests", "")).toEqual({ last_screen: "/requests", last_object_type: "none", last_object_id: null, last_error: null });
    expect(chatContext("/deal-room/d-1", "")).toMatchObject({ last_screen: "/deal-room/d-1", last_object_type: "none" });
  });
});

describe("INTERCOM_APP_ID", () => {
  it("defaults to the workspace the mobile app already uses", () => {
    // Both clients must reach ONE inbox, or a reply lands in a workspace nobody is watching.
    expect(INTERCOM_APP_ID).toBe("w17eryax");
  });
});

/**
 * Identity verification — the server's half.
 *
 * A messenger booted with a bare `user_id` accepts whatever id the page hands it, which is the hole
 * the hash closes. So the signature is computed on the server, over the id the BACKEND reported, and
 * the browser never sees the secret. These pin the payload's side of that contract.
 */
describe("buildIntercomPayload with the server's identity", () => {
  const user = { id: 42, phone: "+966501234567", tier: "verified" as const };
  const server = {
    userId: "42",
    name: "Yara F",
    email: "yara@moedatech.net",
    phone: "+966501234567",
    company: "Al-Faisal Contracting Est.",
    companyId: null,
    companyRole: null,
    companyCreatedAt: null,
    registeredAt: null,
    testAccount: null,
    requests: null,
    userHash: "a".repeat(64),
    verified: true,
  };

  it("prefers the server's name, email and company over the session's fallbacks", () => {
    const p = buildIntercomPayload({ user, locale: "en", appVersion: "1.0.0", server });
    expect(p.name).toBe("Yara F");
    expect(p.email).toBe("yara@moedatech.net");
    expect(p.company_name).toBe("Al-Faisal Contracting Est.");
  });

  it("sends the signature when the workspace has one configured", () => {
    const p = buildIntercomPayload({ user, locale: "en", appVersion: "1.0.0", server });
    expect(p.user_hash).toBe("a".repeat(64));
  });

  /**
   * The key must be ABSENT, not null.
   *
   * Intercom reads its presence: a `user_hash: null` is a FAILED signature rather than an unsigned
   * boot, and it would be refused on a workspace that is not even asking for verification — which is
   * the workspace mobile runs against today.
   */
  it("omits the key entirely when there is no secret, rather than sending null", () => {
    const p = buildIntercomPayload({
      user,
      locale: "en",
      appVersion: "1.0.0",
      server: { ...server, userHash: null, verified: false },
    });
    expect("user_hash" in p).toBe(false);
  });

  it("omits company_name rather than sending an empty one", () => {
    const p = buildIntercomPayload({ user, locale: "en", appVersion: "1.0.0", server: { ...server, company: null } });
    expect("company_name" in p).toBe(false);
  });

  it("still addresses the person the webhook can resolve", () => {
    // The server signs the id it reports, so signed and unsigned boots name the same user.
    const p = buildIntercomPayload({ user, locale: "en", appVersion: "1.0.0", server });
    expect(p.user_id).toBe(server.userId);
    expect(p.user_id).toBe(String(user.id));
  });

  it("falls back to the session alone when the route answered nothing", () => {
    const p = buildIntercomPayload({ user, locale: "en", appVersion: "1.0.0", server: null });
    expect(p.user_id).toBe("42");
    expect(p.name).toBe("User 42");
    expect(p.email).toBe("966501234567@moedatech.app");
    expect("user_hash" in p).toBe(false);
  });
});

describe("last_error", () => {
  it("carries a refusal for one minute, then lets it go", () => {
    noteSupportError("post_request: E8009", 1_000);
    expect(recentSupportError(1_000 + 59_000)).toBe("post_request: E8009");
    expect(recentSupportError(1_000 + 61_000)).toBeNull();
  });
});
