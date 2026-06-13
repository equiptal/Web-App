"use client";

import { useEffect, useState } from "react";
import { useLocale, useT } from "@/lib/i18n";
import { useRfq } from "@/lib/store/rfq-store";
import { Icon } from "@/components/ui";
import type { TaxonomyNode } from "@/lib/contract/stores";

/**
 * Manual Step 2 — equipment picker using the APP taxonomy (with category/type icons), mirroring the
 * mobile app (web-app/005, AC-05/06/07/08/13). Sets each item's ref to app-taxonomy ids (posted to
 * `/rentees/me/requests`). Multi-item; per-item quantity/operator/fuel/notes; remove with confirm.
 */
const FUELS = ["diesel", "petrol", "electric"] as const;

export function ManualEquipmentStep() {
  const t = useT();
  const m = t.manual;
  const { locale } = useLocale();
  const ar = locale === "ar";
  const { state, actions } = useRfq();
  const [tax, setTax] = useState<TaxonomyNode[]>([]);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/stores/taxonomy", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: { taxonomy: TaxonomyNode[] }) => setTax(d.taxonomy ?? []))
      .catch(() => setTax([]));
  }, []);

  const label = (n: TaxonomyNode) => (ar ? n.nameAr : n.name) || n.name;
  const items = (state.draft?.items ?? []).filter((i) => !i.removed);

  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="text-[20px] font-extrabold tracking-tight text-navy">{m.step2Title}</h2>
      <p className="mt-1 text-[13.5px] text-muted">{m.step2Sub}</p>
      {state.channel === "direct" && state.supplier && (
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-info-soft px-3 py-1 text-[12.5px] font-semibold text-info">
          <Icon name="storefront" size={14} /> {m.directSupplier} {state.supplier.name}
        </div>
      )}

      <div className="mt-5 flex flex-col gap-4">
        {items.map((item, idx) => {
          const cat = tax.find((c) => c.id === item.ref.categoryId);
          const sub = cat?.children.find((s) => s.id === item.ref.subcategoryId);
          const measurements = sub?.children ?? [];
          const confirming = confirmId === item.id;
          return (
            <div key={item.id} className="rounded-[14px] border border-border bg-surface p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[13px] font-bold text-navy-mid">{m.item} {idx + 1}</span>
                {items.length > 1 &&
                  (confirming ? (
                    <span className="inline-flex items-center gap-2 text-[12px]">
                      {m.removeConfirm}
                      <button onClick={() => { actions.removeItem(item.id); setConfirmId(null); }} className="rounded-md bg-danger px-2 py-0.5 font-bold text-white">
                        {m.confirmRemove}
                      </button>
                      <button onClick={() => setConfirmId(null)} className="rounded-md border border-border px-2 py-0.5 font-semibold text-muted">
                        {m.cancel}
                      </button>
                    </span>
                  ) : (
                    <button onClick={() => setConfirmId(item.id)} className="text-muted hover:text-danger" aria-label={m.remove}>
                      <Icon name="close" size={18} />
                    </button>
                  ))}
              </div>

              <PickGrid label={m.category} hint={m.pickCategory} nodes={tax} selectedId={item.ref.categoryId} labelOf={label} onPick={(id) => actions.setItemCategory(item.id, id)} icons />
              {cat && (
                <PickGrid label={m.subcategory} hint={m.pickSubcategory} nodes={cat.children} selectedId={item.ref.subcategoryId} labelOf={label} onPick={(id) => actions.setItemSubcategory(item.id, id)} icons />
              )}
              {sub && (
                <div className="mt-3">
                  <div className="mb-1.5 text-[12px] font-bold text-navy-mid">{m.measurement}</div>
                  <div className="flex flex-wrap gap-2">
                    {measurements.map((mn) => (
                      <button
                        key={mn.id}
                        onClick={() => {
                          actions.setItemMeasurement(item.id, mn.id);
                          // Store a readable label so the agent-taxonomy-based preview can show the item.
                          actions.patchItem(item.id, { rawLabel: [cat && label(cat), sub && label(sub), label(mn)].filter(Boolean).join(" · ") });
                        }}
                        className={`rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition ${
                          item.ref.measurementId === mn.id ? "border-brand bg-brand-soft text-brand" : "border-border bg-surface text-navy-mid hover:border-navy-mid"
                        }`}
                      >
                        {label(mn)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Per-item options (AC-08) */}
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Field label={m.quantity}>
                  <input
                    type="number"
                    min={1}
                    value={item.quantity}
                    onChange={(e) => actions.patchItem(item.id, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                    className="h-[38px] w-full rounded-[10px] border border-border bg-surface2 px-3 text-[13px] outline-0 focus:border-brand"
                  />
                </Field>
                <Field label={m.operator}>
                  <select
                    value={item.operatorNeeded}
                    onChange={(e) => actions.patchItem(item.id, { operatorNeeded: e.target.value as "yes" | "no" })}
                    className="h-[38px] w-full rounded-[10px] border border-border bg-surface2 px-2 text-[13px] font-semibold text-navy-mid outline-0 focus:border-brand"
                  >
                    <option value="yes">{m.withOperator}</option>
                    <option value="no">{m.noOperator}</option>
                  </select>
                </Field>
                <Field label={m.fuel}>
                  <select
                    value={item.fuelType}
                    onChange={(e) => actions.patchItem(item.id, { fuelType: e.target.value as (typeof FUELS)[number] })}
                    className="h-[38px] w-full rounded-[10px] border border-border bg-surface2 px-2 text-[13px] font-semibold text-navy-mid outline-0 focus:border-brand"
                  >
                    <option value="diesel">{m.fuelDiesel}</option>
                    <option value="petrol">{m.fuelPetrol}</option>
                    <option value="electric">{m.fuelElectric}</option>
                  </select>
                </Field>
                <Field label={m.notes} full>
                  <input
                    value={item.additionalNotes}
                    onChange={(e) => actions.patchItem(item.id, { additionalNotes: e.target.value })}
                    placeholder={m.notesPlaceholder}
                    className="h-[38px] w-full rounded-[10px] border border-border bg-surface2 px-3 text-[13px] outline-0 focus:border-brand"
                  />
                </Field>
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={() => actions.addItem()}
        className="mt-4 inline-flex items-center gap-1.5 rounded-[10px] border border-dashed border-border px-4 py-2.5 text-[13px] font-bold text-navy-mid hover:border-brand"
      >
        <Icon name="add" size={16} /> {m.addItem}
      </button>
    </div>
  );
}

function PickGrid({
  label,
  hint,
  nodes,
  selectedId,
  labelOf,
  onPick,
  icons,
}: {
  label: string;
  hint: string;
  nodes: TaxonomyNode[];
  selectedId: string | null;
  labelOf: (n: TaxonomyNode) => string;
  onPick: (id: string) => void;
  icons?: boolean;
}) {
  return (
    <div className="mt-3">
      <div className="mb-1.5 text-[12px] font-bold text-navy-mid">{selectedId ? label : hint}</div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
        {nodes.map((n) => {
          const active = selectedId === n.id;
          return (
            <button
              key={n.id}
              onClick={() => onPick(n.id)}
              className={`flex flex-col items-center gap-1.5 rounded-[12px] border p-2.5 text-center transition ${
                active ? "border-brand bg-brand-soft" : "border-border bg-surface hover:border-navy-mid"
              }`}
            >
              {icons && (
                <span
                  className="grid h-9 w-9 place-items-center rounded-[8px] bg-surface2"
                  style={n.iconUrl ? { backgroundImage: `url("${n.iconUrl}")`, backgroundSize: "contain", backgroundRepeat: "no-repeat", backgroundPosition: "center" } : undefined}
                >
                  {!n.iconUrl && <Icon name="construction" size={18} className="text-muted" />}
                </span>
              )}
              <span className={`line-clamp-2 text-[11.5px] font-semibold ${active ? "text-brand" : "text-navy-mid"}`}>{labelOf(n)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={`flex flex-col gap-1 ${full ? "col-span-2 sm:col-span-1" : ""}`}>
      <span className="text-[11px] font-bold uppercase tracking-wide text-muted">{label}</span>
      {children}
    </label>
  );
}
