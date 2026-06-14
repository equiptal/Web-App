"use client";

import { useT } from "@/lib/i18n";
import { useRfq } from "@/lib/store/rfq-store";
import { Card, Field, Icon, Seg2, SelChips, Select, TextArea, TextInput } from "@/components/ui";
import {
  PAYMENT_TERMS,
  PAYMENT_METHODS,
  MAINTENANCE_RESPONSIBILITIES,
  MAINTENANCE_SLAS,
  BID_WINDOWS,
  type PaymentTerm,
  type PaymentMethod,
  type MaintenanceResponsibility,
  type MaintenanceSla,
  type BidWindow,
} from "@/lib/contract";

function opt<T extends string>(values: readonly T[], dict: Record<string, string>) {
  return values.map((v) => ({ value: v, label: dict[v] ?? v }));
}

export function Step3Preferences() {
  const t = useT();
  const { state, actions } = useRfq();
  const p = state.draft!.preferences;
  const sf = p.supplierFilters;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[23px] font-extrabold tracking-tight">{t.step3.title}</h1>
        <p className="mt-1 max-w-xl text-sm text-muted">{t.step3.subtitle}</p>
      </div>

      {/* Core terms (AC-36/37/38) */}
      <Card title={<><Icon name="receipt_long" size={18} className="me-1.5 align-[-3px] text-navy-mid" />{t.step3.coreTerms}</>}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t.step3.payment.terms}>
            <Select<PaymentTerm> value={p.payment.terms} placeholder="—" onChange={(v) => actions.patchPreferences({ payment: { terms: v } })} options={opt(PAYMENT_TERMS, t.options.paymentTerm)} />
          </Field>
          <Field label={t.step3.payment.method}>
            <Select<PaymentMethod> value={p.payment.method} placeholder="—" onChange={(v) => actions.patchPreferences({ payment: { method: v } })} options={opt(PAYMENT_METHODS, t.options.paymentMethod)} />
          </Field>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t.step3.maintenance.title}>
            <Seg2<MaintenanceResponsibility> value={p.maintenance.responsibility} onChange={(v) => actions.patchPreferences({ maintenance: { responsibility: v } })} options={opt(MAINTENANCE_RESPONSIBILITIES, t.options.maintenanceResp)} />
          </Field>
          {/* AC-37: SLA shown only when responsibility is Supplier. */}
          {p.maintenance.responsibility === "supplier" && (
            <Field label={t.step3.maintenance.sla}>
              <Seg2<MaintenanceSla> value={p.maintenance.sla} onChange={(v) => actions.patchPreferences({ maintenance: { sla: v } })} options={opt(MAINTENANCE_SLAS, t.options.maintenanceSla)} />
            </Field>
          )}
        </div>

        <div className="mt-4">
          <Field label={t.step3.additionalNotes} optional>
            <TextArea rows={3} value={p.additionalNotes} onChange={(e) => actions.patchPreferences({ additionalNotes: e.target.value })} />
          </Field>
        </div>
      </Card>

      {/* Optional extras (AC-39/40) */}
      <Card title={<><Icon name="tune" size={18} className="me-1.5 align-[-3px] text-navy-mid" />{t.step3.optionalExtras}</>}>
        <Field label={`${t.step3.budget.label} · ${t.common.sar}`} optional hint={t.step3.budget.hint}>
          <TextInput type="number" min={0} className="max-w-[220px]" value={p.budgetSar ?? ""} onChange={(e) => actions.patchPreferences({ budgetSar: e.target.value === "" ? null : Number(e.target.value) })} />
        </Field>

        <div className="mt-4">
          <span className="mb-1.5 block text-[12.5px] font-bold text-navy-mid">{t.step3.supplierFilters.title}</span>
          <SelChips
            values={[...(sf.verifiedOnly ? ["verified"] : []), ...(sf.sublettingAllowed ? ["subletting"] : [])]}
            onToggle={(v) =>
              v === "verified"
                ? actions.patchPreferences({ supplierFilters: { verifiedOnly: !sf.verifiedOnly } })
                : actions.patchPreferences({ supplierFilters: { sublettingAllowed: !sf.sublettingAllowed } })
            }
            options={[
              { value: "verified", label: t.step3.supplierFilters.verifiedOnly },
              { value: "subletting", label: t.step3.supplierFilters.subletting },
            ]}
          />
        </div>

        <div className="mt-4">
          <Field label={t.step3.supplierFilters.bidWindow} optional>
            <Seg2<BidWindow> value={sf.bidWindow} onChange={(v) => actions.patchPreferences({ supplierFilters: { bidWindow: v } })} options={opt(BID_WINDOWS, t.options.bidWindow)} />
          </Field>
        </div>
      </Card>
    </div>
  );
}
