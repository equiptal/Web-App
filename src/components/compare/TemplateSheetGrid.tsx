"use client";

import { useMemo, useState } from "react";
import type {
  MappedCorrection,
  SheetCellView,
  SheetView,
  UnfilledResolution,
} from "@/lib/contract/export-templates";

/**
 * The review, drawn on the user's OWN spreadsheet.
 *
 * ── Why a grid and not a list ────────────────────────────────────────────────────────
 * The first version asked its questions as a list of cards — "DESCRIPTION B3", "QTY F3". That
 * makes the user hold two things in their head at once: what we're asking, and where B3 is in
 * a sheet they can't see. Their template is the one artefact they already understand, so the
 * review happens on it: every cell says what will land there, the uncertain ones ask in place,
 * and what has nowhere to go is stated plainly at the end.
 *
 * The annotations are resolved server-side (`GET .../sheet`). Supplier cells are offsets from
 * an anchor repeated on a stride — the same arithmetic the renderer does — and computing that
 * here too would eventually disagree with the file the user downloads.
 */

type LFn = (en: string, ar: string) => string;

const C = {
  navy: "#1C3550", navyMid: "#2A4F72", action: "#F79009", actionDim: "#FFF4E5",
  success: "#1DAF58", successBg: "#E7F7EE", warning: "#D4780A", warningBg: "#FFF3E0",
  muted: "#6B8FA8", surface2: "#EFF4F9", border: "#D4E0EC", disabled: "#9BB3C8",
  lockBg: "#F1F3F5", lock: "#8A94A0",
};

/** "D7" → { r: 7, c: 4 }. Null for anything that isn't a plain A1 reference. */
function parseRef(ref: string): { r: number; c: number } | null {
  const m = /^([A-Za-z]+)(\d+)$/.exec(ref.trim());
  if (!m) return null;
  let c = 0;
  for (const ch of m[1].toUpperCase()) c = c * 26 + (ch.charCodeAt(0) - 64);
  return { r: parseInt(m[2], 10), c };
}

function colName(index: number): string {
  let n = index;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out || "A";
}

export interface TemplateSheetGridProps {
  L: LFn;
  view: SheetView;
  busy: boolean;
  /** Our visible fields with nowhere to go — shown as a closing warning, not a question. */
  homeless: Array<{
    field: string;
    label: string;
    candidateCell?: string | null;
    why?: string | null;
    resolved: boolean;
  }>;
  /** Every field the user may point a cell at, for the "put something else here" picker. */
  vocabulary: Array<{ key: string; label: string }>;
  onResolveUnfilled: (cell: string, r: UnfilledResolution) => void;
  onCorrectMapped: (cell: string, change: MappedCorrection) => void;
  onDropHomeless: (field: string) => void;
}

export function TemplateSheetGrid(props: TemplateSheetGridProps) {
  const { L, view, busy, homeless, vocabulary } = props;
  const [selected, setSelected] = useState<string | null>(null);
  const [constant, setConstant] = useState("");

  const byRef = useMemo(() => {
    const m = new Map<string, SheetCellView>();
    for (const c of view.cells) m.set(c.ref, c);
    return m;
  }, [view.cells]);

  /**
   * Merged ranges, resolved to "this cell spans NxM" and "this cell is covered — don't draw".
   *
   * exceljs repeats a merge's value in every cell it covers, so drawing them individually
   * turns one "Prepared By:" heading into six identical cells. The user reads that as their
   * template being mangled, which is worse than showing no grid at all.
   */
  const { spans, covered } = useMemo(() => {
    const spans = new Map<string, { rs: number; cs: number }>();
    const covered = new Set<string>();
    for (const range of view.merges ?? []) {
      const [a, b] = range.split(":");
      const s = parseRef(a);
      const e = parseRef(b ?? a);
      if (!s || !e) continue;
      const r0 = Math.min(s.r, e.r), r1 = Math.max(s.r, e.r);
      const c0 = Math.min(s.c, e.c), c1 = Math.max(s.c, e.c);
      spans.set(`${colName(c0)}${r0}`, { rs: r1 - r0 + 1, cs: c1 - c0 + 1 });
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          if (r === r0 && c === c0) continue;
          covered.add(`${colName(c)}${r}`);
        }
      }
    }
    return { spans, covered };
  }, [view.merges]);

  /* Draw only as far as there is content. An inflated usedRange is common in real templates
     (a stray format 200 rows down) and would otherwise render a screen of empty cells. */
  const maxR = Math.min(view.rowCount, Math.max(...view.cells.map((c) => c.r), 1));
  const maxC = Math.min(view.colCount, Math.max(...view.cells.map((c) => c.c), 1));

  const openQuestions = view.cells.filter((c) => c.kind === "unfilled" && !c.unfilled?.resolved);
  const cell = selected ? byRef.get(selected) ?? null : null;

  /* Whether the figures were resolved at all. Without this, a cell we fill but have no data
     for is indistinguishable from one we simply never priced — and "blank because the supplier
     didn't say" is a different message from "blank because we haven't looked". */
  const hasPreview = view.cells.some((c) => c.previewValue !== undefined);

  return (
    <div>
      <Legend
        L={L}
        sheet={view.sheet}
        openCount={openQuestions.length}
        filledCount={view.cells.filter((c) => c.kind === "filled").length}
      />

      <div
        className="overflow-auto rounded-[12px] border"
        style={{ borderColor: C.border, maxHeight: "58vh" }}
      >
        <table className="border-collapse text-[11.5px]" style={{ minWidth: "100%" }}>
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-20 w-8 border-b border-r" style={{ background: C.surface2, borderColor: C.border }} />
              {Array.from({ length: maxC }, (_, i) => (
                <th
                  key={i}
                  className="sticky top-0 z-10 border-b border-r px-2 py-1 font-normal"
                  style={{ background: C.surface2, borderColor: C.border, color: C.disabled, minWidth: 92 }}
                >
                  {colName(i + 1)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: maxR }, (_, ri) => (
              <tr key={ri}>
                <td
                  className="sticky left-0 z-10 border-b border-r px-1 text-center"
                  style={{ background: C.surface2, borderColor: C.border, color: C.disabled }}
                >
                  {ri + 1}
                </td>
                {Array.from({ length: maxC }, (_, ci) => {
                  const ref = `${colName(ci + 1)}${ri + 1}`;
                  // Swallowed by a merge above/left of it — the spanning cell already drew it.
                  if (covered.has(ref)) return null;
                  const span = spans.get(ref);
                  return (
                    <GridCell
                      key={ref}
                      L={L}
                      ref_={ref}
                      cell={byRef.get(ref)}
                      hasPreview={hasPreview}
                      rowSpan={span?.rs}
                      colSpan={span?.cs}
                      selected={selected === ref}
                      onSelect={() => {
                        setConstant("");
                        setSelected((s) => (s === ref ? null : ref));
                      }}
                    />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {cell && (
        <CellPanel
          L={L}
          cell={cell}
          busy={busy}
          vocabulary={vocabulary}
          constant={constant}
          setConstant={setConstant}
          onResolveUnfilled={props.onResolveUnfilled}
          onCorrectMapped={props.onCorrectMapped}
          onClose={() => setSelected(null)}
        />
      )}

      {!cell && openQuestions.length > 0 && (
        <p className="mt-2 text-[12px]" style={{ color: C.warning }}>
          {L(
            `${openQuestions.length} cell(s) still need an answer — the amber ones. Click one.`,
            `${openQuestions.length} خلية بحاجة إلى إجابة — الخلايا البرتقالية. اضغط على إحداها.`
          )}
        </p>
      )}

      {/* Not a question — a statement. These have nowhere to go in THEIR layout, and the
          alternative to saying so is the user noticing the absence in a finished document. */}
      {homeless.length > 0 && (
        <div className="mt-3 rounded-[12px] p-3" style={{ background: C.warningBg }}>
          <p className="text-[12.5px] font-bold" style={{ color: C.warning }}>
            ⚠ {L(
              "Your template has no place for these, so they won't appear in the export:",
              "لا يوجد مكان لهذه في قالبك، لذا لن تظهر في الملف المُصدَّر:"
            )}
          </p>
          {/* Each one carries the mapper's argument. "No place for this" on its own is
              unarguable — the reason is what lets the user tell a correct call from a lazy
              one, and the candidate cell turns disagreeing into one click. */}
          <div className="mt-2 flex flex-col gap-1.5">
            {homeless.map((n) => (
              <div
                key={n.field}
                className="rounded-[10px] px-2.5 py-1.5"
                style={{ background: "#FFFFFF", border: `1px solid ${C.border}` }}
              >
                <div className="flex items-baseline gap-2">
                  <span className="text-[12.5px] font-bold" style={{ color: C.navyMid }}>{n.label}</span>
                  {n.candidateCell && (
                    <button
                      onClick={() => {
                        setConstant("");
                        setSelected(n.candidateCell as string);
                      }}
                      className="text-[11px] underline"
                      style={{ color: C.action }}
                      title={L("Jump to that cell", "انتقل إلى تلك الخلية")}
                    >
                      {L(`closest: ${n.candidateCell}`, `الأقرب: ${n.candidateCell}`)}
                    </button>
                  )}
                </div>
                {n.why && (
                  <p className="mt-0.5 text-[11.5px]" style={{ color: C.muted }}>{n.why}</p>
                )}
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11.5px]" style={{ color: C.muted }}>
            {L(
              "Disagree? Click the cell in your sheet where it belongs and choose it there.",
              "غير موافق؟ اضغط على الخلية المناسبة في ورقتك واخترها من هناك."
            )}
          </p>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────── pieces ─────────────────────────────────────── */

function Legend({
  L, openCount, filledCount, sheet,
}: { L: LFn; openCount: number; filledCount: number; sheet: string }) {
  return (
    <div className="mb-2">
      {/* Says whose sheet this is and how to read one cell. Without it the grid looks like a
          generic table and the arrows read as decoration. */}
      <p className="mb-1 text-[13px]" style={{ color: C.navy }}>
        {L(
          `Your template ("${sheet}") â your own text is untouched. Under each cell we fill, the arrow says which Moedatech figure goes there, and below it the value it will have.`,
          `ÙØ§ÙØ¨Ù ("${sheet}") â ÙØµÙÙ ÙÙØ§ ÙÙ. Ø£Ø³ÙÙ ÙÙ Ø®ÙÙØ© Ø³ÙØ¹Ø¨ÙØ¦ÙØ§Ø ÙÙØ¶Ø­ Ø§ÙØ³ÙÙ Ø£Ù Ø±ÙÙ Ø³ÙÙÙØªØ¨ ÙÙÙØ§Ø Ø«Ù Ø§ÙÙÙÙØ© ÙÙØ³ÙØ§.`
        )}
      </p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px]" style={{ color: C.muted }}>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 shrink-0 rounded-[3px]" style={{ background: C.successBg, border: `1px solid ${C.success}33` }} />
          {L(`${filledCount} cells we fill`, `${filledCount} Ø®ÙÙØ© Ø³ÙØ¹Ø¨ÙØ¦ÙØ§`)}
        </span>
        {openCount > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 shrink-0 rounded-[3px]" style={{ background: C.actionDim, border: `1px solid ${C.warning}33` }} />
            {L(`${openCount} need your choice`, `${openCount} ØªØ­ØªØ§Ø¬ Ø§Ø®ØªÙØ§Ø±Ù`)}
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 shrink-0 rounded-[3px]" style={{ background: C.lockBg, border: `1px solid ${C.lock}33` }} />
          {L("your formulas â never touched", "ÙØ¹Ø§Ø¯ÙØ§ØªÙ â ÙØ§ ÙÙÙØ³ÙØ§ Ø£Ø¨Ø¯Ø§Ù")}
        </span>
      </div>
    </div>
  );
}

function GridCell(p: {
  L: LFn;
  ref_: string;
  cell?: SheetCellView;
  /** Whether values were resolved at all — distinguishes "writes nothing" from "never asked". */
  hasPreview?: boolean;
  rowSpan?: number;
  colSpan?: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const { cell, selected, L } = p;
  const kind = cell?.kind ?? "label";
  const unresolved = kind === "unfilled" && !cell?.unfilled?.resolved;

  /* Green means exactly one thing: WE WRITE A VALUE IN THIS CELL.
   *
   * It used to tint headings too, because the mapping annotation lived on them — so a reader
   * could not tell which cells actually receive data and the shading looked arbitrary. Their
   * headings are plain white now, with a mapping note; only cells that change are green. */
  const style =
    kind === "filled"
      ? { background: C.successBg, color: C.navy }
      : kind === "unfilled"
        ? { background: unresolved ? C.actionDim : C.successBg, color: C.navy }
        : kind === "formula"
          ? { background: C.lockBg, color: C.lock }
          : { background: "#FFFFFF", color: C.navy };

  /* THEIR text stays the headline, always. An earlier version replaced it with our field name
   * on filled cells, so the grid stopped reading like the user's own sheet and there was no
   * way to tell whose words were on screen. What we will write goes underneath, in colour, as
   * an annotation ON their template rather than a replacement for it. */
  const theirs = cell?.value ?? "";

  /* TWO kinds of cell, and they must not be confused.
   *
   * A HEADING carries the mapping â "your wording -> our figure". It is stated once, here,
   * because a supplier field repeats down every bid column and annotating each of those
   * printed the same sentence three or seven times over.
   *
   * A VALUE cell carries only the value. That is what the user is checking. */
  const mapping = cell?.mapsTo ?? null;
  const isValueCell = kind === "filled" || kind === "unfilled";

  const question =
    kind === "unfilled" && !cell?.unfilled?.resolved
      ? L("? click to choose", "Ø Ø§Ø¶ØºØ· ÙÙØ§Ø®ØªÙØ§Ø±")
      : null;

  const answered = kind === "filled" || Boolean(cell?.unfilled?.resolved);
  const clickable = isValueCell || Boolean(mapping);

  /* The figure. Seeing "48,300" is what lets someone judge the export; "Total (incl. VAT)"
   * does not. */
  const pv = cell?.previewValue;
  const hasValue = pv !== undefined && pv !== null && pv !== "";
  const valueText = hasValue ? (typeof pv === "number" ? pv.toLocaleString() : String(pv)) : null;
  // "We write here but have no figure" â different from a cell we never touch.
  const emptyOnExport = p.hasPreview && answered && !hasValue;

  return (
    <td
      onClick={clickable ? p.onSelect : undefined}
      title={
        mapping
          ? `${cell?.ref} — ${L("we map this row to", "نربط هذا الصف بـ")} ${mapping.fieldLabel}`
          : kind === "formula"
            ? `${cell?.ref} — ${L("your formula, left alone", "معادلتك، لا نلمسها")}`
            : cell?.ref
      }
      rowSpan={p.rowSpan}
      colSpan={p.colSpan}
      className={`border-b border-r px-2 py-1 align-top ${clickable ? "cursor-pointer" : ""}`}
      style={{
        ...style,
        borderColor: C.border,
        maxWidth: 220,
        outline: selected ? `2px solid ${C.action}` : undefined,
        outlineOffset: -2,
      }}
    >
      {/* THEIR text. Always first, always verbatim — this is their sheet. */}
      {theirs && (
        <div className="truncate" style={{ fontWeight: cell?.bold ? 700 : 400 }}>
          {kind === "formula" ? `ƒ ${theirs}` : theirs}
        </div>
      )}

      {/* The mapping, on the heading that names it. The robot marks it as the agent's reading
          of their sheet rather than something they wrote. */}
      {mapping && (
        <div className="mt-0.5 truncate text-[10.5px]" style={{ color: C.success }}>
          {"🤖 → "}
          {mapping.fieldLabel}
          {mapping.derivations?.length && mapping.derivations[0] !== "identity"
            ? ` (${mapping.derivations.join(" → ")})`
            : ""}
        </div>
      )}

      {/* A value cell carries the figure and nothing else. */}
      {valueText && (
        <div className="truncate text-[12.5px] font-bold" style={{ color: C.navy }} title={valueText}>
          {valueText}
        </div>
      )}
      {emptyOnExport && (
        <div className="truncate text-[10.5px] italic" style={{ color: C.disabled }}>
          {L("no value", "لا توجد قيمة")}
        </div>
      )}

      {/* Still needs the user. The only thing that should pull the eye. */}
      {question && (
        <div className="truncate text-[10.5px] font-bold" style={{ color: C.warning }}>
          {question}
        </div>
      )}
      {kind === "unfilled" && cell?.unfilled?.resolved && !valueText && (
        <div className="truncate text-[10.5px]" style={{ color: C.muted }}>
          {cell.resolvedAs ?? ""}
        </div>
      )}
    </td>
  );
}

/**
 * What happens when a cell is selected.
 *
 * Both cases end at the same place — "this cell gets THIS field, or nothing" — so they share a
 * panel rather than living in two components that drift apart.
 */
function CellPanel(p: {
  L: LFn;
  cell: SheetCellView;
  busy: boolean;
  vocabulary: Array<{ key: string; label: string }>;
  constant: string;
  setConstant: (v: string) => void;
  onResolveUnfilled: (cell: string, r: UnfilledResolution) => void;
  onCorrectMapped: (cell: string, change: MappedCorrection) => void;
  onClose: () => void;
}) {
  const { L, cell, busy, vocabulary } = p;
  const u = cell.unfilled;

  return (
    <div className="mt-3 rounded-[12px] border p-3" style={{ borderColor: C.action, background: "#FFFFFF" }}>
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span className="text-[13.5px] font-bold" style={{ color: C.navy }}>
            {u?.theirLabel || cell.value || cell.fieldLabel || cell.ref}
          </span>
          <span className="text-[11px]" style={{ color: C.disabled }}>{cell.ref}</span>
          {cell.supplierIndex != null && (
            <span className="text-[11px]" style={{ color: C.muted }}>
              {L("repeats for every supplier", "تتكرر لكل مورّد")}
            </span>
          )}
        </div>
        <button onClick={p.onClose} className="text-[16px] leading-none" style={{ color: C.disabled }} aria-label="close">×</button>
      </div>

      {cell.kind === "filled" ? (
        <>
          <p className="mt-1 text-[12.5px]" style={{ color: C.navyMid }}>
            {L(
              `This cell will be filled with "${cell.fieldLabel ?? cell.field}".`,
              `ستُعبّأ هذه الخلية بـ "${cell.fieldLabel ?? cell.field}".`
            )}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <GhostBtn disabled={busy} onClick={p.onClose}>{L("Correct — keep it", "صحيح — أبقِها")}</GhostBtn>
            <GhostBtn disabled={busy} onClick={() => p.onCorrectMapped(cell.ref, { field: null })}>
              {L("Leave this cell empty", "اترك هذه الخلية فارغة")}
            </GhostBtn>
          </div>
          <FieldPicker
            L={L} busy={busy} vocabulary={vocabulary}
            label={L("or put something else here", "أو ضع شيئاً آخر هنا")}
            onPick={(field) => p.onCorrectMapped(cell.ref, { field, derivations: ["identity"] })}
          />
        </>
      ) : (
        <>
          <p className="mt-0.5 text-[12px]" style={{ color: C.muted }}>{u?.why}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {u?.candidate && (
              <PrimaryBtn
                disabled={busy}
                onClick={() =>
                  p.onResolveUnfilled(cell.ref, {
                    kind: "acceptCandidate",
                    derivations: u.candidateDerivations ?? ["identity"],
                  })
                }
              >
                {L(`Use "${u.candidateLabel}"`, `استخدم "${u.candidateLabel}"`)}
              </PrimaryBtn>
            )}
            <GhostBtn disabled={busy} onClick={() => p.onResolveUnfilled(cell.ref, { kind: "notStated" })}>
              {L("Not stated", "غير مذكور")}
            </GhostBtn>
            <GhostBtn disabled={busy} onClick={() => p.onResolveUnfilled(cell.ref, { kind: "byHand" })}>
              {L("I'll fill it", "سأعبئها")}
            </GhostBtn>
            <GhostBtn
              disabled={busy}
              onClick={() => p.onResolveUnfilled(cell.ref, { kind: "promptAtExport", label: u?.theirLabel ?? cell.ref })}
            >
              {L("Ask me each time", "اسألني كل مرة")}
            </GhostBtn>
          </div>

          <div className="mt-2 flex items-center gap-2">
            <input
              value={p.constant}
              onChange={(e) => p.setConstant(e.target.value)}
              placeholder={L("or type a fixed value", "أو اكتب قيمة ثابتة")}
              className="flex-1 rounded-[10px] border px-2.5 py-1.5 text-[12.5px]"
              style={{ borderColor: C.border, color: C.navy }}
            />
            <GhostBtn
              disabled={busy || !p.constant.trim()}
              onClick={() => p.onResolveUnfilled(cell.ref, { kind: "constant", value: p.constant.trim() })}
            >
              {L("Save", "حفظ")}
            </GhostBtn>
          </div>

          <FieldPicker
            L={L} busy={busy} vocabulary={vocabulary}
            label={L("or choose the field yourself", "أو اختر الحقل بنفسك")}
            onPick={(field) => p.onResolveUnfilled(cell.ref, { kind: "mapTo", field, derivations: ["identity"] })}
          />
        </>
      )}
    </div>
  );
}

/** The escape hatch for both cases: name the field explicitly. */
function FieldPicker(p: {
  L: LFn;
  busy: boolean;
  vocabulary: Array<{ key: string; label: string }>;
  label: string;
  onPick: (field: string) => void;
}) {
  if (!p.vocabulary.length) return null;
  return (
    <div className="mt-2 flex items-center gap-2">
      <select
        disabled={p.busy}
        defaultValue=""
        onChange={(e) => {
          if (e.target.value) p.onPick(e.target.value);
          e.target.value = "";
        }}
        className="flex-1 rounded-[10px] border px-2.5 py-1.5 text-[12.5px]"
        style={{ borderColor: C.border, color: C.navy }}
      >
        <option value="">{p.label}</option>
        {p.vocabulary.map((v) => (
          <option key={v.key} value={v.key}>{v.label}</option>
        ))}
      </select>
    </div>
  );
}

function PrimaryBtn(p: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={p.onClick} disabled={p.disabled}
      className="rounded-[10px] px-3 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-50"
      style={{ background: C.action }}
    >
      {p.children}
    </button>
  );
}

function GhostBtn(p: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={p.onClick} disabled={p.disabled}
      className="rounded-[10px] border px-3 py-1.5 text-[12.5px] disabled:opacity-50"
      style={{ borderColor: C.border, color: C.navyMid }}
    >
      {p.children}
    </button>
  );
}
