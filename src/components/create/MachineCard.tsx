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

import { useState } from "react";
import { fmt, useT } from "@/lib/i18n";
import { useRfq } from "@/lib/store/rfq-store";
import { SUPPORT_WHATSAPP_NUMBER } from "@/lib/config/support";
import { Button, Icon, Notice, TextArea, TextInput } from "@/components/ui";
import { equipmentIcon } from "@/components/requests/EquipImg";
import { CanvasField, ChoiceChips, ChoiceRow, PanelDot } from "@/components/create/Provenance";
import { CertSelect } from "@/components/create/CertSelect";
import { SearchSelect } from "@/components/create/SearchSelect";
import { useItemAttachments, useItemOverrides, useItemTaxonomy, useProvenance } from "@/components/create/hooks";
import { pin } from "@/lib/uiPins";
import {
  equipmentYears,
  isCustomLine,
  isTouched,
  FUEL_TYPES,
  type EquipmentItem,
  type FuelType,
  type Party,
  type RequiredGap,
} from "@/lib/contract";

/**
 * The title of an overlay control, carrying its star and, once it has refused, the word.
 *
 * The four chips on the photograph have no visible label: on a photo, a title over every one of
 * them would be four grey captions across the machine, and the placeholder inside each chip already
 * names it. That is fine until one of them is what is blocking the send. Then the renter needs to be
 * told WHICH chip, and «* Required» floating on its own over a photograph says neither which field
 * nor, against a light image, anything legible at all (owner, 2026-09-02: *"show it on the field
 * title itself"*).
 *
 * So the title appears exactly when the mark does, in one opaque strip with it — the field's name
 * and its demand in the same box, on a background that does not depend on the photograph.
 */
function OverlayRequired({ title, word }: { title: string; word?: boolean }) {
  const t = useT();
  return (
    /* `whitespace-nowrap` and no truncation: the strip is two short words and clipping the field's
       NAME to «MINIMUM Y…» defeated the whole point of naming it (owner, 2026-09-03). It sizes to
       its content and the chip below keeps its own width. */
    <span className="mb-1 inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm border border-danger bg-surface px-1.5 py-0.5">
      <span className="text-label font-extrabold uppercase tracking-[0.05em] text-navy">{title}</span>
      <span className="flex-none text-label font-extrabold text-danger">{word ? t.create.requiredMark : "*"}</span>
    </span>
  );
}

export function MachineCard({
  item,
  gaps,
  shaking,
  tried,
  onCollapse,
}: {
  item: EquipmentItem;
  gaps: RequiredGap[];
  shaking: boolean;
  /** The renter has tried to move on — see `tried` in `Canvas`. */
  tried?: boolean;
  onCollapse?: () => void;
}) {
  const t = useT();
  const { state, actions } = useRfq();
  const tax = useItemTaxonomy(item, state.taxonomy);
  /** The subtype's photograph, else the category's. Null on most rows — the glyph covers that. */
  const photo = tax.subcategory?.equipmentImageUrl ?? tax.category?.equipmentImageUrl ?? null;
  /** Set when that URL fails to load, so the panel falls back to the glyph. Keyed off the URL so
   *  changing the subtype clears a previous failure rather than inheriting it. */
  const [brokenPhoto, setBrokenPhoto] = useState<string | null>(null);
  const photoBroken = brokenPhoto !== null && brokenPhoto === photo;
  const overrides = useItemOverrides(item, state.draft!.project);
  const attachments = useItemAttachments(item);
  const prov = useProvenance(item.id);
  const years = equipmentYears();

  const gapFor = (field: string) => gaps.some((g) => g.field === field);
  const shake = (field: string) => shaking && gapFor(field);
  /** The standing «* Required» mark: this field is owed, and the renter has already tried to go on. */
  const owed = (field: string) => !!tried && gapFor(field);

  /** Set an item field and record that the renter answered it, in one move. */
  const set = (field: string, patch: Partial<EquipmentItem>) => {
    prov.touch(field);
    actions.patchItem(item.id, patch);
  };

  const notAvailable = item.verdict === "no-match";
  /** Off-catalogue and nameable: the trio stays on screen, unstarred, with the name box under it. */
  const custom = isCustomLine(item);
  /**
   * Supplier first, the renter second — the order the prototype uses on every one of these, and the
   * reason it is written out rather than mapped from `PARTIES`, which is ["me","supplier"].
   */
  const partyOptions: { value: Party; label: string }[] = [
    { value: "supplier", label: t.options.party.supplier },
    { value: "me", label: t.options.party.me },
  ];

  return (
    <div {...pin("machine-card")} className="min-w-0 flex-1 rounded-sm border border-border bg-surface p-3.5">
      <div {...pin("machine-card-head")} className="mb-4 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          {/* An unnameable no-match row is never complete: no gate can fire on it, so `gaps` is
              empty, and empty would otherwise read as answered. An off-catalogue row the renter CAN
              name is gated like any other, so `gaps` tells the truth for it. */}
          <PanelDot complete={gaps.length === 0 && (custom || !notAvailable)} />
          <h2 className="whitespace-nowrap text-subhead font-extrabold text-navy">{t.create.machine}</h2>
        </span>
        {onCollapse && (
          <button type="button" onClick={onCollapse} className="text-meta font-semibold text-muted hover:text-navy-mid">
            {t.create.collapse}
          </button>
        )}
      </div>

      {/* The prototype's 2fr / 3fr split, 20px gutter, columns aligned to the top. */}
      <div {...pin("machine-card-body")} className="grid gap-5 lg:grid-cols-[2fr_3fr] lg:items-stretch">
        {/* ---------------- The 450px panel, and the four controls on its corners ---------------- */}
        {/* `overflow-hidden`: the photograph now runs to the panel's own edges, so the panel has to
            clip it to its corners or the image squares them off. */}
        <div {...pin("machine-card-image")} className="relative h-full min-h-[450px] w-full min-w-0 overflow-hidden rounded-md bg-surface2">
          {/* ── The subtype's own photograph, where the admin panel has one (owner, 2026-08-31) ──
              The panel drew a Material Symbol chosen by matching the subtype's NAME against a list of
              words — «excavator» → the agriculture glyph — which is a reasonable guess and never the
              machine the renter picked. `equipment_image_url` is the real thing, set per subcategory
              from the admin panel and now carried through `nodesToTree`.

              Three layers, in order, because each can be absent for an ordinary reason:
                1. the subtype's photograph — null on most rows, which is expected
                2. the category's, for a subtype whose parent is illustrated and it is not
                3. the glyph, which is always available and never wrong-looking

              `onError` is load-bearing rather than defensive: the taxonomy's photographs live in a
              folder of the shared bucket that is not public-read on staging, so a well-formed URL can
              answer 403. Without the catch the panel would draw a broken image where it used to draw
              a glyph — worse than what it replaced. The backend warns of the same trap on its own
              helper. */}
          {photo && !photoBroken ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={photo}
              alt=""
              draggable={false}
              onError={() => setBrokenPhoto(photo)}
              /* ── THE PANEL, not a picture inside it (owner, 2026-09-02) ────────────────────
                 *"Make the image shown in the full card, no margin, no padding, full fit."*

                 ~~240px tall, inside a `px-6` box, with the machine's name under it.~~ Two things
                 were wrong with that. The photograph sat as a stamp in the middle of a 450px grey
                 card, so the card read as mostly empty; and the name under it repeated the TYPE and
                 SIZE the selects state in full in the very next column.

                 `absolute inset-0` with `object-cover`: it fills the panel corner to corner. The
                 four chips already float on the corners, so they were drawn for a photograph
                 underneath them rather than beside it. */
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            /* No photograph: the glyph keeps its centred box and its caption. Here the name is not a
               repetition, it is the only thing saying what the machine is. */
            <div className="grid h-full place-content-center justify-items-center gap-2 px-6 text-center">
              <Icon name={equipmentIcon(tax.subtypeName || tax.categoryName)} size={132} className="text-navy/20" />
              {(tax.subtypeName || tax.categoryName) && (
                <p className="text-body font-semibold leading-snug text-navy/45">
                  {[tax.subtypeName || tax.categoryName, tax.sizeName].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
          )}

          {/* Top-left the certificate, top-right the quantity. Amber while the certificate is
              unanswered — an unasked certificate silently narrows the renter's own bidder pool.

              ── Neither is marked «required» (owner, 2026-09-03) ────────────────────────────────
              *"This isn't originally required by the request (year and certificate), so only shake
              it if not set, don't say required in red."*

              Both are WEB-ONLY gates (MREQ-AC-54): the app treats them as optional, and each has an
              explicit «No certificate» / «Any year» answer, so what the canvas wants from the renter
              is a decision, not a value. Calling that «* Required» told him the request demanded
              something it does not. They still block, and a refusal still shakes them — which is
              the whole of what the canvas is entitled to say about a field the request never asked
              for. */}
          <div className="absolute inset-x-2.5 top-2.5 flex items-start justify-between gap-2">
            <div className="min-w-0 max-w-[58%]">
              <div className={shake("safety_certificates") ? "shake-error" : undefined}>
                {/* More than one, because the field has always been an array everywhere else — on the
                    draft, on the wire, and on the bid form where a supplier confirms each cert on its
                    own row. Only this control disagreed, so a renter needing TÜV AND Aramco could ask
                    for one of them and find out at the bids which half he had lost. */}
                <CertSelect
                  values={overrides.safetyCerts}
                  touched={isTouched(state.draft!, prov.key("safety_certificates"))}
                  tone={gapFor("safety_certificates") ? "brand" : "overlay"}
                  onChange={(next) =>
                    set("safety_certificates", {
                      safetyCertsOverride: next,
                      // Dropping "other" takes its free text with it, or the note outlives the box it
                      // belonged to and gets sent with a request that no longer asks for it.
                      ...(next.includes("other") ? {} : { safetyCertsOtherText: null }),
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
                to sit on the panel without covering the machine.

                ~~Marked, for completeness of the gate set.~~ Unmarked again (owner, 2026-09-03):
                the request does not ask for a quantity, it comes with one, and the stepper's own
                minimum is 1 — so the mark stood over a field nobody can empty. */}
            <div className="flex items-center gap-2.5 rounded-sm bg-[color-mix(in_srgb,var(--navy-deep)_80%,transparent)] px-2 py-1.5 text-meta text-white">
              <button
                type="button"
                aria-label={`${t.create.machineCard.quantity} −`}
                disabled={item.quantity <= 1}
                onClick={() => set("quantity", { quantity: Math.max(1, item.quantity - 1) })}
                className="px-1 disabled:bg-disabled-bg disabled:text-disabled-fg"
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
            {/* ── Fuel is REQUIRED, and said nothing about it (owner, 2026-09-02) ───────────────
                `itemAppGaps` gates on `fuelType` — it is one of the app's own six — but this chip
                had neither the mark nor a gap tone, so a refusal opened the equipment panel with
                nothing on screen marked and looked like a button doing nothing at all. That is one
                half of *"random panels open and there is nothing I can do"*. */}
            <div className={`min-w-0 max-w-[46%] ${shake("fuel_type") ? "shake-error" : ""}`}>
              {/* ── The one overlay chip that is a REQUEST requirement ────────────────────────
                  `itemAppGaps` gates `fuelType`, so it is marked like the others — but only while
                  it is EMPTY. A star standing over a photograph on a field the agent fills for
                  every machine is a warning about nothing, four times a card. Empty, it stars;
                  blocking, it says the word. */}
              {!item.fuelType && <OverlayRequired title={t.create.machineCard.fuel} word={owed("fuel_type")} />}
              <SearchSelect
                value={item.fuelType}
                placeholder={t.create.machineCard.fuel}
                searchPlaceholder={t.create.machineCard.fuel}
                label={t.create.machineCard.fuel}
                tone={gapFor("fuel_type") ? "brand" : "overlay"}
                options={FUEL_TYPES.map((f) => ({ value: f, label: t.options.fuelType[f] }))}
                onChange={(v) => set("fuel_type", { fuelType: v as FuelType })}
              />
            </div>
            <div className={`min-w-0 max-w-[48%] ${shake("equipment_year") ? "shake-error" : ""}`}>
              <SearchSelect
                value={overrides.equipmentYear}
                placeholder={t.create.machineCard.minYear}
                searchPlaceholder={t.create.machineCard.minYear}
                label={t.create.machineCard.minYear}
                tone={gapFor("equipment_year") ? "brand" : "overlay"}
                /* Every year from 2010 to now, newest first — the app's own list (`year_stepper.dart`),
                   and `SearchSelect` gives it the same search box the app's sheet has. A draft saved
                   with one of the old bands keeps rendering: the value is carried in so the field
                   shows what the renter chose rather than emptying itself. */
                options={[
                  ...(overrides.equipmentYear && !years.includes(overrides.equipmentYear)
                    ? [{ value: overrides.equipmentYear, label: overrides.equipmentYear }]
                    : []),
                  ...years.map((y) => ({ value: y, label: y === "any" ? t.create.machineCard.anyYear : y })),
                ]}
                onChange={(v) => set("equipment_year", { equipmentYear: v })}
              />
            </div>
          </div>
        </div>

        {/* ---------------- Right column: three boxes, 16px apart ---------------- */}
        <div className="flex min-w-0 flex-col gap-4">
          {/* ── The order on an off-catalogue row (owner, 2026-09-06) ──────────────────────────
              the taxonomy trio, marked as unanswerable · the note, with «Message us» on its own line
              · the name box. The trio first because it is what the renter looked for; the note next,
              explaining why it is empty; the box last, as the answer he gives instead. */}
          {notAvailable && !custom ? null : (
            /* The amber-tinted taxonomy trio, at the prototype's minmax columns.

               It stays on screen for an off-catalogue row (owner, 2026-09-05): the renter names his
               machine below it, but a renter who CAN find it in the list must not have the list taken
               away from him. Marked red there and never starred: red says the catalogue has nothing
               for this, the star would say the renter owes an answer he cannot give. */
            <div
              className={`grid gap-2.5 rounded-sm p-3.5 sm:grid-cols-[minmax(132px,1fr)_minmax(150px,1.5fr)_minmax(104px,0.9fr)] ${
                // Red, and the whole box (owner, 2026-09-06): the three controls are the thing that
                // could not be answered, and a dot beside each label was too quiet to say it.
                custom ? "border border-danger/40 bg-danger-soft" : "bg-surface2"
              }`}
            >
              {/* Derived, never picked. The renter chooses a TYPE and the category follows from it —
                  so this shows the taxonomy's `tag` (its canonical grouping, e.g. "Earthmoving") as a
                  read-only box, exactly as the prototype does. No chevron, because there is nothing
                  here to open. */}
              <CanvasField
                label={t.create.machineCard.category}
                source={prov.itemSource("category", item.ref.categoryId, "ref")}
              >
                <div className="truncate rounded-sm border border-border bg-surface px-3 py-2.5 text-body text-navy">
                  {tax.tagName || "—"}
                </div>
              </CanvasField>
              <CanvasField
                label={t.create.machineCard.type}
                missing={custom || gapFor("subtype") || gapFor("category")}
                shake={shake("subtype") || shake("category")}
                required={owed("subtype") || owed("category")}
                star={!custom}
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
                missing={custom || gapFor("capacity")}
                shake={shake("capacity")}
                  required={owed("capacity")}
                star={!custom}
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

          {notAvailable && <UnavailableCard item={item} label={item.rawLabel ?? tax.subtypeName ?? ""} />}

          {/* ── The renter's own name for a machine the catalogue cannot place ──────────────────
              Prefilled from what he wrote in the RFQ, and never written into state until he types:
              a name nobody looked at must not reach a supplier. It is this row's required answer in
              place of the trio, so it carries the star and the shake the type and size would have. */}
          {custom && (
            <div className="rounded-sm bg-surface2 p-3.5">
              <CanvasField
                label={t.create.machineCard.customEquipment}
                missing={gapFor("custom_equipment")}
                shake={shake("custom_equipment")}
                required={owed("custom_equipment")}
                star
                hint={t.create.machineCard.customEquipmentHint}
              >
                <TextInput
                  value={item.customEquipment ?? item.rawLabel ?? ""}
                  maxLength={120}
                  placeholder={t.create.machineCard.customEquipmentPlaceholder}
                  onChange={(e) => set("custom_equipment", { customEquipment: e.target.value })}
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
            <div className="grid min-w-0 gap-3.5 rounded-sm bg-surface2 p-3.5 sm:grid-cols-2">
              <CanvasField
                  label={t.create.machineCard.delivery}
                  missing={gapFor("delivery")}
                  shake={shake("delivery")}
                  required={owed("delivery")}
                  star
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
                  required={owed("return")}
                star
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
            <div className="min-w-0 rounded-sm bg-surface2 p-3.5">
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
          <div className="flex w-full flex-col gap-2.5 rounded-sm bg-surface2 p-3.5">
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
  // Off-catalogue and nameable: the row is no longer a dead end, so it is drawn as a notice rather
  // than a refusal — the machine still goes out, and the copy under it says how.
  const custom = isCustomLine(item);

  const askUs = () => {
    const msg = fmt(t.step2.noMatch.whatsappMessage, { item: item.rawLabel ?? label });
    window.open(`https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
    actions.requestSourcing(item.id);
  };

  const askUsControl = item.sourcingRequested ? (
    <span className="flex flex-none items-center gap-1.5 text-meta font-semibold text-ok">
      <Icon name="check_circle" size={15} /> {t.create.machineCard.sourcingRequested}
    </span>
  ) : (
    <Button variant="secondary" size="sm" onClick={askUs}>
      <Icon name="chat" size={15} /> {t.create.machineCard.unavailableWhatsapp}
    </Button>
  );

  /* ── Off-catalogue: ONE line, in the house warning tone (owner, 2026-09-06) ─────────────────────
     `Notice` carries `NOTICE_TONE.warn`, the same token every other warning in the app wears, so
     this box cannot drift a shade away from them — it was hand-rolled amber before. A warning and
     not an error: nothing has gone wrong, the machine is simply not in the list yet, and the request
     still goes out. «Message us» rides on the same line as a footnote to the sentence. */
  if (custom) {
    return (
      <Notice tone="warn" icon="warning">
        <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <span className="min-w-[12rem] flex-1 leading-snug">{t.create.machineCard.notInCatalogueNote}</span>
          {askUsControl}
        </span>
      </Notice>
    );
  }

  /* The kill-switch row (`NEXT_PUBLIC_CUSTOM_EQUIPMENT=0`): this machine really is dropped from the
     request, so it stays an error, and it keeps the fuller wording that says so. */
  return (
    <div className="flex flex-col gap-2.5 rounded-sm border border-danger/40 bg-danger/[0.06] p-3.5">
      <p className="flex items-start gap-2 text-body font-semibold leading-snug text-danger">
        <Icon name="error_outline" size={16} className="mt-px flex-none" />
        {fmt(t.create.machineCard.unavailableTitle, { equipment: label })}
      </p>
      <p className="text-meta leading-snug text-muted">{t.step2.noMatch.explainer}</p>
      <div className="flex flex-wrap gap-2">{askUsControl}</div>
    </div>
  );
}
