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
import { taxName, type Taxonomy } from "@/lib/contract/taxonomy";
import { machineIsNamed, type WorkOrderItem, type WorkOrderWhen } from "@/lib/contract/work-order";
import type { Award } from "@/lib/contract/award";

/** One supplier line on a machine — what becomes an award when the form saves. */
export interface SupplierLine {
  supplierName: string;
  units: number;
  rateAmount: string;
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
    lines: [{ supplierName: "", units: 1, rateAmount: "", rentalBasis: "monthly" }],
  };
}

const input =
  "w-full rounded-sm border border-border bg-surface px-3 py-2 text-body text-navy outline-none transition focus:border-brand";

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

  const ready = draft.machines.length > 0 && draft.machines.every((m) => machineIsNamed({ ref: refOf(m), rawLabel: m.rawLabel }));

  return (
    <div className="flex flex-col gap-5">
      {/* ── 1 · Equipment ── */}
      <section className="flex flex-col gap-3">
        <h3 className="text-subhead font-extrabold text-navy">{w.equipment}</h3>

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
              <div key={li} className="grid gap-2 sm:grid-cols-[2fr_auto_1fr_auto]">
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
                  placeholder={t.projects.award.ratePlaceholder}
                  onChange={(e) =>
                    patchMachine(i, { lines: m.lines.map((x, ix) => (ix === li ? { ...x, rateAmount: e.target.value } : x)) })
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

            <button
              type="button"
              onClick={() =>
                patchMachine(i, { lines: [...m.lines, { supplierName: "", units: 1, rateAmount: "", rentalBasis: "monthly" }] })
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
export function workOrderPayload(draft: WorkOrderDraft): {
  groupId?: string;
  title: string | null;
  when: WorkOrderWhen;
  items: unknown[];
  awards: unknown[];
} {
  return {
    groupId: draft.groupId,
    title: draft.title.trim() || null,
    when: draft.when,
    items: draft.machines.map((m, sortOrder) => ({
      id: m.id, // undefined for a new one — never invent it
      sortOrder,
      ref: refOf(m),
      rawLabel: m.offCatalogue ? m.rawLabel.trim() || null : null,
      rawSize: m.offCatalogue ? m.rawSize.trim() || null : null,
      quantity: m.quantity,
      notes: m.notes.trim() || null,
    })),
    awards: draft.machines.flatMap((m, sortOrder) =>
      m.lines
        .filter((l) => l.supplierName.trim())
        .map((l) => ({
          machineIndex: sortOrder,
          supplierName: l.supplierName.trim(),
          units: l.units,
          rentalBasis: l.rentalBasis,
          rateAmount: l.rateAmount ? Number(l.rateAmount) : null,
        })),
    ),
  };
}

export type { WorkOrderItem };
