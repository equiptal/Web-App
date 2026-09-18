import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * The negotiation sheet, rebuilt on the owner's `Negotiate Price Sheet Standalone.html` — the same
 * prototype the app's `counter_offer_flow/` is built from (owner, 2026-09-18: *"there are changes in
 * deal room, the 3 negotiation sheets style, check them in app"*).
 *
 * These read the SOURCE. The sheet needs a live deal room, a supplier's standing round and a
 * reconstructed history to render at all, and what is pinned here is the handful of RULINGS that are
 * one careless edit from being lost — not the markup, which is a picture's job.
 */

const SRC = readFileSync("src/components/deal-room/DealRoom.tsx", "utf8");
const CSS = readFileSync("src/components/deal-room/deal-room-proto.css", "utf8");

/** The sheet's own slice of the component, so a rule is never matched against the room behind it. */
const FLOW = SRC.slice(SRC.indexOf("function CounterFlow("));

describe("the header's new-offer eyebrow", () => {
  /* 🔴 DERIVED from who posted the last round, never a stored seen/unseen bit: nothing on this sheet
     could clear such a flag, so it would stay lit for good. */
  it("is the other side's latest round, and nothing else", () => {
    expect(FLOW).toMatch(/const theirsIsLatest = latestRound\?\.role === "supplier"/);
    expect(FLOW).not.toMatch(/localStorage|sessionStorage/);
  });

  /* A caption that is always there names what the bar's only number obviously is, so the eyebrow
     REPLACES it rather than stacking on top of it. */
  it("stands in place of the plain caption, not above it", () => {
    const head = FLOW.slice(FLOW.indexOf('className="ng-head-l"'), FLOW.indexOf('className="ng-net"'));
    expect(head).toContain("theirsIsLatest");
    expect(head).toContain("ng-new");
    expect(head).toContain("ng-head-cap");
    expect(head).toContain("?");
  });
});

describe("the footer", () => {
  /* 🔴 The review step names its act. There is nothing to walk forward to there, so a bare chevron
     would submit the whole negotiation — the one irreversible press on the sheet — drawn as
     navigation. */
  it("labels the last step's press with who it goes to", () => {
    expect(FLOW).toContain('L("Send to the supplier", "إرسال إلى المورد")');
  });

  /* ⚠️ Accept stands BESIDE send when everything matches: they are different acts and neither stands
     in for the other. It hands back to the room so the press lands on the binding-commitment gate
     rather than skipping it. */
  it("offers accept beside send on a matched review, through the accept flow's own gate", () => {
    const foot = FLOW.slice(FLOW.indexOf('className="ng-foot"'));
    expect(foot).toContain("onAcceptInstead");
    expect(foot).toContain("allMatched");
    expect(SRC).toContain('onAcceptInstead={() => setFlowMode("accept")}');
    // Never a direct accept from the counter sheet — that is the press the warning exists for.
    expect(foot).not.toMatch(/onAccept\(/);
  });

  /* The switcher is centred in the BAR, which a flex row cannot do while a button takes a share of
     the line — it would centre in what the buttons left over. */
  it("centres the step switcher on the bar itself", () => {
    expect(CSS).toMatch(/\.ng-nav \{[^}]*position: absolute[^}]*left: 50%/);
  });

  /* The chevrons are DIRECTION, so they mirror with the script. */
  it("mirrors the chevrons under rtl", () => {
    expect(CSS).toMatch(/\[dir="rtl"\] \.ng-chev \{ transform: scaleX\(-1\); \}/);
  });
});

describe("the price sheet", () => {
  /* 🔴 The input's own colours ARE the state: green while the figure still matches the supplier's,
     amber the moment it is edited. Losing either half leaves the renter unable to see what he moved. */
  it("paints an edited price differently from one that still matches", () => {
    expect(CSS).toMatch(/\.ng-price input \{[^}]*border: 1\.5px solid var\(--ok\)/);
    expect(CSS).toMatch(/\.ng-price\.edited input \{[^}]*border-color: var\(--brand\)/);
    expect(FLOW).toMatch(/const edited = refVal != null && changedFrom/);
  });

  /* Excluding a leg is confirmed first — it is reversible, and the app confirms it too. */
  it("asks before it strikes a transport leg out", () => {
    expect(FLOW).toMatch(/o\.excluded \? o\.onExclude!\(false\) : setPendingEx/);
  });

  /* The rate is charged across the BILLABLE days, and the table has no quantity column for them, so
     the duration cell carries both numbers. */
  it("states the billable days and the calendar span they came from", () => {
    expect(FLOW).toContain("rentalCalc.billable");
    expect(FLOW).toContain('L("days, Fridays out", "يوم، دون الجمعة")');
  });
});

describe("the terms sheet", () => {
  /* 🔴 ONE queue, one term at a time — that is what makes «resolve everything before you send»
     readable rather than a table the renter has to audit. */
  it("answers the queue in order: one active term, the rest waiting", () => {
    expect(FLOW).toMatch(/const firstOpen = queue\.findIndex\(\(t\) => !resolutions\[t\.key\]\)/);
    expect(FLOW).toContain('i === firstOpen');
    expect(FLOW).toContain('"later"');
  });

  /* A settled term says HOW it was settled: ✓ took theirs, ✎ countered. */
  it("tells a term taken from the supplier from one countered", () => {
    expect(FLOW).toMatch(/const countered = mine\?\.action === "counter"/);
    expect(FLOW).toContain('{countered ? "✎" : "✓"}');
  });

  /* The two groups are what the SERVER settled and what the request fixed — neither is the renter's
     to answer, which is why they sit under the queue rather than in it. */
  it("keeps the agreed and acknowledged terms out of the queue", () => {
    expect(FLOW).toMatch(/const queue = operatingTerms\.filter\(\(t\) => \{ const d = decide\(t\); return !d\.server && d\.badge !== "locked"/);
    expect(FLOW).toContain("const agreedTerms =");
    expect(FLOW).toContain("const ackTerms =");
  });

  /* Where a value came from, and the last move on it. The prototype states neither; a renter reading
     «24h» otherwise has no way to tell his own ask from the supplier's declaration. */
  it("keeps the provenance and history lines the prototype has no slot for", () => {
    expect(FLOW).toContain("const notes = termNotes(t)");
    expect(CSS).toContain(".ng-t .why");
  });
});

describe("what the rebuild did NOT change", () => {
  /* Every figure still goes through the shared pricing module — the sheet was restyled, not repriced. */
  it("prices through the shared module, as it always did", () => {
    expect(FLOW).toContain("computeRentalTotal(");
    expect(FLOW).toContain("computeQuoteTotals(");
  });

  /* The submit payload is the one the room's `submitCounter` expects. */
  it("sends the same counter payload", () => {
    expect(FLOW).toMatch(/onCounter\(\{ rate, mobPrice: mob \|\| undefined, demobPrice: demob \|\| undefined, rentalUnits, mobUnits: Math\.min\(mobUnitsN, rentalUnits\), demobUnits: Math\.min\(demobUnitsN, rentalUnits\), mobExcluded, demobExcluded \}\)/);
  });

  /* A settled room still opens the sheet, read-only, and says why in its header (2026-09-08). */
  it("still reads a settled room through, and sends nothing from it", () => {
    expect(FLOW).toContain("const settled = settledNote != null");
    expect(FLOW).toContain("const canSubmit = settled ? false");
    expect(FLOW).toContain('className={`ng-note');
  });

  /* The log is unchanged and still one press away, from every step. */
  it("keeps the negotiation log on the footer", () => {
    expect(FLOW).toContain('className="ng-log"');
    expect(FLOW).toContain("qp-log-tabs");
  });
});
