"use client";

import { useEffect, useRef, useState, Fragment, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/i18n";
import { fetchRequestDetail, cancelRequest, updateRequest, fetchRequestSubmissions, setBidDeadline } from "@/lib/api/client";
import { publicTaxonomyUrl, type RequestItem, type RequestRecord } from "@/lib/contract/requests";
import { RequestBids } from "@/components/requests/RequestBids";
import { EquipImg } from "@/components/requests/EquipImg";
import { LocationMap } from "@/components/requests/LocationMap";
import "@/components/requests/requests-proto.css";

const STATUS_CLS: Record<string, string> = { OPEN: "st-open", ACTIVE: "st-active", ACCEPTED: "st-accepted", EXPIRED: "st-expired", CLOSED: "st-closed", ABANDONED: "st-closed" };

function fmtDate(v: string | null | undefined, ar: boolean): string {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(ar ? "ar-SA-u-ca-gregory" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * EVERY request-level field the backend stored — request details show all of them, but only the ones
 * that actually have a value (nulls/empties are dropped). Enums are formatted bilingually; unknown enum
 * values fall back to a prettified raw string. Shared by RequestDetail + RequestGroupDetail.
 */
export function requestDetailRows(r: RequestRecord, ar: boolean, L: (en: string, arr: string) => string): [string, ReactNode][] {
  const yn = (b: boolean | null | undefined) => (b == null ? null : b ? L("Yes", "نعم") : L("No", "لا"));
  const pretty = (v: string) => v.replace(/[_-]+/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  const enumL = (v: unknown, map: Record<string, [string, string]>) => {
    if (v == null || v === "") return null;
    const s = String(v);
    const x = map[s.toUpperCase()] ?? map[s.toLowerCase()];
    return x ? L(x[0], x[1]) : pretty(s);
  };
  const qty = (n: unknown, unit: [string, string]) => (n == null ? null : `${Number(n).toLocaleString(ar ? "ar-SA-u-ca-gregory" : "en-US")} ${L(unit[0], unit[1])}`);
  const rentalMap = { DAILY: ["Daily", "يومي"], WEEKLY: ["Weekly", "أسبوعي"], MONTHLY: ["Monthly", "شهري"], PER_JOB: ["Per job", "للمهمة"], LONG_TERM: ["Long term", "طويل الأمد"] } as Record<string, [string, string]>;
  const urgencyMap = { ASAP: ["ASAP", "عاجل"], SOON: ["Soon", "قريبًا"], FAR_FUTURE: ["Future", "مستقبلًا"] } as Record<string, [string, string]>;
  const payMap = { UPFRONT: ["Upfront", "مقدمًا"], DAILY: ["Daily", "يومي"], "NET-30": ["Net 30 days", "صافي ٣٠ يومًا"], "NET-60": ["Net 60 days", "صافي ٦٠ يومًا"], "END-OF-JOB": ["End of job", "نهاية المهمة"] } as Record<string, [string, string]>;
  const slaMap = { FOUR_HR: ["4 hours", "٤ ساعات"], EIGHT_HR: ["8 hours", "٨ ساعات"], TWENTY_FOUR_HR: ["24 hours", "٢٤ ساعة"], FORTY_EIGHT_HR: ["48 hours", "٤٨ ساعة"], SEVENTY_TWO_HR: ["72 hours", "٧٢ ساعة"] } as Record<string, [string, string]>;
  const maintMap = { SUPPLIER: ["Supplier", "المؤجّر"], RENTER: ["Renter", "المستأجر"], RENTEE: ["Renter", "المستأجر"] } as Record<string, [string, string]>;
  const otMap = { "0": ["None", "بدون"], WITHOUT: ["None", "بدون"], "1.5X": ["1.5×", "1.5×"], "2X": ["2×", "2×"] } as Record<string, [string, string]>;
  const rows: [string, ReactNode][] = [
    [L("Rental basis", "أساس الإيجار"), enumL(r.rentalType, rentalMap)],
    [L("Urgency", "الإلحاح"), enumL(r.urgency, urgencyMap)],
    [L("Duration", "المدة"), qty(r.estimatedDurationDays, ["days", "يوم"])],
    [L("Working hours", "ساعات العمل"), qty(r.workingHoursPerDay, ["hrs/day", "ساعة/يوم"])],
    [L("Working days / week", "أيام العمل/أسبوع"), r.workingDaysPerWeek ?? null],
    [L("Estimated job hours", "ساعات المهمة التقديرية"), qty(r.jobEstimatedHours, ["hrs", "ساعة"])],
    [L("Overtime rate", "أجر العمل الإضافي"), enumL(r.overtimeRate, otMap)],
    [L("Terrain", "التضاريس"), enumL(r.terrainType, {})],
    [L("Fulfillment", "نوع التنفيذ"), enumL(r.fulfillmentType, {})],
    [L("Payment terms", "شروط الدفع"), enumL(r.paymentTerms, payMap)],
    [L("Payment method", "طريقة الدفع"), enumL(r.paymentMethod, {})],
    [L("Breakdown response", "زمن الاستجابة للأعطال"), enumL(r.breakdownResponseSla, slaMap)],
    [L("Maintenance", "الصيانة"), enumL(r.maintenanceResponsibility, maintMap)],
    [L("Budget", "الميزانية"), r.budgetCeiling ? `${Number(r.budgetCeiling).toLocaleString(ar ? "ar-SA-u-ca-gregory" : "en-US")} ${L("SAR", "ر.س")}` : null],
    [L("Min. supplier rating", "أدنى تقييم للمؤجّر"), r.minimumSupplierRating ? `★ ${Number(r.minimumSupplierRating).toFixed(1)}` : null],
    [L("Delivery lead time", "مهلة التسليم"), enumL(r.deliveryLeadTime, {})],
    [L("Offer duration", "مدة العرض"), enumL(r.offerDuration, {})],
    [L("Verified suppliers only", "مؤجّرون موثّقون فقط"), yn(r.verifiedSuppliersOnly)],
    [L("On-site storage", "تخزين في الموقع"), yn(r.equipmentStorageOnSite)],
    [L("Subletting allowed", "التأجير من الباطن"), yn(r.subletting)],
    [L("Local content", "المحتوى المحلي"), yn(r.localContent)],
    [L("Extendable", "قابل للتمديد"), yn(r.extendable)],
    [L("Required certificates", "الشهادات المطلوبة"), r.requiredCerts && r.requiredCerts.length ? r.requiredCerts.join(", ") : null],
  ];
  return rows.filter(([, v]) => v != null && v !== "" && v !== "—");
}

export function RequestDetail({ id, onTitle }: { id: string; onTitle?: (t: string) => void }) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const L = (en: string, arr: string) => (ar ? arr : en);
  const router = useRouter();
  const [r, setR] = useState<RequestRecord | null>(null);
  const [error, setError] = useState(false);
  const [view, setView] = useState<"details" | "bids">("details");
  const [busy, setBusy] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  // The request id IS the share-link token; we fetch the renter name + bid deadline for the deadline row.
  const [link, setLink] = useState<{ renterName: string | null; openedCount: number; submittedCount: number; bidDeadline: string | null } | null>(null);
  useEffect(() => {
    let active = true;
    fetchRequestSubmissions(id).then((r) => active && setLink(r)).catch(() => {});
    return () => { active = false; };
  }, [id]);
  // AC-06 — set / adjust / clear the bid-submission deadline from the request header.
  const [dlEdit, setDlEdit] = useState(false);
  const [dlInput, setDlInput] = useState("");
  const toLocalInput = (iso: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const openDl = () => { setDlInput(toLocalInput(link?.bidDeadline ?? null)); setDlEdit(true); };
  const saveDl = async (clear?: boolean) => {
    const iso = clear || !dlInput ? null : new Date(dlInput).toISOString();
    try { await setBidDeadline(id, iso); setLink((p) => (p ? { ...p, bidDeadline: iso } : p)); } catch { /* ignore */ }
    setDlEdit(false);
  };
  const reload = () => fetchRequestDetail(id).then(setR).catch(() => setError(true));
  useEffect(() => {
    let active = true;
    fetchRequestDetail(id)
      .then((d) => active && setR(d))
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, [id]);

  async function doCancel() {
    if (busy) return;
    setBusy(true);
    try {
      await cancelRequest(id);
      router.push("/requests");
    } catch {
      setBusy(false);
      setShowCancel(false);
    }
  }

  useEffect(() => {
    const it = r?.equipmentItems?.[0];
    if (onTitle && it) onTitle((ar ? it.subtypeNameAr ?? it.subtypeName : it.subtypeName) ?? "");
  }, [r, ar, onTitle]);

  // Deep-link straight to the bids list — e.g. the group detail's "View bids" links to ?view=bids.
  // Read after mount (not during render) to avoid a hydration mismatch.
  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("view") === "bids") setView("bids");
  }, []);
  // Land on the bids cards, not the request header, when switching to the bids view (button or deep-link).
  // Depends on `r` too so the deep-link case scrolls once the record (and the bids section) has mounted.
  const bidsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (view !== "bids" || !r) return;
    const t = setTimeout(() => bidsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    return () => clearTimeout(t);
  }, [view, r]);

  if (error) return <div className="rproto"><div className="rempty">{L("Couldn’t load this request.", "تعذّر تحميل هذا الطلب.")}</div></div>;
  if (!r) return <div className="rproto"><div className="rstate"><span className="material-icons-outlined" style={{ fontSize: 28 }}>progress_activity</span></div></div>;

  const item = r.equipmentItems?.[0];
  const period = r.startDate ? (r.endDate ? `${fmtDate(r.startDate, ar)} – ${fmtDate(r.endDate, ar)}` : fmtDate(r.startDate, ar)) : "—";
  const urgency = r.urgency === "ASAP" ? L("ASAP", "فوري") : r.urgency === "SOON" ? L("Soon", "قريباً") : L("Scheduled", "مجدول");
  return (
    <div className="rproto" dir={ar ? "rtl" : "ltr"}>
      {/* status */}
      <div className="detail-status">
        <span className={`stbadge ${STATUS_CLS[r.status] ?? "st-closed"}`}><span className="dot" />{r.status}</span>
        <span className={`typebadge ${r.type === "DIRECT" ? "tb-direct" : "tb-broadcast"}`}><span className="material-icons-outlined">{r.type === "DIRECT" ? "person" : "campaign"}</span>{r.type}</span>
        <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>{r.displayId ?? r.shortCode ?? r.id}</span>
        {(r.bidCount ?? 0) > 0 && <span className="stbadge st-active" style={{ marginInlineStart: "auto" }}><span className="material-icons-outlined" style={{ fontSize: 13 }}>gavel</span>{r.bidCount} {L("bids", "عروض")}</span>}
      </div>

      {/* AC-06 — bid-submission deadline (set / adjust / clear) */}
      {r.type === "BROADCAST" && (
        <div className="rd-track" style={{ marginTop: 8 }}>
          <span className="material-icons-outlined">schedule</span>
          <span className="rt-lbl">{L("Bid deadline", "الموعد النهائي")}</span>
          {!dlEdit ? (
            <>
              <span className="rt-stat sub">
                {link?.bidDeadline
                  ? new Date(link.bidDeadline).toLocaleString(ar ? "ar-SA-u-ca-gregory" : "en-GB", { dateStyle: "medium", timeStyle: "short" })
                  : L("No deadline", "بدون موعد")}
              </span>
              <button className="rt-copy" onClick={openDl}>
                <span className="material-icons-outlined">edit</span>{link?.bidDeadline ? L("Adjust", "تعديل") : L("Set deadline", "تحديد موعد")}
              </button>
            </>
          ) : (
            <span style={{ display: "inline-flex", gap: 6, alignItems: "center", marginInlineStart: "auto", flexWrap: "wrap" }}>
              <input type="datetime-local" value={dlInput} onChange={(e) => setDlInput(e.target.value)}
                style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "4px 8px", fontSize: 12.5 }} />
              <button className="rt-copy" onClick={() => saveDl(false)}><span className="material-icons-outlined">check</span>{L("Save", "حفظ")}</button>
              {link?.bidDeadline && <button className="rt-copy" onClick={() => saveDl(true)}>{L("Clear", "مسح")}</button>}
              <button className="rt-copy" onClick={() => setDlEdit(false)}>{L("Cancel", "إلغاء")}</button>
            </span>
          )}
        </div>
      )}

      {/* infostrip — only fields that actually have a value */}
      <div className="infostrip">
        {([
          [L("Location", "الموقع"), r.projectAddressLabel, false],
          [L("Period", "الفترة"), r.startDate ? period : null, false],
          [L("Duration", "المدة"), r.estimatedDurationDays ? `${r.estimatedDurationDays} ${L("days", "يوم")}` : null, true],
          [L("Urgency", "الإلحاح"), urgency, false],
        ] as [string, ReactNode, boolean][])
          .filter(([, v]) => v != null && v !== "" && v !== "—")
          .map(([lab, v, mono]) => (
            <div className="ic" key={lab}><div className="lab">{lab}</div><div className={mono ? "val mono" : "val"}>{v}</div></div>
          ))}
      </div>

      {view === "bids" ? (
        <div ref={bidsRef} style={{ scrollMarginTop: 74 }}>
          <button className="btn sm" style={{ marginBottom: 14 }} onClick={() => setView("details")}>
            <span className="material-icons-outlined rq-arrow" style={{ transform: ar ? "none" : "scaleX(-1)" }}>chevron_right</span> {L("Back to request", "العودة للطلب")}
          </button>
          <RequestBids requestId={r.id} />
        </div>
      ) : (
        <>
          {/* equipment */}
          <div className="dsec">
            <div className="dsec-h"><span className="material-icons-outlined">construction</span>{L("Equipment details", "تفاصيل المعدات")}</div>
            <div className="dcard">{item ? <Ditem item={item} ar={ar} L={L} /> : <div className="notes">—</div>}</div>
          </div>

          {/* location */}
          <div className="dsec">
            <div className="dsec-h"><span className="material-icons-outlined">place</span>{L("Project location", "موقع المشروع")}</div>
            <div className="dcard">
              {r.projectLat != null && r.projectLng != null && <LocationMap lat={Number(r.projectLat)} lng={Number(r.projectLng)} />}
              <div className="addr">
                <span className="material-icons-outlined pin">location_on</span>
                <span><b>{r.projectAddressLabel ?? "—"}</b>{r.projectLat != null && r.projectLng != null && <span dir="ltr"> · ({Number(r.projectLat).toFixed(4)}, {Number(r.projectLng).toFixed(4)})</span>}</span>
              </div>
            </div>
          </div>

          {/* request details — every stored field that has a value (the whole section hides if none) */}
          {(() => {
            const prefs = requestDetailRows(r, ar, L);
            if (!prefs.length) return null;
            return (
              <div className="dsec">
                <div className="dsec-h"><span className="material-icons-outlined">tune</span>{L("Request details", "تفاصيل الطلب")}</div>
                <div className="dcard">
                  <div className="kv">
                    {prefs.map(([k, v]) => <Fragment key={k}><span className="k">{k}</span><span className="v">{v}</span></Fragment>)}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* notes */}
          {r.additionalNotes && (
            <div className="dsec">
              <div className="dsec-h"><span className="material-icons-outlined">notes</span>{L("Additional notes", "ملاحظات إضافية")}</div>
              <div className="dcard"><div className="notes">{r.additionalNotes}</div></div>
            </div>
          )}

          {/* actions — edit (OPEN & no bids) / cancel (OPEN or ACTIVE), like the app */}
          <div className="actionbar">
            {r.status === "OPEN" && (r.bidCount ?? 0) === 0 && (
              <button className="btn sm" disabled={busy} onClick={() => setShowEdit(true)}>
                <span className="material-icons-outlined">edit</span> {L("Edit request", "تعديل الطلب")}
              </button>
            )}
            {(r.status === "OPEN" || r.status === "ACTIVE") && (
              <button className="btn sm danger" disabled={busy} onClick={() => setShowCancel(true)}>
                <span className="material-icons-outlined">close</span> {L("Cancel request", "إلغاء الطلب")}
              </button>
            )}
            <span className="spacer" />
            {r.dealRoomId && (
              <button className="btn sm" onClick={() => router.push(`/deal-room/${r.dealRoomId}`)}>
                <span className="material-icons-outlined">forum</span> {L("Deal room", "غرفة الصفقة")}
              </button>
            )}
            <button className="btn primary" disabled={(r.bidCount ?? 0) === 0} onClick={() => setView("bids")}>
              <span className="material-icons-outlined">gavel</span> {L("View bids", "عرض العروض")} ({r.bidCount ?? 0})
            </button>
          </div>
        </>
      )}

      {showEdit && <EditRequestModal r={r} ar={ar} L={L} onClose={() => setShowEdit(false)} onSaved={() => { setShowEdit(false); void reload(); }} />}
      {showCancel && <ConfirmCancelModal ar={ar} L={L} busy={busy} idLabel={r.displayId ?? r.shortCode ?? r.id} onClose={() => setShowCancel(false)} onConfirm={doCancel} />}
    </div>
  );
}

/** Styled "cancel this request?" confirmation (replaces the browser prompt), matching the app's destructive dialog. */
function ConfirmCancelModal({ ar, L, busy, idLabel, onClose, onConfirm }: { ar: boolean; L: (en: string, arr: string) => string; busy: boolean; idLabel: string; onClose: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" dir={ar ? "rtl" : "ltr"} onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-[var(--surface1)] p-5 text-center shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#fdecec]">
          <span className="material-icons-outlined" style={{ color: "#d64545", fontSize: 26 }}>report_problem</span>
        </div>
        <h3 className="text-[17px] font-extrabold text-[var(--navy)]">{L("Cancel this request?", "إلغاء هذا الطلب؟")}</h3>
        <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--muted)]">
          {L("Request", "الطلب")} <span className="font-bold text-[var(--navy)]">{idLabel}</span> {L("will be withdrawn and suppliers can no longer bid. This can’t be undone.", "سيتم سحبه ولن يتمكن المؤجّرون من تقديم عروض. لا يمكن التراجع عن هذا الإجراء.")}
        </p>
        <div className="mt-5 flex gap-2.5">
          <button className="flex-1 rounded-[10px] border border-[var(--border)] px-4 py-2.5 text-[13px] font-bold text-[var(--navy)]" disabled={busy} onClick={onClose}>{L("Keep request", "الإبقاء على الطلب")}</button>
          <button className="flex-1 rounded-[10px] bg-[#d64545] px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-50" disabled={busy} onClick={onConfirm}>{busy ? L("Cancelling…", "جارٍ الإلغاء…") : L("Cancel request", "إلغاء الطلب")}</button>
        </div>
      </div>
    </div>
  );
}

/* ── Edit form: every field the app's create/edit wizard exposes, grouped Project / Equipment / Preferences.
   Values use the backend's canonical enums (term_options.dart) so the PATCH validates. ── */
type Opt = { v: string; en: string; ar: string };
const RENTAL_OPTS: Opt[] = [
  { v: "DAILY", en: "Daily", ar: "يومي" }, { v: "WEEKLY", en: "Weekly", ar: "أسبوعي" },
  { v: "MONTHLY", en: "Monthly", ar: "شهري" }, { v: "PER_JOB", en: "Per job", ar: "بالمهمة" },
  { v: "LONG_TERM", en: "Long term", ar: "طويل الأمد" },
];
const OVERTIME_OPTS: Opt[] = [{ v: "0", en: "None", ar: "بدون" }, { v: "1.5X", en: "1.5×", ar: "١.٥×" }, { v: "2X", en: "2×", ar: "٢×" }];
const PAYTERMS_OPTS: Opt[] = [
  { v: "upfront", en: "Upfront", ar: "مقدماً" }, { v: "per_day", en: "Per day", ar: "يومياً" },
  { v: "net_30", en: "Net 30", ar: "خلال ٣٠ يوم" }, { v: "net_60", en: "Net 60", ar: "خلال ٦٠ يوم" },
  { v: "end_of_job", en: "End of job", ar: "نهاية المهمة" },
];
const MAINT_OPTS: Opt[] = [{ v: "supplier", en: "Supplier", ar: "المؤجّر" }, { v: "rentee", en: "Me (renter)", ar: "أنا (المستأجر)" }];
const SLA_OPTS: Opt[] = [
  { v: "FOUR_HR", en: "4 hours", ar: "٤ ساعات" }, { v: "EIGHT_HR", en: "8 hours", ar: "٨ ساعات" },
  { v: "TWENTY_FOUR_HR", en: "24 hours", ar: "٢٤ ساعة" }, { v: "FORTY_EIGHT_HR", en: "48 hours", ar: "٤٨ ساعة" },
  { v: "SEVENTY_TWO_HR", en: "72 hours", ar: "٧٢ ساعة" },
];
const FULFILL_OPTS: Opt[] = [{ v: "SINGLE_SUPPLIER", en: "Single supplier", ar: "مؤجّر واحد" }, { v: "MULTIPLE_SUPPLIERS", en: "Multiple suppliers", ar: "عدة مؤجّرين" }];
const OFFER_OPTS: Opt[] = [{ v: "24H", en: "24 hours", ar: "٢٤ ساعة" }, { v: "48H", en: "48 hours", ar: "٤٨ ساعة" }, { v: "72H", en: "72 hours", ar: "٧٢ ساعة" }, { v: "1W", en: "1 week", ar: "أسبوع" }];
const OPERATOR_OPTS: Opt[] = [{ v: "YES", en: "With operator", ar: "مع مشغّل" }, { v: "NO", en: "Without operator", ar: "بدون مشغّل" }];
const FUEL_OPTS: Opt[] = [{ v: "DIESEL", en: "Diesel", ar: "ديزل" }, { v: "PETROL", en: "Petrol", ar: "بنزين" }, { v: "ELECTRIC", en: "Electric", ar: "كهربائي" }];
// Match the create form (ItemRow): operator nationality is Restricted / Any (values sent to the backend).
const NATIONALITY_OPTS: Opt[] = [{ v: "restricted", en: "Restricted", ar: "مقيّدة" }, { v: "any", en: "Any", ar: "أي" }];
const BYWHO_OPTS: Opt[] = [{ v: "rentee", en: "Me (renter)", ar: "أنا (المستأجر)" }, { v: "supplier", en: "Supplier", ar: "المؤجّر" }];

function EditRequestModal({ r, ar, L, onClose, onSaved }: { r: RequestRecord; ar: boolean; L: (en: string, arr: string) => string; onClose: () => void; onSaved: () => void }) {
  const s = (v: unknown) => (v == null ? "" : String(v));
  const it = r.equipmentItems?.[0];
  // Project
  const [rentalType, setRentalType] = useState(s(r.rentalType));
  const [startDate, setStartDate] = useState(s(r.startDate).slice(0, 10));
  const [endDate, setEndDate] = useState(s(r.endDate).slice(0, 10));
  const [hours, setHours] = useState(s(r.workingHoursPerDay));
  const [days, setDays] = useState(s((r as Record<string, unknown>).workingDaysPerWeek));
  const [overtime, setOvertime] = useState(s((r as Record<string, unknown>).overtimeRate));
  const [terrain, setTerrain] = useState(s((r as Record<string, unknown>).terrainType));
  // Equipment (single item — fan-out)
  const [units, setUnits] = useState(s(it?.numberOfUnits ?? 1));
  const [operator, setOperator] = useState(s(it?.operatorIncluded ?? "NO"));
  const [fuel, setFuel] = useState(s(it?.fuelTypePreference ?? "DIESEL"));
  const [nationality, setNationality] = useState(s(it?.operatorNationality));
  const [mob, setMob] = useState(it?.mobilizationByRentee ? "rentee" : "supplier");
  const [demob, setDemob] = useState(it?.demobilizationByRentee ? "rentee" : "supplier");
  const [fat, setFat] = useState(it?.fatRequired ? "supplier" : "rentee");
  const [maxAge, setMaxAge] = useState(s(it?.maxEquipmentAge));
  const [nightShift, setNightShift] = useState(!!it?.nightShiftRequired);
  const [itemNotes, setItemNotes] = useState(s(it?.additionalNotes));
  // Preferences
  const [payTerms, setPayTerms] = useState(s(r.paymentTerms));
  const [maint, setMaint] = useState(s(r.maintenanceResponsibility));
  const [sla, setSla] = useState(s((r as Record<string, unknown>).breakdownResponseSla));
  const [budget, setBudget] = useState(s(r.budgetCeiling));
  const [fulfill, setFulfill] = useState(s((r as Record<string, unknown>).fulfillmentType));
  const [offer, setOffer] = useState(s((r as Record<string, unknown>).offerDuration));
  const [verifiedOnly, setVerifiedOnly] = useState(!!(r as Record<string, unknown>).verifiedSuppliersOnly);
  const [subletting, setSubletting] = useState(!!(r as Record<string, unknown>).subletting);
  const [notes, setNotes] = useState(s(r.additionalNotes));
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const patch: Record<string, unknown> = {};
    if (rentalType) patch.rentalType = rentalType;
    if (startDate) patch.startDate = new Date(`${startDate}T00:00:00Z`).toISOString();
    if (endDate) patch.endDate = new Date(`${endDate}T00:00:00Z`).toISOString();
    if (hours) patch.workingHoursPerDay = Number(hours);
    if (days) patch.workingDaysPerWeek = Number(days);
    if (overtime) patch.overtimeRate = overtime;
    patch.terrainType = terrain || undefined;
    if (payTerms) patch.paymentTerms = payTerms;
    if (maint) patch.maintenanceResponsibility = maint;
    if (sla) patch.breakdownResponseSla = sla;
    if (budget) patch.budgetCeiling = Number(budget);
    if (fulfill) patch.fulfillmentType = fulfill;
    if (offer) patch.offerDuration = offer;
    patch.verifiedSuppliersOnly = verifiedOnly;
    patch.subletting = subletting;
    patch.additionalNotes = notes;
    // The single fanned-out item — PATCH replaces it, so send the full shape (ids kept).
    if (it?.categoryId && it.subtypeId && it.capacityId) {
      patch.equipmentItems = [{
        categoryId: it.categoryId, subtypeId: it.subtypeId, capacityId: it.capacityId,
        numberOfUnits: Number(units) || 1,
        operatorIncluded: operator || "NO",
        fuelTypePreference: fuel || "DIESEL",
        mobilizationByRentee: mob === "rentee",
        demobilizationByRentee: demob === "rentee",
        fatRequired: fat === "supplier",
        nightShiftRequired: nightShift,
        safetyCertifications: it.safetyCertifications ?? [],
        ...(maxAge ? { maxEquipmentAge: Number(maxAge) } : {}),
        ...(nationality ? { operatorNationality: nationality } : {}),
        ...(itemNotes ? { additionalNotes: itemNotes } : {}),
      }];
    }
    try {
      await updateRequest(r.id, patch);
      onSaved();
    } catch {
      setBusy(false);
    }
  }

  const fld = "mt-1 h-[42px] w-full rounded-[10px] border border-[var(--border)] bg-[var(--surface2)] px-3 text-[14px] outline-0";
  const lbl = "text-[12px] font-bold text-[var(--navy-mid)]";
  const Sel = ({ label, value, onChange, opts }: { label: string; value: string; onChange: (v: string) => void; opts: Opt[] }) => (
    <label><span className={lbl}>{label}</span>
      <select className={fld} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{L("—", "—")}</option>
        {opts.map((o) => <option key={o.v} value={o.v}>{ar ? o.ar : o.en}</option>)}
      </select>
    </label>
  );
  const Num = ({ label, value, onChange, min, max }: { label: string; value: string; onChange: (v: string) => void; min?: number; max?: number }) => (
    <label><span className={lbl}>{label}</span><input type="number" min={min} max={max} className={fld} value={value} onChange={(e) => onChange(e.target.value)} /></label>
  );
  const Chk = ({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) => (
    <label className="flex items-center gap-2 py-1.5 text-[13px] font-semibold text-[var(--navy)]">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-[var(--action)]" />{label}
    </label>
  );
  const SecH = ({ icon, children }: { icon: string; children: ReactNode }) => (
    <div className="mb-2 mt-4 flex items-center gap-1.5 text-[13px] font-extrabold text-[var(--navy)] first:mt-0">
      <span className="material-icons-outlined" style={{ fontSize: 18, color: "var(--action)" }}>{icon}</span>{children}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" dir={ar ? "rtl" : "ltr"} onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-[var(--surface1)] shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <h3 className="text-[17px] font-extrabold text-[var(--navy)]">{L("Edit request", "تعديل الطلب")}</h3>
          <button onClick={onClose} className="text-[var(--muted)]"><span className="material-icons-outlined">close</span></button>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          <SecH icon="event">{L("Project & timing", "المشروع والتوقيت")}</SecH>
          <div className="grid grid-cols-2 gap-3">
            <Sel label={L("Rental basis", "أساس الإيجار")} value={rentalType} onChange={setRentalType} opts={RENTAL_OPTS} />
            <Sel label={L("Overtime rate", "معدل العمل الإضافي")} value={overtime} onChange={setOvertime} opts={OVERTIME_OPTS} />
            <label><span className={lbl}>{L("Start date", "تاريخ البدء")}</span><input type="date" className={fld} value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
            <label><span className={lbl}>{L("End date", "تاريخ الانتهاء")}</span><input type="date" className={fld} value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label>
            <Num label={L("Working hours/day", "ساعات العمل/يوم")} value={hours} onChange={setHours} min={1} max={24} />
            <Num label={L("Working days/week", "أيام العمل/أسبوع")} value={days} onChange={setDays} min={1} max={7} />
            <label className="col-span-2"><span className={lbl}>{L("Terrain", "طبيعة الأرض")}</span><input className={fld} value={terrain} onChange={(e) => setTerrain(e.target.value)} placeholder={L("e.g. sand, rocky", "مثل: رملية، صخرية")} /></label>
          </div>

          <SecH icon="construction">{L("Equipment", "المعدات")}</SecH>
          <div className="grid grid-cols-2 gap-3">
            <Num label={L("Quantity", "الكمية")} value={units} onChange={setUnits} min={1} />
            <Sel label={L("Operator", "المشغّل")} value={operator} onChange={setOperator} opts={OPERATOR_OPTS} />
            <Sel label={L("Fuel type", "نوع الوقود")} value={fuel} onChange={setFuel} opts={FUEL_OPTS} />
            <Sel label={L("Operator nationality", "جنسية المشغّل")} value={nationality} onChange={setNationality} opts={NATIONALITY_OPTS} />
            <Sel label={L("Delivery (mobilization) by", "التوصيل من قبل")} value={mob} onChange={setMob} opts={BYWHO_OPTS} />
            <Sel label={L("Return (demobilization) by", "الإرجاع من قبل")} value={demob} onChange={setDemob} opts={BYWHO_OPTS} />
            <Sel label={L("F.A.T (catering) by", "الإعاشة من قبل")} value={fat} onChange={setFat} opts={BYWHO_OPTS} />
            <Num label={L("Min. equipment year", "أقدم سنة صنع")} value={maxAge} onChange={setMaxAge} min={1990} max={2026} />
          </div>
          <Chk label={L("Night shift required", "يتطلب وردية ليلية")} value={nightShift} onChange={setNightShift} />
          <label className="mt-1 block"><span className={lbl}>{L("Equipment notes", "ملاحظات المعدة")}</span>
            <textarea rows={2} className="mt-1 w-full rounded-[10px] border border-[var(--border)] bg-[var(--surface2)] p-3 text-[14px] outline-0" value={itemNotes} onChange={(e) => setItemNotes(e.target.value)} />
          </label>

          <SecH icon="tune">{L("Preferences", "التفضيلات")}</SecH>
          <div className="grid grid-cols-2 gap-3">
            <Sel label={L("Payment terms", "شروط الدفع")} value={payTerms} onChange={setPayTerms} opts={PAYTERMS_OPTS} />
            <Sel label={L("Maintenance by", "الصيانة من قبل")} value={maint} onChange={setMaint} opts={MAINT_OPTS} />
            <Sel label={L("Breakdown response", "زمن الاستجابة للأعطال")} value={sla} onChange={setSla} opts={SLA_OPTS} />
            <Num label={L("Budget ceiling (SAR)", "سقف الميزانية (ر.س)")} value={budget} onChange={setBudget} min={0} />
            <Sel label={L("Fulfillment", "آلية التنفيذ")} value={fulfill} onChange={setFulfill} opts={FULFILL_OPTS} />
            <Sel label={L("Offer validity", "صلاحية العرض")} value={offer} onChange={setOffer} opts={OFFER_OPTS} />
          </div>
          <Chk label={L("Verified suppliers only", "المؤجّرون الموثّقون فقط")} value={verifiedOnly} onChange={setVerifiedOnly} />
          <Chk label={L("Allow subletting", "السماح بالتأجير من الباطن")} value={subletting} onChange={setSubletting} />
          <label className="mt-1 block"><span className={lbl}>{L("Additional notes", "ملاحظات إضافية")}</span>
            <textarea rows={3} className="mt-1 w-full rounded-[10px] border border-[var(--border)] bg-[var(--surface2)] p-3 text-[14px] outline-0" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
        </div>

        <div className="flex justify-end gap-2.5 border-t border-[var(--border)] px-5 py-4">
          <button className="rounded-[10px] border border-[var(--border)] px-4 py-2.5 text-[13px] font-bold text-[var(--navy)]" onClick={onClose}>{L("Cancel", "إلغاء")}</button>
          <button className="rounded-[10px] bg-[var(--action)] px-5 py-2.5 text-[13px] font-bold text-white disabled:opacity-50" disabled={busy} onClick={save}>{busy ? L("Saving…", "جارٍ الحفظ…") : L("Save changes", "حفظ التغييرات")}</button>
        </div>
      </div>
    </div>
  );
}

export function Ditem({ item, ar, L }: { item: RequestItem; ar: boolean; L: (en: string, arr: string) => string }) {
  const name = [ar ? item.subtypeNameAr ?? item.subtypeName : item.subtypeName, ar ? item.capacityNameAr ?? item.capacityName : item.capacityName].filter(Boolean).join(" · ") || "—";
  const terms: [string, string][] = [];
  if (item.operatorIncluded === "YES") terms.push(["person_outline", L("With operator", "مع مشغّل")]);
  if (item.operatorIncluded === "NO") terms.push(["person_off", L("No operator", "بدون مشغّل")]);
  if (item.fuelTypePreference) terms.push(["local_gas_station", item.fuelTypePreference]);
  if (item.mobilizationByRentee != null) terms.push(["local_shipping", item.mobilizationByRentee ? L("Delivery by me", "التوصيل عليّ") : L("Delivery by supplier", "التوصيل على المؤجّر")]);
  if (item.demobilizationByRentee != null) terms.push(["keyboard_return", item.demobilizationByRentee ? L("Return by me", "الإرجاع عليّ") : L("Return by supplier", "الإرجاع على المؤجّر")]);
  if (item.fatRequired != null) terms.push(["restaurant", item.fatRequired ? L("F.A.T by supplier", "الإعاشة على المؤجّر") : L("F.A.T by me", "الإعاشة عليّ")]);
  if (item.nightShiftRequired) terms.push(["nightlight", L("Night shift", "وردية ليلية")]);
  if (item.operatorNationality) terms.push(["flag", item.operatorNationality]);
  if (item.maxEquipmentAge) terms.push(["calendar_month", `${item.maxEquipmentAge}+`]);
  (item.safetyCertifications ?? []).forEach((c) => terms.push(["verified", c]));
  return (
    <div className="ditem">
      <span className="di"><EquipImg src={publicTaxonomyUrl(item.subtypeImageUrl ?? item.categoryImageUrl)} categoryId={item.categoryId} name={name} box="" img="h-8 w-8 object-contain" iconSize={21} /></span>
      <div>
        <div className="dn">{name}{item.numberOfUnits > 1 ? <span style={{ color: "var(--muted)" }}> × {item.numberOfUnits}</span> : null}</div>
        {terms.length > 0 && (
          <div className="terms">
            {terms.map(([ic, label], i) => (
              <span className="tchip" key={i}><span className="material-icons-outlined">{ic}</span>{label}</span>
            ))}
          </div>
        )}
        {item.additionalNotes && <div className="notes" style={{ padding: "8px 0 0" }}>{item.additionalNotes}</div>}
      </div>
    </div>
  );
}
