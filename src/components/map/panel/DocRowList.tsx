"use client";

/**
 * Deal-room equipment verification (spec 004 v3) — the **document-row grammar** V8 and V9 share.
 *
 * §6.6: *"Both use the same grammar: select-all, a checkbox per row, a thumbnail with a status dot, a
 * name, a status line, and download."* Written once, because the moment the two lists are typed out
 * separately they start drifting — and the things that must differ between them are exactly the things
 * a shared component makes visible: the `statusLine` and the `dot` a caller passes, and whether it
 * passes selection at all.
 *
 * **Selection is OPTIONAL, and what a tick MEANS is the caller's** — that is the 2026-08-08 pair of
 * rulings in two props. A document request names a machine, so only the equipment tab may raise one and
 * §6.6's "both use the same grammar" is no longer true of *asking*. But both lists tick: the company
 * panel supplies `selected` / `onToggle` / `onToggleAll` too, and its batch **downloads** the selection
 * instead of requesting it (AC-72). The shared grammar is the ROW and the TICK; the verb underneath the
 * list is not shared, and never was.
 *
 * **ONE checkbox column, two mutually exclusive modes** (owner's UI design, 2026-08-08). A tick on a
 * **held** row means *download*; a tick on a **missing** row means *request*. The kind that does not
 * match the mode currently held **dims to 45% and goes inert** — the input is disabled, marked
 * `aria-disabled` and out of the tab order, because a control that looks dead but still takes a click is
 * worse than one that looks alive. Which mode is live is the caller's (`mode`), inferred by
 * `selectionModeOf` from the ticked set; this component paints it.
 *
 * **`DocRowView.selectable` is still the ONE place a row's tickability is decided** — it now takes the
 * mode (`docRowSelectable`) rather than having grown a parallel mechanism beside it. The rule under it is
 * unchanged: *a tick must be answerable by the batch underneath it*. The company panel's batch saves, so
 * a paper with **no url** cannot be ticked; the equipment tab's ask-batch still names only papers that
 * are **not there**. See the field's own note.
 *
 * **Every row that carries a file is openable** (004a §7, AC-69, as narrowed 2026-08-08). The document
 * families on this surface — the machine's papers, the machine's photos, and the firm's papers — arrive
 * here, so the control is written once, here, and cannot drift between them. It is **view only**: the
 * per-row download is withdrawn, because downloading is now what the batch does. §6.6's "presence only"
 * governs **verification state**, not reachability (004a §7.2): an equipment row still carries no verify
 * badge and no expiry, and it is still opened with one click.
 *
 * **Pressing the ROW opens it in the panel's viewer** (owner, 2026-08-11) — the prototype's own
 * behaviour, whose `eqDocsTab` comment reads *"Every row opens in the viewer above"* (`app-decoded.js`
 * 4332, 4366). Until now a row did exactly one thing, select, and looking at a paper meant finding the
 * small `↗` at its trailing edge.
 *
 * **The press and the tick are independent by CONSTRUCTION, not by a guard.** The prototype hangs the
 * click on the row `<div>` and then has to `stopPropagation()` out of the checkbox and the download
 * control inside it; here the openable region is its **own** `<button>` holding the name, the status
 * line and the thumbnail, with the checkbox and the `↗` links as its SIBLINGS. Nothing bubbles from one
 * to the other, so pressing the row cannot tick it and ticking it cannot open anything — there is no
 * ordering, no propagation and no handler to get wrong.
 *
 * ~~**The `↗` links stay** (AC-69). They are not the same act: the press puts the paper in the frame at
 * the top of the panel, the link opens the file itself in a tab — which is the only thing that works
 * for a PDF, and the only way to reach the SECOND and third files of a row that holds several.~~
 *
 * **The row's own arrow is gone** (owner, UAT of 2026-08-11: *"no per-row arrow"* — the prototype has
 * none, and ours drew one on every row). Half the argument above expired on the same day: the frame
 * renders a PDF now (`EquipmentDetail`'s `<object>` fallback), so the tab is no longer the only thing
 * that works on one. The other half is real and is what survives — a row holding SEVERAL files can put
 * only its first in the frame, so **the extra files keep their arrows and the first does not**. On the
 * lists the owner was reading, where every row holds one file, that is no arrow at all.
 *
 * **A list with no frame to press into keeps every arrow** (`onView` omitted — the company panel). Its
 * rows do not press, so the arrow is the only way to a paper there, and removing it would leave a
 * document surface with no way to read a document. The ruling was about a row that already opens.
 *
 * The press opens `docRowActions(row)[0]`, so the frame and the arrows partition one list of files
 * between them and cannot disagree about which paper the row stands for.
 *
 * ~~**The operator's certificates are the deliberate exception** (owner, 2026-08-08): they are a status —
 * on file or not — and expose no file at all… no checkbox and no ask either.~~ **They are not rendered
 * by anything any more** — the group left the equipment tab in the owner's UAT of 2026-08-11 and the
 * operator's one surviving statement is a match-grid cell. The mechanism the exception rode on is not a
 * special case and never was, so nothing here changes: a row arriving with no url and `requestable:
 * false` still has `mode === null`, and a `null`-mode row still draws the held spacer, no tick and no
 * controls. A held paper whose link the projection did not carry is one, and it is why the branch stays.
 *
 * **Usage** — the caller owns selection state and the batch send; this renders and reports ticks.
 *
 *   <DocRowList
 *     groupLabel={L("Photos", "الصور")}
 *     attention={group.attention}
 *     rows={group.rows.map((r) => ({ key: r.key, name: L(r.label.en, r.label.ar),
 *       status: L(r.statusLine.en, r.statusLine.ar), dot: r.status,
 *       thumbUrl: r.thumbUrl, downloadUrl: r.downloadUrl,
 *       mode: docRowMode(r), selectable: docRowSelectable(r, mode) }))}
 *     selected={selected} onToggle={toggle} onToggleAll={toggleAll} ar={ar} L={L} />
 *
 * Nothing here fetches, posts or navigates.
 */

import {
  arDigits,
  docRowActions,
  type Bilingual,
  type CompanyDocStatus,
  type DocFile,
  type PresenceStatus,
  type SelectionMode,
} from "./machine-panel-model";

/** The status dot's look. `present`/`verified` green · `on_file` blue · **`missing` red**.
 *  ~~amber~~ — withdrawn 2026-08-09 with the rest of the amber family; `panel-proto.css` §missing
 *  carries the reasoning and the struck argument it replaces. */
export type DotState = PresenceStatus | CompanyDocStatus;

export interface DocRowView {
  key: string;
  name: string;
  /** The already-localised status sentence. Equipment rows put presence here and **never** a
   *  verification badge or an expiry (§6.6, AC-39); company rows put verification and expiry (AC-40). */
  status: string;
  dot: DotState;
  /** A photo's own image. Null renders the paper glyph instead of a broken thumbnail. */
  thumbUrl: string | null;
  /** The row's first presigned url — what **view** points at (AC-69, `docRowActions`). Null renders no
   *  control at all: a dead button is worse than none, and the empty actions cell is the honest signal
   *  that this paper is missing. The cell keeps its width in CSS, so a row without a file is the same
   *  shape as one with it — the renter reads this list by its shape before its words. */
  downloadUrl: string | null;
  /** **Every** file behind this row, when the caller has them. A machine's paper row can hold several
   *  (an istimara AND a customs card under one ownership heading, two TÜV uploads under one certificate)
   *  and each gets its own view control — the row used to expose the first url and silently drop the
   *  rest. Absent for the firm's papers, which carry one file and only a `downloadUrl`. */
  files?: readonly DocFile[];
  /**
   * Which batch this row's tick would feed — `"download"` for a held, reachable paper, `"request"` for
   * a missing one, **`null` for a row no batch can answer** (a held paper whose link the projection did
   * not carry, and the operator's certificates, which carry no url by design).
   *
   * It is `docRowMode(row)`, and it exists here so the select-all bar can offer «حدّد كل المتاح» and
   * «حدّد كل الناقص» separately, and so a row of the *other* kind can be dimmed rather than silently
   * omitted. `null` keeps today's behaviour exactly: no checkbox, a held spacer, no dimming.
   */
  mode: SelectionMode | null;
  /**
   * May this row be ticked **right now**? **Defaults to true**, so a caller that has no opinion is
   * unchanged.
   *
   * **One rule, stated by the caller: a tick must be answerable by the batch underneath it.** Each list
   * reaches that from its own side, and the two are not in tension — they are the same sentence about
   * different verbs (owner rulings, 2026-08-08):
   *
   * - the **company** panel's batch *saves* files, so a row with no url cannot be ticked — there is
   *   nothing to save, and a tick that yields nothing is the dead control AC-69 forbids, moved one step
   *   later;
   * - the **equipment** tab's *ask*-batch still names only a **missing** row — you can only ask for what
   *   is not there, and an ask naming a paper the lessor can see on his own file has one possible
   *   answer, "it is already there". Its *download* batch takes the held rows instead, which is the
   *   second mode, not a second rule.
   *
   * **And it now takes the mode**: `docRowSelectable(row, mode)` is false for a row whose own `mode`
   * differs from the one the selection is in, which is what keeps the two kinds from mixing. Extending
   * this flag was chosen over adding a second one so there stays exactly one answer to "may I tick
   * this?". No judgement is made here: the model — `docRowMode`, `DocRow.requestable`,
   * `companySelectableKeys` — is the single place the rule lives, so the checkbox and the batch cannot
   * disagree.
   */
  selectable?: boolean;
}

const DOT_GLYPH: Record<DotState, string> = {
  present: "✓",
  verified: "✓",
  on_file: "•",
  missing: "!",
};

export function DocRowList({
  groupLabel,
  attention,
  rows,
  selected,
  onToggle,
  onToggleAll,
  onView,
  viewingKey,
  L,
}: {
  groupLabel: string;
  /** Rows needing action — **never a total** (§6.1, AC-42). ~~`null` renders no pill at all, for a group
   *  that makes no attention claim: the operator's certificates.~~ That group left the equipment tab in
   *  the UAT of 2026-08-11 and was the only caller that ever passed `null`, so every group carries a
   *  count again and the pill is unconditional. */
  attention: number;
  /**
   * **The mode arrives already applied**, in each row's `selectable` — there is deliberately no `mode`
   * prop. One selection spans every group on the equipment tab, so the mode is the caller's to compute
   * (`selectionModeOf`), and a row that the mode has ruled out arrives with `selectable: false`. Passing
   * the mode down as well would be the same fact stated twice, in two places that could disagree.
   */
  rows: DocRowView[];
  /** Ticked keys. **Omit all three** — `selected`, `onToggle`, `onToggleAll` — for a list with no batch
   *  action at all, and then no tick, no select-all bar, and nothing on the row but reading and opening
   *  it. Both lists on this surface do supply them; what the batch then does is theirs to decide. */
  selected?: ReadonlySet<string>;
  onToggle?: (key: string) => void;
  /** Select-all / clear-all over THIS group's keys. */
  onToggleAll?: (keys: string[], select: boolean) => void;
  /**
   * Show this row in the panel's viewer (owner, 2026-08-11). **Optional, and a list that omits it keeps
   * exactly today's behaviour** — the row's body renders as a plain block and only the `↗` opens
   * anything. The company panel is the caller with nothing to hand a row up TO: its list opens over the
   * whole panel (`.mp-over`) and has no frame of its own, so it passes nothing and its rows do not press.
   *
   * The `href` is resolved here rather than by the caller, from `docRowActions(row)[0]` — the row's
   * primary file. That keeps "which paper is this row?" a single answer shared with the glyphs beside
   * it, instead of a rule each caller re-derives from `downloadUrl` / `files`.
   */
  onView?: (row: DocRowView, href: string) => void;
  /** The key of the row currently IN the viewer, so the list can say which one the frame is showing.
   *  Only one row can be, and a key that matches nothing here simply marks nothing. */
  viewingKey?: string | null;
  L: (en: string, ar: string) => string;
}) {
  // All three arrive together or not at all: a tick with no handler is a control that silently fails.
  // This is the LIST's question (does this list tick at all?); `r.selectable` is the ROW's.
  const hasSelection = !!selected && !!onToggle && !!onToggleAll;

  /* Does ANY row here still draw an arrow? The actions cell reserves a fixed width so every row in a
     list is the same shape, and with the per-row arrow withdrawn (see the file header) a list of
     single-file rows would otherwise hold 34 px of empty gutter beside every row for a control none of
     them has. It is a question about the LIST, not the row, for exactly that reason: the moment one row
     holds two files, every row keeps the gutter and the column stays straight. */
  const arrowsShown = rows.some((r) => docRowActions(r).length > (onView ? 1 : 0));

  // Select-all is per MODE, so it can never be the control that mixes the selection. Each list covers
  // only the rows that can be ticked right now, which means the one belonging to the other mode is
  // empty while a mode holds and simply does not render.
  const keysOf = (m: SelectionMode) => rows.filter((r) => r.mode === m && r.selectable !== false).map((r) => r.key);
  const downloadKeys = keysOf("download");
  const requestKeys = keysOf("request");
  const notAllOn = (keys: string[]) => keys.length > 0 && !keys.every((k) => selected!.has(k));
  const pickedKeys = hasSelection ? rows.filter((r) => selected!.has(r.key)).map((r) => r.key) : [];

  // **ONE select-all link, never two** (owner, from his own prototype, 2026-08-08). Once a mode holds,
  // the other mode's rows are unselectable and its key list is **empty**, so the ordering below resolves
  // to that mode's own link without needing to be told which mode it is in.
  //
  // **At NEUTRAL the MAJORITY decides** (owner's ruling, same day): *"if more than half is available then
  // download; if more than half is missing, the request will be the enabled one."* The link offered is
  // the one most of the group's rows would answer, so the common act is the one click away.
  //
  // **The majority is counted over the TICKABLE rows, and it has to be.** `downloadKeys` / `requestKeys`
  // are already `r.mode === m && r.selectable !== false` — so a held paper whose url the projection did
  // not carry, and every operator certificate, are outside both counts. They are also outside both key
  // lists, so counting them could hand the majority to a link that then selected nothing: a group of six
  // operator rows and two held papers would offer «حدّد كل الناقص» and tick nothing at all.
  //
  // **A tie falls to «حدّد كل المتاح».** "More than half" leaves 50/50 undecided, and download is the
  // side with no outward consequence — it arms «تنزيل», whose worst outcome is files the renter could
  // already open landing on his own disk, against «اطلب من المورد إرساله», whose worst outcome reaches
  // the lessor. It also matches the company panel, whose single kind of row has only ever offered «حدّد
  // كل المتاح».
  //
  // The loser is a **fallback, not a discard**: when the preferred list is already fully ticked the other
  // is offered if it has anything left, so a group can never end up with tickable rows and no way to tick
  // them at once. (While a mode holds the other list is empty, so this only ever fires at neutral.)
  const byMajority: { keys: string[]; label: Bilingual }[] = [
    { keys: downloadKeys, label: { en: "Select all available", ar: "حدّد كل المتاح" } },
    { keys: requestKeys, label: { en: "Select all missing", ar: "حدّد كل الناقص" } },
  ];
  if (requestKeys.length > downloadKeys.length) byMajority.reverse();
  const selectAll = hasSelection ? (byMajority.find((s) => notAllOn(s.keys)) ?? null) : null;

  // **The bar's control is a CHECKBOX again** (2026-08-09) — the prototype's and the owner's screenshot
  // both put a real box beside the label, and this had become two text link-buttons sitting next to
  // each other with nothing to say which one governed the column of ticks below.
  //
  // **The rule underneath is untouched**: still one entry, still chosen by majority at neutral and by
  // the mode once one holds (`selectAll` above, owner's ruling 2026-08-08). What changes is that the
  // entry now has the two states a select-all has always had. `selectAll` is the list with something
  // left to tick, so it answers "unchecked"; when it is null every list is either empty or fully
  // ticked, and the first non-empty one is the list this bar governs — checked, and unticking it is
  // what the box then does. A checked box that cannot be unchecked is the dead control AC-69 forbids.
  const governing = hasSelection ? (selectAll ?? byMajority.find((s) => s.keys.length > 0) ?? null) : null;
  const governingOn = !!governing && !notAllOn(governing.keys);

  return (
    <div className="mp-grp">
      <div className="mp-grp-h">
        <span>{groupLabel}</span>
        {/* The prototype's own wording, both halves (2026-08-09): «يحتاج انتباه» over our «بحاجة إلى
            إجراء», and «مكتملة» over «لا ينقص شيء». The owner's screenshot says «١ يحتاج انتباه» too,
            so this is one of the places where both sources agree and we had drifted. */}
        <span className={`mp-att-pill${attention === 0 ? " done" : ""}`}>
          {attention === 0
            ? L("complete", "مكتملة")
            : L(`${attention} need attention`, `${arDigits(attention)} يحتاج انتباه`)}
        </span>
      </div>

      {/* No bar at all when this list does not tick, and none when it ticks but nothing here CAN be
          ticked — never a disabled "Select all". A control whose only reachable outcome is an empty
          batch is the dead control AC-69 forbids, moved one step later.

          ~~At NEUTRAL both links can appear~~ — withdrawn by the owner on 2026-08-08, against his own
          prototype: **select-all follows the mode and there is one link.** Which one it is at neutral is
          decided in `selectAll` above. */}
      {hasSelection && (pickedKeys.length > 0 || governing) && (
        <div className="mp-selbar">
          {governing && (
            <button
              type="button"
              className="mp-selall"
              aria-pressed={governingOn}
              onClick={() => onToggleAll!(governing.keys, !governingOn)}
            >
              {/* The box is the same 22 px control the rows carry, so the column reads as one column
                  from its head down. It is decoration on an already-labelled button, never the
                  control itself — hence `aria-hidden`, with the state on `aria-pressed` above. */}
              <span className={`mp-tick${governingOn ? " on" : ""}`} aria-hidden="true">
                {governingOn ? "✓" : ""}
              </span>
              <span>{L(governing.label.en, governing.label.ar)}</span>
            </button>
          )}
          {pickedKeys.length > 0 && (
            // Clearing back towards neutral, on the bar's OPPOSITE edge (the screenshot's layout, and
            // the only place it can go once select-all is a box on the leading one). It covers THIS
            // group's ticks, which is the same scope select-all has; when this is the only group
            // holding any, it is the whole way back.
            <button type="button" className="mp-linkbtn muted" onClick={() => onToggleAll!(pickedKeys, false)}>
              {L(`Clear selection (${pickedKeys.length})`, `إلغاء التحديد (${arDigits(pickedKeys.length)})`)}
            </button>
          )}
        </div>
      )}

      {rows.map((r) => {
        const tickable = hasSelection && r.selectable !== false && r.mode !== null;
        const picked = tickable && selected!.has(r.key);
        // The other mode's rows: shown, dimmed, and INERT — `disabled` takes them out of the tab order
        // and refuses the click, `aria-disabled` says so to a screen reader. A row that only *looks*
        // dead while still accepting a click is worse than one that looks alive.
        const dimmed = hasSelection && !tickable && r.mode !== null;
        // ONE resolution of "the file behind this row", read by the press and by the glyphs below, so
        // the paper the renter opens by pressing cannot be a different paper from the first `↗`.
        const actions = docRowActions(r);
        const openable = !!onView && actions.length > 0;
        const framed = viewingKey === r.key && actions.length > 0;

        /* The name, the status line and the thumbnail — the part of the row that IS the document, and
           therefore the part that opens it. The checkbox and the `↗` links stay outside it: a control
           inside a control is a click the renter cannot aim. */
        const body = (
          <>
            {/* **Text before thumbnail** (2026-08-09). The prototype and the owner's screenshot both
                read tick · text · thumbnail from the leading edge, and we had the thumbnail second.
                On eight rows that is not a detail: the names no longer start at one shared inset, so
                the column the renter actually scans is the one that zig-zags. */}
            <span className="mp-rowtx">
              <b>{r.name}</b>
              <span className={r.dot === "missing" ? "att" : undefined}>{r.status}</span>
            </span>

            <span className={`mp-thumb${r.dot === "missing" ? " missing" : ""}`}>
              {r.thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.thumbUrl} alt={r.name} />
              ) : (
                <span aria-hidden="true">{r.dot === "missing" ? "—" : "📄"}</span>
              )}
              <span className={`dot ${r.dot}`} aria-hidden="true">{DOT_GLYPH[r.dot]}</span>
            </span>
          </>
        );

        return (
          <div
            key={r.key}
            className={`mp-row${picked ? " picked" : ""}${framed ? " open" : ""}${r.dot === "missing" ? " missing" : ""}${dimmed ? " dim" : ""}`}
          >
            {tickable || dimmed ? (
              <button
                type="button"
                className={`mp-tick${picked ? " on" : ""}`}
                aria-pressed={picked}
                aria-disabled={dimmed || undefined}
                disabled={dimmed}
                aria-label={L(`Select ${r.name}`, `تحديد ${r.name}`)}
                onClick={() => onToggle!(r.key)}
              >
                {picked ? "✓" : ""}
              </button>
            ) : (
              hasSelection && (
                // A row NO batch can answer — a held paper with no url, an operator certificate. The
                // tick's width is held rather than collapsed, so the row still lines up with the rows
                // above it; the list is read by its shape before its words. A list that ticks nothing
                // has no such column to hold, so it gets no spacer either.
                <span className="mp-tick void" aria-hidden="true" />
              )
            )}

            {openable ? (
              <button
                type="button"
                className="mp-rowopen"
                // The accessible name says the ACT and then repeats the status line, because a button's
                // own name is all a screen reader reads in focus mode and the sentence under the title
                // is the row's whole verdict. Naming it "View x" alone would have hidden that.
                //
                // **The framed row's name is the way OUT**, because pressing it again is (owner's UAT of
                // 2026-08-11 removed the frame's X). A control that says "show this" and hides it is a
                // lie a screen-reader user cannot see past.
                aria-label={
                  framed
                    ? L("Back to the equipment's photo", "العودة إلى صورة المعدّة")
                    : L(`Show ${r.name} in the viewer — ${r.status}`, `اعرض ${r.name} في العارض — ${r.status}`)
                }
                title={
                  framed
                    ? L("Back to the equipment's photo", "العودة إلى صورة المعدّة")
                    : L(`Show ${r.name} in the viewer`, `اعرض ${r.name} في العارض`)
                }
                // Which row the frame above is showing, stated rather than only tinted: the `.open`
                // outline is a colour, and a colour is not a statement a screen reader can read.
                aria-current={framed ? "true" : undefined}
                onClick={() => onView!(r, actions[0].href)}
              >
                {body}
              </button>
            ) : (
              // A row with no file to frame, or a list with no frame to put it in. Same element, same
              // width, no control — the row keeps its shape, which is how this list is read.
              <span className="mp-rowopen">{body}</span>
            )}

            {/* AC-69, narrowed 2026-08-08 — **view only**, and none at all when there is no url. The
                per-row download glyph is gone: downloading is what the batch beneath the list does, and
                two controls for one act is one the renter has to learn is redundant. The cell reserves
                its width in CSS, so an empty one keeps the row's shape without leaving an inert glyph
                that looks like a control the renter failed to press.
                Narrowed again by the UAT of 2026-08-11 — the whole cell is absent from a list where no
                row has a second file to reach, and the row's FIRST file is reached by pressing the row
                (see the file header). */}
            {arrowsShown && (
              <span className="mp-acts">
                {actions.map((a, i) => {
                  // The first file is what the press frames, so on a list that presses it is not also an
                  // arrow. `i` still numbers every file, so the second paper of a two-paper row is «… ٢»
                  // whether or not the first one drew a control.
                  if (openable && i === 0) return null;
                  // A row holding several files draws several identical glyphs, so each is named after ITS
                  // file — and numbered too, because a lessor can file two papers of the same type and the
                  // labels would then repeat.
                  const multi = (r.files ?? []).filter((f) => f.url).length > 1;
                  const nth = i + 1;
                  const what =
                    multi && a.file
                      ? `${L(a.file.label.en, a.file.label.ar)} ${L(String(nth), arDigits(nth))}`
                      : r.name;
                  // ~~«عرض x»~~ — **«افتح x في تبويب جديد»** since 2026-08-11, because the row itself now
                  // says «اعرض … في العارض» and two controls on one row cannot both be called "view".
                  // The distinction is real and worth the longer name: this one leaves the panel for the
                  // file — on the equipment tab, for a SECOND paper the one frame cannot also hold.
                  const title = L(`Open ${what} in a new tab`, `افتح ${what} في تبويب جديد`);
                  return (
                    <a
                      key={`${a.kind}:${i}`}
                      // ~~`a.primary` used to add `.primary`, a solid blue fill.~~ Withdrawn 2026-08-09
                      // against the prototype, which draws one outline on every row (`panel-proto.css`
                      // §.mp-doc). `DocAction.primary` itself is untouched — it is the model's statement
                      // that the first file's view is the row's act, and the batch and the tests read it.
                      // It simply no longer buys a different LOOK, because on a row holding two papers
                      // there is no primary paper to look at.
                      className={`mp-doc ${a.kind}`}
                      href={a.href}
                      // A presigned url on a private bucket: a new tab is the whole viewer. No modal —
                      // that would need MIME sniffing and a PDF strategy, which is a bigger decision
                      // than this row.
                      target="_blank"
                      rel="noopener noreferrer"
                      title={title}
                      aria-label={title}
                    >
                      <span aria-hidden="true">↗</span>
                    </a>
                  );
                })}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
