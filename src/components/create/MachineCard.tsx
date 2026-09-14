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

import { useEffect, useMemo, useState } from "react";
import { fmt, useLocale, useT } from "@/lib/i18n";
import { useRfq } from "@/lib/store/rfq-store";
import { SUPPORT_WHATSAPP_NUMBER } from "@/lib/config/support";
import { CUSTOM_EQUIPMENT_ENABLED } from "@/lib/flags";
import { Button, Icon, Notice, TextArea, TextInput } from "@/components/ui";
import { equipmentIcon } from "@/components/requests/EquipImg";
import { CanvasField, ChoiceChips, ChoiceRow, PanelDot } from "@/components/create/Provenance";
import { CertSelect } from "@/components/create/CertSelect";
import { SearchSelect } from "@/components/create/SearchSelect";
import { useItemAttachments, useItemOverrides, useItemTaxonomy, useProvenance } from "@/components/create/hooks";
import { pin } from "@/lib/uiPins";
import { taxName } from "@/lib/contract/taxonomy";
import { taxonomyFromFixture } from "@/lib/api/client";
import type { Taxonomy } from "@/lib/contract/taxonomy";
import {
  equipmentYears,
  isCustomLine,
  isSystemChosen,
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

/** The trio box's columns, shared by the box and by its first row so the two line up exactly. */
const TRIO_COLS = "sm:grid-cols-[minmax(150px,1.3fr)_minmax(104px,0.85fr)_minmax(200px,1.35fr)]";

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
  /**
   * ── A DIRECT request's machine is the LISTING's, not the renter's to re-pick (app parity, AC-01) ──
   *
   * *"in direct request he cant change the taxonamy right? it is filled from equipment he selected
   * so if he want to change will be back to store"* (owner, 2026-09-12) — and yes, that is what the
   * app does. `equipment_step.dart` hides the size-edit badge when `isDirect` (*"the measurement is
   * locked from the listing prefill"*) and hides the «need a different type» section outright,
   * because *"direct-mode rentees are tied to one supplier; offering siblings under the same parent
   * category could route them to a subcategory the supplier doesn't carry"*.
   *
   * So the type and the size are read-only here and the way to change them is the ✕ on the
   * equipment tab, which takes him back to that supplier's store (`Canvas`, `direct-stash.ts`).
   * The category was always derived and never picked.
   */
  const listingLocked = !!state.direct;
  const tax = useItemTaxonomy(item, state.taxonomy);
  /** The subtype's photograph, else the category's. Null on most rows — the glyph covers that. */
  const photo = tax.subcategory?.equipmentImageUrl ?? tax.category?.equipmentImageUrl ?? null;
  /** Set when that URL fails to load, so the panel falls back to the glyph. Keyed off the URL so
   *  changing the subtype clears a previous failure rather than inheriting it. */
  const [brokenPhoto, setBrokenPhoto] = useState<string | null>(null);
  /**
   * A refused attempt to type into the NAME, which now shakes the escape row instead.
   *
   * Owner, 2026-09-14: *"if he tries to write then shake the question note - i actually want it read
   * so he understands its use by confirming that he is using his own words"*. The name is the
   * agent's output until he rejects the match; a field that simply does nothing teaches nothing, so
   * the attempt points at the one row that can change it.
   */
  const [hatchShake, setHatchShake] = useState(false);
  useEffect(() => {
    if (!hatchShake) return;
    const id = setTimeout(() => setHatchShake(false), 520);
    return () => clearTimeout(id);
  }, [hatchShake]);

  /**
   * The «point at what just changed» pulse, after the renter takes the line off-catalogue.
   *
   * Owner, 2026-09-13: *"clicking it will highlight with animation … the equipment [name] with the
   * note below it"*. The press changes three things at once — the taxonomy empties, the name box
   * gains its star, and a warning note appears — and all of it happens ABOVE the row he pressed, so
   * without this the card rearranges itself behind his eyes.
   * Cleared on a timer rather than on animation end: `animationend` never fires under
   * `prefers-reduced-motion`, where the rule draws a standing outline and no animation at all.
   */
  /** The escape is offered on every line except a direct one, which is taxonomy only. */
  const offerEscape = CUSTOM_EQUIPMENT_ENABLED && !listingLocked;
  /** What the read-only name box shows: his own words, else his RFQ's, else the pick he made. */
  const shownName = item.customEquipment ?? item.rawLabel ?? tax.pickedName ?? "";

  const [pulseName, setPulseName] = useState(false);
  useEffect(() => {
    if (!pulseName) return;
    const id = setTimeout(() => setPulseName(false), 1500);
    return () => clearTimeout(id);
  }, [pulseName]);
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
      {/* 🔴 `items-start`, not `items-stretch` (owner, 2026-09-14: *"for the image on the left side
          dont make it responsive to the opening this catalogue, it becomes too long"*). The catalogue
          panel can add 300px to the right column, and a stretched photograph followed it all the way
          down — a 1408x768 drawing rendered as a column. The two sides stopped being the same height
          the day the right one could grow. */}
      <div {...pin("machine-card-body")} className="grid items-start gap-5 lg:grid-cols-[2fr_3fr]">
        {/* ---------------- The 450px panel, and the four controls on its corners ---------------- */}
        {/* `overflow-hidden`: the photograph now runs to the panel's own edges, so the panel has to
            clip it to its corners or the image squares them off. */}
        {/* 🔴 `h-full` is GONE (owner, 2026-09-14: *"keep it fixed at its card height"*). `items-start`
            was not enough on its own: a percentage height in a grid resolves against the grid AREA,
            which IS definite, so `h-full` went on filling whatever the right column grew to — 450px
            of drawing stretched to 800 the moment the catalogue opened. The panel states its own
            height and nothing else decides it. */}
        <div {...pin("machine-card-image")} className="relative min-h-[450px] w-full min-w-0 overflow-hidden rounded-md bg-surface2">
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

                 `absolute inset-0`: the BOX fills the panel corner to corner. The four chips already
                 float on the corners, so they were drawn for a photograph underneath them rather
                 than beside it.

                 🔴 **`contain`, not `cover`** (owner, 2026-09-13: *"choose the right zoom and size
                 of the images here"*, on a card showing three wheels and nothing else). The panel is
                 `min-h-[450px]` and stretches to the column beside it - about 660x610 in his shot,
                 so taller than it is wide - while a taxonomy photograph is 1408x768, ratio 1.83.
                 `cover` scales to the HEIGHT and throws away more than half the width, which on a
                 flatbed is the half with the machine on it.

                 ⚠️ **This is the same measurement the request rail made on 2026-09-12** and it
                 came out the same way: *"the crop cut the machine into an unreadable jumble"*.
                 `contain` keeps the whole machine; the grey band above and below is the panel’s own
                 ground, which the glyph state already shows.

                 ⚠️ No padding. `p-*` shrinks the box BEFORE `contain` measures it, which is what
                 made the rail’s drawings letterbox at half size - the rail’s own note records it. */
              className="absolute inset-0 h-full w-full object-contain"
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
                  /* ── Three states, and the middle one was missing (owner, 2026-09-08) ────────
                     Unanswered → orange, saying «Pick certificate». Answered by the RENTER → the plain
                     overlay skin. Answered FOR him, by the agent reading his RFQ → the same overlay
                     skin plus the canvas’s provenance ring, so he can see at a glance which of these
                     answers are his own. Nothing here blocks: the gate is satisfied by a value from
                     either hand, which is why an agent-filled cert no longer shakes. */
                  preselected={isSystemChosen(
                    prov.itemSource("safety_certificates", overrides.safetyCerts, "safetyCertsOverride", true),
                  )}
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
              {/* 🔴 **No − on a single unit** (owner, 2026-09-14: *"remove the − in case it is one
                  unit, as it is confusing, this white −"*). ~~Drawn and `disabled`.~~ Its disabled
                  skin is a pale ground on a dark chip, so it read as the BRIGHTEST thing in the
                  control - a dash lit up beside the number, in the one state where it does nothing.
                  A control that cannot act is better absent than greyed, which is the ruling the
                  equipment tab’s ✕ already follows on a one-equipment request.
                  ⚠️ The `+` never goes: nothing caps how many machines a request asks for, so that
                  half is always live. */}
              {item.quantity > 1 && (
                <button
                  type="button"
                  aria-label={`${t.create.machineCard.quantity} −`}
                  onClick={() => set("quantity", { quantity: Math.max(1, item.quantity - 1) })}
                  className="px-1"
                >
                  −
                </button>
              )}
              {/* ⚠️ **The number alone, no ×** (owner, same message). The chip sits on the
                  machine’s own photograph with a − and a + beside it: what it counts is not in doubt,
                  and the multiplication sign read as part of a size («×3» next to «20 ton»). */}
              <span className="tabular-nums">{item.quantity}</span>
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
                label={t.create.machineCard.minYearName}
                tone={gapFor("equipment_year") ? "brand" : "overlay"}
                /* The same three states as the certificate beside it — see the note there. */
                preselected={isSystemChosen(
                  prov.itemSource("equipment_year", overrides.equipmentYear, "equipmentYear", true),
                )}
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
              ONE box holding the taxonomy trio AND the name field, then the note under it. The list
              first because it is what the renter looked for; his own name in the same box, because
              the two are one question — «which machine is this» — answered two ways, and two
              separate cards read as two unrelated asks. */}
          {notAvailable && !custom ? null : (
            /* The taxonomy trio, at the prototype's minmax columns.

               It stays on screen for an off-catalogue row (owner, 2026-09-05): the renter names his
               machine below it, but a renter who CAN find it in the list must not have the list taken
               away from him. Never starred there: nothing in the catalogue can satisfy it, and a star
               would say the renter owes an answer he cannot give. */
            <div
              className={`grid gap-2.5 rounded-sm p-3.5 ${TRIO_COLS} ${
                /* ── The operator rail's light orange, not the mustard (owner, 2026-09-13) ───────
                   *"can we use another colour? it is not nice and i don't think it matches our
                   design system, we might use the same operator light orange colour"*.
                   ~~`border-warn/40 bg-warn-soft`.~~ That IS `NOTICE_TONE.warn`, so it was not drift
                   — but `--warn-soft` is #f7edd8, a sandy cream, and against the orange this card
                   now speaks everywhere else (the labels, the dot, the pulse) it read as a third
                   colour nobody chose. This pair is the COLLAPSED OPERATOR RAIL's own, one panel to
                   the right of this box: `bg-brand-soft` inside `border-brand-light`. */
                /* 🔴 ONE ground, matched or not (owner, 2026-09-14: *"align with prototype for
                   all cases"*). ~~`border-brand-light bg-brand-soft` when off-catalogue.~~ The
                   prototype keeps its field block the same grey in every state and lets the PILL,
                   the two green boxes and the saved strip say what the line is. Tinting the whole
                   block orange painted the state three times, and it swallowed the pill that was
                   meant to state it — orange type on an orange ground. */
                "bg-surface2"
              }`}
            >
              {/* ── TWO rows, and nothing wide and useless (owner, 2026-09-13) ──────────────
                  *"i want the equipment [name] to be in the same row as the note below it, because
                  the field is so wide and useless, and for the type-size also must be on the same row
                  as the note below, so totally 2 rows here"*.
                  ~~Name (full width) · note · TYPE + SIZE · the offer.~~ Four rows for four things,
                  and the name box alone ate the card's whole width to hold «Spider Lift».
                  Row ONE is the name and the sentence this state owes: the warning note when the line
                  is off-catalogue, and the way OUT of the catalogue when it is not. Row TWO is the
                  two lists and, off-catalogue, the way back in.
                  ⚠️ The inner grid repeats `TRIO_COLS` rather than splitting 1fr/2fr of its own, so
                  the name box lines up EXACTLY with TYPE beneath it. A different ratio here is off by
                  the gap, which shows as a step down the left edge of the box.
                  ⚠️ `sm:items-end` levels the sentence with the INPUT, not with the label above it. */}
              <div className={`grid gap-2.5 sm:col-span-3 sm:items-end ${TRIO_COLS} ${pulseName ? "attn-pulse" : ""}`}>
                {/* ── The renter's OWN words, first and always (owner, 2026-09-12) ──────────────
                    ~~Shown only on a line the catalogue could not place.~~ The field stopped meaning
                    «the name of a machine we do not carry» and started meaning «what the renter calls
                    this machine», so it is the first thing on the card whatever the taxonomy says.

                    It is NOT required while a type is set: with a taxonomy on the line the name is a
                    note to us, and one of the two is all the backend asks for. Without one it is the
                    line's only answer, and it carries the star.

                    What it holds, in order: what he typed, else the words his RFQ used, else the
                    taxonomy he picked (flow B — a line added by hand fills itself from the pick
                    rather than asking him to retype what he just chose). */}
                <CanvasField
                  label={
                    /* ONE line, never wrapped (owner, 2026-09-14): the pill dropping under the label
                       put a third row into a block meant to read as a single field. */
                    /* `inline-flex`, not `flex`: the star that `CanvasField` draws after this
                       label is its SIBLING, and a block-level label pushed it onto a line of its own.
                       Inline, the three flow together and wrap only if they genuinely cannot fit. */
                    <span className="inline-flex items-center gap-2 whitespace-nowrap align-middle">
                      {t.create.machineCard.customEquipment}
                      {/* ── The state, as a pill on the label row (the prototype's own) ─────────
                          It says in two words what the card's colours only imply, and it is the one
                          place a renter can see that we DID place his machine. */}
                      {custom ? (
                        <span className="rounded-sm bg-brand-soft px-2 py-0.5 text-label font-semibold normal-case tracking-normal text-brand-deep">
                          {t.create.machineCard.pillNotMatched}
                        </span>
                      ) : item.ref.subcategoryId ? (
                        <span className="flex items-center gap-1.5 rounded-sm bg-ok-soft px-2 py-0.5 text-label font-semibold normal-case tracking-normal text-ok-deep">
                          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-ok" />
                          {t.create.machineCard.pillInCatalogue}
                        </span>
                      ) : null}
                    </span>
                  }
                  star={custom}
                  missing={gapFor("custom_equipment")}
                  shake={shake("custom_equipment")}
                  required={owed("custom_equipment")}
                >
                  {/* ── READ-ONLY, and it answers when he tries anyway (owner, 2026-09-13/14) ──
                      *"the equipment name field will be agent output at first then editable from the
                      other path when he clicks not what he wants, instead of editing it directly"*,
                      then *"if he tries to write then shake the question note"*.
                      🔴 This REVERSES 2026-09-12 (*"it is now the user input of the equipment
                      name"*), deliberately and at his word. What it buys: one writer at a time, so
                      the name can never quietly contradict the type beside it. What it costs: he
                      cannot label a matched line, and his words stop arriving as free aliases.
                      ⚠️ It stays a real `input`, not a `<div>`: clicking and typing is the gesture
                      he will make, and it has to be the gesture that teaches him where his words
                      live. `onKeyDown` catches the character before anything can change. */}
                  <TextInput
                    readOnly
                    value={shownName}
                    maxLength={120}
                    placeholder={t.create.machineCard.customEquipmentPlaceholder}
                    onKeyDown={(e) => {
                      if (e.key.length === 1 || e.key === "Backspace" || e.key === "Delete") {
                        e.preventDefault();
                        if (offerEscape) setHatchShake(true);
                      }
                    }}
                    onChange={() => {}}
                  />
                </CanvasField>

                {/* ── The note, and ONLY the note (owner, 2026-09-13) ──────────────────────────
                    *"i want this note inlined with the size-type row"* — so the dashed offer moved
                    down to sit under the lists it acts on, and this cell keeps the sentence alone.
                    ⚠️ On a MATCHED line there is nothing to say here and the cell is empty. That is
                    the cost of the move and it is his call: the offer belongs beside the two lists
                    that failed him, not beside the box it fills. */}
                <div className="sm:col-span-2">
                  {custom && (
                    /* ── The note, in the card's own orange (owner, 2026-09-12/13) ────────────
                       It was `text-warn` (#b98a1d), which `globals.css` states is a FILL — at 2.97:1
                       on a pale ground the sentence came out khaki, which is what he read as «not
                       yellow and not orange». `brand-deep` is the ink this card now uses for every
                       orange word on it, and it is the AA-safe half of the brand pair.
                       🔴 **It WRAPS, and two lines are fine** (owner, 2026-09-13, an hour after
                       asking for one: *"the note beside the equipment name is wrapped so make it 2
                       lines fine"*). ~~`sm:truncate`.~~ Clipping a warning is the one thing this
                       sentence must never do, and it was the price of the one-line rule; he looked
                       at it wrapped and took the wrap instead. The sentence stays SHORT anyway - two
                       lines is the ceiling here, not the target.
                       ⚠️ `items-start` so the glyph sits on the FIRST line rather than floating
                       against the middle of a two-line block. */
                    <p className="flex items-start gap-1 text-label leading-snug text-brand-deep">
                      <Icon name="warning" size={13} className="mt-px flex-none" />
                      <span className="min-w-0">{t.create.machineCard.notInCatalogueNote}</span>
                    </p>
                  )}
                </div>
              </div>

              <CanvasField
                label={t.create.machineCard.type}
                missing={gapFor("subtype") || gapFor("category")}
                shake={shake("subtype") || shake("category")}
                required={owed("subtype") || owed("category")}
                star={!custom}
                source={prov.itemSource("subtype", item.ref.subcategoryId)}
              >
                {custom ? (
                  /* ── His own words ARE the machine, so the two lists stop asking ───────────────
                      The prototype replaces both controls with a flat statement, and it is right:
                      an empty TYPE box beside an empty SIZE box reads as two answers he still owes,
                      when in fact he has answered — with the name above. The way back is the escape
                      row under them, which now reads «Can't find the equipment you want?». */
                  <span className="flex h-[var(--control-md)] items-center truncate whitespace-nowrap rounded-sm border border-ok/40 bg-ok-soft px-3 text-body text-ok-deep">
                    {t.create.machineCard.ownType}
                  </span>
                ) : (
                <SearchSelect
                  value={item.ref.subcategoryId}
                  placeholder={t.create.machineCard.typePlaceholder}
                  searchPlaceholder={t.create.machineCard.searchTypes}
                  label={t.create.machineCard.type}
                  disabled={listingLocked}
                  options={tax.allSubtypes}
                  /* 🔴 ~~«Add a custom equipment type», offered when a search found nothing
                     (2026-09-09).~~ REMOVED 2026-09-12: it opened a box that did not exist yet, and
                     the box is on the card at all times now — the row was a second door into a room
                     the renter is already standing in. */
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
                )}
              </CanvasField>
              <CanvasField
                label={t.create.machineCard.size}
                missing={gapFor("capacity")}
                shake={shake("capacity")}
                  required={owed("capacity")}
                star={!custom}
                source={prov.itemSource("capacity", item.ref.measurementId)}
              >
                {/* `nowrap`: «In your own words» broke over two lines in the narrower SIZE column
                    and left the two boxes at different heights. */}
                {custom ? (
                  <span className="flex h-[var(--control-md)] items-center truncate whitespace-nowrap rounded-sm border border-ok/40 bg-ok-soft px-3 text-body text-ok-deep">
                    {t.create.machineCard.ownSize}
                  </span>
                ) : (
                <SearchSelect
                  value={item.ref.measurementId}
                  placeholder={t.create.machineCard.sizePlaceholder}
                  searchPlaceholder={t.create.machineCard.searchSizes}
                  label={t.create.machineCard.size}
                  disabled={listingLocked || !item.ref.subcategoryId}
                  options={tax.sizes}
                  onChange={(v) => {
                    prov.touch("capacity");
                    actions.setItemMeasurement(item.id, v);
                  }}
                />
                )}
              </CanvasField>

              {/* ── One escape, one panel, two doors (owner, 2026-09-13/14) ───────────────────
                  Planned against his supervisor's prototype and cut down from it. What survives of
                  that design: the row stays on screen while its panel is open, the panel is the
                  white sheet with the orange top edge, the catalogue list carries the taxonomy's own
                  pictures, and a pick asks for the size on the row itself.
                  What was cut, and why: FOUR states became two (*"despite we see them as 4 cases,
                  user see them in 2"* — he cannot tell an alias hit from an exact one, and does not
                  care); THREE doors became two (browse and search were one list at two scopes); and
                  «describe it yourself» became a CONFIRMATION, because he described the machine at
                  the intake and *"i dont want the user to write anything more here"*.
                  ⚠️ Withheld on a line started from a supplier's listing — a DIRECT request is
                  taxonomy only (owner, 2026-09-12), and an off-catalogue one reaches nobody at all,
                  the named supplier included. */}
              {/* The prototype's own confirmation that the choice stuck. It is drawn UNDER the
                  escape, so the row that changed the line and the sentence describing the result sit
                  together rather than a column apart. */}
              {custom && !!(item.customEquipment ?? item.rawLabel) && (
                <span className="sm:col-span-3 flex items-center gap-2 rounded-sm border border-ok/40 bg-ok-soft px-3.5 py-2.5 text-body text-ok-deep">
                  <Icon name="check_circle" size={15} className="flex-none" />
                  {fmt(t.create.machineCard.savedOwn, { name: item.customEquipment ?? item.rawLabel ?? "" })}
                </span>
              )}

              {offerEscape && (
                <EquipmentChooser
                  item={item}
                  taxonomy={state.taxonomy}
                  shake={hatchShake}
                  onPick={(catId, subId, capId) => {
                    prov.touch("subtype");
                    prov.touch("capacity");
                    if (catId !== item.ref.categoryId) actions.setItemCategory(item.id, catId);
                    actions.setItemSubcategory(item.id, subId);
                    actions.setItemMeasurement(item.id, capId);
                  }}
                  onKeepOwn={(name) => {
                    actions.setItemOffCatalogue(item.id, name);
                    setPulseName(true);
                  }}
                />
              )}
            </div>
          )}

          {/* The kill-switch row keeps its card: there the machine really is dropped, and that is a
              refusal rather than a footnote. A NAMED off-catalogue row says its piece on the label. */}
          {notAvailable && !custom && <UnavailableCard item={item} label={item.rawLabel ?? tax.subtypeName ?? ""} />}

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
                /* Marked like the two legs beside it: it can be empty now that the draft no longer
                   seeds «me», so it has to be able to say so. */
                missing={gapFor("fuel_responsibility")}
                shake={shake("fuel_responsibility")}
                required={owed("fuel_responsibility")}
                star
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
/**
 * The escape row, and the single panel behind it.
 *
 * Two doors, whatever state the line is in, because the renter only ever sees two situations: this
 * is his machine, or it is not (owner, 2026-09-13). The panel's HEADER is the only thing that
 * changes with the state — «Change the equipment» when we matched something, «Widen the search»
 * when we did not.
 *
 * 🔴 The row is sized to its sentence (`w-max`, `whitespace-nowrap`) and never to its column: at a
 * column's width every sentence short enough to fit was too short to say what the press does, which
 * cost four wordings before the row moved (owner, 2026-09-13: *"dont ever wrap the text"*).
 */
function EquipmentChooser({
  item,
  taxonomy,
  shake,
  onPick,
  onKeepOwn,
}: {
  item: EquipmentItem;
  taxonomy: Taxonomy;
  /** True for one refused keystroke in the NAME box — the row answers for the field. */
  shake: boolean;
  onPick: (catId: string, subId: string, capId: string) => void;
  onKeepOwn: (name: string) => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const [view, setView] = useState<null | "root" | "list" | "own">(null);
  const [wide, setWide] = useState(false);
  const [query, setQuery] = useState("");
  /** Which row has its sizes open. A pick is two presses — the type, then the size it comes in. */
  const [sizesFor, setSizesFor] = useState<string | null>(null);
  /** What he will send as his own name. Seeded from the card the moment that door is opened. */
  const [draft, setDraft] = useState("");
  /** Types whose drawing failed to load — a well-formed URL in that bucket can still answer 403. */
  const [brokenArt, setBrokenArt] = useState<string[]>([]);

  const rows = useMemo(
    () =>
      taxonomy.flatMap((c) =>
        c.subcategories.map((sub) => ({
          catId: c.id,
          catName: taxName(c, locale),
          id: sub.id,
          name: taxName(sub, locale),
          /* The subtype's own drawing, else its category's — the same fallback the card's photo
             uses, so a type with no picture of its own is not a blank tile. */
          image: sub.equipmentImageUrl ?? c.equipmentImageUrl ?? null,
          sizes: sub.measurements.map((m) => ({ id: m.id, name: taxName(m, locale) })),
        })),
      ),
    [taxonomy, locale],
  );

  const family = rows.filter((r) => r.catId === item.ref.categoryId);
  /* With no category resolved there is no family to show, so the list opens WIDE — which is the
     same view, and saves a press that could only lead to an empty one. */
  const showAll = wide || family.length === 0;
  const q = query.trim().toLowerCase();
  const list = (showAll ? rows : family).filter(
    (r) => !q || `${r.name} ${r.catName}`.toLowerCase().includes(q),
  );

  const close = () => {
    setView(null);
    setSizesFor(null);
    setQuery("");
    setWide(false);
  };

  const label = item.ref.subcategoryId ? t.create.machineCard.hatchMatched : t.create.machineCard.hatchNoMatch;

  return (
    /* ── The row is TYPE · SIZE · the escape, as the prototype draws it (owner, 2026-09-14) ───────
       *"the «not» question must be in same line like prototype"*. A fragment, not a wrapper: these
       are grid ITEMS of the trio box, so the escape takes the third cell beside the two lists it is
       about, and the panel below spans all three. A wrapping `<div>` made both of them one full-width
       row under the lists, which is the layout he is pointing at. */
    <>
      <div className="flex items-end">
      <button
        type="button"
        onClick={() => (view ? close() : setView("root"))}
        className={`flex w-max max-w-full items-center gap-2.5 justify-self-start whitespace-nowrap rounded-sm border px-3.5 py-2.5 text-label font-semibold text-brand-deep transition ${
          shake ? "shake-error border-brand" : "border-brand-light bg-brand-soft hover:border-brand"
        }`}
      >
        {label}
        <span aria-hidden className="text-brand">{view ? "▴" : "▾"}</span>
      </button>
      </div>

      {view && (
        <div className="sm:col-span-3 flex flex-col gap-3 rounded-sm border border-border-strong border-t-[3px] border-t-brand bg-surface p-3.5">
          {view === "root" && (
            <>
              {/* ── The question is CENTRED, and the close sits opposite nothing (owner, 2026-09-14)
                  *"i want «how do you want to change it?» as centre question in the card"*, which is
                  also how the prototype draws this header: a three-column row whose middle cell holds
                  the title, so the close on the right cannot pull it off centre. */}
              <div className="grid grid-cols-[1fr_auto_1fr] items-baseline gap-3">
                <span />
                <span className="text-center text-body font-extrabold text-navy">
                  {item.ref.subcategoryId ? t.create.machineCard.panelChange : t.create.machineCard.panelWiden}
                </span>
                <button type="button" onClick={close} className="text-end text-label font-semibold text-muted-dark hover:text-navy">
                  {t.common.close}
                </button>
              </div>
              {/* ⚠️ No sub-line under either door (owner, 2026-09-14: *"remove small text below the
                  keep my own words"*). What the press costs is the note's job, and the note appears
                  the moment it is pressed. */}
              <div className="grid gap-2.5 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setView("list")}
                  className="rounded-sm border border-border-strong bg-surface px-3.5 py-3 text-center transition hover:border-navy hover:bg-surface2"
                >
                  <span className="block text-body font-semibold text-navy">{t.create.machineCard.doorSearch}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDraft(item.customEquipment ?? item.rawLabel ?? "");
                    setView("own");
                  }}
                  className="rounded-sm border border-border-strong bg-surface px-3.5 py-3 text-center transition hover:border-navy hover:bg-surface2"
                >
                  <span className="block text-body font-semibold text-navy">{t.create.machineCard.doorOwn}</span>
                </button>
              </div>
            </>
          )}

          {view === "list" && (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <span className="text-body font-extrabold text-navy">
                  {showAll
                    ? t.create.machineCard.searchHeading
                    : fmt(t.create.machineCard.browseHeading, { family: family[0]?.catName ?? "" })}
                </span>
                <div className="flex items-center gap-3">
                  {!showAll && (
                    <button type="button" onClick={() => setWide(true)} className="text-label font-semibold text-brand-deep hover:underline">
                      {t.create.machineCard.searchAll}
                    </button>
                  )}
                  <button type="button" onClick={() => setView("root")} className="text-label font-semibold text-muted-dark hover:text-navy">
                    {t.create.machineCard.backStep}
                  </button>
                </div>
              </div>

              {showAll && (
                <TextInput
                  value={query}
                  placeholder={t.create.machineCard.searchAny}
                  onChange={(e) => setQuery(e.target.value)}
                />
              )}

              {/* ── The list says WHY it is short (owner, 2026-09-14) ────────────────────────
                  `/api/taxonomy` falls back to a 17-subtype stand-in whenever the agents service
                  fails, and said nothing — so a broken fetch and a thin catalogue drew the same
                  screen, and the renter read it as «you do not carry my machine». */}
              {taxonomyFromFixture() && (
                <span className="flex items-start gap-1.5 rounded-sm border border-brand-light bg-brand-soft px-3 py-2 text-label text-brand-deep">
                  <Icon name="warning" size={13} className="mt-px flex-none" />
                  {t.create.machineCard.catalogueShort}
                </span>
              )}

              <div className="flex max-h-[232px] flex-col gap-1.5 overflow-y-auto">
                {list.map((r) => (
                  <div key={r.id} className="rounded-sm border border-border bg-surface">
                    {/* ── ONE line per type, at the card's own metrics (owner, 2026-09-14) ──────
                        *"can i make the sizes beside the equipment name and make the card less
                        height even the image of it"*. The name and its sizes were stacked, which
                        gave every row two lines and an 80px thumbnail beside them — four rows then
                        filled the card. Name, then sizes after a middot, on one line, against a 44px
                        drawing.
                        ⚠️ The action is `brand-deep`, not the map's `--action` blue: this card
                        speaks orange, and a blue link in the middle of it is a fifth colour. */}
                    <button
                      type="button"
                      onClick={() => setSizesFor(sizesFor === r.id ? null : r.id)}
                      className="flex w-full items-center justify-between gap-3 px-2.5 py-1.5 text-start transition hover:bg-surface2"
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span className="grid h-[36px] w-[52px] flex-none place-items-center overflow-hidden rounded-sm bg-surface3">
                          {/* ⚠️ `onError` is load-bearing, not defensive (owner, 2026-09-14:
                              *"the equipment image always, if not exist fallback to icon"*). The
                              taxonomy's drawings live in a bucket folder that is not public-read on
                              staging, so a perfectly well-formed URL answers 403 — and without the
                              catch the row draws a broken image where it could draw a glyph. The
                              card's own photograph has caught this since 2026-08-31; the list did
                              not. */}
                          {r.image && !brokenArt.includes(r.id) ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={r.image}
                              alt=""
                              className="h-full w-full object-contain p-0.5"
                              onError={() => setBrokenArt((b) => (b.includes(r.id) ? b : [...b, r.id]))}
                            />
                          ) : (
                            <Icon name="precision_manufacturing" size={16} className="text-muted" />
                          )}
                        </span>
                        <span className="min-w-0 truncate">
                          <span className="text-body font-semibold text-navy">{r.name}</span>
                          <span className="text-label text-muted"> · {r.sizes.map((m) => m.name).join(" · ")}</span>
                        </span>
                      </span>
                      <span className="flex-none text-label font-semibold text-brand-deep">
                        {r.id === item.ref.subcategoryId ? t.create.machineCard.currentPick : t.create.machineCard.useThis}
                      </span>
                    </button>

                    {sizesFor === r.id && (
                      /* The size is asked on the ROW, not applied silently: sizes differ per type,
                         and picking the first one for him is the wrong auto-fill this whole panel
                         exists to avoid. */
                      <div className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-2.5">
                        <span className="text-label font-semibold uppercase tracking-[0.05em] text-muted">
                          {t.create.machineCard.whichSize}
                        </span>
                        {r.sizes.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => {
                              onPick(r.catId, r.id, m.id);
                              close();
                            }}
                            className="rounded-sm border border-border-strong bg-surface px-3 py-1.5 text-body text-navy transition hover:border-navy hover:bg-surface2"
                          >
                            {m.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                {list.length === 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-brand-light bg-brand-soft px-3.5 py-2.5">
                    <span className="text-label text-brand-deep">{t.create.machineCard.noneFound}</span>
                    <button type="button" onClick={() => setView("own")} className="text-label font-semibold text-brand-deep hover:underline">
                      {t.create.machineCard.doorOwn}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          {view === "own" && (
            <>
              {/* ── TWO rows, not four (owner, 2026-09-14) ──────────────────────────────────────
                  *"keep the confirm as side button from the field on one row, and even «what you
                  request» tell must be beside the title"*. The panel was a title, a label, a value
                  and a full-width button stacked — four rows to confirm one sentence he had already
                  written. The label joins the title, and the value sits beside the button it
                  confirms. */}
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="flex flex-wrap items-baseline gap-2.5">
                  <span className="text-body font-extrabold text-navy">{t.create.machineCard.doorOwn}</span>
                  <span className="text-label font-semibold uppercase tracking-[0.05em] text-muted">
                    {t.create.machineCard.willSay}
                  </span>
                </span>
                <button type="button" onClick={() => setView("root")} className="text-label font-semibold text-muted-dark hover:text-navy">
                  {t.create.machineCard.backStep}
                </button>
              </div>
              {/* ── EDITABLE, and this is the one place it is (owner, 2026-09-14) ─────────────
                  *"the text must be editable, why not? it must be from here"*.
                  🔴 It seeds from what he already wrote and he may change it, which is the whole
                  answer to «read-only or not»: the box on the card is the agent's output, and THIS is
                  where the words become his. One writer, reached deliberately, so the name can still
                  never quietly contradict a type — by the time he types here, the type is going. */}
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="min-w-0 flex-1">
                  <TextInput
                    value={draft}
                    maxLength={120}
                    placeholder={t.create.machineCard.customEquipmentPlaceholder}
                    onChange={(e) => setDraft(e.target.value)}
                  />
                </span>
                <Button
                  size="sm"
                  className="flex-none"
                  disabled={!draft.trim()}
                  onClick={() => {
                    onKeepOwn(draft.trim());
                    close();
                  }}
                >
                  {t.create.machineCard.keepOwn}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}

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
     still goes out.

     ~~«Message us», and the green «We're looking for this one» it turned into.~~ Removed by the
     owner the same day it was added. The row already tells the renter what to DO — post it, share
     the link — and a second control beside that sentence offered him a different errand, in another
     app, at the moment he was filling in a request. The sourcing ask survives on the kill-switch
     row below, where the machine really is dropped and there is nothing else to press. */
  if (custom) {
    return (
      <Notice tone="brand" icon="warning">
        <span className="block leading-snug">{t.create.machineCard.notInCatalogueNote}</span>
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
