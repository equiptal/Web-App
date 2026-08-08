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
 * **The operator's certificates are the deliberate exception** (owner, 2026-08-08): they are a status —
 * on file or not — and expose no file at all, because nothing validates an operator document on upload
 * and a file the renter can open reads as evidence that was checked. Narrowed the same day to **no
 * checkbox and no ask either**: the group is outside the document machinery, not a quieter part of it.
 * Nothing here enforces any of that; those rows simply arrive with no url and `requestable: false`, so
 * their `mode` is `null` — and a `null`-mode row has drawn the held spacer, no tick and no controls since
 * V15/V16. One mechanism, not a second flag.
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
  L,
}: {
  groupLabel: string;
  /** Rows needing action — **never a total** (§6.1, AC-42). **`null` renders no pill at all**, for a
   *  group that makes no attention claim: the operator's certificates, which the renter cannot tick, ask
   *  for or open, so neither a count nor a green "nothing outstanding" would be true of them
   *  (`DocGroup.attention`). The heading itself stays. */
  attention: number | null;
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
  L: (en: string, ar: string) => string;
}) {
  // All three arrive together or not at all: a tick with no handler is a control that silently fails.
  // This is the LIST's question (does this list tick at all?); `r.selectable` is the ROW's.
  const hasSelection = !!selected && !!onToggle && !!onToggleAll;

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
  // already open landing on his own disk, against «اطلب من المؤجّر إرساله», whose worst outcome reaches
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

  return (
    <div className="mp-grp">
      <div className="mp-grp-h">
        <span>{groupLabel}</span>
        {attention !== null && (
          // The prototype's own wording, both halves (2026-08-09): «يحتاج انتباه» over our «بحاجة إلى
          // إجراء», and «مكتملة» over «لا ينقص شيء». The owner's screenshot says «١ يحتاج انتباه» too,
          // so this is one of the places where both sources agree and we had drifted.
          <span className={`mp-att-pill${attention === 0 ? " done" : ""}`}>
            {attention === 0
              ? L("complete", "مكتملة")
              : L(`${attention} need attention`, `${arDigits(attention)} يحتاج انتباه`)}
          </span>
        )}
      </div>

      {/* No bar at all when this list does not tick, and none when it ticks but nothing here CAN be
          ticked — never a disabled "Select all". A control whose only reachable outcome is an empty
          batch is the dead control AC-69 forbids, moved one step later.

          ~~At NEUTRAL both links can appear~~ — withdrawn by the owner on 2026-08-08, against his own
          prototype: **select-all follows the mode and there is one link.** Which one it is at neutral is
          decided in `selectAll` above. */}
      {hasSelection && (pickedKeys.length > 0 || selectAll) && (
        <div className="mp-selbar">
          {selectAll && (
            <button type="button" className="mp-linkbtn" onClick={() => onToggleAll!(selectAll.keys, true)}>
              {L(selectAll.label.en, selectAll.label.ar)}
            </button>
          )}
          {pickedKeys.length > 0 && (
            // Clearing back towards neutral. It covers THIS group's ticks, which is the same scope
            // select-all has; when this is the only group holding any, it is the whole way back.
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
        return (
          <div
            key={r.key}
            className={`mp-row${picked ? " picked" : ""}${r.dot === "missing" ? " missing" : ""}${dimmed ? " dim" : ""}`}
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

            {/* AC-69, narrowed 2026-08-08 — **view only**, and none at all when there is no url. The
                per-row download glyph is gone: downloading is what the batch beneath the list does, and
                two controls for one act is one the renter has to learn is redundant. The cell reserves
                its width in CSS, so an empty one keeps the row's shape without leaving an inert glyph
                that looks like a control the renter failed to press. */}
            <span className="mp-acts">
              {docRowActions(r).map((a, i) => {
                // A row holding several files draws several identical glyphs, so each is named after ITS
                // file — and numbered too, because a lessor can file two papers of the same type and the
                // labels would then repeat.
                const multi = (r.files ?? []).filter((f) => f.url).length > 1;
                const nth = i + 1;
                const what =
                  multi && a.file
                    ? `${L(a.file.label.en, a.file.label.ar)} ${L(String(nth), arDigits(nth))}`
                    : r.name;
                const title = L(`View ${what}`, `عرض ${what}`);
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
          </div>
        );
      })}
    </div>
  );
}
