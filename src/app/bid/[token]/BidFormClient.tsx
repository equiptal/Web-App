"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { fetchBidFormData, submitBidForm, ApiError, type BidUploadedFile } from "@/lib/api/client";
import type { BidFormData, BidFormItem, BidPhotoKind, BidDocKind, CompanyDocKind, LinkBidConfirmations } from "@/lib/contract/link-bids";
import { CERT_TERM_KEYS, certCodesFromValue, certConfKey, prettyCert } from "@/lib/contract/link-bids";
import { buildSubmissionNotes, priceToStore } from "@/lib/contract/vat-inclusive";
import { computeQuoteTotals, computeRentalTotal, durationDaysBetween, rentalDivisor, rentalPeriodSubtitle } from "@/lib/pricing/rental";
import { FileUploader, type UploaderKind } from "@/components/bid/FileUploader";
import { QualityRing } from "@/components/bid/QualityRing";
import { computeBidQuality } from "@/lib/contract/bid-quality";
import { BID_FORM_CSS } from "@/components/bid/bidFormStyles";
import { equipmentIcon } from "@/components/requests/EquipImg";

/**
 * web-app/006 — PUBLIC supplier bid form (spec "Layout B": supplier-bid-v2.html). An off-platform
 * supplier opens the renter's shared link `/bid/{slug}-{groupId}`, sees the request's project terms +
 * per-item terms (wide table) + pricing, enters company details, and submits. Stored independently.
 * Bilingual (?lang=ar) + RTL. Closed (AC-11/12) / countdown (AC-10) / already-submitted (AC-33) states.
 *
 * Rendered by the server route `page.tsx`, which owns `generateMetadata` — the link-preview (Open
 * Graph) tags that make this URL unfurl into a card in WhatsApp / Apple Mail / Outlook / Slack. Those
 * tags MUST come from the server: unfurl bots don't execute JavaScript, so nothing this file renders
 * can produce a card. It receives the already-extracted group-id `token`.
 */

// `nightShift` sits with the other operator terms. The renter can require night-shift work in both
// request UIs (equipment_step.dart:2882, ItemRow.tsx:354-357) and it reaches the in-app supplier via
// `OperatorAsk` (terms_modal.dart) — but it was never carried to the off-platform bid form, so a
// supplier bidding through the link was never told. The backend sends it ONLY when the renter
// switched it on (null otherwise), so an untouched toggle stays hidden instead of adding a
// "Night shift: No" row to every bid.
const TERM_KEYS = ["operator", "nationality", "nightShift", "fatFood", "fatTransport", "fuel", "fuelType", "year", "operatorCert", "equipmentCert"] as const;
type TermKey = (typeof TERM_KEYS)[number];
// Term names mirror the web app's canonical labels (bids.ts negotiable terms) so renter + supplier see the same wording.
const TERM_LABEL: Record<TermKey, [string, string]> = {
  operator: ["Operator included", "تشمل مشغّل"],
  nationality: ["Operator nationality", "جنسية المشغّل"],
  nightShift: ["Night shift required", "العمل الليلي مطلوب"],
  fatFood: ["Operator Food", "طعام المشغّل"],
  fatTransport: ["Operator Accommodation & Transport", "سكن وتنقّل المشغّل"],
  fuel: ["Fuel responsibility", "مسؤولية الوقود"],
  fuelType: ["Fuel type", "نوع الوقود"],
  year: ["Equipment year", "سنة الصنع"],
  operatorCert: ["Operator certificate", "شهادة المشغّل"],
  equipmentCert: ["Equipment certificate", "شهادة المعدة"],
};
// A Material glyph per term, so each term card reads at a glance.
const TERM_ICON: Record<TermKey, string> = {
  operator: "engineering", nationality: "public", nightShift: "bedtime", fatFood: "restaurant", fatTransport: "night_shelter",
  fuel: "local_gas_station", fuelType: "local_gas_station", year: "event", operatorCert: "workspace_premium", equipmentCert: "verified",
};
// App-download links for the footer CTA (off-platform suppliers → install the app to keep getting requests).
// Source: linktr.ee/moedatech (the official app links).
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.moedatech.user";
const APP_STORE_URL = "https://apps.apple.com/sa/app/moedatech/id6749363341";
// Certificate terms can list several required certs (e.g. "TUV, SPSP, SASO_TECHNICAL_INSPECTION"). Each
// is confirmed on its OWN card, so a supplier can say they hold TÜV but not SPSP. In state we keep a
// per-code key `${term}::${code}` PLUS the aggregate `${term}` boolean (true only when every code is Yes)
// that the wire contract + quality scoring read.
const certCodesFor = (rt: Record<string, unknown> | null | undefined, k: TermKey): string[] =>
  CERT_TERM_KEYS.has(k) ? certCodesFromValue(rt?.[k] as string | null | undefined) : [];
// Drop unanswered (undefined) entries before submit. Per-code keys AND the aggregate both ride the wire —
// the backend stores confirmations as pass-through JSON, so the renter's viewers see the per-code answers.
const toWireConf = (conf: Record<string, boolean | undefined>): LinkBidConfirmations => {
  const out: Record<string, boolean> = {};
  for (const [key, v] of Object.entries(conf)) if (typeof v === "boolean") out[key] = v;
  return out as LinkBidConfirmations;
};
// Roll per-code answers up into the aggregate: all Yes → true, any No → false, any unanswered → undefined.
const rollCert = (conf: Record<string, boolean | undefined>, k: TermKey, codes: string[]) => {
  const vals = codes.map((c) => conf[certConfKey(k, c)]);
  conf[k] = vals.every((x) => x === true) ? true : vals.some((x) => x === false) ? false : undefined;
};
// Default the supplier to "Yes" on every term the renter requires — they meet the ask unless they say otherwise.
const allYesConf = (rt: Record<string, unknown> | null | undefined): Record<string, boolean> => {
  const c: Record<string, boolean> = {};
  for (const k of TERM_KEYS) {
    if (rt?.[k] == null) continue;
    for (const code of certCodesFor(rt, k)) c[certConfKey(k, code)] = true; // no-op for non-cert terms
    c[k] = true;
  }
  return c;
};
const UNIT_LABEL: Record<string, [string, string]> = {
  PER_DAY: ["day", "يوم"], PER_WEEK: ["week", "أسبوع"], PER_MONTH: ["month", "شهر"], PER_JOB: ["job", "مهمة"],
};
const num = (v: string) => (v.trim() && Number.isFinite(Number(v)) ? Number(v) : 0);
// The fixed-divisor assumption behind a weekly/monthly rate, shown next to the billable-day count so the
// supplier can see how their rate became the period total. Mirrors the app's `rentalPeriodSubtitle`;
// daily and per-job rates have no divisor to explain, so they get nothing.
const periodNote = (unit: string | null | undefined, ar: boolean): string => {
  const p = rentalPeriodSubtitle(unit);
  if (!p) return "";
  const d = rentalDivisor(unit);
  return ar
    ? ` · ${d} ${p === "weekly" ? "أيام عمل/أسبوع" : "يوم عمل/شهر"}`
    : ` · ${d} working days/${p === "weekly" ? "week" : "month"}`;
};

// The supplier "Quote valid until" field. Enabled now that the link_bid_submissions.valid_until
// migration (20260629000000) is on staging and the submit handler persists it end-to-end.
const QUOTE_EXPIRY_ENABLED = true;

type Answer = {
  // Keyed by TermKey, plus per-cert-code composite keys `${certTerm}::${code}` (see CERT_KEYS).
  confirmations: Record<string, boolean | undefined>;
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
function AttachSection({ icon, accent, title, desc, pill, tone = "opt", hint, children }: {
  icon: string;
  accent: { c: string; bg: string; bd: string };
  title: React.ReactNode;
  desc?: React.ReactNode;
  pill: string;
  tone?: "req" | "opt";
  /** Small helper line under the uploader (e.g. "you can combine several docs into one file"). */
  hint?: React.ReactNode;
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
      {hint && <div className="att-hint"><span className="material-icons-outlined">merge_type</span>{hint}</div>}
    </div>
  );
}

export default function BidFormClient({ token }: { token: string }) {
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
  const [company, setCompany] = useState({ companyName: "", crNumber: "", vatNumber: "", nationalAddress: "", contactInfo: "", city: "", notes: "", validUntil: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  // Mobile OS (for the footer "download the app" CTA → the right store). Detected client-side after mount.
  const [device, setDevice] = useState<"android" | "ios" | "other">("other");
  useEffect(() => {
    const ua = navigator.userAgent || "";
    const iOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); // iPadOS reports MacIntel
    setDevice(/android/i.test(ua) ? "android" : iOS ? "ios" : "other");
  }, []);
  // Items the supplier can't supply (multi-item requests) — excluded from terms/pricing/quality/submit
  // so they can bid on just what they have (e.g. the forklift but not the crane).
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const toggleSupply = (id: string) => setSkipped((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
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
          // Default every required term to "Yes" — the supplier can flip any to "No"; the "Yes to all"
          // toggle reflects the live answers, so it starts on.
          init[it.requestItemId] = { confirmations: allYesConf(it.requiredTerms), rentalRate: "", deliveryPrice: "", returnPrice: "", offeredUnits: String((it.remainingUnits ?? it.numberOfUnits) || 1) };
        }
        setAnswers(init);
        setContract(Object.fromEntries(d.contractTerms.map((c) => [c.key, true])));
      })
      .catch(() => alive && setNotFound(true))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [token]);

  const itemTerms = (it: BidFormItem) => TERM_KEYS.filter((k) => it.requiredTerms[k] != null);
  // Every confirmation toggle for an item — one per term, but multi-code cert terms expand to one per code.
  const itemConfKeys = (it: BidFormItem): string[] =>
    itemTerms(it).flatMap((k) => { const codes = certCodesFor(it.requiredTerms, k); return codes.length > 1 ? codes.map((code) => certConfKey(k, code)) : [k]; });
  const setConf = (id: string, k: TermKey, v: boolean) => setAnswers((p) => ({ ...p, [id]: { ...p[id], confirmations: { ...p[id].confirmations, [k]: v } } }));
  // Set one cert code's answer, then re-roll the aggregate the wire contract reads.
  const setCertConf = (id: string, k: TermKey, codes: string[], code: string, v: boolean) => setAnswers((p) => {
    const conf = { ...p[id].confirmations, [certConfKey(k, code)]: v };
    rollCert(conf, k, codes);
    return { ...p, [id]: { ...p[id], confirmations: conf } };
  });
  const setPrice = (id: string, field: "rentalRate" | "deliveryPrice" | "returnPrice", v: string) => setAnswers((p) => ({ ...p, [id]: { ...p[id], [field]: v } }));
  const setOffered = (id: string, v: string) => setAnswers((p) => ({ ...p, [id]: { ...p[id], offeredUnits: v } }));
  // Units still open to a shared-link supplier = numberOfUnits − units already held by other suppliers'
  // accepted (AWAITING) + confirmed (CLOSED) deals (backend PR #484 via `remainingUnits`). Absent → the
  // full requested count (no regression). Only multi-unit MULTIPLE_SUPPLIERS lines ever cap below it.
  const remainingOf = (it: BidFormItem) => it.remainingUnits ?? it.numberOfUnits;
  const isFullyCovered = (it: BidFormItem) => remainingOf(it) <= 0;
  // Units this line offers — parsed + clamped to 1..remaining; defaults to the full remaining count.
  const offeredQty = (it: BidFormItem, a?: Answer) => { const max = Math.max(1, remainingOf(it)); const nq = Math.round(num(a?.offeredUnits ?? "")); return nq >= 1 && nq <= max ? nq : max; };
  // A line drops out of the bid when the supplier opts out (skip) OR it's already fully covered by others.
  const isExcluded = (it: BidFormItem) => skipped.has(it.requestItemId) || isFullyCovered(it);

  // Per-item "Yes to all" — the toggle's on/off state is DERIVED from the live answers (see render), so
  // it never drifts; this just flips every term of THIS item on or off. Lives next to the Terms subhead.
  const toggleItemYes = (it: BidFormItem, allYes: boolean) => {
    setAnswers((p) => {
      const conf = { ...(p[it.requestItemId]?.confirmations ?? {}) };
      for (const ck of itemConfKeys(it)) conf[ck] = allYes ? undefined : true;
      for (const k of itemTerms(it)) { const codes = certCodesFor(it.requiredTerms, k); if (codes.length > 1) rollCert(conf, k, codes); }
      return { ...p, [it.requestItemId]: { ...p[it.requestItemId], confirmations: conf } };
    });
  };
  // "Yes to all" for the for-all-items contract terms (same derived pattern).
  const toggleContractYes = (allYes: boolean) => {
    if (!data) return;
    const next: Record<string, boolean> = {};
    if (!allYes) for (const c of data.contractTerms) next[c.key] = true;
    setContract(next);
  };

  // Reset for "Submit another bid" — clear terms/prices for a fresh quotation (keep company details,
  // since it's the same supplier sending another option).
  const resetForm = () => {
    if (!data) return;
    const init: Record<string, Answer> = {};
    for (const it of data.items) init[it.requestItemId] = { confirmations: allYesConf(it.requiredTerms), rentalRate: "", deliveryPrice: "", returnPrice: "", offeredUnits: String((it.remainingUnits ?? it.numberOfUnits) || 1) };
    setAnswers(init);
    setContract(Object.fromEntries(data.contractTerms.map((c) => [c.key, true])));
    setAtt({});
    setCoCr([]); setCoVat([]); setCoAddr([]); setCoExtra([]);
    setCoMode({ cr: "text", vat: "text", addr: "text" });
    setSkipped(new Set());
    setShowErrors(false);
    setSubmitting(false);
    setSubmitted(false);
    window.scrollTo(0, 0);
  };

  // The request's rental window. The supplier quotes a RATE ("30,000 per month"); what they'll actually
  // invoice is that rate prorated over the job's real length, so the form needs the period the renter
  // set. Both dates already ride the bid-form payload — no backend change was needed to price this.
  // Null (open-ended request, or no end date) → `computeRentalTotal` falls back to the raw rate.
  const durationDays = durationDaysBetween(data?.projectTerms?.startDate, data?.projectTerms?.endDate);
  const startDate = data?.projectTerms?.startDate ?? null;

  /**
   * One item's money, through the SAME module the renter's bid card, deal room and quotation price
   * against (`@/lib/pricing/rental`) — so the number the supplier commits to here is the number the
   * renter sees there. Before this, the form did `(rate + delivery + return) × qty` and never looked at
   * the calendar, which is why the same off-platform bid read one way on this page and another way in
   * the renter's comparison.
   *
   * Rental prorates — `(rate ÷ divisor) × billableDays`, Fridays excluded — while the two transport
   * legs stay flat: a delivery run is a trip, not a period. VAT-inclusive entry strips the 15% off the
   * inputs first, so proration and the ×1.15 downstream land back exactly on the gross they typed
   * (the arithmetic is linear, so stripping before or after is identical — before is just clearer).
   */
  const itemPricing = (it: BidFormItem, a?: Answer) => {
    const units = offeredQty(it, a); // price the units actually offered (partial bid)
    const strip = (v: number) => (vatIncluded ? v / 1.15 : v);
    const rate = strip(num(a?.rentalRate ?? ""));
    const rental = computeRentalTotal({ rate, priceUnit: it.priceUnit, startDate, durationDays });
    const totals = computeQuoteTotals({
      perUnitRental: rental.total,
      rentalUnits: units,
      // Legs are only the supplier's when the renter said so; otherwise there is no price to add.
      mob: { amount: (it.deliveryBy || "").toLowerCase() === "supplier" ? strip(num(a?.deliveryPrice ?? "")) : 0 },
      demob: { amount: (it.returnBy || "").toLowerCase() === "supplier" ? strip(num(a?.returnPrice ?? "")) : 0 },
    });
    return { units, rental, ...totals };
  };

  const grand = useMemo(
    () => (data?.items ?? []).filter((it) => !isExcluded(it)).reduce((s, it) => s + itemPricing(it, answers[it.requestItemId]).overall.total, 0),
    [data, answers, vatIncluded, skipped, durationDays, startDate],
  );

  // Company name + contact are the required identity; CR / VAT / National Address are optional and can
  // be provided as text OR a document, so they don't gate submission.
  const companyValid = !!(company.companyName.trim() && company.contactInfo.trim());
  // Only items the supplier says they can supply gate submission (skipped + fully-covered are dropped).
  const suppliedItems = (data?.items ?? []).filter((it) => !isExcluded(it));
  // Every item already fully covered by other suppliers' accepted bids → nothing left to bid on.
  const allCovered = !!data && data.items.length > 0 && data.items.every(isFullyCovered);
  const itemsValid = suppliedItems.every((it) => num(answers[it.requestItemId]?.rentalRate ?? "") > 0);
  // Every shown term (per-item + project) must be answered Yes/No — no silent grey/unanswered terms.
  const termsAnswered =
    suppliedItems.every((it) => itemConfKeys(it).every((ck) => typeof answers[it.requestItemId]?.confirmations[ck] === "boolean")) &&
    (data?.contractTerms ?? []).every((c) => typeof contract[c.key] === "boolean");
  // Can't submit an empty bid — at least one item must be supplied.
  const hasSupplied = suppliedItems.length > 0;
  const valid = !!companyValid && itemsValid && termsAnswered && hasSupplied;
  // "Yes to all" state for the contract terms — derived from the live answers so the toggle never drifts.
  const allContractYes = !!data && data.contractTerms.length > 0 && data.contractTerms.every((c) => contract[c.key] === true);

  // Live bid-quality score (terms match + docs + completeness) — updates as the supplier fills the form.
  const quality = useMemo(() => {
    const items = (data?.items ?? []).filter((it) => !isExcluded(it)).map((it) => {
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
    // Optional company slots — each satisfied by text input OR an attached document.
    const companyInput = {
      cr: !!company.crNumber.trim() || coCr.length > 0,
      vat: !!company.vatNumber.trim() || coVat.length > 0,
      address: !!company.nationalAddress.trim() || coAddr.length > 0,
      otherDocs: coExtra.length > 0,
    };
    return computeBidQuality({ items, company: companyInput });
  }, [data, answers, contract, att, coCr, coVat, coAddr, coExtra, company.crNumber, company.vatNumber, company.nationalAddress, skipped]);

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
        city: company.city.trim() || undefined,
        // No backend flag for VAT-inclusive pricing — carry it as a tagged line in the notes (which
        // round-trip to the renter's submission view). The viewer surfaces it as a dedicated note.
        notes: buildSubmissionNotes(company.notes, vatIncluded),
        validUntil: company.validUntil ? new Date(company.validUntil).toISOString() : undefined,
        items: data.items.filter((it) => !isExcluded(it)).map((it) => {
          const a = answers[it.requestItemId];
          // Store VAT-exclusive prices. If the supplier priced VAT-inclusive, strip the 15% back out so
          // the renter side — which always adds VAT — lands on the same total.
          // Merge the project/contract confirmations (apply to all items) into each item's answers.
          const at = itemAtt(it.requestItemId);
          const photos = at.photos.map((p) => ({ key: p.key, type: p.type as BidPhotoKind, filename: p.filename ?? undefined }));
          const certDocs = Object.values(at.certs).flat();
          const documents = [...at.ownership, ...certDocs].map((d) => ({ key: d.key, type: d.type as BidDocKind, filename: d.filename ?? undefined }));
          return { requestItemId: it.requestItemId, confirmations: toWireConf({ ...a.confirmations, ...contract }), offeredUnits: it.numberOfUnits > 1 ? offeredQty(it, a) : undefined, rentalRate: priceToStore(num(a.rentalRate), vatIncluded), deliveryPrice: priceToStore(num(a.deliveryPrice), vatIncluded), returnPrice: priceToStore(num(a.returnPrice), vatIncluded), ...(photos.length ? { photos } : {}), ...(documents.length ? { documents } : {}) };
        }),
        companyDocuments: (() => {
          const all = [...coCr, ...coVat, ...coAddr, ...coExtra];
          return all.length ? all.map((d) => ({ key: d.key, type: d.type as CompanyDocKind, filename: d.filename ?? undefined })) : undefined;
        })(),
      });
      setSubmitted(true);
      window.scrollTo(0, 0);
    } catch (e) {
      setSubmitting(false);
      // Refresh the form — a race (another supplier's units got accepted while this form was open) moves
      // the cap, so reloading re-applies each item's `remainingUnits` (stepper max, defaults, fully-covered).
      fetchBidFormData(token).then((d) => setData(d)).catch(() => {});
      // Surface the backend's specific reason (e.g. the units-cap 400/409 "Offer between 1 and N…") instead
      // of a generic failure, so a race reads cleanly. Falls back to the generic message.
      const msg = e instanceof ApiError ? (ar ? (e.messageAr ?? e.detail) : (e.detail ?? e.messageAr)) : null;
      alert(msg || L("Could not submit — the request may have closed, or please try again.", "تعذّر الإرسال — قد يكون الطلب أُغلق، أو حاول مرة أخرى."));
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
    // For suppliers whose proofs are combined in a single PDF/scan — upload once, pick this.
    { value: "combined", label: L("Several documents in one file", "عدة مستندات في ملف واحد") },
  ];
  // Equipment + operator certificate slots are request-driven (parseCertSlots), so no fixed kind list.
  const companyExtraKinds: UploaderKind[] = [
    { value: "local_content", label: L("Local content", "المحتوى المحلي") },
    { value: "saso_heavy_equip", label: L("SASO heavy equipment", "ساسو للمعدات الثقيلة") },
    { value: "other", label: L("Other", "أخرى") },
  ];

  const dir = ar ? "rtl" : "ltr";
  const sar = L("SAR", "ر.س");
  // Arabic dates use the Gregorian (ميلادي) calendar, not Hijri — force it via the -ca-gregory locale ext.
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(ar ? "ar-SA-u-ca-gregory" : "en-GB", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div dir={dir} className={`bidpage${ar ? " rtl" : ""}`}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600;700&family=Inter:wght@400;500;600;700;800;900&family=Tajawal:wght@400;500;700;800;900&display=swap" rel="stylesheet" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/icon?family=Material+Icons+Outlined" />
      {/* Material Symbols covers equipment glyphs the classic set lacks (e.g. forklift) — used for the item icon. */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,400,0,0" />
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
              {/* Breakdown — shows the supplier exactly which dimension to improve; each bar turns green when complete. */}
              <div className="qb-parts">
                {([
                  { icon: "rule", lb: L("Terms match", "مطابقة الشروط"), w: 40, v: quality.parts.terms },
                  { icon: "photo_library", lb: L("Equipment docs", "مستندات المعدة"), w: 30, v: quality.parts.equipment },
                  { icon: "business", lb: L("Company details", "بيانات الشركة"), w: 30, v: quality.parts.company },
                ] as const).map((p) => {
                  const done = p.v >= 0.999;
                  return (
                    <div className={`qpart${done ? " done" : ""}`} key={p.lb}>
                      <div className="qpart-h">
                        <span className="qpart-lb"><span className="material-icons-outlined">{done ? "check_circle" : p.icon}</span>{p.lb}</span>
                        <span className="qpart-pc">{Math.round(p.v * 100)}%</span>
                      </div>
                      <div className="qpart-track"><i style={{ width: `${Math.round(p.v * 100)}%` }} /></div>
                      <span className="qpart-w">{L("weight", "الوزن")} {p.w}%</span>
                    </div>
                  );
                })}
              </div>
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
                    <button type="button" className={`yall${allContractYes ? " on" : ""}`} onClick={() => toggleContractYes(allContractYes)}><span className="yall-sw"></span>{L("Yes to all", "نعم للكل")}</button>
                  </div>
                  <div className="treqgrid">
                    {data.contractTerms.map((c) => {
                      const ans = contract[c.key];
                      return (
                        <div key={c.key} className={`treqcell${ans === true ? " ok" : ""}${ans === false ? " declined" : ""}${showErrors && ans === undefined ? " needpick" : ""}`}>
                          <div className="tc-main"><div className="tc-name"><span className="material-icons-outlined">gavel</span>{c.label}</div></div>
                          <div className="tc-rw"><span className="q">{L("Renter's choice", "اختيار المستأجر")}</span> <i>{choiceLabel(c.value, ar)}</i></div>
                          <div className="tc-sw"><span className="q">{L("Your choice", "اختيارك")}</span><YesNo L={L} value={ans} onChange={(v) => setContract((p) => ({ ...p, [c.key]: v }))} /></div>
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
            const confKeys = itemConfKeys(it);
            const allItemYes = confKeys.length > 0 && confKeys.every((ck) => a?.confirmations[ck] === true);
            // The backend sends the label as "Category / Subcategory" (the category can itself contain a
            // slash, e.g. "Compactor / Roller"), so show ONLY the subcategory — the segment appended last —
            // to keep the header uncluttered. Falls back to the whole label when there's no subcategory.
            const rawLabel = (ar ? it.labelAr : it.label) || it.label || "";
            const label = rawLabel.split(" / ").pop()?.trim() || L("Equipment", "المعدة");
            const size = (ar ? it.sizeAr : it.size) || it.size || null;
            const q = it.numberOfUnits || 1;
            const remaining = remainingOf(it); // units still open to this supplier (≤ q; backend cap)
            const covered = Math.max(0, q - remaining); // units already held by other suppliers' accepted/confirmed deals
            const fullyCovered = isFullyCovered(it); // remaining ≤ 0 → nothing left to bid on
            const oq = offeredQty(it, a); // units this line offers (1..remaining)
            const unit = it.priceUnit ? (ar ? UNIT_LABEL[it.priceUnit]?.[1] : UNIT_LABEL[it.priceUnit]?.[0]) ?? it.priceUnit : L("unit", "وحدة");
            const pr = itemPricing(it, a);
            // The table's price column is whatever basis the supplier chose (net or VAT-inclusive), so its
            // Total column must match — `itemPricing` works in net, so scale back up when they typed gross.
            const vatMul = vatIncluded ? 1.15 : 1;
            const sub = pr.overall.subtotal;
            const line = (v: string) => (num(v) ? num(v) * oq : 0);
            // Supplier prices delivery/return ONLY when they handle it; if the renter does, no price row.
            const delBySup = (it.deliveryBy || "").toLowerCase() === "supplier";
            const retBySup = (it.returnBy || "").toLowerCase() === "supplier";
            const multiItem = data.items.length > 1; // opt-out only makes sense when there's more than one item
            const skip = skipped.has(it.requestItemId);
            return (
              <div className={`sec${skip ? " item-skipped" : ""}`} key={it.requestItemId}>
                <div className="item-hd">
                  <span className="item-ic"><ItemThumb src={it.imageUrl} name={rawLabel} /></span>
                  <div className="inm-wrap"><span className="inm">{label}</span>{size && <span className="imeta">· {size}</span>}
                    <span className={`units-chip${q > 1 ? " multi" : ""}`}><span className="msym">{q > 1 ? "layers" : "package_2"}</span>×{q} {q === 1 ? L("unit", "وحدة") : L("units", "وحدات")}</span>
                    {fullyCovered && <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 800, color: "#c0392b", background: "#fdecea", border: "1px solid #f3c0ba", borderRadius: 20, padding: "2px 9px" }}><span className="material-icons-outlined" style={{ fontSize: 14 }}>lock</span>{L("Fully covered", "مُغطّى بالكامل")}</span>}</div>
                  <span className="ibadge">{L(`Item ${idx + 1} of ${data.items.length}`, `البند ${idx + 1} من ${data.items.length}`)}</span>
                </div>

                {/* Opt-out: in a multi-item request the supplier bids on only what they can supply. Hidden
                    for a fully-covered item — there's nothing to opt into. */}
                {multiItem && !fullyCovered && (
                  <button type="button" className={`supply-tog${skip ? " off" : ""}`} onClick={() => toggleSupply(it.requestItemId)}>
                    <span className="supply-sw"></span>
                    <span className="supply-tx">{skip ? L("You can't supply this item — tap to include it", "لا يمكنك توفير هذا البند — اضغط لإضافته") : L("I can supply this item", "أستطيع توفير هذا البند")}</span>
                    {!skip && <span className="supply-skip">{L("Can't supply? Skip it", "لا تستطيع؟ استبعده")}</span>}
                  </button>
                )}

                {fullyCovered ? (
                  <div className="skip-note">
                    <span className="material-icons-outlined">lock</span>
                    <span>{L(`All ${q} units are already covered by other suppliers' accepted bids — there are no units left to bid on for this item.`, `جميع الوحدات (${q}) مُغطّاة بالفعل من عروض مؤجّرين آخرين المقبولة — لا توجد وحدات متبقية لتقديم عرض على هذا البند.`)}</span>
                  </div>
                ) : skip ? (
                  <div className="skip-note">
                    <span className="material-icons-outlined">block</span>
                    <span>{L("Not included in your bid. You won't price this item or confirm its terms — bid on the items you can supply.", "غير مُدرَج في عرضك. لن تُسعّر هذا البند أو تؤكّد شروطه — قدّم عرضك على البنود التي تستطيع توفيرها.")}</span>
                  </div>
                ) : (
                <>
                {q > 1 && (
                  <div className="units-note" style={{ flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                    <span className="material-icons-outlined un-lead">layers</span>
                    <span className="un-tx" style={{ flex: 1, minWidth: 180 }}>{covered > 0
                      ? L(`The renter needs ${q} units — ${covered} already covered by other suppliers. You can supply up to ${remaining} ${remaining === 1 ? "unit" : "units"}; prices below multiply by how many you offer.`, `يحتاج المستأجر ${q} وحدات — ${covered} مُغطّاة بالفعل من مؤجّرين آخرين. يمكنك توفير حتى ${remaining} ${remaining === 1 ? "وحدة" : "وحدات"}؛ تُضرب الأسعار أدناه بعدد ما تعرضه.`)
                      : L(`Multi-unit item — the renter needs ${q} units. Set how many you can supply (bid on some or all); prices below multiply by this.`, `بند متعدد الوحدات — يحتاج المستأجر ${q} وحدات. حدّد كم وحدة تستطيع توفيرها (اعرض على بعضها أو كلّها)؛ تُضرب الأسعار أدناه بهذا العدد.`)}</span>
                    {/* Partial-bid control — an explicit −/+ stepper so it's unmistakable the supplier can
                        choose to supply fewer than the units still open. Capped at `remaining` (units not
                        already covered by others). Hidden when only 1 unit is left (no choice). */}
                    {remaining > 1 && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 10, whiteSpace: "nowrap", background: "#fff", border: "1px solid #e6c690", borderRadius: 10, padding: "6px 12px" }}>
                      <span style={{ fontSize: 12.5, fontWeight: 800, color: "#1c3550" }}>{L("Units you can supply", "الوحدات المتاحة لديك")}</span>
                      <span style={{ display: "inline-flex", alignItems: "center", border: "2px solid #f79009", borderRadius: 9, overflow: "hidden" }}>
                        <button type="button" aria-label={L("Fewer units", "تقليل")} disabled={oq <= 1}
                          onClick={() => setOffered(it.requestItemId, String(Math.max(1, oq - 1)))}
                          style={{ width: 36, height: 36, border: "none", background: oq <= 1 ? "#f6efe2" : "#fff5e8", color: oq <= 1 ? "#c9b48c" : "#b45309", fontSize: 22, fontWeight: 900, cursor: oq <= 1 ? "default" : "pointer", lineHeight: 1, fontFamily: "inherit" }}>−</button>
                        <span style={{ minWidth: 38, textAlign: "center", fontSize: 16, fontWeight: 900, color: "#1c3550" }}>{oq}</span>
                        <button type="button" aria-label={L("More units", "زيادة")} disabled={oq >= remaining}
                          onClick={() => setOffered(it.requestItemId, String(Math.min(remaining, oq + 1)))}
                          style={{ width: 36, height: 36, border: "none", background: oq >= remaining ? "#f6efe2" : "#fff5e8", color: oq >= remaining ? "#c9b48c" : "#b45309", fontSize: 22, fontWeight: 900, cursor: oq >= remaining ? "default" : "pointer", lineHeight: 1, fontFamily: "inherit" }}>+</button>
                      </span>
                      <span style={{ color: "#6b8fa8", fontWeight: 800, fontSize: 14 }}>/ {remaining}</span>
                    </span>
                    )}
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
                      <button type="button" className={`yall${allItemYes ? " on" : ""}`} onClick={() => toggleItemYes(it, allItemYes)}><span className="yall-sw"></span>{L("Yes to all", "نعم للكل")}</button>
                    </div>
                    <div className="treqgrid">
                      {terms.flatMap((k) => {
                        const codes = certCodesFor(it.requiredTerms, k);
                        // A cert term listing 2+ certs gets one card per cert (confirm TÜV but not SPSP);
                        // everything else stays a single card.
                        const rows = codes.length > 1
                          ? codes.map((code) => ({ ck: certConfKey(k, code), code, val: prettyCert(code) }))
                          : [{ ck: k, code: null as string | null, val: (k === "operatorCert" || k === "equipmentCert") ? prettyCert(it.requiredTerms[k] ?? "") : choiceLabel(it.requiredTerms[k], ar) }];
                        return rows.map((row) => {
                          const ans = a?.confirmations[row.ck];
                          return (
                            <div key={row.ck} className={`treqcell${ans === true ? " ok" : ""}${ans === false ? " declined" : ""}${showErrors && ans === undefined ? " needpick" : ""}`}>
                              <div className="tc-main">
                                <div className="tc-name"><span className="material-icons-outlined">{TERM_ICON[k]}</span>{L(TERM_LABEL[k][0], TERM_LABEL[k][1])}</div>
                              </div>
                              <div className="tc-rw"><span className="q">{L("Renter's choice", "اختيار المستأجر")}</span> <i>{row.val}</i></div>
                              <div className="tc-sw"><span className="q">{L("Your choice", "اختيارك")}</span><YesNo L={L} value={ans} onChange={(v) => row.code != null ? setCertConf(it.requestItemId, k, codes, row.code, v) : setConf(it.requestItemId, k, v)} /></div>
                            </div>
                          );
                        });
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
                <div className="ptbl-wrap"><table className="ptbl">
                  <thead><tr><th>{L("Item", "البند")}</th><th className="num">{L("Unit", "الوحدة")}</th><th className="num">{L("Qty", "العدد")}</th><th className="num">{vatIncluded ? L("Price (incl. VAT)", "السعر (شامل الضريبة)") : L("Your price", "سعرك")}</th><th className="num">{L("Total", "الإجمالي")}</th></tr></thead>
                  <tbody>
                    <tr>
                      <td>
                        <div className="it-lbl">{L("Rental", "الإيجار")}<span className="reqx"> *</span></div>
                        {/* How the quoted RATE becomes the period total — shown only when there's a period
                            to prorate over. Without it the jump from "30,000" to "122,308" is unexplained. */}
                        {!pr.rental.raw && (
                          <div className="it-sub2">{L(
                            `${pr.rental.billable} billable days${periodNote(it.priceUnit, false)}`,
                            `${pr.rental.billable} يوم محتسب${periodNote(it.priceUnit, true)}`,
                          )}</div>
                        )}
                      </td>
                      <td className="num">{unit}</td><td className="num">{oq}</td>
                      <td className="num"><input className={`ptbl-in${showErrors && num(a?.rentalRate ?? "") <= 0 ? " invalid" : ""}`} inputMode="numeric" value={a?.rentalRate ?? ""} onChange={(e) => setPrice(it.requestItemId, "rentalRate", e.target.value)} placeholder="0" /></td>
                      <td className="num tot">{num(a?.rentalRate ?? "") ? nf(pr.overall.rental * vatMul) : "—"}</td>
                    </tr>
                    {/* Delivery/Return are always shown. When the RENTER handles them, they're read-only
                        (no price input) — the supplier just sees the renter is responsible. */}
                    <tr>
                      <td><div className="it-lbl">{L("Delivery to site", "النقل إلى الموقع")}</div><div className="it-sub2">{delBySup ? L("price × qty", "السعر × العدد") : L("handled by the renter", "على المستأجر")}</div></td>
                      <td className="num">{L("Trip", "رحلة")}</td><td className="num">{oq}</td>
                      {delBySup
                        ? <td className="num"><input className="ptbl-in" inputMode="numeric" value={a?.deliveryPrice ?? ""} onChange={(e) => setPrice(it.requestItemId, "deliveryPrice", e.target.value)} placeholder="0" /></td>
                        : <td className="num"><span className="byrenter">{L("Renter", "المستأجر")}</span></td>}
                      <td className="num tot">{delBySup ? (num(a?.deliveryPrice ?? "") ? nf(line(a!.deliveryPrice)) : "—") : "—"}</td>
                    </tr>
                    <tr>
                      <td><div className="it-lbl">{L("Return from site", "النقل من الموقع")}</div><div className="it-sub2">{retBySup ? L("price × qty", "السعر × العدد") : L("handled by the renter", "على المستأجر")}</div></td>
                      <td className="num">{L("Trip", "رحلة")}</td><td className="num">{oq}</td>
                      {retBySup
                        ? <td className="num"><input className="ptbl-in" inputMode="numeric" value={a?.returnPrice ?? ""} onChange={(e) => setPrice(it.requestItemId, "returnPrice", e.target.value)} placeholder="0" /></td>
                        : <td className="num"><span className="byrenter">{L("Renter", "المستأجر")}</span></td>}
                      <td className="num tot">{retBySup ? (num(a?.returnPrice ?? "") ? nf(line(a!.returnPrice)) : "—") : "—"}</td>
                    </tr>
                  </tbody>
                </table></div>
                {/* Why the rental total isn't just the rate — the single most surprising number on this
                    page. Only shown once the request actually has a period (open-ended → raw rate). */}
                {!pr.rental.raw && data.projectTerms?.startDate && (
                  <div className="ro-hint" style={{ marginTop: -2 }}>
                    {L(
                      `${fmtDate(data.projectTerms.startDate)} – ${data.projectTerms.endDate ? fmtDate(data.projectTerms.endDate) : ""} · ${durationDays} days, Fridays excluded → ${pr.rental.billable} billable days. Your price per ${unit} is charged pro rata over them.`,
                      `${fmtDate(data.projectTerms.startDate)} – ${data.projectTerms.endDate ? fmtDate(data.projectTerms.endDate) : ""} · ${durationDays} يوماً، باستثناء أيام الجمعة ← ${pr.rental.billable} يوم محتسب. يُحتسب سعرك بالتناسب عليها.`,
                    )}
                  </div>
                )}
                <div className="itot">
                  <span className="r">{vatIncluded ? L("Net (before VAT)", "الصافي (قبل الضريبة)") : L("Subtotal", "المجموع")}<b>{sub ? nf(sub) : "—"} {sar}</b></span>
                  <span className="r">{L("VAT 15%", "ضريبة ١٥٪")}<b>{sub ? nf(sub * 0.15) : "—"} {sar}</b></span>
                  <span className="r t">{vatIncluded ? L("Item total (incl. VAT)", "إجمالي البند (شامل الضريبة)") : L("Item total", "إجمالي البند")}<b>{sub ? nf(sub * 1.15) : "—"} {sar}</b></span>
                </div>

                {/* Encourage attachments — they raise the bid-quality score and the renter's confidence. */}
                <div className="att-upsell">
                  <span className="material-icons-outlined au-ic">workspace_premium</span>
                  <div className="au-tx">
                    <b>{L("Photos & documents raise your bid quality", "الصور والمستندات ترفع جودة عرضك")}</b>
                    <span>{L("Bids with equipment photos and supporting documents score higher and stand out — the renter is far more likely to pick a complete, verified bid and close the deal with you.", "العروض المرفقة بصور المعدة والمستندات الداعمة تحصل على درجة أعلى وتبرز أكثر — والمستأجر أميل بكثير لاختيار عرض مكتمل وموثّق وإتمام الصفقة معك.")}</span>
                  </div>
                </div>

                {/* Attachments — photos + ownership share one row (choose-type dropdown); equipment /
                    operator certificates are request-driven labeled slots, shown only when required. */}
                <div className="att-row">
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
                </div>

                {(() => {
                  const slots = parseCertSlots(it.requiredTerms.equipmentCert, "");
                  return slots.length ? (
                    <AttachSection icon="workspace_premium" accent={ATT_ACCENT.eqc}
                      title={L("Equipment certificate", "شهادة المعدة")} desc={L("Attach if you have it — strengthens your bid", "أرفقها إن توفّرت — تقوّي عرضك")} pill={L("Optional", "اختياري")}>
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
                      title={L("Operator certificate", "شهادة المشغّل")} desc={L("Attach if you have it — strengthens your bid", "أرفقها إن توفّرت — تقوّي عرضك")} pill={L("Optional", "اختياري")}>
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
                </>
                )}
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
            <div className="frow">
              <Field label={L("Phone", "رقم الجوال")} req invalid={showErrors && !company.contactInfo.trim()} L={L}><input type="tel" inputMode="tel" value={company.contactInfo} onChange={(e) => setCompany({ ...company, contactInfo: e.target.value })} placeholder={L("e.g. 05XXXXXXXX", "مثال: 05XXXXXXXX")} /></Field>
              <Field label={L("City", "المدينة")} L={L}><input value={company.city} onChange={(e) => setCompany({ ...company, city: e.target.value })} placeholder={L("e.g. Riyadh", "مثال: الرياض")} /></Field>
            </div>
            <p style={{ margin: "-4px 0 2px", fontSize: 11.5, color: "var(--muted)" }}>{L("Your phone lets you continue this bid in the Moedatech app later.", "رقمك يتيح لك متابعة هذا العرض في تطبيق مؤيداتك لاحقاً.")}</p>
            {QUOTE_EXPIRY_ENABLED && <Field label={L("Quote valid until", "صلاحية العرض حتى")} L={L}><input type="date" value={company.validUntil} onChange={(e) => setCompany({ ...company, validUntil: e.target.value })} /></Field>}
            <div className="notes-field"><label>{L("Notes — for the whole quotation", "ملاحظات — لكامل عرض السعر")}<span className="optx">{L("Optional", "اختياري")}</span></label><textarea value={company.notes} onChange={(e) => setCompany({ ...company, notes: e.target.value })} /></div>

            {/* Optional extra company docs — Local Content / SASO heavy equipment / Other. */}
            <div className="subhead"><span className="material-icons-outlined">folder_open</span>{L("Other company documents", "مستندات أخرى للشركة")}<span className="optx">{L("Optional", "اختياري")}</span></div>
            <FileUploader token={token} folder="documents" kinds={companyExtraKinds} value={coExtra} onChange={setCoExtra} L={L} disabled={submitting} />
          </div>

          {showErrors && !valid && <div className="submit-err"><span className="material-icons-outlined">error_outline</span>{!hasSupplied ? (allCovered ? L("Every item is already fully covered by other suppliers' accepted bids — there's nothing left to bid on.", "جميع البنود مُغطّاة بالفعل من عروض مؤجّرين آخرين المقبولة — لا يوجد ما يمكن تقديم عرض عليه.") : L("Mark at least one item as one you can supply — a bid can't be empty.", "حدّد بنداً واحداً على الأقل تستطيع توفيره — لا يمكن أن يكون العرض فارغاً.")) : L("Please complete the highlighted items: answer every term, enter a rate for each item, and fill all company details.", "الرجاء إكمال العناصر المظللة: أجب عن كل شرط، وأدخل سعراً لكل بند، واملأ جميع بيانات الشركة.")}</div>}
          <div className="submit-bar"><button className="btn primary lg" disabled={submitting} onClick={onSubmit}><span className="material-icons-outlined">send</span>{submitting ? L("Submitting…", "جارٍ الإرسال…") : L("Submit bid", "إرسال العرض")}</button>
            <div className="submit-note">{L("Once submitted, your bid is final and can't be edited from this link.", "بعد الإرسال، يصبح عرضك نهائياً ولا يمكن تعديله من هذا الرابط.")}</div>
          </div>
          <div className="footer-note">{L("Private bid link — your details are shared only with the renter.", "رابط عرض خاص — تُشارك بياناتك مع المستأجر فقط.")}</div>
        </div>
      )}

      <footer className="pb-foot">
        {/* Download CTA — Moedatech wordmark sits inside the card on the start (left) side. */}
        <div className="dlapp">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <span className="dlapp-brand"><img src="/moedatech-logo.png" alt="Moedatech" /></span>
          <div className="dlapp-tx">
            <b>{L("Get more rental requests", "استقبل المزيد من طلبات الإيجار")}</b>
            <span>{L("Download the Moedatech app to receive requests directly and bid faster.", "حمّل تطبيق معداتك لاستقبال الطلبات مباشرةً وتقديم عروضك بسرعة.")}</span>
          </div>
          <div className="dlapp-btns">
            {device !== "android" && (
              <a className="store-badge" href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" aria-label="Download on the App Store">
                <svg viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" /></svg>
                <span className="sb-tx"><small>{L("Download on the", "حمّله من")}</small><b>App Store</b></span>
              </a>
            )}
            {device !== "ios" && (
              <a className="store-badge" href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer" aria-label="Get it on Google Play">
                <svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="gpgrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#00e0ff" /><stop offset=".45" stopColor="#00e676" /><stop offset=".75" stopColor="#ffcd00" /><stop offset="1" stopColor="#ff3b3b" /></linearGradient></defs><path fill="url(#gpgrad)" d="M4 2.4v19.2l15-9.6z" /></svg>
                <span className="sb-tx"><small>{L("GET IT ON", "احصل عليه من")}</small><b>Google Play</b></span>
              </a>
            )}
          </div>
        </div>
        <div className="pb-powered">{L("Powered by", "مُشغّل بواسطة")} <b>Moedatech</b></div>
      </footer>
    </div>
  );
}

function Cell({ k, children }: { k: string; children: React.ReactNode }) {
  return <div className="ro-cell"><div className="k">{k}</div><div className="v">{children}</div></div>;
}

// Equipment thumbnail: shows the taxonomy image when it loads; on 404 (common for web taxonomy URLs)
// or when absent, falls back to a name-derived glyph — never a broken-image placeholder.
function ItemThumb({ src, name }: { src?: string | null; name: string | null | undefined }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <span className="msym">{equipmentIcon(name)}</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className="item-ic-img" onError={() => setFailed(true)} />;
}

function YesNo({ value, onChange, L }: { value: boolean | undefined; onChange: (v: boolean) => void; L: (e: string, a: string) => string }) {
  return (
    <span className="miniseg">
      <button type="button" className={`ok${value === true ? " on" : ""}`} onClick={() => onChange(true)}><span className="material-icons-outlined">check</span>{L("Yes", "نعم")}</button>
      <button type="button" className={`no${value === false ? " on" : ""}`} onClick={() => onChange(false)}><span className="material-icons-outlined">close</span>{L("No", "لا")}</button>
    </span>
  );
}

function Field({ label, req, invalid, children, L }: { label: string; req?: boolean; invalid?: boolean; children: React.ReactNode; L: (e: string, a: string) => string }) {
  return (
    <div className={`field${invalid ? " invalid" : ""}`}>
      <label>{label}{req ? <span className="reqx"> *</span> : <span className="optx">{L("Optional", "اختياري")}</span>}</label>
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
        <label style={{ margin: 0 }}>{label}<span className="optx">{L("Optional", "اختياري")}</span></label>
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

// The renter's choice for a term. Party-responsibility values (fuel / FAT) read clearer as
// "On renter" / "On supplier"; everything else shows the localized value as-is.
const PARTY_VALUES: Record<string, [string, string]> = {
  RENTER: ["On renter", "على المستأجر"], RENTEE: ["On renter", "على المستأجر"],
  SUPPLIER: ["On supplier", "على المؤجّر"], ME: ["On supplier", "على المؤجّر"],
};
function choiceLabel(v: string | null | undefined, ar: boolean): string | null {
  if (v == null || String(v).trim() === "") return v ?? null;
  const party = PARTY_VALUES[String(v).trim().toUpperCase()];
  if (party) return ar ? party[1] : party[0];
  return ar ? localizeTermValue(v) : String(v);
}

function rentalBasisLabel(v: string, L: (e: string, a: string) => string) {
  const m: Record<string, [string, string]> = { DAILY: ["Daily", "يومي"], WEEKLY: ["Weekly", "أسبوعي"], MONTHLY: ["Monthly", "شهري"], PER_JOB: ["Per job", "للمهمة"], LONG_TERM: ["Long term", "طويل الأمد"] };
  const e = m[String(v).toUpperCase()];
  return e ? L(e[0], e[1]) : v;
}
