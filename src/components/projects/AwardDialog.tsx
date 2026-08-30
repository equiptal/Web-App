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
 * ── The supplier control has two modes ───────────────────────────────────────────────────────────
 *
 * The picker when the renter's supplier list answers, a plain field with autocomplete over names
 * already used when it does not. Production only ever sees the picker — the registry ships first.
 * The fallback exists so this is not blocked while that lands, and it is why `supplierName` is
 * written either way: a row renders from a name it already holds.
 *
 * ── The counter blocks Save, and says why before you press it ────────────────────────────────────
 *
 * A running *used of quantity* means a renter splitting three machines across two vendors can see
 * the third is still unassigned without doing arithmetic. Over the quantity, Save is disabled — the
 * backend refuses it anyway, and finding out after pressing is worse than being told before.
 */

import { useEffect, useMemo, useState } from "react";
import { useT } from "@/lib/i18n";
import { Button, Icon } from "@/components/ui";
import { Dialog } from "@/components/Dialog";
import { listRenterSuppliers, type RenterSupplier, type AwardInput } from "@/lib/api/client";
import { awardedUnits, type Award, type ChartItem } from "@/lib/contract/award";

type Line = { supplierId: string | null; supplierName: string; units: number; rateAmount: string; rentalBasis: Award["rentalBasis"] };

const blank = (basis: Award["rentalBasis"]): Line => ({ supplierId: null, supplierName: "", units: 1, rateAmount: "", rentalBasis: basis });

export function AwardDialog({
  open,
  onClose,
  item,
  /** The site's basis, as the starting value — a renter rarely hires one machine on a different one. */
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

  const [lines, setLines] = useState<Line[]>([blank(defaultBasis)]);
  const [suppliers, setSuppliers] = useState<RenterSupplier[] | null>(null);

  useEffect(() => {
    if (!open) return;
    setLines([blank(defaultBasis)]);
    // An empty list is a normal answer here, not a failure — it puts the control in its typed mode.
    listRenterSuppliers().then(setSuppliers).catch(() => setSuppliers([]));
  }, [open, defaultBasis]);

  const already = awardedUnits(item);
  const asking = lines.reduce((n, l) => n + (Number(l.units) || 0), 0);
  const used = already + asking;
  const over = used > item.quantity;
  const named = lines.every((l) => l.supplierName.trim().length > 0);

  /** Names already used on this site, for the typed mode's autocomplete. */
  const known = useMemo(() => [...new Set(item.awards.map((x) => x.supplierName))].filter(Boolean), [item.awards]);

  const patch = (i: number, p: Partial<Line>) => setLines((prev) => prev.map((l, ix) => (ix === i ? { ...l, ...p } : l)));

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

              {suppliers && suppliers.length > 0 ? (
                <select
                  className="w-full rounded-sm border border-border bg-surface px-3 py-2 text-body text-navy outline-none focus:border-brand"
                  value={l.supplierId ?? ""}
                  onChange={(e) => {
                    const s = suppliers.find((x) => x.id === e.target.value);
                    // The name is stored even when the id is — see the note at the top.
                    patch(i, { supplierId: s?.id ?? null, supplierName: s?.name ?? "" });
                  }}
                >
                  <option value="">—</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {/* Vendor registration is the renter's own gate, shown rather than enforced. */}
                      {s.vendorRegistered ? "" : ` · ${a.notRegistered}`}
                    </option>
                  ))}
                </select>
              ) : (
                <>
                  <input
                    list={`sup-${i}`}
                    className="w-full rounded-sm border border-border bg-surface px-3 py-2 text-body text-navy outline-none focus:border-brand"
                    value={l.supplierName}
                    placeholder={a.supplierPlaceholder}
                    onChange={(e) => patch(i, { supplierName: e.target.value, supplierId: null })}
                  />
                  <datalist id={`sup-${i}`}>
                    {known.map((n) => (
                      <option key={n} value={n} />
                    ))}
                  </datalist>
                </>
              )}

              <div className="grid gap-2 sm:grid-cols-3">
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
                  <span className="text-label font-semibold uppercase tracking-[.03em] text-muted">{a.rate}</span>
                  <input
                    type="number"
                    min={0}
                    className="w-full rounded-sm border border-border bg-surface px-3 py-2 text-body text-navy outline-none focus:border-brand"
                    value={l.rateAmount}
                    placeholder={a.ratePlaceholder}
                    onChange={(e) => patch(i, { rateAmount: e.target.value })}
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-label font-semibold uppercase tracking-[.03em] text-muted">{a.basis}</span>
                  <select
                    className="w-full rounded-sm border border-border bg-surface px-3 py-2 text-body text-navy outline-none focus:border-brand"
                    value={l.rentalBasis ?? ""}
                    onChange={(e) => patch(i, { rentalBasis: (e.target.value || null) as Award["rentalBasis"] })}
                  >
                    <option value="">—</option>
                    <option value="daily">{a.daily}</option>
                    <option value="weekly">{a.weekly}</option>
                    <option value="monthly">{a.monthly}</option>
                  </select>
                </label>
              </div>
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
                })),
              )
            }
          >
            {a.save}
          </Button>
        </div>
      </div>
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
