"use client";

/**
 * *The machine* (MREQ-AC-16–24), at the prototype's geometry.
 *
 * The layout is not decoration here. The card is a `2fr 3fr` grid whose left column is a **450px
 * tall panel** with four controls anchored to its corners, and the right column is a 16px-gap stack
 * of three boxes. The first cut of this file let the left panel size itself to its contents, so it
 * grew to match the right column and left the fuel and year controls stranded at the bottom of an
 * empty grey field. Fixing the panel height is what makes the corner anchoring mean anything.
 *
 * Where the prototype had a photograph this draws the equipment's taxonomy icon: the request model
 * carries no machine image (spec §7.1 — `equipment_taxonomy.image_key` exists but holds artwork, and
 * `getTaxonomy` does not serve it), and a stock photo of the wrong excavator is worse than a glyph.
 *
 * Every option list comes from `options.ts`. The prototype invented values this platform has no code
 * for — CE, ISO 9001, a 2021+ year band, an "Any" operator certificate — and a certificate the
 * platform cannot resolve becomes a document demanded of every supplier who bids.
 */

import { fmt, useT } from "@/lib/i18n";
import { useRfq } from "@/lib/store/rfq-store";
import { SUPPORT_WHATSAPP_NUMBER } from "@/lib/config/support";
import { Button, Icon, TextArea, TextInput } from "@/components/ui";
import { equipmentIcon } from "@/components/requests/EquipImg";
import { CanvasField, ChoiceChips, ChoiceRow, PanelDot } from "@/components/create/Provenance";
import { SearchSelect } from "@/components/create/SearchSelect";
import { useItemAttachments, useItemOverrides, useItemTaxonomy, useProvenance } from "@/components/create/hooks";
import {
  EQUIPMENT_YEARS,
  FUEL_TYPES,
  SAFETY_CERTIFICATES,
  type EquipmentItem,
  type FuelType,
  type Party,
  type RequiredGap,
  type SafetyCertificate,
} from "@/lib/contract";

/** A sentinel for "No certificate" — an explicit answer that stores as an empty list (MREQ-AC-55). */
const NO_CERT = "__none__";

export function MachineCard({
  item,
  gaps,
  shaking,
  onCollapse,
}: {
  item: EquipmentItem;
  gaps: RequiredGap[];
  shaking: boolean;
  onCollapse?: () => void;
}) {
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
  /**
   * Supplier first, the renter second — the order the prototype uses on every one of these, and the
   * reason it is written out rather than mapped from `PARTIES`, which is ["me","supplier"].
   */
  const partyOptions: { value: Party; label: string }[] = [
    { value: "supplier", label: t.options.party.supplier },
    { value: "me", label: t.options.party.me },
  ];

  return (
    <div className="min-w-0 flex-1 rounded-[14px] border border-border bg-surface p-3.5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <PanelDot complete={gaps.length === 0} />
          <h2 className="whitespace-nowrap text-[15px] font-extrabold text-navy">{t.create.machine}</h2>
        </span>
        {onCollapse && (
          <button type="button" onClick={onCollapse} className="text-[12px] font-semibold text-muted hover:text-navy-mid">
            {t.create.collapse}
          </button>
        )}
      </div>

      {/* The prototype's 2fr / 3fr split, 20px gutter, columns aligned to the top. */}
      <div className="grid gap-5 lg:grid-cols-[2fr_3fr] lg:items-stretch">
        {/* ---------------- The 450px panel, and the four controls on its corners ---------------- */}
        <div className="relative h-full min-h-[450px] w-full min-w-0 overflow-hidden rounded-xl bg-[#f0f1f3]">
          <div className="grid h-full place-content-center justify-items-center gap-2 px-6 text-center">
            <Icon name={equipmentIcon(tax.subtypeName || tax.categoryName)} size={132} className="text-navy/20" />
            {(tax.subtypeName || tax.categoryName) && (
              <p className="text-[13px] font-bold leading-snug text-navy/45">
                {[tax.subtypeName || tax.categoryName, tax.sizeName].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>

          {/* Top-left the certificate, top-right the quantity. Amber while the certificate is
              unanswered — an unasked certificate silently narrows the renter's own bidder pool. */}
          <div className="absolute inset-x-2.5 top-2.5 flex items-start justify-between gap-2">
            <div className="min-w-0 max-w-[58%]">
              <div className={shake("safety_certificates") ? "shake-error" : undefined}>
                <SearchSelect
                  value={overrides.safetyCerts.length ? overrides.safetyCerts[0] : NO_CERT}
                  placeholder={t.create.machineCard.noCert}
                  searchPlaceholder={t.create.machineCard.cert}
                  label={t.create.machineCard.cert}
                  tone={gapFor("safety_certificates") ? "brand" : "overlay"}
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
              </div>
              {overrides.safetyCerts.includes("other") && (
                <TextInput
                  value={overrides.safetyCertsOther}
                  placeholder={t.create.machineCard.certOther}
                  onChange={(e) => actions.patchItem(item.id, { safetyCertsOtherText: e.target.value })}
                  className="mt-1.5"
                />
              )}
            </div>

            {/* The prototype's inline −/×N/+ chip rather than the boxed Stepper, which is too tall
                to sit on the panel without covering the machine. */}
            <div className="flex flex-none items-center gap-2.5 rounded-lg bg-[#12263acc] px-2 py-1.5 text-[12px] text-white shadow-[0_2px_8px_rgba(0,0,0,.25)]">
              <button
                type="button"
                aria-label={`${t.create.machineCard.quantity} −`}
                disabled={item.quantity <= 1}
                onClick={() => set("quantity", { quantity: Math.max(1, item.quantity - 1) })}
                className="px-1 disabled:opacity-40"
              >
                −
              </button>
              <span className="tabular-nums">×{item.quantity}</span>
              <button
                type="button"
                aria-label={`${t.create.machineCard.quantity} +`}
                onClick={() => set("quantity", { quantity: item.quantity + 1 })}
                className="px-1"
              >
                +
              </button>
            </div>
          </div>

          {/* Bottom row: fuel on the left, minimum year on the right. */}
          <div className="absolute inset-x-2.5 bottom-2.5 flex items-end justify-between gap-2">
            <div className="min-w-0 max-w-[46%]">
              <SearchSelect
                value={item.fuelType}
                placeholder={t.create.machineCard.fuel}
                searchPlaceholder={t.create.machineCard.fuel}
                label={t.create.machineCard.fuel}
                tone="overlay"
                options={FUEL_TYPES.map((f) => ({ value: f, label: t.options.fuelType[f] }))}
                onChange={(v) => set("fuel_type", { fuelType: v as FuelType })}
              />
            </div>
            <div className={`min-w-0 max-w-[48%] ${shake("equipment_year") ? "shake-error" : ""}`}>
              <SearchSelect
                value={overrides.equipmentYear ?? "any"}
                placeholder={t.create.machineCard.anyYear}
                searchPlaceholder={t.create.machineCard.minYear}
                label={t.create.machineCard.minYear}
                tone={gapFor("equipment_year") ? "brand" : "overlay"}
                options={EQUIPMENT_YEARS.map((y) => ({ value: y, label: y === "any" ? t.create.machineCard.anyYear : y }))}
                onChange={(v) => set("equipment_year", { equipmentYear: v })}
              />
            </div>
          </div>
        </div>

        {/* ---------------- Right column: three boxes, 16px apart ---------------- */}
        <div className="flex min-w-0 flex-col gap-4">
          {notAvailable ? (
            <UnavailableCard item={item} label={item.rawLabel ?? tax.subtypeName ?? ""} />
          ) : (
            /* The amber-tinted taxonomy trio, at the prototype's minmax columns. */
            <div className="grid gap-2.5 rounded-[10px] border border-[#f5c98f] bg-[#fff9f0] p-3 sm:grid-cols-[minmax(132px,1fr)_minmax(150px,1.5fr)_minmax(104px,0.9fr)]">
              {/* Derived, never picked. The renter chooses a TYPE and the category follows from it —
                  so this shows the taxonomy's `tag` (its canonical grouping, e.g. "Earthmoving") as a
                  read-only box, exactly as the prototype does. No chevron, because there is nothing
                  here to open. */}
              <CanvasField
                label={t.create.machineCard.category}
                source={prov.itemSource("category", item.ref.categoryId, "ref")}
              >
                <div className="truncate rounded-lg border border-border bg-surface px-3 py-2.5 text-[13px] text-navy">
                  {tax.tagName || "—"}
                </div>
              </CanvasField>
              <CanvasField
                label={t.create.machineCard.type}
                missing={gapFor("subtype") || gapFor("category")}
                shake={shake("subtype") || shake("category")}
                source={prov.itemSource("subtype", item.ref.subcategoryId)}
              >
                <SearchSelect
                  value={item.ref.subcategoryId}
                  placeholder={t.create.machineCard.type}
                  searchPlaceholder={t.create.machineCard.searchTypes}
                  label={t.create.machineCard.type}
                  options={tax.allSubtypes}
                  onChange={(v) => {
                    // One pick, both ids: the parent category comes from the chosen subtype rather
                    // than being asked for separately.
                    const chosen = tax.allSubtypes.find((o) => o.value === v);
                    prov.touch("subtype");
                    if (chosen && chosen.categoryId !== item.ref.categoryId) {
                      actions.setItemCategory(item.id, chosen.categoryId);
                    }
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
                  label={t.create.machineCard.size}
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

          {/* Logistics, at the prototype's geometry: all three choices on ONE row — the two haulage
              legs inside a single box, fuel in its own — as a 2fr/1fr split, which lands the three
              groups at roughly equal width.

              The row is why the chip type is 12px rather than the prototype's 13px. Its own labels
              are "Supplier" and "Me"; ours name the obligation ("We collect"), which is longer, and
              at 13px they overflowed ~60px of chip and forced the legs to stack. Smaller type keeps
              the prototype's layout AND the wording that says what the choice means. */}
          <div className="grid items-start gap-3.5 sm:grid-cols-[2fr_1fr]">
            <div className="grid min-w-0 gap-3.5 rounded-[10px] bg-surface2 p-3.5 sm:grid-cols-2">
              <CanvasField
                  label={t.create.machineCard.delivery}
                  missing={gapFor("delivery")}
                  shake={shake("delivery")}
                  source={prov.itemSource("delivery", overrides.delivery, "deliveryOverride", true)}
                  icon={
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-none" aria-hidden>
                      <rect x="1" y="7" width="13" height="9" rx="1" />
                      <path d="M14 10h4l3 3v3h-7z" />
                      <circle cx="6" cy="18" r="1.6" />
                      <circle cx="17" cy="18" r="1.6" />
                    </svg>
                  }
                >
                  <ChoiceRow<Party>
                    value={overrides.delivery}
                    onChange={(v) => set("delivery", { deliveryOverride: v })}
                    options={partyOptions}
                  />
                </CanvasField>
              <CanvasField
                label={t.create.machineCard.returnFromSite}
                missing={gapFor("return")}
                shake={shake("return")}
                source={prov.itemSource("return", overrides.returnFromSite, "returnOverride", true)}
                icon={
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-none" aria-hidden>
                    <path d="M19 12H5M12 5l-7 7 7 7" />
                  </svg>
                }
              >
                <ChoiceRow<Party>
                  value={overrides.returnFromSite}
                  onChange={(v) => set("return", { returnOverride: v })}
                  options={partyOptions}
                />
              </CanvasField>
            </div>
            <div className="min-w-0 rounded-[10px] bg-surface2 p-3.5">
              <CanvasField
                label={t.create.machineCard.fuelResponsibility}
                source={prov.itemSource("fuel_responsibility", overrides.fuelResponsibility, "fuelResponsibilityOverride", true)}
                icon={
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-none" aria-hidden>
                    <path d="M3 22V4a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v18M3 10h9M14 22v-8l3-3h2a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-1" />
                    <circle cx="17.5" cy="18.5" r="1.2" />
                  </svg>
                }
              >
                <ChoiceRow<Party>
                  value={overrides.fuelResponsibility}
                  onChange={(v) => set("fuel_responsibility", { fuelResponsibilityOverride: v })}
                  options={partyOptions}
                />
              </CanvasField>
            </div>
          </div>

          {/* Attachment, work type and notes — one box, as the prototype has them. */}
          <div className="flex w-full flex-col gap-2.5 rounded-[10px] bg-surface2 p-3.5">
            {/* Hidden entirely when this subtype has no admin-defined attachments (MREQ-AC-22). */}
            {attachments.hasOptions && (
              <CanvasField
                label={t.create.machineCard.attachment}
                optional
                source={prov.itemSource("attachments", item.attachmentIds, "attachmentIds")}
              >
                <ChoiceChips<string> values={attachments.selected} onToggle={attachments.toggle} options={attachments.options} />
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
                className="h-24"
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
