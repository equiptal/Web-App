"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { fetchBidFormData, submitBidForm } from "@/lib/api/client";
import type { BidFormData, BidFormItem } from "@/lib/contract/link-bids";

/**
 * web-app/006 — PUBLIC supplier bid form (spec "Layout B": supplier-bid-v2.html). An off-platform
 * supplier opens the renter's shared link `/bid/{slug}-{groupId}`, sees the request's project terms +
 * per-item terms (wide table) + pricing, enters company details, and submits. Stored independently.
 * Bilingual (?lang=ar) + RTL. Closed (AC-11/12) / countdown (AC-10) / already-submitted (AC-33) states.
 */

const TERM_KEYS = ["operator", "fat", "fuel", "year", "operatorCert", "equipmentCert"] as const;
type TermKey = (typeof TERM_KEYS)[number];
const TERM_LABEL: Record<TermKey, [string, string]> = {
  operator: ["Operator", "المشغّل"],
  fat: ["F.A.T", "الإعاشة والسكن"],
  fuel: ["Fuel responsibility", "مسؤولية الوقود"],
  year: ["Equipment year", "سنة الصنع"],
  operatorCert: ["Operator certificate", "شهادة المشغّل"],
  equipmentCert: ["Equipment certificate", "شهادة المعدة"],
};
const UNIT_LABEL: Record<string, [string, string]> = {
  PER_DAY: ["day", "يوم"], PER_WEEK: ["week", "أسبوع"], PER_MONTH: ["month", "شهر"], PER_JOB: ["job", "مهمة"],
};
const num = (v: string) => (v.trim() && Number.isFinite(Number(v)) ? Number(v) : 0);

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
  const [company, setCompany] = useState({ companyName: "", crNumber: "", vatNumber: "", nationalAddress: "", contactInfo: "", notes: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const subKey = `mt-bid-submitted-${token}`;
  useEffect(() => { try { if (sessionStorage.getItem(subKey)) setAlreadySubmitted(true); } catch { /* ignore */ } }, [subKey]);

  useEffect(() => {
    let alive = true;
    fetchBidFormData(token)
      .then((d) => {
        if (!alive) return;
        setData(d);
        const init: Record<string, Answer> = {};
        for (const it of d.items) {
          const conf: Partial<Record<TermKey, boolean>> = {};
          for (const k of TERM_KEYS) if (it.requiredTerms[k] != null) conf[k] = true; // default Yes
          init[it.requestItemId] = { confirmations: conf, rentalRate: "", deliveryPrice: "", returnPrice: "" };
        }
        setAnswers(init);
        setContract(Object.fromEntries(d.contractTerms.map((c) => [c.key, true])));
      })
      .catch(() => alive && setNotFound(true))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [token]);

  const itemTerms = (it: BidFormItem) => TERM_KEYS.filter((k) => it.requiredTerms[k] != null);
  const setConf = (id: string, k: TermKey, v: boolean) => setAnswers((p) => ({ ...p, [id]: { ...p[id], confirmations: { ...p[id].confirmations, [k]: v } } }));
  const setPrice = (id: string, field: "rentalRate" | "deliveryPrice" | "returnPrice", v: string) => setAnswers((p) => ({ ...p, [id]: { ...p[id], [field]: v } }));

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
  const valid = !!companyValid && itemsValid;

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
        items: data.items.map((it) => {
          const a = answers[it.requestItemId];
          return { requestItemId: it.requestItemId, confirmations: a.confirmations, rentalRate: num(a.rentalRate), deliveryPrice: num(a.deliveryPrice), returnPrice: num(a.returnPrice) };
        }),
      });
      try { sessionStorage.setItem(subKey, "1"); } catch { /* ignore */ }
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
      <style>{CSS}</style>

      {/* Public header bar — renter identity + language toggle */}
      <header className="pubbar">
        <div className="pubbar-in">
          <div className="rlogo">{(data?.renter.name || "?").trim().slice(0, 2).toUpperCase()}</div>
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

      {/* Already submitted this session (AC-33) */}
      {!loading && data?.status === "open" && alreadySubmitted && !submitted && (
        <div className="wrap"><div className="state"><div className="sic"><span className="material-icons-outlined">done_all</span></div><h2>{L("Bid already submitted", "تم إرسال العرض مسبقاً")}</h2><p>{L("You've already submitted a bid for this request from this device.", "لقد أرسلت عرضاً لهذا الطلب من هذا الجهاز.")}</p></div></div>
      )}

      {/* Success (AC-29) */}
      {submitted && (
        <div className="wrap"><div className="state"><div className="sic"><span className="material-icons-outlined">check_circle</span></div>
          <h2>{L("Bid submitted", "تم إرسال العرض")}</h2>
          <p>{L("Thank you. Your bid has reached the renter and will be compared with the other bids.", "شكراً لك. وصل عرضك إلى المستأجر وسيُقارن مع بقية العروض.")}</p>
          <span className="recap"><span className="material-icons-outlined">payments</span>{sar} {nf(grand)}</span>
        </div></div>
      )}

      {/* The form */}
      {!loading && data?.status === "open" && !alreadySubmitted && !submitted && (
        <div className="wrap">
          <div className="intro">
            <h1>{L("Submit your bid", "قدّم عرضك")}</h1>
            <p>{L("For each item, confirm its terms in the table, then price it below.", "لكل بند، أكّد شروطه في الجدول ثم سعّره بالأسفل.")}</p>
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
                  <div className="subhead"><span className="material-icons-outlined">gavel</span>{L("Contract terms — for all items", "شروط العقد — لكل البنود")}</div>
                  <div className="tmtx-wrap">
                    <table className="tmtx">
                      <thead><tr>{data.contractTerms.map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead>
                      <tbody><tr>{data.contractTerms.map((c) => (
                        <td key={c.key}>
                          <div className="cval"><i>{c.value}</i></div>
                          <YesNo L={L} value={contract[c.key] ?? true} onChange={(v) => setContract((p) => ({ ...p, [c.key]: v }))} />
                        </td>
                      ))}</tr></tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Per item */}
          {data.items.map((it, idx) => {
            const a = answers[it.requestItemId];
            const terms = itemTerms(it);
            const label = (ar ? it.labelAr : it.label) || it.label || L("Equipment", "المعدة");
            const q = it.numberOfUnits || 1;
            const unit = it.priceUnit ? (ar ? UNIT_LABEL[it.priceUnit]?.[1] : UNIT_LABEL[it.priceUnit]?.[0]) ?? it.priceUnit : L("unit", "وحدة");
            const sub = itemSubtotal(it, a);
            const line = (v: string) => (num(v) ? num(v) * q : 0);
            return (
              <div className="sec" key={it.requestItemId}>
                <div className="item-hd">
                  <span className="material-icons-outlined">construction</span>
                  <div className="inm-wrap"><span className="inm">{label}</span><span className="imeta"> · {q} {q === 1 ? L("unit", "وحدة") : L("units", "وحدات")}</span></div>
                  <span className="ibadge">{L(`Item ${idx + 1} of ${data.items.length}`, `البند ${idx + 1} من ${data.items.length}`)}</span>
                </div>

                {terms.length > 0 && (
                  <>
                    <div className="subhead"><span className="material-icons-outlined">fact_check</span>{L("Terms — can you meet each?", "الشروط — هل يمكنك الالتزام بكلٍّ منها؟")}</div>
                    <div className="tmtx-wrap">
                      <table className="tmtx">
                        <thead><tr>{terms.map((k) => <th key={k}>{L(TERM_LABEL[k][0], TERM_LABEL[k][1])}</th>)}</tr></thead>
                        <tbody><tr>{terms.map((k) => (
                          <td key={k} className={(a?.confirmations[k] ?? true) ? "" : "declined"}>
                            <span className="celllbl">{L(TERM_LABEL[k][0], TERM_LABEL[k][1])}</span>
                            <div className="cval"><i>{it.requiredTerms[k]}</i></div>
                            <YesNo L={L} value={a?.confirmations[k] ?? true} onChange={(v) => setConf(it.requestItemId, k, v)} />
                          </td>
                        ))}</tr></tbody>
                      </table>
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
            <div className="notes-field"><label>{L("Notes (optional) — for the whole quotation", "ملاحظات (اختياري) — لكامل عرض السعر")}</label><textarea value={company.notes} onChange={(e) => setCompany({ ...company, notes: e.target.value })} /></div>
          </div>

          {showErrors && !valid && <div className="submit-err"><span className="material-icons-outlined">error_outline</span>{L("Please complete the highlighted items: a rate for each item and all company details.", "الرجاء إكمال العناصر المظللة: سعر لكل بند وجميع بيانات الشركة.")}</div>}
          <div className="submit-bar"><button className="btn primary lg" disabled={submitting} onClick={onSubmit}><span className="material-icons-outlined">send</span>{submitting ? L("Submitting…", "جارٍ الإرسال…") : L("Submit bid", "إرسال العرض")}</button>
            <div className="submit-note">{L("Once submitted, your bid is final and can't be edited from this link.", "بعد الإرسال، يصبح عرضك نهائياً ولا يمكن تعديله من هذا الرابط.")}</div>
          </div>
          <div className="footer-note">{L("Private bid link — your details are shared only with the renter.", "رابط عرض خاص — تُشارك بياناتك مع المستأجر فقط.")}</div>
        </div>
      )}
    </div>
  );
}

function Cell({ k, children }: { k: string; children: React.ReactNode }) {
  return <div className="ro-cell"><div className="k">{k}</div><div className="v">{children}</div></div>;
}

function YesNo({ value, onChange, L }: { value: boolean; onChange: (v: boolean) => void; L: (e: string, a: string) => string }) {
  return (
    <span className="miniseg">
      <button type="button" className={`ok${value ? " on" : ""}`} onClick={() => onChange(true)}><span className="material-icons-outlined">check</span>{L("Yes", "نعم")}</button>
      <button type="button" className={`no${!value ? " on" : ""}`} onClick={() => onChange(false)}>{L("No", "لا")}</button>
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

function rentalBasisLabel(v: string, L: (e: string, a: string) => string) {
  const m: Record<string, [string, string]> = { DAILY: ["Daily", "يومي"], WEEKLY: ["Weekly", "أسبوعي"], MONTHLY: ["Monthly", "شهري"], PER_JOB: ["Per job", "للمهمة"], LONG_TERM: ["Long term", "طويل الأمد"] };
  const e = m[String(v).toUpperCase()];
  return e ? L(e[0], e[1]) : v;
}

const CSS = `
.bidpage{--navy:#1C3550;--navy-deep:#12263A;--navy-mid:#2A4F72;--action:#F79009;--action-dim:#FFF4E5;--rentee:#2563EB;--success:#1DAF58;--success-bg:#E7F7EE;--danger:#D9362A;--danger-bg:#FCEBEA;--muted:#6B8FA8;--surface1:#fff;--surface2:#EFF4F9;--border:#D4E0EC;--line:#E4EDF5;--r-md:10px;--r-lg:14px;--r-full:100px;
  min-height:100vh;background:var(--surface2);color:var(--navy);font-family:"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;line-height:1.5;-webkit-font-smoothing:antialiased}
.bidpage.rtl{font-family:"Tajawal","Inter",sans-serif}
.bidpage *{box-sizing:border-box}
.bidpage .material-icons-outlined{font-family:'Material Icons Outlined';line-height:1}
.pubbar{background:var(--surface1);border-bottom:1px solid var(--border);position:sticky;top:0;z-index:50}
.pubbar-in{max-width:1060px;margin:0 auto;display:flex;align-items:center;gap:13px;padding:12px 24px}
.rlogo{width:44px;height:44px;border-radius:10px;flex:0 0 auto;background:linear-gradient(135deg,var(--rentee),#1E40AF);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px}
.rmeta .rlabel{font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.rmeta .rname{font-size:18.5px;font-weight:800;letter-spacing:-.3px;line-height:1.15}
.rmeta .rsub{font-size:11.5px;color:var(--muted);font-weight:600;display:flex;align-items:center;gap:5px;margin-top:2px}
.rmeta .rsub .material-icons-outlined{font-size:13px;color:var(--success)}
.pubbar .spacer{flex:1}
.langtog{display:inline-flex;border:1px solid var(--border);border-radius:7px;overflow:hidden}
.langtog button{border:0;background:var(--surface1);color:var(--muted);padding:6px 12px;font:inherit;font-weight:700;font-size:12px;cursor:pointer}
.langtog button.on{background:var(--navy);color:#fff}
.wrap{max-width:1060px;margin:0 auto;padding:22px 24px 90px}
.intro{margin:4px 0 18px}
.intro h1{margin:0 0 5px;font-size:22px;font-weight:800;letter-spacing:-.4px}
.intro p{margin:0;font-size:13.5px;color:var(--muted)}
.countdown{background:linear-gradient(135deg,var(--navy),var(--navy-deep));color:#fff;border-radius:var(--r-lg);padding:18px;margin-bottom:18px;text-align:center}
.cd-label{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#FCD9A0;margin-bottom:13px}
.cd-label .material-icons-outlined{font-size:17px}
.cd-boxes{display:flex;align-items:center;justify-content:center;gap:10px}
.cd-box{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.16);border-radius:var(--r-md);padding:10px 0;width:74px}
.cd-box b{display:block;font-family:"IBM Plex Sans",monospace;font-size:28px;font-weight:700;line-height:1}
.cd-box span{font-size:10.5px;font-weight:700;color:rgba(255,255,255,.6);text-transform:uppercase;margin-top:5px;display:block}
.cd-sep{font-size:24px;color:rgba(255,255,255,.4)}
.cd-deadline{margin-top:13px;font-size:12.5px;color:rgba(255,255,255,.72);font-weight:600}
.cd-deadline b{color:#fff}
.sec{background:var(--surface1);border:1px solid var(--border);border-radius:var(--r-lg);padding:16px 18px;margin-bottom:14px}
.sec-h{display:flex;align-items:center;gap:9px;margin:0 0 14px}
.sec-h h3{margin:0;font-size:15px;font-weight:800;letter-spacing:-.2px}
.sec-h .hdic{font-size:19px;color:var(--navy-mid)}
.sec-h .ro-tag{margin-inline-start:auto;font-size:10.5px;font-weight:800;text-transform:uppercase;color:var(--muted);background:var(--surface2);border:1px solid var(--border);border-radius:var(--r-full);padding:3px 10px}
.subhead{display:flex;align-items:center;gap:7px;font-size:11px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--navy-mid);margin:16px 0 9px}
.subhead .material-icons-outlined{font-size:15px;color:var(--navy-mid)}
.ro-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:1px;background:var(--line);border:1px solid var(--line);border-radius:var(--r-md);overflow:hidden}
.ro-cell{background:var(--surface2);padding:11px 13px}
.ro-cell .k{font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;margin-bottom:3px}
.ro-cell .v{font-size:13.5px;font-weight:700}
.maplink{display:inline-flex;align-items:center;gap:4px;color:var(--rentee);text-decoration:none}
.maplink .material-icons-outlined{font-size:15px}
.ro-hint{font-size:11.5px;color:var(--muted);font-style:italic;margin-top:9px}
.item-hd{display:flex;align-items:center;gap:12px;margin:-16px -18px 14px;padding:14px 18px;background:linear-gradient(135deg,var(--navy),var(--navy-deep));color:#fff;border-radius:var(--r-lg) var(--r-lg) 0 0}
.item-hd > .material-icons-outlined{font-size:24px;color:#FCD9A0;flex:0 0 auto}
.item-hd .inm-wrap{flex:1;min-width:0}
.item-hd .inm{font-size:16px;font-weight:800;letter-spacing:-.2px}
.item-hd .imeta{font-size:12.5px;color:rgba(255,255,255,.75);font-weight:600}
.item-hd .ibadge{margin-inline-start:auto;font-size:11px;font-weight:800;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.22);border-radius:var(--r-full);padding:4px 11px;white-space:nowrap}
.tmtx-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:var(--r-md)}
.tmtx{width:100%;border-collapse:collapse;font-size:12.5px;table-layout:fixed}
.tmtx th{background:var(--surface2);color:var(--navy-mid);font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.03em;padding:10px;border-bottom:1px solid var(--border);text-align:start}
.tmtx td{padding:12px 10px;border-inline-start:1px solid var(--line);vertical-align:top}
.tmtx td:first-child,.tmtx th:first-child{border-inline-start:0}
.tmtx .cval{font-size:12.5px;font-weight:700;margin-bottom:9px;line-height:1.4}
.tmtx .cval i{font-style:normal;color:var(--rentee)}
.tmtx td.declined{background:var(--danger-bg)}
.celllbl{display:none}
.miniseg{display:inline-flex;border:1px solid var(--border);border-radius:7px;overflow:hidden;width:fit-content}
.miniseg button{border:0;background:var(--surface1);color:var(--navy-mid);font:inherit;font-weight:700;font-size:11.5px;padding:6px 12px;cursor:pointer;display:inline-flex;align-items:center;gap:4px}
.miniseg button .material-icons-outlined{font-size:14px}
.miniseg button.ok.on{background:var(--success);color:#fff}
.miniseg button.no.on{background:var(--danger);color:#fff}
.ptbl{width:100%;border-collapse:collapse;font-size:12.5px}
.ptbl th{background:var(--surface2);color:var(--navy-mid);font-size:10px;font-weight:800;text-transform:uppercase;padding:8px 10px;border-bottom:1px solid var(--border);text-align:start}
.ptbl th.num,.ptbl td.num{text-align:end}
.ptbl td{padding:10px;border-bottom:1px solid var(--line);vertical-align:middle}
.ptbl tbody tr:last-child td{border-bottom:0}
.ptbl .it-lbl{font-weight:700}
.ptbl .it-sub2{font-size:10.5px;color:var(--muted);margin-top:2px}
.ptbl-in{width:120px;text-align:end;border:1px solid var(--border);border-radius:6px;height:36px;padding:0 9px;font:inherit;font-size:13.5px;font-weight:700;color:var(--navy);background:var(--surface1);outline:0}
.ptbl-in:focus{border-color:var(--action);box-shadow:0 0 0 3px rgba(247,144,9,.12)}
.ptbl-in.invalid{border-color:var(--danger);background:var(--danger-bg)}
.ptbl .tot{font-family:"IBM Plex Sans",monospace;font-weight:700}
.itot{margin-top:10px;display:flex;justify-content:flex-end;gap:24px;flex-wrap:wrap}
.itot .r{font-size:12.5px;color:var(--muted);font-weight:600}
.itot .r b{font-family:"IBM Plex Sans",monospace;color:var(--navy);margin-inline-start:6px}
.itot .r.t{font-size:14px;font-weight:800;color:var(--navy)}
.itot .r.t b{color:var(--action);font-size:16px}
.grand{display:flex;align-items:center;justify-content:space-between;background:var(--action-dim);border:1px solid rgba(247,144,9,.3);border-radius:var(--r-md);padding:18px 20px;margin:0 0 16px}
.grand .gk{font-size:14px;font-weight:800}
.grand .gv{font-family:"IBM Plex Sans",monospace;font-size:24px;font-weight:800;color:var(--action)}
.notes-field{margin-top:14px}
.notes-field label{display:block;font-size:11px;font-weight:800;text-transform:uppercase;color:var(--muted);margin-bottom:7px}
.notes-field textarea{width:100%;min-height:64px;border:1px solid var(--border);border-radius:var(--r-md);padding:11px 13px;font:inherit;font-size:14px;color:var(--navy);outline:0;resize:vertical}
.field{margin-bottom:14px}
.field label{display:block;font-size:12.5px;font-weight:700;color:var(--navy-mid);margin-bottom:7px}
.field label .reqx{color:var(--danger)}
.field input{width:100%;height:46px;border:1px solid var(--border);border-radius:var(--r-md);padding:0 13px;font:inherit;font-size:14px;color:var(--navy);outline:0}
.field input:focus{border-color:var(--action);box-shadow:0 0 0 3px rgba(247,144,9,.12)}
.field.invalid input{border-color:var(--danger);background:var(--danger-bg)}
.field .err{display:none;font-size:11.5px;color:var(--danger);font-weight:700;margin-top:6px}
.field.invalid .err{display:block}
.frow{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.btn{border:1px solid var(--border);background:var(--surface1);border-radius:var(--r-md);padding:11px 18px;font:inherit;font-weight:700;font-size:13.5px;color:var(--navy);display:inline-flex;align-items:center;justify-content:center;gap:7px;cursor:pointer}
.btn.primary{background:var(--action);border-color:var(--action);color:#fff}
.btn.lg{font-size:15px;padding:14px 26px}
.btn[disabled]{opacity:.6;cursor:not-allowed}
.btn .material-icons-outlined{font-size:18px}
.submit-err{display:flex;align-items:center;gap:8px;background:var(--danger-bg);border:1px solid rgba(217,54,42,.3);color:var(--danger);border-radius:var(--r-md);padding:11px 14px;font-size:12.5px;font-weight:700;margin-bottom:12px}
.submit-err .material-icons-outlined{font-size:17px}
.submit-bar .btn{width:100%}
.submit-note{text-align:center;font-size:11.5px;color:var(--muted);margin-top:10px}
.footer-note{text-align:center;color:var(--muted);font-size:12px;margin-top:30px}
.state{max-width:560px;margin:60px auto;text-align:center;background:var(--surface1);border:1px solid var(--border);border-radius:20px;padding:44px 34px}
.state .sic{width:78px;height:78px;border-radius:50%;margin:0 auto 20px;display:flex;align-items:center;justify-content:center;background:var(--success-bg);color:var(--success)}
.state .sic.neutral{background:var(--surface2);color:var(--muted)}
.state .sic.err{background:var(--danger-bg);color:var(--danger)}
.state .sic .material-icons-outlined{font-size:44px}
.state h2{margin:0 0 9px;font-size:21px;font-weight:800}
.state p{margin:0 auto;max-width:42ch;font-size:14px;color:var(--muted)}
.state .recap{display:inline-flex;align-items:center;gap:8px;margin-top:18px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--r-full);padding:8px 16px;font-size:13px;font-weight:700;font-family:"IBM Plex Sans",monospace}
.state .recap .material-icons-outlined{font-size:16px;color:var(--muted)}
.state-msg{text-align:center;color:var(--muted);padding:50px}
@media (max-width:680px){.ro-grid{grid-template-columns:1fr 1fr}}
@media (max-width:600px){.wrap{padding:16px 14px 80px}.pubbar-in{padding:10px 14px;gap:10px}.rmeta .rname{font-size:16px}.rlogo{width:40px;height:40px}.intro h1{font-size:19px}.sec{padding:14px}.item-hd{margin:-14px -14px 12px;padding:12px 14px}.item-hd .ibadge{display:none}
.tmtx-wrap{border:0;overflow:visible}.tmtx,.tmtx tbody{display:block;width:100%}.tmtx thead{display:none}.tmtx tr{display:grid;grid-template-columns:1fr 1fr;border:1px solid var(--border);border-radius:var(--r-md);margin-bottom:10px;overflow:hidden}.tmtx td{display:block;border-bottom:1px solid var(--line);border-inline-start:1px solid var(--line);padding:11px 13px}.tmtx td:nth-child(odd){border-inline-start:0}.celllbl{display:block;font-size:10.5px;font-weight:800;text-transform:uppercase;color:var(--navy-mid);margin-bottom:5px}.cd-box{width:60px}.cd-box b{font-size:23px}.ptbl-in{width:90px}.frow{grid-template-columns:1fr}}
`;
