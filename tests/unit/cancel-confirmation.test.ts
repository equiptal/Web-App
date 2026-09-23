import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { statusMeta, groupBiddingClosed } from "@/lib/contract/requests";

/**
 * Cancelling a request says so, and the request says so afterwards.
 *
 * Owner, 2026-09-17: *"if a request is cancelled add the closed lable to it and show confimration on
 * cancellation with concaclled successfuly note"*.
 *
 * ⚠️ Read from the SOURCE. Both callers pull a drawer, a table, the rfq store and four API calls,
 * and what is under test is a set of rulings — that the dialog holds on success, that the caller
 * does not dismiss it, that the reload rides the Done press. A render test would mock five things to
 * assert the same three facts.
 */

const SRC = resolve(__dirname, "../../src");
const modal = readFileSync(resolve(SRC, "components/requests/RequestEditModals.tsx"), "utf8");
const drawer = readFileSync(resolve(SRC, "components/workspace/RequestDetailsModal.tsx"), "utf8");
const home = readFileSync(resolve(SRC, "components/home/HomeRequests.tsx"), "utf8");
const bar = readFileSync(resolve(SRC, "components/workspace/RequestContextBar.tsx"), "utf8");

describe("the cancellation is confirmed", () => {
  it("Given it went through, Then the same box says so with a tick", () => {
    /**
     * 🔴 ONE box, two states — not a second dialog. A tick that arrives in the place the question
     * was asked reads as the answer to it; a new layer over the old one is a second thing to close.
     */
    expect(modal).toContain("if (done) {");
    expect(modal).toContain("check_circle");
    expect(modal).toContain("bg-ok-soft");
    const done = modal.slice(modal.indexOf("if (done) {"), modal.indexOf("return (\n    <Dialog open onClose={onClose}"));
    // One way out of the success state, and it is not a second chance to cancel.
    expect(done).not.toContain("onConfirm");
  });

  it("Given the success note, Then it states what CHANGED rather than congratulating him", () => {
    const done = modal.slice(modal.indexOf("if (done) {"));
    expect(done).toContain("is closed now, and suppliers can no longer bid on it");
    // Both locales, as every string on this screen has to be.
    expect(done).toContain("Request cancelled");
    expect(done).toMatch(/[؀-ۿ]/);
  });

  it("Given the drawer, Then success no longer closes it and Done carries the reload", () => {
    /**
     * 🔴 ~~`onChanged(); onClose();`~~ dismissed every layer and left the renter where he started
     * with one circle greyed behind him — a silent success reading exactly like a silent failure, on
     * the one act the backend has no inverse for.
     */
    const fn = drawer.slice(drawer.indexOf("const doCancel = async"), drawer.indexOf("/* The share-only path"));
    expect(fn).toContain("setCancelled(true);");
    expect(fn).not.toContain("onClose();");
    // The reload is on the Done press, because the rail has to re-read to grey the circle.
    expect(drawer).toContain("if (cancelled) {");
    expect(drawer).toContain("done={cancelled}");
  });

  it("Given the DASHBOARD path, Then it behaves the same way", () => {
    // One modal, two callers: a confirmation on one and silence on the other is the drift this
    // repo keeps finding between two doors onto one act.
    expect(home).toContain("setCancelled(true);");
    expect(home).toContain("done={cancelled}");
    // Beta's 2026-09-20 onClose reads `cancelled` into `reloadNow` before clearing it: same reload.
    expect(home).toContain("const reloadNow = cancelled;");
    expect(home).toContain("if (reloadNow) reload();");
  });

  it("Given a success, Then the confirm button is NOT re-armed", () => {
    /**
     * ⚠️ `busy` stays raised on the success path: the act is over, and a confirm button that comes
     * back to life under a tick invites a second cancellation of a request that has none left.
     */
    const fn = drawer.slice(drawer.indexOf("const doCancel = async"), drawer.indexOf("/* The share-only path"));
    const ok = fn.indexOf("setCancelled(true);");
    const reset = fn.indexOf("setBusy(false);");
    // The only `setBusy(false)` is in the catch, which comes after it.
    expect(reset).toBeGreaterThan(ok);
  });
});

describe("a cancelled request carries its label", () => {
  it("Given the bar naming the request, Then it says CLOSED", () => {
    /**
     * The rail has said it under the circle since 2026-08-30 and the drawer says it in its title,
     * and between those two sits the bar naming the request the whole page is about — which said
     * nothing. A renter who cancelled one and stayed on it read a live-looking subject over a table
     * of bids that can no longer change.
     */
    expect(bar).toContain("groupBiddingClosed(group.items)");
    expect(bar).toContain("t.workspace.closed");
  });

  it("Given ONE live sibling, Then the group is not closed", () => {
    /**
     * ⚠️ The predicate, not a status of its own: a fanned-out RFQ with one item cancelled and one
     * still open is still taking bids, and labelling it closed would be a lie about the half that
     * is not. The same rule the rail greys its circle with, so the two can never disagree.
     */
    expect(groupBiddingClosed([{ status: "CLOSED" }, { status: "OPEN" }])).toBe(false);
    expect(groupBiddingClosed([{ status: "CLOSED" }, { status: "CANCELLED" }])).toBe(true);
    // An empty group is not closed: it is a group we know nothing about.
    expect(groupBiddingClosed([])).toBe(false);
  });

  it("Given every spelling the backend uses, Then it reads as shut", () => {
    // ABANDONED and CANCELLED collapse to the renter's word; HUB_CLOSED and CLOSED to «Closed».
    for (const s of ["CANCELLED", "ABANDONED"]) expect(statusMeta(s).en).toBe("Cancelled");
    for (const s of ["CLOSED", "HUB_CLOSED"]) expect(statusMeta(s).en).toBe("Closed");
    for (const s of ["CANCELLED", "ABANDONED", "CLOSED", "HUB_CLOSED"]) {
      expect(groupBiddingClosed([{ status: s }])).toBe(true);
      expect(statusMeta(s).cls).toBe("st-closed");
    }
  });
});
