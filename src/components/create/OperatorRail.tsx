"use client";

/**
 * *The operator* (MREQ-AC-25–28), at the prototype's geometry.
 *
 * A fixed 380px rail beside the machine card rather than a section below it, because the operator is
 * a property of the machine next to it, not a later step — and because turning it off has to be one
 * obvious move. Off, it collapses to a 72px vertical strip that still says what it is and reopens on
 * a click; it does not disappear, since a renter who turned it off by accident needs to find it.
 *
 * Inside: three boxes at 16px apart, each a `1fr 1fr` grid, matching the machine card's boxes so the
 * two columns read as one row rather than two unrelated cards.
 *
 * Nothing here blocks. Food, accommodation, nationality and the night shift are all optional in the
 * app, so they carry no dots (MREQ-AC-11) — but every value we or the agent chose still carries its
 * provenance note, which is what keeps "supplier covers food" from looking like the renter's own
 * decision when the bids come back priced against it.
 */

import { useState } from "react";
import { useT } from "@/lib/i18n";
import { useRfq } from "@/lib/store/rfq-store";
import { Icon, TextInput, Toggle } from "@/components/ui";
import { CanvasField, ChoiceChips, ChoiceRow, PanelDot } from "@/components/create/Provenance";
import { useProvenance } from "@/components/create/hooks";
import { OPERATOR_CERTIFICATES, type EquipmentItem, type OperatorCertificate, type Party } from "@/lib/contract";

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

  const partyOptions: { value: Party; label: string }[] = [
    { value: "supplier", label: t.options.party.supplier },
    { value: "me", label: t.options.party.me },
  ];

  // ---- Collapsed: the prototype's 72px strip. ----
  if (!on) {
    return (
      <button
        type="button"
        onClick={() => actions.patchItem(item.id, { operatorNeeded: "yes" })}
        className="flex w-[72px] flex-none flex-col items-center gap-3.5 self-stretch rounded-2xl border-[1.5px] border-[#f5c98f] bg-[#fff6ea] py-4 shadow-[0_1px_2px_rgba(20,25,35,.04)] transition hover:shadow-[0_4px_14px_rgba(245,135,31,.2)]"
        aria-label={t.create.operator}
      >
        <span className="grid h-[34px] w-[34px] flex-none place-items-center rounded-full bg-brand text-white">
          <Icon name="person" size={18} />
        </span>
        <span className="text-[12px] font-extrabold tracking-[0.12em] text-[#c9660f]" style={{ writingMode: "vertical-rl" }}>
          {t.create.operatorRail}
        </span>
        <span className="mt-auto text-[15px] font-extrabold leading-none text-brand">+</span>
      </button>
    );
  }

  return (
    <div className="flex w-full flex-none flex-col gap-4 self-stretch rounded-[14px] border border-border bg-surface p-3.5 lg:min-h-[530px] lg:w-[380px]">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <PanelDot complete={complete} />
          <h2 className="text-[15px] font-extrabold text-navy">{t.create.operator}</h2>
        </span>
        <Toggle checked={on} onChange={() => actions.patchItem(item.id, { operatorNeeded: "no" })} />
      </div>

      <div className="grid gap-3.5 rounded-[10px] bg-surface2 p-3.5 sm:grid-cols-2">
        <CanvasField label={t.create.operatorCard.food} source={prov.itemSource("operator.fat_food", op.fatFood)}>
          <ChoiceRow<Party> value={op.fatFood} onChange={(v) => setOp("fat_food", { fatFood: v })} options={partyOptions} />
        </CanvasField>
        {/* One control writes both halves — the app models accommodation and transport as a single
            renter-facing choice, and splitting them here would produce a term pair nobody chose. */}
        <CanvasField
          label={t.create.operatorCard.accommodation}
          source={prov.itemSource("operator.fat_accommodation", op.fatAccommodationTransport)}
        >
          <ChoiceRow<Party>
            value={op.fatAccommodationTransport}
            onChange={(v) => setOp("fat_accommodation", { fatAccommodationTransport: v })}
            options={partyOptions}
          />
        </CanvasField>
      </div>

      <div className="rounded-[10px] bg-surface2 p-3.5">
        <CanvasField
          label={t.create.operatorCard.certificates}
          optional
          source={prov.itemSource("operator.certificate", op.certificate)}
          icon={
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-none" aria-hidden>
              <circle cx="12" cy="8" r="5" />
              <path d="M8.5 12.5 7 22l5-3 5 3-1.5-9.5" />
            </svg>
          }
        >
          <ChoiceChips<OperatorCertificate>
            values={op.certificate}
            onToggle={(v) =>
              setOp("certificate", {
                certificate: op.certificate.includes(v) ? op.certificate.filter((c) => c !== v) : [...op.certificate, v],
              })
            }
            options={OPERATOR_CERTIFICATES.map((c) => ({ value: c, label: t.create.operatorCard.certShort[c] ?? t.options.safetyCert[c] }))}
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
          <div className="grid gap-3.5 px-3.5 pb-3.5 sm:grid-cols-2">
            <CanvasField label={t.create.operatorCard.nationality} source={prov.itemSource("operator.nationality", op.nationality)}>
              <ChoiceRow<string>
                value={op.nationality}
                onChange={(v) => setOp("nationality", { nationality: v, ...(v === "any" ? { nationalityCustom: null } : {}) })}
                options={[
                  { value: "any", label: t.create.operatorCard.nationalityAny },
                  { value: "restricted", label: t.create.operatorCard.nationalityRestricted },
                ]}
              />
            </CanvasField>
            <CanvasField
              label={t.create.operatorCard.nightShift}
              source={prov.itemSource("operator.night_shift", op.nightShift, undefined, true)}
            >
              <span className="flex h-[38px] items-center gap-2.5">
                <Toggle checked={op.nightShift} onChange={(v) => setOp("night_shift", { nightShift: v })} />
                <span className="text-[12px] text-muted">
                  {op.nightShift ? t.create.operatorCard.nightIncluded : t.create.operatorCard.nightDayOnly}
                </span>
              </span>
            </CanvasField>
            {/* Only meaningful under "Restricted" — and cleared when leaving it, so a stale list can't
                ride along invisibly on a request that now accepts any nationality. */}
            {op.nationality === "restricted" && (
              <div className="sm:col-span-2">
                <TextInput
                  value={op.nationalityCustom ?? ""}
                  maxLength={100}
                  placeholder={t.create.operatorCard.nationalityCustom}
                  onChange={(e) => actions.patchItemOperator(item.id, { nationalityCustom: e.target.value })}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
