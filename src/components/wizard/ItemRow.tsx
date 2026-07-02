"use client";

import { useState, useEffect, useRef } from "react";
import { useT, useLocale, fmt } from "@/lib/i18n";
import type { SubtypeAttachmentOption } from "@/lib/contract/app";
import { useRfq, agentMatches } from "@/lib/store/rfq-store";
import { SUPPORT_WHATSAPP_NUMBER } from "@/lib/config/support";
import { AgentMark, Button, Field, Icon, Pchips, SelChips, Select, Stepper, TextArea, TextInput, Toggle, Modal } from "@/components/ui";
import { YearPicker } from "@/components/wizard/YearPicker";
import {
  EquipmentItem,
  Taxonomy,
  resolveRef,
  taxName,
  isCompleteRef,
  FUEL_TYPES,
  OPERATOR_CERTIFICATES,
  PARTIES,
  type FuelType,
  type OperatorCertificate,
  type Party,
} from "@/lib/contract";

function opt<T extends string>(values: readonly T[], dict: Record<string, string>) {
  return values.map((v) => ({ value: v, label: dict[v] ?? v }));
}
function toggle<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
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
  defaultOpen = false,
}: {
  item: EquipmentItem;
  taxonomy: Taxonomy;
  sharedFuelResp: Party | null;
  sharedDelivery: Party | null;
  sharedReturn: Party | null;
  /** Open the per-item settings expanded on first render, so the renter sees them directly (matched items). */
  defaultOpen?: boolean;
}) {
  const t = useT();
  const { locale } = useLocale(); // render taxonomy names in Arabic when the UI is Arabic
  const { state, actions } = useRfq();
  const ai = state.agentOrigin?.items.find((i) => i.id === item.id); // agent's original item, for the AI marker
  // Agent's per-field note for THIS item (dotted path "line_items[<agentIdx>].<field>"); "" for manual items.
  // Cleared once the item is resolved (the renter approved it) — and per-field via agentMatches when edited.
  const fn = (f: string) =>
    item.resolved || !(item.id.startsWith("a") && /^\d+$/.test(item.id.slice(1)))
      ? undefined
      : state.draft?.fieldNotes?.[`line_items[${item.id.slice(1)}].${f}`];
  const [editingMatch, setEditingMatch] = useState(false);
  const [showDetails, setShowDetails] = useState(defaultOpen);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const nationalityOpts = [
    { value: "restricted", label: t.step2.perItem.nationalityRestricted },
    { value: "any", label: t.step2.perItem.nationalityAny },
  ];

  const { category, subcategory, measurement } = resolveRef(taxonomy, item.ref);
  // Request-wide equipment year (AC-28) — the per-item year INHERITS this until overridden, matching
  // the "settings for all items" behaviour of fuel/delivery/return above.
  const sharedYear = state.draft?.project?.advanced?.equipmentYear ?? null;
  // Request-wide EQUIPMENT safety certs (AC-50) — per-item value inherits this until overridden (same
  // globalize-with-override model). Distinct from the operator cert below.
  const sharedSafety = state.draft?.project?.certificates?.safety ?? [];
  const itemSafety = item.safetyCertsOverride ?? sharedSafety;
  // Part 1: the optional free-text "work type" is surfaced only for crane subtypes — mirror the mobile
  // gate (equipment_step.dart `_isCraneSelected`: the subtype's English name contains "crane").
  const isCrane = (subcategory?.name ?? "").toLowerCase().includes("crane");
  // "Need OK" auto-resolves to Matched once the taxonomy ref is complete — the renter no longer has to
  // click Approve. Only a no-match (not-available) or an item still missing a ref level shows otherwise.
  const status = item.verdict === "no-match" ? "not-available" : item.resolved || isCompleteRef(item.ref) ? "matched" : "needs-ok";
  const glyph = (item.ref.categoryId && CATEGORY_ICON[item.ref.categoryId]) || "construction";
  // "MATCHED TO" must show ONLY values that exist in our taxonomy: the resolved measurement, or the
  // agent's suggested canonical size (also a real taxonomy node) while the size is still pending.
  // NEVER the verbatim stated size — that's the raw input (e.g. "23 ton") and lives in "FROM YOUR
  // RFQ". Falling back to it made the match line claim a size we don't actually carry.
  const suggestedMeasurement = item.suggestion?.measurementId
    ? resolveRef(taxonomy, { ...item.ref, measurementId: item.suggestion.measurementId }).measurement
    : undefined;
  const matchedMeasurement = measurement ?? suggestedMeasurement;
  // "MATCHED TO" names: the taxonomy (locale-aware, authoritative + ID-consistent) when the ref resolved;
  // otherwise the agent's CANONICAL name (Arabic when the UI is Arabic) so an off-taxonomy/"new" match
  // still reads in the right script. Display-only — `ref`/submit always use the English canonical.
  const an = item.agentNames;
  const isAr = locale === "ar";
  const nm = (node: { name: string; nameAr?: string | null } | null | undefined, en?: string, arName?: string | null) =>
    node ? (taxName(node, locale) || undefined) : (isAr ? (arName || en || undefined) : en || undefined);
  const sizeLabel = matchedMeasurement ? taxName(matchedMeasurement, locale) : (isAr ? an?.capacityAr || an?.capacity : an?.capacity) || undefined;
  const matchLabel = [nm(category, an?.category, an?.categoryAr), nm(subcategory, an?.subtype, an?.subtypeAr), sizeLabel].filter(Boolean).join(" · ") || (item.rawLabel ?? "—");
  // What the renter actually wrote — name + stated size — so "from your RFQ" keeps the size visible.
  const rawDisplay = [item.rawLabel, item.rawSize].filter(Boolean).join(" · ") || item.rawLabel;

  const borderClass =
    status === "needs-ok" ? "border-s-[3px] border-s-warn" : status === "not-available" ? "border-s-[3px] border-s-danger" : "border-s-[3px] border-s-ok";

  /* ----------------------------- No-match (AC-30/31/32) ----------------------------- */
  if (item.verdict === "no-match") {
    // The equipment IS in our catalogue but the requested SIZE isn't yet (a genuine new size) when
    // category + subtype resolved. Then show the matched equipment + a size-specific message, rather
    // than "we couldn't find this equipment". Otherwise it's an unknown-equipment no-match.
    const newSizeOnly = Boolean(item.ref.categoryId && item.ref.subcategoryId);
    return (
      <li className="rounded-xl border border-s-[3px] border-border border-s-danger bg-surface px-4 py-3">
        <div className="flex items-start gap-3">
          <Avatar glyph={glyph} conf="low" />
          <div className="min-w-0 flex-1">
            <RfqMatch
              raw={rawDisplay}
              matched={
                newSizeOnly ? (
                  <span>
                    {matchLabel} · <span className="text-danger">{t.step2.status.notAvailable}</span>
                  </span>
                ) : (
                  <span className="text-danger">{t.step2.status.notAvailable}</span>
                )
              }
            />
            <p className="mt-1 text-xs text-muted">{newSizeOnly ? t.step2.noMatch.newSizeExplainer : t.step2.noMatch.explainer}</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 sm:justify-end">
          <Button
            variant="secondary"
            onClick={() => {
              const tmpl = newSizeOnly ? t.step2.noMatch.whatsappMessageSize : t.step2.noMatch.whatsappMessage;
              const msg = fmt(tmpl, { item: rawDisplay ?? item.rawLabel ?? "" });
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
      <Field label={t.step2.category} required missing={!item.ref.categoryId} agent={agentMatches(item.ref.categoryId, ai?.ref.categoryId)}>
        <Select value={item.ref.categoryId} placeholder={t.step2.pickCategory} onChange={(v) => actions.setItemCategory(item.id, v)} options={taxonomy.map((c) => ({ value: c.id, label: taxName(c, locale) }))} />
      </Field>
      <Field label={t.step2.subcategory} required missing={!item.ref.subcategoryId} agent={agentMatches(item.ref.subcategoryId, ai?.ref.subcategoryId)} note={fn("subtype")}>
        <Select value={item.ref.subcategoryId} placeholder={t.step2.pickSubcategory} disabled={!category} onChange={(v) => actions.setItemSubcategory(item.id, v)} options={(category?.subcategories ?? []).map((s) => ({ value: s.id, label: taxName(s, locale) }))} />
      </Field>
      <Field label={t.step2.measurement} required missing={!item.ref.measurementId} agent={agentMatches(item.ref.measurementId, ai?.ref.measurementId)}>
        <Select value={item.ref.measurementId} placeholder={t.step2.pickMeasurement} disabled={!subcategory} onChange={(v) => actions.setItemMeasurement(item.id, v)} options={(subcategory?.measurements ?? []).map((m) => ({ value: m.id, label: taxName(m, locale) }))} />
      </Field>
    </div>
  );

  return (
    <li className={`grid grid-cols-[38px_1fr] items-start gap-3 rounded-xl border border-border bg-surface px-4 py-3 lg:grid-cols-[38px_1fr_auto] ${borderClass}`}>
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
        {/* Agent's free-text capacity advisory (real Mansour output, AC-19/20) — clears once approved. */}
        {item.advisory && !item.suggestion?.unitConversion && !item.resolved && (
          <div className="mt-1.5 flex items-center gap-1.5 text-[11.5px] font-semibold text-warn">
            <Icon name="swap_horiz" size={14} /> {item.advisory}
          </div>
        )}
        {!item.resolved &&
          (!isCompleteRef(item.ref) ? (
            // AC-18/19: Approve is disabled until the size is picked — say so explicitly.
            <>
              <p className="mt-1.5 flex items-center gap-1.5 text-[12.5px] font-semibold text-warn">
                <Icon name="error_outline" size={14} /> {t.step2.pickSizeToApprove}
              </p>
              {/* Agent's plain-language size guidance (what it's asking for this item). */}
              {item.sizeNote && (
                <p className="mt-1 flex items-start gap-1.5 text-[12px] leading-snug text-info">
                  <Icon name="lightbulb" size={13} className="mt-[1.5px] flex-none" /> {item.sizeNote}
                </p>
              )}
            </>
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
              {agentMatches(item.quantity, ai?.quantity) && <AgentMark />}
            </div>
            {/* Compact summary — just the two key settings. Everything else (operator details,
                fuel responsibility, delivery/return, notes) stays in the Edit panel below. */}
            <div className="mt-2.5 flex flex-wrap gap-2">
              <MetaTag icon="person" label={t.step2.perItem.operatorNeeded} value={t.options.operatorNeeded[item.operatorNeeded]} />
              <MetaTag icon="local_gas_station" label={t.step2.perItem.fuelType} value={t.options.fuelType[item.fuelType]} />
            </div>
          </>
        )}
      </div>

      {/* Right: status + actions — side rail on desktop, full-width row below on mobile */}
      <div className="col-span-2 flex flex-wrap items-center justify-end gap-2 lg:col-span-1 lg:flex-col lg:items-end">
        <StatusLabel status={status} t={t} />
        <div className="flex gap-1.5">
          {status === "needs-ok" ? (
            <>
              <Button disabled={!isCompleteRef(item.ref)} onClick={() => (item.suggestion ? actions.approveSuggestion(item.id) : actions.approveItem(item.id))}>
                <Icon name="check" size={15} /> {t.common.approve}
              </Button>
              {/* #8: when the ref is incomplete the picker is already open below — no redundant "Change". */}
              {isCompleteRef(item.ref) && (
                <Button variant="secondary" onClick={() => setEditingMatch((e) => !e)}>
                  <Icon name="swap_horiz" size={15} /> {t.common.change}
                </Button>
              )}
            </>
          ) : (
            <>
              {/* Matched: classification is collapsed by default — "Change" opens the cat→sub→size
                  picker on demand. "Item settings" opens the operator/fuel/notes panel separately. */}
              <Button variant="secondary" onClick={() => setEditingMatch((e) => !e)}>
                <Icon name="swap_horiz" size={15} /> {t.common.change}
              </Button>
              <Button variant="secondary" onClick={() => setShowDetails((d) => !d)}>
                <Icon name="tune" size={15} /> {t.step2.itemSettings}
                <Icon name="expand_more" size={16} className={`transition-transform ${showDetails ? "rotate-180" : ""}`} />
              </Button>
            </>
          )}
          <button className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted hover:border-danger hover:text-danger" title={t.common.remove} onClick={() => setConfirmRemove(true)}>
            <Icon name="close" size={17} />
          </button>
        </div>
      </div>

      {/* The 3-level cat→sub→size picker opens when the renter clicks "Change" (editingMatch), or when
          the ref is incomplete (a required level is missing). A complete match stays COLLAPSED — the
          renter opens it on demand via Change — it's no longer forced open inside the settings panel. */}
      {(editingMatch || !isCompleteRef(item.ref)) && taxonomyEditor}

      {/* Per-item details — editable only once Matched (AC-54). Mirrors the prototype:
          operator card + fuel + notes. Delivery/return are request-wide only (Settings for all
          items) — no per-item override here; values are just Me/Supplier. */}
      {status === "matched" && showDetails && (
        <div className="col-span-full mt-3 space-y-4 rounded-lg border border-border bg-surface2 p-4">
          {/* Part 1: free-text work type — crane subtypes only (mirrors the mobile create flow). */}
          {isCrane && (
            <ChipField label={t.step2.perItem.workType}>
              <TextInput
                maxLength={255}
                value={item.workType ?? ""}
                placeholder={t.step2.perItem.workTypePlaceholder}
                onChange={(e) => actions.patchItem(item.id, { workType: e.target.value })}
              />
            </ChipField>
          )}

          {/* Operator (AC-24) */}
          <div className="overflow-hidden rounded-lg border border-border bg-surface">
            <div className="flex items-center justify-between bg-surface2 px-3 py-2.5">
              <span className="flex items-center gap-2 text-[13.5px] font-extrabold">
                <Icon name="person" size={18} className="text-navy-mid" /> {t.step2.perItem.operatorNeeded}
                {agentMatches(item.operatorNeeded, ai?.operatorNeeded) && <AgentMark />}
              </span>
              <Toggle checked={item.operatorNeeded === "yes"} onChange={(v) => actions.patchItem(item.id, { operatorNeeded: v ? "yes" : "no" })} />
            </div>
            {item.operatorNeeded === "yes" && (
              <div className="space-y-3 px-3 py-3">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-[13px] font-bold">
                    {t.step2.perItem.nightShift}
                    {agentMatches(item.operator.nightShift, ai?.operator.nightShift) && <AgentMark />}
                  </span>
                  <Toggle checked={item.operator.nightShift} onChange={(v) => actions.patchItemOperator(item.id, { nightShift: v })} />
                </div>
                <ChipField label={t.step2.perItem.nationality} agent={agentMatches(item.operator.nationality, ai?.operator.nationality)}>
                  <Pchips value={item.operator.nationality} onChange={(v) => actions.patchItemOperator(item.id, { nationality: v })} onClear={() => actions.patchItemOperator(item.id, { nationality: null })} options={nationalityOpts} />
                </ChipField>
                {/* Part 3: when nationalities are restricted, let the renter type which ones (≤100). */}
                {item.operator.nationality === "restricted" && (
                  <ChipField label={t.step2.perItem.nationalityCustom}>
                    <TextInput
                      maxLength={100}
                      value={item.operator.nationalityCustom ?? ""}
                      placeholder={t.step2.perItem.nationalityCustomPlaceholder}
                      onChange={(e) => actions.patchItemOperator(item.id, { nationalityCustom: e.target.value })}
                    />
                  </ChipField>
                )}
                <ChipField label={t.step2.perItem.certificate} agent={agentMatches(item.operator.certificate, ai?.operator.certificate)}>
                  <SelChips<OperatorCertificate>
                    values={item.operator.certificate}
                    onToggle={(v) => actions.patchItemOperator(item.id, { certificate: toggle(item.operator.certificate, v) })}
                    options={opt(OPERATOR_CERTIFICATES, t.options.safetyCert)}
                  />
                </ChipField>
                {/* Free-text operator certificate when "Other" is selected (app parity) */}
                {item.operator.certificate.includes("other") && (
                  <ChipField label={t.step2.perItem.certificateOther}>
                    <TextInput
                      maxLength={100}
                      value={item.operator.certificateOther ?? ""}
                      placeholder={t.step2.perItem.certificateOtherPlaceholder}
                      onChange={(e) => actions.patchItemOperator(item.id, { certificateOther: e.target.value })}
                    />
                  </ChipField>
                )}
                {/* Part 2: F.A.T split into two who-covers controls — Food, and Accommodation & transport. */}
                <ChipField label={t.step2.perItem.fatFood} agent={agentMatches(item.operator.fatFood, ai?.operator.fatFood)} note={fn("operator_accommodation_by_rentee")}>
                  <Pchips<Party> value={item.operator.fatFood} onChange={(v) => actions.patchItemOperator(item.id, { fatFood: v })} onClear={() => actions.patchItemOperator(item.id, { fatFood: null })} options={opt(PARTIES, t.options.party)} />
                </ChipField>
                <ChipField label={t.step2.perItem.fatTransport} agent={agentMatches(item.operator.fatAccommodationTransport, ai?.operator.fatAccommodationTransport)}>
                  <Pchips<Party> value={item.operator.fatAccommodationTransport} onChange={(v) => actions.patchItemOperator(item.id, { fatAccommodationTransport: v })} onClear={() => actions.patchItemOperator(item.id, { fatAccommodationTransport: null })} options={opt(PARTIES, t.options.party)} />
                </ChipField>
              </div>
            )}
          </div>

          {/* Fuel (AC-26) */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ChipField label={t.step2.perItem.fuelType} agent={agentMatches(item.fuelType, ai?.fuelType)} note={fn("fuel_type_preference")}>
              <Pchips<FuelType> value={item.fuelType} onChange={(v) => actions.patchItem(item.id, { fuelType: v })} options={opt(FUEL_TYPES, t.options.fuelType)} />
            </ChipField>
            <ChipField label={t.step1.requestWide.fuelResponsibility} agent={agentMatches(item.fuelResponsibilityOverride, ai?.fuelResponsibilityOverride)} note={fn("diesel_included")}>
              <Pchips<Party> value={item.fuelResponsibilityOverride ?? sharedFuelResp} onChange={(v) => actions.patchItem(item.id, { fuelResponsibilityOverride: v })} options={opt(PARTIES, t.options.party)} />
            </ChipField>
          </div>

          {/* Delivery / Return — per-item override of the request-wide setting (AC-25). Mansour sets
              these per line (mobilization/demobilization), so surface + allow editing them here. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ChipField label={t.step1.requestWide.delivery} agent={agentMatches(item.deliveryOverride, ai?.deliveryOverride)} note={fn("mobilization_by_rentee")}>
              <Pchips<Party> value={item.deliveryOverride ?? sharedDelivery} onChange={(v) => actions.patchItem(item.id, { deliveryOverride: v })} options={opt(PARTIES, t.options.party)} />
            </ChipField>
            <ChipField label={t.step1.requestWide.return} agent={agentMatches(item.returnOverride, ai?.returnOverride)} note={fn("demobilization_by_rentee")}>
              <Pchips<Party> value={item.returnOverride ?? sharedReturn} onChange={(v) => actions.patchItem(item.id, { returnOverride: v })} options={opt(PARTIES, t.options.party)} />
            </ChipField>
          </div>

          {/* Equipment year (AC-28) — per-item override of the request-wide year. "Any" inherits it. */}
          <ChipField label={t.step2.perItem.equipmentYear} note={t.step2.perItem.equipmentYearHint}>
            <YearPicker
              value={item.equipmentYear ?? sharedYear}
              onChange={(v) => actions.patchItem(item.id, { equipmentYear: v })}
              anyLabel={t.options.equipmentYear.any}
              customLabel={t.options.equipmentYear.custom}
              customPlaceholder={t.options.equipmentYear.customPlaceholder}
            />
          </ChipField>

          {/* Equipment safety certificate (AC-50) — per-item; inherits the request-wide "settings for all"
              default until overridden (same model as fuel/delivery/return). NOT the operator cert above. */}
          <ChipField label={t.step1.certificates.safety} agent={agentMatches(item.safetyCertsOverride, ai?.safetyCertsOverride)}>
            <SelChips<OperatorCertificate>
              values={itemSafety}
              onToggle={(v) => actions.patchItem(item.id, { safetyCertsOverride: toggle(itemSafety, v) })}
              options={opt(OPERATOR_CERTIFICATES, t.options.safetyCert)}
            />
          </ChipField>

          {/* Attachments / accessories — admin-defined per subtype + free-text customs. */}
          <ItemAttachments item={item} />

          {/* Additional notes (AC-53) */}
          <ChipField label={t.step2.perItem.additionalNotes} agent={agentMatches(item.additionalNotes, ai?.additionalNotes)}>
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
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
      <span className="flex min-w-0 flex-col gap-0.5 sm:w-[200px] sm:flex-none">
        <span className="text-[10px] font-extrabold uppercase tracking-wide text-muted">{t.step2.fromRfq}</span>
        <span className="break-words text-[15px] font-bold leading-tight">{raw ? `“${raw}”` : "—"}</span>
      </span>
      {/* Mobile: vertical flow (RFQ ↓ matched). Desktop: horizontal arrow. */}
      <Icon name="arrow_downward" size={18} className="block flex-none text-muted/60 sm:hidden" />
      <Icon name="arrow_forward" size={20} className="hidden flex-none text-muted/60 rtl:scale-x-[-1] sm:block" />
      <span className="flex min-w-0 flex-col gap-0.5 sm:flex-1">
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

function ChipField({ label, agent, note, children }: { label: string; agent?: boolean; note?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <span className={`mb-1.5 flex items-center gap-2 text-[11.5px] font-bold ${agent ? "text-warn" : "text-navy-mid"}`}>
        {label}
        {agent && <AgentMark />}
      </span>
      {/* Orange box around the options when the agent filled them in. */}
      <div className={agent ? "rounded-lg p-1.5 ring-1 ring-warn/60" : ""}>{children}</div>
      {/* Agent's note — shown only while the field still holds the agent's value (agent=true),
          so it disappears the moment the renter changes the selection. */}
      {agent && note && (
        <p className="mt-1 flex items-start gap-1.5 text-[12px] leading-snug text-info">
          <Icon name="lightbulb" size={13} className="mt-[1.5px] flex-none" /> {note}
        </p>
      )}
    </div>
  );
}

/**
 * Per-item equipment attachments. Pulls the admin-defined attachment list for the item's subtype
 * (GET /api/equipment/attachments/:subtypeId) and shows it as multi-select chips — the renter can ONLY
 * pick from this predefined set (SubtypeAttachment rows), never free-text. `preSelected` rows default
 * on. Selections persist on the draft item as `attachmentIds` → backend `attachment_ids`. The section
 * is hidden when the subtype has no configured attachments.
 */
function ItemAttachments({ item }: { item: EquipmentItem }) {
  const t = useT();
  const { locale } = useLocale();
  const { actions } = useRfq();
  // Attachments are keyed by the app's "subtype" = the SUBCATEGORY id in the 3-level taxonomy, or the
  // CATEGORY id in the canonical 2-level taxonomy (no subcategory). Mirror the mobile app's `type.key`
  // fallback so preselected attachments resolve in BOTH taxonomy shapes.
  const subtypeId = item.ref.subcategoryId || item.ref.categoryId;
  const [avail, setAvail] = useState<SubtypeAttachmentOption[]>([]);
  const initedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!subtypeId) {
      setAvail([]);
      return;
    }
    let active = true;
    fetch(`/api/equipment/attachments/${encodeURIComponent(subtypeId)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((list: SubtypeAttachmentOption[]) => {
        if (!active) return;
        const arr = Array.isArray(list) ? list : [];
        setAvail(arr);
        // Apply admin "pre-selected" defaults once per subtype, only when nothing is chosen yet.
        if (initedFor.current !== subtypeId) {
          initedFor.current = subtypeId;
          if ((item.attachmentIds ?? []).length === 0) {
            const pre = arr.filter((a) => a.preSelected).map((a) => a.id);
            if (pre.length) actions.patchItem(item.id, { attachmentIds: pre });
          }
        }
      })
      .catch(() => {
        if (active) setAvail([]);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtypeId]);

  const selected = item.attachmentIds ?? [];
  const nameOf = (a: SubtypeAttachmentOption) => (locale === "ar" ? a.nameAr || a.name : a.name);

  // Choose-from-set only: nothing to show when this subtype has no admin-defined attachments.
  if (avail.length === 0) return null;

  return (
    <ChipField label={t.step2.perItem.attachments}>
      <p className="-mt-1 mb-2 text-[12px] text-muted">{t.step2.perItem.attachmentsHint}</p>
      <SelChips<string>
        values={selected}
        onToggle={(v) => actions.patchItem(item.id, { attachmentIds: toggle(selected, v) })}
        options={avail.map((a) => ({ value: a.id, label: nameOf(a) }))}
      />
    </ChipField>
  );
}
