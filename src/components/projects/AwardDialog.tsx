"use client";

/**
 * Awarding a line — who supplies how many (W-T16 · spec §8).
 *
 * **Award means "record who is supplying this", not "accept a bid".** It reads nothing from the deal
 * room and writes nothing to it, and it may name a supplier who never bid. The word stays *Award*
 * because that is what procurement calls it, and inside a private tracking page there is nothing to
 * confuse it with.
 *
 * ── No dates ─────────────────────────────────────────────────────────────────────────────────────
 *
 * An award has no period of its own. A machine that arrives a month after the others says so with
 * its **mobilized mark**, which is a fact about what happened rather than a second plan competing
 * with the request's. Two levels of date are answerable; three are not.
 *
 * ── An award carries a supplier ROW ─────────────────────────────────────────────────────────────
 *
 * SUP-T18, decision 4. The supplier is picked from the renter's own list, and there is no longer a
 * typed-name branch: a free-text supplier is a firm nothing can be looked up against, so its bids,
 * its papers and its history all belong to a string. That branch existed only because the registry
 * did not, and the note here said so.
 *
 * **`supplierName` is still stored beside the id** — as a snapshot of what the firm was called that
 * day, never as a lookup key again. A row awarded to "Zahid Tractor" keeps saying so after the firm
 * is renamed.
 *
 * **An empty list is not a dead end.** The picker carries its own *Add a supplier*: one row, the same
 * write as *Add my own suppliers*, returning the new id straight into the dropdown. Without it a
 * renter mid-award who finds his supplier missing has to leave the dialog and lose the award he was
 * building.
 *
 * ── The vendor flag does not gate the award (owner, 2026-09-01) ─────────────────────────────────
 *
 * It used to: an unregistered row was shown and disabled. The rule was procurement's — you do not
 * raise a PO to a firm you have not registered — but the list itself already IS the gate. Every row
 * on it is a firm the renter put there, and a supplier who bid through a shared link and was added
 * from the suggestions band arrives unregistered, so the old rule made him findable and unpickable
 * for a reason the renter had not been told about at the moment he needed it.
 *
 * So the flag goes back to being what it says it is — a label the renter keeps and filters by — and
 * anyone on his list can be awarded.
 *
 * ── The SAME money the work order asks for ──────────────────────────────────────────────────────
 *
 * Rate, mobilization and demobilization, and the line's total — the three boxes and the arithmetic
 * from the work order's own supplier row, imported rather than re-typed so the two cannot drift.
 *
 * They were missing here (owner, 2026-08-31). An award recorded on the chart could hold no haulage
 * money, while the identical award recorded through the work-order form could — same stored record,
 * two entry paths, one of them lossy. The chart path is the ONLY one a renter has for a machine
 * whose supplier section was left blank, so the money simply could not be recorded for exactly the
 * case the chart's Award exists to serve.
 *
 * ── The counter blocks Save, and says why before you press it ────────────────────────────────────
 *
 * A running *used of quantity* means a renter splitting three machines across two vendors can see
 * the third is still unassigned without doing arithmetic. Over the quantity, Save is disabled — the
 * backend refuses it anyway, and finding out after pressing is worse than being told before.
 */

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { Button, Icon } from "@/components/ui";
import { Dialog } from "@/components/Dialog";
import { Dropdown } from "@/components/Dropdown";
import { listRenterSuppliers, type RenterSupplier, type AwardInput } from "@/lib/api/client";
import { AddSuppliersDialog } from "@/components/suppliers/AddSuppliersDialog";
import { awardedUnits, type Award, type ChartItem } from "@/lib/contract/award";
/* The work order's arithmetic, not a second copy of it: (rate + mob + demob) × units, with
   "nothing recorded" kept distinct from "a total of zero". */
import { lineTotal } from "@/components/projects/WorkOrderForm";

type Line = {
  supplierId: string | null;
  supplierName: string;
  units: number;
  rateAmount: string;
  mobAmount: string;
  demobAmount: string;
  rentalBasis: Award["rentalBasis"];
};

const blank = (basis: Award["rentalBasis"]): Line => ({
  supplierId: null,
  supplierName: "",
  units: 1,
  rateAmount: "",
  mobAmount: "",
  demobAmount: "",
  rentalBasis: basis,
});

export function AwardDialog({
  open,
  onClose,
  item,
  /**
   * **The basis this line is priced on, and it is not asked for here** (owner, 2026-09-01: *"the rate
   * must already use the request or the work order rental basis, not enter it here"*).
   *
   * It comes from the row being awarded — the work order's `when.rentalBasis`, or the request's —
   * and the rate column simply says «Rate · per month». A `Per` dropdown on the award line was a
   * fourth control asking the renter to restate a fact the record already holds, and it could
   * DISAGREE with it: a monthly work order carrying a weekly award reads as a data error on the
   * chart, and nothing on this dialog said which of the two was right.
   */
  defaultBasis = "monthly",
  onSave,
  saving,
}: {
  open: boolean;
  onClose: () => void;
  item: ChartItem;
  defaultBasis?: Award["rentalBasis"];
  onSave: (lines: AwardInput[]) => void;
  saving?: boolean;
}) {
  const t = useT();
  const a = t.projects.award;
  /** «per month» / «per week» / «per day», from the record — see `defaultBasis`. */
  const basisWord =
    defaultBasis === "daily" ? a.perDaily : defaultBasis === "weekly" ? a.perWeekly : a.perMonthly;

  const [lines, setLines] = useState<Line[]>([blank(defaultBasis)]);
  const [suppliers, setSuppliers] = useState<RenterSupplier[] | null>(null);
  /* Which line asked for the add dialog — so whatever comes back is selected onto that line and not
     onto the first one. */
  const [addingOn, setAddingOn] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setLines([blank(defaultBasis)]);
    setAddingOn(null);
    // An empty list is a normal answer here, not a failure — it puts the control in its typed mode.
    listRenterSuppliers().then(setSuppliers).catch(() => setSuppliers([]));
  }, [open, defaultBasis]);

  const already = awardedUnits(item);
  const asking = lines.reduce((n, l) => n + (Number(l.units) || 0), 0);
  const used = already + asking;
  const over = used > item.quantity;
  // The id, not the name: an award without a row is refused here as well as by the backend.
  const named = lines.every((l) => !!l.supplierId);

  const patch = (i: number, p: Partial<Line>) => setLines((prev) => prev.map((l, ix) => (ix === i ? { ...l, ...p } : l)));

  /**
   * Re-read the list after the add dialog wrote, and select what is new onto the line that asked.
   *
   * The dialog reports that it saved, not what it saved — it can write several rows at once and has
   * no one id to hand back. So the new rows are whatever was not there before. Selecting the first
   * of them is right for the case that matters (a renter adding the one firm he is awarding to) and
   * harmless for the rest, since he can still change the pick.
   */
  const afterAdd = async (line: number) => {
    const before = new Set((suppliers ?? []).map((x) => x.id));
    const next = await listRenterSuppliers().catch(() => null);
    if (!next) return;
    setSuppliers(next);
    const fresh = next.find((x) => !before.has(x.id));
    if (fresh) patch(line, { supplierId: fresh.id, supplierName: fresh.name });
  };

  return (
    <Dialog open={open} onClose={onClose} title={a.title} subtitle={`${item.label} ×${item.quantity}`}>
      <div className="flex flex-col gap-4">
        <p className="flex items-start gap-2 rounded-sm border border-border bg-surface2/50 px-3 py-2 text-meta text-navy-mid">
          <Icon name="shield" size={14} className="mt-px flex-none text-muted" />
          {a.privateNote}
        </p>

        <div className="flex flex-col gap-3">
          {lines.map((l, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-sm border border-border p-3">
              <div className="flex items-center gap-2">
                <span className="flex-1 text-label font-semibold uppercase tracking-[.03em] text-muted">
                  {a.supplier}
                </span>
                {lines.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setLines((prev) => prev.filter((_, ix) => ix !== i))}
                    aria-label={t.common.remove}
                    className="text-muted transition hover:text-danger"
                  >
                    <Icon name="close" size={13} />
                  </button>
                )}
              </div>

              {/* PROJ-AC-15, ruled by the owner 2026-08-31, and SUP-T18: **the gate follows the
                  list.** Choosing from the list means choosing a registered supplier, so an
                  unregistered row is SHOWN AND DISABLED rather than hidden — a renter looking for a
                  supplier they have used before needs to find it and see why it cannot be picked,
                  not wonder where it went. */}
              {suppliers && suppliers.length > 0 && (
                <Dropdown
                  label={a.supplier}
                  placeholder="—"
                  value={l.supplierId ?? null}
                  onChange={(v) => {
                    const picked = suppliers.find((x) => x.id === v);
                    // The name is stored even when the id is — see the note at the top.
                    patch(i, { supplierId: picked?.id ?? null, supplierName: picked?.name ?? "" });
                  }}
                  options={suppliers.map((sup) => ({
                    value: sup.id,
                    label: sup.name,
                    // Shown, never a block: the renter knows which of his firms he has registered
                    // without the picker deciding what he may do about it.
                    hint: sup.vendorRegistered ? undefined : a.notRegistered,
                  }))}
                />
              )}

              {/* Empty list: say why there is nothing to choose, then offer the one thing that fixes
                  it. A dropdown with no options and no explanation reads as a broken control. */}
              {suppliers && suppliers.length === 0 && addingOn !== i && (
                <p className="text-meta text-muted">{a.noSuppliers}</p>
              )}

              {/* The same dialog as *Add my own suppliers* (owner, 2026-09-01) — one door for one act,
                  so a renter mid-award is not asked for a firm in a shape he has not seen before. It
                  opens over this one and the award he was building is still here behind it. */}
              <button
                type="button"
                onClick={() => setAddingOn(i)}
                className="inline-flex w-fit items-center gap-1.5 text-meta font-semibold text-brand transition hover:text-brand-hover"
              >
                <Icon name="add" size={14} />
                {a.addSupplier}
              </button>

              {/* ── One row of money, with room to read it (owner, 2026-09-01: *"the awarding modal
                  is terrible"*) ──────────────────────────────────────────────────────────────────
                  Five equal columns put «DEMOBILIZATION» and «PER» into each other at 737px, and
                  three money boxes all placeheld «SAR, optional» — truncated to «SAR, op» in every
                  one of them, which is a placeholder that says nothing three times.

                  Now: units is as narrow as a number needs, the three amounts share the rest evenly,
                  the basis is STATED on the rate's own label instead of being a control, and every
                  box placeholds `SAR` alone. What is optional is said once, under the row. */}
              <div className="grid gap-2.5 sm:grid-cols-[5.5rem_repeat(3,minmax(0,1fr))]">
                <label className="flex flex-col gap-1">
                  <span className="text-label font-semibold uppercase tracking-[.03em] text-muted">{a.units}</span>
                  <input
                    type="number"
                    min={1}
                    max={item.quantity}
                    className="w-full rounded-sm border border-border bg-surface px-3 py-2 text-body text-navy outline-none focus:border-brand"
                    value={l.units}
                    onChange={(e) => patch(i, { units: Math.max(1, Number(e.target.value) || 1) })}
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="flex items-baseline gap-1 truncate text-label font-semibold uppercase tracking-[.03em] text-muted">
                    {a.rate}
                    {/* The record's own basis, read out — never a control. See `defaultBasis`. */}
                    <span className="font-semibold normal-case text-navy-mid">· {basisWord}</span>
                  </span>
                  <input
                    type="number"
                    min={0}
                    className="w-full rounded-sm border border-border bg-surface px-3 py-2 text-body text-navy outline-none focus:border-brand"
                    value={l.rateAmount}
                    placeholder={t.common.sar}
                    onChange={(e) => patch(i, { rateAmount: e.target.value })}
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="truncate text-label font-semibold uppercase tracking-[.03em] text-muted">{a.mobAmount}</span>
                  <input
                    type="number"
                    min={0}
                    className="w-full rounded-sm border border-border bg-surface px-3 py-2 text-body text-navy outline-none focus:border-brand"
                    value={l.mobAmount}
                    placeholder={t.common.sar}
                    onChange={(e) => patch(i, { mobAmount: e.target.value })}
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="truncate text-label font-semibold uppercase tracking-[.03em] text-muted">{a.demobAmount}</span>
                  <input
                    type="number"
                    min={0}
                    className="w-full rounded-sm border border-border bg-surface px-3 py-2 text-body text-navy outline-none focus:border-brand"
                    value={l.demobAmount}
                    placeholder={t.common.sar}
                    onChange={(e) => patch(i, { demobAmount: e.target.value })}
                  />
                </label>
              </div>

              {/* Said once for the whole row, instead of three times inside the boxes. */}
              <p className="text-meta text-muted">{a.moneyOptional}</p>

              {/* What this line comes to, where the renter can see it against the rate they typed.
                  Absent rather than 0 when nothing is priced — a rate the renter has not agreed yet
                  is not a free machine. */}
              {lineTotal(l) !== null && (
                <p className="text-meta tabular-nums text-muted">
                  {a.lineTotal.replace("{amount}", lineTotal(l)!.toLocaleString())}
                </p>
              )}
            </div>
          ))}
        </div>

        {/* A machine line can come from two vendors. This is where that happens. */}
        {used < item.quantity && (
          <button
            type="button"
            onClick={() => setLines((prev) => [...prev, blank(defaultBasis)])}
            className="flex items-center gap-1.5 self-start text-body font-semibold text-brand"
          >
            <Icon name="add" size={14} /> {a.split}
          </button>
        )}

        <div className={`flex items-center gap-2 text-body ${over ? "text-danger" : "text-muted"}`}>
          {over && <Icon name="warning" size={14} className="flex-none" />}
          <span className="tabular-nums">{a.counter.replace("{used}", String(used)).replace("{qty}", String(item.quantity))}</span>
          {over && <span>· {a.overBy.replace("{n}", String(used - item.quantity))}</span>}
        </div>

        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t.common.cancel}
          </Button>
          <Button
            disabled={over || !named || saving}
            onClick={() =>
              onSave(
                lines.map((l) => ({
                  requestId: null,
                  workOrderItemId: null,
                  supplierId: l.supplierId,
                  supplierName: l.supplierName.trim(),
                  units: l.units,
                  rentalBasis: l.rentalBasis,
                  rateAmount: l.rateAmount ? Number(l.rateAmount) : null,
                  /* Omitted rather than sent as 0: the backend's schema is `.partial()`, so an
                     absent key is "not recorded" and 0 would be "agreed, free". */
                  ...(l.mobAmount.trim() ? { mobilizationAmount: Number(l.mobAmount) } : {}),
                  ...(l.demobAmount.trim() ? { demobilizationAmount: Number(l.demobAmount) } : {}),
                })),
              )
            }
          >
            {a.save}
          </Button>
        </div>
      </div>

      {/* Over the award, not instead of it — the line being built is still there when it closes. */}
      <AddSuppliersDialog
        open={addingOn !== null}
        onClose={() => setAddingOn(null)}
        onAdded={() => {
          const line = addingOn;
          setAddingOn(null);
          if (line !== null) void afterAdd(line);
        }}
      />
    </Dialog>
  );
}

/* ----------------------------- Un-awarding ----------------------------- */

/**
 * **Never blocked**, including with a purchase order attached.
 *
 * The renter's own record is theirs to correct, and a delete they cannot perform is a delete they
 * work around by leaving something wrong on the chart. What protects them is being told exactly
 * what goes — every document by name, and that the marks go too — before they press it.
 */
export function UnawardConfirm({
  open,
  onClose,
  award,
  onConfirm,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  award: Award;
  onConfirm: () => void;
  busy?: boolean;
}) {
  const t = useT();
  const u = t.projects.award;

  return (
    <Dialog open={open} onClose={onClose} title={u.unawardTitle}>
      <div className="flex flex-col gap-4">
        <p className="text-body text-navy">{u.unawardBody.replace("{supplier}", award.supplierName).replace("{n}", String(award.units))}</p>

        {(award.documents.length > 0 || award.mobilizedAt || award.demobilizedAt) && (
          <ul className="flex flex-col gap-1 rounded-sm border border-border bg-surface2/50 px-3 py-2.5 text-body text-navy">
            {award.documents.map((d) => (
              <li key={d.id} className="flex items-center gap-2">
                <Icon name="description" size={13} className="flex-none text-muted" />
                {d.filename}
              </li>
            ))}
            {(award.mobilizedAt || award.demobilizedAt) && (
              <li className="flex items-center gap-2">
                <Icon name="push_pin" size={13} className="flex-none text-muted" />
                {u.marksGoToo}
              </li>
            )}
          </ul>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t.common.cancel}
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={busy}>
            {u.unawardAction}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
