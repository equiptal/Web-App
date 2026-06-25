"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { fetchBidFormData, submitBidForm } from "@/lib/api/client";
import type { BidFormData, BidFormItem } from "@/lib/contract/link-bids";

/**
 * web-app/006 (expanded) — PUBLIC supplier bid form. An off-platform supplier (no account) opens the
 * renter's shared link `/bid/{slug}-{token}`, sees the request's items + required terms, fills a price
 * per item, confirms each term, enters company details, and submits. The submission is stored
 * independently (LinkBidSubmission) — nothing touches the renter's real bids. Bilingual (?lang=ar) + RTL.
 */

type Answer = {
  confirmations: { operator: boolean; fuel: boolean; year: boolean; operatorCert: boolean; equipmentCert: boolean };
  rentalRate: string;
  deliveryPrice: string;
  returnPrice: string;
};

const TERM_KEYS = ["operator", "fuel", "year", "operatorCert", "equipmentCert"] as const;
type TermKey = (typeof TERM_KEYS)[number];

const num = (v: string) => (v.trim() && Number.isFinite(Number(v)) ? Number(v) : 0);

export default function BidFormPage({ params }: { params: Promise<{ token: string }> }) {
  const { token: rawToken } = use(params);
  // The URL is /bid/{slug}-{requestId}; the token IS the request's UUID. Extract the trailing UUID
  // (the slug may contain dashes, and the UUID itself has dashes, so match the UUID pattern).
  const token = rawToken.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0] ?? rawToken;

  const sp = useSearchParams();
  const ar = sp.get("lang") === "ar";
  const L = (e: string, a: string) => (ar ? a : e);

  const [data, setData] = useState<BidFormData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [company, setCompany] = useState({ companyName: "", crNumber: "", vatNumber: "", nationalAddress: "", contactInfo: "", notes: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  // AC-33 — a same-session reopen after submitting shows "already submitted" (no cross-session dedup).
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
          init[it.requestItemId] = {
            confirmations: { operator: true, fuel: true, year: true, operatorCert: true, equipmentCert: true },
            rentalRate: "", deliveryPrice: "", returnPrice: "",
          };
        }
        setAnswers(init);
      })
      .catch(() => alive && setNotFound(true))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [token]);

  const requiredTermKeys = (it: BidFormItem): TermKey[] => TERM_KEYS.filter((k) => it.requiredTerms[k] != null);

  const setAns = (id: string, patch: Partial<Answer>) => setAnswers((p) => ({ ...p, [id]: { ...p[id], ...patch } }));
  const setConf = (id: string, k: TermKey, v: boolean) =>
    setAnswers((p) => ({ ...p, [id]: { ...p[id], confirmations: { ...p[id].confirmations, [k]: v } } }));

  const itemTotal = (it: BidFormItem, a?: Answer) => {
    if (!a) return 0;
    const units = it.numberOfUnits || 1;
    return num(a.rentalRate) * units + num(a.deliveryPrice) + num(a.returnPrice);
  };
  const grandTotal = useMemo(
    () => (data?.items ?? []).reduce((s, it) => s + itemTotal(it, answers[it.requestItemId]), 0),
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
          return {
            requestItemId: it.requestItemId,
            confirmations: a.confirmations,
            rentalRate: num(a.rentalRate),
            deliveryPrice: num(a.deliveryPrice),
            returnPrice: num(a.returnPrice),
          };
        }),
      });
      try { sessionStorage.setItem(subKey, "1"); } catch { /* ignore */ }
      setSubmitted(true);
    } catch {
      setSubmitting(false);
      // AC-11 — the deadline may have just passed / request closed: re-fetch to flip to the closed state.
      fetchBidFormData(token).then((d) => setData(d)).catch(() => {});
      alert(L("Could not submit — the request may have closed, or please try again.", "تعذّر الإرسال — قد يكون الطلب أُغلق، أو حاول مرة أخرى."));
    }
  }

  const dir = ar ? "rtl" : "ltr";
  const sar = L("SAR", "ر.س");
  const nf = (n: number) => Math.round(n).toLocaleString("en-US");

  if (loading) return <Shell dir={dir}><p className="p-8 text-center text-slate-500">{L("Loading…", "جارٍ التحميل…")}</p></Shell>;
  if (notFound || !data) return <Shell dir={dir}><div className="p-8 text-center"><h1 className="text-lg font-bold text-slate-800">{L("Link not found", "الرابط غير موجود")}</h1><p className="mt-2 text-sm text-slate-500">{L("This bid link is invalid or has expired.", "هذا الرابط غير صالح أو منتهي.")}</p></div></Shell>;

  // AC-11 / AC-12 — the request is closed/cancelled or the deadline has passed: no form.
  if (data.status === "closed") return (
    <Shell dir={dir}>
      <div className="p-10 text-center">
        <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-slate-200"><span className="material-icons-outlined text-3xl text-slate-500">lock_clock</span></div>
        <h1 className="text-xl font-extrabold text-slate-800">{L("Not accepting bids", "لا يستقبل العروض")}</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">
          {data.closedReason === "deadline"
            ? L("The deadline for this request has passed.", "انتهى الموعد النهائي لهذا الطلب.")
            : L("This request is closed and no longer accepting bids.", "هذا الطلب مُغلق ولم يعد يستقبل العروض.")}
        </p>
      </div>
    </Shell>
  );

  // AC-33 — already submitted in this session.
  if (alreadySubmitted && !submitted) return (
    <Shell dir={dir}>
      <div className="p-10 text-center">
        <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-emerald-100"><span className="material-icons-outlined text-3xl text-emerald-600">done_all</span></div>
        <h1 className="text-xl font-extrabold text-slate-800">{L("Bid already submitted", "تم إرسال العرض مسبقاً")}</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">{L("You've already submitted a bid for this request from this device.", "لقد أرسلت عرضاً لهذا الطلب من هذا الجهاز.")}</p>
      </div>
    </Shell>
  );

  if (submitted) return (
    <Shell dir={dir}>
      <div className="p-10 text-center">
        <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-emerald-100"><span className="material-icons-outlined text-3xl text-emerald-600">check</span></div>
        <h1 className="text-xl font-extrabold text-slate-800">{L("Bid submitted", "تم إرسال العرض")}</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">{L("Thanks — your bid has been sent to the renter. They'll review it alongside other offers.", "شكراً — تم إرسال عرضك للمستأجر. سيراجعه مع بقية العروض.")}</p>
      </div>
    </Shell>
  );

  return (
    <Shell dir={dir}>
      <div className="border-b border-slate-200 px-5 py-5">
        <h1 className="text-xl font-extrabold text-slate-900">{L("Submit your bid", "قدّم عرضك")}</h1>
        {/* AC-09 — renter identity (only fields present) */}
        {(data.renter.name || data.renter.contactName) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-slate-500">
            <span>{L("Request from", "طلب من")} <b className="text-slate-700">{data.renter.name || data.renter.contactName}</b></span>
            {data.renter.verified && <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-600"><span className="material-icons-outlined" style={{ fontSize: 13 }}>verified</span>{L("Verified renter", "مستأجر موثّق")}</span>}
            {data.renter.name && data.renter.contactName && data.renter.contactName !== data.renter.name && <span className="text-slate-400">· {data.renter.contactName}</span>}
            {data.renter.city && <span className="text-slate-400">· {data.renter.city}</span>}
          </div>
        )}
        {/* AC-10 — countdown when a deadline is set */}
        {data.deadline && <Countdown iso={data.deadline} L={L} />}
      </div>

      <div className="space-y-5 px-5 py-5">
        {data.items.map((it) => {
          const a = answers[it.requestItemId];
          const keys = requiredTermKeys(it);
          const label = (ar ? it.labelAr : it.label) || it.label || L("Equipment", "المعدة");
          return (
            <section key={it.requestItemId} className="rounded-xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <span className="text-[15px] font-bold text-slate-800">{label}{it.numberOfUnits > 1 && <span className="ms-1.5 text-[12px] font-semibold text-slate-400">× {it.numberOfUnits}</span>}</span>
              </div>

              {keys.length > 0 && (
                <div className="space-y-2.5 px-4 py-3">
                  <p className="text-[12px] font-bold uppercase tracking-wide text-slate-400">{L("Confirm the request terms", "أكّد شروط الطلب")}</p>
                  {keys.map((k) => (
                    <div key={k} className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[13.5px] font-semibold text-slate-700">{TERM_LABEL(k, L)}</div>
                        <div className="truncate text-[12px] text-slate-400">{it.requiredTerms[k]}</div>
                      </div>
                      <YesNo ar={ar} L={L} value={a?.confirmations[k] ?? true} onChange={(v) => setConf(it.requestItemId, k, v)} />
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 border-t border-slate-100 px-4 py-3 sm:grid-cols-3">
                <Field label={`${L("Your rate", "سعرك")} (${it.priceUnit ? UNIT_LABEL(it.priceUnit, L) : L("per period", "لكل فترة")})`} required error={showErrors && num(a?.rentalRate ?? "") <= 0} L={L}>
                  <input inputMode="numeric" value={a?.rentalRate ?? ""} onChange={(e) => setAns(it.requestItemId, { rentalRate: e.target.value })} placeholder="0" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[14px] outline-none focus:border-slate-500" />
                </Field>
                <Field label={L("Delivery to site", "النقل إلى الموقع")} L={L}>
                  <input inputMode="numeric" value={a?.deliveryPrice ?? ""} onChange={(e) => setAns(it.requestItemId, { deliveryPrice: e.target.value })} placeholder="0" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[14px] outline-none focus:border-slate-500" />
                </Field>
                <Field label={L("Return from site", "النقل من الموقع")} L={L}>
                  <input inputMode="numeric" value={a?.returnPrice ?? ""} onChange={(e) => setAns(it.requestItemId, { returnPrice: e.target.value })} placeholder="0" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[14px] outline-none focus:border-slate-500" />
                </Field>
              </div>
              <div className="px-4 pb-3 text-end text-[12.5px] text-slate-500">{L("Item total", "إجمالي البند")}: <b className="text-slate-700">{sar} {nf(itemTotal(it, a))}</b></div>
            </section>
          );
        })}

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="mb-3 text-[12px] font-bold uppercase tracking-wide text-slate-400">{L("Your details", "بياناتك")}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={L("Company name", "اسم الشركة")} required error={showErrors && !company.companyName.trim()} L={L}><CInput v={company.companyName} on={(v) => setCompany({ ...company, companyName: v })} /></Field>
            <Field label={L("Contact info", "بيانات التواصل")} required error={showErrors && !company.contactInfo.trim()} L={L}><CInput v={company.contactInfo} on={(v) => setCompany({ ...company, contactInfo: v })} ph={L("Phone or email", "هاتف أو بريد")} /></Field>
            <Field label={L("CR number", "رقم السجل التجاري")} required error={showErrors && !company.crNumber.trim()} L={L}><CInput v={company.crNumber} on={(v) => setCompany({ ...company, crNumber: v })} /></Field>
            <Field label={L("VAT number", "الرقم الضريبي")} required error={showErrors && !company.vatNumber.trim()} L={L}><CInput v={company.vatNumber} on={(v) => setCompany({ ...company, vatNumber: v })} /></Field>
            <div className="sm:col-span-2"><Field label={L("National address", "العنوان الوطني")} required error={showErrors && !company.nationalAddress.trim()} L={L}><CInput v={company.nationalAddress} on={(v) => setCompany({ ...company, nationalAddress: v })} /></Field></div>
            <div className="sm:col-span-2"><Field label={L("Notes (optional)", "ملاحظات (اختياري)")} L={L}><textarea value={company.notes} onChange={(e) => setCompany({ ...company, notes: e.target.value })} rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[14px] outline-none focus:border-slate-500" /></Field></div>
          </div>
        </section>

        <div className="flex items-center justify-between rounded-xl bg-slate-900 px-4 py-3 text-white">
          <span className="text-[13px] font-semibold opacity-80">{L("Total", "الإجمالي")}</span>
          <span className="font-mono text-[18px] font-extrabold">{sar} {nf(grandTotal)}</span>
        </div>

        {showErrors && !valid && <p className="text-[12.5px] font-semibold text-rose-600">{L("Please add a rate for each item and complete all company details.", "الرجاء إضافة سعر لكل بند وإكمال جميع بيانات الشركة.")}</p>}

        <button onClick={onSubmit} disabled={submitting} className="w-full rounded-xl bg-emerald-600 py-3.5 text-[15px] font-bold text-white disabled:opacity-60">
          {submitting ? L("Submitting…", "جارٍ الإرسال…") : L("Submit bid", "إرسال العرض")}
        </button>
        <p className="pb-6 text-center text-[11.5px] text-slate-400">{L("Submitted directly to the renter on Moedatech.", "يُرسَل مباشرة للمستأجر على معدّات.")}</p>
      </div>
    </Shell>
  );
}

function Countdown({ iso, L }: { iso: string; L: (e: string, a: string) => string }) {
  const [now, setNow] = useState(() => 0);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!now) return null;
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return <p className="mt-2 text-[12.5px] font-bold text-rose-600">{L("Deadline passed", "انتهى الموعد النهائي")}</p>;
  const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const parts = d > 0 ? `${d}${L("d", "ي")} ${h}${L("h", "س")}` : h > 0 ? `${h}${L("h", "س")} ${m}${L("m", "د")}` : `${m}${L("m", "د")} ${sec}${L("s", "ث")}`;
  return (
    <p className="mt-2 inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-[12.5px] font-bold text-amber-700">
      <span className="material-icons-outlined" style={{ fontSize: 14 }}>schedule</span>{L("Closes in", "يُغلق خلال")} {parts}
    </p>
  );
}

function Shell({ children, dir }: { children: React.ReactNode; dir: string }) {
  return (
    <div dir={dir} className="min-h-screen bg-slate-50">
      <link rel="stylesheet" href="https://fonts.googleapis.com/icon?family=Material+Icons+Outlined" />
      <div className="mx-auto max-w-2xl bg-white shadow-sm sm:my-6 sm:rounded-2xl">{children}</div>
    </div>
  );
}

function TERM_LABEL(k: TermKey, L: (e: string, a: string) => string) {
  return {
    operator: L("Operator", "المشغّل"),
    fuel: L("Fuel responsibility", "مسؤولية الوقود"),
    year: L("Equipment year", "سنة الصنع"),
    operatorCert: L("Operator certificate", "شهادة المشغّل"),
    equipmentCert: L("Equipment certificate", "شهادة المعدة"),
  }[k];
}
function UNIT_LABEL(u: string, L: (e: string, a: string) => string) {
  return { PER_DAY: L("per day", "يومي"), PER_WEEK: L("per week", "أسبوعي"), PER_MONTH: L("per month", "شهري"), PER_JOB: L("per job", "للمهمة") }[u] ?? u;
}

function YesNo({ value, onChange, L, ar }: { value: boolean; onChange: (v: boolean) => void; L: (e: string, a: string) => string; ar: boolean }) {
  return (
    <div className="flex flex-none overflow-hidden rounded-lg border border-slate-300" style={{ direction: ar ? "rtl" : "ltr" }}>
      <button type="button" onClick={() => onChange(true)} className={`px-3 py-1.5 text-[12.5px] font-bold ${value ? "bg-emerald-600 text-white" : "bg-white text-slate-500"}`}>{L("Yes", "نعم")}</button>
      <button type="button" onClick={() => onChange(false)} className={`px-3 py-1.5 text-[12.5px] font-bold ${!value ? "bg-rose-500 text-white" : "bg-white text-slate-500"}`}>{L("No", "لا")}</button>
    </div>
  );
}

function Field({ label, required, error, children, L }: { label: string; required?: boolean; error?: boolean; children: React.ReactNode; L: (e: string, a: string) => string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12.5px] font-semibold text-slate-600">{label}{required && <span className="text-rose-500"> *</span>}</span>
      {children}
      {error && <span className="mt-1 block text-[11.5px] font-semibold text-rose-600">{L("Required", "مطلوب")}</span>}
    </label>
  );
}

function CInput({ v, on, ph }: { v: string; on: (v: string) => void; ph?: string }) {
  return <input value={v} onChange={(e) => on(e.target.value)} placeholder={ph} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[14px] outline-none focus:border-slate-500" />;
}
