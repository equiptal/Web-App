import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isOffPlatformBidId } from "@/lib/contract/bid-equipment-access";

/**
 * **An off-platform bid carries no «Counter this price»** (owner, 2026-09-22, on a picture of one
 * that did: *"how offline bids has counter this pruce, remove"*).
 *
 * 🔴 **It was not merely wrong to offer — it could not work.** `openCounter` calls
 * `ensureDealRoom(card.id)`, and an off-platform card's id is `link-<submissionId>`: a
 * `LinkBidSubmission`, which is not a `Bid` row, so the call 404s and the `catch` swallows it. The
 * renter pressed a full-width orange bar and nothing happened, with no sign of why.
 *
 * Asserted against the SOURCE. The card pulls the workspace's fetches, a router and four modals, and
 * what is under test is a rule about which element exists — the kind of fault that throws nothing and
 * shows up only as a screenshot, which is exactly how this one was found.
 */

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
/** Comments first: the file EXPLAINS the bar it withheld, so a bare sweep fails on its own prose. */
const strip = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\/[^\n]*/g, "");

const CARD = strip(read("src/components/workspace/BidCards.tsx"));

describe("the id is what says off-platform", () => {
  it("Given a submission's id, Then it is recognised before any fetch", () => {
    /**
     * `submissionToBidCard` mints `link-<id>` and nothing else does. That prefix is not a heuristic:
     * it is the id of a DIFFERENT ENTITY in the same namespace, and it is the only off-platform
     * signal available before a fetch — which is why the guard can be applied at all.
     */
    expect(isOffPlatformBidId("link-9f2")).toBe(true);
    expect(isOffPlatformBidId("2261")).toBe(false);
  });
});

describe("the band", () => {
  it("Given an off-platform bid, Then no band is drawn at all", () => {
    /* ⚠️ Anchored on the BAND's own button, not on the bare guard: `{!offline && (` appears twice
       in this file (a header chip takes the same condition), so a `toContain` on it alone stayed
       GREEN with the band's guard removed — found by break-checking, which is the whole point of
       doing it. */
    expect(CARD).toMatch(
      /\{!offline && \(\s*<button\s+type="button"\s+onClick=\{\(e\) => \{ e\.stopPropagation\(\); if \(!bandDead\) void openCounter\(\); \}\}/,
    );
  });

  it("Given the band, Then it is WITHHELD rather than drawn dead", () => {
    /**
     * `bandDead` is the terminal state of a LIVE negotiation («Deal closed»), and a grey bar saying
     * that over an offer nobody ever negotiated would be a claim about a conversation that never
     * happened.
     */
    const band = CARD.slice(CARD.indexOf("{!offline && ("), CARD.indexOf("{termsOpen && ("));
    expect(band.length).toBeGreaterThan(200); // positive control on the slice
    expect(band).toContain("openCounter()");
    expect(band).not.toMatch(/offline \?[^\n]*bandDead/);
  });
});

describe("the act refuses too", () => {
  it("Given `openCounter`, Then an off-platform bid returns before it touches the network", () => {
    /**
     * ⚠️ **Two enforcement points that must agree**, the argument `bid-equipment-access.ts` makes for
     * the same shape: an entry point is not a boundary. The terms modal reaches this function as
     * well, and a later caller would otherwise inherit a call that 404s in silence.
     */
    /* ⚠️ Searched FROM the function, not from the top: `ensureDealRoom` matches its own import
       first, so an `indexOf` over the whole file sliced backwards and gave an empty string — the
       positive control below is what caught it, which is the argument for having one. */
    const at = CARD.indexOf("const openCounter = async");
    const fn = CARD.slice(at, CARD.indexOf("ensureDealRoom", at));
    expect(at).toBeGreaterThan(0);
    expect(fn.length).toBeGreaterThan(40); // positive control on the slice
    expect(fn).toContain("if (offline) return;");
  });
});

describe("what the off-platform card keeps", () => {
  it("Given the terms modal, Then its act is the QUOTE, never a counter", () => {
    // He has no account and no room; what a renter can do with his offer is read it.
    expect(CARD).toContain("negotiateLabel={offline ? t.workspace.viewQuote : t.priceFooter.counterPrice}");
    expect(CARD).toContain("if (offline) setSubOpen(true);");
  });

  it("Given the card, Then «Invite to Moedatech» survives", () => {
    /**
     * It is the route by which this supplier could one day be countered at all, so removing the band
     * must not take the way ONTO the platform with it.
     */
    expect(CARD).toMatch(/inviteToMoedatech|inviteSupplier|workspace\.invite/);
  });
});
