import { describe, it, expect, vi, beforeEach } from "vitest";
import { shareRequestEmail } from "@/lib/api/client";

/**
 * SUP-BE-23 — the client half of *we send it, not his compose window*.
 *
 * Everything else in the share feature opens the renter's own webmail with a URL, and a query string
 * is characters with no MIME type: that one fact is why Gmail can never build a card from the body
 * and why Outlook silently discards `bcc`. This call is the cure, and its contract has one rule
 * above all the others — **it always answers a decision, never an exception.** The panel is inside a
 * click that has already POSTED the request; a throw here would leave a live request with no share
 * and no window, and the renter watching nothing happen.
 */

const calls: Array<{ url: string; body: unknown }> = [];

const stub = (status: number, body: unknown) =>
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });
    return { ok: status < 400, status, json: async () => body };
  });

const MSG = { subject: "RFQ for Crawler Excavator 30 ton", html: "<p>hi</p>", text: "hi" };

beforeEach(() => {
  calls.length = 0;
  vi.unstubAllGlobals();
});

describe("shareRequestEmail", () => {
  it("Given a verified domain, Then it reports the send and who it went to", async () => {
    stub(200, { sent: true, from: "bandar@shibhaljazira.com", messageId: "0100-abc", recipients: 4 });

    const out = await shareRequestEmail("req-1", ["a", "b", "c", "d"], MSG);

    expect(out).toEqual({ sent: true, from: "bandar@shibhaljazira.com", recipients: 4, messageId: "0100-abc", skipped: 0 });
    expect(calls[0].url).toBe("/api/requests/req-1/share-email");
  });

  it("Given picked suppliers, Then only their ROW IDS are sent — never their addresses", async () => {
    /**
     * 🔴 Once a renter's domain is verified this endpoint can put a real company's address in a
     * `From` line. A caller-supplied recipient list would therefore be an open relay signed with
     * that company's DKIM, so the backend derives the addresses from the rows the renter owns and
     * a supplier they never added cannot be written to at all.
     */
    stub(200, { sent: true, from: "b@x.sa", messageId: "m", recipients: 2 });
    await shareRequestEmail("req-1", ["row-1", "row-2"], MSG);

    const body = calls[0].body as Record<string, unknown>;
    expect(body.renterSupplierIds).toEqual(["row-1", "row-2"]);
    expect(body.bcc).toBeUndefined();
    expect(body.to).toBeUndefined();
    // The card and its plain-text twin both travel: an HTML part is the entire reason for the call.
    expect(body.html).toBe("<p>hi</p>");
    expect(body.text).toBe("hi");
  });

  it("Given an unverified domain, Then the RECORDS come back so his IT can add them", async () => {
    stub(200, {
      sent: false,
      reason: "DOMAIN_NOT_VERIFIED",
      from: "bandar@shibhaljazira.com",
      domain: "shibhaljazira.com",
      dns: [
        { type: "CNAME", name: "abc._domainkey.shibhaljazira.com", value: "abc.dkim.amazonses.com" },
        { type: "TXT", name: "_amazonses.shibhaljazira.com", value: "tok" },
      ],
    });

    const out = await shareRequestEmail("req-1", ["a"], MSG);

    expect(out.sent).toBe(false);
    if (out.sent) throw new Error("unreachable");
    expect(out.reason).toBe("DOMAIN_NOT_VERIFIED");
    expect(out.domain).toBe("shibhaljazira.com");
    expect(out.dns).toHaveLength(2);
  });

  it("Given a personal address, Then it is its OWN reason, not «not verified»", async () => {
    /**
     * ⚠️ The difference is the whole reason the renter is told anything. Nobody can add a DNS
     * record to `gmail.com`, so folding this into `DOMAIN_NOT_VERIFIED` would show him a list of
     * records to forward to IT and send him on an errand with no end.
     */
    stub(200, { sent: false, reason: "PERSONAL_DOMAIN", from: "bandar@gmail.com", domain: "gmail.com", dns: [] });

    const out = await shareRequestEmail("req-1", ["a"], MSG);
    expect(out.sent).toBe(false);
    if (out.sent) throw new Error("unreachable");
    expect(out.reason).toBe("PERSONAL_DOMAIN");
    expect(out.dns).toEqual([]);
  });

  it("Given the call fails, Then it REFUSES rather than throws — the window still opens", async () => {
    stub(502, { code: "upstream_unreachable" });

    const out = await shareRequestEmail("req-1", ["a"], MSG);
    expect(out.sent).toBe(false);
    if (out.sent) throw new Error("unreachable");
    expect(out.reason).toBe("UNAVAILABLE");
  });

  it("Given the network is down, Then the same — a refusal we could not reach is still a refusal", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("offline");
    });

    const out = await shareRequestEmail("req-1", ["a"], MSG);
    expect(out.sent).toBe(false);
  });

  it("Given nobody was picked, Then no call is made at all", async () => {
    // A share with no recipients is legitimate — the renter wants the message in his own window to
    // address himself. There is nothing for a mail server to do with it.
    stub(200, { sent: true, from: "b@x.sa", messageId: "m", recipients: 0 });

    const out = await shareRequestEmail("req-1", [], MSG);
    expect(out.sent).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("Given a reason we do not recognise, Then it degrades to UNAVAILABLE, never to «sent»", async () => {
    // A new backend reason must fall back to the compose window, not silently claim a send.
    stub(200, { sent: false, reason: "SOMETHING_NEW", dns: [] });

    const out = await shareRequestEmail("req-1", ["a"], MSG);
    expect(out.sent).toBe(false);
    if (out.sent) throw new Error("unreachable");
    expect(out.reason).toBe("UNAVAILABLE");
  });

  it("Given a malformed DNS row, Then it is dropped rather than drawn as a blank record", async () => {
    // IT copies these into a DNS panel by hand. A row with no value is worse than no row.
    stub(200, {
      sent: false,
      reason: "DOMAIN_NOT_VERIFIED",
      domain: "x.sa",
      dns: [{ type: "CNAME", name: "a", value: "b" }, { type: "MX", name: "c", value: "d" }, { name: "e" }],
    });

    const out = await shareRequestEmail("req-1", ["a"], MSG);
    if (out.sent) throw new Error("unreachable");
    expect(out.dns).toEqual([{ type: "CNAME", name: "a", value: "b" }]);
  });

  it("Given some picks had no address, Then the count of the left-out is kept", async () => {
    stub(200, { sent: true, from: "b@x.sa", messageId: "m", recipients: 3, skipped: 2 });

    const out = await shareRequestEmail("req-1", ["a", "b", "c", "d", "e"], MSG);
    if (!out.sent) throw new Error("unreachable");
    expect(out.recipients).toBe(3);
    expect(out.skipped).toBe(2);
  });
});
