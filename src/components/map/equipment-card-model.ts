/**
 * **V5 · one machine card, as a model** (spec 004 §6.4; RM3-AC-11, AC-12, AC-13, AC-19, AC-32, AC-33).
 *
 * **NO React, NO DOM, NO i18n imports.** The same rule `machine-panel-model.ts` states beside the
 * panel it serves, and this file is its sibling: the card's decisions live here, `EquipmentList.tsx`
 * paints them and decides nothing of its own.
 *
 * Why a model at all, when the card was already a component reading four helpers directly: three of
 * the card's rules are **negative**, and a negative is not provable against a render. *"No serial and
 * no load capacity"* (AC-12), *"one chip, never a chip plus a band"* (AC-32) and *"the ask is blue,
 * never navy"* (AC-33) are all claims about what the card is ALLOWED TO KNOW — and a component can be
 * swept for what it renders only with a DOM harness, while a model can be swept for what it CARRIES
 * with `Object.keys`. Moving the derivation here is what turns those three from prose into assertions.
 *
 * It lives in `components/map/` rather than in `lib/contract/` for one reason: it needs
 * `certificateChips` and `heroPhotoUrl`, which are the panel's model and belong to the component tree.
 * A contract module reaching into `components/` would invert the dependency the other way round, and
 * the contract files carry a mechanical-Dart-port promise this one does not.
 */

import { arabicIndicDigits, availabilityView, isOutOfCity, REQUEST_ACTION_COLOUR } from "@/lib/contract/bid-map";
import type { Bilingual } from "@/lib/contract/equipment-list";
import type { FleetMachine } from "@/lib/contract/fleet";
import { certificateChips, heroPhotoUrl } from "@/components/map/panel/machine-panel-model";

/**
 * **The card's ONE state chip** (RM3-AC-32).
 *
 * Availability and commitment are the same question on this surface — *did the supplier commit this
 * machine to this bid?* — so they are one value, not a chip plus a band. There is no second field
 * here and no second field on the model: a card carrying both a chip and a readiness band would make
 * the renter reconcile two summaries of one machine before reading either.
 */
export interface EquipmentCardChip {
  /** From {@link availabilityView} — the same call the marker set makes (RM3-AC-19). */
  availability: "confirmed" | "unconfirmed";
  /** `#16A34A` / `#D9362A`. The chip, and the hairline down the photo's inner edge, are this one
   *  colour; the marker's disc and caption are the same one for the same machine. */
  colour: string;
}

/**
 * **«اطلب التأكيد»** — present on an unconfirmed card and absent on a confirmed one (RM3-AC-13).
 *
 * Its existence is the AC: an unconfirmed machine can be asked about **without opening the detail**,
 * so the ask is a control on the card and not a link to somewhere the ask lives. `null` on a confirmed
 * card is not a disabled button — there is nothing to confirm, so there is no control.
 */
export interface EquipmentCardAsk {
  /** Blue, **never navy** (RM3-AC-33). Beside a red chip, navy reads as disabled. */
  colour: string;
}

/**
 * Everything one card states, and **nothing else**.
 *
 * What is deliberately absent, and why:
 *  - **the serial number** (AC-12) — it identifies the machine to the system, not to a renter;
 *  - **the load capacity / measurement** (AC-12) — the type and the size are already stated once, in
 *    the count pills, and stating them again per card turns a scannable column into a spec sheet;
 *  - **any second commitment field** (AC-32) — see {@link EquipmentCardChip};
 *  - **a readiness band, a percent or a score** (RM3-AC-29) — the machine's documents are the
 *    detail's subject, and a number over them invites the renter to stop reading the evidence.
 */
export interface EquipmentCardModel {
  equipmentId: string;
  /** «Caterpillar 320D · 2022», falling back to the taxonomy word when the listing has no name. Both
   *  locales, so the component picks rather than this file reaching for one. */
  title: Bilingual;
  /** The front photo, else any photo, else null — a card with none says so rather than shimmering. */
  photo: string | null;
  chip: EquipmentCardChip;
  /** Whole kilometres to the project, or null. Never a 0 standing in for "unknown". */
  km: number | null;
  /** The yard is outside the request city's own radius — the fact that turns a delivery into a
   *  mobilisation. A qualifier on the offer, not a colour and not a filter. */
  outOfCity: boolean;
  /** The safety certificates the machine actually holds (AC-11). Empty ⇒ the card states the absence
   *  explicitly rather than leaving the line blank. */
  certs: Bilingual[];
  /** Non-null **iff** {@link EquipmentCardChip.availability} is `unconfirmed` (AC-13). */
  askAvailability: EquipmentCardAsk | null;
}

/**
 * Build one card.
 *
 * The chip is `availabilityView(machine)` and nothing else (RM3-AC-19) — the same call
 * `machineMarkers` makes for the marker, so the card and its pin cannot disagree about one machine.
 * **`yardConfirmed` is not read here and is not readable from here**: it is true for every
 * readiness-written entry, so reading it would turn every chip green and every pin with it.
 */
export function equipmentCardModel(machine: FleetMachine): EquipmentCardModel {
  const chip = availabilityView(machine);
  const name = [machine.manufacturer, machine.modelName].filter(Boolean).join(" ").trim();

  // The year is a numeral inside the title, so it takes the reader's digits — an Arabic-Indic figure
  // is not a translation of `2022`, it is the same number written the way the surrounding line is.
  const titleIn = (kind: string | null, year: string | null): string =>
    [name || kind, year].filter(Boolean).join(" · ");

  return {
    equipmentId: machine.equipmentId,
    title: {
      en: titleIn(machine.subcategoryName ?? machine.subcategoryNameAr ?? "", machine.year != null ? String(machine.year) : null),
      ar: titleIn(
        machine.subcategoryNameAr ?? machine.subcategoryName ?? "",
        machine.year != null ? arabicIndicDigits(machine.year) : null,
      ),
    },
    photo: heroPhotoUrl(machine),
    chip,
    km:
      typeof machine.distanceKm === "number" && Number.isFinite(machine.distanceKm)
        ? Math.round(machine.distanceKm)
        : null,
    outOfCity: isOutOfCity(machine.distanceKm),
    certs: certificateChips(machine),
    askAvailability: chip.availability === "confirmed" ? null : { colour: REQUEST_ACTION_COLOUR },
  };
}
