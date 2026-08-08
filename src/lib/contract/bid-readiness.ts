/**
 * Bid readiness — RENTEE-SUBSET, read-only (ported from the app's bid_readiness.dart).
 *
 * Per offered unit, answers "does this unit hold what the request asks for?" — mandatory photos +
 * the requested equipment / operator certs. Proof-of-ownership is EXCLUDED (the backend strips it from
 * the renter's `offeredUnitsDetail`, so scoring it would hold every supplier permanently short). Scoring
 * is presence-based (a held key counts; verify status only decorates). Purely client-side — no backend
 * readiness number exists. Applies only to NATIVE app bids (those carrying `offeredUnitsDetail`).
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
 * Normalize a cert code or doc-type token to a canonical equipment-cert key (tuv/aramco/spsp/saso).
 *
 * **Exported because the machine panel's document rows are keyed by exactly this code.** The rows are
 * the union of the certs the request asked for and the certs the machine holds, so the two halves have
 * to fold identically — a second normaliser is how a held `operator_tuv` stops answering an asked-for
 * `TÜV` and the renter is shown a gap the scorer says is filled.
 */
export function canonicalCertCode(x: string): string {
  const t = x.trim().toLowerCase().replace(/[\s-]+/g, "_").replace(/^operator_/, "");
  if (t.startsWith("aramco")) return "aramco";
  if (t.startsWith("saso")) return "saso"; // saso, saso_technical_inspection → saso family
  if (t === "tüv") return "tuv";
  return t;
}

const bandOf = (percent: number): ReadinessBand => (percent >= 100 ? "green" : percent >= 50 ? "yellow" : "red");
const certLabel = (code: string): { labelEn: string; labelAr: string } => {
  const l = EQ_CERT_LABELS[code] ?? { en: code.toUpperCase(), ar: code.toUpperCase() };
  return { labelEn: l.en, labelAr: l.ar };
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
  reqOperatorCerts: string[],
  reqMinYear: number | null,
): UnitReadiness {
  // Split the unit's held docs into operator-level vs equipment-level, keyed by canonical cert.
  const eqDocByCert = new Map<string, string | null>(); // cert → presigned url
  const opDocByCert = new Map<string, string | null>();
  for (const d of unit.documentKeys) {
    const isOp = d.type.trim().toLowerCase().startsWith("operator");
    const cert = canonicalCertCode(d.type);
    (isOp ? opDocByCert : eqDocByCert).set(cert, d.url ?? null);
  }

  const equipmentCerts: ReadinessCert[] = reqEquipCerts.map((c) => {
    const code = canonicalCertCode(c);
    const present = eqDocByCert.has(code);
    return { code, ...certLabel(code), present, url: present ? eqDocByCert.get(code) ?? null : null };
  });
  const operatorCerts: ReadinessCert[] = reqOperatorCerts.map((c) => {
    const code = canonicalCertCode(c);
    const present = opDocByCert.has(code) || eqDocByCert.has(code); // fall back if not operator-prefixed
    return { code, ...certLabel(code), present, url: present ? opDocByCert.get(code) ?? eqDocByCert.get(code) ?? null : null };
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
  /** Operator-cert tokens the request asked for (the raw licence-level string, split). */
  operatorCerts: string[];
  /** The raw equipment-year requirement (a min year like 2020, or an age). */
  minYear: number | null;
}

/**
 * Derive the request-side asks from anything carrying them. Extracted verbatim out of
 * `computeBidReadiness` so RMAP T16 can score a fleet machine the bid never offered with exactly the
 * same normalisation — `normCert` folds `saso_technical_inspection` into `saso`, and the operator ask
 * is one free-text field that has to be split before it can be matched.
 */
export function readinessInputsFor(src: {
  reqEquipmentCerts?: string[] | null;
  operatorCertReq?: string | null;
  reqMinYear?: number | null;
}): ReadinessInputs {
  return {
    equipCerts: (src.reqEquipmentCerts ?? []).map(canonicalCertCode),
    operatorCerts: String(src.operatorCertReq ?? "")
      .split(/[,/]/)
      .map((s) => s.trim())
      .filter(Boolean),
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
