"use client";

import { useState, type ReactNode } from "react";
import { Dialog } from "@/components/Dialog";
import { updateRequest } from "@/lib/api/client";
import { type RequestRecord } from "@/lib/contract/requests";
import "@/components/requests/requests-proto.css";

/**
 * The two modals that outlived the request-detail page.
 *
 * They were defined in `RequestDetail.tsx` and exported from it; that page is switched off with the
 * rest of the old requests surfaces (docs/requests-workspace-disabled.md), but these two are not part
 * of it — they are the request's edit form and its cancel confirmation, and the workspace drawer
 * raises both. Moved here verbatim rather than rebuilt: a second edit form for one request would
 * drift from this one, and the copy is asserted by tests.
 */
/**
 * What a cancel confirmation is about. A fanned-out RFQ makes the scope genuinely ambiguous — the same
 * ✕ could mean "withdraw this one line" or "withdraw all five" — so the copy AND the confirm button both
 * name it. Never let a click that meant to trim one item read as cancelling the whole RFQ.
 *  - `single`    — one request on its own detail page (`/requests/{id}`).
 *  - `all`       — a whole RFQ, every item cancellable.
 *  - `remaining` — a whole RFQ where only some items are cancellable (the rest accepted/expired/closed).
 *  - `item`      — one item inside a multi-item RFQ.
 */
export type CancelScope =
  | { kind: "single"; idLabel: string }
  | { kind: "all"; idLabel: string; total: number }
  | { kind: "remaining"; idLabel: string; total: number; count: number }
  | { kind: "item"; idLabel: string; itemLabel: string; others: number };

/** Styled cancel confirmation (replaces the browser prompt), matching the app's destructive dialog. */
export function ConfirmCancelModal({ ar, L, busy, scope, error, onClose, onConfirm }: { ar: boolean; L: (en: string, arr: string) => string; busy: boolean; scope: CancelScope; error?: string | null; onClose: () => void; onConfirm: () => void }) {
  // A one-item "all" is just a single request — "All 1 items" would be nonsense.
  const s: CancelScope = scope.kind === "all" && scope.total <= 1 ? { kind: "single", idLabel: scope.idLabel } : scope;
  const id = <span className="font-bold text-[var(--navy)]">{s.idLabel}</span>;
  const UNDO = L("This can’t be undone.", "لا يمكن التراجع عن هذا الإجراء.");
  const NO_BIDS = L("and suppliers can no longer bid", "ولن يتمكن المؤجّرون من تقديم عروض");

  const title = s.kind === "item" ? L("Cancel this item?", "إلغاء هذا البند؟")
    : s.kind === "remaining" ? L("Cancel remaining items?", "إلغاء البنود المتبقية؟")
    : L("Cancel this request?", "إلغاء هذا الطلب؟");

  const body = s.kind === "single" ? <>{ar ? <>الطلب {id} سيتم سحبه {NO_BIDS}. {UNDO}</> : <>Request {id} will be withdrawn {NO_BIDS}. {UNDO}</>}</>
    : s.kind === "all" ? <>{ar ? <>سيتم سحب جميع البنود ({s.total}) في {id} {NO_BIDS}. {UNDO}</> : <>All {s.total} items in {id} will be withdrawn {NO_BIDS}. {UNDO}</>}</>
    : s.kind === "remaining" ? <>{ar ? <>سيتم سحب {s.count} من {s.total} بنود في {id}. لن تتأثر البنود الأخرى ({s.total - s.count}). {UNDO}</> : <>{s.count} of {s.total} items in {id} will be withdrawn. The other {s.total - s.count} will not be affected. {UNDO}</>}</>
    : <>{ar ? <><span className="font-bold text-[var(--navy)]">{s.itemLabel}</span> ({id}) سيتم سحبه{s.others > 0 ? <>. لن تتأثر البنود الأخرى في هذا الطلب ({s.others})</> : null}. {UNDO}</> : <><span className="font-bold text-[var(--navy)]">{s.itemLabel}</span> ({id}) will be withdrawn{s.others > 0 ? <>. The other {s.others} {s.others === 1 ? "item" : "items"} in this request {s.others === 1 ? "is" : "are"} not affected</> : null}. {UNDO}</>}</>;

  const confirmLabel = s.kind === "item" ? L("Cancel item", "إلغاء البند")
    : s.kind === "all" ? L(`Cancel all ${s.total} items`, `إلغاء جميع البنود (${s.total})`)
    : s.kind === "remaining" ? L(`Cancel ${s.count} ${s.count === 1 ? "item" : "items"}`, `إلغاء ${s.count} من البنود`)
    : L("Cancel request", "إلغاء الطلب");

  return (
    <Dialog open onClose={onClose} size="sm" padded={false}>
      <div className="p-5 text-center" dir={ar ? "rtl" : "ltr"}>
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#fdecec]">
          <span className="material-icons-outlined" style={{ color: "#d64545", fontSize: 26 }}>report_problem</span>
        </div>
        <h3 className="text-[17px] font-extrabold text-[var(--navy)]">{title}</h3>
        <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--muted)]">{body}</p>
        {error && <p className="mt-3 rounded-[10px] bg-[#fdecec] px-3 py-2 text-[12.5px] font-bold leading-relaxed text-[#b03636]">{error}</p>}
        <div className="mt-5 flex gap-2.5">
          <button className="flex-1 rounded-[10px] border border-[var(--border)] px-4 py-2.5 text-[13px] font-bold text-[var(--navy)]" disabled={busy} onClick={onClose}>
            {error ? L("Close", "إغلاق") : s.kind === "item" ? L("Keep item", "الإبقاء على البند") : L("Keep request", "الإبقاء على الطلب")}
          </button>
          <button className="flex-1 rounded-[10px] bg-[#d64545] px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-50" disabled={busy} onClick={onConfirm}>
            {busy ? L("Cancelling…", "جارٍ الإلغاء…") : error ? L("Try again", "إعادة المحاولة") : confirmLabel}
          </button>
        </div>
      </div>
    </Dialog>
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

export function EditRequestModal({ r, ar, L, onClose, onSaved, siblingIds }: { r: RequestRecord; ar: boolean; L: (en: string, arr: string) => string; onClose: () => void; onSaved: () => void; siblingIds?: string[] }) {
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

  /** A window that runs backwards. The `min`/`max` above stop a picked date; this stops a typed one,
   *  and a request that already holds a reversed pair from before either guard existed. */
  const datesReversed = !!startDate && !!endDate && startDate > endDate;

  async function save() {
    if (datesReversed) return;
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
      // Group edit: apply the SHARED (non-equipment) fields to the other member requests too, so a
      // multi-item RFQ's project/preferences stay in sync without overwriting each item's equipment.
      if (siblingIds && siblingIds.length) {
        const shared = { ...(patch as Record<string, unknown>) };
        delete shared.equipmentItems;
        if (Object.keys(shared).length) await Promise.all(siblingIds.map((sid) => updateRequest(sid, shared).catch(() => {})));
      }
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
    <Dialog open onClose={onClose} size="lg" title={L("Edit request", "تعديل الطلب")} padded={false}>
      <div dir={ar ? "rtl" : "ltr"}>
        <div className="px-5 py-4">
          <SecH icon="event">{L("Project & timing", "المشروع والتوقيت")}</SecH>
          <div className="grid grid-cols-2 gap-3">
            <Sel label={L("Rental basis", "أساس الإيجار")} value={rentalType} onChange={setRentalType} opts={RENTAL_OPTS} />
            <Sel label={L("Overtime rate", "معدل العمل الإضافي")} value={overtime} onChange={setOvertime} opts={OVERTIME_OPTS} />
            {/* Each end bounds the other, as the numeric fields on this same row already bound
                themselves (owner, 2026-08-25). Save is blocked too — see `datesReversed`. */}
            <label><span className={lbl}>{L("Start date", "تاريخ البدء")}</span><input type="date" max={endDate || undefined} className={fld} value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
            <label><span className={lbl}>{L("End date", "تاريخ الانتهاء")}</span><input type="date" min={startDate || undefined} className={fld} value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label>
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
          {datesReversed && (
            <span className="me-auto text-[12.5px] font-bold text-[#d64545]">
              {L("End date is before the start date.", "تاريخ الانتهاء يسبق تاريخ البدء.")}
            </span>
          )}
          <button className="rounded-[10px] bg-[var(--action)] px-5 py-2.5 text-[13px] font-bold text-white disabled:opacity-50" disabled={busy || datesReversed} onClick={save}>{busy ? L("Saving…", "جارٍ الحفظ…") : L("Save changes", "حفظ التغييرات")}</button>
        </div>
      </div>
    </Dialog>
  );
}
