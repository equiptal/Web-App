import { describe, it, expect } from "vitest";
import { buildIntercomPayload, intercomEmail, intercomName, INTERCOM_APP_ID } from "@/lib/support/intercom";

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
      app_version: "1.4.0",
    });
  });

  it("is always a rentee — there is no supplier surface on the web to be anything else", () => {
    const guest = buildIntercomPayload({ user: { ...user, tier: "guest" }, locale: "en", appVersion: "1.0.0" });
    expect(guest.user_type).toBe("rentee");
    expect(guest.tier).toBe("guest");
  });

  it("takes a richer name and email when a caller has them", () => {
    const rich = buildIntercomPayload({ user, locale: "en", appVersion: "1.0.0", name: "Yara F", email: "yara@moedatech.net" });
    expect(rich.name).toBe("Yara F");
    expect(rich.email).toBe("yara@moedatech.net");
  });
});

describe("INTERCOM_APP_ID", () => {
  it("defaults to the workspace the mobile app already uses", () => {
    // Both clients must reach ONE inbox, or a reply lands in a workspace nobody is watching.
    expect(INTERCOM_APP_ID).toBe("w17eryax");
  });
});
