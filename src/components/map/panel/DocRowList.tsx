"use client";

/**
 * Deal-room equipment verification (spec 004 v3) — the **document-row grammar** V8 and V9 share.
 *
 * §6.6: *"Both use the same grammar: select-all, a checkbox per row, a thumbnail with a status dot, a
 * name, a status line, and download."* Written once, because the moment the two lists are typed out
 * separately they start drifting — and the ONE thing that must differ between them (equipment rows are
 * presence-only, company rows carry verification and expiry) is exactly the thing a shared component
 * makes visible: it is the `statusLine` and the `dot` the caller passes, and nothing else.
 *
 * **Every row this component draws is openable** (004a §7, AC-69). All three document families on this
 * surface — the machine's papers, the machine's photos, and the firm's papers — arrive here, so the
 * view/download pair is written once, here, and cannot drift between them. §6.6's "presence only"
 * governs **verification state**, not reachability (004a §7.2): an equipment row still carries no
 * verify badge and no expiry, and it is still opened with one click.
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

import { arDigits, docRowActions, type CompanyDocStatus, type PresenceStatus } from "./machine-panel-model";

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
  /** The row's one presigned url — **view** and **download** both point at it (AC-69, `docRowActions`).
   *  Null renders NEITHER control: a dead button is worse than none, and the empty actions cell is the
   *  honest signal that this paper is missing. The cell keeps its width in CSS, so a row without a file
   *  is the same shape as one with it — the renter reads this list by its shape before its words. */
  downloadUrl: string | null;
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
  selected: ReadonlySet<string>;
  onToggle: (key: string) => void;
  /** Select-all / clear-all over THIS group's keys. */
  onToggleAll: (keys: string[], select: boolean) => void;
  L: (en: string, ar: string) => string;
}) {
  const keys = rows.map((r) => r.key);
  const allOn = keys.length > 0 && keys.every((k) => selected.has(k));
  const pickedHere = keys.filter((k) => selected.has(k)).length;

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

      <div className="mp-selbar">
        <button type="button" className="mp-linkbtn" onClick={() => onToggleAll(keys, !allOn)} disabled={keys.length === 0}>
          {allOn ? L("Clear all", "إلغاء التحديد") : L("Select all", "تحديد الكل")}
        </button>
        {pickedHere > 0 && <span>{L(`${pickedHere} selected`, `${arDigits(pickedHere)} محدَّد`)}</span>}
      </div>

      {rows.map((r) => {
        const picked = selected.has(r.key);
        return (
          <div key={r.key} className={`mp-row${picked ? " picked" : ""}${r.dot === "missing" ? " missing" : ""}`}>
            <button
              type="button"
              className={`mp-tick${picked ? " on" : ""}`}
              aria-pressed={picked}
              aria-label={L(`Select ${r.name}`, `تحديد ${r.name}`)}
              onClick={() => onToggle(r.key)}
            >
              {picked ? "✓" : ""}
            </button>

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
              {docRowActions(r).map((a) => {
                const view = a.kind === "view";
                return (
                  <a
                    key={a.kind}
                    className={`mp-doc ${a.kind}${a.primary ? " primary" : ""}`}
                    href={a.href}
                    // A presigned url on a private bucket: a new tab is the whole viewer. No modal —
                    // that would need MIME sniffing and a PDF strategy, which is a bigger decision
                    // than this row. `download` rides along and is honoured only when the object was
                    // signed with an attachment disposition.
                    target="_blank"
                    rel="noopener noreferrer"
                    download={a.download}
                    title={view ? L("View", "عرض") : L("Download", "تنزيل")}
                    aria-label={
                      view ? L(`View ${r.name}`, `عرض ${r.name}`) : L(`Download ${r.name}`, `تنزيل ${r.name}`)
                    }
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
