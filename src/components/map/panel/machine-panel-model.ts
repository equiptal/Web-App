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
 * **The renter's words are the APP's words** (owner, 2026-08-10, on a screenshot of this grid: *"for
 * this fields ui and wordings use the bid readiness shown to the renter in the app … check with app
 * even for wordings and language"*), under the standing rule that the Flutter app is the reference for
 * shared logic and wording and the web is what changes when they disagree.
 *
 * The reference surface is the renter's own readiness in the app — `rentee_readiness_section.dart` →
 * `EligibilityGrid` (`bid_readiness_sheets.dart:1107-1218`), whose cells are scored by
 * `bid_readiness.dart`. Its whole vocabulary for "does this machine hold the paper?" is two strings,
 * and they are the two below. **Every finding on this surface that answers that question is one of
 * them**, quoted from the app's own ARB rather than paraphrased, so a renter who reads a machine in
 * the app and then on the map is told the same thing in the same words.
 *
 * Note the noun: the app says **the unit's file** / «ملف الوحدة» everywhere — never "the machine's
 * file" / «ملف المعدّة», which is what this file used to say. Same paper, one name.
 */
/** `bidReadinessDocOnFile` — app_en.arb:8719 · app_ar.arb:6236. Lower-cased in EN only, because a
 *  finding here is a clause in a sentence («TÜV — on the unit's file») and the app's is a standalone
 *  cell value. The Arabic is verbatim. */
const ON_FILE: Bilingual = { en: "on the unit's file", ar: "موجودة في ملف الوحدة" };
/** `bidReadinessDocMissing` — app_en.arb:5436 · app_ar.arb:3642. Same lower-casing rule as
 *  {@link ON_FILE}. The app uses this one string for BOTH the photos cell and the proof-of-ownership
 *  cell, feminine agreement and all, so both are quoted from it here too. */
const NOT_ON_FILE: Bilingual = { en: "not on the unit's file", ar: "غير موجودة في ملف الوحدة" };
/** `bidReadinessNoneRequested` — app_en.arb:5312 · app_ar.arb:3616. The app's word for **case 5**,
 *  "nothing was asked for in this category at all". */
const NONE_REQUESTED: Bilingual = { en: "none requested", ar: "لم يُطلب شيء" };
/**
 * The same statement about ONE thing rather than a whole category — the shape below calls it *case 3*.
 * The app has no phrase for it (it renders no unasked row at all), so it is this surface's own; what it
 * is *not* is a sixth way to say "nobody asked", which is exactly what the owner found on 2026-08-11.
 */
const NOT_REQUESTED: Bilingual = { en: "not requested", ar: "لم يُطلب" };

/* ── ONE SENTENCE SHAPE PER CASE (owner, UAT of 2026-08-11) ───────────────────────────────────────
   *"some use 'no year asked for' while some 'none requested' or '1 asked for' — use consistent
   wording."* Every phrase below was already the app's; what differed was the **grammar** each cell
   wrapped them in, so six cells answered one question six ways. The words stay, the shapes collapse to
   four, and every cell on this surface builds its finding out of these three helpers and nothing else:

   | case | | shape |
   |---|---|---|
   | 1 | asked, and the unit's file answers it (**green**) | `{thing} — on the unit's file` |
   | 2 | asked, and it does not (**red**) | `Missing {thing}` |
   | 3 | not asked, and the file still has something to say (**grey**) | `{thing} — not requested` |
   | 4 | nothing asked in this category at all (**grey**) | `none requested` |

   **Red leads with the absence and names the thing** — the owner's own example, *"for TÜV or any field
   that doesn't match your request and is red, show wording like 'Missing TUV' instead of the current
   sentence."* It replaces «TÜV — غير موجودة في ملف الوحدة», which buried the one word the renter is
   scanning for behind the name of the paper. `{thing}` is dropped when the cell's LABEL already names
   exactly one thing (proof of ownership), because "Proof of Ownership / Missing Proof of Ownership" is
   a cell that reads like a bug; the documents tab's rows drop it for the same reason and so say the
   same word about the same absence, which is the other half of the ruling.

   **Case 2 may carry a tail — `Missing {thing} — {what the file has instead}` — and exactly one cell
   uses it**: the year, where the unit *does* hold a value and the value is the point. Everywhere else
   the tail would restate the absence the head just named.

   **Arabic leads with «مفقود:» and a colon.** Leading with the absence is the ruling; the colon is what
   makes it possible without gender agreement, since one shape has to serve «شهادة» (f.), «إثبات» (m.)
   and a bare year alike. */
const MISSING: Bilingual = { en: "Missing", ar: "مفقود" };

/** Case 1 — the file answers the ask. */
const heldOf = (thing: Bilingual): Bilingual => ({
  en: `${thing.en} — ${ON_FILE.en}`,
  ar: `${thing.ar} — ${ON_FILE.ar}`,
});
/** Case 3 — nobody asked, and the file still has something to state. */
const unaskedOf = (thing: Bilingual): Bilingual => ({
  en: `${thing.en} — ${NOT_REQUESTED.en}`,
  ar: `${thing.ar} — ${NOT_REQUESTED.ar}`,
});
/** Case 2 — the absence first, then the thing, then (the year cell only) what the file holds instead.
 *  `thing == null` is the cell whose label is already the thing's name. */
const missingOf = (thing: Bilingual | null, instead?: Bilingual): Bilingual => ({
  en: `${MISSING.en}${thing ? ` ${thing.en}` : ""}${instead ? ` — ${instead.en}` : ""}`,
  ar: `${MISSING.ar}${thing ? `: ${thing.ar}` : ""}${instead ? ` — ${instead.ar}` : ""}`,
});
/** Several names in one finding — the certificates and the photo slots both list what they mean. */
const joinNames = (names: Bilingual[]): Bilingual => ({
  en: names.map((n) => n.en).join(" · "),
  ar: names.map((n) => n.ar).join(" · "),
});

/**
 * **green** = the request asked and the machine satisfies it · **grey** = the request did not ask ·
 * **red** = the request asked and the machine does not satisfy it.
 *
 * There is no fourth state and there is no amber: a cell either answers the renter's question or says
 * it was never asked.
 *
 * **The app has no grey, and that difference was NOT reconciled here** (2026-08-10, when the wording
 * was brought onto the app's). `EligibilityGrid` bands an unasked cell **green**: the year cell is
 * `yearConflict ? red : green` with no third arm (`bid_readiness_sheets.dart:1123`), the attachments
 * cell is hard-coded `ReadinessBand.green` (:1137), and an empty cert cell prints «None requested» in
 * `AppColors.success` (:1331). This surface keeps grey in all three, because grey is *this* grid's
 * whole contract — «a cell nobody asked about cannot fail» — and turning three unasked cells green
 * would tell the renter three checks passed that were never run. The instruction was to align the
 * words, not the rules; the divergence is written down instead.
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
   * The cell's **actual finding** — "2 of 2 — on the unit's file", "Missing TÜV" (§6.5). Never a bare
   * tick: a tick tells the renter a check passed without telling him what was checked, which is the
   * whole thing this surface exists to stop. Built by the four shapes above and nothing else.
   */
  finding: Bilingual;
  /**
   * **The file this cell is reading, so the cell can open it** (owner, UAT of 2026-08-11: *"clicking on
   * any document field here, like '2 of 2 unit photos', will take them to the document"*).
   *
   * **Null except on a GREEN cell**, and that is the whole rule: green is the state that says *the
   * unit's file answers your request*, so it is the only state with a file to show. A red cell's
   * finding names what is **absent** — there is nothing to open, and opening some other paper of the
   * same family would be evidence for a sentence the cell did not write. A grey cell was never scored.
   * A cell with nothing to show must not be pressable, so this is `null` and the component draws a
   * plain block rather than a dead control.
   *
   * It is **the documents tab's own row**, resolved by {@link equipmentDocGroups} — same key, same
   * label, same url. That is deliberate: the frame at the top of the panel then marks the row the
   * renter would have pressed on the other tab, and the two tabs cannot disagree about which paper a
   * finding stands for.
   */
  evidence: DocViewTarget | null;
}

/**
 * A document the panel's **viewer** can be asked to hold — the frame's subject, resolved to four
 * fields (`EquipmentDocuments`' `DocViewSubject` is this with its label already localised).
 *
 * It lives here rather than beside the component because both surfaces that raise one — a document row
 * and now a match cell — resolve it out of this model, and a shape defined in a component would make
 * the model import a component to name its own return type.
 */
export interface DocViewTarget {
  /** The documents-tab row this file belongs to, so the frame and that row agree on what is open. */
  key: string;
  label: Bilingual;
  url: string;
  /** **A photograph fills the frame; a paper is a sheet laid on white.** Read off the GROUP the row
   *  came from, never sniffed from the url. */
  kind: "photo" | "paper";
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
 * (~~`bid-readiness.ts` still excludes proof-of-ownership from its readiness SCORE.~~ **No longer true
 * of this surface** — owner's ruling, 2026-08-12: *"for the percentage use existing bid readiness in the
 * app as source of truth."* The exclusion survives only for BID-backed scoring, where the paper really
 * is stripped; every scorer call in this file now passes {@link FLEET_READINESS_OPTS} and counts it,
 * because the rows this file reads are the unstripped ones. See `bid-readiness.ts`'s header.)
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
 * **The readiness options every scorer call in this file passes** — proof of ownership IS one of the
 * scored keys here.
 *
 * Owner's ruling, 2026-08-12: *"for the percentage use existing bid readiness in the app as source of
 * truth."* The app's `bid_readiness.dart` scores `total = 2 + certs` with proof of ownership as one of
 * the two mandatory keys; the web used to score `1 + certs` unconditionally, so one machine with one set
 * of papers read **50% to the supplier and 100% to the renter**. 004a §10 recorded that as an accepted
 * divergence; the ruling withdraws the acceptance.
 *
 * **Why this file may opt in when the comparison workspace may not.** Everything here reads a
 * `FleetMachine` — a row from `GET /marketplace/bids/{bidId}/fleet`, which `supplier-fleet.service.ts`
 * serves **unstripped** (owner, 2026-08-10: ownership papers reach the renter on the map and nowhere
 * else). The paper is present, it carries a usable url, `ownershipCell` already reads it red when it is
 * missing and `equipmentDocGroups` already renders it as a required row. Scoring it costs the supplier
 * nothing he cannot see and close. On the BID's projection the same paper is stripped by
 * `RENTEE_HIDDEN_DOC_TYPES`, so scoring it there would be a permanent shortfall on evidence nobody can
 * produce — which is why `computeBidReadiness` has no such option at all.
 *
 * Shared by `matchGrid` and `equipmentDocGroups` so the two cannot be scored two ways: they already
 * derive their asks from one `readinessInputsFor`, and this is the other half of that agreement.
 */
const FLEET_READINESS_OPTS = { scoreOwnership: true } as const;

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
 * ~~`operatorCertCode` below already folds the spelling, so the file always expected the value to exist.~~
 * That helper went with the operator group (UAT of 2026-08-11); this test is what still catches the
 * British spelling, and it is now the ONLY thing that does.
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

/**
 * **The four ownership papers, one row each** — owner, 2026-08-12 (spec §5.4):
 *
 * > *"I want it per doc, so the renter can select any type of ownership — shown each in a row."*
 *
 * ~~One row, `doc:ownership`, any-of over {@link OWNERSHIP_TYPES}, with its ask hard-coded to
 * `askType: "istimara"`.~~ **Withdrawn.** The reasoning behind the single row was sound about the
 * SCORE and wrong about the ASK: because any one paper proves the machine, the row went green on a
 * sale contract — and then the ask raised from it demanded an *istimara*, a paper the supplier does
 * not have, to prove something he had already proven. One row could only ever name one paper, and the
 * paper it named was not the renter's choice.
 *
 * These four are exactly the app's `kPooDocTypes` (`bid_readiness.dart:11`) and exactly
 * `OWNERSHIP_DOC_TYPES` in `bid-readiness.ts` — the set that decides the NUMBER. Keeping the rows on
 * the same four keeps "what the renter can ask for" and "what would turn the fraction green" the same
 * list, which is what stops a renter asking for a paper that would not count if it arrived.
 *
 * ⚠️ **The rows are four; the score is one.** `computeUnitReadiness` still scores ownership as a
 * SINGLE any-of term (`ownershipPresent`, `+1` on `total`), and it must stay that way: the four are
 * alternatives, and no machine holds all four, so a fraction with four ownership terms would put every
 * supplier permanently short on papers nobody expects him to have. Four rows to read and choose from,
 * one point in the fraction. {@link attentionCount} collapses them the same way for the same reason.
 *
 * ⚠️ **Ownership is exempt from the not-required rule** (owner, same day: *"Yes — separate each alone,
 * each requestable regardless"*). Everywhere else an absent, unrequested paper is not a row at all, so
 * the renter does not read a wall of red for papers nobody wants. Ownership does not follow it,
 * because the renter is choosing WHICH proof he wants and cannot choose a paper the surface has
 * hidden — and because the platform already treats ownership as mandatory rather than request-driven
 * (`required: true` on the row this replaces).
 */
const OWNERSHIP_ROW_CODES = ["istimara", "customs", "sale_contract", "saso_registration"] as const;

/**
 * Which of the four rows a held ownership paper belongs to — or `null` for an ownership paper that
 * names none of them.
 *
 * {@link OWNERSHIP_TYPES} is deliberately wider than the four: it is the DISPLAY allow-list, and it
 * carries spelling variants (`istimarah`, `customs_card`, `sales_contract`) plus four generic names
 * (`ownership`, `proof_of_ownership`, `title_deed`, `combined`) that name no particular paper. The
 * variants fold onto their row. The generic four fold to `null` and get a row of their own under their
 * own name further down — because a paper the machine actually holds must stay visible, and filing an
 * unnamed "proof of ownership" under the *istimara* row would claim an istimara is on file.
 */
function ownershipRowCode(type: string): string | null {
  switch (norm(type)) {
    case "istimara":
    case "istimarah":
    case "registration":
      return "istimara";
    case "customs":
    case "customs_card":
      return "customs";
    case "sale_contract":
    case "sales_contract":
      return "sale_contract";
    case "saso_registration":
      return "saso_registration";
    default:
      return null;
  }
}

const isOwnershipDoc = (d: OfferedUnitDoc): boolean => OWNERSHIP_TYPES.has(norm(d.type));
const isOperatorDoc = (d: OfferedUnitDoc): boolean => {
  const t = norm(d.type);
  return t.startsWith("operator") || OPERATOR_TYPES.has(t);
};
const isEquipmentCertDoc = (d: OfferedUnitDoc): boolean => !isOperatorDoc(d) && EQUIPMENT_CERT_TYPES.has(norm(d.type));

/* ~~`operatorCertCode` — an operator paper's row CODE~~, which folded the four spellings of one licence
   into a single row key. **Deleted with the operator group** (owner, UAT of 2026-08-11): with no rows
   to key, nothing on this surface turns an operator document kind into a row code, and a helper kept
   "in case" is a second answer waiting to disagree with the scorer's. The fold itself is not lost —
   `bid-readiness.ts` already dedupes the request's operator asks upstream, which is where the several
   spellings came from, and `isOperatorDoc` (above) still recognises every one of them so an operator
   paper cannot fall through into the equipment's documents. */

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
  // Ownership counts here — `machine` is an unstripped fleet row. See {@link FLEET_READINESS_OPTS}.
  const readiness = computeUnitReadiness(machine, asks.equipCerts, asks.operatorCerts, asks.minYear, FLEET_READINESS_OPTS);
  const cells: Omit<MatchCell, "evidence">[] = [
    yearMakeCell(machine, readiness),
    attachmentsCell(request),
    photosCell(machine),
    ownershipCell(machine),
    // Labels quoted from the app's own grid: `bidReadinessCellEquipCerts` (app_en.arb:5283 ·
    // app_ar.arb:3610) and `bidReadinessCellOperatorCerts` (app_en.arb:5287 · app_ar.arb:3611).
    // Both are PLURAL and both say "certifications" — this file said "Equipment certificate" /
    // «شهادة المعدّة», singular, for a cell that routinely lists two.
    certCell("equipment_cert", { en: "Equipment certifications", ar: "شهادات المعدّة" }, readiness.equipmentCerts),
    // **The operator's ONLY appearance on this panel since the UAT of 2026-08-11** — *"operator will not
    // be viewed in the document section at all — only in the equipment field, as its cert exists or
    // not."* The documents tab's operator group is gone (see {@link equipmentDocGroups}); this cell is
    // what survives of it, and it says exactly what the owner asked it to say.
    certCell("operator_cert", { en: "Operator certifications", ar: "شهادات المشغّل" }, readiness.operatorCerts),
  ];
  const evidenceOf = matchCellEvidence(machine, request, readiness.equipmentCerts.map((c) => c.code));
  return cells.map((c) => ({ ...c, evidence: evidenceOf(c) }));
}

/**
 * **The file behind a green cell** (owner, UAT of 2026-08-11) — see {@link MatchCell.evidence} for the
 * green-only rule and why a red cell has nothing to open.
 *
 * Resolved out of {@link equipmentDocGroups} rather than off `machine` directly: the rows are already
 * the answer to "which paper does this finding stand for", they already carry the renter's word for it,
 * and reading them here means the key handed to the viewer is the key the documents tab marks. Building
 * the groups a second time costs one more `computeUnitReadiness`; both callers memoise on
 * `(machine, request)`, and a second opinion about which paper a cell means would cost the renter a
 * frame holding the wrong one.
 */
function matchCellEvidence(
  machine: FleetMachine,
  request: MatchRequest,
  requestedCertCodes: string[],
): (cell: Omit<MatchCell, "evidence">) => DocViewTarget | null {
  const rows = new Map<string, { row: DocRow; kind: DocViewTarget["kind"] }>();
  for (const group of equipmentDocGroups(machine, request)) {
    for (const row of group.rows) rows.set(row.key, { row, kind: group.key === "photos" ? "photo" : "paper" });
  }
  /** The first of these rows that actually holds a file, in the order the renter reads them. */
  const first = (keys: string[]): DocViewTarget | null => {
    for (const key of keys) {
      const hit = rows.get(key);
      const url = hit?.row.files.find((f) => f.url)?.url;
      if (hit && url) return { key, label: hit.row.label, url, kind: hit.kind };
    }
    return null;
  };
  return (cell) => {
    if (cell.state !== "green") return null;
    switch (cell.key) {
      case "photos":
        return first([...REQUIRED_PHOTO_SLOTS].map((s) => `photo:${s}`));
      // ~~`first(["doc:ownership"])`~~ — one key, because ownership was one row. Since the owner's
      // ruling of 2026-08-12 it is four ({@link OWNERSHIP_ROW_CODES}), and the cell is green when ANY
      // of them is on the file, so the evidence is the first of the four that holds one — read in the
      // order the renter sees them, which is what `first` already means for the photos.
      // Every ownership row, in the order the renter reads them — the four named papers first, then any
      // paper the machine holds that names none of them (`doc:ownership_other:*`). Taken off the row
      // map rather than from a fixed list because `ownershipCell` goes green on the WIDER
      // `OWNERSHIP_TYPES`, so a machine carrying only a `title_deed` has a green cell whose evidence
      // lives on an extra row — and a green cell with nothing to open is the dead control AC-69 forbids.
      case "ownership":
        return first([...rows.keys()].filter((k) => k.startsWith("doc:ownership")));
      case "equipment_cert":
        return first(requestedCertCodes.map((code) => `doc:equipment_cert:${code}`));
      // The year and the attachments are not documents at all, and the operator's certificates expose
      // no file by ruling (RM3-AC-75) — three cells with nothing to open, and none of them press.
      default:
        return null;
    }
  };
}

/**
 * Year & manufacturer. The **requirement** drives the colour, the machine drives the finding.
 *
 * `computeUnitReadiness` has already decided whether the raw `reqMinYear` reads as a year at all (it
 * can also be an age), and exposes the answer as `reqMinYear` — non-null only when it does. Re-deriving
 * that here is exactly the second scorer this file refuses to be.
 *
 * **Wording, against the app** (`EligibilityGrid`, `bid_readiness_sheets.dart:1119-1129`). The app's
 * cell is two branches and no more:
 *
 * - **conflict** → `bidReadinessYearConflict` — *"Below the required year {min}"* / «أقدم من الحد
 *   الأدنى المطلوب {min}» (app_en.arb:5295 · app_ar.arb:3613). That is the phrase used here, and it
 *   replaces this file's *"you asked for 2020 or newer"*.
 * - **otherwise** → `'${year ?? '—'} · $make'` — the bare fact, **with no clause of approval**. So the
 *   satisfied cell now reads «2020 · Case» and stops there; *"· meets 2020 or newer"* is gone, because
 *   the app never says it and the ✓ already does.
 *
 * **The app has no equivalent for the grey case** — it has no grey year cell at all (see the rule note
 * on {@link matchGrid}'s states), so the *"nobody asked"* clause stays this surface's own. It is not
 * dropped: without it the grey cell and the green cell would print identical text.
 *
 * **Reshaped by the UAT of 2026-08-11**, which is what the two struck sentences above cost. The app's
 * *"below the required year {min}"* was the one finding on the grid that stated a **mismatch** instead
 * of an absence, and *"· no year asked for"* was one of the three spellings of "nobody asked" the owner
 * read side by side. Both are now the shared shapes: red is `Missing {min} or newer — {what the file
 * holds}` — the only cell that uses case 2's tail, because it is the only one where the file holds a
 * value that fails rather than nothing at all — and grey is case 3's `{year} · {make} — not requested`.
 * The requirement the app's phrase carried is not lost; it is what red now names as missing.
 */
function yearMakeCell(machine: FleetMachine, readiness: UnitReadiness): Omit<MatchCell, "evidence"> {
  const label: Bilingual = { en: "Year & manufacturer", ar: "سنة الصنع والصانع" };
  const make = machine.manufacturer?.trim() || null;
  const year = machine.year;
  const req = readiness.reqMinYear;
  const makeSuffix: Bilingual = make ? { en: ` · ${make}`, ar: ` · ${make}` } : { en: "", ar: "" };
  // What the unit's own file says, or the app's phrase for a file that says nothing.
  const onFile: Bilingual | null =
    year != null ? { en: `${year}${makeSuffix.en}`, ar: `${arDigits(year)}${makeSuffix.ar}` } : null;

  if (req == null) {
    // No year was asked for, so nothing here can fail. The finding still states what the machine is,
    // because a grey cell that says only "not requested" wastes the row.
    return { key: "year_make", label, state: "grey", finding: unaskedOf(onFile ?? NOT_ON_FILE) };
  }
  if (onFile == null || readiness.yearConflict) {
    // Two ways to fail one ask — no year on the file, or a year that is too old — and one sentence for
    // both: what the request wanted, then what the file actually holds.
    const wanted: Bilingual = { en: `${req} or newer`, ar: `${arDigits(req)} أو أحدث` };
    return { key: "year_make", label, state: "red", finding: missingOf(wanted, onFile ?? NOT_ON_FILE) };
  }
  return { key: "year_make", label, state: "green", finding: heldOf(onFile) };
}

/**
 * Attachments. **Never red** — and that is a decision, not an oversight.
 *
 * A fleet row carries no attachment record: `FleetMachine`/`OfferedUnitDetail` has no attachments
 * field, and the platform's own bid-card term for attachments is hard-coded grey for the same reason
 * (`bids.ts:532`). Colouring this red would tell the renter the supplier failed a check the platform
 * never ran — it would show *more* than we know. When the request asked for attachments the cell says
 * so and says the file cannot answer; when it did not, it reads as not required.
 *
 * **Wording, against the app.** The app's attachments cell is a constant: label `bidReadinessCell-`
 * `Attachments` (app_en.arb:5279 · app_ar.arb:3609 — already this file's label, unchanged) and the
 * single value `bidReadinessNoAttachmentsRequired`, *"No attachments required"* / «لا توجد ملحقات
 * مطلوبة» (app_en.arb:5304 · app_ar.arb:3614), which it prints **whatever the request asked for** —
 * `bid_readiness_sheets.dart:1138` never reads the request at all. So the nothing-asked case is quoted
 * from it, and the asked-for case is a state the app never renders and has no phrase for; it keeps this
 * surface's own sentence, moved onto the app's noun («ملف الوحدة»).
 *
 * **Both halves were reworded by the UAT of 2026-08-11**, and this cell is where the owner's complaint
 * is easiest to see: it said *"no attachments required"* in one state and *"1 asked for"* in the other,
 * two vocabularies inside a single cell, and neither matched «لم يُطلب شيء» one cell over. The
 * nothing-asked case is now case 4's shared phrase, and the asked-for case is case 1's shape carrying
 * the only verdict this cell can give — the platform records no attachment, so it says so in the app's
 * own noun rather than pretending to have checked.
 *
 * **Still grey in both, and the owner confirmed that on the same screenshot** — *"1 asked but in grey,
 * which is correct."* Grey never says "Missing": a cell the platform did not score cannot report a gap.
 */
function attachmentsCell(request: MatchRequest): Omit<MatchCell, "evidence"> {
  const label: Bilingual = { en: "Attachments", ar: "الملحقات" };
  const asked = [...(request.attachmentIds ?? []), ...(request.customAttachments ?? [])].filter(
    (x) => String(x ?? "").trim() !== "",
  ).length;
  if (asked === 0) {
    return { key: "attachments", label, state: "grey", finding: NONE_REQUESTED };
  }
  return {
    key: "attachments",
    label,
    state: "grey",
    finding: {
      en: `${asked} requested — not recorded on the unit's file`,
      ar: `${arDigits(asked)} مطلوبة — غير مسجّلة في ملف الوحدة`,
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
 *
 * **Wording, against the app.** The label is `bidReadinessGapPhotos` — *"Unit photos"* / «صور الوحدة»
 * (app_en.arb:8739 · app_ar.arb:6241), which is what the app calls this cell
 * (`bid_readiness_sheets.dart:1178`) and its photo group alike; this file said "Equipment photos" /
 * «صور المعدّة».
 *
 * The **fraction has no equivalent in the app's grid cell** — there it is a bare
 * `bidReadinessDocOnFile` / `bidReadinessDocMissing`, which would throw away the count the owner is
 * looking at. So the count is kept and phrased in the app's own words for a count of filed papers:
 * `bidReadinessDocsOnFile`, *"{onFile} of {total} on file"* / «{onFile} من {total} في الملف»
 * (app_en.arb:5444 · app_ar.arb:3644 — the readiness docs sheet's summary line). Nothing is invented
 * and nothing is lost; "uploaded" / «مرفوعة» was the one word here with no counterpart anywhere in the
 * app's readiness vocabulary.
 *
 * **The fraction survives on the GREEN cell only** (UAT of 2026-08-11). Red used to read *"1 of 2 on
 * file"* — a count, in a state whose job is to name what is absent, and the renter then had to work out
 * *which* shot the missing one was by opening the other tab. It now names the slot: `Missing Plate /
 * serial`, the same grammar the certificates cell answers with, out of the same `PHOTO_LABEL` the
 * documents tab heads that row with. The count is what green states, and it is why green is the cell
 * the owner pointed at when he asked for a cell to open its evidence — *"2 of 2 unit photos"*.
 */
function photosCell(machine: FleetMachine): Omit<MatchCell, "evidence"> {
  const present = new Set<PhotoSlot>(presentPhotoSlots(machine));
  const label: Bilingual = { en: "Unit photos", ar: "صور الوحدة" };
  const required = [...REQUIRED_PHOTO_SLOTS];
  const absent = required.filter((s) => !present.has(s));
  if (absent.length > 0) {
    return { key: "photos", label, state: "red", finding: missingOf(joinNames(absent.map((s) => PHOTO_LABEL[s]))) };
  }
  const total = required.length;
  return {
    key: "photos",
    label,
    state: "green",
    finding: heldOf({ en: `${total} of ${total}`, ar: `${arDigits(total)} من ${arDigits(total)}` }),
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
 *
 * **Wording, against the app.** The label is `ocrOwnershipProof` — *"Proof of Ownership"* / «إثبات
 * الملكية» (app_en.arb:6936 · app_ar.arb:4874), which is the app's heading for this cell
 * (`bid_readiness_sheets.dart:1194`) and for the ownership row in its documents sheet (`_rowLabel`,
 * :2832). Title case is the app's, kept rather than tidied.
 *
 * The two findings are the app's supplier-side pair, `bidReadinessDocOnFile` / `bidReadinessDocMissing`
 * — **not** the rentee-side `renteeReadinessOwnershipHidden` («Not shown here» / «لا تُعرض هنا»), and
 * that is the same distinction the red-when-absent rule above rests on. The app hides this cell's
 * verdict because the BID's projection redacts ownership papers; this surface reads the unstripped
 * fleet row, so it can and does state the fact.
 *
 * ~~*"— you can ask for it"* / «— يمكنك طلبها» has **no app equivalent** (the renter cannot ask from the
 * app's read-only mirror) and is kept: it names the one act this panel offers that the app's does not.~~
 * **Withdrawn by the UAT of 2026-08-11.** No other red cell offers an action in its finding, and the
 * shared red shape has no room for one — a six-cell grid where one cell alone ends in an instruction is
 * the unevenness the owner was reading. The act is not lost: the documents tab is where it is performed,
 * and its row for this paper is one press away.
 *
 * **This is the one cell whose `{thing}` is dropped**, in both states — its label *is* the paper's name,
 * so `Missing Proof of Ownership` under a heading reading "Proof of Ownership" would print it twice. It
 * therefore says exactly what the documents tab's row says about the same absence: «مفقود».
 */
function ownershipCell(machine: FleetMachine): Omit<MatchCell, "evidence"> {
  const held = machine.documentKeys.filter(isOwnershipDoc);
  return {
    key: "ownership",
    label: { en: "Proof of Ownership", ar: "إثبات الملكية" },
    state: held.length > 0 ? "green" : "red",
    finding: held.length > 0 ? ON_FILE : missingOf(null),
  };
}

/**
 * A cert cell — equipment or operator. Grey when the request asked for none: an unrequested cert is
 * not a gap, and colouring it would invent an acceptance criterion the renter never set.
 *
 * **Wording, against the app.** The app's cert cell (`_certCell`, `bid_readiness_sheets.dart:1286-`
 * `:1356`) is chips, not a sentence, so there is nothing to quote for the *"NAME — verdict"* shape this
 * surface renders; what is quoted is the verdict, {@link ON_FILE} / {@link NOT_ON_FILE}, which is the
 * app's own vocabulary for exactly the judgement a chip's ✓/✗ carries. The **empty** case does have a
 * phrase, and it is `bidReadinessNoneRequested` ({@link NONE_REQUESTED}) — the app prints it when the
 * request asked for no cert in this family, which is this cell's grey.
 *
 * The certificate NAMES come from the scorer (`bid-readiness.ts`'s `EQ_CERT_LABELS` /
 * `OPERATOR_CERT_LABELS`) and are deliberately **not** touched here: they are shared with
 * `requests/BidReadiness.tsx`, so they are a second surface's copy, not this one's. They do differ from
 * the app's `readinessCertLabel` (which reads «TUV Certificate» / «شهادة TUV» where this reads «TÜV»),
 * and that is reported rather than changed from inside the map.
 */
function certCell(
  key: Extract<MatchCellKey, "equipment_cert" | "operator_cert">,
  label: Bilingual,
  certs: { labelEn: string; labelAr: string; present: boolean }[],
): Omit<MatchCell, "evidence"> {
  const names = (of: typeof certs): Bilingual => joinNames(of.map((c) => ({ en: c.labelEn, ar: c.labelAr })));
  if (certs.length === 0) {
    return { key, label, state: "grey", finding: NONE_REQUESTED };
  }
  const missing = certs.filter((c) => !c.present);
  if (missing.length === 0) {
    return { key, label, state: "green", finding: heldOf(names(certs)) };
  }
  // **The owner's own example of the red shape** (UAT of 2026-08-11): «TÜV — غير موجودة في ملف الوحدة»
  // becomes «مفقود: TÜV». Only the missing ones are named, exactly as before — a cell that also listed
  // the certificates the file *does* hold would bury the gap it exists to report.
  return { key, label, state: "red", finding: missingOf(names(missing)) };
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
 * (~~The operator's rows are not one of these. They carry no files at all.~~ There are no operator rows
 * on this tab at all since the UAT of 2026-08-11 — see {@link equipmentDocGroups}.)
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
  /** The presence sentence — "on the unit's file" / "not on the unit's file", the app's own two
   *  phrases, for photos and papers alike (see the constants below), with a "· not required" tail on an
   *  unrequired row. Never a verification word. */
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
   * ~~One family is `false` in BOTH states — the operator's certificates~~ (owner, 2026-08-08, narrowing
   * AC-75). **There is no such family here any more**: the operator's rows left this tab altogether in
   * the UAT of 2026-08-11 (see {@link equipmentDocGroups}), so the exception the sentence above bent for
   * has nothing to describe. Every row on this tab is now a paper of the machine's, and the rule reads
   * without a footnote: `status === "missing"` and nothing else.
   */
  requestable: boolean;
  /**
   * Rows that are ALTERNATIVES to one another, not a checklist — the machine needs **one** of them,
   * not all. Present only on the four ownership rows ({@link OWNERSHIP_ROW_CODES}); absent everywhere
   * else, so a row without it is judged entirely on its own.
   *
   * It exists for exactly one reader, {@link attentionCount}, and for exactly one reason: the owner's
   * ruling of 2026-08-12 split ownership into four rows while leaving it **one term in the fraction**,
   * and a badge saying *"3 need attention"* beside a machine whose ownership is proven — and whose
   * percentage is therefore complete — would be the surface contradicting its own number. Four rows to
   * read and choose from; one gap to close.
   *
   * ⚠️ **It is not, and must not become, a scoring input.** `computeUnitReadiness` knows nothing about
   * it and must not: the fraction's ownership term is `ownershipPresent`, derived from the machine's
   * papers, and a second route to the same answer is how the two numbers start to disagree.
   */
  anyOfGroup?: string;
}

/** The one `anyOfGroup` this surface has. Named rather than inlined so the row builder and
 *  {@link attentionCount} cannot drift apart on a string literal. */
const OWNERSHIP_ANY_OF = "ownership";

/** ~~`| "operator"`~~ — the operator's group left this tab in the UAT of 2026-08-11; see
 *  {@link equipmentDocGroups}. Two groups, and both are the machine's. */
export type DocGroupKey = "photos" | "documents";

export interface DocGroup {
  key: DocGroupKey;
  label: Bilingual;
  rows: DocRow[];
  /**
   * **Rows needing action, never a total** (§6.1, AC-42). Zero means nothing is outstanding.
   *
   * ~~`null` means this group makes no attention claim at all, and exactly one does: the operator's.~~
   * That group is gone (owner, UAT of 2026-08-11), and with it the only case this was ever `null` for —
   * so it is a plain number again, every group counts, and no reader has to carry a branch for a state
   * nothing can produce. `DocRowList` and the tab badge lost their `null` arms with it.
   */
  attention: number;
}

/**
 * Rows needing action. The one definition, used by both document surfaces.
 *
 * **A set of ALTERNATIVES counts once** (owner, 2026-08-12 — see {@link DocRow.anyOfGroup}). Rows
 * sharing an `anyOfGroup` are ways of answering ONE question, so they contribute one outstanding item
 * between them, and none at all once any of them is answered. Ownership is the only such group today:
 * splitting it into four rows must not turn one missing paper into four things needing attention, nor
 * leave a machine whose ownership IS proven reading *"3 need attention"* beside a complete percentage.
 *
 * Every other row is still counted individually, exactly as before — a row with no `anyOfGroup` is
 * judged entirely on its own `status`, which is every row on the company panel and every photo,
 * certificate and unnamed paper on the equipment tab.
 */
export function attentionCount(
  rows: { status: PresenceStatus | CompanyDocStatus; anyOfGroup?: string }[],
): number {
  let count = 0;
  // group → still outstanding? A group is outstanding while NOTHING in it is on the file.
  const groups = new Map<string, boolean>();
  for (const r of rows) {
    if (!r.anyOfGroup) {
      if (r.status === "missing") count += 1;
      continue;
    }
    const outstanding = groups.get(r.anyOfGroup) ?? true;
    groups.set(r.anyOfGroup, outstanding && r.status === "missing");
  }
  for (const outstanding of groups.values()) if (outstanding) count += 1;
  return count;
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
 * ~~**The operator's certificates are `null` in both states** (owner, 2026-08-08, narrowing AC-75).~~
 * They no longer reach this function: the group that built them left the tab in the UAT of 2026-08-11.
 * The mechanism it demonstrated is untouched and still the reason a third flag was never added — a row
 * with no url and nothing to ask for is untickable in every mode, out of the two fields it carries.
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

/**
 * The rows' status lines — **the app's two phrases, and a tail it has no word for**.
 *
 * The app files photos and papers through **one** row widget (`_rowShell`,
 * `bid_readiness_sheets.dart:2646`), and it says exactly one of two things: `bidReadinessDocOnFile` or
 * `bidReadinessDocMissing` ({@link ON_FILE} / {@link NOT_ON_FILE}, quoted at their definitions). A
 * photo row is not worded differently from a certificate row there — `_photoRow` (:2494) hands the same
 * shell the same booleans — so the four constants below collapse onto two phrases, deliberately. This
 * file's «uploaded» / «not uploaded» / «no document yet» were three more ways to say them.
 *
 * **The «· not requested» tail has no app equivalent.** The app renders *only* scored rows — one per
 * mandatory photo slot and one per certificate this request asked for — so a held-but-unrequired paper
 * is a row it never draws and therefore never had to word. This surface does draw it (see
 * {@link equipmentDocGroups}: held-and-unrequired is shown with no verdict), so the tail is kept as
 * this surface's own — in the grid's own word for it ({@link NOT_REQUESTED}), because «غير مطلوبة» here
 * and «لم يُطلب» one tab away were two ways to say the one thing.
 *
 * **An ABSENT row says «مفقود», the match grid's word** (owner, UAT of 2026-08-11): *"same wording as
 * the equipment tab for a missing document."* The two tabs describe the same absence, and until now the
 * grid was about to lead with «مفقود» while a row still read «غير موجودة في ملف الوحدة». The row drops
 * the paper's NAME from the phrase for the same reason the ownership cell does — the row's own title is
 * the name, six pixels above the status line — so a row reads «شهادة TÜV / مفقود» and the cell it
 * answers reads «مفقود: TÜV». One word, one absence, both tabs.
 */
const PRESENT_PHOTO: Bilingual = ON_FILE;
const ABSENT_PHOTO: Bilingual = MISSING;
const EXTRA_PHOTO: Bilingual = { en: `${ON_FILE.en} · ${NOT_REQUESTED.en}`, ar: `${ON_FILE.ar} · ${NOT_REQUESTED.ar}` };
const PRESENT_DOC: Bilingual = ON_FILE;
const ABSENT_DOC: Bilingual = MISSING;
const EXTRA_DOC: Bilingual = EXTRA_PHOTO;

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

/**
 * An equipment certificate's row heading, including a code this table has never seen.
 *
 * `docTypeLabel` used to be the fallback here, and it is the wrong one. It is locale-independent BY
 * DESIGN — it has no Arabic for a type nobody mapped, so it returns humanised English for both
 * locales. That is right for an arbitrary wire type. It is wrong for a certificate, because we know
 * one thing about this code that `docTypeLabel` does not: **it is a certificate**, since it reached
 * here through the request's own `reqEquipmentCerts`. The result was an Arabic panel rendering a row
 * headed "Certified" — English inside an Arabic column — for any request naming a cert outside the
 * five above.
 *
 * So the CATEGORY is translated and the NAME is left alone. That is not a compromise, it is what the
 * mapped entries already do: TÜV and SPSP stay Latin in Arabic, and only SASO and Aramco carry an
 * Arabic form at all, because a certificate's name is a proper noun. An unmapped code is therefore
 * shown exactly as the platform spells it, under a word the reader can actually read.
 */
function equipmentCertRowLabel(code: string): Bilingual {
  const known = EQUIPMENT_CERT_ROW_LABEL[code];
  if (known) return known;
  // Upper-cased because every certificate this platform names is an acronym; a lower-case
  // `certified` sitting beside TÜV and SPSP reads as a bug rather than as a name.
  const name = norm(code).replace(/_+/g, " ").trim().toUpperCase() || code;
  return { en: `${name} certificate`, ar: `شهادة ${name}` };
}

/* ~~`OPERATOR_CERT_ROW_LABEL` — an operator paper's row heading~~. **Deleted with the operator group**
   (owner, UAT of 2026-08-11). The renter's words for those papers survive where they are still read:
   `DOC_TYPE_LABEL` above names them on a chat request card, and the match grid's operator cell takes
   its certificate names from the scorer (`bid-readiness.ts`'s `OPERATOR_CERT_LABELS`) exactly as the
   equipment cell does. */

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
 * ask reads *waiting* even after the lessor uploads.~~ **Out of this file's reach since 2026-08-08** and
 * further out of it since the UAT of 2026-08-11, which removed the operator's rows from this tab
 * entirely (see {@link equipmentDocGroups}), so this surface emits no operator ask for that mismatch to
 * strand. The gap is kept written down rather
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
  anyOfGroup?: string;
}): DocRow {
  const { key, label, held, required, askType, anyOfGroup } = args;
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
    ...(anyOfGroup ? { anyOfGroup } : {}),
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

/* ── ~~The operator's certificates as a status, and only a status~~ (owner, 2026-08-08) ─────────────
   **The GROUP is gone** (owner, UAT of 2026-08-11): *"operator will not be viewed in the document
   section at all — only in the equipment field, as its cert exists or not."*

   `operatorStatusRows` lived here and built it. The 2026-08-08 ruling had already emptied the group of
   every act — no view, no download, no tick, no ask, no attention count — on the grounds that nothing
   validates an operator document on upload, so presence is the only claim the platform can stand
   behind. What the UAT settled is where that one claim belongs: on the match grid, where `certCell`
   already scores `readiness.operatorCerts` and says whether the certificate is there, and not as a
   third heading in a tab whose every other row can be opened, ticked and asked for. A group of rows
   that cannot be acted on, under two groups of rows that can, reads as a list the renter has failed to
   work out how to use.

   Nothing replaces it here, because nothing needs to: `matchGrid`'s operator cell is the whole of the
   surviving statement, and it was always scored from the same `computeUnitReadiness().operatorCerts`
   these rows read. RM3-AC-75 is superseded and the checklist records it.

   **A machine's own held operator papers are still recognised** — `isOperatorDoc` keeps them out of the
   equipment certs and out of the unclassified bucket, so a held `operator_tuv` cannot reappear as an
   openable equipment row through the other door now that no group of its own exists to catch it. That
   is the one part of this ruling with a test behind it that must never go green by accident. */

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
 * ~~**The operator's group is the one exception, and it is a different kind of row** — a status, not a
 * document list: present or absent, no file access, no tick, no ask and no attention count.~~
 * **The exception is gone because the group is** (owner, UAT of 2026-08-11): *"operator will not be
 * viewed in the document section at all — only in the equipment field, as its cert exists or not."* The
 * table above now governs **everything** this function returns, which is the point — a tab where one
 * group answered to none of the rules the other two announced was a tab the renter had to be told about.
 * The operator's one surviving statement is `matchGrid`'s operator cell. RM3-AC-75 is superseded; the
 * e2e checklist records what it changed to.
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
 * **Proof of ownership is required, and the fraction now agrees with the row.** `bid_readiness.dart`
 * scores it as one of two mandatory documents, and since the owner's ruling of 2026-08-12 — *"for the
 * percentage use existing bid readiness in the app as source of truth"* — so does this surface: the
 * scorer takes {@link FLEET_READINESS_OPTS} at both call sites in this file. ~~`bid-readiness.ts` here
 * excludes it from its fraction.~~ That exclusion is now scoped to bid-backed callers, whose
 * `offeredUnitsDetail` really is stripped; it was never a description of THIS surface, which reads the
 * unstripped fleet rows. So the required row and the number in front of the renter finally state the
 * same thing — a machine with no ownership paper reads a **red** row *and* a fraction short by exactly
 * one, instead of a red row beside a green 100%. See `ownershipCell`.
 *
 * ~~**A request with no operator needs no special case.**~~ **No request does, now**: with the group
 * gone, an operator paper is never a row here whatever the request asked and whatever the lessor holds.
 * The other half of that note still holds and is still enforced — a held `operator_tuv` does not fall
 * back into **Equipment documents**, because `isOperatorDoc` keeps it out of both the certificate
 * bucket and the unclassified one.
 */
export function equipmentDocGroups(machine: FleetMachine, request: MatchRequest): DocGroup[] {
  // The SAME derivation the match grid scores with — never a second reading of the request, and now
  // never a second answer about ownership either ({@link FLEET_READINESS_OPTS}).
  const asks = readinessInputsFor(request);
  const readiness = computeUnitReadiness(machine, asks.equipCerts, asks.operatorCerts, asks.minYear, FLEET_READINESS_OPTS);

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
  //
  // **Ownership: four rows, one per paper** (owner, 2026-08-12 — spec §5.4; the whole ruling and its
  // two warnings are written at {@link OWNERSHIP_ROW_CODES}). Each names the paper it actually means,
  // so the ask raised from a row asks for THAT paper and not for an istimara by default. All four
  // render whether held or not: the renter cannot choose a proof the surface has hidden.
  //
  // ~~`certRow({key: "doc:ownership", …, askType: "istimara"})`~~ — the single any-of row this
  // replaces. Its reasoning survives one step down, in the SCORE: `computeUnitReadiness` still counts
  // ownership once, and `attentionCount` still counts these four as one gap.
  const ownershipHeld = machine.documentKeys.filter(isOwnershipDoc);
  // Keyed by the row the paper belongs to, falling back to its own name for the ones that belong to
  // none — so the four rows and the extras below read one map and cannot file a paper twice.
  const ownershipByCode = heldByCode(ownershipHeld, (t) => ownershipRowCode(t) ?? norm(t));
  const paperRows: DocRow[] = OWNERSHIP_ROW_CODES.map((code) =>
    certRow({
      key: `doc:ownership:${code}`,
      label: docTypeLabel(code),
      held: ownershipByCode.get(code) ?? [],
      // Platform-mandatory, per `bid_readiness.dart` — never request-driven. Per ROW rather than for
      // the group, so a held paper reads green and an absent one reads red and can be asked for.
      required: true,
      // The paper the row is named after. This is the whole of the fix: the ask now says what the row
      // says, and `assertKnownDocTypes` accepts all four (`istimara` · `customs` · `sale_contract` ·
      // `saso_registration` are active catalogue rows).
      askType: code,
      anyOfGroup: OWNERSHIP_ANY_OF,
    }),
  );

  // An ownership paper the machine holds that names none of the four — `ownership`,
  // `proof_of_ownership`, `title_deed`, `combined`. It is on the file, so it is shown, under its own
  // name; nothing requires it, so it is never red and never asked for. Without this the paper would
  // simply vanish from the panel when the single any-of row went away, because the `otherHeld` bucket
  // below excludes every ownership doc by construction.
  for (const [code, held] of ownershipByCode) {
    if ((OWNERSHIP_ROW_CODES as readonly string[]).includes(code)) continue;
    paperRows.push(
      certRow({ key: `doc:ownership_other:${code}`, label: docTypeLabel(code), held, required: false, askType: code }),
    );
  }

  const equipHeld = heldByCode(machine.documentKeys.filter(isEquipmentCertDoc), canonicalCertCode);
  const equipRequested = readiness.equipmentCerts.map((c) => c.code);
  const equipRequiredSet = new Set(equipRequested);
  for (const code of unionCodes(equipRequested, equipHeld)) {
    paperRows.push(
      certRow({
        key: `doc:equipment_cert:${code}`,
        label: equipmentCertRowLabel(code),
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

  /* ── ~~the operator's documents~~ — the group left this tab on 2026-08-11; see the block above ── */

  return [
    // Both headings name the MACHINE (the app's «الوحدة» / «المعدّة» for the same thing): a renter
    // reading two stacked groups knows both belong to the machine in front of him, not to the supplier
    // or the bid — and since the operator's group left, that is true of everything on this tab.
    // Headings quoted from the app's own documents sheet (`bid_readiness_sheets.dart:2290-2311`):
    // `bidReadinessGapPhotos` (app_en.arb:8739 · app_ar.arb:6241) and `bidReadinessDocsEquipmentGroup`
    // (app_en.arb:5415 · app_ar.arb:3638 — already word-for-word what this file had).
    { key: "photos" as const, label: { en: "Unit photos", ar: "صور الوحدة" }, rows: photoRows },
    { key: "documents" as const, label: { en: "Equipment documents", ar: "مستندات المعدّة" }, rows: paperRows },
  ]
    // A group with nothing to say is not a heading with an empty body — it is absent.
    .filter((g) => g.rows.length > 0)
    .map((g) => ({ ...g, attention: attentionCount(g.rows) }));
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
