"use client";

import { useT } from "@/lib/i18n";
import { useRfq } from "@/lib/store/rfq-store";
import { Card, Field, RadioGroup, Select, TextArea, TextInput, Toggle } from "@/components/ui";
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

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{t.step3.title}</h2>

      {/* ---------- Core Terms (AC-35/36/37/38) ---------- */}
      <Card title={t.step3.coreTerms}>
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-medium">{t.step3.payment.title}</p>
            <Field label={t.step3.payment.terms}>
              <RadioGroup<PaymentTerm>
                name="payTerms"
                value={p.payment.terms}
                onChange={(v) => actions.patchPreferences({ payment: { terms: v } })}
                options={opt(PAYMENT_TERMS, t.options.paymentTerm)}
              />
            </Field>
            <div className="mt-2">
              <Field label={t.step3.payment.method}>
                <RadioGroup<PaymentMethod>
                  name="payMethod"
                  value={p.payment.method}
                  onChange={(v) => actions.patchPreferences({ payment: { method: v } })}
                  options={opt(PAYMENT_METHODS, t.options.paymentMethod)}
                />
              </Field>
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">{t.step3.maintenance.title}</p>
            <Field label={t.step3.maintenance.responsibility}>
              <RadioGroup<MaintenanceResponsibility>
                name="maintResp"
                value={p.maintenance.responsibility}
                onChange={(v) => actions.patchPreferences({ maintenance: { responsibility: v } })}
                options={opt(MAINTENANCE_RESPONSIBILITIES, t.options.maintenanceResp)}
              />
            </Field>
            {/* AC-37: SLA shown only when responsibility is Supplier. */}
            {p.maintenance.responsibility === "supplier" && (
              <div className="mt-2">
                <Field label={t.step3.maintenance.sla}>
                  <Select<MaintenanceSla>
                    value={p.maintenance.sla}
                    placeholder="—"
                    onChange={(v) => actions.patchPreferences({ maintenance: { sla: v } })}
                    options={opt(MAINTENANCE_SLAS, t.options.maintenanceSla)}
                  />
                </Field>
              </div>
            )}
          </div>

          <Field label={t.step3.additionalNotes} optional>
            <TextArea rows={3} value={p.additionalNotes} onChange={(e) => actions.patchPreferences({ additionalNotes: e.target.value })} />
          </Field>
        </div>
      </Card>

      {/* ---------- Optional Extras (AC-39/40) — no fulfillment banner (AC-35) ---------- */}
      <Card title={t.step3.optionalExtras}>
        <div className="space-y-4">
          <Field label={`${t.step3.budget.label} (${t.common.sar})`} hint={t.step3.budget.hint} optional>
            <TextInput
              type="number"
              min={0}
              value={p.budgetSar ?? ""}
              onChange={(e) => actions.patchPreferences({ budgetSar: e.target.value === "" ? null : Number(e.target.value) })}
            />
          </Field>

          <div>
            <p className="mb-2 text-sm font-medium">{t.step3.supplierFilters.title}</p>
            <div className="space-y-2">
              <Toggle
                checked={p.supplierFilters.verifiedOnly}
                onChange={(v) => actions.patchPreferences({ supplierFilters: { verifiedOnly: v } })}
                label={t.step3.supplierFilters.verifiedOnly}
              />
              <Toggle
                checked={p.supplierFilters.sublettingAllowed}
                onChange={(v) => actions.patchPreferences({ supplierFilters: { sublettingAllowed: v } })}
                label={t.step3.supplierFilters.subletting}
              />
              <Field label={t.step3.supplierFilters.bidWindow} optional>
                <Select<BidWindow>
                  value={p.supplierFilters.bidWindow}
                  placeholder="—"
                  onChange={(v) => actions.patchPreferences({ supplierFilters: { bidWindow: v } })}
                  options={opt(BID_WINDOWS, t.options.bidWindow)}
                />
              </Field>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
