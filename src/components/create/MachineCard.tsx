"use client";

/**
 * *The machine* (MREQ-AC-16–24).
 *
 * Where the prototype put a photograph, this puts the equipment's taxonomy icon: the request model
 * has no machine image, and rendering a stock photo of an excavator next to a request for a
 * different one would be a picture of the wrong machine. The four overlay controls the prototype
 * anchored to that photo — quantity, certificate, minimum year, fuel — sit on the icon panel instead.
 *
 * Every option list comes from `options.ts`. The prototype invented values that do not exist in the
 * platform (CE, ISO 9001, a 2021+ year band, an "Any" operator certificate); shipping those would
 * have produced requests carrying certificate requirements no supplier is ever asked to hold.
 */

import { fmt, useT } from "@/lib/i18n";
import { useRfq } from "@/lib/store/rfq-store";
import { SUPPORT_WHATSAPP_NUMBER } from "@/lib/config/support";
import { Button, Icon, Pchips, SelChips, Stepper, TextArea, TextInput } from "@/components/ui";
import { equipmentIcon } from "@/components/requests/EquipImg";
import { CanvasField, PanelDot } from "@/components/create/Provenance";
import { SearchSelect } from "@/components/create/SearchSelect";
import { useItemAttachments, useItemOverrides, useItemTaxonomy, useProvenance } from "@/components/create/hooks";
import {
  EQUIPMENT_YEARS,
  FUEL_TYPES,
  PARTIES,
  SAFETY_CERTIFICATES,
  type EquipmentItem,
  type FuelType,
  type Party,
  type RequiredGap,
  type SafetyCertificate,
} from "@/lib/contract";

/** A sentinel for "No certificate" — an explicit answer that stores as an empty list (MREQ-AC-55). */
const NO_CERT = "__none__";

export function MachineCard({ item, gaps, shaking }: { item: EquipmentItem; gaps: RequiredGap[]; shaking: boolean }) {
  const t = useT();
  const { state, actions } = useRfq();
  const tax = useItemTaxonomy(item, state.taxonomy);
  const overrides = useItemOverrides(item, state.draft!.project);
  const attachments = useItemAttachments(item);
  const prov = useProvenance(item.id);

  const gapFor = (field: string) => gaps.some((g) => g.field === field);
  const shake = (field: string) => shaking && gapFor(field);

  /** Set an item field and record that the renter answered it, in one move. */
  const set = (field: string, patch: Partial<EquipmentItem>) => {
    prov.touch(field);
    actions.patchItem(item.id, patch);
  };

  const notAvailable = item.verdict === "no-match";
  const rawDisplay = item.rawLabel ?? tax.subtypeName ?? "";

  return (
    <div className="min-w-0 flex-1 rounded-[14px] border border-border bg-surface p-4">
      <div className="mb-4 flex items-center gap-2">
        <PanelDot complete={gaps.length === 0} />
        <h2 className="text-[15px] font-extrabold text-navy">{t.create.machine}</h2>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        {/* ---------------- The icon panel and its four overlay controls ---------------- */}
        <div className="relative min-h-[260px] overflow-visible rounded-xl bg-surface2 p-3">
          <div className="grid h-full min-h-[220px] place-items-center text-navy/15">
            <Icon name={equipmentIcon(tax.subtypeName || tax.categoryName)} size={110} />
          </div>

          {/* Certificate — amber while unanswered, because an unasked certificate silently narrows
              the renter's own bidder pool (see the note in options.ts). */}
          <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
            <div className="w-[62%] max-w-[230px]">
              <CanvasField
                label={t.create.machineCard.cert}
                missing={gapFor("safety_certificates")}
                shake={shake("safety_certificates")}
                source={prov.itemSource("safety_certificates", overrides.safetyCerts, "safetyCertsOverride")}
              >
                <SearchSelect
                  value={overrides.safetyCerts.length ? overrides.safetyCerts[0] : NO_CERT}
                  placeholder={t.create.machineCard.noCert}
                  searchPlaceholder={t.create.machineCard.cert}
                  options={[
                    { value: NO_CERT, label: t.create.machineCard.noCert },
                    ...SAFETY_CERTIFICATES.map((c) => ({ value: c, label: t.options.safetyCert[c] })),
                  ]}
                  onChange={(v) =>
                    set("safety_certificates", {
                      safetyCertsOverride: v === NO_CERT ? [] : [v as SafetyCertificate],
                      ...(v === NO_CERT ? { safetyCertsOtherText: null } : {}),
                    })
                  }
                />
              </CanvasField>
              {overrides.safetyCerts.includes("other") && (
                <TextInput
                  value={overrides.safetyCertsOther}
                  placeholder={t.create.machineCard.certOther}
                  onChange={(e) => actions.patchItem(item.id, { safetyCertsOtherText: e.target.value })}
                  className="mt-1.5"
                />
              )}
            </div>

            <div className="w-[34%] max-w-[120px]">
              <CanvasField
                label={t.create.machineCard.quantity}
                source={prov.itemSource("quantity", item.quantity, "quantity", true)}
                missing={gapFor("quantity")}
                shake={shake("quantity")}
              >
                <Stepper value={item.quantity} min={1} onChange={(v) => set("quantity", { quantity: v })} />
              </CanvasField>
            </div>
          </div>

          <div className="absolute inset-x-3 bottom-3 flex items-end justify-between gap-2">
            <div className="w-[46%] max-w-[160px]">
              <CanvasField
                label={t.create.machineCard.fuel}
                source={prov.itemSource("fuel_type", item.fuelType, "fuelType", true)}
                missing={gapFor("fuel_type")}
                shake={shake("fuel_type")}
              >
                <SearchSelect
                  value={item.fuelType}
                  placeholder={t.create.machineCard.fuel}
                  searchPlaceholder={t.create.machineCard.fuel}
                  options={FUEL_TYPES.map((f) => ({ value: f, label: t.options.fuelType[f] }))}
                  onChange={(v) => set("fuel_type", { fuelType: v as FuelType })}
                />
              </CanvasField>
            </div>
            <div className="w-[50%] max-w-[180px]">
              <CanvasField
                label={t.create.machineCard.minYear}
                missing={gapFor("equipment_year")}
                shake={shake("equipment_year")}
                source={prov.itemSource("equipment_year", overrides.equipmentYear, "equipmentYear")}
              >
                <SearchSelect
                  value={overrides.equipmentYear ?? "any"}
                  placeholder={t.create.machineCard.anyYear}
                  searchPlaceholder={t.create.machineCard.minYear}
                  options={EQUIPMENT_YEARS.map((y) => ({
                    value: y,
                    label: y === "any" ? t.create.machineCard.anyYear : y,
                  }))}
                  onChange={(v) => set("equipment_year", { equipmentYear: v })}
                />
              </CanvasField>
            </div>
          </div>
        </div>

        {/* ---------------- Taxonomy, logistics, attachments, notes ---------------- */}
        <div className="flex min-w-0 flex-col gap-4">
          {notAvailable ? (
            <UnavailableCard item={item} label={rawDisplay} />
          ) : (
            <div className="grid gap-3 rounded-[10px] border border-warn/40 bg-warn/[0.06] p-3 sm:grid-cols-3">
              {/* Category is derived from the taxonomy ref, never typed. */}
              <CanvasField
                label={t.create.machineCard.category}
                missing={gapFor("category")}
                shake={shake("category")}
                source={prov.itemSource("category", item.ref.categoryId, "ref")}
              >
                <SearchSelect
                  value={item.ref.categoryId}
                  placeholder={t.create.machineCard.category}
                  searchPlaceholder={t.create.machineCard.searchTypes}
                  options={tax.categories}
                  onChange={(v) => {
                    prov.touch("category");
                    actions.setItemCategory(item.id, v);
                  }}
                />
              </CanvasField>
              <CanvasField
                label={t.create.machineCard.type}
                missing={gapFor("subtype")}
                shake={shake("subtype")}
                source={prov.itemSource("subtype", item.ref.subcategoryId)}
              >
                <SearchSelect
                  value={item.ref.subcategoryId}
                  placeholder={t.create.machineCard.type}
                  searchPlaceholder={t.create.machineCard.searchTypes}
                  disabled={!item.ref.categoryId}
                  options={tax.subtypes}
                  onChange={(v) => {
                    prov.touch("subtype");
                    actions.setItemSubcategory(item.id, v);
                  }}
                />
              </CanvasField>
              <CanvasField
                label={t.create.machineCard.size}
                missing={gapFor("capacity")}
                shake={shake("capacity")}
                source={prov.itemSource("capacity", item.ref.measurementId)}
              >
                <SearchSelect
                  value={item.ref.measurementId}
                  placeholder={t.create.machineCard.size}
                  searchPlaceholder={t.create.machineCard.searchSizes}
                  disabled={!item.ref.subcategoryId}
                  options={tax.sizes}
                  onChange={(v) => {
                    prov.touch("capacity");
                    actions.setItemMeasurement(item.id, v);
                  }}
                />
              </CanvasField>
            </div>
          )}

          {/* Delivery / return are required by the app; fuel responsibility is not (MREQ-AC-09/11). */}
          <div className="grid gap-3.5 rounded-[10px] bg-surface2 p-3.5 sm:grid-cols-3">
            <CanvasField
              label={t.create.machineCard.delivery}
              missing={gapFor("delivery")}
              shake={shake("delivery")}
              source={prov.itemSource("delivery", overrides.delivery, "deliveryOverride", true)}
            >
              <Pchips<Party>
                value={overrides.delivery}
                onChange={(v) => set("delivery", { deliveryOverride: v })}
                options={PARTIES.map((p) => ({ value: p, label: t.options.party[p] }))}
              />
            </CanvasField>
            <CanvasField
              label={t.create.machineCard.returnFromSite}
              missing={gapFor("return")}
              shake={shake("return")}
              source={prov.itemSource("return", overrides.returnFromSite, "returnOverride", true)}
            >
              <Pchips<Party>
                value={overrides.returnFromSite}
                onChange={(v) => set("return", { returnOverride: v })}
                options={PARTIES.map((p) => ({ value: p, label: t.options.party[p] }))}
              />
            </CanvasField>
            <CanvasField
              label={t.create.machineCard.fuelResponsibility}
              source={prov.itemSource("fuel_responsibility", overrides.fuelResponsibility, "fuelResponsibilityOverride", true)}
            >
              <Pchips<Party>
                value={overrides.fuelResponsibility}
                onChange={(v) => set("fuel_responsibility", { fuelResponsibilityOverride: v })}
                options={PARTIES.map((p) => ({ value: p, label: t.options.party[p] }))}
              />
            </CanvasField>
          </div>

          <div className="flex flex-col gap-3.5 rounded-[10px] bg-surface2 p-3.5">
            {/* Hidden entirely when this subtype has no admin-defined attachments (MREQ-AC-22). */}
            {attachments.hasOptions && (
              <CanvasField
                label={t.create.machineCard.attachment}
                optional
                source={prov.itemSource("attachments", item.attachmentIds, "attachmentIds")}
              >
                <SelChips<string> values={attachments.selected} onToggle={attachments.toggle} options={attachments.options} />
              </CanvasField>
            )}

            {/* Crane-only, mirroring `equipment_step.dart` `_isCraneSelected` (MREQ-AC-23). */}
            {tax.isCrane && (
              <CanvasField label={t.create.machineCard.workType} optional>
                <TextInput
                  value={item.workType ?? ""}
                  maxLength={255}
                  placeholder={t.create.machineCard.workTypePlaceholder}
                  onChange={(e) => actions.patchItem(item.id, { workType: e.target.value })}
                />
              </CanvasField>
            )}

            <CanvasField label={t.create.machineCard.notes} optional>
              <TextArea
                value={item.additionalNotes}
                rows={3}
                placeholder={t.create.machineCard.notesPlaceholder}
                onChange={(e) => actions.patchItem(item.id, { additionalNotes: e.target.value })}
              />
            </CanvasField>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * An item the marketplace cannot supply (MREQ-AC-24).
 *
 * The hand-off does not delete the row. Deleting it was the original behaviour and it made the
 * equipment vanish the moment the renter came back from WhatsApp, contradicting the message we
 * prefill on their behalf. It stays visible, acknowledged, and excluded from the broadcast either
 * way — `postableItems` drops every no-match item.
 */
function UnavailableCard({ item, label }: { item: EquipmentItem; label: string }) {
  const t = useT();
  const { actions } = useRfq();

  return (
    <div className="flex flex-col gap-2.5 rounded-[10px] border border-danger/40 bg-danger/[0.06] p-3.5">
      <p className="flex items-start gap-2 text-[13px] leading-snug text-danger">
        <Icon name="error_outline" size={16} className="mt-px flex-none" />
        {fmt(t.create.machineCard.unavailableTitle, { equipment: label })}
      </p>
      <p className="text-[12px] leading-snug text-muted">{t.step2.noMatch.explainer}</p>
      {item.sourcingRequested ? (
        <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ok">
          <Icon name="check_circle" size={15} /> {t.create.machineCard.sourcingRequested}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              const msg = fmt(t.step2.noMatch.whatsappMessage, { item: item.rawLabel ?? label });
              window.open(`https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
              actions.requestSourcing(item.id);
            }}
          >
            <Icon name="chat" size={15} /> {t.create.machineCard.unavailableWhatsapp}
          </Button>
        </div>
      )}
    </div>
  );
}
