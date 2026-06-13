"use client";

import { useT } from "@/lib/i18n";
import { useRfq } from "@/lib/store/rfq-store";
import { Pchips, Toggle, TextArea, Icon } from "@/components/ui";
import {
  EquipmentItem,
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

function ChipField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="mb-1.5 block text-[11.5px] font-bold text-navy-mid">{label}</span>
      {children}
    </div>
  );
}

/**
 * Per-item operator + fuel + delivery/return + notes — the web-app/002 per-item structure, shared so
 * the manual builder (web-app/005) uses the SAME fields as the RFQ flow (not the app's simpler set).
 */
export function ItemDetails({
  item,
  sharedFuelResp,
  sharedDelivery,
  sharedReturn,
}: {
  item: EquipmentItem;
  sharedFuelResp: Party | null;
  sharedDelivery: Party | null;
  sharedReturn: Party | null;
}) {
  const t = useT();
  const { actions } = useRfq();
  const nationalityOpts = [
    { value: "arab", label: t.step2.perItem.nationalityArab },
    { value: "other", label: t.step2.perItem.nationalityOther },
  ];

  return (
    <div className="space-y-4 rounded-lg border border-border bg-surface2 p-4">
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

      {/* Delivery / Return overrides (AC-25) */}
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
  );
}
