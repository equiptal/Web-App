"use client";

/**
 * The chip row — which site is this request for? (web-app/007, W-T7 · spec §11.1)
 *
 * Sits inside the intake card, under the textarea, above the Continue row. Not inside the textarea:
 * that is a native `<textarea>` and holds text only, and keeping it purely what the renter typed is
 * what keeps the agent's input small and its parse fast.
 *
 * ── It renders NOTHING when there is nothing to show ─────────────────────────────────────────────
 *
 * No projects, or a guest: no row, no caption, no empty state, no placeholder. A renter who has
 * never made a project sees today's intake screen unchanged, so nothing about this feature reaches
 * someone who is not using it (PROJ-AC-28). An empty-state teaching them about projects here would
 * be a feature announcement standing between them and the thing they came to do.
 *
 * ── The row STAYS once a site is picked, and the chosen pill opens what is in it ──────────────────
 *
 * *"I want the dropdown of work order and request of a project to open here in this rounded pill, not
 * in the text area"* (owner, 2026-08-31).
 *
 * ~~The row removed itself the moment a site was chosen, and the site's values — including a navy
 * project pill carrying the template dropdown — appeared inside the intake card instead.~~ The
 * dropdown is a question about the PROJECT («what have I already hired at this site?»), and the
 * project is chosen here. Asking it from inside the box the renter is typing their request into put
 * one control in two conceptual places.
 *
 * So the chosen site stays in this row as a marked pill: press it and its work orders and requests
 * drop down. The card keeps the request's own VALUES (dates, basis, payment) and nothing about the
 * site's identity.
 *
 * The other sites stay listed beside it, quiet, because switching site is one press and this row is
 * the picker.
 *
 * ── Ended sites are sorted last, tagged, and never hidden ────────────────────────────────────────
 *
 * A date passing is not proof a site is finished. Hide it and a renter who extended the hire
 * verbally loses their chip with no explanation and no way to ask for it back. Recency does the
 * hiding instead: a site you stop using stops being picked, and drops off the six.
 */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { useRfq } from "@/lib/store/rfq-store";
import { listProjects, listTemplates, fetchTemplateTerms } from "@/lib/api/client";
import type { TemplateOption } from "@/lib/contract/project-apply";
import { projectTitle, projectEnded, endedLast, type ProjectSummary } from "@/lib/contract/project";
import { Icon } from "@/components/ui";
import { Dropdown } from "@/components/Dropdown";

/**
 * ── TWO ROWS, then the rest on demand (owner, 2026-09-10) ───────────────────────────────────────
 * *"I want the projects to be shown 2 rows max, then All will open them below it as other rows"*.
 *
 * ~~`VISIBLE = 6`, and a chip that called `onBrowseAll`.~~ Two faults in one control. The count was
 * a guess at how many chips fit — at this card's width six wrapped onto two rows and the seventh
 * onto a third, so the row it was meant to cap grew anyway — and **the press did nothing at all**:
 * `onBrowseAll` is optional and the intake renders `<ProjectChips />` with no handler, so «All
 * projects (5)» was a dead button on the one screen a renter meets first.
 *
 * The cap is now the SHAPE it was always described as: the strip is clamped to N rows of whatever
 * height a chip actually is at this font and language, and «All projects» unclamps it in place. The
 * rest arrive as further rows under them, which is what he asked for, and no chip is unreachable.
 *
 * 🔴 **THREE rows, not two** (owner, 2026-09-13: *"the max number of pills used without white
 * space, and then if the number of projects is more it will grow to 3 rows max using all the
 * space"*). Two rows on a renter with fifteen sites left most of them behind a press while the
 * floor of the box sat empty underneath.
 */
const ROWS_COLLAPSED = 3;
/** `gap-2` on the strip — 0.5rem. Read once here so the clamp and the layout cannot drift apart. */
const ROW_GAP_PX = 8;

const today = () => new Date().toISOString().slice(0, 10);

export function ProjectChips({
  onBrowseAll,
  lead,
  trailing,
}: {
  onBrowseAll?: () => void;
  /**
   * The sentence that names what the pills are for, drawn beside them.
   *
   * 🔴 **It belongs to THIS component because this is the one that knows whether there are any**
   * (owner, 2026-09-13: *"«اختر مشروعاً» - this is only shown when user have projects"*). It used to
   * be a `<span>` in `Intake`, rendered unconditionally, while the strip beside it returns `null`
   * for a renter with no sites - so a renter who has never filed one read a question with no answers
   * anywhere near it, on the first screen he meets.
   *
   * ⚠️ A slot rather than a string: the caller owns the wording and the type scale it is drawn at,
   * and the intake is not the only surface that may want the strip.
   */
  lead?: ReactNode;
  /**
   * The floor's own controls, drawn at the END of the control row.
   *
   * 🔴 **The row's order is a standing rule** (owner, 2026-09-13): *"the last row of the input text
   * box is one row with select project in small font, then the project pills, then + then the arrow
   * - this is the order ALWAYS"*. They are passed IN for the same reason `lead` is: this component
   * is the one that knows how many chips fit beside them, and the split cannot be made from outside.
   *
   * ⚠️ Unlike `lead`, these are drawn even when the renter has NO sites. A guest still needs the
   * way to hand us a file and the way to send; the sentence and the chips are what disappear.
   */
  trailing?: ReactNode;
}) {
  /* ⚠️ `onBrowseAll` is KEPT and still honoured when a caller passes one — a surface that wants a
     full picker rather than more rows can have it — but the intake passes none, which is why the
     expansion below is the default behaviour rather than a second thing to wire up. */
  const t = useT();
  const { user } = useSession();
  const { state, actions } = useRfq();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  /** What is already filed at the chosen site — its work orders and requests, per machine. */
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [picking, setPicking] = useState(false);
  /* Which MACHINE was picked. The store remembers the work order (it needs the group id at submit)
     and not which row inside it, so the select needs its own memory or it would spring back to
     "pick one" the moment the terms landed. */
  const [picked, setPicked] = useState<string | null>(null);
  /** Is the strip showing every site, or the first two rows of them? */
  const [expanded, setExpanded] = useState(false);
  /**
   * The height of two rows, measured rather than assumed.
   *
   * A chip is `py-1 text-label`, and what that comes to depends on the font the locale loads — Almarai
   * has a different line box from the Latin face, so a pixel constant would clamp two rows in English
   * and one and a half in Arabic. `null` means "not measured yet", and an unmeasured strip renders
   * unclamped: showing every site for one frame is a smaller fault than hiding some of them forever
   * on a browser with no `ResizeObserver`.
   */
  const [twoRowsPx, setTwoRowsPx] = useState<number | null>(null);
  /** Whether there is anything BEYOND those two rows — the toggle is drawn only when there is. */
  const [overflows, setOverflows] = useState(false);
  const strip = useRef<HTMLDivElement | null>(null);
  /**
   * BIG **How many chips fit BESIDE the controls** (owner, 2026-09-13, as a standing rule):
   * *"the last row of the input text box is one row with select project in small font, then the
   * project pills, then + then the arrow - this is the order ALWAYS - and put the number of pills in
   * this row dynamically depending on the max fit; if the user has more projects than fit, they are
   * shown in the row ABOVE, and that row fits the whole text box as it has no buttons or text"*.
   *
   * So the overflow runs UPWARD, which no CSS wrap mode gives you: `wrap-reverse` stacks the lines
   * upward but puts the LAST items on the top line, so the two controls end up above the chips
   * instead of on the bottom row with them. The split has to be measured and made here.
   *
   * MARK `null` means «not measured yet», and an unmeasured strip puts EVERY chip on the control
   * row. It wraps, which is the old behaviour and merely untidy; the alternative - guessing a count
   * - hides sites on a browser with no `ResizeObserver`, and hiding is the fault this exists to fix.
   */
  const [fitCount, setFitCount] = useState<number | null>(null);
  /** The control row’s own chip slot, measured for width. */
  const lastRow = useRef<HTMLDivElement | null>(null);
  /* How many chips the row would hold if it held them all - the chosen site plus the rest. */
  const chipCount = (state.project ? 1 : 0) + (projects?.filter((x) => x.id !== state.project?.id).length ?? 0);

  /* `actions` is rebuilt on every render of the store's provider. Listing it as a dependency would
     re-run the fetch on each of those renders; leaving it out silently would age. Held in a ref, the
     effect always calls the current one and still runs only when the user changes. */
  const act = useRef(actions);
  act.current = actions;

  useEffect(() => {
    // Guests have no sites, and asking on their behalf would 401 on every intake load.
    if (!user) return;
    let live = true;
    listProjects()
      .then((rows) => {
        if (!live) return;
        setProjects(rows);

        /* Arrived from a site's own *New request* button, which passes `?project=<id>`.
         *
         * Read off `window.location` rather than `useSearchParams`, which would oblige every page
         * rendering the intake to carry a Suspense boundary for a convenience. This runs in an
         * effect, so there is no server render to disagree with.
         *
         * An id that matches nothing is ignored in silence: a stale or hand-edited link should drop
         * the renter into an ordinary intake, not an error about a site they never asked for. */
        const wanted = new URLSearchParams(window.location.search).get("project");
        const match = wanted ? rows.find((r) => r.id === wanted) : undefined;
        if (match) act.current.selectProject(match);
      })
      // A failed fetch renders the row away rather than an error. The renter came here to write a
      // request; a site is an optional convenience and must never stand in the way of that.
      .catch(() => live && setProjects([]))
      .finally(() => {});
    return () => {
      live = false;
    };
  }, [user]);

  /* What is filed at the CHOSEN site. A site with nothing in it yet has nothing to copy, and that is
     the normal first case — so a failure and an empty list land in the same place: no dropdown at
     all, rather than an error about a convenience the renter never asked for. */
  const chosenId = state.project?.id ?? null;
  useEffect(() => {
    if (!chosenId) {
      setTemplates([]);
      setPicked(null);
      return;
    }
    let live = true;
    listTemplates(chosenId)
      .then((rows) => live && setTemplates(rows))
      .catch(() => live && setTemplates([]));
    return () => {
      live = false;
    };
  }, [chosenId]);

  /**
   * Measure a chip, and ask whether the strip needs more than two rows of them.
   *
   * Re-runs on every resize of the strip itself (the card is fluid, and the sidebar-less phone layout
   * fits two chips where the desktop fits six), and whenever the chips change — a picked site moves
   * out of the list and into the pill, which can be the difference between two rows and three.
   */
  useEffect(() => {
    const el = strip.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const first = el.firstElementChild as HTMLElement | null;
      const rowH = first?.offsetHeight ?? 0;
      if (!rowH) return;
      const cap = rowH * ROWS_COLLAPSED + ROW_GAP_PX * (ROWS_COLLAPSED - 1);
      setTwoRowsPx(cap);
      // A 1px tolerance: sub-pixel line boxes otherwise report a two-row strip as overflowing.
      setOverflows(el.scrollHeight > cap + 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  });

  /**
   * The split: fill the control row, send the rest upward.
   *
   * ⚠️ Measured off a RULER - every chip rendered once, off-screen and on one line - rather than
   * off the chips on screen. The chips on screen are the OUTPUT of this calculation, so reading
   * their widths to decide it is a loop that settles on the wrong answer the first time the strip
   * re-wraps.
   *
   * ⚠️ Greedy from the START, so the chosen site (which `ordered` puts first) is always on the
   * control row. It is the one chip that answers the question the row is asking.
   */
  /**
   * The split: fill the control row, send the rest upward.
   *
   * 🔴 **Two phases, and ONE render of each chip.** The first cut measured a hidden «ruler» - every
   * chip drawn a second time, off-screen, on one line - and that put every site name in the DOM
   * twice. `aria-hidden` keeps it from a screen reader; it does not keep it from anything else, and
   * twelve tests started finding two of every project.
   *
   * So: while `fitCount` is null the row holds EVERY chip (clipped, for one frame), which is the
   * measurement; then it holds the ones that fit. The width is what invalidates it.
   *
   * ⚠️ Greedy from the START, so the chosen site - which `ordered` puts first - is always on the
   * control row. It is the one chip that answers the question the row is asking.
   */
  /* ⚠️ `useLayoutEffect`, not `useEffect`: this is a MEASUREMENT that decides layout, so it has
     to run before the browser paints - otherwise the renter sees one frame of every chip crammed
     into the control row. It is also what makes the update flush synchronously, which is how the
     split settles in one commit instead of being scheduled after the frame. */
  useLayoutEffect(() => {
    const row = lastRow.current;
    if (!row) return;
    /* ⚠️ Measure only while the row is holding EVERY chip - that IS the measurement. Reading it
       once and trusting the answer forever breaks on a remount and on any width change; re-reading a
       row that already holds the SPLIT would creep one chip at a time instead. */
    if (row.children.length !== chipCount) return;

    /**
     * 🔴 **Ask the browser which chips are on the first LINE; do not compute it.**
     *
     * ~~Greedy arithmetic: available width, minus each chip’s `offsetWidth`, minus a gap constant.~~
     * It was one chip short every time (owner, 2026-09-14, on a row with room to spare: *"why only 2
     * pills in last row, it must fit the third one"*). Three sources of error, and they only ever
     * accumulate in the same direction: `offsetWidth` rounds UP to whole pixels, the gap constant is
     * a second copy of `gap-2` that nothing keeps in step, and the width is read a frame before the
     * face the locale loads has settled.
     *
     * While the count is unknown the row WRAPS with every chip in it, so the browser has already
     * done this layout. `offsetTop` says which line each chip landed on, and the ones on the first
     * line are - exactly, by definition - the ones that fit.
     *
     * ⚠️ A 2px tolerance, not equality: `items-center` centres chips of unequal height within a
     * line, so two chips on the SAME line can differ by a pixel or two.
     */
    const kids = Array.from(row.children) as HTMLElement[];
    if (kids.length === 0) return;
    const firstLine = Math.min(...kids.map((el) => el.offsetTop));
    const k = kids.filter((el) => el.offsetTop - firstLine <= 2).length;

    /* ⚠️ At least one, always. A site whose name is wider than the slot would otherwise leave the
       control row with no chip at all - which reads as «you have no projects» beside a «Select a
       project» that is asking about some. */
    const next = Math.max(1, k);
    setFitCount((prev) => (prev === next ? prev : next));
  });

  /* ⚠️ The width is the only thing that can change the answer, so it is the only thing that
     re-opens the question. Resetting on every render would measure a row that already holds the
     SPLIT and creep one chip at a time. */
  useEffect(() => {
    const row = lastRow.current;
    if (!row || typeof ResizeObserver === "undefined") return;
    let last = row.clientWidth;
    const ro = new ResizeObserver(() => {
      if (row.clientWidth !== last) {
        last = row.clientWidth;
        setFitCount(null);
      }
    });
    ro.observe(row);
    return () => ro.disconnect();
  }, []);

  /* ⚠️ A site added, removed or chosen changes the chips themselves, so the count is stale.
     The first run is SKIPPED: on mount it would land in the same commit as the measurement above and
     undo it, and the strip would then re-measure every render - a loop that never settles. */
  const firstList = useRef(true);
  useEffect(() => {
    if (firstList.current) {
      firstList.current = false;
      return;
    }
    setFitCount(null);
  }, [projects?.length, chosenId]);

  /**
   * One thing filed at this site applies ITSELF (owner, 2026-09-01).
   *
   * A dropdown with a single row is a question with one answer: the renter opens it, reads the only
   * entry, and picks the thing he would have been given anyway. With two or more there is a real
   * choice, so the list opens instead (`defaultOpen` on the pill below) and he makes it.
   *
   * Guarded on `templateTerms` so it fires once: applying writes to the store, which re-renders this,
   * and without the guard the machine line would be appended to the text on every pass.
   */
  useEffect(() => {
    if (templates.length !== 1 || state.templateTerms || picking) return;
    void applyTemplate(templates[0].itemId);
    // `applyTemplate` reads the store's own current values; re-running on its identity would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates, state.templateTerms, picking]);

  // Already picked — the pills have taken over the strip.
  /* ⚠️ The CHIPS need sites; the controls do not. A renter with none still gets the floor row,
     with the `+` and the arrow where they always are - see `trailing`. */
  if (!user || !projects?.length) {
    return trailing ? <div className="flex w-full items-center justify-end gap-2">{trailing}</div> : null;
  }

  const chosen = state.project;
  /* The chosen one leads and is not repeated among the rest. Six of the others, which is enough to
     cover a renter's live jobs without becoming a list. */
  const ordered = endedLast(projects, today()).filter((p) => p.id !== chosen?.id);

  /**
   * Copy how this renter HIRES at this site — never what they are hiring.
   *
   * The terms become pills on the request; the MACHINE goes in as TEXT (owner, 2026-08-31), because
   * equipment is not a closed set of answers: the renter may want the same terms on a bigger
   * excavator, and a chip they cannot retype would make them delete it to say so. Appended, never
   * replacing what is already typed.
   */
  /**
   * Write the machine into the box the way a person would — a character at a time.
   *
   * ── Why not just set it ─────────────────────────────────────────────────────────────────────────
   *
   * It appeared whole, in one frame, after the renter had already typed something above it (owner,
   * 2026-08-31: *"I want it shown as typed, like someone is really typing this item in the text, not
   * directly copied"*). A line that materialises in a box you were writing in reads as a glitch: the
   * eye never sees it arrive, so the renter's first question is whether they typed it. Typed out, the
   * same words are unmistakably an ACTION that just happened, with a cause they can point at — they
   * pressed a template a moment ago.
   *
   * 14ms a character: about 70 a second, faster than anyone types and slow enough to be seen
   * arriving. A twenty-character machine name is under a third of a second, so nobody waits for it.
   *
   * ── And MANSOUR is the one writing it ───────────────────────────────────────────────────────────
   *
   * Owner, 2026-09-13: *"use it here for typing when u select a project and it auto fills the
   * equipment name, make it like this mansour is writing it"*. The words already arrived as typing;
   * what was missing was WHO. `agentTyping` is raised for the length of the run and the intake draws
   * him on the box while it is up - the same agent the processing screen shows, doing the same job
   * one screen earlier.
   *
   * ⚠️ Lowered in a `finally`, so a throw mid-write cannot leave him standing there forever.
   *
   * ── It stays interruptible ──────────────────────────────────────────────────────────────────────
   *
   * Each frame appends to the SNAPSHOT taken before it started, never to the live value, so a renter
   * typing while it runs does not have their keystrokes overwritten by a stale base: the animation
   * finishes writing its own line and stops. It only ever writes the tail of the box, so the caret is
   * never taken from them either.
   */
  async function typeInto(before: string, line: string) {
    const base = before ? `${before}
` : "";
    actions.setAgentTyping(true);
    try {
      for (let i = 1; i <= line.length; i++) {
        actions.setText(base + line.slice(0, i));
        // A typewriter is sequential by definition; this await is the point of the loop.
        await new Promise((r) => setTimeout(r, 14));
      }
      // Marked AFTER the last character, so the colour arrives with the finished word rather than
      // chasing the caret across the screen.
      actions.markProjectTyped(line);
      /* He stays a beat after the last character, reading it back. Cutting him at the same frame as
         the final letter reads as a flicker rather than as somebody finishing a sentence - and a
         short name («Grader», six characters, 84ms) would otherwise never be seen at all. */
      await new Promise((r) => setTimeout(r, 900));
    } finally {
      actions.setAgentTyping(false);
    }
  }

  async function applyTemplate(itemId: string) {
    const option = templates.find((x) => x.itemId === itemId);
    if (!option || !chosen) return;
    setPicking(true);
    setPicked(itemId);
    try {
      const terms = await fetchTemplateTerms(chosen.id, option);
      actions.useTemplate(terms, option.kind === "work_order" ? option.id : null, option.when);

      /* ── A template with no NAME copies its terms and writes nothing (owner, 2026-09-12) ───────
         *"why the equipment name doesn't appear here, why showing null"* — on a chip that had typed
         «12 × null» into the request box, twice.

         `option.machine` is `ChartItem.label`, which is genuinely absent for an off-catalogue line:
         the chart's projection names a request's item from its taxonomy pair alone, and that pair is
         empty. It was TYPED `string`, so nothing objected, and `${null}` in the template literal
         produced the four characters «null» — which `trim()` then reported as a perfectly good line
         and the typewriter wrote into the renter's own words, where it went on to the agent as if he
         had asked for a machine called null.

         The terms still apply: they are what a template is FOR, and they are keyed on the item, not
         on its name. Only the sentence is withheld, because there is no name to put in it. */
      const name = option.machine?.trim();
      if (name) {
        const line = `${option.quantity > 1 ? `${option.quantity} × ` : ""}${name}`;
        await typeInto(state.text.trimEnd(), line);
      }
    } catch {
      // Nothing is applied and nothing is said. A template is a shortcut; failing to take one leaves
      // the renter exactly where they were, which is a working request form.
    } finally {
      setPicking(false);
    }
  }

  const clamped = !expanded && twoRowsPx != null;

  /**
   * 🔴 **The chips as an ARRAY, so the row can be packed** (owner, 2026-09-13, as a standing rule):
   * *"the last row is one row with select project, then the pills, then +, then the arrow - always -
   * and put the number of pills in this row dynamically depending on the max fit; more than fits is
   * shown in the row ABOVE, and that row fits the whole text box as it has no buttons or text"*.
   *
   * ⚠️ They were one wrapping flow until now. A flow cannot answer this: the overflow has to run
   * UPWARD while the controls stay on the bottom line, and no CSS wrap mode does that -
   * `wrap-reverse` stacks lines upward but puts the LAST items on the TOP line, which would leave
   * the `+` and the arrow floating above the sites.
   */
  /* 🔴 **A chip never wraps its own name** (owner, 2026-09-14: *"this is also not allowed, never
     wrap it"*, on a pill broken across two lines mid-place-name). `whitespace-nowrap` keeps each
     one a single run, and `flex-none` stops the row shrinking them to make another fit - which is
     the same wrap by another route. A name too wide for the row is CLIPPED by the row instead:
     the split below always leaves at least one chip on it, and half a name that is obviously cut
     reads better than a pill two lines tall. */
  const chipNodes: ReactNode[] = [
/* ~~«Pick a site, and half of this fills itself in», in an amber chip at the head of the
          row.~~ Removed (owner, 2026-09-02). It was written to give the row a reason to be pressed,
          and it sat in the row it was advertising: an amber pill among the site pills, the same size
          and shape as the things it was pointing at. What a site does is obvious the first time one
          is picked, and after that the sentence is furniture. */

      /* ── The chosen site, and the dropdown of what is filed under it ──────────────────────────
          Marked with the brand, so the row says which of these is answering the request. The native
          `select` covers the whole pill at zero opacity: the press target is the pill, the menu opens
          where the platform puts it, and the × stays above the layer so clearing the site cannot open
          the list by accident. */
      chosen ? (
        <span key="chosen" className="flex flex-none items-center gap-1.5 whitespace-nowrap rounded-full border border-brand bg-brand-soft px-3 py-1 text-label font-semibold text-navy">
          <Icon name="place" size={13} className="flex-none text-brand" />
          {chosen.title}
          {/* Applied is stated, not implied: a renter who has already copied a machine's terms
              should not have to open the list to find out. */}
          {state.templateTerms && <span className="font-normal text-muted">· {t.projects.pills.templateApplied}</span>}

          {/* ── What is already filed at this site ────────────────────────────────────────────────
              The house `Dropdown`, not a native `select` behind an invisible layer (owner,
              2026-08-31). Two things it fixes on this control alone: the list is the app's own —
              ticked row, our type, our border, instead of the OS menu's blue bar — and there is no
              «start from» row at the top of it. That row was the placeholder a native select needs
              to have nothing selected; it read as a fourth machine you could pick and it does
              nothing. The invitation belongs on the trigger, which the pill already is.

              Keyed by MACHINE id, not by the order it sits in — two machines on one order are two
              entries, and picking either copies its own answers. The machine's name leads, because
              that is what the renter is looking for; the kind and reference are the hint under it,
              to tell two of the same machine apart. */}
          {templates.length > 0 && (
            <Dropdown
              /* Opens ITSELF the moment a site is chosen (owner, 2026-09-01) — the renter picked the
                 project, and «what have I already hired here?» is the next question, not one they
                 should have to find a caret for. Keyed by the project so choosing another site opens
                 that one's list; `defaultOpen` is read at mount, so closing it keeps it closed. */
              key={chosen.id}
              defaultOpen={!state.templateTerms}
              tone="bare"
              label={t.projects.pills.startFrom}
              placeholder=""
              disabled={picking}
              value={picked}
              onChange={(v) => void applyTemplate(v)}
              options={templates.map((tpl) => ({
                value: tpl.itemId,
                label: tpl.machine || tpl.ref,
                hint: `${tpl.kind === "work_order" ? t.projects.pills.kindWorkOrder : t.projects.pills.kindRequest} ${tpl.ref}`,
              }))}
            />
          )}

          <button
            type="button"
            onClick={() => actions.clearProject()}
            aria-label={t.common.close}
            className="relative z-10 -me-0.5 grid h-4 w-4 place-items-center rounded-full text-muted transition hover:bg-surface hover:text-navy"
          >
            <Icon name="close" size={11} />
          </button>
        </span>
      ) : null,

      ...ordered.map((p) => {
        const ended = projectEnded(p, today());
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => actions.selectProject(p)}
            /* Brand-outlined rather than grey (owner, 2026-09-01: *"project pills need to be more
               visible"*). Outlined and not filled: filled would compete with Continue, which is the
               one thing on this screen that should read as the next step. */
            className="flex flex-none items-center gap-1.5 whitespace-nowrap rounded-full border border-brand/45 bg-surface px-3 py-1 text-label font-semibold text-brand-deep transition hover:border-brand hover:bg-brand-soft"
          >
            <Icon name="place" size={13} className="flex-none text-brand" />
            {projectTitle(p)}
            {/* Tagged, not hidden — see the note at the top. */}
            {ended && <span className="text-meta font-semibold text-muted">{t.projects.chips.ended}</span>}
          </button>
        );
      }),
    ];

  /* ⚠️ Unmeasured puts every chip on the control row, where it wraps - untidy, and visible.
     Guessing a count instead would HIDE sites on a browser with no `ResizeObserver`, and hiding is
     the fault this whole strip exists to avoid. */
  /**
   * 🔴 **Every entry must RENDER, or the count lies** (owner, 2026-09-14: *"why only 2 pills in
   * last row, it must fit the third one"*).
   *
   * The chosen site is a conditional, so with nothing chosen its slot held `null` - an array entry
   * that takes a place and draws nothing. `slice(0, 3)` on `[null, a, b, c]` is `[null, a, b]`: TWO
   * chips on a row the measurement had correctly said would hold three. The split was right and the
   * slice was wrong, which is why the row looked one short at every width.
   *
   * ⚠️ Dropped here rather than at the branch, so any future conditional chip is covered by the
   * same rule instead of having to remember it.
   */
  const chips = chipNodes.filter(Boolean);
  const onRow = fitCount ?? chips.length;
  const above = chips.slice(onRow);
  const showToggle = above.length > 0 && (overflows || expanded || true);

  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      {/* ── The rows ABOVE: the sites that did not fit, and nothing else ──────────────────
          ⚠️ Full width, because there is no lead and no controls up here to make room for - which
          is the owner’s own note: *"the second row above the last one will fit the whole text box"*.
          ⚠️ The toggle leads this strip rather than closing it. Clamped to one row, a toggle at the
          END is the item most likely to be the one cut off - and it is the only way to see the rest. */}
      {above.length > 0 && (
        <div
          ref={strip}
          className={`flex min-w-0 flex-wrap items-center gap-2${clamped ? " overflow-hidden" : ""}`}
          style={clamped ? { maxHeight: twoRowsPx } : undefined}
        >
          {showToggle && (
            <button
              type="button"
              onClick={() => (onBrowseAll ? onBrowseAll() : setExpanded((v) => !v))}
              aria-expanded={onBrowseAll ? undefined : expanded}
              className="flex-none whitespace-nowrap rounded-full border border-dashed border-border px-3 py-1 text-label font-semibold text-muted transition hover:border-brand hover:text-brand"
            >
              {expanded && !onBrowseAll ? t.projects.chips.fewer : `${t.projects.chips.all} (${ordered.length})`}
            </button>
          )}
          {above}
        </div>
      )}

      {/* ── The control row, ALWAYS last and always in this order ───────────────────────
          the sentence · the sites that fit · the `+` · the arrow. */}
      <div className="flex w-full min-w-0 items-center gap-2">
        {lead}
        {/* ⚠️ `flex-1` and `flex-nowrap`: this slot IS the measurement, so its width is what the
            row's own width is compared against, and a miscount must CLIP rather than wrap - a wrapped chip
            here would push the controls onto a line of their own, which is the shape being fixed. */}
        {/* ⚠️ **It WRAPS while the count is unknown, and only then.** `nowrap` is what lets the
            measurement see each chip’s true width, but a row that is still measuring must never
            CLIP: on a browser with no `ResizeObserver`, or before the first layout, every site would
            be hidden behind an edge with nothing saying so. Wrapping is untidy for a frame and
            loses nothing, which is the same trade the two-row clamp has always made. */}
        <div
          ref={lastRow}
          className={`flex min-w-0 flex-1 items-center gap-2 ${fitCount === null ? "flex-wrap" : "flex-nowrap overflow-hidden"}`}
        >
          {chips.slice(0, onRow)}
        </div>
        {trailing}
      </div>
    </div>
  );
}
