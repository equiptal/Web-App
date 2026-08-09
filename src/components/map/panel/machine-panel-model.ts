/**
 * Deal-room equipment verification (spec 004 v3) — **V7 / V8 / V9 pure model**.
 *
 * Every judgement the machine detail, the equipment-documents tab and the company panel render is
 * computed here, with **no React, no DOM and no i18n import**. The components below it only paint what
 * these functions return, which is why the six match cells, the document groups' attention counts and
 * the company rows are unit-testable without a component harness (this repo's vitest env is `node`).
 *
 * **There is exactly one readiness scorer.** `computeUnitReadiness` + `readinessInputsFor`
 * (`lib/contract/bid-readiness.ts`) already answer "does this machine hold what the request asks for?";
 * the match grid *presents* their output and never re-derives a cert, an operator licence or a year
 * conflict. A second scorer is how the pin's colour and the panel's grid start disagreeing about one
 * machine.
 *
 * **Availability is not in this file.** Colour for the availability chip comes from `unitAvailability`
 * in `bid-map.ts` and from nothing else — never from `yardConfirmed` (that boolean is
 * `yardId != null` supplier-side, so reading it turns every chip green). See `bid-map.ts:64`.
 */

import { canonicalCertCode, computeUnitReadiness, readinessInputsFor, type UnitReadiness } from "@/lib/contract/bid-readiness";
import type { OfferedUnitDoc } from "@/lib/contract/bids";
import type { FleetMachine } from "@/lib/contract/fleet";

/* ────────────────────────────────── shared ────────────────────────────────── */

/** An EN/AR pair. The panel components take `L(en, ar)` as a prop (this repo's component-local
 *  bilingual pattern — see `requests/SharedBidSubmissionModal.tsx`), so the model returns both. */
export interface Bilingual {
  en: string;
  ar: string;
}

const ARABIC_INDIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
/** Western digits → Arabic-Indic, per digit. Mirrors `bid-map.ts`'s helper; kept local because that
 *  one is private there and this file must not reach into another surface's internals. */
export function arDigits(n: number | string): string {
  return String(n).replace(/\d/g, (d) => ARABIC_INDIC_DIGITS[Number(d)]);
}

const norm = (s: string): string => s.trim().toLowerCase().replace(/[\s-]+/g, "_");

/* ───────────────────────────── V7 — the six match cells ───────────────────────────── */

/**
 * **green** = the request asked and the machine satisfies it · **grey** = the request did not ask ·
 * **red** = the request asked and the machine does not satisfy it.
 *
 * There is no fourth state and there is no amber: a cell either answers the renter's question or says
 * it was never asked.
 */
export type MatchCellState = "green" | "grey" | "red";

export type MatchCellKey =
  | "year_make"
  | "attachments"
  | "photos"
  | "ownership"
  | "equipment_cert"
  | "operator_cert";

export interface MatchCell {
  key: MatchCellKey;
  label: Bilingual;
  state: MatchCellState;
  /**
   * The cell's **actual finding** — "3 of 4 uploaded", "on the machine's file", "not on the file"
   * (§6.5). Never a bare tick: a tick tells the renter a check passed without telling him what was
   * checked, which is the whole thing this surface exists to stop.
   */
  finding: Bilingual;
}

/**
 * The request-side asks a machine is scored against.
 *
 * Structurally satisfied by a `BidCard` (which carries the request's asks projected onto the bid), so
 * a caller that already holds one can pass it straight through. Kept structural rather than importing
 * `BidCard` so the panel is not coupled to a 100-field type it reads three fields of.
 */
export interface MatchRequest {
  /** Raw requested equipment-cert codes (lowercase, e.g. `["aramco","tuv"]`). */
  reqEquipmentCerts?: string[] | null;
  /** The renter's required operator licence level — one comma-joined field of request codes
   *  (`TUV` · `SPSP` · `CERTIFIED` · `SAFETY_CERT` · `SAFETY`), translated into document kinds by
   *  `readinessInputsFor`; a code outside that table names no paper and is dropped. */
  operatorCertReq?: string | null;
  /** The raw equipment-year requirement: a min year like 2020, or an age. */
  reqMinYear?: number | null;
  /** Admin-defined attachment ids the request item asked for (`attachment_ids`). */
  attachmentIds?: string[] | null;
  /** Renter free-text attachments not in the admin list (`custom_attachments`). */
  customAttachments?: string[] | null;
}

/** The four photo slots the renter can be shown, in the order he reads them (§6.6). Which of them
 *  actually render is `equipmentDocGroups`' judgement: `front` and `plate` are required of every
 *  lessor, `meter` and `side` appear only when uploaded. */
export const PHOTO_SLOTS = ["front", "plate", "meter", "side"] as const;
export type PhotoSlot = (typeof PHOTO_SLOTS)[number];

/**
 * Which of the four slots a raw `photoKeys[].slot` belongs to, or null when it is none of them.
 *
 * **The wire vocabulary is not the renter's.** The backend stores exactly four literals —
 * `front` · `serial` · `equipment` · `operating_hours` (`validators/equipment.schema.ts:52`) — plus
 * an `OTHER` a legacy bare-string entry is wrapped as, and a `slot` that can be `null` outright. So
 * `serial` is the plate shot, `operating_hours` is the meter shot, and `equipment` — the general shot
 * — is the one the spec calls "side". Matching the spec's words against the wire literally would leave
 * the fourth row permanently empty for every machine on the platform.
 *
 * Synonyms are folded rather than enumerated so a differently-spelled projection still lands in a row;
 * anything unrecognised is simply not one of the four, never a fifth row.
 */
export function photoSlotOf(slot: string): PhotoSlot | null {
  const t = norm(slot);
  if (/front/.test(t)) return "front";
  if (/serial|plate|vin|chassis/.test(t)) return "plate";
  if (/operating_hours|hours|meter|odo|clock/.test(t)) return "meter";
  if (/equipment|side|left|right|rear|back/.test(t)) return "side";
  return null;
}

/**
 * Ownership / registration document types.
 *
 * **These REACH the renter on THIS surface.** `rentee.service.ts` strips `istimara` · `customs` ·
 * `customs_card` · `sale_contract` · `sales_contract` · `saso_registration` via
 * `RENTEE_HIDDEN_DOC_TYPES` — but only from the BID's projection (`offeredUnitsDetailFor`). The
 * product owner's ruling of 2026-08-10 is that ownership papers are renter-visible **in the map's
 * document section and nowhere else**, so `supplier-fleet.service` serves them unstripped with usable
 * urls and the bid keeps the behaviour it ships today. Everything in this file reads a `FleetMachine`,
 * i.e. the unstripped side. So a missing one here is the supplier's omission, not a redaction, and
 * `ownershipCell` reads it red.
 *
 * (`bid-readiness.ts` still excludes proof-of-ownership from its readiness SCORE. That exclusion is
 * about a band that would otherwise hold every supplier short; it is not a statement that the renter
 * cannot see the document.)
 */
const OWNERSHIP_TYPES = new Set([
  "istimara",
  "istimarah",
  "registration",
  "customs",
  "customs_card",
  "sale_contract",
  "sales_contract",
  "saso_registration",
  "ownership",
  "proof_of_ownership",
  "title_deed",
  "combined",
]);

/**
 * Operator-level documents.
 *
 * **The vocabulary, and what it is based on.** The backend's per-item `documents[].type` enum is
 * recorded in `docs/implementation-plans/web-spec1/web-handoff.md:16`, whose operator tail is exactly
 * `operator_tuv · operating_license · operator_spsp · operator_id · operator_insurance`; `ChatDock`'s
 * wire-type → renter's-word table (`ChatDock.tsx:497-502`) carries those same five plus the
 * `operator_license` spelling. The off-platform submission vocabulary in `link-bids.ts:60` /
 * `bid-quality.ts:22` adds `operator_saso` and `operator_other` — a **different** namespace (a shared
 * link's uploads, not a fleet machine's `documentKeys`), so those are folded in defensively rather
 * than treated as the source of the row set.
 *
 * Note **`operating_license` carries no `operator_` prefix**, so a prefix test alone files the
 * operator's own licence under the equipment. Both halves of the test are load-bearing.
 *
 * **Both spellings of `operating_licence` are listed**, and the British one is not decoration. It is
 * the only value in this vocabulary that fails *both* halves of `isOperatorDoc` — `operating_licence`
 * does not start with `operator`, and a set missing it does not catch it — so it fell through into the
 * **Documents** group carrying a real `downloadUrl`, a live checkbox, a view control and a place in
 * `docDownloadBatch`. That was the one path by which an operator paper could ever be openable or
 * tickable, against the owner's ruling that this family is status-only and inert (2026-08-08).
 * `operatorCertCode` below already folds the spelling, so the file always expected the value to exist.
 */
const OPERATOR_TYPES = new Set([
  "operating_license",
  "operating_licence",
  "operator_license",
  "operator_licence",
]);

/** Equipment SAFETY certificates. Deliberately an allow-list: `spec_sheet` / `other` / `unclassified`
 *  are real wire types, and labelling one of them "equipment safety certificate" would tell the renter
 *  a safety paper is on file when a spec sheet is. */
const EQUIPMENT_CERT_TYPES = new Set([
  "tuv",
  "tüv",
  "spsp",
  "saso",
  "saso_technical_inspection",
  "saso_technical",
  "aramco",
  "insurance",
]);

const isOwnershipDoc = (d: OfferedUnitDoc): boolean => OWNERSHIP_TYPES.has(norm(d.type));
const isOperatorDoc = (d: OfferedUnitDoc): boolean => {
  const t = norm(d.type);
  return t.startsWith("operator") || OPERATOR_TYPES.has(t);
};
const isEquipmentCertDoc = (d: OfferedUnitDoc): boolean => !isOperatorDoc(d) && EQUIPMENT_CERT_TYPES.has(norm(d.type));

/**
 * An operator paper's **row code**.
 *
 * The scorer now hands over operator **document kinds** (`operator_tuv` · `operator_spsp` ·
 * `operating_license` — the app's table, `bid-readiness.ts`), so this only has to turn a kind into the
 * key `OPERATOR_CERT_ROW_LABEL` is written against. `canonicalCertCode` does most of it by stripping
 * the `operator_` prefix (`operator_tuv` → `tuv`), but it sends the spellings of one licence to
 * different codes — `operating_license` stays whole while `operator_license` / `operator_licence` lose
 * their prefix and become `license` / `licence`. Left alone that renders the operator's licence as
 * several rows for one paper, so the family is folded here, on top of the shared normaliser rather than
 * instead of it. (With the ask now translated upstream, the fold is defensive: it also catches a paper
 * the MACHINE happens to carry under one of the other spellings.)
 */
function operatorCertCode(type: string): string {
  const c = canonicalCertCode(type);
  if (c === "license" || c === "licence" || c === "operating_licence") return "operating_license";
  return c;
}

/** Present photo slots, deduped — the numerator of "N of 4 uploaded". */
export function presentPhotoSlots(machine: Pick<FleetMachine, "photoKeys">): PhotoSlot[] {
  const seen = new Set<PhotoSlot>();
  for (const p of machine.photoKeys) {
    const slot = photoSlotOf(p.slot);
    if (slot) seen.add(slot);
  }
  return PHOTO_SLOTS.filter((s) => seen.has(s));
}

/**
 * The six cells of §6.5, in the order the spec lists them.
 *
 * **It answers "does this machine fit my request", not "what is this machine"** — so nothing merely
 * descriptive (type, size, fuel, serial, load capacity) appears here. Those belong on the card.
 */
export function matchGrid(machine: FleetMachine, request: MatchRequest): MatchCell[] {
  const asks = readinessInputsFor(request);
  const readiness = computeUnitReadiness(machine, asks.equipCerts, asks.operatorCerts, asks.minYear);
  return [
    yearMakeCell(machine, readiness),
    attachmentsCell(request),
    photosCell(machine),
    ownershipCell(machine),
    certCell("equipment_cert", { en: "Equipment certificate", ar: "شهادة المعدّة" }, readiness.equipmentCerts),
    certCell("operator_cert", { en: "Operator certificates", ar: "شهادات المشغّل" }, readiness.operatorCerts),
  ];
}

/**
 * Year & manufacturer. The **requirement** drives the colour, the machine drives the finding.
 *
 * `computeUnitReadiness` has already decided whether the raw `reqMinYear` reads as a year at all (it
 * can also be an age), and exposes the answer as `reqMinYear` — non-null only when it does. Re-deriving
 * that here is exactly the second scorer this file refuses to be.
 */
function yearMakeCell(machine: FleetMachine, readiness: UnitReadiness): MatchCell {
  const label: Bilingual = { en: "Year & manufacturer", ar: "سنة الصنع والصانع" };
  const make = machine.manufacturer?.trim() || null;
  const year = machine.year;
  const req = readiness.reqMinYear;
  const makeSuffix: Bilingual = make ? { en: ` · ${make}`, ar: ` · ${make}` } : { en: "", ar: "" };

  if (req == null) {
    // No year was asked for, so nothing here can fail. The finding still states what the machine is,
    // because a grey cell that says only "not required" wastes the row.
    const shown = year != null ? `${year}` : null;
    return {
      key: "year_make",
      label,
      state: "grey",
      finding: shown
        ? { en: `${shown}${makeSuffix.en} · no year asked for`, ar: `${arDigits(shown)}${makeSuffix.ar} · لم تطلب سنة` }
        : { en: "not on the file · no year asked for", ar: "غير مذكورة على الملف · لم تطلب سنة" },
    };
  }
  if (year == null) {
    return {
      key: "year_make",
      label,
      state: "red",
      finding: {
        en: `year not on the file · you asked for ${req} or newer`,
        ar: `سنة الصنع غير مذكورة على الملف · طلبت ${arDigits(req)} أو أحدث`,
      },
    };
  }
  if (readiness.yearConflict) {
    return {
      key: "year_make",
      label,
      state: "red",
      finding: {
        en: `${year}${makeSuffix.en} · you asked for ${req} or newer`,
        ar: `${arDigits(year)}${makeSuffix.ar} · طلبت ${arDigits(req)} أو أحدث`,
      },
    };
  }
  return {
    key: "year_make",
    label,
    state: "green",
    finding: {
      en: `${year}${makeSuffix.en} · meets ${req} or newer`,
      ar: `${arDigits(year)}${makeSuffix.ar} · تفي بـ${arDigits(req)} أو أحدث`,
    },
  };
}

/**
 * Attachments. **Never red** — and that is a decision, not an oversight.
 *
 * A fleet row carries no attachment record: `FleetMachine`/`OfferedUnitDetail` has no attachments
 * field, and the platform's own bid-card term for attachments is hard-coded grey for the same reason
 * (`bids.ts:532`). Colouring this red would tell the renter the supplier failed a check the platform
 * never ran — it would show *more* than we know. When the request asked for attachments the cell says
 * so and says the file cannot answer; when it did not, it reads as not required.
 */
function attachmentsCell(request: MatchRequest): MatchCell {
  const label: Bilingual = { en: "Attachments", ar: "الملحقات" };
  const asked = [...(request.attachmentIds ?? []), ...(request.customAttachments ?? [])].filter(
    (x) => String(x ?? "").trim() !== "",
  ).length;
  if (asked === 0) {
    return { key: "attachments", label, state: "grey", finding: { en: "none asked for", ar: "لم تطلب ملحقات" } };
  }
  return {
    key: "attachments",
    label,
    state: "grey",
    finding: {
      en: `${asked} asked for · not recorded on the machine's file`,
      ar: `طلبت ${arDigits(asked)} · غير مسجّلة على ملف المعدّة`,
    },
  };
}

/**
 * Equipment photos — the one cell whose finding is a fraction, and the spec's own example ("3 of 4
 * uploaded").
 *
 * **Scored on the REQUIRED slots only — `front` + plate. Owner's ruling, 2026-08-08.**
 *
 * It used to demand all four. Once the documents group started requiring only the two slots the lessor
 * is actually held to (`REQUIRED_PHOTO_SLOTS`, mirroring `bid_readiness.dart`), the two surfaces
 * contradicted each other on one screen: a machine with front + plate and no meter shot read "nothing
 * outstanding" in the documents tab and **red, "2 of 4 uploaded"** in this cell. The owner ruled that
 * the cell follows the group, so the grid stops failing a machine on shots nobody requires — which is
 * the rule every other cell already obeys: *a cell nobody asked about cannot fail*.
 *
 * The fraction is therefore over the **required** slots, not over `PHOTO_SLOTS`. A renter who wants to
 * know whether the optional shots exist reads the group, where they appear when they are uploaded.
 */
function photosCell(machine: FleetMachine): MatchCell {
  const present = new Set<PhotoSlot>(presentPhotoSlots(machine));
  const have = [...REQUIRED_PHOTO_SLOTS].filter((s) => present.has(s)).length;
  const total = REQUIRED_PHOTO_SLOTS.size;
  return {
    key: "photos",
    label: { en: "Equipment photos", ar: "صور المعدّة" },
    state: have === total ? "green" : "red",
    finding: {
      en: `${have} of ${total} uploaded`,
      ar: `${arDigits(have)} من ${arDigits(total)} مرفوعة`,
    },
  };
}

/**
 * Proof of ownership / registration. Green when held, **red when not**.
 *
 * Corrected 2026-08-08. An earlier revision made this grey, reasoning that the renter's projection
 * strips ownership papers (`RENTEE_HIDDEN_DOC_TYPES`) so an absence would be the platform's redaction
 * rather than the supplier's omission. **That filter does not apply here.** It still guards the BID's
 * projection, but the map's fleet rows this cell reads are served unstripped on purpose (2026-08-10 —
 * see `OWNERSHIP_TYPES` above). So an absent ownership paper is a real gap the supplier can close,
 * which is exactly what red is for, and the documents tab can request it.
 *
 * (`bid-readiness.ts` still excludes proof-of-ownership from its SCORE — that is a different question.
 * A band that counted a redacted paper would hold every supplier permanently short; this cell states a
 * fact about one machine and can be acted on.)
 */
function ownershipCell(machine: FleetMachine): MatchCell {
  const held = machine.documentKeys.filter(isOwnershipDoc);
  return {
    key: "ownership",
    label: { en: "Proof of ownership", ar: "إثبات الملكية" },
    state: held.length > 0 ? "green" : "red",
    finding:
      held.length > 0
        ? { en: "on the machine's file", ar: "على ملف المعدّة" }
        : { en: "not on the file — you can ask for it", ar: "غير موجود على الملف — يمكنك طلبه" },
  };
}

/**
 * A cert cell — equipment or operator. Grey when the request asked for none: an unrequested cert is
 * not a gap, and colouring it would invent an acceptance criterion the renter never set.
 */
function certCell(
  key: Extract<MatchCellKey, "equipment_cert" | "operator_cert">,
  label: Bilingual,
  certs: { labelEn: string; labelAr: string; present: boolean }[],
): MatchCell {
  if (certs.length === 0) {
    return { key, label, state: "grey", finding: { en: "none asked for", ar: "لم تطلب شهادات" } };
  }
  const missing = certs.filter((c) => !c.present);
  if (missing.length === 0) {
    return {
      key,
      label,
      state: "green",
      finding: {
        en: `${certs.map((c) => c.labelEn).join(" · ")} — on the machine's file`,
        ar: `${certs.map((c) => c.labelAr).join(" · ")} — على ملف المعدّة`,
      },
    };
  }
  return {
    key,
    label,
    state: "red",
    finding: {
      en: `${missing.map((c) => c.labelEn).join(" · ")} — not on the file`,
      ar: `${missing.map((c) => c.labelAr).join(" · ")} — غير موجودة على الملف`,
    },
  };
}

/**
 * **V5** — the card's certificate chips (§6.4, AC-11): *"certificate chips (TÜV, SPSP…) or «لا شهادات
 * على المعدّة»"*.
 *
 * **The certificates the MACHINE holds, not the ones the request asked for.** `computeUnitReadiness`
 * reports `equipmentCerts` scored against the request, so on a request that asks for none it reports
 * none — and the card would then print «لا شهادات على المعدّة» over a machine carrying a TÜV. The chip
 * row is descriptive (it belongs to the card, not to the match grid), so it reads the machine's own
 * `documentKeys`.
 *
 * It reuses `isEquipmentCertDoc` — the same allow-list the documents tab groups by — rather than a
 * second opinion about which doc types are certificates. That list is deliberately an allow-list:
 * `spec_sheet` / `other` / `unclassified` are real wire types, and a chip reading "SPEC_SHEET" beside
 * TÜV would tell the renter a safety paper is on file when a spec sheet is.
 *
 * Deduped by canonical code and returned in the machine's own document order, so two uploads of one
 * certificate produce one chip.
 */
export function certificateChips(machine: Pick<FleetMachine, "documentKeys">): Bilingual[] {
  const seen = new Set<string>();
  const out: Bilingual[] = [];
  for (const d of machine.documentKeys) {
    if (!isEquipmentCertDoc(d)) continue;
    const code = canonicalCertCode(d.type);
    if (seen.has(code)) continue;
    seen.add(code);
    out.push(CERT_CHIP_LABEL[code] ?? { en: code.toUpperCase(), ar: code.toUpperCase() });
  }
  return out;
}

/** Chip copy. Certificate names are proper nouns and stay Latin in both locales; only the two that
 *  have an Arabic form carry one. */
const CERT_CHIP_LABEL: Record<string, Bilingual> = {
  tuv: { en: "TÜV", ar: "TÜV" },
  spsp: { en: "SPSP", ar: "SPSP" },
  saso: { en: "SASO", ar: "SASO" },
  aramco: { en: "Aramco", ar: "أرامكو" },
  insurance: { en: "Insurance", ar: "تأمين" },
};

/** The hero photo (§6.5.1) — the front shot when there is one, else the first photo the machine holds.
 *  Null when it holds none, which the component renders as a placeholder rather than a broken image. */
export function heroPhotoUrl(machine: Pick<FleetMachine, "photoKeys">): string | null {
  const front = machine.photoKeys.find((p) => photoSlotOf(p.slot) === "front" && p.url);
  return front?.url ?? machine.photoKeys.find((p) => p.url)?.url ?? null;
}

/**
 * **«قريب · متوسط · بعيد»** — the word the detail's availability line puts after the kilometres.
 *
 * The prototype's own helper and its own thresholds (`distBand`, decoded line 340): ≤ 30 km near,
 * ≤ 120 km mid, past that far. Ported rather than invented, and deliberately not derived from
 * `DISTANCE_BANDS_KM` — those are the LIST's filter bands (≤50 · ≤100 · ≤200), a different question
 * asked for a different reason, and folding the two together would make a filter chip and a sentence
 * about one machine move as one.
 *
 * **Label only, never colour.** The prototype says so on the same line, and on this surface it is a
 * rule: colour here means availability and nothing else (AC-18, AC-19).
 *
 * **A machine with no distance gets no word.** An unknown distance is not a far one — the same rule
 * `equipmentListView`'s bands hold — so this answers `null` and the caller renders neither.
 */
export function distanceBandLabel(distanceKm: number | null | undefined): Bilingual | null {
  if (typeof distanceKm !== "number" || !Number.isFinite(distanceKm)) return null;
  if (distanceKm <= 30) return { en: "near", ar: "قريب" };
  if (distanceKm <= 120) return { en: "mid-range", ar: "متوسط" };
  return { en: "far", ar: "بعيد" };
}

/**
 * The company header's initials tile — **up to two letters, from the first two words of the name**.
 *
 * The prototype's header carries one (`s.initials`) and ours had nothing in its place. It is not
 * decoration: this panel opens over the machine panel, and a 40 px block of the firm's own letters is
 * what tells the renter at a glance that the surface changed subject, before he has read the name
 * beside it.
 *
 * Deliberately dumb. No transliteration, no honorific stripping, no company-suffix table — «شركة
 * الراجحي» yields «شا» and that is correct, because whatever the tile shows must be derivable from
 * the name printed next to it or it reads as a different firm's mark. Empty in, empty out; the
 * component renders no tile rather than an empty box.
 */
export function companyInitials(name: string | null | undefined): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((w) => [...w][0] ?? "").join("").toUpperCase();
}

/* ───────────────────────────── V8 — equipment documents ───────────────────────────── */

/**
 * **Presence only** (§6.6, AC-39). `documentKeys` entries carry `verifyStatus` and `expiryDate` and
 * this surface renders neither: a machine's paper is either there or it isn't, and a verification badge
 * would invite the renter to judge a supplier on a state the platform sets, not one the supplier
 * controls. The fields exist on the wire; nothing below reads them.
 */
/**
 * **present** = required and held · **missing** = required and absent (the only state that can be red,
 * counted or asked for) · **on_file** = held but nobody required it, so it is shown and openable with
 * **no verdict attached**.
 *
 * There is no "absent and unrequired": that row is not rendered at all. See {@link equipmentDocGroups}.
 */
export type PresenceStatus = "present" | "on_file" | "missing";

/**
 * One file behind a document row.
 *
 * **A row can hold several.** A lessor may file an istimara *and* a customs card under one ownership
 * heading, or two TÜV uploads under one certificate; the row is still one row, and every file it holds
 * is reachable. Before this existed the row exposed `held.find((d) => d.url)?.url` — the first url and
 * no other — so the second and third papers a lessor had actually uploaded were unreachable from the
 * renter's panel.
 *
 * (The operator's rows are not one of these. They carry no files at all — see
 * {@link operatorStatusRows} — so the multi-file treatment never reaches them.)
 */
export interface DocFile {
  /** The wire type this file was uploaded as (`operator_tuv`, `istimara`, `front` …). */
  type: string;
  /** The renter's word for that type, so a control never reads `operating_license` at him. */
  label: Bilingual;
  url: string;
}

export interface DocRow {
  key: string;
  label: Bilingual;
  status: PresenceStatus;
  /** The presence sentence — "uploaded" / "not uploaded" for photos, "on the machine's file" /
   *  "no document yet" for documents, each with a "· not required" tail on an unrequired row. Never a
   *  verification word. */
  statusLine: Bilingual;
  /** Thumbnail source: a photo's own image, or null for a paper (the row draws a document glyph). */
  thumbUrl: string | null;
  /** `files[0]`, kept so the machine's papers, its photos and the firm's papers still share one shape —
   *  {@link docRowActions} is typed across all three. **`files` is the whole truth**; this is the head
   *  of it, and null when the row holds nothing. */
  downloadUrl: string | null;
  /** **Every** file behind this row, in the machine's own order. */
  files: DocFile[];
  /** The wire type(s) this row stands for — what a batch request names when the row is ticked. */
  docTypes: string[];
  /**
   * May the renter tick this row and ask for it? **Exactly when the paper is not there** — the whole
   * rule in one sentence: *you can only ask for what is not there* (owner's ruling, 2026-08-08).
   *
   * Two halves, and both now say the same thing. A paper **nobody required** has nothing to chase: the
   * renter is looking straight at it, and an ask naming it could only be answered "it is already on the
   * file". A paper that **is** required and **is** held is the same sentence: the lessor can see it on
   * his own file, so the ask reads as noise. An earlier revision left a required-and-held row tickable,
   * reasoning that a renter might want a legible re-scan; the owner withdrew that — the batch ask exists
   * to chase an *absent* paper, and a re-scan is a conversation, not a document request.
   *
   * So this is `status === "missing"` and nothing else, and `batchDocumentRequest` enforces it on the
   * way out, so the checkbox and the ask cannot disagree.
   *
   * **It is no longer the same question as "may this row be ticked"** (owner's UI design, 2026-08-08).
   * A **held** row is tickable too — for a different batch, downloading. `requestable` is now one half
   * of {@link docRowMode}, which is what the checkbox column reads; the rule above is unchanged by that
   * and a held paper is still never requestable.
   *
   * **One family is `false` in BOTH states — the operator's certificates** (owner, 2026-08-08, narrowing
   * AC-75). *"Operator docs cannot be viewed or requested and are not part of docs — they are just a view
   * of what the supplier has."* An absent operator certificate is therefore **not** a gap the renter may
   * put in an ask, which is the one place the sentence above bends: *you can only ask for what is not
   * there* still holds, but this family is outside the asking machinery altogether. See
   * {@link operatorStatusRows} for why — nothing validates an operator document on upload, so presence is
   * the only claim the platform can stand behind, and a status is all this group states.
   */
  requestable: boolean;
}

export type DocGroupKey = "photos" | "documents" | "operator";

export interface DocGroup {
  key: DocGroupKey;
  label: Bilingual;
  rows: DocRow[];
  /**
   * **Rows needing action, never a total** (§6.1, AC-42). Zero means nothing is outstanding.
   *
   * **`null` means this group makes no attention claim at all**, and exactly one does: the operator's
   * (owner, 2026-08-08). The count's whole sentence is *"N rows here need action from you"* — and there
   * is no action on that group: no tick, no ask, no file. A number would have to lie in one direction or
   * the other, and both lies are worse than silence: counting the absent certificates promises an act the
   * renter cannot perform, while reporting zero prints «لا ينقص شيء» in green over rows that are red.
   * The group keeps its heading and its green/red rows, which is what the owner asked it to keep.
   *
   * It is `null` rather than `0` so every reader has to decide what to do with it —
   * {@link DocRowList} renders no pill, and the tab badge adds nothing.
   */
  attention: number | null;
}

/** Rows needing action. The one definition, used by both document surfaces. */
export function attentionCount(rows: { status: PresenceStatus | CompanyDocStatus }[]): number {
  return rows.filter((r) => r.status === "missing").length;
}

/* ─────────────────── V15 — every document is openable (004a §7, RM3-AC-69) ─────────────────── */

/**
 * What a document row lets the renter do with the file behind it.
 *
 * **View, and nothing else** (owner's UI design, 2026-08-08). The row used to expose a **view /
 * download** pair; the per-row download is withdrawn because **downloading is now the batch action**
 * (see {@link docDownloadBatch}). A tick on a held row means "save this", and the footer saves the
 * selection; a second, per-row way to do the same thing would be two controls for one act, one of which
 * the renter has to learn is redundant.
 *
 * **View survives, and that is the point of keeping it** — a renter must still be able to *look* at one
 * paper without selecting anything. Looking is the common act on this surface; making it go through a
 * selection would make the common act the effortful one.
 *
 * This narrows RM3-AC-69, which required both controls on every row that carries a url. The AC is
 * corrected in `004a` rather than left contradicting the code.
 */
export type DocActionKind = "view";

export interface DocAction {
  kind: DocActionKind;
  /** The file's presigned url. */
  href: string;
  /** The row's primary act. Exactly one action carries it, and it is always the FIRST file's view. */
  primary: boolean;
  /** Which file of the row this control opens. Null on a row that carries only a bare `downloadUrl`
   *  (the firm's papers), where there is exactly one file and nothing to disambiguate. When a row holds
   *  several, the component titles each control with this label so two identical glyphs are not two
   *  identical controls. */
  file: DocFile | null;
}

/**
 * The controls one document row exposes (AC-69, as narrowed 2026-08-08).
 *
 * **A row with no file exposes none** — never a dead control. That absence is also the honest signal
 * that a paper is missing, which is the one row the renter can ask for.
 *
 * **A row holding several files exposes one control for each of them.** The alternative — a row per
 * file — was rejected: it would put the *files* in the list where the list's job is to show *slots*, so
 * a lessor who uploaded nothing would produce no rows and the renter would see a short, clean list
 * instead of a gap. Keeping one row per slot preserves that, keeps the attention count meaning "rows
 * needing action", and keeps selection meaning "the slot I am acting on" rather than "the copy I want".
 * The files are outputs of the row, not rows.
 *
 * **It is also the one definition of "this row has a reachable file"** — {@link docRowMode} asks it
 * rather than re-testing `downloadUrl`/`files`, so a row can never be tickable-for-download while
 * exposing nothing to open.
 *
 * Deliberately shape-typed rather than taking `DocRow | CompanyDocRow`, because it must serve all three
 * families this surface names — the machine's papers, its photos, and the firm's papers — and they
 * agree on exactly one field.
 */
export function docRowActions(row: { downloadUrl: string | null; files?: readonly DocFile[] }): DocAction[] {
  const files = (row.files ?? []).filter((f) => f.url);
  if (files.length > 0) {
    // Exactly one action carries `primary`, and it is the FIRST file's view — the invariant holds
    // however many files the row turns out to hold.
    return files.map((file, i) => ({ kind: "view" as const, href: file.url, primary: i === 0, file }));
  }
  const href = row.downloadUrl;
  if (!href) return [];
  return [{ kind: "view", href, primary: true, file: null }];
}

/* ───────── V16 — one checkbox column, two mutually exclusive modes (owner, 2026-08-08) ───────── */

/**
 * What a tick currently *means*.
 *
 * Selection stopped being one thing on 2026-08-08. There is **one checkbox column**, and its meaning is
 * set by the first tick: tick a **held** row and you are downloading, tick a **missing** row and you are
 * requesting. The other kind dims and stops responding, so a selection can never mix — which is what
 * lets one column feed two different batches without ever composing a payload that is half an ask and
 * half a save.
 *
 * **The mode is inferred, never stored.** It is a pure function of the rows and the ticked set
 * ({@link selectionModeOf}), so there is no second piece of state to keep in step with the selection and
 * no way for a component to believe it is in one mode while holding the other's keys. Clearing the last
 * tick returns to `null` — neutral — by construction rather than by a reset the caller has to remember.
 */
export type SelectionMode = "download" | "request";

/**
 * Which batch this row's tick would feed, or `null` for a row no batch can answer.
 *
 * The three cases, and the rule under all of them is the one this surface already had —
 * *a tick must be answerable by the batch underneath it*:
 *
 * - **`"request"`** — the paper is not there (`requestable`, which is `status === "missing"` and nothing
 *   else). *You can only ask for what is not there* survives untouched.
 * - **`"download"`** — the paper is there **and reachable**, i.e. {@link docRowActions} finds a url.
 * - **`null`** — neither. A **held row with no url** is the one that matters: the projection carried the
 *   paper but not its link. Nothing can be saved and nothing can be asked, so it is untickable in
 *   **every** mode, exactly as it is today.
 *
 * **The operator's certificates are `null` in both states** (owner, 2026-08-08, narrowing AC-75). They
 * carry no url, so the held ones were already here; the absent ones join them now that they are not
 * `requestable` either. That is the whole of "no checkbox, ever" — it falls out of the two fields the
 * row carries rather than needing a third one this function could forget to read.
 */
export function docRowMode(row: {
  downloadUrl: string | null;
  files?: readonly DocFile[];
  requestable?: boolean;
}): SelectionMode | null {
  // A missing row has no files by construction, so the order is not a tie-break — it is a statement that
  // absence is the stronger fact.
  if (row.requestable) return "request";
  return docRowActions(row).length > 0 ? "download" : null;
}

/**
 * May this row be ticked **right now**?
 *
 * The single seam the components read (`DocRowView.selectable`), extended to take the mode rather than
 * grown a parallel mechanism. At neutral (`mode === null`) every row with a mode of its own is tickable;
 * once a mode holds, only its own kind is.
 */
export function docRowSelectable(
  row: { downloadUrl: string | null; files?: readonly DocFile[]; requestable?: boolean },
  mode: SelectionMode | null,
): boolean {
  const own = docRowMode(row);
  return own !== null && (mode === null || mode === own);
}

/**
 * The mode a ticked set is in — **the first tick's kind**, and `null` when nothing is ticked.
 *
 * Reading it off the set rather than storing "what the renter clicked first" is deliberate and is what
 * makes the neutral return free: a set that can never mix has exactly one kind in it, so *any* ticked
 * row answers the question and list order is a stable way to pick one. Ticks that name no row, or rows
 * that lost their url since being ticked, are skipped rather than trusted.
 */
export function selectionModeOf(
  rows: readonly { key: string; downloadUrl: string | null; files?: readonly DocFile[]; requestable?: boolean }[],
  selected: ReadonlySet<string>,
): SelectionMode | null {
  for (const row of rows) {
    if (!selected.has(row.key)) continue;
    const mode = docRowMode(row);
    if (mode) return mode;
  }
  return null;
}

/** One file a download batch will save: the row it came from, its localisable name, and its url. */
export interface DocDownloadTarget {
  key: string;
  label: Bilingual;
  url: string;
}

/**
 * Exactly what a «تنزيل» run will fetch — **the ticked rows that are in download mode, expanded to every
 * file behind them**, in the list's own order.
 *
 * Filtering here rather than trusting the selection set is what makes the control honest: a row that
 * lost its url between the tick and the click simply is not counted, so the button's number and the
 * files that land are the same number. It is the download side's `batchDocumentRequest` — one rule read
 * twice, never two rules that can drift.
 *
 * A row holding several files contributes several targets, each named after **its own** file and
 * numbered, because a lessor can file two papers of the same type and a batch of identically-named
 * files is a batch the renter cannot tell apart on disk.
 */
export function docDownloadBatch(
  rows: readonly { key: string; label: Bilingual; downloadUrl: string | null; files?: readonly DocFile[]; requestable?: boolean }[],
  selected: ReadonlySet<string>,
): DocDownloadTarget[] {
  const out: DocDownloadTarget[] = [];
  for (const row of rows) {
    if (!selected.has(row.key) || docRowMode(row) !== "download") continue;
    const actions = docRowActions(row);
    const multi = actions.length > 1;
    actions.forEach((a, i) => {
      const nth = i + 1;
      out.push({
        key: row.key,
        label:
          multi && a.file
            ? { en: `${a.file.label.en} ${nth}`, ar: `${a.file.label.ar} ${arDigits(nth)}` }
            : row.label,
        url: a.href,
      });
    });
  }
  return out;
}

const PHOTO_LABEL: Record<PhotoSlot, Bilingual> = {
  front: { en: "Front", ar: "أمامية" },
  plate: { en: "Plate / serial", ar: "اللوحة والرقم التسلسلي" },
  meter: { en: "Hour meter", ar: "العدّاد" },
  side: { en: "Side", ar: "جانبية" },
};

/**
 * The photo slots the lessor is actually held to.
 *
 * **Mirrors `bid_readiness.dart`'s `kMandatoryPhotoSlots = ['front', 'serial']`** — the *supplier's own*
 * scorer, which is what makes the renter's panel and the lessor's readiness card agree about the same
 * machine. The wire's `serial` is this file's `plate` (`photoSlotOf`). `meter` and `side` are mandatory
 * nowhere, so they follow the not-required rule: shown when uploaded, and absent they are simply not a
 * row. This repo's `computeUnitReadiness` derives `photosPresent` from the same two slots.
 */
const REQUIRED_PHOTO_SLOTS = new Set<PhotoSlot>(["front", "plate"]);

const PRESENT_PHOTO: Bilingual = { en: "uploaded", ar: "مرفوعة" };
const ABSENT_PHOTO: Bilingual = { en: "not uploaded", ar: "غير مرفوعة" };
const EXTRA_PHOTO: Bilingual = { en: "uploaded · not required", ar: "مرفوعة · غير مطلوبة" };
const PRESENT_DOC: Bilingual = { en: "on the machine's file", ar: "على ملف المعدّة" };
const ABSENT_DOC: Bilingual = { en: "no document yet", ar: "لا يوجد مستند بعد" };
const EXTRA_DOC: Bilingual = { en: "on the machine's file · not required", ar: "على ملف المعدّة · غير مطلوب" };

/** Renter-facing words for a wire doc type — the same wording `ChatDock`'s `DOC_TYPE_LABELS` uses, so
 *  one paper reads the same in the panel and on the request card the renter raises from it. */
const DOC_TYPE_LABEL: Record<string, Bilingual> = {
  istimara: { en: "Registration (Istimara)", ar: "الاستمارة" },
  istimarah: { en: "Registration (Istimara)", ar: "الاستمارة" },
  registration: { en: "Registration", ar: "التسجيل" },
  customs: { en: "Customs card", ar: "البطاقة الجمركية" },
  customs_card: { en: "Customs card", ar: "البطاقة الجمركية" },
  sale_contract: { en: "Sale contract", ar: "عقد البيع" },
  sales_contract: { en: "Sale contract", ar: "عقد البيع" },
  saso_registration: { en: "SASO registration", ar: "تسجيل ساسو" },
  tuv: { en: "TÜV certificate", ar: "شهادة TÜV" },
  spsp: { en: "SPSP certificate", ar: "شهادة SPSP" },
  saso: { en: "SASO certificate", ar: "شهادة ساسو" },
  aramco: { en: "Aramco certificate", ar: "شهادة أرامكو" },
  insurance: { en: "Insurance", ar: "التأمين" },
  operating_license: { en: "Operator licence", ar: "رخصة المشغّل" },
  operator_license: { en: "Operator licence", ar: "رخصة المشغّل" },
  operator_licence: { en: "Operator licence", ar: "رخصة المشغّل" },
  operator_tuv: { en: "Operator TÜV", ar: "شهادة TÜV للمشغّل" },
  operator_spsp: { en: "Operator SPSP", ar: "شهادة SPSP للمشغّل" },
  operator_saso: { en: "Operator SASO", ar: "شهادة ساسو للمشغّل" },
  operator_id: { en: "Operator ID", ar: "هوية المشغّل" },
  operator_insurance: { en: "Operator insurance", ar: "تأمين المشغّل" },
};

/** Humanise an unmapped wire type rather than shouting a database column at the renter — `ChatDock`'s
 *  fallback, and locale-independent for the same reason his is: we have no Arabic for a type we have
 *  never seen, and inventing one would be worse than the English. */
function docTypeLabel(type: string): Bilingual {
  const known = DOC_TYPE_LABEL[norm(type)];
  if (known) return known;
  const words = norm(type).replace(/_+/g, " ").trim();
  const text = words ? words.charAt(0).toUpperCase() + words.slice(1) : type;
  return { en: text, ar: text };
}

/** An equipment certificate's row heading, keyed by `canonicalCertCode`. */
const EQUIPMENT_CERT_ROW_LABEL: Record<string, Bilingual> = {
  tuv: { en: "TÜV certificate", ar: "شهادة TÜV" },
  spsp: { en: "SPSP certificate", ar: "شهادة SPSP" },
  saso: { en: "SASO certificate", ar: "شهادة ساسو" },
  aramco: { en: "Aramco certificate", ar: "شهادة أرامكو" },
  insurance: { en: "Equipment insurance", ar: "تأمين المعدّة" },
};

/** An operator paper's row heading, keyed by `operatorCertCode`. Wording follows `ChatDock`'s table so
 *  the row and the request card raised from it name the same paper the same way. */
const OPERATOR_CERT_ROW_LABEL: Record<string, Bilingual> = {
  operating_license: { en: "Operator licence", ar: "رخصة المشغّل" },
  tuv: { en: "Operator TÜV", ar: "شهادة TÜV للمشغّل" },
  spsp: { en: "Operator SPSP", ar: "شهادة SPSP للمشغّل" },
  saso: { en: "Operator SASO", ar: "شهادة ساسو للمشغّل" },
  id: { en: "Operator ID", ar: "هوية المشغّل" },
  insurance: { en: "Operator insurance", ar: "تأمين المشغّل" },
  other: { en: "Operator document", ar: "مستند المشغّل" },
};

/**
 * The wire type a **not-yet-uploaded** row asks for.
 *
 * **Deliberately coarse, and this is the reversible half of a thing this repo cannot verify.** An ask
 * is validated server-side against `EquipmentDocumentType.documentKey` and one unknown type fails the
 * whole request (`rentee-request.ts` — `assertKnownDocTypes`, and `canonicalDocType`'s note that an
 * unaliased name is "passed through untouched and refused by the backend if it is unknown"). The only
 * operator/equipment names *proven* to resolve into that catalogue are the ones `DOC_TYPE_ALIASES`
 * maps — `tuv → tuv_cert`, `spsp → spsp_cert`, `equipment_safety_certificate → safety_cert`,
 * `operator_safety_certificate → operator_license`, `istimara`. `operator_tuv` and friends are the
 * *upload* vocabulary (`web-handoff.md:16`); whether they are also catalogue keys cannot be checked
 * from this repo, and guessing wrong turns the renter's most common ask into a 400 he can do nothing
 * with.
 *
 * So the **rows** stay per-certificate — the renter sees exactly which paper is missing and opens
 * exactly the one that is there — while the outgoing type names the category. Swapping in precise keys
 * once someone confirms the catalogue is a one-line change to these two maps.
 *
 * ~~⚠️ **Known gap** — `documentAskSatisfied` matches an ask to a held paper by exact `canonicalDocType`
 * equality, and the operator category resolves to `operator_license` while a machine's own operator papers
 * are typed `operator_tuv` / `operating_license`, none of which canonicalise to it, so an operator document
 * ask reads *waiting* even after the lessor uploads.~~ **Out of this file's reach since 2026-08-08**: the
 * operator's certificates are a status and are never asked for from here (see {@link operatorStatusRows}),
 * so this surface emits no operator ask for that mismatch to strand. The gap is kept written down rather
 * than deleted because it is real for whoever *does* raise one — the fix is one alias
 * (`operating_license → operator_license`) or catalogue rows per operator cert, and it belongs with
 * whoever owns `DOC_TYPE_ALIASES`. `tuv` and `spsp` never had the problem: both sides fold to
 * `tuv_cert` / `spsp_cert`, which is why they are named precisely above.
 */
const EQUIPMENT_ASK_TYPE: Record<string, string> = { tuv: "tuv", spsp: "spsp" };
const equipmentAskType = (code: string): string => EQUIPMENT_ASK_TYPE[code] ?? "equipment_safety_certificate";

const filesOf = (docs: OfferedUnitDoc[]): DocFile[] =>
  docs.filter((d) => d.url).map((d) => ({ type: d.type, label: docTypeLabel(d.type), url: d.url as string }));

/** Held docs of one family, bucketed by row code, preserving the machine's own order. */
function heldByCode(docs: OfferedUnitDoc[], codeOf: (type: string) => string): Map<string, OfferedUnitDoc[]> {
  const out = new Map<string, OfferedUnitDoc[]>();
  for (const d of docs) {
    const code = codeOf(d.type);
    const bucket = out.get(code);
    if (bucket) bucket.push(d);
    else out.set(code, [d]);
  }
  return out;
}

/**
 * One certificate row — for a code the request asked for, or one the machine simply holds.
 *
 * The required/unrequired split is the whole of the platform rule: a required code renders whether it
 * is held or not, an unrequired one only when it is held, and only a required-and-absent row is ever
 * red, counted or askable.
 */
function certRow(args: {
  key: string;
  label: Bilingual;
  held: OfferedUnitDoc[];
  required: boolean;
  askType: string;
}): DocRow {
  const { key, label, held, required, askType } = args;
  const files = filesOf(held);
  const status: PresenceStatus = held.length === 0 ? "missing" : required ? "present" : "on_file";
  return {
    key,
    label,
    status,
    statusLine: status === "missing" ? ABSENT_DOC : status === "present" ? PRESENT_DOC : EXTRA_DOC,
    thumbUrl: null,
    downloadUrl: files[0]?.url ?? null,
    files,
    docTypes: held.length > 0 ? [...new Set(held.map((d) => d.type))] : [askType],
    // You can only ask for what is not there — held or unrequired, there is nothing to chase.
    requestable: status === "missing",
  };
}

/** The union of the codes the request asked for (first, in the request's order) and the codes the
 *  machine holds (after, in the machine's order). Deduped, so an asked-for cert the machine also holds
 *  is one row. */
function unionCodes(requested: string[], held: Map<string, OfferedUnitDoc[]>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const code of [...requested, ...held.keys()]) {
    if (code === "" || seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }
  return out;
}

/**
 * The operator's certificates as **a status, and only a status** (owner's ruling, 2026-08-08).
 *
 * These rows briefly rendered like the equipment's papers: a row per certificate with a view/download
 * pair for every file the lessor had filed. **The owner withdrew that.** They are shown the way the
 * bid-readiness card already shows them — *present or not, green or red, and nothing else.* No view, no
 * download, no file access.
 *
 * **And no ask either** — the ruling, narrowed the same day, in the owner's words: *"operator docs cannot
 * be viewed or requested and are not part of docs — they are just a view of what the supplier has."* The
 * rows had kept a checkbox on the missing ones and composed into the batch ask; that is withdrawn. This
 * group is **outside the document machinery**: no tick in any mode, no place in any batch, and no
 * attention count (see {@link DocGroup.attention}). It states what the lessor holds and stops there.
 *
 * **The reason is the same for both halves.** Nothing validates an operator document on upload. Handing
 * the renter a file to open presents an unchecked upload as if it were verified evidence, and this
 * surface exists to answer *can I trust this?* — so it must not imply a check that never happened.
 * **Presence is a fact the platform can stand behind; the contents are not.** A surface that cannot
 * vouch for the file is not a surface to act on, so the renter is given the fact and no controls.
 *
 * So the rows carry no `files`, no `downloadUrl` and `requestable: false`, which is what makes
 * `docRowActions` return nothing and `docRowMode` return `null` for them in **both** states — one
 * mechanism, not a third flag the component could forget to read. `docTypes` is empty for the same
 * reason: nothing composes an ask out of these rows, so there is no type to name.
 *
 * **Read from the scorer, never re-derived.** `computeUnitReadiness().operatorCerts` already carries
 * exactly this shape (`{code, labelEn, labelAr, present, url}`); this reads **`present` and ignores
 * `url`** rather than bucketing `documentKeys` a second time. That also settles the row set: the scorer
 * maps over the certs **this request asked for**, so an operator paper nobody asked about is not a row —
 * which is the required/not-required rule this file already obeys everywhere else, arrived at from the
 * other side. (It could not be otherwise now: with no verdict, no count and no file behind it, an
 * unrequested row would be a line of text with nothing to say and nothing to do.)
 *
 * A machine's own held operator papers are still recognised — `isOperatorDoc` keeps them out of the
 * equipment certs and out of the unclassified bucket, so a held `operator_tuv` cannot reappear as an
 * openable equipment row through the other door.
 */
function operatorStatusRows(certs: readonly { code: string; present: boolean }[]): DocRow[] {
  // The scorer translates the ASK into document kinds (and already dedupes them, so `CERTIFIED` and
  // `SAFETY_CERT` arrive as one `operating_license`); `operatorCertCode` folds the licence spellings on
  // top of that, so one paper is ONE row. When two asks do fold together, the row is present if ANY of
  // them was satisfied — the licence is on the file or it is not, and the spelling the renter happened
  // to type cannot make it two different papers with two different verdicts.
  const order: string[] = [];
  const present = new Map<string, boolean>();
  for (const cert of certs) {
    const code = operatorCertCode(cert.code);
    if (code === "") continue;
    if (!present.has(code)) order.push(code);
    present.set(code, (present.get(code) ?? false) || cert.present);
  }
  const rows: DocRow[] = [];
  for (const code of order) {
    const cert = { present: present.get(code) as boolean };
    rows.push({
      key: `doc:operator:${code}`,
      label: OPERATOR_CERT_ROW_LABEL[code] ?? docTypeLabel(code),
      status: cert.present ? "present" : "missing",
      statusLine: cert.present ? PRESENT_DOC : ABSENT_DOC,
      thumbUrl: null,
      // No url, ever — see above. Not "none happened to be signed": none is offered.
      downloadUrl: null,
      files: [],
      // Names no ask, because there is no ask. `batchDocumentRequest` would drop the row on
      // `requestable` alone; leaving a type here would be a payload waiting for a caller.
      docTypes: [],
      // Never requestable, held or absent (owner, 2026-08-08) — this family is not asked for at all.
      requestable: false,
    });
  }
  return rows;
}

/**
 * The document groups of §6.6 — **photos · documents · the operator's documents** — each with its own
 * attention count.
 *
 * **The platform's one rule, applied to every family alike** (owner, 2026-08-08):
 *
 * | | held | absent |
 * |---|---|---|
 * | **required** | shown, green, openable, **not requestable** | **red, "no document yet"**, counted, requestable |
 * | **not required** | shown, openable, no verdict, **not counted**, not requestable | **not rendered at all** |
 *
 * So the row set is `(what this request requires) ∪ (what this machine holds)`, and the requestable
 * column collapses to one sentence (owner, same day): **you can only ask for what is not there.**
 *
 * **The operator's group is the one exception, and it is a different kind of row** — a status, not a
 * document list: present or absent, no file access, **no tick, no ask and no attention count**. The table
 * above does not govern it at all; it is a statement of what the lessor holds, and the renter acts on
 * none of it. See {@link operatorStatusRows}.
 *
 * **Why the row set was fixed, and what survives of that.** The earlier note read: *"a row per uploaded
 * file would make the list shorter the worse the supplier's file is, which is backwards."* That
 * property is still load-bearing and still holds — **every required row renders whether it is held or
 * not**, so a lessor with an empty file produces the *longest*, reddest list, and the renter still sees
 * what is missing. What the rule removes is the other half of the old behaviour: inventing an absence
 * nobody asked about. A cert the renter never requested cannot fail, so it is not shown failing.
 *
 * This is the platform's existing rule rather than a new one, and the three surfaces it already governs
 * are why: `matchGrid` greys an unasked cell (*"a cell nobody asked about cannot fail"*),
 * `computeUnitReadiness` builds its cert list by mapping over the **request's** asks so an unrequested
 * cert is not a scored key at all, and mobile's `bid_readiness.dart` does the same — *"one key per
 * certificate this request actually asks for."*
 *
 * **What is required.** Two sources, both already in the codebase, neither of them invented here and
 * neither of them fetched: the certs *this request* asked for (`readinessInputsFor` →
 * `computeUnitReadiness`), and the papers the lessor is held to *regardless* of the request — mirroring
 * `bid_readiness.dart`, the supplier's own scorer: `kMandatoryPhotoSlots` (front + serial/plate) and
 * proof of ownership (`kReadinessPooKey` / `kPooDocTypes`).
 *
 * **Proof of ownership is required, and that is a chosen precedent.** `bid_readiness.dart` scores it as
 * one of two mandatory documents; `bid-readiness.ts` here excludes it from its fraction. This surface
 * follows the mobile scorer, because `ownershipCell` one tab away already reads an absent ownership
 * paper **red** — "not on the file — you can ask for it" — and a documents tab that hid the row would
 * leave the renter told to ask with nothing to ask with. (The web scorer's stated reason for excluding
 * it — that the renter's projection strips ownership papers — is true of the BID it scores and simply
 * does not describe this surface, which reads the unstripped fleet rows. See `ownershipCell`.)
 *
 * **A request with no operator needs no special case.** No operator asked for ⇒ no operator certs
 * requested ⇒ the scorer reports none ⇒ the group is empty and is not returned at all. Operator papers
 * the lessor happens to hold do not summon a row of their own: with the operator group reduced to a
 * status the renter never asked for, there is nothing such a row could say. The lessor is still not
 * marked down for a check nobody ran — an absent row is not a red one.
 */
export function equipmentDocGroups(machine: FleetMachine, request: MatchRequest): DocGroup[] {
  // The SAME derivation the match grid scores with — never a second reading of the request.
  const asks = readinessInputsFor(request);
  const readiness = computeUnitReadiness(machine, asks.equipCerts, asks.operatorCerts, asks.minYear);

  /* ── photos ── */
  const photoBySlot = new Map<PhotoSlot, { url: string | null; slot: string }[]>();
  for (const p of machine.photoKeys) {
    const slot = photoSlotOf(p.slot);
    if (!slot) continue;
    const bucket = photoBySlot.get(slot);
    if (bucket) bucket.push({ url: p.url, slot: p.slot });
    else photoBySlot.set(slot, [{ url: p.url, slot: p.slot }]);
  }
  const photoRows: DocRow[] = [];
  for (const slot of PHOTO_SLOTS) {
    const held = photoBySlot.get(slot) ?? [];
    const required = REQUIRED_PHOTO_SLOTS.has(slot);
    if (held.length === 0 && !required) continue; // not required and not there — no row at all
    const files: DocFile[] = held
      .filter((h) => h.url)
      .map((h) => ({ type: h.slot, label: PHOTO_LABEL[slot], url: h.url as string }));
    const status: PresenceStatus = held.length === 0 ? "missing" : required ? "present" : "on_file";
    photoRows.push({
      key: `photo:${slot}`,
      label: PHOTO_LABEL[slot],
      status,
      statusLine: status === "missing" ? ABSENT_PHOTO : status === "present" ? PRESENT_PHOTO : EXTRA_PHOTO,
      thumbUrl: files[0]?.url ?? null,
      downloadUrl: files[0]?.url ?? null,
      files,
      docTypes: [held[0]?.slot ?? slot],
      // A shot that is already uploaded is not a shot to ask for, whoever required it.
      requestable: status === "missing",
    });
  }

  /* ── the machine's papers ── */
  const ownershipHeld = machine.documentKeys.filter(isOwnershipDoc);
  const paperRows: DocRow[] = [
    certRow({
      key: "doc:ownership",
      label: { en: "Proof of ownership / registration", ar: "إثبات الملكية / التسجيل" },
      held: ownershipHeld,
      required: true, // platform-mandatory, per `bid_readiness.dart` — never request-driven
      askType: "istimara",
    }),
  ];

  const equipHeld = heldByCode(machine.documentKeys.filter(isEquipmentCertDoc), canonicalCertCode);
  const equipRequested = readiness.equipmentCerts.map((c) => c.code);
  const equipRequiredSet = new Set(equipRequested);
  for (const code of unionCodes(equipRequested, equipHeld)) {
    paperRows.push(
      certRow({
        key: `doc:equipment_cert:${code}`,
        label: EQUIPMENT_CERT_ROW_LABEL[code] ?? docTypeLabel(code),
        held: equipHeld.get(code) ?? [],
        required: equipRequiredSet.has(code),
        askType: equipmentAskType(code),
      }),
    );
  }

  // Papers the machine holds that belong to no named family — a spec sheet, an `other`. Nothing
  // requires them, so they can never be red or asked for; they are listed under **their own type's
  // name** so that "every document the machine holds is visible" costs nothing in honesty. (The
  // allow-list `isEquipmentCertDoc` exists so a spec sheet is never called a safety certificate. With
  // one row per type that objection is answered by the label itself.)
  const otherHeld = heldByCode(
    machine.documentKeys.filter((d) => !isOwnershipDoc(d) && !isEquipmentCertDoc(d) && !isOperatorDoc(d)),
    (t) => norm(t),
  );
  for (const [code, held] of otherHeld) {
    paperRows.push(
      certRow({ key: `doc:other:${code}`, label: docTypeLabel(code), held, required: false, askType: code }),
    );
  }

  /* ── the operator's documents — a STATUS, not a document list ── */
  const operatorRows: DocRow[] = operatorStatusRows(readiness.operatorCerts);

  return [
    { key: "photos" as const, label: { en: "Photos", ar: "الصور" }, rows: photoRows },
    { key: "documents" as const, label: { en: "Documents", ar: "المستندات" }, rows: paperRows },
    { key: "operator" as const, label: { en: "Operator's documents", ar: "مستندات المشغّل" }, rows: operatorRows },
  ]
    // A group with nothing to say is not a heading with an empty body — it is absent.
    .filter((g) => g.rows.length > 0)
    // **The operator's group makes no attention claim** (owner, 2026-08-08). Its rows are red or green
    // and that is the whole statement; a count would promise an act that no longer exists on them. See
    // `DocGroup.attention` for why `null` rather than `0`.
    .map((g) => ({ ...g, attention: g.key === "operator" ? null : attentionCount(g.rows) }));
}

/* ───────────────────────────── V9 — company documents ───────────────────────────── */

/**
 * **Company rows DO carry verification state and expiry** (§6.6, AC-40) — the deliberate asymmetry with
 * the equipment rows above. A company paper is checked and it does expire, so hiding that would strand
 * the renter with a CR that lapsed last month.
 *
 * **A company row is read, never requested** (product owner, 2026-08-08). It carried a `docTypes` list
 * whose only consumer was `batchDocumentRequest`; with the company ask withdrawn that list has no
 * reader, so it is deleted rather than left as an unused extension point. The row still states its
 * status and still opens and downloads its paper (AC-69) — that is the whole of what it does.
 */
export type CompanyDocStatus = "verified" | "on_file" | "missing";

export interface CompanyDocRow {
  key: CompanyDocKey;
  label: Bilingual;
  status: CompanyDocStatus;
  /** verified · valid until … · renews annually · **no document yet** (red). */
  statusLine: Bilingual;
  /** The row's **one** presigned url — view and download both point at it (`docRowActions`). Null on a
   *  paper the firm has not filed, and then the row exposes neither control (AC-69). */
  downloadUrl: string | null;
}

export type CompanyDocKey = "cr" | "vat" | "national_address" | "local_content" | "saso";

/**
 * The five company papers this panel lists.
 *
 * **SASO arrives last because it arrived last.** Appending never reorders rows a renter has already
 * learned. `companyDocRows` maps over THIS array, so a fifth row needs nothing else — and, being a row
 * like any other, it gets view + download when it carries a url and neither when it does not (AC-69).
 *
 * **IBAN is deliberately absent.** Spec §6.1 and AC-41 both named it, and the product owner decided to
 * remove it — so the smaller, less-revealing surface wins. This used to add **"and the spec needs
 * editing"**; that half is withdrawn — the spec HAS been edited (`004:131` and `004:704` now say no
 * IBAN), so there is no follow-up owed and no discrepancy to reconcile. The decision stands: adding a row
 * back is a one-line change; un-showing a supplier's bank details after the fact is not.
 *
 * **`local_content` and `saso` are HELD CERTS, not catalogue documents.** They live in
 * `supplier_profiles.held_cert_docs` (`{LC: key}` / `{SASO: key}`) with legacy `local_content_doc_key`
 * and `saso_heavy_equip_doc_key` columns still dual-read. That dual-read is why the panel can DISPLAY
 * and open them at all; it is not a request path — a company paper is read, never requested (product
 * owner, 2026-08-08). They are listed here because a renter verifying a firm does not care which table
 * a paper is stored in.
 *
 * **This `saso` is the COMPANY registration, never the equipment cert.** The word names four different
 * papers across the tree. The two never meet: this list is resolved against the firm and never against
 * a listing, and since a document request now always names a machine, only a listing's own
 * `documentKeys` can ever answer one.
 */
export const COMPANY_DOC_KEYS: CompanyDocKey[] = ["cr", "vat", "national_address", "local_content", "saso"];

const COMPANY_DOC_LABEL: Record<CompanyDocKey, Bilingual> = {
  cr: { en: "Commercial registration", ar: "السجل التجاري" },
  vat: { en: "VAT certificate", ar: "الشهادة الضريبية" },
  national_address: { en: "National address", ar: "العنوان الوطني" },
  local_content: { en: "Local content", ar: "المحتوى المحلي" },
  // «تسجيل ساسو» verbatim from the backend's `TERM_LABELS` — one term, one Arabic wording, wherever
  // the renter meets it. A second translation of the same paper would read as a second paper.
  saso: { en: "SASO registration", ar: "تسجيل ساسو" },
};

/** One company paper as the caller holds it. Only `present` is required — everything else is rendered
 *  when it exists and silently omitted when it does not, so a payload that never grows an expiry date
 *  still reads correctly instead of printing "valid until null". */
export interface CompanyDocInput {
  present: boolean;
  /** ISO date. Rendered as "valid until …" when set. */
  expiryDate?: string | null;
  /** True for a paper the issuer reissues every year (a VAT certificate) — shown instead of an expiry. */
  renewsAnnually?: boolean;
  downloadUrl?: string | null;
}

/** The company as this panel needs it. Structurally satisfiable from a `BidCard`'s `verified` +
 *  `compliance` + `companyCertCodes`, which is all the renter is served today (§7 — no new endpoint). */
export interface CompanyDocsSource {
  /** The firm's verification (`BidCard.verified`) — a paper on a verified firm's file has been checked. */
  verified: boolean;
  docs: Partial<Record<CompanyDocKey, CompanyDocInput>>;
}

const fmtDate = (iso: string): { en: string; ar: string } | null => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return {
    en: d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
    ar: d.toLocaleDateString("ar-SA-u-ca-gregory", { day: "numeric", month: "short", year: "numeric" }),
  };
};

/**
 * The company document list (§6.1) — a **document list, not a profile**. No contact info, no deals
 * count, no CR/VAT *numbers*: the header states identity, and these rows state paperwork.
 *
 * A missing paper is **red** and reads "no document yet", which is the one row the renter can act on.
 */
export function companyDocRows(source: CompanyDocsSource): CompanyDocRow[] {
  return COMPANY_DOC_KEYS.map((key) => {
    const input = source.docs[key];
    const label = COMPANY_DOC_LABEL[key];
    if (!input?.present) {
      return {
        key,
        label,
        status: "missing" as const,
        statusLine: { en: "no document yet", ar: "لا يوجد مستند بعد" },
        downloadUrl: null,
      };
    }
    const status: CompanyDocStatus = source.verified ? "verified" : "on_file";
    const head: Bilingual = source.verified
      ? { en: "verified", ar: "موثّق" }
      : { en: "on file", ar: "على الملف" };
    const expiry = input.expiryDate ? fmtDate(input.expiryDate) : null;
    const tail: Bilingual | null = expiry
      ? { en: `valid until ${expiry.en}`, ar: `صالح حتى ${expiry.ar}` }
      : input.renewsAnnually
        ? { en: "renews annually", ar: "يُجدَّد سنوياً" }
        : null;
    return {
      key,
      label,
      status,
      statusLine: tail ? { en: `${head.en} · ${tail.en}`, ar: `${head.ar} · ${tail.ar}` } : head,
      downloadUrl: input.downloadUrl ?? null,
    };
  });
}

/* ───────────────────────────── the requests these surfaces raise ───────────────────────────── */

/**
 * What a panel surface hands upward when the renter asks for something. **V11 owns the composer** —
 * these components only describe the ask, never post it, so the `rentee_request` contract (§7.3, where
 * `ref` is minted server-side and `serial` is stamped from the resolved listing) has exactly one caller.
 *
 * `add_to_offer` is retired and rejected server-side; nothing here can emit it.
 */
export type PanelRequestDraft =
  | { kind: "availability"; equipmentId: string }
  | { kind: "alternative"; equipmentId: string | null }
  | {
      kind: "document";
      /**
       * **Never null, and never a company scope** — a document request names a machine (product owner,
       * 2026-08-08). This arm briefly carried `equipmentId: string | null` beside a
       * `scope: "equipment" | "company"` so the company panel could ask the firm for its CR; that ask
       * is withdrawn, and the type is narrowed rather than guarded so no surface can compose it again.
       */
      equipmentId: string;
      /** **One request naming several types** (§6.6) — never one request per row. */
      docTypes: string[];
      labels: Bilingual[];
    };

/**
 * Build the one batch document request for a set of ticked rows on ONE machine. Returns null when
 * nothing askable is ticked, so a caller can disable its send control from the same source of truth
 * that builds the payload.
 *
 * **The ask covers only what is missing** (owner, 2026-08-08). `requestable` is not optional and is not
 * trusted to the caller's own filtering: a row that is not requestable is dropped **here**, however the
 * selection set was arrived at, so the checkbox and the payload are one rule read twice rather than two
 * rules that can drift.
 */
export function batchDocumentRequest(
  equipmentId: string,
  rows: { key: string; label: Bilingual; docTypes: string[]; requestable: boolean }[],
  selected: ReadonlySet<string>,
): PanelRequestDraft | null {
  const picked = rows.filter((r) => r.requestable && selected.has(r.key));
  if (picked.length === 0) return null;
  return {
    kind: "document",
    equipmentId,
    docTypes: [...new Set(picked.flatMap((r) => r.docTypes).filter((t) => t.trim() !== ""))],
    labels: picked.map((r) => r.label),
  };
}
