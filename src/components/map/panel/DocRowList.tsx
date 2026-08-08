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

import { arDigits, type CompanyDocStatus, type PresenceStatus } from "./machine-panel-model";

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
  /** Presigned link. Null disables the control rather than hiding it, so every row keeps one shape. */
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

            {r.downloadUrl ? (
              <a
                className="mp-dl"
                href={r.downloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                title={L("Download", "تنزيل")}
                aria-label={L(`Download ${r.name}`, `تنزيل ${r.name}`)}
              >
                ⤓
              </a>
            ) : (
              // Kept in place and inert rather than removed: a row that loses its last control changes
              // height, and the renter reads the list by its shape before he reads it by its words.
              <span className="mp-dl off" aria-hidden="true">⤓</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
