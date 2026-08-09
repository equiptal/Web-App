/**
 * Bid readiness — RENTEE-SUBSET, read-only (ported from the app's bid_readiness.dart).
 *
 * Per offered unit, answers "does this unit hold what the request asks for?" — mandatory photos +
 * the requested equipment / operator certs. Proof-of-ownership is EXCLUDED (the backend strips it from
 * the renter's `offeredUnitsDetail`, so scoring it would hold every supplier permanently short). Scoring
 * is presence-based (a held key counts; verify status only decorates). Purely client-side — no backend
 * readiness number exists. Applies only to NATIVE app bids (those carrying `offeredUnitsDetail`).
 *
 * **The app is the reference implementation** (owner's ruling, 2026-08-08: *"fix the web to be like the
 * app — always align with the app"*). The two families of certificate are matched differently and that
 * split is the app's, not an invention here: an EQUIPMENT cert is asked for and matched by family
 * (`canonicalCertCode`), while an OPERATOR cert is asked for by request code, translated into the
 * document kind that code stands for (`OPERATOR_REQ_CODE_TO_DOC_KIND`), and matched against the
 * machine's raw document type exactly. Anything the operator table does not know is dropped, not scored.
 */

import type { BidCard, OfferedUnitDetail } from "./bids";

export type ReadinessBand = "green" | "yellow" | "red";

export interface ReadinessCert {
  code: string;
  labelEn: string;
  labelAr: string;
  present: boolean;
  /** Presigned URL of the held doc backing this cert (tap to open); null when missing. */
  url: string | null;
}

export interface UnitReadiness {
  equipmentId: string;
  titleEn: string;
  titleAr: string;
  year: number | null;
  reqMinYear: number | null;
  yearConflict: boolean;
  photosPresent: boolean;
  photos: { slot: string; url: string | null }[];
  equipmentCerts: ReadinessCert[];
  operatorCerts: ReadinessCert[];
  done: number;
  total: number;
  percent: number;
  band: ReadinessBand;
}

export interface BidReadiness {
  units: UnitReadiness[];
  readyCount: number; // units fully ready (band === green)
  committed: number; // units offered
  requested: number; // request numberOfUnits
  percent: number; // aggregate = round(Σdone / Σtotal · 100)
  band: ReadinessBand;
}

const EQ_CERT_LABELS: Record<string, { en: string; ar: string }> = {
  tuv: { en: "TÜV", ar: "TÜV" },
  aramco: { en: "Aramco Certified", ar: "معتمد من أرامكو" },
  spsp: { en: "SPSP", ar: "SPSP" },
  saso: { en: "SASO", ar: "شهادة SASO" },
  saso_technical_inspection: { en: "SASO technical", ar: "فحص ساسو الفني" },
};

/**
 * Requested operator-cert codes (the request item's `operatorLicenseLevel`) → **the operator document
 * kind a machine can actually hold**.
 *
 * Ported verbatim from the app's `kOperatorReqCodeToDocKind` (`bid_readiness.dart`), which is the
 * reference implementation (owner's ruling, 2026-08-08: *"fix the web to be like the app"*). SASO has
 * no operator kind, so it is deliberately absent; the legacy `CERTIFIED` / `SAFETY_CERT` / `SAFETY`
 * spellings all mean the operating licence.
 *
 * **A code that is not in this table is DROPPED, not scored** — see `requestedOperatorCertKinds`.
 */
export const OPERATOR_REQ_CODE_TO_DOC_KIND: Record<string, string> = {
  TUV: "operator_tuv",
  SPSP: "operator_spsp",
  CERTIFIED: "operating_license",
  SAFETY_CERT: "operating_license",
  SAFETY: "operating_license",
};

/** Labels for the operator DOCUMENT KINDS above — the app's own wording (`docCertOperator*`). Keyed by
 *  doc kind, never by `canonicalCertCode`: operator papers are a separate vocabulary. */
const OPERATOR_CERT_LABELS: Record<string, { en: string; ar: string }> = {
  operator_tuv: { en: "Operator TÜV", ar: "شهادة TUV للمشغّل" },
  operator_spsp: { en: "Operator SPSP", ar: "شهادة SPSP للمشغّل" },
  operating_license: { en: "Operating licence", ar: "رخصة تشغيل" },
};

/**
 * The operator DOCUMENT KINDS a request asks for, from its raw `operatorLicenseLevel` string.
 *
 * **The app's rule, ported as-is** (`requestedOperatorCertKinds` in `bid_readiness.dart`): split on
 * commas, trim, uppercase, drop blanks, map through `OPERATOR_REQ_CODE_TO_DOC_KIND`, and **drop
 * anything the table does not know**. Deduped, in first-seen order (Dart's `Set` is insertion-ordered,
 * so the app produces the same order).
 *
 * Dropping is the load-bearing half. An unmapped code (`GRADE-1`, `OPERATING_LICENSE`, free text the
 * renter typed) names no document a machine can carry, so scoring it would hold every lessor
 * permanently one key short — a red the supplier cannot clear by uploading anything. The app has always
 * dropped it; the web used to keep it and score it red forever.
 */
export function requestedOperatorCertKinds(raw: string | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of String(raw ?? "").split(",")) {
    const code = token.trim().toUpperCase();
    if (!code) continue;
    const kind = OPERATOR_REQ_CODE_TO_DOC_KIND[code];
    if (!kind || seen.has(kind)) continue;
    seen.add(kind);
    out.push(kind);
  }
  return out;
}

/**
 * Normalize a cert code or doc-type token to a canonical **equipment**-cert key (tuv/aramco/spsp/saso).
 *
 * **Exported because the machine panel's document rows are keyed by exactly this code.** The rows are
 * the union of the certs the request asked for and the certs the machine holds, so the two halves have
 * to fold identically — a second normaliser is how a held `operator_tuv` stops answering an asked-for
 * `TÜV` and the renter is shown a gap the scorer says is filled.
 *
 * ⚠️ **Equipment only.** Operator asks do NOT come through here — they go through
 * `requestedOperatorCertKinds` and match the machine's raw document type exactly, because that is what
 * the app does. Widening this function to serve both is how the two families start borrowing each
 * other's verdicts.
 */
export function canonicalCertCode(x: string): string {
  const t = x.trim().toLowerCase().replace(/[\s-]+/g, "_").replace(/^operator_/, "");
  if (t.startsWith("aramco")) return "aramco";
  if (t.startsWith("saso")) return "saso"; // saso, saso_technical_inspection → saso family
  if (t === "tüv") return "tuv";
  return t;
}

/**
 * Fold a **held** document type — the raw `documents[].type` string `bids.ts` copies off the wire
 * verbatim — to the one spelling both branches of the scorer test against.
 *
 * Trim, lowercase, and collapse spaces and hyphens to `_`. That is deliberately the same fold as
 * `machine-panel-model.ts`'s `norm`, and it produces exactly the vocabulary
 * `OPERATOR_REQ_CODE_TO_DOC_KIND` emits on the ask side (`operator_tuv` · `operator_spsp` ·
 * `operating_license`), so a held paper and the ask for it meet as the same string.
 *
 * **Why it has to be one fold and not two.** The equipment bucket keyed on `canonicalCertCode` (which
 * normalises) while the operator bucket keyed on the raw type (which does not), and the `isOp` test
 * that routes between them ran on a lowercased copy of a string neither map was keyed by. A held
 * `OPERATOR_TUV`, or `" operator_tuv"` with a leading space, was therefore pushed out of the equipment
 * bucket by `isOp` **and** missed by the operator bucket's exact-equality lookup — the paper scored in
 * neither, and read red on every readiness surface for a machine that holds it.
 *
 * ⚠️ **Held vocabulary only.** This never touches `OPERATOR_REQ_CODE_TO_DOC_KIND`: the request-code →
 * doc-kind translation is a verbatim port of `bid_readiness.dart` and stays exactly as the app writes
 * it. This normalises how the MACHINE's papers are spelled, not what the request asks for.
 */
const heldDocType = (s: string): string => s.trim().toLowerCase().replace(/[\s-]+/g, "_");

const bandOf = (percent: number): ReadinessBand => (percent >= 100 ? "green" : percent >= 50 ? "yellow" : "red");
const certLabel = (code: string): { labelEn: string; labelAr: string } => {
  const l = EQ_CERT_LABELS[code] ?? { en: code.toUpperCase(), ar: code.toUpperCase() };
  return { labelEn: l.en, labelAr: l.ar };
};
/** An operator doc kind's chip label. Separate from `certLabel` because the codes are document kinds
 *  (`operator_tuv`), not equipment-cert families — `certLabel` would shout `OPERATOR_TUV` at the renter. */
const operatorCertLabel = (kind: string): { labelEn: string; labelAr: string } => {
  const l = OPERATOR_CERT_LABELS[kind];
  return l ? { labelEn: l.en, labelAr: l.ar } : certLabel(kind);
};

/**
 * Score ONE machine against the request's asks. **Exported for RMAP T16**, which scores fleet machines
 * the bid never offered: those have no `BidCard` of their own, so `computeBidReadiness` (which reads
 * the request-side asks off a bid) cannot reach them. There must be exactly one scorer — a second one
 * would let the pin's readiness bar and the bid card's readiness badge disagree about the same machine.
 *
 * The request-side arguments are the SAME three `computeBidReadiness` derives; use
 * `readinessInputsFor` to derive them so the normalisation cannot drift either.
 *
 * `computeBidReadiness`'s behaviour is unchanged by this export — the mobile app mirrors that function
 * in `bid_readiness.dart`, and only the name and visibility of this helper moved.
 */
export function computeUnitReadiness(
  unit: OfferedUnitDetail,
  reqEquipCerts: string[],
  reqOperatorCertKinds: string[],
  reqMinYear: number | null,
): UnitReadiness {
  // Equipment certs fold through `canonicalCertCode`; operator-prefixed papers stay OUT of that bucket
  // so a held `operator_tuv` can never answer an equipment TÜV ask.
  const eqDocByCert = new Map<string, string | null>(); // canonical equipment cert → presigned url
  // The machine's document types, folded through `heldDocType` — the SAME fold that decides `isOp`, so
  // the two branches partition the papers instead of each disowning the same one. The operator match
  // below is still `docTypes.contains(kind)`, an exact equality; what changed is that both sides of
  // that equality are now spelled the one way.
  const docTypeUrl = new Map<string, string | null>();
  for (const d of unit.documentKeys) {
    const type = heldDocType(d.type);
    const isOp = type.startsWith("operator");
    if (!isOp) eqDocByCert.set(canonicalCertCode(type), d.url ?? null);
    docTypeUrl.set(type, d.url ?? null);
  }

  const equipmentCerts: ReadinessCert[] = reqEquipCerts.map((c) => {
    const code = canonicalCertCode(c);
    const present = eqDocByCert.has(code);
    return { code, ...certLabel(code), present, url: present ? eqDocByCert.get(code) ?? null : null };
  });
  // `reqOperatorCertKinds` are already DOCUMENT KINDS (`readinessInputsFor` → `requestedOperatorCertKinds`),
  // so this is the app's `docTypes.contains(kind)` and nothing else. It used to run the ask through
  // `canonicalCertCode` and hunt for a doc of that name, which is why an asked-for `CERTIFIED` looked for
  // a paper called `certified` that no machine has ever carried and read red against a lessor whose own
  // app read green.
  const operatorCerts: ReadinessCert[] = reqOperatorCertKinds.map((kind) => {
    const present = docTypeUrl.has(kind);
    return { code: kind, ...operatorCertLabel(kind), present, url: present ? docTypeUrl.get(kind) ?? null : null };
  });

  const front = unit.photoKeys.some((p) => /front/i.test(p.slot));
  const serial = unit.photoKeys.some((p) => /serial|plate/i.test(p.slot));
  const photosPresent = front && serial;

  const total = 1 + equipmentCerts.length + operatorCerts.length; // 1 = mandatory photos (poo excluded)
  const done = (photosPresent ? 1 : 0) + equipmentCerts.filter((c) => c.present).length + operatorCerts.filter((c) => c.present).length;
  const percent = total > 0 ? Math.round((done / total) * 100) : 100;

  // reqMinYear is the raw request value: a real min year (e.g. 2020) or an age. Only flag a conflict
  // when it clearly reads as a YEAR, to avoid false reds on age-based requests.
  const looksLikeYear = reqMinYear != null && reqMinYear >= 1990;
  const yearConflict = !!(looksLikeYear && unit.year != null && unit.year < (reqMinYear as number));

  const title = [unit.manufacturer, unit.modelName].filter(Boolean).join(" ").trim();
  const titleEn = title || unit.subcategoryName || "Equipment";
  const titleAr = title || unit.subcategoryNameAr || unit.subcategoryName || "المعدة";

  return {
    equipmentId: unit.equipmentId,
    titleEn,
    titleAr,
    year: unit.year,
    reqMinYear: looksLikeYear ? reqMinYear : null,
    yearConflict,
    photosPresent,
    photos: unit.photoKeys.map((p) => ({ slot: p.slot, url: p.url })),
    equipmentCerts,
    operatorCerts,
    done,
    total,
    percent,
    band: bandOf(percent),
  };
}

/** The three request-side asks a machine is scored against. */
export interface ReadinessInputs {
  /** Canonicalised equipment-cert codes the request asked for. */
  equipCerts: string[];
  /**
   * Operator **document kinds** the request asked for (`operator_tuv` · `operator_spsp` ·
   * `operating_license`) — already translated out of the renter's request codes by
   * `requestedOperatorCertKinds`, with unmapped codes dropped. NOT raw ask tokens.
   */
  operatorCerts: string[];
  /** The raw equipment-year requirement (a min year like 2020, or an age). */
  minYear: number | null;
}

/**
 * Derive the request-side asks from anything carrying them. Extracted verbatim out of
 * `computeBidReadiness` so RMAP T16 can score a fleet machine the bid never offered with exactly the
 * same normalisation — `canonicalCertCode` folds `saso_technical_inspection` into `saso`, and the
 * operator ask is one free-text field that has to be split and translated into document kinds before it
 * can be matched.
 *
 * The two families normalise differently **on purpose** and this is the app's own split: an equipment
 * cert is asked for by family and matched by family; an operator cert is asked for by request code and
 * matched by the exact document kind that code stands for.
 */
export function readinessInputsFor(src: {
  reqEquipmentCerts?: string[] | null;
  operatorCertReq?: string | null;
  reqMinYear?: number | null;
}): ReadinessInputs {
  return {
    equipCerts: (src.reqEquipmentCerts ?? []).map(canonicalCertCode),
    operatorCerts: requestedOperatorCertKinds(src.operatorCertReq),
    minYear: src.reqMinYear ?? null,
  };
}

/** Compute readiness for a bid. Returns null for off-platform / non-unit bids (no `offeredUnitsDetail`). */
export function computeBidReadiness(bid: BidCard): BidReadiness | null {
  const detail = bid.offeredUnitsDetail;
  if (!detail || detail.length === 0) return null;

  const { equipCerts: reqEquipCerts, operatorCerts: reqOperatorCerts } = readinessInputsFor(bid);

  const units = detail.map((u) => computeUnitReadiness(u, reqEquipCerts, reqOperatorCerts, bid.reqMinYear));
  const sumDone = units.reduce((a, u) => a + u.done, 0);
  const sumTotal = units.reduce((a, u) => a + u.total, 0);
  const percent = sumTotal > 0 ? Math.round((sumDone / sumTotal) * 100) : 100;
  const readyCount = units.filter((u) => u.band === "green" && !u.yearConflict).length;

  return {
    units,
    readyCount,
    committed: units.length,
    requested: bid.numberOfUnits,
    percent,
    band: bandOf(percent),
  };
}
