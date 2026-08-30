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
import { Button, Icon } from "@/components/ui";
import { SearchSelect } from "@/components/create/SearchSelect";
import { SAFETY_CERTIFICATES, FUEL_TYPES, type Party, type OperatorNeeded } from "@/lib/contract/options";
import { taxName, type Taxonomy } from "@/lib/contract/taxonomy";
import { machineIsNamed, termsToWire, type MachineTerms, type WorkOrderItem, type WorkOrderWhen } from "@/lib/contract/work-order";
import type { Award } from "@/lib/contract/award";

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

/** Nothing answered. Every field nullable, because "not stated" is a real answer here. */
export function blankTerms(): MachineTerms {
  return {
    /* Not null: the type does not allow it, because every request has to answer this one. "yes" is
       the app's own default for anything that is not a generator, compressor or light tower — see
       `defaultOperatorNeeded`. A renter who needs no operator says so in one click. */
    operatorNeeded: "yes",
    operator: {
      nationality: null,
      nationalityCustom: "",
      certificate: [],
      certificateOther: "",
      nightShift: false,
      fatFood: null,
      fatAccommodationTransport: null,
    } as MachineTerms["operator"],
    fuelType: "diesel",
    equipmentYear: null,
    deliveryOverride: null,
    returnOverride: null,
    fuelResponsibilityOverride: null,
    safetyCertsOverride: null,
    safetyCertsOtherText: null,
  };
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

const input =
  "w-full rounded-sm border border-border bg-surface px-3 py-2 text-body text-navy outline-none transition focus:border-brand";

const OPERATOR_OPTS: OperatorNeeded[] = ["yes", "no"];
const PARTY_OPTS: Party[] = ["me", "supplier"];

/**
 * One labelled dropdown over a closed option list.
 *
 * Named `TermPick`, not `Pick` — `Pick` is a TypeScript built-in, and shadowing it in a `.tsx` file
 * gives an error about a type being used as a value, several lines from the real cause.
 */
function TermPick({
  label,
  value,
  options,
  labels,
  onPick,
}: {
  label: string;
  value: string | null;
  options: readonly string[];
  /** The dictionary this option list reads from — shared with the rest of the app, not restated. */
  labels: Record<string, string>;
  onPick: (v: string | null) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-label font-semibold uppercase tracking-[.03em] text-muted">{label}</span>
      <select className={input} value={value ?? ""} onChange={(e) => onPick(e.target.value || null)}>
        <option value="">—</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {labels[o] ?? o}
          </option>
        ))}
      </select>
    </label>
  );
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

  const [termsOpen, setTermsOpen] = useState(false);
  const terms = draft.terms;
  const patchTerms = (p: Partial<MachineTerms>) => onChange({ ...draft, terms: { ...draft.terms, ...p } });

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

        <div className="grid gap-2 border-t border-border px-3 py-3 sm:grid-cols-3">
          <TermPick
            label={w.operator}
            value={terms.operatorNeeded}
            options={OPERATOR_OPTS}
            labels={{ yes: t.common.yes, no: t.common.no }}
            onPick={(v) => patchTerms({ operatorNeeded: (v ?? "yes") as MachineTerms["operatorNeeded"] })}
          />
          <TermPick
            label={w.delivery}
            value={terms.deliveryOverride}
            options={PARTY_OPTS}
            labels={t.options.party}
            onPick={(v) => patchTerms({ deliveryOverride: v as MachineTerms["deliveryOverride"] })}
          />
          <TermPick
            label={w.ret}
            value={terms.returnOverride}
            options={PARTY_OPTS}
            labels={t.options.party}
            onPick={(v) => patchTerms({ returnOverride: v as MachineTerms["returnOverride"] })}
          />
          <TermPick
            label={w.fuelResp}
            value={terms.fuelResponsibilityOverride}
            options={PARTY_OPTS}
            labels={t.options.party}
            onPick={(v) => patchTerms({ fuelResponsibilityOverride: v as MachineTerms["fuelResponsibilityOverride"] })}
          />
          <TermPick
            label={w.fuelType}
            value={terms.fuelType}
            options={FUEL_TYPES}
            labels={t.options.fuelType}
            onPick={(v) => patchTerms({ fuelType: (v ?? "diesel") as MachineTerms["fuelType"] })}
          />
          <label className="flex flex-col gap-1">
            <span className="text-label font-semibold uppercase tracking-[.03em] text-muted">{w.year}</span>
            <input
              className={input}
              value={terms.equipmentYear ?? ""}
              placeholder={w.yearPlaceholder}
              onChange={(e) => patchTerms({ equipmentYear: (e.target.value || null) as MachineTerms["equipmentYear"] })}
            />
          </label>

          {/* Certificates are a set, not a choice — a job can want TUV and Aramco both. */}
          <fieldset className="sm:col-span-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <legend className="mb-1 text-label font-semibold uppercase tracking-[.03em] text-muted">{w.safety}</legend>
            {SAFETY_CERTIFICATES.map((c) => {
              const on = (terms.safetyCertsOverride ?? []).includes(c);
              return (
                <label key={c} className="flex items-center gap-1.5 text-body text-navy">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => {
                      const now = terms.safetyCertsOverride ?? [];
                      const next = on ? now.filter((x) => x !== c) : [...now, c];
                      patchTerms({ safetyCertsOverride: (next.length ? next : null) as MachineTerms["safetyCertsOverride"] });
                    }}
                  />
                  {t.options.safetyCert[c] ?? c}
                </label>
              );
            })}
            <label className="flex items-center gap-1.5 text-body text-navy">
              <input
                type="checkbox"
                checked={terms.operator?.nightShift === true}
                onChange={(e) =>
                  patchTerms({ operator: { ...terms.operator, nightShift: e.target.checked } as MachineTerms["operator"] })
                }
              />
              {w.night}
            </label>
          </fieldset>
        </div>
      </details>

      {draft.machines.map((m, i) => (
          <MachineCard
            key={m.id ?? i}
            taxonomy={taxonomy}
            locale={locale}
            machine={m}
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

      {/* ── 3 · Period ── */}
      <section className="flex flex-col gap-3">
        <h3 className="text-subhead font-extrabold text-navy">{w.period}</h3>
        <p className="text-meta text-muted">{w.periodHint}</p>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-label font-semibold uppercase tracking-[.03em] text-muted">{t.projects.form.start}</span>
            <input
              type="date"
              className={input}
              value={draft.when.startDate ?? ""}
              placeholder={projectWhen.startDate ?? ""}
              onChange={(e) => onChange({ ...draft, when: { ...draft.when, startDate: e.target.value || null } })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-label font-semibold uppercase tracking-[.03em] text-muted">{t.projects.form.end}</span>
            <input
              type="date"
              className={input}
              value={draft.when.endDate ?? ""}
              placeholder={projectWhen.endDate ?? ""}
              onChange={(e) => onChange({ ...draft, when: { ...draft.when, endDate: e.target.value || null } })}
            />
          </label>
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

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button variant="secondary" onClick={onCancel} disabled={saving}>
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
  onChange,
  onRemove,
}: {
  taxonomy: Taxonomy;
  locale: string;
  machine: MachineDraft;
  onChange: (p: Partial<MachineDraft>) => void;
  onRemove?: () => void;
}) {
  const t = useT();
  const w = t.projects.workOrder;
  const [open, setOpen] = useState(false);

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
        <label className="flex flex-col gap-1">
          <span className="text-label font-semibold uppercase tracking-[.03em] text-muted">{w.quantity}</span>
          <input
            type="number"
            min={1}
            className={`${input} w-24`}
            value={machine.quantity}
            onChange={(e) => onChange({ quantity: Math.max(1, Number(e.target.value) || 1) })}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-label font-semibold uppercase tracking-[.03em] text-muted">{w.notes}</span>
          <input className={input} value={machine.notes} onChange={(e) => onChange({ notes: e.target.value })} />
        </label>
      </div>

      {/* Machine terms. Shared by the order for typing convenience — the SAME values are written to
          every row — and *Different terms for this machine* simply writes different ones here. Each
          row's `terms` is complete, so this is never an override of anything.

          The operator block would be hidden for equipment that takes no operator; that rule is
          deferred (W-T5) and the block is shown for every machine until it lands. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 self-start text-meta font-semibold text-brand"
      >
        <Icon name={open ? "expand_less" : "expand_more"} size={13} /> {w.differentTerms}
      </button>
      {open && <p className="rounded-sm border border-border bg-surface2/50 px-3 py-2 text-meta text-muted">{w.termsComing}</p>}
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
      terms: termsToWire(draft.terms),
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
          ...(opts.create && lines.length > 0 ? { supplyLines: lines } : {}),
        };
      }),
    },
  };
}

export type { WorkOrderItem };
