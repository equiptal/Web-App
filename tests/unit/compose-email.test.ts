import { describe, it, expect } from "vitest";
import { COMPOSE_URL_MAX, composeEmailUrl } from "@/lib/composeEmail";

/**
 * Opening a message without depending on a mail app being set up.
 *
 * `mailto:` hands the message to whatever the OS calls the default mail client. On a machine where
 * nobody has configured one, pressing it does nothing at all — the renter watches Send do nothing and
 * concludes the feature is broken (owner, 2026-09-02). Outlook on the web needs no client and no
 * install.
 */
describe("composeEmailUrl", () => {
  it("Given several recipients, Then they go in BCC — never in To", () => {
    // Forty suppliers in a To line tells each of them exactly who else was asked, which is the
    // renter's commercial business and nobody else's.
    const url = composeEmailUrl({ bcc: ["a@x.sa", "b@y.sa"], subject: "Request", body: "Hello" })!;

    expect(url.startsWith("https://outlook.office.com/mail/deeplink/compose?")).toBe(true);
    const q = new URL(url).searchParams;
    expect(q.get("bcc")).toBe("a@x.sa;b@y.sa");
    expect(q.get("to")).toBeNull();
  });

  it("Given one named recipient, Then it goes in To — an invitation is addressed to a person", () => {
    const q = new URL(composeEmailUrl({ to: ["bids@zahid.sa"], subject: "Join" })!).searchParams;
    expect(q.get("to")).toBe("bids@zahid.sa");
    expect(q.get("bcc")).toBeNull();
  });

  it("Given the subject and body, Then both survive the round trip intact", () => {
    const body = "EXC-170845: Tower light 9m ×6\nRiyadh · 1 month\n\nhttps://web.moedatech.net/bid/abc";
    const q = new URL(composeEmailUrl({ bcc: ["a@x.sa"], subject: "A new request · EXC-170845", body })!).searchParams;

    expect(q.get("subject")).toBe("A new request · EXC-170845");
    expect(q.get("body")).toBe(body);
  });

  it("Given a body too long for a URL, Then it answers null rather than truncating", () => {
    /**
     * A truncated body loses its TAIL, and the tail is where the link is — so the supplier would
     * receive an invitation to bid with nothing to bid on. Null lets the caller offer the fallback
     * it has instead of opening a window carrying half a message.
     */
    const url = composeEmailUrl({ bcc: ["a@x.sa"], body: "x".repeat(COMPOSE_URL_MAX) });
    expect(url).toBeNull();
  });

  it("Given nothing at all, Then it is still a valid compose window", () => {
    expect(composeEmailUrl({})).toContain("outlook.office.com");
  });
});
