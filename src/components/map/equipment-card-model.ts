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
 * It lives in `components/map/` rather than in `lib/contract/` because it reads `MatchRequest`, the
 * panel's own shape, and belongs to the component tree with it. A contract module reaching into
 * `components/` would invert the dependency the other way round, and the contract files carry a
 * mechanical-Dart-port promise this one does not.
 */

import { arabicIndicDigits, availabilityView, isOutOfCity, REQUEST_ACTION_COLOUR } from "@/lib/contract/bid-map";
import type { Bilingual } from "@/lib/contract/equipment-list";
import type { FleetMachine } from "@/lib/contract/fleet";
import { computeUnitReadiness, readinessInputsFor, type ReadinessBand } from "@/lib/contract/bid-readiness";
import { heroPhotoUrl, type MatchRequest } from "@/components/map/panel/machine-panel-model";

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
  /** `var(--ok)` / `var(--brand)` / `var(--danger)`. The chip, and the hairline down the photo's inner edge, are
   *  this one colour; the marker's disc and caption are the same one for the same machine.
   *
   *  Three since 2026-08-13 (owner): the list now carries machines he did NOT offer, and "offered but
   *  not placed" had been sharing red with "not offered at all" — two different questions in one
   *  colour and one sentence. */
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
 * One requested certificate, and whether this machine has it.
 *
 * `held` is the whole state: green when the machine carries it, red when it does not. There is no
 * third value, because there is no third case — the list only ever contains certificates the request
 * named, so every entry is either satisfied or outstanding.
 */
export interface EquipmentCardCert {
  /** The canonical code (`tuv`, `spsp`, …) — the key, and the React list key. */
  code: string;
  label: Bilingual;
  held: boolean;
}

/**
 * **The machine's papers, as a proportion** — the app's own score, drawn as dots beside the file icon.
 *
 * ~~"No readiness band, no percent, no score on the card" (RM3-AC-29 / AC-32's second half).~~
 * Withdrawn by the owner, 2026-08-28, with the card it was written about. That rule was written when
 * the card carried an availability chip: a band beside it made the renter reconcile two summaries of
 * one machine before reading either. The redesigned card has ONE state — the distance, painted with
 * the availability it is only as good as — and the papers are a different question entirely, asked
 * of the file rather than of the supplier. The dots answer it in the corner the file icon opens.
 *
 * `done` / `total` and `band` are `computeUnitReadiness`'s, scored with `scoreOwnership: true`
 * because these rows are fleet rows — the app's `total` (`2 + certs`), which is what its own map
 * panel reads (`bid_map.dart:470-473`). Never re-derived here: the card, the detail and the app all
 * quote one fraction.
 */
export interface EquipmentCardReadiness {
  /** Papers on file, of {@link total}. */
  done: number;
  /** Everything scored: the photos, the ownership paper, and one per requested certificate. */
  total: number;
  /** `bandOf(percent)` — green at 100, amber from 50, else red. The dots' colour, and nothing else's:
   *  it must not be mistaken for the availability colour, which is a fact about the SUPPLIER. */
  band: ReadinessBand;
}

/**
 * Everything one card states, and **nothing else**.
 *
 * What is deliberately absent, and why:
 *  - **the serial number** (AC-12) — it identifies the machine to the system, not to a renter;
 *  - **the load capacity / measurement** (AC-12) — the type and the size are already stated once, in
 *    the count pills, and stating them again per card turns a scannable column into a spec sheet;
 *  - **any second commitment field** (AC-32) — see {@link EquipmentCardChip};
 *  - **the verified mark and the «in this offer» badge** — dropped with the 2026-08-28 redesign. The
 *    renter does not care whether a machine is *in the offer but unavailable*; he cares whether it is
 *    available, and the badge was a second membership fact competing with the one state the card now
 *    carries. The platform's tick went with the rest of the furniture: the card answers *how far, how
 *    sure, and how complete*, and everything else is one press away in the file.
 *
 *    ~~The photo went with them.~~ Back on 2026-08-29 by the owner's word — see {@link
 *    EquipmentCardModel.photo}. It is not furniture; it is how a renter tells three excavators apart.
 *
 * ~~"no readiness band, no percent, no score" (RM3-AC-29)~~ — withdrawn with the same redesign; see
 * {@link EquipmentCardReadiness} for why the rule died with the chip it was protecting.
 */
export interface EquipmentCardModel {
  equipmentId: string;
  /** «Caterpillar 320D · 2022», falling back to the taxonomy word when the listing has no name. Both
   *  locales, so the component picks rather than this file reaching for one. */
  title: Bilingual;
  /**
   * The front photo, else any photo, else null — a card with none says so rather than shimmering.
   *
   * ~~Dropped with the 2026-08-28 redesign.~~ Back the next day, by name (owner: *"i want the images
   * of the front image of equipment back"*). It was cut as furniture and it is not: the machines in a
   * column are a fleet, and a renter comparing three excavators recognises them by sight before he
   * reads a word of either title. Nothing else came back with it — the availability chip, the
   * «in this offer» badge, the platform's tick and the certificate line all stay gone.
   */
  photo: string | null;
  chip: EquipmentCardChip;
  /**
   * Kilometres to the project **to one decimal**, or null. Never a 0 standing in for "unknown".
   *
   * ~~Whole kilometres.~~ Withdrawn (owner, 2026-08-11: *"do not round, always keep one decimal"*).
   * `Math.round` was hiding real movement: a supplier moved a machine to a nearer yard, the fleet read
   * went 8.2 → 7.5 km, and both rendered «8 km» — and because `Math.round(7.5)` is 8, a yard 700 m
   * closer displayed as *the same distance*. On a surface whose machines are usually inside one city,
   * a whole kilometre is coarser than the differences the renter is deciding on.
   *
   * A NUMBER, not a formatted string: this model holds no locale (see the file header), and the two
   * scripts write both the digits and the decimal separator differently. `distanceDigits` does that,
   * once, for the card and the marker and the detail alike.
   */
  km: number | null;
  /** The yard is outside the request city's own radius — the fact that turns a delivery into a
   *  mobilisation. A qualifier on the offer, not a colour and not a filter. */
  outOfCity: boolean;
  /**
   * The certificates **this request asked for**, each said to be held or not (owner, 2026-08-11).
   *
   * ~~The certificates the machine actually holds.~~ Withdrawn. The card used to list whatever was on
   * the machine's file, which put an Insurance chip on a machine while the TÜV the renter asked for
   * was missing and said nowhere — the card answered a question nobody had asked and stayed silent on
   * the one that mattered.
   *
   * So: **only requested certificates appear**, held ones green and missing ones red. A certificate
   * the machine holds but the request never named is not shown here at all — the owner's words, *"not
   * requested docs, the renter will not be interested to see it here"*. It is still on the documents
   * tab, where the renter goes to see everything the machine carries; this line is the answer to *his
   * request*, not an inventory.
   *
   * Empty ⇒ the request asked for no certificates, and the card says so rather than leaving the line
   * blank. That is a different sentence from "the machine has none" and the copy has to follow.
   */
  certs: EquipmentCardCert[];
  /** Non-null **iff** {@link EquipmentCardChip.availability} is `unconfirmed` (AC-13). */
  askAvailability: EquipmentCardAsk | null;
  /** The machine's papers as a proportion — see {@link EquipmentCardReadiness}. */
  readiness: EquipmentCardReadiness;
}

/**
 * Build one card.
 *
 * The chip is `availabilityView(machine)` and nothing else (RM3-AC-19) — the same call
 * `machineMarkers` makes for the marker, so the card and its pin cannot disagree about one machine.
 * **`yardConfirmed` is not read here and is not readable from here**: it is true for every
 * readiness-written entry, so reading it would turn every chip green and every pin with it.
 */
export function equipmentCardModel(
  machine: FleetMachine,
  /**
   * The request this machine is being read against — the source of WHICH certificates the card names.
   * Optional so a caller with no request in hand (a preview, a test) still renders a card; without it
   * the certificate line is empty, which reads as "nothing asked for" rather than inventing a list.
   */
  request?: MatchRequest,
): EquipmentCardModel {
  const chip = availabilityView(machine);
  const name = [machine.manufacturer, machine.modelName].filter(Boolean).join(" ").trim();

  // ── ONE readiness call, read twice ───────────────────────────────────────────────
  // The certificate list and the dots are two readings of the same score, so they are ONE call: the
  // dots cannot say "3 of 4 on file" while the chips below them name a fifth certificate.
  //
  // **`scoreOwnership: true` because `machine` is a FLEET row** (owner's ruling, 2026-08-12: *"for the
  // percentage use existing bid readiness in the app as source of truth"*). `supplier-fleet.service.ts`
  // serves the map's rows unstripped, so proof of ownership is present and scoreable here — unlike the
  // renter's bid projection, where `RENTEE_HIDDEN_DOC_TYPES` removes it. It is the app's own `total`
  // (`2 + certs`), which is what its map panel reads (`bid_map.dart:470-473`) — never its `renteeTotal`.
  // See `bid-readiness.ts`'s header and `machine-panel-model.FLEET_READINESS_OPTS`.
  //
  // Without a request there is nothing asked for, so the score is the photos and the ownership paper
  // alone. That is a real reading, not a fallback: those two are facts about the machine's file and
  // are true whether or not anyone named a certificate.
  const readiness = computeUnitReadiness(
    machine,
    request ? readinessInputsFor(request).equipCerts : [],
    [],
    null,
    { scoreOwnership: true },
  );

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
    // One decimal, and rounded to it rather than to a whole kilometre (owner, 2026-08-11) — see
    // `EquipmentCardModel.km`. `×10 / 10` rather than `toFixed`, because the model returns a NUMBER
    // and `parseFloat(toFixed(1))` is the same value by a longer road.
    km:
      typeof machine.distanceKm === "number" && Number.isFinite(machine.distanceKm)
        ? Math.round(machine.distanceKm * 10) / 10
        : null,
    outOfCity: isOutOfCity(machine.distanceKm),
    // One entry per REQUESTED certificate with its `present` flag — exactly the list this field wants,
    // off the shared score above, so a certificate cannot read held here and missing one screen deeper.
    certs: readiness.equipmentCerts.map((c) => ({ code: c.code, label: { en: c.labelEn, ar: c.labelAr }, held: c.present })),
    askAvailability: chip.availability === "confirmed" ? null : { colour: REQUEST_ACTION_COLOUR },
    readiness: { done: readiness.done, total: readiness.total, band: readiness.band },
  };
}
