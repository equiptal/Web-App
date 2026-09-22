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

describe("the header", () => {
  /* 🔴 **THE EYEBROW AND THE CAPTION ARE BOTH WITHDRAWN**, following the app's own removal of
     2026-09-19 on the owner's word. ~~«🔔 New offer from the supplier» over the figure, else a
     «Total» caption.~~ A caption that is always there names what the bar's only number obviously is,
     and the app deleted `negotiationHasNewOffer` with it. The turn cue survives where a renter meets
     it FIRST: the room's price bar draws «🔔 New reply» on `supplierCountered`. */
  /* ⚠️ On the DECLARATION, not on the bare name: the note recording the removal mentions it, and a
     `not.toContain` that fails on its own explanation is a trap this repo has hit four times. */
  it("draws neither the new-offer eyebrow nor the total caption", () => {
    expect(FLOW).not.toContain("const theirsIsLatest");
    expect(FLOW).not.toContain("ng-head-cap");
    expect(FLOW).not.toContain("ng-new");
    // …but the room still says it, which is the half that must not go with it.
    expect(SRC).toContain('`🔔 ${L("New reply", "ردّ جديد")}`');
  });

  /* 🔴 **THE RATE, not the net-incl-VAT total** (app parity, 2026-09-20: *"show the price at top
     header without VAT/duration/units so it shows the same number as in the bid card exactly"*).
     Both figures were right and they were different quantities, so the room said «50/day» and the
     sheet said «58» over the same deal and read as a contradiction. */
  it("states the rate with its period, the same number the room's price bar prints", () => {
    const head = FLOW.slice(FLOW.indexOf('className="ng-head"'), FLOW.indexOf('className="ng-body"'));
    expect(head).toContain("{nf(rate)}");
    expect(head).toContain("{periodLabel}");
    expect(head).not.toContain("nf(total)");
  });

  /* 🔴 **The request's short code is RESTORED, under the name.** The redesign dropped the block that
     carried it and left NO reference anywhere in the sheet, so a renter negotiating several deals
     with one firm had only the firm name to tell the sheets apart. */
  it("carries the request's short code under the counterparty's name", () => {
    expect(FLOW).toContain('<span className="ref">{room.shortCode}</span>');
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

  /* 🔴 **THE `‹ step ›` SWITCHER IS WITHDRAWN** (app parity, 2026-09-19: *"in the footer can't we get
     back to the live one, which has a next button explicitly, with log and accept if it is
     allowed"*). The chevron never said where it went, and on the last step it fired the one
     irreversible act in the sheet while looking like navigation. Every control names its own
     destination now, which is also why nothing here needs a mirror rule: a word is not an arrow. */
  it("names every step's action instead of walking it with chevrons", () => {
    const foot = FLOW.slice(FLOW.indexOf('className="ng-foot"'));
    expect(foot).not.toContain("ng-chev");
    expect(foot).not.toContain("ng-nav");
    expect(foot).toContain('L("Next: Terms", "التالي: الشروط")');
    expect(foot).toContain('L("Review & send", "مراجعة وإرسال")');
    expect(CSS).not.toContain(".ng-nav {");
    expect(CSS).not.toContain(".ng-chev {");
  });

  /* 🔴 **The no-change refusal is the whole send gate, and it is DRAWN as well as enforced** (owner,
     on the app, 2026-09-19: *"I sent the same bid 4 times in a row, no changes"*). A resend of an
     identical position is noise in the supplier's inbox and reads to him as a round that moved
     nothing. ⚠️ The button greys but stays PRESSABLE, so the press says why rather than doing
     nothing: one that looks live and then refuses is worse than one saying up front it has nothing
     to do. */
  it("greys the send when nothing has moved, and says so when it is pressed", () => {
    expect(FLOW).toMatch(/const hasSomethingToSend = draftChanged \|\| Object\.keys\(resolutions\)\.length > 0/);
    const foot = FLOW.slice(FLOW.indexOf('className="ng-foot"'));
    expect(foot).toContain('page === 2 && !hasSomethingToSend ? " blocked"');
    expect(foot).toContain("setNothingSent(true)");
    expect(CSS).toMatch(/\.ng-primary\.blocked \{[^}]*background: var\(--disabled-bg\)/);
  });
});

describe("the sheet itself", () => {
  /* 🔴 A PLACE, not a dialog (owner, 2026-09-19: *"it will sit in the existing 3 styles sheet but
     with the new design, not as a popup page"*). The three steps are where a renter goes to answer a
     negotiation — which is what the wizard this replaced always was, and what the app's own route is.
     A card floating on a scrim reads as an aside, and this is the room's whole business. */
  it("takes the screen rather than floating on it", () => {
    expect(CSS).toMatch(/\.ng-shell \{[^}]*position: fixed;\s*inset: 0/);
    expect(CSS).not.toMatch(/\.ng-shell \{[^}]*max-width: \d/);
  });

  /* NO column cap (owner, 2026-09-19: *"centralize the parent cards across the screen so it has equal
     margin on right and on left"*). One gutter, declared once on the shell and answered by the header,
     the footer and the body's cards alike, so the margin is identical on both sides at any width, and
     this sheet follows the same morning's product-wide "every page is fluid" ruling rather than
     keeping a private cap of its own. */
  it("runs the cards the width with one gutter either side", () => {
    expect(CSS).toMatch(/\.ng-inner \{ width: 100%; \}/);
    expect(CSS).not.toMatch(/\.ng-inner \{[^}]*max-width/);
    expect(CSS).toMatch(/--ng-gutter: clamp\(/);
    expect(CSS).toMatch(/\.ng-head \{[^}]*padding: 14px var\(--ng-gutter\)/);
    expect(CSS).toMatch(/\.ng-foot \{[^}]*padding: 10px var\(--ng-gutter\)/);
    expect(CSS).toMatch(/\.ng-body \.ng-inner \{[^}]*padding: 14px var\(--ng-gutter\)/);
    expect(FLOW.match(/className="ng-inner"/g)?.length).toBe(3);
  });

  /* At the phone's width the answer controls are full-bleed rows; across a wide screen they become
     slabs that read as the card's main event rather than as the answers to the line above them. */
  it("keeps the answers to a reading column", () => {
    expect(CSS).toMatch(/\.ng-t \.acts \{[^}]*max-width: 320px/);
    expect(CSS).toMatch(/\.ng-t \.opts \{[^}]*max-width: 320px/);
    expect(CSS).toMatch(/\.ng-price input \{[^}]*max-width: 150px/);
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
  /* 🔴 **PENDING AND CONFLICT ARE TWO SECTIONS, and only the OPEN card is drawn** (owner, on the
     app, 2026-09-17). They are two questions: a pending term is one nobody has answered, a disputed
     one is two answers that clash. ~~One queue with every row drawn, the ones not yet reached dashed
     and dimmed as «waiting for the one above».~~ A placeholder is still a row to read past, and the
     section's own count carries everything those rows were saying. */
  it("splits the walk into pending and conflict, pending first, one open card each", () => {
    const step = FLOW.slice(FLOW.indexOf("{page === 1 && ("), FLOW.indexOf("③ the review"));
    expect(step).toContain('key: "pending"');
    expect(step.indexOf('key: "pending"')).toBeLessThan(step.indexOf('key: "conflict"'));
    expect(step).toContain("activeCardIn(openPending)");
    expect(step).toContain("activeCardIn(openConflicts)");
    // Gone from the markup AND from the stylesheet, so it cannot come back quietly.
    expect(FLOW).not.toContain("بانتظار البند السابق");
    expect(CSS).not.toContain(".ng-t.later {");
    expect(FLOW).toContain("const activeCardIn = (list: DealTerm[])");
  });

  /* 🔴 **A CONFLICT IS TWO VALUES THAT CLASH, not a `state` column.** The server writes `disputed`
     only at room creation, so a clash created by a later counter arrived as `pending`, was drawn as
     «not set» with two contradictory values on the card, and did not block Accept. Its mirror: a
     counter that landed ON the supplier's value also writes `pending`, so two identical values were
     reported as an open question and held the gate shut for good. */
  it("reads a clash and an agreement off the VALUES, not off the state column", () => {
    expect(FLOW).toContain("const conflicts = operatingTerms.filter(isConflictingTerm)");
    expect(FLOW).toContain('badge: isConflictingTerm(t) ? "conflict" : "none"');
    expect(SRC).toContain("const unresolvedDisputed = room.terms.filter((t) => isConflictingTerm(t)");
    expect(SRC).toContain('t.state === "fixed" || t.state === "soft_accepted" || isSettledByValues(t)');
  });

  /* 🔴 **THREE LABELS on one button**, because they answer three different situations (app parity,
     2026-09-20): «Choose another» on a pending row (there is nothing of mine to change), «Keep my
     choice» on a two-value conflict (the only alternative is the one I already hold), and «Change»
     when there is a real menu to open. */
  it("names the change button for the situation it is in", () => {
    expect(FLOW).toContain('L("Choose another", "اختيار آخر")');
    expect(FLOW).toContain('L("Keep my choice", "الاستمرار باختياري")');
    expect(FLOW).toContain('L("Change", "تغيير")');
    expect(FLOW).toContain("const keepMine = conflict && opts.length <= 2");
  });

  /* A settled term says HOW it was settled: ✓ took theirs, ✎ countered. */
  it("tells a term taken from the supplier from one countered", () => {
    expect(FLOW).toMatch(/const countered = mine\?\.action === "counter"/);
    expect(FLOW).toContain('{countered ? "✎" : "✓"}');
  });

  /* The two groups are what the SERVER settled and what the request fixed — neither is the renter's
     to answer, which is why they sit under the queue rather than in it. */
  it("keeps the agreed and acknowledged terms out of the walk, acknowledged LAST", () => {
    expect(FLOW).toContain("const agreedTerms =");
    expect(FLOW).toContain("const ackTerms =");
    const step = FLOW.slice(FLOW.indexOf("{page === 1 && ("), FLOW.indexOf("③ the review"));
    // ═════ SETTLED, AT THE END ═════ — what is already decided must not stand between the reader and
    // the rows that still need an answer.
    expect(step.indexOf('key: "conflict"')).toBeLessThan(step.indexOf('key: "agreed"'));
    expect(step.indexOf('key: "agreed"')).toBeLessThan(step.indexOf('key: "ack"'));
    /* 🔴 And the row the reader has answered but the SUPPLIER has not: a settled row, never a card.
       There is nothing for her to do, and putting it in the walk told her to re-answer her own ask. */
    expect(step).toContain('key: "awaiting"');
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
