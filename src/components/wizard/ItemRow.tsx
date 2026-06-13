"use client";

import { useState } from "react";
import { useT, fmt } from "@/lib/i18n";
import { useRfq } from "@/lib/store/rfq-store";
import { SUPPORT_WHATSAPP_NUMBER } from "@/lib/config/support";
import { Button, Field, Icon, Pchips, Select, Stepper, TextArea, Toggle, Modal } from "@/components/ui";
import {
  EquipmentItem,
  Taxonomy,
  resolveRef,
  isCompleteRef,
  FUEL_TYPES,
  SAFETY_CERTIFICATES,
  PARTIES,
  type FuelType,
  type OperatorCertificate,
  type Party,
} from "@/lib/contract";

function opt<T extends string>(values: readonly T[], dict: Record<string, string>) {
  return values.map((v) => ({ value: v, label: dict[v] ?? v }));
}

/** Best-effort category → Material icon glyph for the row avatar. */
const CATEGORY_ICON: Record<string, string> = {
  earthmoving: "construction",
  "cranes-lifting": "precision_manufacturing",
  power: "bolt",
  haulage: "local_shipping",
  access: "forklift",
  concrete: "foundation",
};

export function ItemRow({
  item,
  taxonomy,
  sharedFuelResp,
  sharedDelivery,
  sharedReturn,
}: {
  item: EquipmentItem;
  taxonomy: Taxonomy;
  sharedFuelResp: Party | null;
  sharedDelivery: Party | null;
  sharedReturn: Party | null;
}) {
  const t = useT();
  const { actions } = useRfq();
  const [editingMatch, setEditingMatch] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const nationalityOpts = [
    { value: "arab", label: t.step2.perItem.nationalityArab },
    { value: "other", label: t.step2.perItem.nationalityOther },
  ];

  const { category, subcategory, measurement } = resolveRef(taxonomy, item.ref);
  const status = item.verdict === "no-match" ? "not-available" : item.resolved ? "matched" : "needs-ok";
  const glyph = (item.ref.categoryId && CATEGORY_ICON[item.ref.categoryId]) || "construction";
  // Show the size even when it didn't resolve to a taxonomy measurement (off-taxonomy / unstated):
  // fall back to the verbatim stated size so it never disappears from the match line.
  const sizeLabel = measurement?.name ?? item.rawSize ?? undefined;
  const matchLabel = [category?.name, subcategory?.name, sizeLabel].filter(Boolean).join(" · ") || (item.rawLabel ?? "—");
  // What the renter actually wrote — name + stated size — so "from your RFQ" keeps the size visible.
  const rawDisplay = [item.rawLabel, item.rawSize].filter(Boolean).join(" · ") || item.rawLabel;

  const borderClass =
    status === "needs-ok" ? "border-s-[3px] border-s-warn" : status === "not-available" ? "border-s-[3px] border-s-danger" : "border-s-[3px] border-s-ok";

  /* ----------------------------- No-match (AC-30/31/32) ----------------------------- */
  if (item.verdict === "no-match") {
    return (
      <li className="grid grid-cols-[38px_1fr_auto] items-center gap-3 rounded-xl border border-s-[3px] border-border border-s-danger bg-surface px-4 py-3">
        <Avatar glyph={glyph} conf="low" />
        <div className="min-w-0">
          <RfqMatch raw={rawDisplay} matched={<span className="text-danger">{t.step2.status.notAvailable}</span>} />
          <p className="mt-1 text-xs text-muted">{t.step2.noMatch.explainer}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              const msg = fmt(t.step2.noMatch.whatsappMessage, { item: item.rawLabel ?? "" });
              window.open(`https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
              actions.removeItem(item.id);
            }}
          >
            <Icon name="chat" size={15} /> {t.step2.noMatch.provide}
          </Button>
          <Button variant="ghost" onClick={() => actions.removeItem(item.id)}>
            {t.step2.noMatch.cancel}
          </Button>
        </div>
      </li>
    );
  }

  const taxonomyEditor = (
    <div className="col-span-full mt-3 grid grid-cols-1 gap-2 rounded-lg border border-border bg-surface2 p-3 sm:grid-cols-3">
      <Field label={t.step2.category}>
        <Select value={item.ref.categoryId} placeholder={t.step2.pickCategory} onChange={(v) => actions.setItemCategory(item.id, v)} options={taxonomy.map((c) => ({ value: c.id, label: c.name }))} />
      </Field>
      <Field label={t.step2.subcategory}>
        <Select value={item.ref.subcategoryId} placeholder={t.step2.pickSubcategory} disabled={!category} onChange={(v) => actions.setItemSubcategory(item.id, v)} options={(category?.subcategories ?? []).map((s) => ({ value: s.id, label: s.name }))} />
      </Field>
      <Field label={t.step2.measurement}>
        <Select value={item.ref.measurementId} placeholder={t.step2.pickMeasurement} disabled={!subcategory} onChange={(v) => actions.setItemMeasurement(item.id, v)} options={(subcategory?.measurements ?? []).map((m) => ({ value: m.id, label: m.name }))} />
      </Field>
    </div>
  );

  return (
    <li className={`grid grid-cols-[38px_1fr_auto] items-start gap-3 rounded-xl border border-border bg-surface px-4 py-3 ${borderClass}`}>
      <Avatar glyph={glyph} conf={status === "matched" ? "high" : "mid"} />

      <div className="min-w-0">
        <RfqMatch raw={rawDisplay} matched={matchLabel} />

        {/* Unit conversion / nearest-size advisory (AC-19/20) */}
        {item.suggestion?.unitConversion && (
          <div className="mt-1.5 flex items-center gap-1.5 text-[11.5px] font-semibold text-warn">
            <Icon name="swap_horiz" size={14} />
            {fmt(t.step2.unitConversion, {
              fromValue: item.suggestion.unitConversion.fromValue,
              fromUnit: item.suggestion.unitConversion.fromUnit,
              toValue: item.suggestion.unitConversion.toValue,
              toUnit: item.suggestion.unitConversion.toUnit,
            })}
          </div>
        )}
        {/* Agent's free-text capacity advisory (real Mansour output, AC-19/20) */}
        {item.advisory && !item.suggestion?.unitConversion && (
          <div className="mt-1.5 flex items-center gap-1.5 text-[11.5px] font-semibold text-warn">
            <Icon name="swap_horiz" size={14} /> {item.advisory}
          </div>
        )}
        {!item.resolved &&
          (!isCompleteRef(item.ref) ? (
            // AC-18/19: Approve is disabled until the size is picked — say so explicitly.
            <p className="mt-1.5 flex items-center gap-1.5 text-[12.5px] font-semibold text-warn">
              <Icon name="error_outline" size={14} /> {t.step2.pickSizeToApprove}
            </p>
          ) : (
            <p className="mt-1.5 text-[12.5px] text-muted">
              {item.suggestion ? fmt(t.step2.nearestSuggested, { measurement: measurement?.name ?? "" }) : t.step2.needsValidationPrompt}
            </p>
          ))}

        {/* Matched: qty + operator/fuel meta tags */}
        {status === "matched" && (
          <>
            <div className="mt-2.5 flex items-center gap-2.5">
              <span className="text-[10.5px] font-extrabold uppercase tracking-wide text-muted">{t.step2.perItem.quantity}</span>
              <Stepper value={item.quantity} min={1} onChange={(v) => actions.patchItem(item.id, { quantity: v })} />
            </div>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <MetaTag icon="person" label={t.step2.perItem.operatorNeeded} value={t.options.operatorNeeded[item.operatorNeeded]} />
              <MetaTag icon="local_gas_station" label={t.step2.perItem.fuelType} value={t.options.fuelType[item.fuelType]} />
              {item.additionalNotes && <MetaTag icon="sticky_note_2" label={t.step2.perItem.additionalNotes} value={item.additionalNotes} />}
            </div>
          </>
        )}
      </div>

      {/* Right: status + actions */}
      <div className="flex flex-col items-end gap-2">
        <StatusLabel status={status} t={t} />
        <div className="flex gap-1.5">
          {status === "needs-ok" ? (
            <>
              <Button disabled={!isCompleteRef(item.ref)} onClick={() => (item.suggestion ? actions.approveSuggestion(item.id) : actions.approveItem(item.id))}>
                <Icon name="check" size={15} /> {t.common.approve}
              </Button>
              <Button variant="secondary" onClick={() => setEditingMatch((e) => !e)}>
                <Icon name="swap_horiz" size={15} /> {t.common.change}
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={() => setShowDetails((d) => !d)}>
              <Icon name="tune" size={15} /> {t.common.edit}
            </Button>
          )}
          <button className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted hover:border-danger hover:text-danger" title={t.common.remove} onClick={() => setConfirmRemove(true)}>
            <Icon name="close" size={17} />
          </button>
        </div>
      </div>

      {(editingMatch || !isCompleteRef(item.ref)) && taxonomyEditor}

      {/* Per-item details — editable only once Matched (AC-54). Mirrors the prototype:
          operator card + fuel + notes. Delivery/return are request-wide only (Settings for all
          items) — no per-item override here; values are just Me/Supplier. */}
      {status === "matched" && showDetails && (
        <div className="col-span-full mt-3 space-y-4 rounded-lg border border-border bg-surface2 p-4">
          {/* Operator (AC-24) */}
          <div className="overflow-hidden rounded-lg border border-border bg-surface">
            <div className="flex items-center justify-between bg-surface2 px-3 py-2.5">
              <span className="flex items-center gap-2 text-[13.5px] font-extrabold">
                <Icon name="person" size={18} className="text-navy-mid" /> {t.step2.perItem.operatorNeeded}
              </span>
              <Toggle checked={item.operatorNeeded === "yes"} onChange={(v) => actions.patchItem(item.id, { operatorNeeded: v ? "yes" : "no" })} />
            </div>
            {item.operatorNeeded === "yes" && (
              <div className="space-y-3 px-3 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-bold">{t.step2.perItem.nightShift}</span>
                  <Toggle checked={item.operator.nightShift} onChange={(v) => actions.patchItemOperator(item.id, { nightShift: v })} />
                </div>
                <ChipField label={t.step2.perItem.nationality}>
                  <Pchips value={item.operator.nationality} onChange={(v) => actions.patchItemOperator(item.id, { nationality: v })} options={nationalityOpts} />
                </ChipField>
                <ChipField label={t.step2.perItem.certificate}>
                  <Pchips<OperatorCertificate> value={item.operator.certificate} onChange={(v) => actions.patchItemOperator(item.id, { certificate: v })} options={opt(SAFETY_CERTIFICATES, t.options.safetyCert)} />
                </ChipField>
                <ChipField label={t.step2.perItem.accommodation}>
                  <Pchips<Party> value={item.operator.accommodation} onChange={(v) => actions.patchItemOperator(item.id, { accommodation: v })} options={opt(PARTIES, t.options.party)} />
                </ChipField>
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-bold">{t.step2.perItem.transfer}</span>
                  <Toggle checked={item.operator.transfer} onChange={(v) => actions.patchItemOperator(item.id, { transfer: v })} />
                </div>
              </div>
            )}
          </div>

          {/* Fuel (AC-26) */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ChipField label={t.step2.perItem.fuelType}>
              <Pchips<FuelType> value={item.fuelType} onChange={(v) => actions.patchItem(item.id, { fuelType: v })} options={opt(FUEL_TYPES, t.options.fuelType)} />
            </ChipField>
            <ChipField label={t.step1.requestWide.fuelResponsibility}>
              <Pchips<Party> value={item.fuelResponsibilityOverride ?? sharedFuelResp} onChange={(v) => actions.patchItem(item.id, { fuelResponsibilityOverride: v })} options={opt(PARTIES, t.options.party)} />
            </ChipField>
          </div>

          {/* Delivery / Return — per-item override of the request-wide setting (AC-25). Mansour sets
              these per line (mobilization/demobilization), so surface + allow editing them here. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ChipField label={t.step1.requestWide.delivery}>
              <Pchips<Party> value={item.deliveryOverride ?? sharedDelivery} onChange={(v) => actions.patchItem(item.id, { deliveryOverride: v })} options={opt(PARTIES, t.options.party)} />
            </ChipField>
            <ChipField label={t.step1.requestWide.return}>
              <Pchips<Party> value={item.returnOverride ?? sharedReturn} onChange={(v) => actions.patchItem(item.id, { returnOverride: v })} options={opt(PARTIES, t.options.party)} />
            </ChipField>
          </div>

          {/* Additional notes (AC-53) */}
          <ChipField label={t.step2.perItem.additionalNotes}>
            <TextArea rows={2} value={item.additionalNotes} onChange={(e) => actions.patchItem(item.id, { additionalNotes: e.target.value })} />
          </ChipField>
        </div>
      )}

      <Modal open={confirmRemove} onClose={() => setConfirmRemove(false)} title={t.step2.removeConfirm}>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmRemove(false)}>
            {t.common.cancel}
          </Button>
          <Button variant="danger" onClick={() => { actions.removeItem(item.id); setConfirmRemove(false); }}>
            {t.common.remove}
          </Button>
        </div>
      </Modal>
    </li>
  );
}

/* ---------------------------------- bits ---------------------------------- */

function Avatar({ glyph, conf }: { glyph: string; conf: "high" | "mid" | "low" }) {
  const dot = { high: "bg-ok", mid: "bg-warn", low: "bg-danger" }[conf];
  const dotIcon = { high: "check", mid: "pending", low: "block" }[conf];
  return (
    <div className="relative grid h-[38px] w-[38px] place-items-center self-start rounded-lg bg-surface2">
      <Icon name={glyph} size={22} className="text-navy" />
      <span className={`absolute -end-1.5 -bottom-1.5 grid h-5 w-5 place-items-center rounded-full border-2 border-surface ${dot}`}>
        <Icon name={dotIcon} size={12} className="text-white" />
      </span>
    </div>
  );
}

function RfqMatch({ raw, matched }: { raw: string | null; matched: React.ReactNode }) {
  const t = useT();
  return (
    <div className="flex items-center gap-3">
      <span className="flex w-[200px] flex-none flex-col gap-0.5">
        <span className="text-[10px] font-extrabold uppercase tracking-wide text-muted">{t.step2.fromRfq}</span>
        <span className="text-[15px] font-bold leading-tight break-words">{raw ? `“${raw}”` : "—"}</span>
      </span>
      <Icon name="arrow_forward" size={20} className="flex-none text-muted/60" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[10px] font-extrabold uppercase tracking-wide text-muted">{t.step2.matchedTo}</span>
        <span className="break-words text-[15px] font-extrabold leading-tight">{matched}</span>
      </span>
    </div>
  );
}

function StatusLabel({ status, t }: { status: "matched" | "needs-ok" | "not-available"; t: ReturnType<typeof useT> }) {
  const map = {
    matched: { c: "text-ok", d: "bg-ok", l: t.step2.status.matched },
    "needs-ok": { c: "text-warn", d: "bg-warn", l: t.step2.status.needsOk },
    "not-available": { c: "text-danger", d: "bg-danger", l: t.step2.status.notAvailable },
  }[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${map.c}`}>
      <span className={`h-[7px] w-[7px] rounded-full ${map.d}`} /> {map.l}
    </span>
  );
}

function MetaTag({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface2 px-2.5 py-1 text-[11px] font-bold text-navy-mid">
      <Icon name={icon} size={13} className="text-muted" /> {label}: <b className="text-navy">{value}</b>
    </span>
  );
}

function ChipField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="mb-1.5 block text-[11.5px] font-bold text-navy-mid">{label}</span>
      {children}
    </div>
  );
}
