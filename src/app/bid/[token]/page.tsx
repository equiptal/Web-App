"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { fetchBidFormData, submitBidForm, type BidUploadedFile } from "@/lib/api/client";
import type { BidFormData, BidFormItem, BidPhotoKind, BidDocKind, CompanyDocKind } from "@/lib/contract/link-bids";
import { buildSubmissionNotes, priceToStore } from "@/lib/contract/vat-inclusive";
import { FileUploader, type UploaderKind } from "@/components/bid/FileUploader";
import { QualityRing } from "@/components/bid/QualityRing";
import { computeBidQuality } from "@/lib/contract/bid-quality";
import { BID_FORM_CSS } from "@/components/bid/bidFormStyles";

/**
 * web-app/006 — PUBLIC supplier bid form (spec "Layout B": supplier-bid-v2.html). An off-platform
 * supplier opens the renter's shared link `/bid/{slug}-{groupId}`, sees the request's project terms +
 * per-item terms (wide table) + pricing, enters company details, and submits. Stored independently.
 * Bilingual (?lang=ar) + RTL. Closed (AC-11/12) / countdown (AC-10) / already-submitted (AC-33) states.
 */

const TERM_KEYS = ["operator", "nationality", "fatFood", "fatTransport", "fuel", "fuelType", "year", "operatorCert", "equipmentCert"] as const;
type TermKey = (typeof TERM_KEYS)[number];
const TERM_LABEL: Record<TermKey, [string, string]> = {
  operator: ["Operator", "المشغّل"],
  nationality: ["Operator nationality", "جنسية المشغّل"],
  fatFood: ["Food (F.A.T)", "الطعام"],
  fatTransport: ["Accommodation & transport", "السكن والمواصلات"],
  fuel: ["Fuel responsibility", "مسؤولية الوقود"],
  fuelType: ["Fuel type", "نوع الوقود"],
  year: ["Equipment year", "سنة الصنع"],
  operatorCert: ["Operator certificate", "شهادة المشغّل"],
  equipmentCert: ["Equipment certificate", "شهادة المعدة"],
};
const UNIT_LABEL: Record<string, [string, string]> = {
  PER_DAY: ["day", "يوم"], PER_WEEK: ["week", "أسبوع"], PER_MONTH: ["month", "شهر"], PER_JOB: ["job", "مهمة"],
};
const num = (v: string) => (v.trim() && Number.isFinite(Number(v)) ? Number(v) : 0);

// The supplier "Quote valid until" field. Enabled now that the link_bid_submissions.valid_until
// migration (20260629000000) is on staging and the submit handler persists it end-to-end.
const QUOTE_EXPIRY_ENABLED = true;

type Answer = {
  confirmations: Partial<Record<TermKey, boolean>>;
  rentalRate: string;
  deliveryPrice: string;
  returnPrice: string;
  /** Partial bid: units this supplier offers on this line (1..numberOfUnits). Defaults to the full count. */
  offeredUnits: string;
};

// Per-item uploaded attachments (equipment photos + the three per-item document groups). Equipment/
// operator cert groups are only collected when the request item requires them (gated in the UI).
// Per-item attachments: equipment photos + proof-of-ownership (free-classify), and certificate docs
// keyed by the request-driven slot code (tuv/spsp/saso/other + operator_* variants).
type ItemAtt = { photos: BidUploadedFile[]; ownership: BidUploadedFile[]; certs: Record<string, BidUploadedFile[]> };
const EMPTY_ATT: ItemAtt = { photos: [], ownership: [], certs: {} };

/** Normalize a request cert token → canonical tuv/spsp/saso, or null for free-text "other". */
function normReqCert(raw: string): "tuv" | "spsp" | "saso" | null {
  const s = raw.trim().toLowerCase();
  if (s.startsWith("tuv")) return "tuv";
  if (s.startsWith("spsp")) return "spsp";
  if (s.startsWith("saso")) return "saso";
  return null;
}
/** Parse a required-cert string ("tuv, spsp" / "TUV, SASO" / "Other") into distinct labeled slots.
 *  prefix = "" for equipment certs, "operator_" for operator certs (keeps the stored type distinct). */
function parseCertSlots(raw: string | null | undefined, prefix: "" | "operator_"): { code: string; base: string; raw: string }[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: { code: string; base: string; raw: string }[] = [];
  for (const tok of String(raw).split(",").map((t) => t.trim()).filter(Boolean)) {
    const base = normReqCert(tok);
    const code = `${prefix}${base ?? "other"}`;
    if (seen.has(code)) continue;
    seen.add(code);
    out.push({ code, base: base ?? "other", raw: tok });
  }
  return out;
}
const CERT_BASE_LABEL: Record<string, [string, string]> = {
  tuv: ["TÜV", "فحص TÜV"], spsp: ["SPSP", "SPSP"], saso: ["SASO", "ساسو"], other: ["Other", "أخرى"],
};

// Per-section colour identity for the attachment cards (matches the uploader accent CSS vars).
const ATT_ACCENT = {
  photo: { c: "#e8830c", bg: "#fff7ed", bd: "#f6d5a8" },
  own: { c: "#2563eb", bg: "#eef4ff", bd: "#c7d8fb" },
  eqc: { c: "#0e9384", bg: "#ecfdf8", bd: "#9fe0d2" },
  opc: { c: "#7c3aed", bg: "#f5f2ff", bd: "#dccdfb" },
  co: { c: "#475569", bg: "#f1f5f9", bd: "#cbd5e1" },
} as const;

/** A coloured attachment card — icon tile + title + description + Required/Optional pill, then the uploader. */
function AttachSection({ icon, accent, title, desc, pill, tone = "opt", children }: {
  icon: string;
  accent: { c: string; bg: string; bd: string };
  title: React.ReactNode;
  desc?: React.ReactNode;
  pill: string;
  tone?: "req" | "opt";
  children: React.ReactNode;
}) {
  return (
    <div className="att-card">
      <div className="att-hd">
        <span className="att-tile material-icons-outlined" style={{ background: accent.bg, color: accent.c }}>{icon}</span>
        <div><div className="att-tt">{title}</div>{desc && <div className="att-dd">{desc}</div>}</div>
        <span className={`att-pill ${tone}`}>{pill}</span>
      </div>
      <div className="att-body">{children}</div>
    </div>
  );
}

export default function BidFormPage({ params }: { params: Promise<{ token: string }> }) {
  const { token: rawToken } = use(params);
  // The URL is /bid/{slug}-{groupId}; the token is the trailing UUID (group id).
  const token = rawToken.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0] ?? rawToken;

  const sp = useSearchParams();
  const [lang, setLang] = useState<"en" | "ar">(sp.get("lang") === "ar" ? "ar" : "en");
  const ar = lang === "ar";
  const L = (e: string, a: string) => (ar ? a : e);
  const nf = (n: number) => new Intl.NumberFormat(ar ? "ar-EG" : "en-US").format(Math.round(n));

  const [data, setData] = useState<BidFormData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [contract, setContract] = useState<Record<string, boolean>>({});
  const [company, setCompany] = useState({ companyName: "", crNumber: "", vatNumber: "", nationalAddress: "", contactInfo: "", notes: "", validUntil: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [yesItem, setYesItem] = useState<Record<string, boolean>>({}); // per-item "Yes to all this item's terms"
  const [yesContract, setYesContract] = useState(false); // "Yes to all" for the for-all-items contract terms
  // Some suppliers quote prices that ALREADY include 15% VAT. When on, the prices entered below are
  // treated as VAT-inclusive (gross) — we strip the VAT back out on submit so the stored bid stays
  // VAT-exclusive like every on-platform bid, and the renter side reproduces the same total.
  const [vatIncluded, setVatIncluded] = useState(false);
  // Uploaded attachments: per-item (photos + doc groups) + submission-level company-verification docs.
  const [att, setAtt] = useState<Record<string, ItemAtt>>({});
  const setItemAtt = (id: string, part: "photos" | "ownership", next: BidUploadedFile[]) =>
    setAtt((p) => ({ ...p, [id]: { ...(p[id] ?? EMPTY_ATT), [part]: next } }));
  const setItemCert = (id: string, code: string, next: BidUploadedFile[]) =>
    setAtt((p) => { const cur = p[id] ?? EMPTY_ATT; return { ...p, [id]: { ...cur, certs: { ...cur.certs, [code]: next } } }; });
  const itemAtt = (id: string) => att[id] ?? EMPTY_ATT;
  // Company verification (submission-level): CR / VAT / National Address are each text OR a doc; plus
  // optional extra company docs (Local Content / SASO heavy equipment / Other).
  const [coCr, setCoCr] = useState<BidUploadedFile[]>([]);
  const [coVat, setCoVat] = useState<BidUploadedFile[]>([]);
  const [coAddr, setCoAddr] = useState<BidUploadedFile[]>([]);
  const [coExtra, setCoExtra] = useState<BidUploadedFile[]>([]);
  const [coMode, setCoMode] = useState<{ cr: "text" | "doc"; vat: "text" | "doc"; addr: "text" | "doc" }>({ cr: "text", vat: "text", addr: "text" });
  // Suppliers may submit more than one bid per request (e.g. alternative options) — no single-submission lock.

  useEffect(() => {
    let alive = true;
    fetchBidFormData(token)
      .then((d) => {
        if (!alive) return;
        setData(d);
        const init: Record<string, Answer> = {};
        for (const it of d.items) {
          // No default — the supplier must explicitly answer Yes/No on each term (starts unselected/grey).
          init[it.requestItemId] = { confirmations: {}, rentalRate: "", deliveryPrice: "", returnPrice: "", offeredUnits: String(it.numberOfUnits || 1) };
        }
        setAnswers(init);
        setContract({});
      })
      .catch(() => alive && setNotFound(true))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [token]);

  const itemTerms = (it: BidFormItem) => TERM_KEYS.filter((k) => it.requiredTerms[k] != null);
  const setConf = (id: string, k: TermKey, v: boolean) => setAnswers((p) => ({ ...p, [id]: { ...p[id], confirmations: { ...p[id].confirmations, [k]: v } } }));
  const setPrice = (id: string, field: "rentalRate" | "deliveryPrice" | "returnPrice", v: string) => setAnswers((p) => ({ ...p, [id]: { ...p[id], [field]: v } }));
  const setOffered = (id: string, v: string) => setAnswers((p) => ({ ...p, [id]: { ...p[id], offeredUnits: v } }));
  // Units this line offers — parsed + clamped to 1..numberOfUnits; defaults to the full requested count.
  const offeredQty = (it: BidFormItem, a?: Answer) => { const max = it.numberOfUnits || 1; const nq = Math.round(num(a?.offeredUnits ?? "")); return nq >= 1 && nq <= max ? nq : max; };

  // Per-item "Yes to all" — toggles all of THIS item's terms Yes; off clears them so they can answer
  // individually. Lives below each item header (next to its Terms subhead).
  const toggleItemYes = (it: BidFormItem) => {
    const on = !yesItem[it.requestItemId];
    setYesItem((p) => ({ ...p, [it.requestItemId]: on }));
    setAnswers((p) => {
      const conf = { ...(p[it.requestItemId]?.confirmations ?? {}) };
      for (const k of itemTerms(it)) conf[k] = on ? true : undefined;
      return { ...p, [it.requestItemId]: { ...p[it.requestItemId], confirmations: conf } };
    });
  };
  // "Yes to all" for the for-all-items contract terms (same pattern).
  const toggleContractYes = () => {
    if (!data) return;
    const on = !yesContract;
    setYesContract(on);
    const next: Record<string, boolean> = {};
    if (on) for (const c of data.contractTerms) next[c.key] = true;
    setContract(next);
  };

  // Reset for "Submit another bid" — clear terms/prices for a fresh quotation (keep company details,
  // since it's the same supplier sending another option).
  const resetForm = () => {
    if (!data) return;
    const init: Record<string, Answer> = {};
    for (const it of data.items) init[it.requestItemId] = { confirmations: {}, rentalRate: "", deliveryPrice: "", returnPrice: "", offeredUnits: String(it.numberOfUnits || 1) };
    setAnswers(init);
    setContract({});
    setAtt({});
    setCoCr([]); setCoVat([]); setCoAddr([]); setCoExtra([]);
    setCoMode({ cr: "text", vat: "text", addr: "text" });
    setYesItem({});
    setYesContract(false);
    setShowErrors(false);
    setSubmitting(false);
    setSubmitted(false);
    window.scrollTo(0, 0);
  };

  // Returns the NET (before-VAT) item subtotal. When the supplier priced VAT-inclusive, strip the 15%
  // back out so the ×1.15 downstream reproduces exactly the gross they typed.
  const itemSubtotal = (it: BidFormItem, a?: Answer) => {
    if (!a) return 0;
    const q = offeredQty(it, a); // price the units actually offered (partial bid)
    const gross = (num(a.rentalRate) + num(a.deliveryPrice) + num(a.returnPrice)) * q;
    return vatIncluded ? gross / 1.15 : gross;
  };
  const grand = useMemo(
    () => (data?.items ?? []).reduce((s, it) => s + itemSubtotal(it, answers[it.requestItemId]) * 1.15, 0),
    [data, answers, vatIncluded],
  );

  // Company name + contact are the required identity; CR / VAT / National Address are optional and can
  // be provided as text OR a document, so they don't gate submission.
  const companyValid = !!(company.companyName.trim() && company.contactInfo.trim());
  const itemsValid = (data?.items ?? []).every((it) => num(answers[it.requestItemId]?.rentalRate ?? "") > 0);
  // Every shown term (per-item + project) must be answered Yes/No — no silent grey/unanswered terms.
  const termsAnswered =
    (data?.items ?? []).every((it) => itemTerms(it).every((k) => typeof answers[it.requestItemId]?.confirmations[k] === "boolean")) &&
    (data?.contractTerms ?? []).every((c) => typeof contract[c.key] === "boolean");
  const valid = !!companyValid && itemsValid && termsAnswered;

  // Live bid-quality score (terms match + docs + completeness) — updates as the supplier fills the form.
  const quality = useMemo(() => {
    const items = (data?.items ?? []).map((it) => {
      const a = answers[it.requestItemId];
      const at = att[it.requestItemId] ?? EMPTY_ATT;
      return {
        requiredTerms: it.requiredTerms as Record<string, string | null>,
        confirmations: { ...(a?.confirmations ?? {}), ...contract } as Record<string, boolean | undefined>,
        priced: num(a?.rentalRate ?? "") > 0,
        photoCount: at.photos.length,
        ownershipCount: at.ownership.length,
        equipCertCount: Object.entries(at.certs).filter(([k]) => !k.startsWith("operator_")).reduce((s, [, v]) => s + v.length, 0),
        operatorCertCount: Object.entries(at.certs).filter(([k]) => k.startsWith("operator_")).reduce((s, [, v]) => s + v.length, 0),
      };
    });
    const companyDocCount = coCr.length + coVat.length + coAddr.length + coExtra.length;
    return computeBidQuality({ items, companyDocCount, companyComplete: companyValid });
  }, [data, answers, contract, att, coCr, coVat, coAddr, coExtra, companyValid]);

  async function onSubmit() {
    setShowErrors(true);
    if (!valid || !data) return;
    setSubmitting(true);
    try {
      await submitBidForm(token, {
        companyName: company.companyName.trim(),
        crNumber: company.crNumber.trim(),
        vatNumber: company.vatNumber.trim(),
        nationalAddress: company.nationalAddress.trim(),
        contactInfo: company.contactInfo.trim(),
        // No backend flag for VAT-inclusive pricing — carry it as a tagged line in the notes (which
        // round-trip to the renter's submission view). The viewer surfaces it as a dedicated note.
        notes: buildSubmissionNotes(company.notes, vatIncluded),
        validUntil: company.validUntil ? new Date(company.validUntil).toISOString() : undefined,
        items: data.items.map((it) => {
          const a = answers[it.requestItemId];
          // Store VAT-exclusive prices. If the supplier priced VAT-inclusive, strip the 15% back out so
          // the renter side — which always adds VAT — lands on the same total.
          // Merge the project/contract confirmations (apply to all items) into each item's answers.
          const at = itemAtt(it.requestItemId);
          const photos = at.photos.map((p) => ({ key: p.key, type: p.type as BidPhotoKind, filename: p.filename ?? undefined }));
          const certDocs = Object.values(at.certs).flat();
          const documents = [...at.ownership, ...certDocs].map((d) => ({ key: d.key, type: d.type as BidDocKind, filename: d.filename ?? undefined }));
          return { requestItemId: it.requestItemId, confirmations: { ...a.confirmations, ...contract }, offeredUnits: it.numberOfUnits > 1 ? offeredQty(it, a) : undefined, rentalRate: priceToStore(num(a.rentalRate), vatIncluded), deliveryPrice: priceToStore(num(a.deliveryPrice), vatIncluded), returnPrice: priceToStore(num(a.returnPrice), vatIncluded), ...(photos.length ? { photos } : {}), ...(documents.length ? { documents } : {}) };
        }),
        companyDocuments: (() => {
          const all = [...coCr, ...coVat, ...coAddr, ...coExtra];
          return all.length ? all.map((d) => ({ key: d.key, type: d.type as CompanyDocKind, filename: d.filename ?? undefined })) : undefined;
        })(),
      });
      setSubmitted(true);
      window.scrollTo(0, 0);
    } catch {
      setSubmitting(false);
      fetchBidFormData(token).then((d) => setData(d)).catch(() => {});
      alert(L("Could not submit — the request may have closed, or please try again.", "تعذّر الإرسال — قد يكون الطلب أُغلق، أو حاول مرة أخرى."));
    }
  }

  // Classified attachment kinds (bilingual). Codes match the backend `BID_PHOTO_KINDS` / `BID_DOC_TYPES`
  // / `COMPANY_DOC_TYPES`.
  const photoKinds: UploaderKind[] = [
    { value: "front_photo", label: L("Front photo", "صورة أمامية") },
    { value: "serial_photo", label: L("Serial / plate", "الرقم التسلسلي") },
    { value: "hours_photo", label: L("Operating hours", "ساعات التشغيل") },
  ];
  const ownershipKinds: UploaderKind[] = [
    { value: "istimara", label: L("Istimara", "الاستمارة") },
    { value: "customs_card", label: L("Customs card", "البطاقة الجمركية") },
    { value: "sales_contract", label: L("Sales contract", "عقد البيع") },
    { value: "saso_registration", label: L("SASO registration", "تسجيل ساسو") },
  ];
  // Equipment + operator certificate slots are request-driven (parseCertSlots), so no fixed kind list.
  const companyExtraKinds: UploaderKind[] = [
    { value: "local_content", label: L("Local content", "المحتوى المحلي") },
    { value: "saso_heavy_equip", label: L("SASO heavy equipment", "ساسو للمعدات الثقيلة") },
    { value: "other", label: L("Other", "أخرى") },
  ];

  const dir = ar ? "rtl" : "ltr";
  const sar = L("SAR", "ر.س");
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(ar ? "ar-SA" : "en-GB", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div dir={dir} className={`bidpage${ar ? " rtl" : ""}`}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600;700&family=Inter:wght@400;500;600;700;800;900&family=Tajawal:wght@400;500;700;800;900&display=swap" rel="stylesheet" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/icon?family=Material+Icons+Outlined" />
      <style>{BID_FORM_CSS}</style>

      {/* Public header bar — renter identity + language toggle */}
      <header className="pubbar">
        <div className="pubbar-in">
          {data?.renter.logoUrl
            ? <div className="rlogo rlogo-img">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={data.renter.logoUrl} alt="" /></div>
            : <div className="rlogo">{(data?.renter.name || "?").trim().slice(0, 2).toUpperCase()}</div>}
          <div className="rmeta">
            <div className="rlabel">{L("Request from", "طلب من")}</div>
            <div className="rname">{data?.renter.name || data?.renter.contactName || L("Renter", "مستأجر")}</div>
            {data && (data.renter.verified || data.renter.city || data.renter.contactName) && (
              <div className="rsub">
                {data.renter.verified && <span className="material-icons-outlined">verified</span>}
                <span>{[data.renter.verified ? L("Verified renter", "مستأجر موثّق") : null, data.renter.city, data.renter.contactName ? `${L("Contact", "المسؤول")}: ${data.renter.contactName}` : null].filter(Boolean).join(" · ")}</span>
              </div>
            )}
          </div>
          <div className="spacer" />
          <div className="langtog">
            <button className={lang === "en" ? "on" : ""} onClick={() => setLang("en")}>EN</button>
            <button className={lang === "ar" ? "on" : ""} onClick={() => setLang("ar")}>ع</button>
          </div>
        </div>
      </header>

      {loading && <div className="wrap"><p className="state-msg">{L("Loading…", "جارٍ التحميل…")}</p></div>}

      {!loading && (notFound || !data) && (
        <div className="wrap"><div className="state"><div className="sic err"><span className="material-icons-outlined">link_off</span></div><h2>{L("Link not found", "الرابط غير موجود")}</h2><p>{L("This bid link is invalid or has expired.", "هذا الرابط غير صالح أو منتهٍ.")}</p></div></div>
      )}

      {/* Closed (AC-11/12) */}
      {!loading && data?.status === "closed" && (
        <div className="wrap"><div className="state"><div className="sic neutral"><span className="material-icons-outlined">lock_clock</span></div>
          <h2>{L("Not accepting bids", "لا يستقبل العروض")}</h2>
          <p>{data.closedReason === "deadline" ? L("The deadline for this request has passed.", "انتهى الموعد النهائي لهذا الطلب.") : L("This request is closed and no longer accepting bids.", "هذا الطلب مُغلق ولم يعد يستقبل العروض.")}</p>
        </div></div>
      )}

      {/* Success (AC-29) — suppliers may submit another bid (e.g. an alternative option). */}
      {submitted && (
        <div className="wrap"><div className="state"><div className="sic"><span className="material-icons-outlined">check_circle</span></div>
          <h2>{L("Bid submitted", "تم إرسال العرض")}</h2>
          <p>{L("Your bid is now with the renter on the Moedatech platform — they can view it and compare it side by side with the other bids.", "عرضك الآن لدى المستأجر على منصة معداتك — يمكنه عرضه ومقارنته جنباً إلى جنب مع بقية العروض.")}</p>
          <span className="recap"><span className="material-icons-outlined">payments</span>{sar} {nf(grand)}</span>
          <div className="state-actions"><button className="btn" onClick={resetForm}><span className="material-icons-outlined">add</span>{L("Submit another bid", "إرسال عرض آخر")}</button></div>
        </div></div>
      )}

      {/* The form */}
      {!loading && data?.status === "open" && !submitted && (
        <div className="wrap">
          <div className="intro">
            <h1>{L("Submit your bid", "قدّم عرضك")}</h1>
            <p>{L("For each item, confirm its terms in the table, then price it below.", "لكل بند، أكّد شروطه في الجدول ثم سعّره بالأسفل.")}</p>
          </div>

          {/* Live bid-quality ring — rises as the supplier confirms terms + attaches photos/documents. */}
          <div className="qbanner">
            <QualityRing quality={quality} L={L} />
            <div className="qb-tx">
              <b>{L("Bid quality", "جودة العرض")}</b>
              <span>{L("Confirm the renter's terms and attach equipment photos + documents to raise your match score — higher-quality bids stand out to the renter.", "أكّد شروط المستأجر وأرفق صور المعدة والمستندات لرفع درجة المطابقة — العروض عالية الجودة تبرز لدى المستأجر.")}</span>
            </div>
          </div>

          {data.deadline && <Countdown iso={data.deadline} L={L} fmtDate={fmtDate} />}

          {/* Project terms */}
          {data.projectTerms && (
            <div className="sec">
              <div className="sec-h"><span className="material-icons-outlined hdic">tune</span><h3>{L("Project terms", "شروط المشروع")}</h3><span className="ro-tag">{L("From request", "من الطلب")}</span></div>
              <div className="ro-grid">
                {data.projectTerms.location && <Cell k={L("Location", "الموقع")}>{data.projectTerms.lat != null && data.projectTerms.lng != null ? <a className="maplink" href={`https://www.google.com/maps?q=${data.projectTerms.lat},${data.projectTerms.lng}`} target="_blank" rel="noopener noreferrer">{data.projectTerms.location}<span className="material-icons-outlined">place</span></a> : data.projectTerms.location}</Cell>}
                {data.projectTerms.rentalBasis && <Cell k={L("Rental basis", "أساس الإيجار")}>{rentalBasisLabel(data.projectTerms.rentalBasis, L)}</Cell>}
                {data.projectTerms.startDate && <Cell k={L("Rental start", "بدء الإيجار")}>{fmtDate(data.projectTerms.startDate)}</Cell>}
                <Cell k={L("Rental end", "نهاية الإيجار")}>{data.projectTerms.endDate ? fmtDate(data.projectTerms.endDate) : L("Open-ended", "بدون نهاية محددة")}</Cell>
                {data.projectTerms.hoursPerDay != null && <Cell k={L("Hours per day", "ساعات/يوم")}>{data.projectTerms.hoursPerDay}</Cell>}
                {data.projectTerms.workingDaysPerWeek != null && <Cell k={L("Working days / week", "أيام العمل/أسبوع")}>{data.projectTerms.workingDaysPerWeek}</Cell>}
              </div>
              <div className="ro-hint">{L("Only details the renter set are shown.", "تُعرض فقط التفاصيل التي حدّدها المستأجر.")}</div>

              {data.contractTerms.length > 0 && (
                <>
                  <div className="subhead"><span className="material-icons-outlined">gavel</span>{L("Contract terms — for all items", "شروط العقد — لكل البنود")}
                    <button type="button" className={`yall${yesContract ? " on" : ""}`} onClick={toggleContractYes}><span className="yall-sw"></span>{L("Yes to all", "نعم للكل")}</button>
                  </div>
                  <div className="treqgrid">
                    {data.contractTerms.map((c) => {
                      const ans = contract[c.key];
                      return (
                        <div key={c.key} className={`treqcell${showErrors && ans === undefined ? " needpick" : ""}`}>
                          <div className="tc-name">{c.label}</div>
                          <div className="tc-rw"><span className="q">{L("Renter wants", "يطلب المستأجر")}:</span> <i>{ar ? localizeTermValue(c.value) : c.value}</i></div>
                          <div className="tc-sw"><span className="q">{L("Your answer", "إجابتك")}:</span><YesNo L={L} value={ans} onChange={(v) => setContract((p) => ({ ...p, [c.key]: v }))} /></div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Renter's notes (read-only) — shown only if the renter wrote any. */}
          {data.notes && (
            <div className="sec">
              <div className="sec-h"><span className="material-icons-outlined hdic">sticky_note_2</span><h3>{L("Renter's notes", "ملاحظات المستأجر")}</h3><span className="ro-tag">{L("From request", "من الطلب")}</span></div>
              <p className="rnote">{data.notes}</p>
            </div>
          )}

          {/* Per item */}
          {data.items.map((it, idx) => {
            const a = answers[it.requestItemId];
            const terms = itemTerms(it);
            const label = (ar ? it.labelAr : it.label) || it.label || L("Equipment", "المعدة");
            const size = (ar ? it.sizeAr : it.size) || it.size || null;
            const q = it.numberOfUnits || 1;
            const oq = offeredQty(it, a); // units this line offers (≤ q)
            const unit = it.priceUnit ? (ar ? UNIT_LABEL[it.priceUnit]?.[1] : UNIT_LABEL[it.priceUnit]?.[0]) ?? it.priceUnit : L("unit", "وحدة");
            const sub = itemSubtotal(it, a);
            const line = (v: string) => (num(v) ? num(v) * oq : 0);
            // Supplier prices delivery/return ONLY when they handle it; if the renter does, no price row.
            const delBySup = (it.deliveryBy || "").toLowerCase() === "supplier";
            const retBySup = (it.returnBy || "").toLowerCase() === "supplier";
            return (
              <div className="sec" key={it.requestItemId}>
                <div className="item-hd">
                  <span className="material-icons-outlined">construction</span>
                  <div className="inm-wrap"><span className="inm">{label}</span>{size && <span className="imeta">· {size}</span>}
                    <span className={`units-chip${q > 1 ? " multi" : ""}`}><span className="material-icons-outlined">{q > 1 ? "layers" : "package_2"}</span>×{q} {q === 1 ? L("unit", "وحدة") : L("units", "وحدات")}</span></div>
                  <span className="ibadge">{L(`Item ${idx + 1} of ${data.items.length}`, `البند ${idx + 1} من ${data.items.length}`)}</span>
                </div>

                {q > 1 && (
                  <div className="units-note" style={{ flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                    <span className="material-icons-outlined un-lead">layers</span>
                    <span className="un-tx" style={{ flex: 1, minWidth: 180 }}>{L(`Multi-unit item — the renter needs ${q} units. Set how many you can supply (bid on some or all); prices below multiply by this.`, `بند متعدد الوحدات — يحتاج المستأجر ${q} وحدات. حدّد كم وحدة تستطيع توفيرها (اعرض على بعضها أو كلّها)؛ تُضرب الأسعار أدناه بهذا العدد.`)}</span>
                    {/* Partial-bid control — an explicit −/+ stepper so it's unmistakable the supplier can
                        choose to supply fewer than the N units the renter asked for. Drives the Qty below. */}
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 10, whiteSpace: "nowrap", background: "#fff", border: "1px solid #e6c690", borderRadius: 10, padding: "6px 12px" }}>
                      <span style={{ fontSize: 12.5, fontWeight: 800, color: "#1c3550" }}>{L("Units you can supply", "الوحدات المتاحة لديك")}</span>
                      <span style={{ display: "inline-flex", alignItems: "center", border: "2px solid #f79009", borderRadius: 9, overflow: "hidden" }}>
                        <button type="button" aria-label={L("Fewer units", "تقليل")} disabled={oq <= 1}
                          onClick={() => setOffered(it.requestItemId, String(Math.max(1, oq - 1)))}
                          style={{ width: 36, height: 36, border: "none", background: oq <= 1 ? "#f6efe2" : "#fff5e8", color: oq <= 1 ? "#c9b48c" : "#b45309", fontSize: 22, fontWeight: 900, cursor: oq <= 1 ? "default" : "pointer", lineHeight: 1, fontFamily: "inherit" }}>−</button>
                        <span style={{ minWidth: 38, textAlign: "center", fontSize: 16, fontWeight: 900, color: "#1c3550" }}>{oq}</span>
                        <button type="button" aria-label={L("More units", "زيادة")} disabled={oq >= q}
                          onClick={() => setOffered(it.requestItemId, String(Math.min(q, oq + 1)))}
                          style={{ width: 36, height: 36, border: "none", background: oq >= q ? "#f6efe2" : "#fff5e8", color: oq >= q ? "#c9b48c" : "#b45309", fontSize: 22, fontWeight: 900, cursor: oq >= q ? "default" : "pointer", lineHeight: 1, fontFamily: "inherit" }}>+</button>
                      </span>
                      <span style={{ color: "#6b8fa8", fontWeight: 800, fontSize: 14 }}>/ {q}</span>
                    </span>
                  </div>
                )}

                {(it.deliveryBy || it.returnBy || it.notes) && (
                  <div className="iteminfo">
                    {it.deliveryBy && <span className="ii"><b>{L("Delivery", "النقل إلى الموقع")}:</b> {partyLabel(it.deliveryBy, L)}</span>}
                    {it.returnBy && <span className="ii"><b>{L("Return", "النقل من الموقع")}:</b> {partyLabel(it.returnBy, L)}</span>}
                    {it.notes && <span className="ii note"><span className="material-icons-outlined">sticky_note_2</span>{it.notes}</span>}
                  </div>
                )}

                {terms.length > 0 && (
                  <>
                    <div className="subhead"><span className="material-icons-outlined">fact_check</span>{L("Terms — can you meet each?", "الشروط — هل يمكنك الالتزام بكلٍّ منها؟")}
                      <button type="button" className={`yall${yesItem[it.requestItemId] ? " on" : ""}`} onClick={() => toggleItemYes(it)}><span className="yall-sw"></span>{L("Yes to all", "نعم للكل")}</button>
                    </div>
                    <div className="treqgrid">
                      {terms.map((k) => {
                        const ans = a?.confirmations[k];
                        const val = (k === "operatorCert" || k === "equipmentCert") ? (it.requiredTerms[k] ?? "").toUpperCase() : (ar ? localizeTermValue(it.requiredTerms[k]) : it.requiredTerms[k]);
                        return (
                          <div key={k} className={`treqcell${ans === false ? " declined" : ""}${showErrors && ans === undefined ? " needpick" : ""}`}>
                            <div className="tc-name">{L(TERM_LABEL[k][0], TERM_LABEL[k][1])}</div>
                            <div className="tc-rw"><span className="q">{L("Renter wants", "يطلب المستأجر")}:</span> <i>{val}</i></div>
                            <div className="tc-sw"><span className="q">{L("Your answer", "إجابتك")}:</span><YesNo L={L} value={ans} onChange={(v) => setConf(it.requestItemId, k, v)} /></div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}

                <div className="subhead"><span className="material-icons-outlined">request_quote</span>{L("Pricing", "التسعير")}
                  {/* Inline VAT toggle — clarifies right at the price box whether the entered prices include 15% VAT. */}
                  <span style={{ marginInlineStart: "auto", display: "inline-flex", border: "1px solid var(--border)", borderRadius: 7, overflow: "hidden", textTransform: "none", letterSpacing: 0 }}>
                    {([[false, L("Excl. VAT", "قبل الضريبة")], [true, L("Incl. VAT", "شامل الضريبة")]] as [boolean, string][]).map(([v, lab]) => (
                      <button key={String(v)} type="button" onClick={() => setVatIncluded(v)} style={{ border: "none", cursor: "pointer", font: "inherit", textTransform: "none", letterSpacing: 0, fontWeight: 800, fontSize: 10.5, padding: "3px 9px", background: vatIncluded === v ? "var(--navy)" : "var(--surface1)", color: vatIncluded === v ? "#fff" : "var(--muted)" }}>{lab}</button>
                    ))}
                  </span>
                </div>
                <table className="ptbl">
                  <thead><tr><th>{L("Item", "البند")}</th><th className="num">{L("Unit", "الوحدة")}</th><th className="num">{L("Qty", "العدد")}</th><th className="num">{vatIncluded ? L("Price (incl. VAT)", "السعر (شامل الضريبة)") : L("Your price", "سعرك")}</th><th className="num">{L("Total", "الإجمالي")}</th></tr></thead>
                  <tbody>
                    <tr>
                      <td><div className="it-lbl">{L("Rental", "الإيجار")}</div></td>
                      <td className="num">{unit}</td><td className="num">{oq}</td>
                      <td className="num"><input className={`ptbl-in${showErrors && num(a?.rentalRate ?? "") <= 0 ? " invalid" : ""}`} inputMode="numeric" value={a?.rentalRate ?? ""} onChange={(e) => setPrice(it.requestItemId, "rentalRate", e.target.value)} placeholder="0" /></td>
                      <td className="num tot">{num(a?.rentalRate ?? "") ? nf(line(a!.rentalRate)) : "—"}</td>
                    </tr>
                    {delBySup && (
                    <tr>
                      <td><div className="it-lbl">{L("Delivery to site", "النقل إلى الموقع")}</div><div className="it-sub2">{L("price × qty", "السعر × العدد")}</div></td>
                      <td className="num">{L("Trip", "رحلة")}</td><td className="num">{oq}</td>
                      <td className="num"><input className="ptbl-in" inputMode="numeric" value={a?.deliveryPrice ?? ""} onChange={(e) => setPrice(it.requestItemId, "deliveryPrice", e.target.value)} placeholder="0" /></td>
                      <td className="num tot">{num(a?.deliveryPrice ?? "") ? nf(line(a!.deliveryPrice)) : "—"}</td>
                    </tr>
                    )}
                    {retBySup && (
                    <tr>
                      <td><div className="it-lbl">{L("Return from site", "النقل من الموقع")}</div><div className="it-sub2">{L("price × qty", "السعر × العدد")}</div></td>
                      <td className="num">{L("Trip", "رحلة")}</td><td className="num">{oq}</td>
                      <td className="num"><input className="ptbl-in" inputMode="numeric" value={a?.returnPrice ?? ""} onChange={(e) => setPrice(it.requestItemId, "returnPrice", e.target.value)} placeholder="0" /></td>
                      <td className="num tot">{num(a?.returnPrice ?? "") ? nf(line(a!.returnPrice)) : "—"}</td>
                    </tr>
                    )}
                  </tbody>
                </table>
                <div className="itot">
                  <span className="r">{vatIncluded ? L("Net (before VAT)", "الصافي (قبل الضريبة)") : L("Subtotal", "المجموع")}<b>{sub ? nf(sub) : "—"} {sar}</b></span>
                  <span className="r">{L("VAT 15%", "ضريبة ١٥٪")}<b>{sub ? nf(sub * 0.15) : "—"} {sar}</b></span>
                  <span className="r t">{vatIncluded ? L("Item total (incl. VAT)", "إجمالي البند (شامل الضريبة)") : L("Item total", "إجمالي البند")}<b>{sub ? nf(sub * 1.15) : "—"} {sar}</b></span>
                </div>

                {/* Attachments — photos + ownership are always offered (choose-type dropdown); equipment /
                    operator certificates are request-driven labeled slots, shown only when required. */}
                <AttachSection icon="photo_camera" accent={ATT_ACCENT.photo}
                  title={L("Equipment photos", "صور المعدة")} desc={L("Pick what the photo shows, then upload", "اختر ما تُظهره الصورة ثم ارفع")} pill={L("Optional", "اختياري")}>
                  <FileUploader token={token} folder="photos" thumbs kinds={photoKinds} accent={ATT_ACCENT.photo}
                    value={itemAtt(it.requestItemId).photos}
                    onChange={(n) => setItemAtt(it.requestItemId, "photos", n)} L={L} disabled={submitting} />
                </AttachSection>

                <AttachSection icon="verified_user" accent={ATT_ACCENT.own}
                  title={L("Proof of ownership", "إثبات الملكية")} desc={L("Choose which document you have, then upload", "اختر المستند الذي لديك ثم ارفع")} pill={L("Optional", "اختياري")}>
                  <FileUploader token={token} folder="documents" kinds={ownershipKinds} accent={ATT_ACCENT.own}
                    value={itemAtt(it.requestItemId).ownership}
                    onChange={(n) => setItemAtt(it.requestItemId, "ownership", n)} L={L} disabled={submitting} />
                </AttachSection>

                {(() => {
                  const slots = parseCertSlots(it.requiredTerms.equipmentCert, "");
                  return slots.length ? (
                    <AttachSection icon="workspace_premium" accent={ATT_ACCENT.eqc}
                      title={L("Equipment certificate", "شهادة المعدة")} desc={L("Required by this request", "مطلوبة لهذا الطلب")} pill={L("Required", "مطلوب")} tone="req">
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {slots.map((sl) => (
                          <FileUploader key={sl.code} token={token} folder="documents" accent={ATT_ACCENT.eqc}
                            kinds={[{ value: sl.code, label: sl.base === "other" ? sl.raw : L(CERT_BASE_LABEL[sl.base][0], CERT_BASE_LABEL[sl.base][1]) }]}
                            value={itemAtt(it.requestItemId).certs[sl.code] ?? []}
                            onChange={(n) => setItemCert(it.requestItemId, sl.code, n)} L={L} disabled={submitting} />
                        ))}
                      </div>
                    </AttachSection>
                  ) : null;
                })()}

                {(() => {
                  const slots = parseCertSlots(it.requiredTerms.operatorCert, "operator_");
                  return slots.length ? (
                    <AttachSection icon="badge" accent={ATT_ACCENT.opc}
                      title={L("Operator certificate", "شهادة المشغّل")} desc={L("Required by this request", "مطلوبة لهذا الطلب")} pill={L("Required", "مطلوب")} tone="req">
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {slots.map((sl) => (
                          <FileUploader key={sl.code} token={token} folder="documents" accent={ATT_ACCENT.opc}
                            kinds={[{ value: sl.code, label: sl.base === "other" ? sl.raw : L(CERT_BASE_LABEL[sl.base][0], CERT_BASE_LABEL[sl.base][1]) }]}
                            value={itemAtt(it.requestItemId).certs[sl.code] ?? []}
                            onChange={(n) => setItemCert(it.requestItemId, sl.code, n)} L={L} disabled={submitting} />
                        ))}
                      </div>
                    </AttachSection>
                  ) : null;
                })()}
              </div>
            );
          })}

          {/* Grand total */}
          <div className="grand"><span className="gk">{L("Grand total — all items (incl. VAT)", "الإجمالي الكلي — كل البنود (شامل الضريبة)")}</span><span className="gv">{grand > 0 ? nf(grand) : "—"} {sar}</span></div>

          {/* Your details */}
          <div className="sec">
            <div className="sec-h"><span className="material-icons-outlined hdic">badge</span><h3>{L("Your details", "بياناتك")}</h3></div>
            <Field label={L("Company name", "اسم الشركة")} req invalid={showErrors && !company.companyName.trim()} L={L}><input value={company.companyName} onChange={(e) => setCompany({ ...company, companyName: e.target.value })} placeholder={L("e.g. Gulf Heavy Equipment Co.", "مثال: شركة الخليج للمعدات")} /></Field>
            {/* CR / VAT / National Address — each provided as TEXT or a DOCUMENT (optional), aligning with
                the app's company-verification doc set. */}
            <CompanyDocField label={L("Commercial registration", "السجل التجاري")} kindValue="cr"
              mode={coMode.cr} onMode={(m) => setCoMode((s) => ({ ...s, cr: m }))}
              text={company.crNumber} onText={(v) => setCompany({ ...company, crNumber: v })} textPlaceholder={L("CR number", "رقم السجل التجاري")}
              docs={coCr} onDocs={setCoCr} token={token} L={L} disabled={submitting} />
            <div className="frow">
              <CompanyDocField label={L("VAT", "ضريبة القيمة المضافة")} kindValue="vat_cert"
                mode={coMode.vat} onMode={(m) => setCoMode((s) => ({ ...s, vat: m }))}
                text={company.vatNumber} onText={(v) => setCompany({ ...company, vatNumber: v })} textPlaceholder={L("VAT number", "الرقم الضريبي")}
                docs={coVat} onDocs={setCoVat} token={token} L={L} disabled={submitting} />
              <CompanyDocField label={L("National address", "العنوان الوطني")} kindValue="national_address"
                mode={coMode.addr} onMode={(m) => setCoMode((s) => ({ ...s, addr: m }))}
                text={company.nationalAddress} onText={(v) => setCompany({ ...company, nationalAddress: v })} textPlaceholder={L("National address", "العنوان الوطني")}
                docs={coAddr} onDocs={setCoAddr} token={token} L={L} disabled={submitting} />
            </div>
            <Field label={L("Contact info", "بيانات التواصل")} req invalid={showErrors && !company.contactInfo.trim()} L={L}><input value={company.contactInfo} onChange={(e) => setCompany({ ...company, contactInfo: e.target.value })} placeholder={L("Phone or email so the renter can reach you", "هاتف أو بريد ليتواصل معك المستأجر")} /></Field>
            {QUOTE_EXPIRY_ENABLED && <Field label={L("Quote valid until (optional)", "صلاحية العرض حتى (اختياري)")} L={L}><input type="date" value={company.validUntil} onChange={(e) => setCompany({ ...company, validUntil: e.target.value })} /></Field>}
            <div className="notes-field"><label>{L("Notes (optional) — for the whole quotation", "ملاحظات (اختياري) — لكامل عرض السعر")}</label><textarea value={company.notes} onChange={(e) => setCompany({ ...company, notes: e.target.value })} /></div>

            {/* Optional extra company docs — Local Content / SASO heavy equipment / Other. */}
            <div className="subhead"><span className="material-icons-outlined">folder_open</span>{L("Other company documents (optional)", "مستندات أخرى للشركة (اختياري)")}</div>
            <FileUploader token={token} folder="documents" kinds={companyExtraKinds} value={coExtra} onChange={setCoExtra} L={L} disabled={submitting} />
          </div>

          {showErrors && !valid && <div className="submit-err"><span className="material-icons-outlined">error_outline</span>{L("Please complete the highlighted items: answer every term, enter a rate for each item, and fill all company details.", "الرجاء إكمال العناصر المظللة: أجب عن كل شرط، وأدخل سعراً لكل بند، واملأ جميع بيانات الشركة.")}</div>}
          <div className="submit-bar"><button className="btn primary lg" disabled={submitting} onClick={onSubmit}><span className="material-icons-outlined">send</span>{submitting ? L("Submitting…", "جارٍ الإرسال…") : L("Submit bid", "إرسال العرض")}</button>
            <div className="submit-note">{L("Once submitted, your bid is final and can't be edited from this link.", "بعد الإرسال، يصبح عرضك نهائياً ولا يمكن تعديله من هذا الرابط.")}</div>
          </div>
          <div className="footer-note">{L("Private bid link — your details are shared only with the renter.", "رابط عرض خاص — تُشارك بياناتك مع المستأجر فقط.")}</div>
        </div>
      )}

      <footer className="pb-powered">{L("Powered by", "مُشغّل بواسطة")} <b>Moedatech</b></footer>
    </div>
  );
}

function Cell({ k, children }: { k: string; children: React.ReactNode }) {
  return <div className="ro-cell"><div className="k">{k}</div><div className="v">{children}</div></div>;
}

function YesNo({ value, onChange, L }: { value: boolean | undefined; onChange: (v: boolean) => void; L: (e: string, a: string) => string }) {
  return (
    <span className="miniseg">
      <button type="button" className={`ok${value === true ? " on" : ""}`} onClick={() => onChange(true)}><span className="material-icons-outlined">check</span>{L("Yes", "نعم")}</button>
      <button type="button" className={`no${value === false ? " on" : ""}`} onClick={() => onChange(false)}>{L("No", "لا")}</button>
    </span>
  );
}

function Field({ label, req, invalid, children, L }: { label: string; req?: boolean; invalid?: boolean; children: React.ReactNode; L: (e: string, a: string) => string }) {
  return (
    <div className={`field${invalid ? " invalid" : ""}`}>
      <label>{label}{req && <span className="reqx"> *</span>}</label>
      {children}
      <div className="err">{L("Required", "مطلوب")}</div>
    </div>
  );
}

/** A company-verification field the supplier can satisfy as TEXT or a DOCUMENT (their choice). */
function CompanyDocField({
  label, kindValue, mode, onMode, text, onText, textPlaceholder, docs, onDocs, token, L, disabled,
}: {
  label: string;
  kindValue: string;
  mode: "text" | "doc";
  onMode: (m: "text" | "doc") => void;
  text: string;
  onText: (v: string) => void;
  textPlaceholder?: string;
  docs: BidUploadedFile[];
  onDocs: (n: BidUploadedFile[]) => void;
  token: string;
  L: (e: string, a: string) => string;
  disabled?: boolean;
}) {
  return (
    <div className="field">
      <div className="uprow" style={{ justifyContent: "space-between", marginBottom: 5 }}>
        <label style={{ margin: 0 }}>{label}</label>
        <span className="uptog">
          <button type="button" className={mode === "text" ? "on" : ""} onClick={() => onMode("text")}>{L("Type", "نص")}</button>
          <button type="button" className={mode === "doc" ? "on" : ""} onClick={() => onMode("doc")}>{L("Upload", "مستند")}</button>
        </span>
      </div>
      {mode === "text"
        ? <input value={text} onChange={(e) => onText(e.target.value)} placeholder={textPlaceholder} />
        : <FileUploader token={token} folder="documents" kinds={[{ value: kindValue, label }]} value={docs} onChange={onDocs} L={L} disabled={disabled} />}
    </div>
  );
}

function Countdown({ iso, L, fmtDate }: { iso: string; L: (e: string, a: string) => string; fmtDate: (s: string) => string }) {
  const [now, setNow] = useState(0);
  useEffect(() => { setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  if (!now) return null;
  const ms = new Date(iso).getTime() - now;
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  const p = (n: number) => String(n).padStart(2, "0");
  const time = new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return (
    <div className="countdown">
      <div className="cd-label"><span className="material-icons-outlined">schedule</span>{ms <= 0 ? L("Bidding has closed", "أُغلق استقبال العروض") : L("Bidding closes in", "ينتهي استقبال العروض خلال")}</div>
      {ms > 0 && (
        <div className="cd-boxes">
          <div className="cd-box"><b>{p(d)}</b><span>{L("Days", "يوم")}</span></div><span className="cd-sep">:</span>
          <div className="cd-box"><b>{p(h)}</b><span>{L("Hours", "ساعة")}</span></div><span className="cd-sep">:</span>
          <div className="cd-box"><b>{p(m)}</b><span>{L("Mins", "دقيقة")}</span></div>
        </div>
      )}
      <div className="cd-deadline">{L("Deadline", "الموعد النهائي")} · <b>{fmtDate(iso)} · {time}</b></div>
    </div>
  );
}

function partyLabel(v: string | null | undefined, L: (e: string, a: string) => string) {
  const u = (v ?? "").toLowerCase();
  return u === "renter" || u === "rentee" ? L("Renter", "المستأجر") : u === "supplier" ? L("Supplier", "المؤجّر") : (v ?? "—");
}

/**
 * Arabic display for a required-term VALUE on the Arabic form — the request stores enum tokens
 * (DIESEL, Renter, NET-30, FOUR_HR, 2X, Yes/No…) that would otherwise show in English. Maps the known
 * ones to Arabic; leaves anything unknown (years, cert names, free text) untouched. Display-only.
 */
const AR_TERM_VALUE: Record<string, string> = {
  // party (fuel responsibility / delivery / provider)
  RENTER: "المستأجر", RENTEE: "المستأجر", SUPPLIER: "المؤجّر", ME: "أنا",
  // fuel type
  DIESEL: "ديزل", PETROL: "بنزين", GASOLINE: "بنزين", ELECTRIC: "كهربائي", HYBRID: "هجين",
  // yes/no · included
  YES: "نعم", NO: "لا", TRUE: "نعم", FALSE: "لا", INCLUDED: "مشمول", EXCLUDED: "غير مشمول",
  // payment terms
  "NET-0": "صافي فوري", "NET-15": "صافي ١٥ يومًا", "NET-30": "صافي ٣٠ يومًا", "NET-60": "صافي ٦٠ يومًا", "NET-90": "صافي ٩٠ يومًا",
  UPFRONT: "مقدمًا", ADVANCE: "دفعة مقدمة", "END-OF-JOB": "نهاية المهمة", DAILY: "يومي", "UPON-DELIVERY": "عند التسليم", MILESTONE: "دفعات مرحلية",
  // breakdown SLA
  FOUR_HR: "٤ ساعات", EIGHT_HR: "٨ ساعات", TWENTY_FOUR_HR: "٢٤ ساعة", FORTY_EIGHT_HR: "٤٨ ساعة", SEVENTY_TWO_HR: "٧٢ ساعة",
  // overtime
  "2X": "٢×", "1.5X": "١٫٥×", WITHOUT: "بدون", "0": "بدون",
};
function localizeTermValue(v: string | null | undefined): string | null {
  if (v == null || String(v).trim() === "") return v ?? null;
  const s = String(v).trim();
  return AR_TERM_VALUE[s.toUpperCase()] ?? s;
}

function rentalBasisLabel(v: string, L: (e: string, a: string) => string) {
  const m: Record<string, [string, string]> = { DAILY: ["Daily", "يومي"], WEEKLY: ["Weekly", "أسبوعي"], MONTHLY: ["Monthly", "شهري"], PER_JOB: ["Per job", "للمهمة"], LONG_TERM: ["Long term", "طويل الأمد"] };
  const e = m[String(v).toUpperCase()];
  return e ? L(e[0], e[1]) : v;
}
