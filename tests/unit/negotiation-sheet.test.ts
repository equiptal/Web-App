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
/** ⚠️ The stylesheet with its COMMENTS stripped, for every `not.toMatch`. This file explains
 *  what it deleted and names the class while doing it, so a bare sweep fails on its own
 *  explanation - the ninth time this repo has recorded that. */
const CSS_CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, "");

/**
 * The sheet's own slice of the component, so a rule is never matched against the room behind it.
 *
 * 🔴 **It starts at `Qty`, not at `CounterFlow`.** `Qty` and `PriceCell` were hoisted OUT of
 * the render body on 2026-09-22 to fix the price box losing focus after every character - a
 * component declared in a render body is a new identity each render, so React remounted the input
 * and the caret went with it. They are the sheet's own code and they sit above `CounterFlow` now.
 *
 * ⚠️ **The anchor asserts itself.** `indexOf` returning -1 would slice from the END of the
 * file and every `toMatch` below would fail while every `not.toMatch` passed VACUOUSLY - the trap
 * this repo has logged for `cancel-confirmation` and the intake's own class-string anchor.
 */
const FLOW_AT = SRC.indexOf("function Qty({");
if (FLOW_AT < 0) throw new Error("negotiation-sheet: the sheet's slice anchor `function Qty({` is gone - re-point it");
const FLOW = SRC.slice(FLOW_AT);

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
  /* 🔴 **The MACHINE under the firm, not the request's code** (owner, 2026-09-22: *"for the
     header keep company name of supplier with equuoment name ans size dont mention request id"*).
     ~~The short code, restored that same morning because the redesign had left no reference
     anywhere in the sheet.~~ Inside a sheet opened FROM the request the code answers nothing, and
     on a multi-item room it cannot even say which line is being negotiated. The machine can, and
     the code is still on the log, the quotation and the room behind. */
  it("names the machine and its size under the counterparty, and never the request's code", () => {
    expect(FLOW).toContain('<div className="t" title={room.supplier.name}>{room.supplier.name}</div>');
    expect(FLOW).toMatch(/\[machineLine, roundLine\]\.filter\(Boolean\)/);
    expect(FLOW).toMatch(/const machineLine = \[/);
    // The size rides the same run: a 20-ton and a 30-ton excavator are two negotiations.
    expect(FLOW).toMatch(/equipmentSizeAr \|\| room\.details\.equipmentSize/);
    const head = FLOW.slice(FLOW.indexOf('className="ng-head"'), FLOW.indexOf('className="ng-body"'));
    expect(head).not.toContain("room.shortCode");
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

  /* 🔴 **A PAPER COLUMN, centred on the desk** (owner, 2026-09-22, pointing at `main` / `beta`:
     *"i want the previosu 3 sheets style layout ... for the frame and general layout"*).

     🔴 **This REVERSES 2026-09-19**, which was itself a withdrawal: ~~*"centralize the parent
     cards across the screen so it has equal margin on right and on left"*, one gutter and no cap.~~
     That ruling is not wrong about margins and still holds — the gutter is one number and the two
     edges are equal. What it cannot give is the thing asked for now: a SHEET reads as a sheet only
     when it has an edge, and content running a 1900px monitor has none.

     ⚠️ **940, and the number is not a taste.** `.ng-cmp` was capped at 940 and `.ng-grow` at
     820 on 2026-09-22, so at this width nothing already capped changes size. beta's own 800 would
     have shrunk the compare card that was measured at 940. */
  /* 🔴 **ONE WHITE SURFACE** (owner, 2026-09-22: *"show the sheet alll in white"*). ~~A white
     paper centred on a grey desk, which is the prototype's own shape.~~ Three greys on a screen
     holding one document; the RULES separate the bands now. The paper COLUMN survives - it is the
     measurement, not the colour. */
  /* 🔴 **THE DESK STAYS and the PAPER is what goes white** (owner, 2026-09-23, asked which of
     two readings he meant: *"keep the desk, whiten the paper"*). ~~One white surface edge to edge.~~
     I read «all in white» as the whole screen, and it removed the framing he was pointing at. */
  it("keeps the grey desk under a white paper", () => {
    expect(CSS).toMatch(/\.ng-shell \{[\s\S]*?background: var\(--surface2\);/);
    expect(CSS).toMatch(/\.ng-body \{[^}]*background: var\(--surface2\); \}/);
    // The cards on it are the white, which is what «all in white» was about.
    expect(CSS).toMatch(/\.ng-card \{[^}]*background: var\(--surface\)/);
  });

  it("holds the cards to a paper column, centred on the desk", () => {
    expect(CSS).toMatch(/--ng-paper: 940px;/);
    expect(CSS).toMatch(/\.ng-inner \{ width: 100%; max-width: var\(--ng-paper\); margin-inline: auto; \}/);
    // The gutter SURVIVES the cap: it is what keeps the paper off the window's edge below 940.
    expect(CSS).toMatch(/--ng-gutter: clamp\(/);
    /* 🔴 **The LIVE sheet's own metrics** (owner, 2026-09-23: *"use same ui as live one in the
       beta the spacing - size etc same for footer and header"*): `.qp-head-r1` is `7px 18px 6px`
       and `.qp-foot` is `9px 24px`. ~~14px and 10px, this sheet's own.~~ */
    expect(CSS).toMatch(/\.ng-head \{[^}]*padding: 7px var\(--ng-gutter\) 6px/);
    expect(CSS).toMatch(/\.ng-foot \{[^}]*padding: 9px var\(--ng-gutter\)/);
    /* ⚠️ The body's gutter is on the BAND, as it is on the other three — it sat on `.ng-inner`
       here, so that one column measured 940 of CONTENT while the rest measured 940 including their
       padding, and the cards stood 40px inside the header's own verticals. Measured at a 1920
       window: 1020 against 940 before, 940 across all four after. */
    expect(CSS).toMatch(/\.ng-body \{[^}]*padding-inline: var\(--ng-gutter\)/);
    expect(CSS).toMatch(/\.ng-body \.ng-inner \{ padding: 14px 0 20px; \}/);
    /* Head, body and foot: THREE bands on the one column, so nothing stands off the paper.
       ⚠️ It was FOUR until the step rail went (owner, 2026-09-22). The count is the point of
       the case - a band added without its `.ng-inner` is one that ignores the paper. */
    expect(FLOW.match(/className="ng-inner"/g)?.length).toBe(3);
  });

  /* 🔴 **THE STEP RAIL, restored from `beta`** (same note). It is the one device that makes
     three pages read as THREE SHEETS rather than as a page replacing itself: the footer's button
     says where you are GOING, never where you are.

     ⚠️ **Tokens direct — `--brand` for the open step, `--ok` for a finished one.** beta reached
     the same two colours by remapping `--action` and `--rentee` locally inside the sheet, and a local
     remap of `--action` is the drift RM3-AC-33 and `palette-drift` exist to stop.

     ⚠️ `aria-hidden`, and NOT pressable: the footer already names the next step in words, and a
     rail that jumped a renter past an unanswered price would be a second route with none of `canNext`'s
     gates. */
  /* 🔴 **NO STEP RAIL** (owner, 2026-09-22: *"remove the 3 steps process bar"*). ~~① Price
     —— ② Terms —— ③ Review, argued that same morning as «what makes three pages read as three
     SHEETS».~~ It was `aria-hidden` and unpressable, so it spent a band of the sheet on decoration.
     ⚠️ **The footer carries the step instead, and that was his pick** when the cost was put to
     him: the button names where the press GOES, and nothing names where the reader IS. */
  it("draws no step rail, in the markup or the stylesheet", () => {
    expect(FLOW).not.toMatch(/className="ng-steps"/);
    expect(CSS_CODE).not.toMatch(/^\.ng-steps/m);
    expect(CSS_CODE).not.toMatch(/^\.ng-step[ .{]/m);
    // The footer's named press is what replaced it, and it must still be there.
    expect(FLOW).toContain('L("Send to the supplier", "إرسال إلى المورد")');
  });

  /* ⚠️ **The terms step is SIZED for a desktop** (owner, 2026-09-22: *"for terms use same
     structure and same languag eand same behaviour but on sizes suitable foe web"*). Structure,
     wording and behaviour are untouched — he named the sizes and nothing else. */
  it("reads the terms at a monitor's distance, not a phone's", () => {
    expect(CSS).toMatch(/\.ng-sect-h \{[^}]*padding: 13px 16px;[^}]*font-size: 13\.5px/);
    expect(CSS).toMatch(/\.ng-sect-b \{ padding: 10px 14px 13px;/);
    expect(CSS).toMatch(/\.ng-grow \.k \{ font-size: 13px;/);
    expect(CSS).toMatch(/\.ng-grow \.v \{ font-size: 13px;/);
    // ⚠️ The row's OWN 820px cap is gone: the paper already caps it, and two caps on one row is
    // how a row ends up narrower than its card for a reason nobody can find.
    expect(CSS).not.toMatch(/\.ng-grow \{[^}]*max-width/);
  });

  /* At the phone's width the answer controls are full-bleed rows; across a wide screen they become
     slabs that read as the card's main event rather than as the answers to the line above them. */
  /* 🔴 **The two acts are CENTRED and the options run ACROSS** (owner, 2026-09-22: *"make the
     buttons of accept-choose another in the center"* and *"alwasy show other options ... to be
     shown horizantaly not vertically"*).
     ~~Both pinned to the reading start, the options a hidden COLUMN capped at 320px.~~ The acts
     keep their cap - stretched across the sheet they read as the card's main event rather than as
     the reply to the line above - but they sit under the middle of the question now. The options
     lost the cap with the column: a row of chips does not read as navigation the way a full-width
     stack of buttons did. */
  it("centres the two acts and lays the options across", () => {
    expect(CSS).toMatch(/\.ng-t \.acts \{[^}]*max-width: 320px/);
    expect(CSS).toMatch(/\.ng-t \.acts \{[^}]*margin-inline: auto/);
    expect(CSS).toMatch(/\.ng-t \.opts \{[^}]*flex-wrap: wrap/);
    expect(CSS_CODE).not.toMatch(/\.ng-t \.opts \{[^}]*flex-direction: column/);
    expect(CSS).toMatch(/\.ng-price input \{[^}]*max-width: 150px/);
  });

  /* 🔴 **The options stay BEHIND the press** (owner, 2026-09-23, correcting me: *"now the
     options appear even if i didnt choose choose another which is different from the live one"*).
     ~~Drawn unconditionally.~~ His 2026-09-22 note read *"alwasy show other options if he chose
     'choose another' to be shown horizantaly not vertically"* - I took «always show» as unconditional
     when the clause after it says WHEN. Only the AXIS was ever his complaint. */
  it("opens the options on the press, and lays them across", () => {
    expect(FLOW).toMatch(/\{open && !keepMine && \(/);
    expect(CSS).toMatch(/\.ng-t \.opts \{[^}]*flex-wrap: wrap/);
  });
});

describe("the price sheet", () => {
  /* 🔴 The input's own colours ARE the state: green while the figure still matches the supplier's,
     amber the moment it is edited. Losing either half leaves the renter unable to see what he moved. */
  /**
   * 🔴 **The price box must keep the caret** (owner, 2026-09-22: *"there is a bug that i cant
   * write into price box it takes me out after each character"*).
   *
   * `PriceCell` and `Qty` were declared INSIDE `CounterFlow`'s render body. A component defined in
   * a render body is a NEW function identity on every render, and React compares element types by
   * identity - so each keystroke unmounted the subtree and mounted a fresh `<input>`, taking the
   * focus with the old node. Nothing downstream can fix it: memoising the parent or the value does
   * not make two function objects the same type.
   *
   * ⚠️ This asserts the POSITION, because that is the whole of the bug. jsdom would not catch
   * it either - the remount is correct React behaviour, and only a caret notices.
   */
  it("declares the input's component at module scope, so typing cannot remount it", () => {
    const body = SRC.indexOf("function CounterFlow(");
    expect(body).toBeGreaterThan(-1);
    for (const decl of ["function PriceCell(", "function Qty("]) {
      const at = SRC.indexOf(decl);
      expect(at, `${decl} is gone - it must stay a module-scope declaration`).toBeGreaterThan(-1);
      expect(at, `${decl} moved back inside the render body: the price box loses focus per keystroke`).toBeLessThan(body);
    }
    // And the body must not re-declare one under any name that renders the money input.
    expect(SRC.slice(body)).not.toMatch(/const \w+ = \([^)]*\) => \(?\s*<div className=\{?`?ng-price/);
  });

  it("paints an edited price differently from one that still matches", () => {
    expect(CSS).toMatch(/\.ng-price input \{[^}]*border: 1\.5px solid var\(--ok\)/);
    expect(CSS).toMatch(/\.ng-price\.edited input \{[^}]*border-color: var\(--brand\)/);
    /* ⚠️ The RULE is unchanged and the EXPRESSION moved: `changedFrom` carries the null test
       itself now, so a leg the supplier never priced still reads as unedited. One comparator, at
       module scope with the cell it serves. */
    expect(FLOW).toMatch(/const edited = changedFrom\(numOf\(val\), refVal\)/);
    expect(FLOW).toMatch(/function changedFrom[\s\S]*?ref != null && Math\.round\(cur\) !== Math\.round\(ref\)/);
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

  /* 🔴 **THE TWO POSITIONS TAKE THEIR OWN CENTRED LINE** (owner, 2026-09-23: *"even these make it
     middle and more visible"*, on «Fuel Responsibility  Your choice: not set · Supplier: 24 hours»).
     ~~At the end of the term's NAME row, so the longer the name the smaller its two answers, and the
     values ellipsised before the label did.~~ The app moved the same line for the same reason. */
  it("gives the two positions a line of their own, centred, above the acts", () => {
    // Out of the head row entirely — a sibling of it, not a child.
    expect(FLOW).toMatch(/<\/div>\s*<div className="side">\{L\("Your choice"/);
    expect(CSS_CODE).toMatch(/\.ng-t\.now \.side \{[^}]*text-align: center/);
    expect(CSS_CODE).not.toMatch(/\.ng-t\.now \.h \.side/);
  });

  /* 🔴 **THE PANEL ITSELF CARRIES THE COLOUR, and the button keeps its own** (owner, 2026-09-23:
     *"make the red or the gree on the panel iteslf like the app"*). The percentages are sampled from
     the app's own hexes: `kNegRedTint` is the danger token at ~4% and `kNegRedBorder` at ~26%, and
     the card is deliberately PALER than the «Choose another» sitting on it. */
  it("tints the card, borders the buttons, and keeps the two steps apart", () => {
    expect(CSS_CODE).toMatch(/\.ng-t\.now\.clash[^{]*\{[^}]*var\(--danger\) 4%/);
    expect(CSS_CODE).toMatch(/\.ng-t\.now\.pending \{[^}]*var\(--info\) 10%/);
    // The acts are bordered at the app's radius and size — 1.5px card, 1px button, radius 10.
    expect(CSS_CODE).toMatch(/\.ng-t \.acts button \{[^}]*border: 1px solid/);
    expect(CSS_CODE).toMatch(/\.ng-t \.acts button \{[^}]*border-radius: 10px/);
    expect(CSS_CODE).toMatch(/\.ng-t \.acts button \{[^}]*font-size: 14px/);
    // A settled row is green, and red when the renter countered rather than accepted.
    expect(CSS_CODE).toMatch(/\.ng-t\.done\.countered \{[^}]*--danger-soft/);
    expect(FLOW).toContain('`ng-t done${countered ? " countered" : ""}`');
  });

  /* 🔴 **A PENDING CARD TURNS RED WHILE ITS OPTIONS ARE OPEN**, restoring the app's rule and
     withdrawing this repo's own of 2026-09-22 («`.picking` follows whichever state the card is
     in»). Owner, 2026-09-23: *"check if we dont differ on anything in behaviour from the app"*.
     Opening the menu IS choosing to disagree, so the card joins the conflict family while it. */
  it("paints an open picker the conflict red, whatever state the card was in", () => {
    expect(CSS_CODE).toMatch(/\.ng-t\.now\.pending\.picking/);
  });

  /* 🔴 **THE OPTIONS REPLACE THE TWO ACTS.** The app is an `if/else` — `if (!optionsOpen)
     _ActionRow(...) else _OptionsPanel(...)`. ~~Both at once~~, which left the button that opened
     the menu standing there inviting a second press, with «Accept» beside a list of values as if it
     were one of them. */
  it("swaps the acts for the menu rather than drawing both", () => {
    expect(FLOW).toContain('{!(open && !keepMine) && <div className="acts">');
  });

  /* 🔴 **NOTHING IS PRE-TICKED unless it is the reader's OWN answer** (app parity,
     `NegOptionPills`). ~~The supplier's declared value came up ticked whenever she had stated
     nothing~~ — which answered the question before she had, and put a tick meaning «what you have
     now» a row under a tick meaning «agreed». */
  it("never pre-ticks the supplier's value in the picker", () => {
    expect(FLOW).toContain('className={pickedVal != null && o.value === pickedVal ? "on" : undefined}');
    expect(FLOW).not.toContain('o.value === (myVal != null ? String(myVal) : supStr(t))');
  });

  /* 🔴 **RE-OPENING A ROW SHOWS WHERE SHE LEFT IT** (app parity, `_reopenedValues`; the app's
     own rule of 2026-09-17: *"when a user set a value then clicks it to edit, it will show his value
     selected, not empty"*).
     ⚠️ **`myVal` is NOT that value, which is the trap.** Reopening clears the resolution and
     `myVal` then falls back to `renteePreference` — what she asked for on the REQUEST, not the answer
     she gave on this card. Ticking it would mark a value she never chose here. */
  it("ticks the answer a reopen cleared, and never the request's own preference", () => {
    expect(FLOW).toContain("const [reopenedVals, setReopenedVals] = useState<Record<string, string>>({})");
    expect(FLOW).toContain("const reopenTerm = (key: string, previous: unknown)");
    expect(FLOW).toContain('const pickedVal = mine?.value != null ? String(mine.value) : reopenedVals[t.key] ?? null;');
  });

  /* 🔴 **A SETTLED TERM IS RE-OPENABLE, and the PENCIL says so** (owner, 2026-09-23: *"allow edit on
     the terms like the app too"*). ~~A ↻ button drawn only where the renter had a resolution of her
     own~~, so a term the SERVER settled had no way back at all. The whole row is the target, as the
     app's own note insists, and the pencil is a glyph rather than a second control inside it. */
  it("lets every settled row be reopened, and marks it with a pencil", () => {
    expect(FLOW).toContain('{editable && <span className="material-icons-outlined pen">edit</span>}');
    expect(FLOW).toContain('{onReopen && <span className="material-icons-outlined pen">edit</span>}');
    // Cleared BEFORE it is forced open: a forced term still carrying its answer opens already given.
    expect(FLOW).toContain("reopenTerm(t.key, mine?.value); setForcedTerm(t.key);");
    expect(FLOW).not.toContain('className="undo"');
  });

  /* 🔴 **PRESSING A SECTION OPENS ITS FIRST UNANSWERED TERM** (owner, 2026-09-23: *"i clicked on
     conflict it doesnt open"*). A section draws only the ACTIVE card, so a conflict that was not the
     active term rendered nothing and its header expanded an empty body. */
  it("opens a section's first unanswered term when the header is pressed", () => {
    expect(FLOW).toContain("const openSection = (rows: DealTerm[])");
    expect(FLOW).toContain("openSection(openPending)");
    expect(FLOW).toContain("openSection(openConflicts)");
  });

  /* 🔴 **THE LOG IS A REAL MODAL** (owner, 2026-09-23: *"for log use it proper modal not very small .
     show it like real modal"*). ~~460px, and only as tall as its content.~~ A fixed height, not a
     cap: `max-height` alone lets a short log collapse under its own tabs. */
  it("gives the log a panel to be read in", () => {
    expect(FLOW).toContain('className="qp-sheet ng-logm"');
    expect(FLOW).not.toContain("style={{ maxWidth: 460 }}");
    expect(CSS_CODE).toMatch(/\.qp-sheet\.ng-logm \{[^}]*height: min\(/);
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
    expect(FLOW).toContain('className={`ng-hnote');
  });

  /* The log is unchanged and still one press away, from every step. */
  it("keeps the negotiation log on the footer", () => {
    expect(FLOW).toContain('className="ng-log"');
    expect(FLOW).toContain("qp-log-tabs");
  });
});
