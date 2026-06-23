"use client";

import { useT } from "@/lib/i18n";
import { useRfq } from "@/lib/store/rfq-store";
import { Card, Field, Icon, Seg2, SelChips, Select, TextArea, TextInput } from "@/components/ui";
import {
  PAYMENT_TERMS,
  BID_WINDOWS,
  type PaymentTerm,
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
          <Field label={t.step3.payment.terms} optional>
            <Select<PaymentTerm> value={p.payment.terms} placeholder="—" onChange={(v) => actions.patchPreferences({ payment: { terms: v } })} options={opt(PAYMENT_TERMS, t.options.paymentTerm)} />
          </Field>
        </div>

        <div className="mt-4">
          <Field label={t.step3.additionalNotes} optional>
            <TextArea rows={3} value={p.additionalNotes} onChange={(e) => actions.patchPreferences({ additionalNotes: e.target.value })} />
          </Field>
        </div>
      </Card>

      {/* Optional extras (AC-39/40) */}
      <Card title={<><Icon name="tune" size={18} className="me-1.5 align-[-3px] text-navy-mid" />{t.step3.optionalExtras}</>}>
        {/* Budget · Supplier filters · Bid window — one row on desktop, stacked on mobile. */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label={`${t.step3.budget.label} · ${t.common.sar}`} optional hint={t.step3.budget.hint}>
            <TextInput type="number" min={0} value={p.budgetSar ?? ""} onChange={(e) => actions.patchPreferences({ budgetSar: e.target.value === "" ? null : Number(e.target.value) })} />
          </Field>

          <div>
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

          <Field label={t.step3.supplierFilters.bidWindow} optional>
            <Seg2<BidWindow> value={sf.bidWindow} onChange={(v) => actions.patchPreferences({ supplierFilters: { bidWindow: v } })} onClear={() => actions.patchPreferences({ supplierFilters: { bidWindow: null } })} options={opt(BID_WINDOWS, t.options.bidWindow)} />
          </Field>
        </div>
      </Card>
    </div>
  );
}
