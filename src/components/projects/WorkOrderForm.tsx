"use client";

/**
 * The work order form — machines already on this site (W-T17 · spec §4).
 *
 * A work order is the renter's own record: their fleet, or a vendor they have used for years.
 * **Private — no supplier ever sees one, and it is never dispatched anywhere.** It exists because
 * most of the equipment standing on a real site never came through us, and without it the page
 * shows a renter a fraction of their own job.
 *
 * ── Equipment first, supplier second ─────────────────────────────────────────────────────────────
 *
 * The renter is describing what is already there, so the form asks what it is before it asks who
 * provided it. Leading with the supplier would make the machine feel like a consequence of a deal
 * rather than a thing standing in a yard.
 *
 * ── It is awarded the moment it exists ───────────────────────────────────────────────────────────
 *
 * There was never anything to award — the machine is already on site. So saving writes the machines
 * **and one award per supplier line, in one call**, and the chart never shows a work order sitting
 * in *awaiting award*.
 *
 * ── The two rules that lose data if broken ───────────────────────────────────────────────────────
 *
 * **1 · Machines are upserted BY ID.** Sending the set without ids recreates them, and every award,
 * mark and purchase order keyed to the old ids is scrubbed — because the renter renamed a machine.
 * That is the single most expensive mistake available on this form.
 *
 * **2 · The header writes to every row in the group.** A work order has no row of its own; it is a
 * group id its machines share, with the title, period and project pin duplicated across them.
 *
 * ── Off-catalogue machines are legal here and nowhere else ───────────────────────────────────────
 *
 * A renter's yard holds machines our catalogue never listed, and a work order goes to nobody, so it
 * needs no id to bid against. A marketplace request still requires the full triple, because
 * suppliers bid against ids and an unmatched machine has nothing to bid on.
 */

import { useState } from "react";
import { useT, useLocale } from "@/lib/i18n";
import { Button, Icon, Toggle } from "@/components/ui";
import { SearchSelect } from "@/components/create/SearchSelect";
import { RENTAL_BASES, type RentalBasis } from "@/lib/contract/options";
import { TermsFields, MachineTermsOverride } from "./TermsFields";
// The SAME field chrome the project dialog is built from — see `Field`'s note there. Two dialogs
// that open from one page and spell a label two ways read as two products.
import { Field, input } from "./ProjectForm";
import { taxName, type Taxonomy } from "@/lib/contract/taxonomy";
import { machineIsNamed, termsToWire, type MachineTerms, type WorkOrderItem, type WorkOrderWhen } from "@/lib/contract/work-order";
import type { Award } from "@/lib/contract/award";

/* Re-exported: it lives with the fields it fills, and every caller already asks this file. */
export { blankTerms } from "./TermsFields";

/**
 * One supplier line on a machine — what becomes an award when the form saves.
 *
 * Three amounts, not one (owner, 2026-08-31). A hire is a rate per period plus what it costs to get
 * the machine there and away again, and a renter comparing two suppliers on the rate alone is
 * comparing the wrong number: the cheaper monthly rate often carries the longer haul. Held as
 * strings because they are what the renter typed — an empty box is "not recorded", which is not the
 * same as zero, and a number input cannot hold that difference.
 */
export interface SupplierLine {
  supplierName: string;
  units: number;
  /** Per period, on the basis below — which the site's own setting seeds. */
  rateAmount: string;
  /** Getting it here. Per unit, like the rate. */
  mobAmount: string;
  /** Getting it away again. */
  demobAmount: string;
  rentalBasis: Award["rentalBasis"];
}

/** A machine as the form holds it. `id` is present only for one that already exists — see rule 1. */
export interface MachineDraft {
  id?: string;
  categoryId: string | null;
  subcategoryId: string | null;
  measurementId: string | null;
  rawLabel: string;
  rawSize: string;
  offCatalogue: boolean;
  quantity: number;
  notes: string;
  /**
   * This machine's OWN complete terms, or `null` to follow the order's (spec §5.2 · AC-43).
   *
   * Complete rather than a patch: a crane and a generator on one order can differ on delivery and
   * on certificates without the order forking, and clearing an override is then a deletion with
   * nothing stale left behind (AC-44).
   */
  terms: MachineTerms | null;
  lines: SupplierLine[];
}

export interface WorkOrderDraft {
  groupId?: string;
  title: string;
  when: WorkOrderWhen;
  /**
   * The order's terms — operator, certificates, who delivers, who fuels.
   *
   * Held once for the ORDER rather than per machine, and the backend applies them to every machine
   * that does not carry its own. That is what makes a second machine free to add: the renter states
   * the site's working conditions once, and the tenth welder inherits them without a single click.
   *
   * A machine can still differ later — the stored shape is complete per row, so overriding one is a
   * row-level edit, not a fork of the order.
   */
  terms: MachineTerms;
  machines: MachineDraft[];
}

export function blankMachine(): MachineDraft {
  return {
    categoryId: null,
    subcategoryId: null,
    measurementId: null,
    rawLabel: "",
    rawSize: "",
    offCatalogue: false,
    quantity: 1,
    notes: "",
    // Follows the order's until the renter says otherwise.
    terms: null,
    lines: [blankLine("monthly")],
  };
}

/** A blank supplier line on the given basis — the site's, so nobody re-picks it per line. */
export function blankLine(basis: Award["rentalBasis"]): SupplierLine {
  return { supplierName: "", units: 1, rateAmount: "", mobAmount: "", demobAmount: "", rentalBasis: basis };
}

/** What a line costs: (rate + mobilization + demobilization) × units. `null` when nothing is priced. */
export function lineTotal(l: SupplierLine): number | null {
  const n = (v: string) => (v.trim() === "" ? 0 : Number(v));
  const parts = [l.rateAmount, l.mobAmount, l.demobAmount];
  if (parts.every((p) => p.trim() === "")) return null; // nothing recorded is not a total of zero
  if (parts.some((p) => p.trim() !== "" && !Number.isFinite(Number(p)))) return null;
  return (n(l.rateAmount) + n(l.mobAmount) + n(l.demobAmount)) * l.units;
}

/** What a machine comes to across its suppliers. `null` when not one line carries a price. */
export function machineTotal(m: MachineDraft): number | null {
  const totals = m.lines.map(lineTotal).filter((n): n is number => n !== null);
  return totals.length ? totals.reduce((a, b) => a + b, 0) : null;
}

/** Units promised across a machine's suppliers. The cap is the machine's own quantity. */
export function unitsAssigned(m: MachineDraft): number {
  return m.lines.reduce((sum, l) => sum + (Number.isFinite(l.units) ? l.units : 0), 0);
}

/** True when a machine promises more units than it asks for — the save must refuse. */
export function overAssigned(m: MachineDraft): boolean {
  return unitsAssigned(m) > m.quantity;
}

export function WorkOrderForm({
  taxonomy,
  draft,
  onChange,
  projectWhen,
  onCancel,
  onSave,
  saving,
}: {
  taxonomy: Taxonomy;
  draft: WorkOrderDraft;
  onChange: (next: WorkOrderDraft) => void;
  /** The site's own period, for the inherit default and the conflict warning. */
  projectWhen: { startDate: string | null; endDate: string | null };
  onCancel: () => void;
  onSave: (draft: WorkOrderDraft) => void;
  saving?: boolean;
}) {
  const t = useT();
  const w = t.projects.workOrder;
  const { locale } = useLocale();

  const patchMachine = (i: number, p: Partial<MachineDraft>) =>
    onChange({ ...draft, machines: draft.machines.map((m, ix) => (ix === i ? { ...m, ...p } : m)) });

  const differs =
    (draft.when.startDate != null && draft.when.startDate !== projectWhen.startDate) ||
    (draft.when.endDate != null && draft.when.endDate !== projectWhen.endDate);

  /* Open from the start (owner, 2026-08-31). These are the order's own terms and every machine
     inherits them, so they are part of filling the form in rather than something to go and find.
     The PER-MACHINE block stays closed — that one is the exception, and exceptions are rare. */
  const [termsOpen, setTermsOpen] = useState(true);

  /* The rate is per WHAT — read off the order's own basis, which the site seeded. Showing "per
     month" beside the box is the difference between a number a renter can check and one they have
     to remember the units of. */
  const basisWord = draft.when.rentalBasis
    ? t.options.rentalBasis[draft.when.rentalBasis]
    : t.options.rentalBasis.monthly;

  const ready =
    draft.machines.length > 0 &&
    draft.machines.every((m) => machineIsNamed({ ref: refOf(m), rawLabel: m.rawLabel })) &&
    // The backend refuses this too, with a 409. Refusing here means the renter finds out while they
    // are still looking at the number, not after a round trip that loses nothing but explains less.
    !draft.machines.some(overAssigned);

  return (
    <div className="flex flex-col gap-5">
      {/* ── 1 · Equipment ── */}
      <section className="flex flex-col gap-3">
        <h3 className="text-subhead font-extrabold text-navy">{w.equipment}</h3>

  
      {/* ── The order's terms, answered once (owner, 2026-08-31) ──────────────────────────────────
          *"I couldn't set any machine settings — operator, cert, etc — all the machine terms which
          will be copied to any other item added later for smoother experience."*

          There was nowhere to say any of it. The backend has taken per-machine terms all along and
          the form never asked, so every work order saved with an empty terms blob and a renter who
          needed a certified operator had no way to write it down.

          Asked for the ORDER, not per machine, and the backend copies them onto every row that does
          not carry its own. That is what makes the tenth machine free to add. */}
      <details className="rounded-sm border border-border bg-surface2/40" open={termsOpen}>
        <summary
          onClick={(e) => {
            e.preventDefault();
            setTermsOpen((v) => !v);
          }}
          className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-body font-semibold text-navy"
        >
          <Icon name={termsOpen ? "expand_more" : "chevron_right"} size={16} className="flex-none text-muted" />
          {w.termsTitle}
          <span className="text-meta font-normal text-muted">{w.termsSub}</span>
        </summary>

        <div className="border-t border-border px-3 py-3">
          <TermsFields value={draft.terms} onChange={(terms) => onChange({ ...draft, terms })} />
        </div>
      </details>

      {draft.machines.map((m, i) => (
          <MachineCard
            key={m.id ?? i}
            taxonomy={taxonomy}
            locale={locale}
            machine={m}
            shared={draft.terms}
            onChange={(p) => patchMachine(i, p)}
            onRemove={draft.machines.length > 1 ? () => onChange({ ...draft, machines: draft.machines.filter((_, ix) => ix !== i) }) : undefined}
          />
        ))}

        <button
          type="button"
          onClick={() => onChange({ ...draft, machines: [...draft.machines, blankMachine()] })}
          className="flex items-center gap-1.5 self-start text-body font-semibold text-brand"
        >
          <Icon name="add" size={14} /> {w.addMachine}
        </button>
      </section>

      {/* ── 3 · Period ──
          The project dialog's own row, field for field: start · end · extendable · basis, four
          across (owner, 2026-08-31: *"make it same width and layout as adding the project"*). A work
          order asks the same question about time that a project does, and asking it in a different
          shape one dialog later is how a renter starts reading the two as unrelated records.

          Basis and extendable were already carried to the wire by `whenToWire` and had no control
          here at all — the layout gave them one. The basis is not decoration either: it is what a
          new supplier line's own basis is seeded from, and what the rate placeholder says «per». */}
      <section className="flex flex-col gap-3">
        <h3 className="text-subhead font-extrabold text-navy">{w.period}</h3>
        <p className="text-meta text-muted">{w.periodHint}</p>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t.projects.form.start}>
            <input
              type="date"
              className={input}
              value={draft.when.startDate ?? ""}
              placeholder={projectWhen.startDate ?? ""}
              onChange={(e) => onChange({ ...draft, when: { ...draft.when, startDate: e.target.value || null } })}
            />
          </Field>

          <Field label={t.projects.form.end}>
            <input
              type="date"
              className={input}
              value={draft.when.endDate ?? ""}
              placeholder={projectWhen.endDate ?? ""}
              onChange={(e) => onChange({ ...draft, when: { ...draft.when, endDate: e.target.value || null } })}
            />
          </Field>

          <Field label={t.projects.form.extendableLabel}>
            {/* Unanswered stays unanswered: `when.extendable` is `boolean | null` and `whenToWire`
                omits the key while it is null, so a switch nobody has touched says nothing about
                this order rather than asserting a false. Touching it writes a real boolean. */}
            <div className="flex h-[38px] items-center rounded-sm border border-border bg-surface px-3">
              <Toggle
                checked={draft.when.extendable === true}
                onChange={(v) => onChange({ ...draft, when: { ...draft.when, extendable: v } })}
                label={<span className="text-body text-navy">{draft.when.extendable ? t.common.yes : t.common.no}</span>}
              />
            </div>
          </Field>

          <Field label={t.projects.form.basis}>
            <select
              className={input}
              value={draft.when.rentalBasis ?? ""}
              onChange={(e) =>
                onChange({ ...draft, when: { ...draft.when, rentalBasis: (e.target.value || null) as RentalBasis | null } })
              }
            >
              <option value="">—</option>
              {RENTAL_BASES.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {/* Shown, never resolved. A work order may run to its own dates and keep them — the two
            simply disagree, which is what the independence rule is for. It can only ever conflict on
            TIME: its location is the site's and there is no control here that could change it. */}
        {differs && (
          <p className="flex items-start gap-2 rounded-sm border border-warn/40 bg-warn/5 px-3 py-2 text-meta text-navy">
            <Icon name="info" size={14} className="mt-px flex-none text-warn" />
            {w.differs.replace("{start}", projectWhen.startDate ?? "—").replace("{end}", projectWhen.endDate ?? "—")}
          </p>
        )}
      </section>

      {/* ── 2 · Supplier, per machine ── */}
      <section className="flex flex-col gap-3">
        <h3 className="text-subhead font-extrabold text-navy">{w.supplier}</h3>
        <p className="text-meta text-muted">{w.supplierHint}</p>

        {draft.machines.map((m, i) => (
          <div key={m.id ?? i} className="flex flex-col gap-2 rounded-sm border border-border p-3">
            <span className="text-body font-semibold text-navy">{nameOf(m, taxonomy, locale) || w.unnamedMachine}</span>

            {/* Column headings. Five boxes in a row with nothing above them is a puzzle — and three
                of them are money, which is the worst thing to have to guess at. Hidden below `sm`,
                where the grid stacks and each field is on its own line anyway. */}
            <div className="hidden gap-2 text-label font-semibold uppercase tracking-[.03em] text-muted sm:grid sm:grid-cols-[2fr_4.5rem_1fr_1fr_1fr_auto]">
              <span>{w.supplier}</span>
              <span>{w.quantity}</span>
              <span>{w.ratePer.replace("{basis}", basisWord)}</span>
              <span>{w.mobAmount}</span>
              <span>{w.demobAmount}</span>
              <span />
            </div>

            {m.lines.map((l, li) => (
              <div key={li} className="grid gap-2 sm:grid-cols-[2fr_4.5rem_1fr_1fr_1fr_auto]">
                <input
                  className={input}
                  value={l.supplierName}
                  placeholder={w.supplierPlaceholder}
                  onChange={(e) =>
                    patchMachine(i, { lines: m.lines.map((x, ix) => (ix === li ? { ...x, supplierName: e.target.value } : x)) })
                  }
                />
                <input
                  type="number"
                  min={1}
                  className={`${input} w-20`}
                  value={l.units}
                  onChange={(e) =>
                    patchMachine(i, {
                      lines: m.lines.map((x, ix) => (ix === li ? { ...x, units: Math.max(1, Number(e.target.value) || 1) } : x)),
                    })
                  }
                />
                <input
                  type="number"
                  min={0}
                  className={input}
                  value={l.rateAmount}
                  placeholder={w.ratePer.replace("{basis}", basisWord)}
                  onChange={(e) =>
                    patchMachine(i, { lines: m.lines.map((x, ix) => (ix === li ? { ...x, rateAmount: e.target.value } : x)) })
                  }
                />
                {/* Getting it here, and away again. Separate boxes because they are separate
                    negotiations — and because the cheaper monthly rate is often the longer haul. */}
                <input
                  type="number"
                  min={0}
                  className={input}
                  value={l.mobAmount}
                  placeholder={w.mobAmount}
                  onChange={(e) =>
                    patchMachine(i, { lines: m.lines.map((x, ix) => (ix === li ? { ...x, mobAmount: e.target.value } : x)) })
                  }
                />
                <input
                  type="number"
                  min={0}
                  className={input}
                  value={l.demobAmount}
                  placeholder={w.demobAmount}
                  onChange={(e) =>
                    patchMachine(i, { lines: m.lines.map((x, ix) => (ix === li ? { ...x, demobAmount: e.target.value } : x)) })
                  }
                />
                {m.lines.length > 1 && (
                  <button
                    type="button"
                    onClick={() => patchMachine(i, { lines: m.lines.filter((_, ix) => ix !== li) })}
                    aria-label={t.common.remove}
                    className="text-muted transition hover:text-danger"
                  >
                    <Icon name="close" size={14} />
                  </button>
                )}
              </div>
            ))}

            {/* How many of the machine are spoken for, and what it comes to.
                *"Selecting units from a supplier must not be more than the units set in the work
                order settings."* Said as a count rather than by clamping the input: a renter who
                typed 4 against a quantity of 3 usually meant to raise the quantity, and silently
                rewriting their 4 to a 3 hides the decision they were about to make. */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-meta">
              <span className={overAssigned(m) ? "font-semibold text-danger" : "text-muted"}>
                {w.assigned.replace("{n}", String(unitsAssigned(m))).replace("{q}", String(m.quantity))}
                {overAssigned(m) && ` — ${w.tooMany.replace("{n}", String(unitsAssigned(m) - m.quantity))}`}
              </span>
              {machineTotal(m) !== null && (
                <span className="text-muted">
                  {w.machineTotal.replace("{amount}", machineTotal(m)!.toLocaleString())}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() =>
                patchMachine(i, { lines: [...m.lines, blankLine(draft.when.rentalBasis ?? "monthly")] })
              }
              className="flex items-center gap-1.5 self-start text-meta font-semibold text-brand"
            >
              <Icon name="add" size={13} /> {t.projects.award.split}
            </button>
          </div>
        ))}
      </section>

      {/* The project dialog's footer, to the letter: a GHOST way out — a white button beside a
          coloured one reads as a second action of equal weight, and cancelling is not one — one
          primary, and, when Save cannot fire, the reason on the opposite edge. A disabled button
          with nothing beside it is indistinguishable from a broken one. */}
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
        {!ready && !saving && (
          <span className="me-auto flex items-center gap-1.5 text-meta font-semibold text-warn">
            <Icon name="info" size={13} className="flex-none" />
            {draft.machines.some(overAssigned) ? w.fixUnitsFirst : w.nameMachineFirst}
          </span>
        )}
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          {t.common.cancel}
        </Button>
        <Button onClick={() => onSave(draft)} disabled={!ready || saving}>
          {t.common.save}
        </Button>
      </div>
    </div>
  );
}

/* ----------------------------- One machine ----------------------------- */

function MachineCard({
  taxonomy,
  locale,
  machine,
  shared,
  onChange,
  onRemove,
}: {
  taxonomy: Taxonomy;
  locale: string;
  machine: MachineDraft;
  /** The order's terms — what this machine follows, and what an override is seeded and compared against. */
  shared: MachineTerms;
  onChange: (p: Partial<MachineDraft>) => void;
  onRemove?: () => void;
}) {
  const t = useT();
  const w = t.projects.workOrder;

  const category = taxonomy.find((c) => c.id === machine.categoryId);
  const subcategory = category?.subcategories.find((s) => s.id === machine.subcategoryId);

  const opts = (list: { id: string; name: string; nameAr?: string | null }[] | undefined) =>
    (list ?? []).map((n) => ({ value: n.id, label: taxName(n, locale) }));

  return (
    <div className="flex flex-col gap-2.5 rounded-sm border border-border p-3">
      <div className="flex items-center gap-2">
        <Icon name="handyman" size={14} className="flex-none text-muted" />
        <span className="flex-1 text-label font-semibold uppercase tracking-[.03em] text-muted">{w.machine}</span>
        {onRemove && (
          <button type="button" onClick={onRemove} aria-label={t.common.remove} className="text-muted transition hover:text-danger">
            <Icon name="close" size={14} />
          </button>
        )}
      </div>

      {machine.offCatalogue ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            className={input}
            value={machine.rawLabel}
            placeholder={w.rawLabelPlaceholder}
            onChange={(e) => onChange({ rawLabel: e.target.value })}
          />
          <input
            className={input}
            value={machine.rawSize}
            placeholder={w.rawSizePlaceholder}
            onChange={(e) => onChange({ rawSize: e.target.value })}
          />
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-3">
          <SearchSelect
            value={machine.categoryId}
            options={opts(taxonomy)}
            label={w.category}
            placeholder={w.category}
            searchPlaceholder={w.search}
            /* Changing a parent clears its children: a subtype from the old category would still
               look valid on screen while being an id that cannot be under this one. */
            onChange={(v) => onChange({ categoryId: v, subcategoryId: null, measurementId: null })}
          />
          <SearchSelect
            value={machine.subcategoryId}
            options={opts(category?.subcategories)}
            label={w.subtype}
            placeholder={w.subtype}
            searchPlaceholder={w.search}
            disabled={!category}
            onChange={(v) => onChange({ subcategoryId: v, measurementId: null })}
          />
          <SearchSelect
            value={machine.measurementId}
            options={opts(subcategory?.measurements)}
            label={w.size}
            placeholder={w.size}
            searchPlaceholder={w.search}
            disabled={!subcategory}
            onChange={(v) => onChange({ measurementId: v })}
          />
        </div>
      )}

      <label className="flex items-center gap-2 text-meta text-navy-mid">
        <input
          type="checkbox"
          checked={machine.offCatalogue}
          onChange={(e) =>
            // Switching wipes the other side rather than leaving a half-matched machine that would
            // pass one check and fail the other.
            onChange(
              e.target.checked
                ? { offCatalogue: true, categoryId: null, subcategoryId: null, measurementId: null }
                : { offCatalogue: false, rawLabel: "", rawSize: "" },
            )
          }
        />
        {w.notInCatalogue}
      </label>

      <div className="grid gap-2 sm:grid-cols-[auto_1fr]">
        <Field label={w.quantity}>
          <input
            type="number"
            min={1}
            className={`${input} w-24`}
            value={machine.quantity}
            onChange={(e) => onChange({ quantity: Math.max(1, Number(e.target.value) || 1) })}
          />
        </Field>
        <Field label={w.notes}>
          <input className={input} value={machine.notes} onChange={(e) => onChange({ notes: e.target.value })} />
        </Field>
      </div>

      {/* This machine's own terms (spec §5.2 · AC-43, AC-44).
          Closed until asked for: the common case is that every machine on a site works the same way,
          and eleven fields per machine on a five-machine order is a wall between the renter and what
          they came to do. The badge is what makes closing safe — a machine that differs says so on
          its face, so nothing hides behind a collapsed panel.

          The operator block would be hidden for equipment that takes no operator; that rule is
          deferred (W-T5) and the block is shown for every machine until it lands. Deferring one
          field's visibility is not a reason to defer eleven fields, which is what happened here
          before. */}
      <MachineTermsOverride terms={machine.terms} shared={shared} onChange={(terms) => onChange({ terms })} />
    </div>
  );
}

/* ----------------------------- Helpers ----------------------------- */

function refOf(m: MachineDraft) {
  return { categoryId: m.categoryId, subcategoryId: m.subcategoryId, measurementId: m.measurementId };
}

function nameOf(m: MachineDraft, taxonomy: Taxonomy, locale: string): string {
  if (m.offCatalogue) return [m.rawLabel, m.rawSize].filter(Boolean).join(" ").trim();
  const c = taxonomy.find((x) => x.id === m.categoryId);
  const s = c?.subcategories.find((x) => x.id === m.subcategoryId);
  const z = s?.measurements.find((x) => x.id === m.measurementId);
  return [taxName(s, locale), taxName(z, locale)].filter(Boolean).join(" ").trim();
}

/**
 * The draft → what `saveWorkOrder` posts.
 *
 * **Every existing machine keeps its `id`.** The backend upserts by id; one sent without an id is
 * created fresh, and the awards, marks and purchase orders keyed to the id it used to have are
 * scrubbed.
 */
/**
 * The period, in the shape the wire takes it.
 *
 * `when` is `.partial().strict()` on the backend, and **partial means optional, not nullable**: a
 * key sent as `null` is a validation failure, not an unanswered question. So an unset field is left
 * out of the object entirely. The basis is upper-cased for the same reason the project's is — the
 * work-order enum is `DAILY | WEEKLY | MONTHLY | PER_JOB | LONG_TERM`, and only the award enum is
 * lower case.
 */
function whenToWire(w: WorkOrderWhen): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (w.rentalBasis) out.rentalBasis = w.rentalBasis.toUpperCase();
  if (w.extendable !== null) out.extendable = w.extendable;
  if (w.startDate) out.startDate = w.startDate;
  if (w.endDate) out.endDate = w.endDate;
  if (w.hoursPerDay !== null) out.hoursPerDay = w.hoursPerDay;
  return out;
}

/**
 * `terms` on the wire, with every unanswered field left OUT.
 *
 * `workOrderTermsSchema` is `.partial().strict()`, and partial means **optional, not nullable** — a
 * key sent as `null` fails validation rather than reading as "not stated". `termsToWire` emits the
 * complete shape with nulls in the gaps, which is right for the app and wrong for the wire, so the
 * nulls are dropped here.
 *
 * This is the same trap `whenToWire` was already written around, and it cost a work-order save with
 * no suppliers on it at all: the terms block began travelling and took fifteen nulls with it.
 * Booleans and empty strings and empty arrays all stay — `false`, `""` and `[]` are answers the
 * schema accepts, and only `null` is not.
 */
function termsForWire(t: MachineTerms): Record<string, unknown> {
  const wire = termsToWire(t) as unknown as Record<string, unknown>;
  return Object.fromEntries(Object.entries(wire).filter(([, v]) => v !== null));
}

export function workOrderPayload(
  draft: WorkOrderDraft,
  /**
   * Awards ride along on CREATE and cannot on update: only the create schema accepts
   * `items[].supplyLines`, and the update schema is strict, so sending them there would fail the
   * whole save. Editing an existing order's awards goes through the award dialog on the chart.
   */
  opts: { create: boolean },
): { groupId?: string; body: Record<string, unknown> } {
  return {
    // Route, not payload. Both schemas are strict and neither knows this key.
    groupId: draft.groupId,
    body: {
      title: draft.title.trim() || null,
      when: whenToWire(draft.when),
      /* Stated ONCE for the order. The backend copies these onto any machine that does not carry
         its own, which is what makes the second machine free to add — the renter answers operator,
         certificates and who fuels once, and every row inherits it. */
      terms: termsForWire(draft.terms),
      items: draft.machines.map((m) => {
        const lines = m.lines
          .filter((l) => l.supplierName.trim())
          .map((l) => ({
            supplierName: l.supplierName.trim(),
            units: l.units,
            // Same default the backend applies to this field, stated here so both paths agree.
            rentalBasis: l.rentalBasis ?? "monthly",
            rateAmount: l.rateAmount ? Number(l.rateAmount) : null,
            /* Sent only when recorded. An empty box means the renter has not been told the haulage
               yet, which is not a haulage of zero — and both fields are nullable on the wire, so an
               absent key reads back as unknown rather than free. */
            ...(l.mobAmount.trim() ? { mobilizationAmount: Number(l.mobAmount) } : {}),
            ...(l.demobAmount.trim() ? { demobilizationAmount: Number(l.demobAmount) } : {}),
          }));

        return {
          // Only when it exists: the id is upserted, and `undefined` would be sent as an absent key
          // anyway — but a `null` would be a strict failure, so the key is added or it is not.
          ...(m.id ? { id: m.id } : {}),
          // Flat, not nested under `ref` — the item schema names the three ids itself.
          ...refOf(m),
          rawLabel: m.offCatalogue ? m.rawLabel.trim() || null : null,
          rawSize: m.offCatalogue ? m.rawSize.trim() || null : null,
          quantity: m.quantity,
          notes: m.notes.trim() || null,
          /* Sent only when this machine differs. An absent key is an empty blob on the backend, and
             an empty blob is exactly what makes that row fall back to the order's terms. */
          ...(m.terms ? { terms: termsForWire(m.terms) } : {}),
          ...(opts.create && lines.length > 0 ? { supplyLines: lines } : {}),
        };
      }),
    },
  };
}

export type { WorkOrderItem };
