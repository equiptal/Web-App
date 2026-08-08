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
 * **`DocRowView.selectable` is the ONE place a row's tickability is decided**, and both lists reach it
 * from the same rule — *a tick must be answerable by the batch underneath it*. The company panel's batch
 * saves, so it clears the flag on a paper with **no url**; the equipment tab's batch asks, so it clears
 * the flag on a paper that is **already there**. The two lists therefore tick almost opposite rows, and
 * that is the verb differing, not the grammar. See the field's own note.
 *
 * **Every row that carries a file is openable** (004a §7, AC-69). The document families on this surface —
 * the machine's papers, the machine's photos, and the firm's papers — arrive here, so the view/download
 * pair is written once, here, and cannot drift between them. §6.6's "presence only" governs
 * **verification state**, not reachability (004a §7.2): an equipment row still carries no verify badge
 * and no expiry, and it is still opened with one click.
 *
 * **The operator's certificates are the deliberate exception** (owner, 2026-08-08): they are a status —
 * on file or not — and expose no file at all, because nothing validates an operator document on upload
 * and a file the renter can open reads as evidence that was checked. Nothing here enforces that; those
 * rows simply arrive with no url, and a row with no url has already exposed no controls since V15. One
 * mechanism, not a second flag.
 *
 * **Usage** — the caller owns selection state and the batch send; this renders and reports ticks.
 *
 *   <DocRowList
 *     groupLabel={L("Photos", "الصور")}
 *     attention={group.attention}
 *     rows={group.rows.map((r) => ({ key: r.key, name: L(r.label.en, r.label.ar),
 *       status: L(r.statusLine.en, r.statusLine.ar), dot: r.status,
 *       thumbUrl: r.thumbUrl, downloadUrl: r.downloadUrl }))}
 *     selected={selected} onToggle={toggle} onToggleAll={toggleAll} ar={ar} L={L} />
 *
 * Nothing here fetches, posts or navigates.
 */

import { arDigits, docRowActions, type CompanyDocStatus, type DocFile, type PresenceStatus } from "./machine-panel-model";

/** The status dot's look. `present`/`verified` green · `on_file` blue · `missing` amber. */
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
  /** The row's first presigned url — **view** and **download** both point at it (AC-69,
   *  `docRowActions`). Null renders NEITHER control: a dead button is worse than none, and the empty
   *  actions cell is the honest signal that this paper is missing. The cell keeps its width in CSS, so
   *  a row without a file is the same shape as one with it — the renter reads this list by its shape
   *  before its words. */
  downloadUrl: string | null;
  /** **Every** file behind this row, when the caller has them. A machine's paper row can hold several
   *  (an istimara AND a customs card under one ownership heading, two TÜV uploads under one certificate)
   *  and each gets its own view/download pair — the row used to expose the first url and silently drop
   *  the rest. Absent for the firm's papers, which carry one file and only a `downloadUrl`. */
  files?: readonly DocFile[];
  /**
   * May this row be ticked? **Defaults to true**, so a caller that has no opinion is unchanged.
   *
   * **One rule, stated by the caller: a tick must be answerable by the batch underneath it.** Each list
   * reaches that from its own side, and the two are not in tension — they are the same sentence about
   * different verbs (both owner rulings, 2026-08-08):
   *
   * - the **company** panel's batch *saves* files, so a row with no url cannot be ticked — there is
   *   nothing to save, and a tick that yields nothing is the dead control AC-69 forbids, moved one step
   *   later;
   * - the **equipment** tab's batch *asks*, so only a **missing** row can be ticked — you can only ask
   *   for what is not there, and an ask naming a paper the lessor can see on his own file has one
   *   possible answer, "it is already there".
   *
   * The equipment side once left this set on a held-and-required row (a legible re-scan); that is
   * withdrawn. Neither judgement is made here: this component renders the tick the caller allows, and
   * the caller's model — `DocRow.requestable`, `companySelectableKeys` — is the single place the rule
   * lives, so the checkbox and the batch cannot disagree.
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
  /** Rows needing action — **never a total** (§6.1, AC-42). */
  attention: number;
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
  // Select-all covers only the rows that CAN be ticked, so "all" never means keys with no checkbox — and
  // it never leaves the bar permanently unable to reach its all-on state.
  const keys = rows.filter((r) => r.selectable !== false).map((r) => r.key);
  // All three arrive together or not at all: a tick with no handler is a control that silently fails.
  // This is the LIST's question (does this list tick at all?); `r.selectable` is the ROW's.
  const hasSelection = !!selected && !!onToggle && !!onToggleAll;
  const allOn = hasSelection && keys.length > 0 && keys.every((k) => selected!.has(k));
  const pickedHere = hasSelection ? keys.filter((k) => selected!.has(k)).length : 0;

  return (
    <div className="mp-grp">
      <div className="mp-grp-h">
        <span>{groupLabel}</span>
        <span className={`mp-att-pill${attention === 0 ? " done" : ""}`}>
          {attention === 0
            ? L("nothing outstanding", "لا ينقص شيء")
            : L(`${attention} need attention`, `${arDigits(attention)} بحاجة إلى إجراء`)}
        </span>
      </div>

      {/* No bar at all when this list does not tick, and none when it ticks but nothing here CAN be
          ticked — never a disabled "Select all". A control whose only reachable outcome is an empty
          batch is the dead control AC-69 forbids, moved one step later. */}
      {hasSelection && keys.length > 0 && (
        <div className="mp-selbar">
          <button type="button" className="mp-linkbtn" onClick={() => onToggleAll!(keys, !allOn)}>
            {allOn ? L("Clear all", "إلغاء التحديد") : L("Select all", "تحديد الكل")}
          </button>
          {pickedHere > 0 && <span>{L(`${pickedHere} selected`, `${arDigits(pickedHere)} محدَّد`)}</span>}
        </div>
      )}

      {rows.map((r) => {
        const tickable = hasSelection && r.selectable !== false;
        const picked = tickable && selected!.has(r.key);
        return (
          <div key={r.key} className={`mp-row${picked ? " picked" : ""}${r.dot === "missing" ? " missing" : ""}`}>
            {tickable ? (
              <button
                type="button"
                className={`mp-tick${picked ? " on" : ""}`}
                aria-pressed={picked}
                aria-label={L(`Select ${r.name}`, `تحديد ${r.name}`)}
                onClick={() => onToggle!(r.key)}
              >
                {picked ? "✓" : ""}
              </button>
            ) : (
              hasSelection && (
                // A row this list COULD have ticked and did not: the tick's width is held rather than
                // collapsed, so the row still lines up with the rows above it — the list is read by its
                // shape before its words. A list that ticks nothing has no such column to hold, so it
                // gets no spacer either.
                <span className="mp-tick void" aria-hidden="true" />
              )
            )}

            <span className="mp-thumb">
              {r.thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.thumbUrl} alt={r.name} />
              ) : (
                <span aria-hidden="true">{r.dot === "missing" ? "—" : "📄"}</span>
              )}
              <span className={`dot ${r.dot}`} aria-hidden="true">{DOT_GLYPH[r.dot]}</span>
            </span>

            <span className="mp-rowtx">
              <b>{r.name}</b>
              <span className={r.dot === "missing" ? "att" : undefined}>{r.status}</span>
            </span>

            {/* V15 / AC-69 — view first, download second, and NEITHER when there is no url. The cell
                reserves its width in CSS, so an empty one keeps the row's shape without leaving an
                inert glyph that looks like a control the renter failed to press. */}
            <span className="mp-acts">
              {docRowActions(r).map((a, i) => {
                const view = a.kind === "view";
                // A row holding several files draws several pairs of identical glyphs, so each pair is
                // named after ITS file — and numbered too, because a lessor can file two papers of the
                // same type and the labels would then repeat.
                const multi = i > 1 || (r.files ?? []).filter((f) => f.url).length > 1;
                const nth = Math.floor(i / 2) + 1;
                const what =
                  multi && a.file
                    ? `${L(a.file.label.en, a.file.label.ar)} ${L(String(nth), arDigits(nth))}`
                    : r.name;
                return (
                  <a
                    key={`${a.kind}:${i}`}
                    className={`mp-doc ${a.kind}${a.primary ? " primary" : ""}`}
                    href={a.href}
                    // A presigned url on a private bucket: a new tab is the whole viewer. No modal —
                    // that would need MIME sniffing and a PDF strategy, which is a bigger decision
                    // than this row. `download` rides along and is honoured only when the object was
                    // signed with an attachment disposition.
                    target="_blank"
                    rel="noopener noreferrer"
                    download={a.download}
                    title={view ? L(`View ${what}`, `عرض ${what}`) : L(`Download ${what}`, `تنزيل ${what}`)}
                    aria-label={view ? L(`View ${what}`, `عرض ${what}`) : L(`Download ${what}`, `تنزيل ${what}`)}
                  >
                    <span aria-hidden="true">{view ? "↗" : "⤓"}</span>
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
