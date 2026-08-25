"use client";

/**
 * *The operator* (MREQ-AC-25–28).
 *
 * A side rail rather than a section, because the operator is a property of the machine beside it,
 * not a later step — and because turning it off has to be one obvious move. Off, it collapses to a
 * narrow vertical strip that says what it is and can be reopened; it does not disappear, since a
 * renter who turned it off by accident needs to find it again.
 *
 * Nothing here blocks. Food, accommodation, nationality and the night shift are all optional in the
 * app, so they carry no dots (MREQ-AC-11) — but every value we or the agent chose still carries its
 * provenance badge, which is what keeps "supplier covers food" from looking like the renter's own
 * decision when the bids come back priced against it.
 */

import { useState } from "react";
import { useT } from "@/lib/i18n";
import { useRfq } from "@/lib/store/rfq-store";
import { Icon, Pchips, SelChips, TextInput, Toggle } from "@/components/ui";
import { CanvasField, PanelDot } from "@/components/create/Provenance";
import { useProvenance } from "@/components/create/hooks";
import {
  OPERATOR_CERTIFICATES,
  PARTIES,
  type EquipmentItem,
  type OperatorCertificate,
  type Party,
} from "@/lib/contract";

export function OperatorRail({ item }: { item: EquipmentItem }) {
  const t = useT();
  const { actions } = useRfq();
  const prov = useProvenance(item.id);
  const [moreOpen, setMoreOpen] = useState(false);

  const op = item.operator;
  const on = item.operatorNeeded === "yes";
  const complete = !on || [op.fatFood, op.fatAccommodationTransport, op.nationality].every(Boolean);

  const setOp = (field: string, patch: Parameters<typeof actions.patchItemOperator>[1]) => {
    prov.touch(`operator.${field}`);
    actions.patchItemOperator(item.id, patch);
  };

  // ---- Collapsed: a strip that states what it is and reopens on click. ----
  if (!on) {
    return (
      <button
        type="button"
        onClick={() => actions.patchItem(item.id, { operatorNeeded: "yes" })}
        className="flex w-[68px] flex-none flex-col items-center gap-3.5 rounded-2xl border-[1.5px] border-warn/50 bg-warn/[0.07] py-4 transition hover:shadow-md"
        aria-label={t.create.operator}
      >
        <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-brand text-white">
          <Icon name="person" size={18} />
        </span>
        <span className="text-[12px] font-extrabold tracking-[0.12em] text-brand" style={{ writingMode: "vertical-rl" }}>
          {t.create.operatorRail}
        </span>
        <Icon name="add" size={16} className="mt-auto text-brand" />
      </button>
    );
  }

  return (
    <div className="flex w-full flex-none flex-col gap-4 rounded-[14px] border border-border bg-surface p-4 lg:w-[360px]">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <PanelDot complete={complete} />
          <h2 className="text-[15px] font-extrabold text-navy">{t.create.operator}</h2>
        </span>
        <Toggle checked={on} onChange={() => actions.patchItem(item.id, { operatorNeeded: "no" })} />
      </div>

      <div className="grid gap-3.5 rounded-[10px] bg-surface2 p-3.5 sm:grid-cols-2">
        <CanvasField label={t.create.operatorCard.food} source={prov.itemSource("operator.fat_food", op.fatFood)}>
          <Pchips<Party>
            value={op.fatFood}
            onChange={(v) => setOp("fat_food", { fatFood: v })}
            options={PARTIES.map((p) => ({ value: p, label: t.options.party[p] }))}
          />
        </CanvasField>
        {/* One control writes both halves — the app models accommodation and transport as a single
            renter-facing choice, and splitting them here would produce a term pair nobody chose. */}
        <CanvasField
          label={t.create.operatorCard.accommodation}
          source={prov.itemSource("operator.fat_accommodation", op.fatAccommodationTransport)}
        >
          <Pchips<Party>
            value={op.fatAccommodationTransport}
            onChange={(v) => setOp("fat_accommodation", { fatAccommodationTransport: v })}
            options={PARTIES.map((p) => ({ value: p, label: t.options.party[p] }))}
          />
        </CanvasField>
      </div>

      <div className="rounded-[10px] bg-surface2 p-3.5">
        <CanvasField label={t.create.operatorCard.certificates} optional source={prov.itemSource("operator.certificate", op.certificate)}>
          <SelChips<OperatorCertificate>
            values={op.certificate}
            onToggle={(v) =>
              setOp("certificate", {
                certificate: op.certificate.includes(v) ? op.certificate.filter((c) => c !== v) : [...op.certificate, v],
              })
            }
            options={OPERATOR_CERTIFICATES.map((c) => ({ value: c, label: t.options.safetyCert[c] }))}
          />
        </CanvasField>
        {op.certificate.includes("other") && (
          <TextInput
            value={op.certificateOther ?? ""}
            placeholder={t.create.machineCard.certOther}
            onChange={(e) => actions.patchItemOperator(item.id, { certificateOther: e.target.value })}
            className="mt-2"
          />
        )}
      </div>

      <div className="overflow-hidden rounded-[10px] bg-surface2">
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          className="flex w-full items-center justify-between px-3.5 py-3 text-start"
          aria-expanded={moreOpen}
        >
          <span className="text-[10px] font-bold uppercase tracking-[0.05em] text-muted">{t.create.operatorCard.moreDetails}</span>
          <Icon name={moreOpen ? "expand_less" : "expand_more"} size={16} className="text-muted" />
        </button>
        {moreOpen && (
          <div className="flex flex-col gap-3.5 px-3.5 pb-3.5">
            <CanvasField label={t.create.operatorCard.nationality} source={prov.itemSource("operator.nationality", op.nationality)}>
              <Pchips<string>
                value={op.nationality}
                onChange={(v) => setOp("nationality", { nationality: v, ...(v === "any" ? { nationalityCustom: null } : {}) })}
                options={[
                  { value: "any", label: t.create.operatorCard.nationalityAny },
                  { value: "restricted", label: t.create.operatorCard.nationalityRestricted },
                ]}
              />
            </CanvasField>
            {/* Only meaningful under "Restricted" — and cleared when leaving it, so a stale list can't
                ride along invisibly on a request that now accepts any nationality. */}
            {op.nationality === "restricted" && (
              <TextInput
                value={op.nationalityCustom ?? ""}
                maxLength={100}
                placeholder={t.create.operatorCard.nationalityCustom}
                onChange={(e) => actions.patchItemOperator(item.id, { nationalityCustom: e.target.value })}
              />
            )}
            <CanvasField label={t.create.operatorCard.nightShift} source={prov.itemSource("operator.night_shift", op.nightShift, undefined, true)}>
              <span className="flex items-center gap-2.5">
                <Toggle checked={op.nightShift} onChange={(v) => setOp("night_shift", { nightShift: v })} />
                <span className="text-[12.5px] text-muted">
                  {op.nightShift ? t.create.operatorCard.nightIncluded : t.create.operatorCard.nightDayOnly}
                </span>
              </span>
            </CanvasField>
          </div>
        )}
      </div>
    </div>
  );
}
