import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * **The × on a rail circle** (owner, 2026-09-22: *"i want it to be on all circules instead of the
 * share even if active and clicking it for active will cancel it with confirm popup same used when i
 * cancel from the request details and if it is closed then will remove it from the fleet only"*).
 *
 * The rules are a LAYOUT and a WIRING ruling — which control exists on which tile, and where the
 * live/closed decision is made — so these read the source. jsdom draws no rail (it needs a signed-in
 * renter, a request list and a locale provider), and what is under test is not a render: it is that
 * there is exactly one badge slot, that the workspace decides what pressing it means, and that the
 * decision reads the same predicate the circle greys itself with.
 */

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

/** Comments NAME what they replaced, so a bare `not.toContain` fails on its own explanation — the
 *  sixth time this repo has recorded that. Every negative assertion below reads the CODE. */
function code(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "") // JSX comments
    .replace(/\/\*[\s\S]*?\*\//g, "") // block comments
    .replace(/^\s*\/\/.*$/gm, ""); // line comments
}

const RAIL = read("src/components/workspace/RequestRail.tsx");
const WORKSPACE = read("src/components/workspace/RequestsWorkspace.tsx");
const TILES = read("src/lib/contract/workspace.ts");

describe("the rail's badge slot", () => {
  it("draws the × on EVERY tile, not only a closed one", () => {
    // ~~`{tile.closed && onHide && (`~~ — the whole of the change.
    expect(code(RAIL)).toContain("{onDismiss && (");
    expect(code(RAIL)).not.toMatch(/tile\.closed\s*&&\s*onDismiss/);
  });

  it("has no share badge left on it, and no prop to draw one", () => {
    const c = code(RAIL);
    expect(c).not.toContain("onShare");
    expect(c).not.toContain("ios_share");
    expect(c).not.toContain("shareRequest");
  });

  /* ⚠️ ONE callback for both meanings. Two — `onCancel` and `onHide` — would put the live/closed
     test in two places, and the day they disagreed the rail would offer to cancel a request the
     caption under it calls closed. */
  it("reports the press and decides nothing itself", () => {
    const c = code(RAIL);
    expect(c).toContain("onDismiss(tile.key)");
    expect(c).not.toContain("onHide");
    expect(c).not.toContain("cancelRequest(");
  });

  /* The label is the only thing the state changes here, and it reads the tile's own `closed` — the
     same value the greyscale and the «Closed» caption are drawn from, so the word and the act
     cannot describe different things. */
  it("names the act the press will perform", () => {
    expect(code(RAIL)).toContain("tile.closed ? t.workspace.hideRequest : t.workspace.cancelRequest");
  });

  /* The tile IS a button; a button inside a button is invalid markup no two browsers agree on. */
  it("is a role, never a nested button", () => {
    const slot = code(RAIL).slice(code(RAIL).indexOf("{onDismiss && ("));
    expect(slot.slice(0, 400)).toContain('role="button"');
    expect(slot.slice(0, 400)).toContain("tabIndex={-1}");
    expect(slot.slice(0, 400)).toContain("e.stopPropagation()");
  });
});

describe("what the workspace does with the press", () => {
  it("cancels a live request and hides a closed one", () => {
    const c = code(WORKSPACE);
    expect(c).toContain("const dismissTile");
    expect(c).toContain("groupBiddingClosed(g.items)");
    expect(c).toContain("hide(key)");
    expect(c).toContain("setCancelling(g)");
  });

  /* 🔴 **A LIVE group with nothing cancellable SAYS WHY and is never hidden.**
     `isCancellable` is `OPEN || ACTIVE` while `groupBiddingClosed` also admits
     `PARTIALLY_ACCEPTED`, so such a group reads LIVE and has no item the backend would take.
     ~~Hide it.~~ That breaks `hidden-requests`'s own standing rule - only a CLOSED group may be
     hidden, because a live request off the rail is one the renter cannot get back to and that
     store has no undo. It takes `cancelBlockedReason`, which this product already wrote for a
     refused × elsewhere. */
  it("explains the refusal instead of hiding a live request", () => {
    const c = code(WORKSPACE);
    expect(c).toContain("!cancellableItems(g.items).length");
    expect(c).toContain("setToast(cancelBlockedReason(");
    // The branch returns BEFORE the confirmation and without touching the hidden set.
    const arm = c.slice(c.indexOf("!cancellableItems(g.items).length"));
    expect(arm.slice(0, 260)).not.toContain("hide(key)");
    expect(arm.slice(0, 260)).not.toContain("setCancelling");
  });

  /* ⚠️ The reason is read off a LIVE item, never off the group: a group holding one EXPIRED
     sibling and one PARTIALLY_ACCEPTED item would otherwise report the expiry, which is not what
     refused the press and which the renter can do nothing about. */
  it("names the LIVE item that blocks it, not a terminal sibling", () => {
    expect(code(WORKSPACE)).toContain("g.items.find((i) => !isBiddingClosed(i.status))");
  });

  /* ⚠️ Hiding stays gated on CLOSED, which is the rule the wrong fallback broke. */
  it("hides only a shut request", () => {
    const c = code(WORKSPACE);
    const arm = c.slice(c.indexOf("if (groupBiddingClosed(g.items))"));
    expect(arm.slice(0, 120)).toContain("hide(key)");
  });

  /* A circle stands for the WHOLE request, and a fanned-out RFQ is several requests behind it — so
     this is the dashboard's own scope, not the drawer's per-item one. */
  it("cancels every cancellable item of the group, as the dashboard does", () => {
    const c = code(WORKSPACE);
    expect(c).toContain("cancellableItems(g.items).map((i) => cancelRequest(i.id))");
    expect(c).toMatch(/kind:\s*"all"/);
  });

  it("uses the same confirmation component as the drawer and the dashboard", () => {
    expect(WORKSPACE).toContain('import { ConfirmCancelModal } from "@/components/requests/RequestEditModals";');
    expect(code(WORKSPACE)).toContain("done={cancelled}");
  });

  /* Done is what carries the reload: the rail has to re-read to grey the circle and put «Closed»
     under it, and until the tick has been read there is nothing to reload FOR. */
  it("reloads on Done, never on the success itself", () => {
    const c = code(WORKSPACE);
    const onClose = c.slice(c.indexOf("onClose={() => {", c.indexOf("{cancelling && (")));
    expect(onClose.slice(0, 300)).toContain("if (cancelled) {");
    const doCancel = c.slice(c.indexOf("const doCancel"), c.indexOf("const doCancel") + 700);
    expect(doCancel).not.toContain("setReloads");
  });

  /* ⚠️ `busy` is NOT lowered on success (`RequestEditModals`'s own rule): the act is over, and a
     confirm button coming back to life under a tick invites a second cancellation. It IS lowered in
     the catch, which is what lets a failed press be tried again. */
  it("leaves the confirm button spent on success", () => {
    const c = code(WORKSPACE);
    const doCancel = c.slice(c.indexOf("const doCancel"), c.indexOf("const doCancel") + 900);
    expect(doCancel).toContain("setCancelled(true)");
    expect(doCancel.indexOf("setCancelBusy(false)")).toBeGreaterThan(doCancel.indexOf("catch"));
  });
});

describe("one predicate for «closed»", () => {
  /* 🔴 The tile read a DENYLIST ({CLOSED, HUB_CLOSED, EXPIRED, FORCE_EXPIRED}) while the navy bar
     read `groupBiddingClosed`, an ALLOWLIST of the live statuses — so a CANCELLED request was shut
     to the bar and live to the circle above it. */
  it("the rail tile is built from the bar's own answer", () => {
    expect(code(TILES)).toContain("closed: groupBiddingClosed(g.items)");
  });

  it("the denylist is gone rather than left standing beside it", () => {
    const c = code(TILES);
    expect(c).not.toContain("CLOSED_STATUSES");
    expect(c).not.toContain("isClosedGroup");
    expect(c).not.toContain("isClosedRequest");
  });
});
