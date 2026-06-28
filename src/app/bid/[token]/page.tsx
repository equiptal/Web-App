"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { fetchBidFormData, submitBidForm } from "@/lib/api/client";
import type { BidFormData, BidFormItem } from "@/lib/contract/link-bids";
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

// Hide the supplier "Quote valid until" field until the link_bid_submissions.valid_until migration is
// applied + the agents backend redeployed. All wiring stays; flip to true once that's live.
const QUOTE_EXPIRY_ENABLED = false;

type Answer = {
  confirmations: Partial<Record<TermKey, boolean>>;
  rentalRate: string;
  deliveryPrice: string;
  returnPrice: string;
};

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
          init[it.requestItemId] = { confirmations: {}, rentalRate: "", deliveryPrice: "", returnPrice: "" };
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

  // "Confirm all as Yes" — set every shown term (per-item + contract) to Yes in one tap. The supplier
  // can still change any individual answer afterwards.
  const totalTerms = (data?.items ?? []).reduce((n, it) => n + itemTerms(it).length, 0) + (data?.contractTerms?.length ?? 0);
  const confirmAllYes = () => {
    if (!data) return;
    setAnswers((p) => {
      const next = { ...p };
      for (const it of data.items) {
        const conf = { ...(next[it.requestItemId]?.confirmations ?? {}) };
        for (const k of itemTerms(it)) conf[k] = true;
        next[it.requestItemId] = { ...next[it.requestItemId], confirmations: conf };
      }
      return next;
    });
    setContract((p) => {
      const next = { ...p };
      for (const c of data.contractTerms) next[c.key] = true;
      return next;
    });
  };

  // Reset for "Submit another bid" — clear terms/prices for a fresh quotation (keep company details,
  // since it's the same supplier sending another option).
  const resetForm = () => {
    if (!data) return;
    const init: Record<string, Answer> = {};
    for (const it of data.items) init[it.requestItemId] = { confirmations: {}, rentalRate: "", deliveryPrice: "", returnPrice: "" };
    setAnswers(init);
    setContract({});
    setShowErrors(false);
    setSubmitting(false);
    setSubmitted(false);
    window.scrollTo(0, 0);
  };

  const itemSubtotal = (it: BidFormItem, a?: Answer) => {
    if (!a) return 0;
    const q = it.numberOfUnits || 1;
    return (num(a.rentalRate) + num(a.deliveryPrice) + num(a.returnPrice)) * q;
  };
  const grand = useMemo(
    () => (data?.items ?? []).reduce((s, it) => s + itemSubtotal(it, answers[it.requestItemId]) * 1.15, 0),
    [data, answers],
  );

  const companyValid = company.companyName.trim() && company.crNumber.trim() && company.vatNumber.trim() && company.nationalAddress.trim() && company.contactInfo.trim();
  const itemsValid = (data?.items ?? []).every((it) => num(answers[it.requestItemId]?.rentalRate ?? "") > 0);
  // Every shown term (per-item + project) must be answered Yes/No — no silent grey/unanswered terms.
  const termsAnswered =
    (data?.items ?? []).every((it) => itemTerms(it).every((k) => typeof answers[it.requestItemId]?.confirmations[k] === "boolean")) &&
    (data?.contractTerms ?? []).every((c) => typeof contract[c.key] === "boolean");
  const valid = !!companyValid && itemsValid && termsAnswered;

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
        notes: company.notes.trim() || undefined,
        validUntil: company.validUntil ? new Date(company.validUntil).toISOString() : undefined,
        items: data.items.map((it) => {
          const a = answers[it.requestItemId];
          // Merge the project/contract confirmations (apply to all items) into each item's answers.
          return { requestItemId: it.requestItemId, confirmations: { ...a.confirmations, ...contract }, rentalRate: num(a.rentalRate), deliveryPrice: num(a.deliveryPrice), returnPrice: num(a.returnPrice) };
        }),
      });
      setSubmitted(true);
      window.scrollTo(0, 0);
    } catch {
      setSubmitting(false);
      fetchBidFormData(token).then((d) => setData(d)).catch(() => {});
      alert(L("Could not submit — the request may have closed, or please try again.", "تعذّر الإرسال — قد يكون الطلب أُغلق، أو حاول مرة أخرى."));
    }
  }

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

          {totalTerms > 0 && (
            <div className="confirm-all">
              <div className="ca-tx"><span className="material-icons-outlined">done_all</span>{L("Can you meet every term the renter set?", "هل يمكنك الالتزام بكل الشروط التي حدّدها المستأجر؟")}</div>
              <button type="button" className="btn ca-btn" onClick={confirmAllYes}>{L("Confirm all as Yes", "تأكيد الكل بنعم")}</button>
            </div>
          )}

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
                  <div className="subhead"><span className="material-icons-outlined">gavel</span>{L("Contract terms — for all items", "شروط العقد — لكل البنود")}</div>
                  <div className="treqgrid">
                    {data.contractTerms.map((c) => {
                      const ans = contract[c.key];
                      return (
                        <div key={c.key} className={`treqcell${showErrors && ans === undefined ? " needpick" : ""}`}>
                          <div className="tc-name">{c.label}</div>
                          <div className="tc-rw"><span className="q">{L("Renter wants", "يطلب المستأجر")}:</span> <i>{c.value}</i></div>
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
            const unit = it.priceUnit ? (ar ? UNIT_LABEL[it.priceUnit]?.[1] : UNIT_LABEL[it.priceUnit]?.[0]) ?? it.priceUnit : L("unit", "وحدة");
            const sub = itemSubtotal(it, a);
            const line = (v: string) => (num(v) ? num(v) * q : 0);
            return (
              <div className="sec" key={it.requestItemId}>
                <div className="item-hd">
                  <span className="material-icons-outlined">construction</span>
                  <div className="inm-wrap"><span className="inm">{label}</span><span className="imeta">{size ? ` · ${size}` : ""} · {q} {q === 1 ? L("unit", "وحدة") : L("units", "وحدات")}</span></div>
                  <span className="ibadge">{L(`Item ${idx + 1} of ${data.items.length}`, `البند ${idx + 1} من ${data.items.length}`)}</span>
                </div>

                {(it.deliveryBy || it.returnBy || it.notes) && (
                  <div className="iteminfo">
                    {it.deliveryBy && <span className="ii"><b>{L("Delivery", "النقل إلى الموقع")}:</b> {partyLabel(it.deliveryBy, L)}</span>}
                    {it.returnBy && <span className="ii"><b>{L("Return", "النقل من الموقع")}:</b> {partyLabel(it.returnBy, L)}</span>}
                    {it.notes && <span className="ii note"><span className="material-icons-outlined">sticky_note_2</span>{it.notes}</span>}
                  </div>
                )}

                {terms.length > 0 && (
                  <>
                    <div className="subhead"><span className="material-icons-outlined">fact_check</span>{L("Terms — can you meet each?", "الشروط — هل يمكنك الالتزام بكلٍّ منها؟")}</div>
                    <div className="treqgrid">
                      {terms.map((k) => {
                        const ans = a?.confirmations[k];
                        const val = (k === "operatorCert" || k === "equipmentCert") ? (it.requiredTerms[k] ?? "").toUpperCase() : it.requiredTerms[k];
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

                <div className="subhead"><span className="material-icons-outlined">request_quote</span>{L("Pricing", "التسعير")}</div>
                <table className="ptbl">
                  <thead><tr><th>{L("Item", "البند")}</th><th className="num">{L("Unit", "الوحدة")}</th><th className="num">{L("Qty", "العدد")}</th><th className="num">{L("Your price", "سعرك")}</th><th className="num">{L("Total", "الإجمالي")}</th></tr></thead>
                  <tbody>
                    <tr>
                      <td><div className="it-lbl">{L("Rental", "الإيجار")}</div></td>
                      <td className="num">{unit}</td><td className="num">{q}</td>
                      <td className="num"><input className={`ptbl-in${showErrors && num(a?.rentalRate ?? "") <= 0 ? " invalid" : ""}`} inputMode="numeric" value={a?.rentalRate ?? ""} onChange={(e) => setPrice(it.requestItemId, "rentalRate", e.target.value)} placeholder="0" /></td>
                      <td className="num tot">{num(a?.rentalRate ?? "") ? nf(line(a!.rentalRate)) : "—"}</td>
                    </tr>
                    <tr>
                      <td><div className="it-lbl">{L("Delivery to site", "النقل إلى الموقع")}</div><div className="it-sub2">{L("price × qty", "السعر × العدد")}</div></td>
                      <td className="num">{L("Trip", "رحلة")}</td><td className="num">{q}</td>
                      <td className="num"><input className="ptbl-in" inputMode="numeric" value={a?.deliveryPrice ?? ""} onChange={(e) => setPrice(it.requestItemId, "deliveryPrice", e.target.value)} placeholder="0" /></td>
                      <td className="num tot">{num(a?.deliveryPrice ?? "") ? nf(line(a!.deliveryPrice)) : "—"}</td>
                    </tr>
                    <tr>
                      <td><div className="it-lbl">{L("Return from site", "النقل من الموقع")}</div><div className="it-sub2">{L("price × qty", "السعر × العدد")}</div></td>
                      <td className="num">{L("Trip", "رحلة")}</td><td className="num">{q}</td>
                      <td className="num"><input className="ptbl-in" inputMode="numeric" value={a?.returnPrice ?? ""} onChange={(e) => setPrice(it.requestItemId, "returnPrice", e.target.value)} placeholder="0" /></td>
                      <td className="num tot">{num(a?.returnPrice ?? "") ? nf(line(a!.returnPrice)) : "—"}</td>
                    </tr>
                  </tbody>
                </table>
                <div className="itot">
                  <span className="r">{L("Subtotal", "المجموع")}<b>{sub ? nf(sub) : "—"} {sar}</b></span>
                  <span className="r">{L("VAT 15%", "ضريبة ١٥٪")}<b>{sub ? nf(sub * 0.15) : "—"} {sar}</b></span>
                  <span className="r t">{L("Item total", "إجمالي البند")}<b>{sub ? nf(sub * 1.15) : "—"} {sar}</b></span>
                </div>
              </div>
            );
          })}

          {/* Grand total */}
          <div className="grand"><span className="gk">{L("Grand total — all items (incl. VAT)", "الإجمالي الكلي — كل البنود (شامل الضريبة)")}</span><span className="gv">{grand > 0 ? nf(grand) : "—"} {sar}</span></div>

          {/* Your details */}
          <div className="sec">
            <div className="sec-h"><span className="material-icons-outlined hdic">badge</span><h3>{L("Your details", "بياناتك")}</h3></div>
            <Field label={L("Company name", "اسم الشركة")} req invalid={showErrors && !company.companyName.trim()} L={L}><input value={company.companyName} onChange={(e) => setCompany({ ...company, companyName: e.target.value })} placeholder={L("e.g. Gulf Heavy Equipment Co.", "مثال: شركة الخليج للمعدات")} /></Field>
            <div className="frow">
              <Field label={L("CR number", "رقم السجل التجاري")} req invalid={showErrors && !company.crNumber.trim()} L={L}><input inputMode="numeric" value={company.crNumber} onChange={(e) => setCompany({ ...company, crNumber: e.target.value })} /></Field>
              <Field label={L("VAT number", "الرقم الضريبي")} req invalid={showErrors && !company.vatNumber.trim()} L={L}><input inputMode="numeric" value={company.vatNumber} onChange={(e) => setCompany({ ...company, vatNumber: e.target.value })} /></Field>
            </div>
            <Field label={L("National address", "العنوان الوطني")} req invalid={showErrors && !company.nationalAddress.trim()} L={L}><input value={company.nationalAddress} onChange={(e) => setCompany({ ...company, nationalAddress: e.target.value })} /></Field>
            <Field label={L("Contact info", "بيانات التواصل")} req invalid={showErrors && !company.contactInfo.trim()} L={L}><input value={company.contactInfo} onChange={(e) => setCompany({ ...company, contactInfo: e.target.value })} placeholder={L("Phone or email so the renter can reach you", "هاتف أو بريد ليتواصل معك المستأجر")} /></Field>
            {QUOTE_EXPIRY_ENABLED && <Field label={L("Quote valid until (optional)", "صلاحية العرض حتى (اختياري)")} L={L}><input type="date" value={company.validUntil} onChange={(e) => setCompany({ ...company, validUntil: e.target.value })} /></Field>}
            <div className="notes-field"><label>{L("Notes (optional) — for the whole quotation", "ملاحظات (اختياري) — لكامل عرض السعر")}</label><textarea value={company.notes} onChange={(e) => setCompany({ ...company, notes: e.target.value })} /></div>
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

function rentalBasisLabel(v: string, L: (e: string, a: string) => string) {
  const m: Record<string, [string, string]> = { DAILY: ["Daily", "يومي"], WEEKLY: ["Weekly", "أسبوعي"], MONTHLY: ["Monthly", "شهري"], PER_JOB: ["Per job", "للمهمة"], LONG_TERM: ["Long term", "طويل الأمد"] };
  const e = m[String(v).toUpperCase()];
  return e ? L(e[0], e[1]) : v;
}
