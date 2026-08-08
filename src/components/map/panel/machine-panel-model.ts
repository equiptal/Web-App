/**
 * Deal-room equipment verification (spec 004 v3) — **V7 / V8 / V9 pure model**.
 *
 * Every judgement the machine detail, the equipment-documents tab and the company panel render is
 * computed here, with **no React, no DOM and no i18n import**. The components below it only paint what
 * these functions return, which is why the six match cells, the two attention counts and the company
 * rows are unit-testable without a component harness (this repo's vitest env is `node`).
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

import { computeUnitReadiness, readinessInputsFor, type UnitReadiness } from "@/lib/contract/bid-readiness";
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
  /** The renter's required operator licence level — one free-text field, split by `readinessInputsFor`. */
  operatorCertReq?: string | null;
  /** The raw equipment-year requirement: a min year like 2020, or an age. */
  reqMinYear?: number | null;
  /** Admin-defined attachment ids the request item asked for (`attachment_ids`). */
  attachmentIds?: string[] | null;
  /** Renter free-text attachments not in the admin list (`custom_attachments`). */
  customAttachments?: string[] | null;
}

/** The four photo slots the renter is shown (§6.6). */
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
 * **These now REACH the renter.** `rentee.service.ts` used to strip `istimara` · `customs` ·
 * `customs_card` · `sale_contract` · `sales_contract` · `saso_registration` via
 * `RENTEE_HIDDEN_DOC_TYPES`; that constant and its filter were deleted when the product owner decided
 * ownership papers are renter-visible with usable urls. So a missing one is the supplier's omission,
 * not a redaction, and `ownershipCell` reads it red.
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

/** Operator-level documents. `OPERATOR_CERT_TYPES` is `operator_tuv` · `operating_license` ·
 *  `operator_spsp` · `operator_id` · `operator_insurance` — note **`operating_license` carries no
 *  `operator_` prefix**, so a prefix test alone files the operator's own licence under the equipment. */
const OPERATOR_TYPES = new Set(["operating_license", "operator_license", "operator_licence"]);

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
 * Green needs **all four**. `computeUnitReadiness.photosPresent` is a lower bar (front + plate are the
 * two mandatory slots), and it is not read here: this cell reports the four slots the renter is shown,
 * so a "3 of 4" that rendered green would contradict its own text on screen.
 */
function photosCell(machine: FleetMachine): MatchCell {
  const have = presentPhotoSlots(machine).length;
  const total = PHOTO_SLOTS.length;
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
 * rather than the supplier's omission. **That filter is gone** — the product owner decided ownership
 * documents are renter-visible with usable urls, and `rentee.service.ts` no longer contains the
 * constant or its filter. So an absent ownership paper is now a real gap the supplier can close, which
 * is exactly what red is for, and the documents tab can request it.
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
    const code = certCode(d.type);
    if (seen.has(code)) continue;
    seen.add(code);
    out.push(CERT_CHIP_LABEL[code] ?? { en: code.toUpperCase(), ar: code.toUpperCase() });
  }
  return out;
}

/** Collapse a raw doc type onto the chip it prints — the SASO family is one chip, not three. */
function certCode(type: string): string {
  const t = norm(type);
  if (t === "tüv") return "tuv";
  if (t.startsWith("saso")) return "saso";
  return t;
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

/* ───────────────────────────── V8 — equipment documents ───────────────────────────── */

/**
 * **Presence only** (§6.6, AC-39). `documentKeys` entries carry `verifyStatus` and `expiryDate` and
 * this surface renders neither: a machine's paper is either there or it isn't, and a verification badge
 * would invite the renter to judge a supplier on a state the platform sets, not one the supplier
 * controls. The fields exist on the wire; nothing below reads them.
 */
export type PresenceStatus = "present" | "missing";

export interface DocRow {
  key: string;
  label: Bilingual;
  status: PresenceStatus;
  /** The presence sentence — "uploaded" / "not uploaded" for photos, "on the machine's file" /
   *  "no document yet" for documents. Never a verification word. */
  statusLine: Bilingual;
  /** Thumbnail source: a photo's own image, or null for a paper (the row draws a document glyph). */
  thumbUrl: string | null;
  /** The row's **one** presigned url — view and download both point at it (`docRowActions`). Null when
   *  the machine holds no such file, and then the row exposes neither control (AC-69). */
  downloadUrl: string | null;
  /** The wire type(s) this row stands for — what a batch request names when the row is ticked. */
  docTypes: string[];
}

export type DocGroupKey = "photos" | "documents";

export interface DocGroup {
  key: DocGroupKey;
  label: Bilingual;
  rows: DocRow[];
  /** **Rows needing action, never a total** (§6.1, AC-42). Zero means nothing is outstanding. */
  attention: number;
}

/** Rows needing action. The one definition, used by both document surfaces. */
export function attentionCount(rows: { status: PresenceStatus | CompanyDocStatus }[]): number {
  return rows.filter((r) => r.status === "missing").length;
}

/* ─────────────────── V15 — every document is openable (004a §7, RM3-AC-69) ─────────────────── */

/**
 * What a document row lets the renter do with the file behind it.
 *
 * **View is primary, download secondary.** A renter checking paperwork wants to *look* — "download" is
 * the wrong first act for a PDF or a photo, especially on a phone. Reversing the two would make the
 * common act the effortful one.
 */
export type DocActionKind = "view" | "download";

export interface DocAction {
  kind: DocActionKind;
  /** The row's one presigned url. View and download point at the **same** object; only the verb
   *  differs, because a presigned url's signature covers its query string — there is no second url to
   *  ask S3 for an attachment disposition after the fact. */
  href: string;
  /** The row's primary act. Exactly one action carries it, and it is always `view`. */
  primary: boolean;
  /** Sets the anchor's `download` attribute. A cross-origin bucket ignores it unless the object was
   *  signed with `Content-Disposition: attachment`, in which case the browser saves instead of
   *  rendering — harmless either way, which is why both anchors also open in a new tab. */
  download: boolean;
}

/**
 * The controls one document row exposes (AC-69).
 *
 * **A row with no url exposes neither** — never a dead control. That absence is also the honest signal
 * that a paper is missing, which is the one row the renter can act on: he ticks it and asks.
 *
 * Deliberately shape-typed rather than taking `DocRow | CompanyDocRow`, because it must serve all three
 * families this surface names — the machine's papers, its photos, and the firm's papers — and they
 * agree on exactly one field.
 */
export function docRowActions(row: { downloadUrl: string | null }): DocAction[] {
  const href = row.downloadUrl;
  if (!href) return [];
  return [
    { kind: "view", href, primary: true, download: false },
    { kind: "download", href, primary: false, download: true },
  ];
}

const PHOTO_LABEL: Record<PhotoSlot, Bilingual> = {
  front: { en: "Front", ar: "أمامية" },
  plate: { en: "Plate / serial", ar: "اللوحة والرقم التسلسلي" },
  meter: { en: "Hour meter", ar: "العدّاد" },
  side: { en: "Side", ar: "جانبية" },
};

const PRESENT_PHOTO: Bilingual = { en: "uploaded", ar: "مرفوعة" };
const ABSENT_PHOTO: Bilingual = { en: "not uploaded", ar: "غير مرفوعة" };
const PRESENT_DOC: Bilingual = { en: "on the machine's file", ar: "على ملف المعدّة" };
const ABSENT_DOC: Bilingual = { en: "no document yet", ar: "لا يوجد مستند بعد" };

/**
 * The two groups of §6.6, each with its own attention count.
 *
 * Both groups have a **fixed row set** — the four photo slots, and the three papers §6.6 names. A row
 * per uploaded file would make the list shorter the worse the supplier's file is, which is backwards:
 * the renter needs to see what is missing, and only a fixed set can show an absence.
 */
export function equipmentDocGroups(machine: FleetMachine): DocGroup[] {
  const photoBySlot = new Map<PhotoSlot, { url: string | null; slot: string }>();
  for (const p of machine.photoKeys) {
    const slot = photoSlotOf(p.slot);
    if (slot && !photoBySlot.has(slot)) photoBySlot.set(slot, { url: p.url, slot: p.slot });
  }
  const photoRows: DocRow[] = PHOTO_SLOTS.map((slot) => {
    const held = photoBySlot.get(slot);
    return {
      key: `photo:${slot}`,
      label: PHOTO_LABEL[slot],
      status: held ? "present" : "missing",
      statusLine: held ? PRESENT_PHOTO : ABSENT_PHOTO,
      thumbUrl: held?.url ?? null,
      downloadUrl: held?.url ?? null,
      docTypes: [held?.slot ?? slot],
    };
  });

  const docRow = (key: string, label: Bilingual, held: OfferedUnitDoc[], fallbackType: string): DocRow => ({
    key,
    label,
    status: held.length > 0 ? "present" : "missing",
    statusLine: held.length > 0 ? PRESENT_DOC : ABSENT_DOC,
    thumbUrl: null,
    downloadUrl: held.find((d) => d.url)?.url ?? null,
    docTypes: held.length > 0 ? held.map((d) => d.type) : [fallbackType],
  });

  const paperRows: DocRow[] = [
    docRow(
      "doc:ownership",
      { en: "Proof of ownership / registration", ar: "إثبات الملكية / التسجيل" },
      machine.documentKeys.filter(isOwnershipDoc),
      "istimara",
    ),
    docRow(
      "doc:equipment_cert",
      { en: "Equipment safety certificate", ar: "شهادة سلامة المعدّة" },
      machine.documentKeys.filter(isEquipmentCertDoc),
      "equipment_safety_certificate",
    ),
    docRow(
      "doc:operator_cert",
      { en: "Operator safety certificate", ar: "شهادة سلامة المشغّل" },
      machine.documentKeys.filter(isOperatorDoc),
      "operator_safety_certificate",
    ),
  ];

  return [
    { key: "photos", label: { en: "Photos", ar: "الصور" }, rows: photoRows, attention: attentionCount(photoRows) },
    { key: "documents", label: { en: "Documents", ar: "المستندات" }, rows: paperRows, attention: attentionCount(paperRows) },
  ];
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
 * **IBAN is deliberately absent.** Spec §6.1 and AC-41 both name it, and the product owner has since
 * decided to remove it — so the smaller, less-revealing surface wins and the spec needs editing. Adding
 * a row back is a one-line change; un-showing a supplier's bank details after the fact is not.
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

/** Build the one batch document request for a set of ticked rows on ONE machine. Returns null when
 *  nothing is ticked, so a caller can disable its send control from the same source of truth that
 *  builds the payload. */
export function batchDocumentRequest(
  equipmentId: string,
  rows: { key: string; label: Bilingual; docTypes: string[] }[],
  selected: ReadonlySet<string>,
): PanelRequestDraft | null {
  const picked = rows.filter((r) => selected.has(r.key));
  if (picked.length === 0) return null;
  return {
    kind: "document",
    equipmentId,
    docTypes: [...new Set(picked.flatMap((r) => r.docTypes).filter((t) => t.trim() !== ""))],
    labels: picked.map((r) => r.label),
  };
}
