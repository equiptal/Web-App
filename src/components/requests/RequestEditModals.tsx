"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Dialog } from "@/components/Dialog";
import { Dropdown } from "@/components/Dropdown";
import { CertSelect } from "@/components/create/CertSelect";
import type { SubtypeAttachmentOption } from "@/lib/contract/app";
import { requestedMinYear } from "@/lib/contract/bids";
import { SAFETY_CERTIFICATES, type SafetyCertificate } from "@/lib/contract/options";
import { updateRequest } from "@/lib/api/client";
import { type RequestRecord } from "@/lib/contract/requests";
import "@/components/requests/requests-proto.css";
import { CARD_FOOTER, btn } from "@/lib/ds";

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
  const id = <span className="font-semibold text-navy">{s.idLabel}</span>;
  const UNDO = L("This can’t be undone.", "لا يمكن التراجع عن هذا الإجراء.");
  const NO_BIDS = L("and suppliers can no longer bid", "ولن يتمكن المؤجّرون من تقديم عروض");

  const title = s.kind === "item" ? L("Cancel this item?", "إلغاء هذا البند؟")
    : s.kind === "remaining" ? L("Cancel remaining items?", "إلغاء البنود المتبقية؟")
    : L("Cancel this request?", "إلغاء هذا الطلب؟");

  const body = s.kind === "single" ? <>{ar ? <>الطلب {id} سيتم سحبه {NO_BIDS}. {UNDO}</> : <>Request {id} will be withdrawn {NO_BIDS}. {UNDO}</>}</>
    : s.kind === "all" ? <>{ar ? <>سيتم سحب جميع البنود ({s.total}) في {id} {NO_BIDS}. {UNDO}</> : <>All {s.total} items in {id} will be withdrawn {NO_BIDS}. {UNDO}</>}</>
    : s.kind === "remaining" ? <>{ar ? <>سيتم سحب {s.count} من {s.total} بنود في {id}. لن تتأثر البنود الأخرى ({s.total - s.count}). {UNDO}</> : <>{s.count} of {s.total} items in {id} will be withdrawn. The other {s.total - s.count} will not be affected. {UNDO}</>}</>
    : <>{ar ? <><span className="font-semibold text-navy">{s.itemLabel}</span> ({id}) سيتم سحبه{s.others > 0 ? <>. لن تتأثر البنود الأخرى في هذا الطلب ({s.others})</> : null}. {UNDO}</> : <><span className="font-semibold text-navy">{s.itemLabel}</span> ({id}) will be withdrawn{s.others > 0 ? <>. The other {s.others} {s.others === 1 ? "item" : "items"} in this request {s.others === 1 ? "is" : "are"} not affected</> : null}. {UNDO}</>}</>;

  const confirmLabel = s.kind === "item" ? L("Cancel item", "إلغاء البند")
    : s.kind === "all" ? L(`Cancel all ${s.total} items`, `إلغاء جميع البنود (${s.total})`)
    : s.kind === "remaining" ? L(`Cancel ${s.count} ${s.count === 1 ? "item" : "items"}`, `إلغاء ${s.count} من البنود`)
    : L("Cancel request", "إلغاء الطلب");

  return (
    <Dialog open onClose={onClose} size="sm" padded={false}>
      <div className="p-5 text-center" dir={ar ? "rtl" : "ltr"}>
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-danger-soft">
          <span className="material-icons-outlined" style={{ color: "var(--danger)", fontSize: 26 }}>report_problem</span>
        </div>
        <h3 className="text-title font-extrabold text-navy">{title}</h3>
        <p className="mt-1.5 text-body leading-relaxed text-muted">{body}</p>
        {error && <p className="mt-3 rounded-sm bg-danger-soft px-3 py-2 text-meta font-semibold leading-relaxed text-danger-deep">{error}</p>}
        <div className="mt-5 flex gap-2.5">
          <button className={btn("secondary", "md", { className: "flex-1 text-navy" })} disabled={busy} onClick={onClose}>
            {error ? L("Close", "إغلاق") : s.kind === "item" ? L("Keep item", "الإبقاء على البند") : L("Keep request", "الإبقاء على الطلب")}
          </button>
          <button className={btn("danger", "md", { className: "flex-1" })} disabled={busy} onClick={onConfirm}>
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
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for the hidden overtime picker
const OVERTIME_OPTS: Opt[] = [{ v: "0", en: "None", ar: "بدون" }, { v: "1.5X", en: "1.5×", ar: "1.5×" }, { v: "2X", en: "2×", ar: "2×" }];
const PAYTERMS_OPTS: Opt[] = [
  { v: "upfront", en: "Upfront", ar: "مقدماً" }, { v: "per_day", en: "Per day", ar: "يومياً" },
  { v: "net_30", en: "Net 30", ar: "خلال 30 يوم" }, { v: "net_60", en: "Net 60", ar: "خلال 60 يوم" },
  { v: "end_of_job", en: "End of job", ar: "نهاية المهمة" },
];
const MAINT_OPTS: Opt[] = [{ v: "supplier", en: "Supplier", ar: "المؤجّر" }, { v: "rentee", en: "Me (renter)", ar: "أنا (المستأجر)" }];
const SLA_OPTS: Opt[] = [
  { v: "FOUR_HR", en: "4 hours", ar: "4 ساعات" }, { v: "EIGHT_HR", en: "8 hours", ar: "8 ساعات" },
  { v: "TWENTY_FOUR_HR", en: "24 hours", ar: "24 ساعة" }, { v: "FORTY_EIGHT_HR", en: "48 hours", ar: "48 ساعة" },
  { v: "SEVENTY_TWO_HR", en: "72 hours", ar: "72 ساعة" },
];
/* ~~`FULFILL_OPTS`.~~ Gone with the Fulfillment field (owner, 2026-09-01). The create canvas never
   asks it, so it is not one of the renter's answers and this form does not put it to him. Nor does
   the details list — see `request-fields.ts`. Same for Terrain, Working days/week and Payment
   method: all four are stored columns an older form or a mobile build can fill, and none is part of
   the conversation the create flow has. */
const OFFER_OPTS: Opt[] = [{ v: "24H", en: "24 hours", ar: "24 ساعة" }, { v: "48H", en: "48 hours", ar: "48 ساعة" }, { v: "72H", en: "72 hours", ar: "72 ساعة" }, { v: "1W", en: "1 week", ar: "أسبوع" }];
const OPERATOR_OPTS: Opt[] = [{ v: "YES", en: "With operator", ar: "مع مشغّل" }, { v: "NO", en: "Without operator", ar: "بدون مشغّل" }];
const FUEL_OPTS: Opt[] = [{ v: "DIESEL", en: "Diesel", ar: "ديزل" }, { v: "PETROL", en: "Petrol", ar: "بنزين" }, { v: "ELECTRIC", en: "Electric", ar: "كهربائي" }];
// Match the create form (ItemRow): operator nationality is Restricted / Any (values sent to the backend).
const NATIONALITY_OPTS: Opt[] = [{ v: "restricted", en: "Restricted", ar: "مقيّدة" }, { v: "any", en: "Any", ar: "أي" }];
const BYWHO_OPTS: Opt[] = [{ v: "rentee", en: "Me (renter)", ar: "أنا (المستأجر)" }, { v: "supplier", en: "Supplier", ar: "المؤجّر" }];

/**
 * **Edit a request — the create flow's own fields, in the create flow's own order** (owner,
 * 2026-09-01: *"make sure all fields in the edit match exactly field of the normal create request
 * flow, no more no less, and in same order — equipment then where then when then preferences"*).
 *
 * It had grown its own field set. Some of it the create canvas never asks (Terrain, Fulfillment,
 * Working days/week, Payment method), so a renter met questions here he had never been asked and
 * could not recognise; and some of what the canvas DOES ask was missing (fuel responsibility,
 * extendable). The order was its own too — Project & timing first, equipment second.
 *
 * The list below is `app-adapters.createRequestPayload`'s, read against the canvas that fills it,
 * grouped and ordered exactly as the renter met them: the machine, then where it goes, then when,
 * then how he wants to be dealt with.
 *
 * ── The conditional fields are the canvas's conditions, not new ones ────────────────────────────
 * The operator's questions appear only WITH an operator, because that is when the canvas raises the
 * operator rail; the maintenance SLA only when the supplier carries maintenance, because an SLA
 * against yourself is not a term. Copying the conditions matters as much as copying the fields — a
 * form that asks about a night shift on a machine with no operator is a different form.
 *
 * ── ~~Three fields the read payload does not carry.~~ Wrong, and worth recording ─────────────
 * (owner, 2026-09-01: *"in request details these are shown so why in edit it cant"*)
 *
 * The claim was that `workType`, the F.A.T split and the certificate list could not be prefilled
 * because `RequestItem` does not name them. `RequestItem` is a DESCRIPTION, not a filter:
 * `mapRequestDetail` spreads the raw record and whitelists nothing, so every column the backend
 * returns reaches this component whether the interface mentions it or not. The interface was
 * incomplete; it names them now.
 *
 * The certificate list was the sharpest of it: the details modal has always PRINTED it, off the same
 * record this form reads, while this form passed it through untouched.
 *
 * ── What is stated but not edited ───────────────────────────────────────────────────────────────
 * **The site.** It is in the order because the renter expects it there, and it is READ-ONLY: the
 * canvas picks a location on a map and stores `projectLat`/`projectLng` beside the label, and a text
 * box here would edit the words while leaving the coordinates — which every distance, every map pin
 * and every supplier match is computed from — pointing at the old place. Moving a request is a
 * different act from correcting one, and it needs the picker, not a field.
 */
export function EditRequestModal({ r, ar, L, onClose, onSaved, siblingIds }: { r: RequestRecord; ar: boolean; L: (en: string, arr: string) => string; onClose: () => void; onSaved: () => void; siblingIds?: string[] }) {
  const s = (v: unknown) => (v == null ? "" : String(v));
  const it = r.equipmentItems?.[0];

  // ── Equipment ──
  /**
   * Off-catalogue: the line has no taxonomy, and the renter's own name is the only thing that says
   * what the machine is — so it is the one equipment field this modal can offer him to edit.
   * `isUndefined` is the backend's derived flag; the ids come back as the empty string on such a
   * line and must never be read as a value.
   */
  const offCatalogue = it?.isUndefined === true;
  const [customName, setCustomName] = useState(s(it?.customEquipmentName));
  const [units, setUnits] = useState(s(it?.numberOfUnits ?? 1));
  const [operator, setOperator] = useState(s(it?.operatorIncluded ?? "NO"));
  const [nationality, setNationality] = useState(s(it?.operatorNationality));
  const [nightShift, setNightShift] = useState(!!it?.nightShiftRequired);
  /* The SPLIT, which is what create asks: food and accommodation are two answers. `fatRequired` is
     the deprecated rollup and is DERIVED from them on save, never set beside them. Falling back to
     the rollup keeps a request created before the split opening on what it actually holds. */
  const [fatFood, setFatFood] = useState((it?.fatFood ?? it?.fatRequired) ? "supplier" : "rentee");
  const [fatStay, setFatStay] = useState((it?.fatAccommodationTransport ?? it?.fatRequired) ? "supplier" : "rentee");
  const [fuel, setFuel] = useState(s(it?.fuelTypePreference ?? "DIESEL"));
  /** `dieselIncluded` IS the fuel-responsibility answer: true ⇒ the supplier carries it. */
  const [fuelBy, setFuelBy] = useState(it?.dieselIncluded ? "supplier" : "rentee");
  const [minYear, setMinYear] = useState(s(requestedMinYear((it ?? {}) as unknown as Record<string, unknown>)));
  const [mob, setMob] = useState(it?.mobilizationByRentee ? "rentee" : "supplier");
  const [demob, setDemob] = useState(it?.demobilizationByRentee ? "rentee" : "supplier");
  const [workType, setWorkType] = useState(s(it?.workType));
  const [attachments, setAttachments] = useState<string[]>(it?.attachmentIds ?? []);
  /**
   * That subtype's attachment catalogue, so the ids on the item can be NAMED.
   *
   * The canvas's own `useItemAttachments` reads the same endpoint, with one difference that matters
   * here: it applies the admin's `preSelected` defaults when nothing is chosen. That is right for a
   * machine being described for the first time and wrong for one being corrected. A request the
   * renter deliberately left without attachments must not gain them by opening this form.
   */
  const [attachOptions, setAttachOptions] = useState<SubtypeAttachmentOption[]>([]);
  const subtypeId = it?.subtypeId ?? null;
  useEffect(() => {
    if (!subtypeId) return;
    let live = true;
    fetch(`/api/equipment/attachments/${encodeURIComponent(subtypeId)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((list: SubtypeAttachmentOption[]) => live && setAttachOptions(Array.isArray(list) ? list : []))
      .catch(() => live && setAttachOptions([]));
    return () => {
      live = false;
    };
  }, [subtypeId]);
  const [certs, setCerts] = useState<SafetyCertificate[]>(
    (it?.safetyCertifications ?? []).filter((c): c is SafetyCertificate =>
      (SAFETY_CERTIFICATES as readonly string[]).includes(c),
    ),
  );
  const [itemNotes, setItemNotes] = useState(s(it?.additionalNotes));

  // ── When ──
  const [startDate, setStartDate] = useState(s(r.startDate).slice(0, 10));
  const [endDate, setEndDate] = useState(s(r.endDate).slice(0, 10));
  const [rentalType, setRentalType] = useState(s(r.rentalType));
  const [extendable, setExtendable] = useState(!!(r as Record<string, unknown>).extendable);
  const [hours, setHours] = useState(s(r.workingHoursPerDay));
  // const [overtime, setOvertime] = useState(s((r as Record<string, unknown>).overtimeRate)); // retired with the field

  // ── Preferences ──
  const [payTerms, setPayTerms] = useState(s(r.paymentTerms));
  const [maint, setMaint] = useState(s(r.maintenanceResponsibility));
  const [sla, setSla] = useState(s((r as Record<string, unknown>).breakdownResponseSla));
  const [budget, setBudget] = useState(s(r.budgetCeiling));
  const [offer, setOffer] = useState(s((r as Record<string, unknown>).offerDuration));
  const [verifiedOnly, setVerifiedOnly] = useState(!!(r as Record<string, unknown>).verifiedSuppliersOnly);
  const [subletting, setSubletting] = useState(!!(r as Record<string, unknown>).subletting);
  const [notes, setNotes] = useState(s(r.additionalNotes));
  const [busy, setBusy] = useState(false);

  /** The canvas raises the operator rail only with an operator, so these follow it. */
  const withOperator = operator === "YES";
  /** An SLA against yourself is not a term — the canvas hides it for the same reason. */
  const supplierMaintains = maint === "supplier";
  /* Work type is crane-only on the canvas (`equipment_step.dart` `_isCraneSelected`, mirrored in
     `hooks.ts`), and the test there is the subtype's NAME. The record carries that name, so the same
     test works here without loading the taxonomy. */
  const isCrane = (it?.subtypeName ?? "").toLowerCase().includes("crane");

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
    patch.extendable = extendable;
    if (hours) patch.workingHoursPerDay = Number(hours);
    // if (overtime) patch.overtimeRate = overtime; // retired — an edit no longer restates it
    if (payTerms) patch.paymentTerms = payTerms;
    if (maint) patch.maintenanceResponsibility = maint;
    /* Cleared rather than left behind when the renter hands maintenance back to himself: the field
       is hidden at that point, and a stale SLA would go on being sent by a form that no longer
       shows it. */
    patch.breakdownResponseSla = supplierMaintains && sla ? sla : undefined;
    if (budget) patch.budgetCeiling = Number(budget);
    if (offer) patch.offerDuration = offer;
    patch.verifiedSuppliersOnly = verifiedOnly;
    patch.subletting = subletting;
    patch.additionalNotes = notes;
    /* The single fanned-out item — PATCH replaces it, so send the full shape (ids kept).

       ⚠️ An OFF-CATALOGUE line has no ids at all (they read back as `""`), so the old guard was
       false for it and this modal silently sent NO item at all: every equipment edit on such a
       request — quantity, operator, fuel, dates' neighbours — appeared to save and went nowhere.
       It now sends the item with the renter's NAME in place of the three ids, the same shape the
       create endpoint takes. */
    if (offCatalogue || (it?.categoryId && it.subtypeId && it.capacityId)) {
      patch.equipmentItems = [{
        ...(offCatalogue
          ? { customEquipmentName: customName.trim().slice(0, 120) }
          : { categoryId: it!.categoryId as string, subtypeId: it!.subtypeId as string, capacityId: it!.capacityId as string }),
        numberOfUnits: Number(units) || 1,
        operatorIncluded: operator || "NO",
        fuelTypePreference: fuel || "DIESEL",
        mobilizationByRentee: mob === "rentee",
        demobilizationByRentee: demob === "rentee",
        // Only meaningful for a burnt fuel, exactly as `toDieselIncluded` decides it on create.
        ...(fuel === "DIESEL" || fuel === "PETROL" ? { dieselIncluded: fuelBy === "supplier" } : {}),
        safetyCertifications: certs,
        ...(isCrane && workType.trim() ? { workType: workType.trim().slice(0, 255) } : {}),
        attachmentIds: attachments,
        /* Passed through, not edited: nothing in the product asks for these, and the item is
           REPLACED by this patch, so leaving them out would delete whatever the parse found. */
        ...(it.customAttachments?.length ? { customAttachments: it.customAttachments } : {}),
        /* The operator's own answers go only with an operator, and are cleared without one — the
           same rule the canvas applies by not asking them.

           `fatRequired` is DERIVED from the two split answers, exactly as `app-adapters` derives it
           on create. Setting it independently is what produces `fat_required = true` with both split
           columns null: an impossible state that the admin surfaces read as "F.A.T included" while
           the bid form, which reads the split, shows nothing at all. */
        ...(withOperator
          ? {
              fatFood: fatFood === "supplier",
              fatAccommodationTransport: fatStay === "supplier",
              fatRequired: fatFood === "supplier" || fatStay === "supplier",
              nightShiftRequired: nightShift,
              ...(nationality ? { operatorNationality: nationality } : {}),
            }
          : {
              fatFood: undefined,
              fatAccommodationTransport: undefined,
              fatRequired: undefined,
              nightShiftRequired: undefined,
              operatorNationality: undefined,
            }),
        /* Posted under the deprecated alias, which is what the backend coalesces and what the create
           adapter also sends (`maxEquipmentAge: toManufactureYear(...)`). It is a manufacture YEAR
           despite the name; `requestedMinYear` is how it is read back. */
        ...(minYear ? { maxEquipmentAge: Number(minYear) } : {}),
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

  const fld = "mt-1 h-[42px] w-full rounded-md border border-border bg-surface2 px-3 text-body outline-0";
  const lbl = "text-meta font-semibold text-navy-mid";
  const Sel = ({ label, value, onChange, opts }: { label: string; value: string; onChange: (v: string) => void; opts: Opt[] }) => (
    <label><span className={lbl}>{label}</span>
      {/* One `Sel` feeds every list in these modals, so this is the whole file's worth of
          dropdowns (owner, 2026-08-31: one dropdown across the product). */}
      <Dropdown
        label={label}
        placeholder="—"
        value={value || null}
        onChange={onChange}
        options={opts.map((o) => ({ value: o.v, label: ar ? o.ar : o.en }))}
      />
    </label>
  );
  const Num = ({ label, value, onChange, min, max }: { label: string; value: string; onChange: (v: string) => void; min?: number; max?: number }) => (
    <label><span className={lbl}>{label}</span><input type="number" min={min} max={max} className={fld} value={value} onChange={(e) => onChange(e.target.value)} /></label>
  );
  const Chk = ({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) => (
    <label className="flex items-center gap-2 py-1.5 text-body font-semibold text-navy">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-brand" />{label}
    </label>
  );
  const SecH = ({ icon, children }: { icon: string; children: ReactNode }) => (
    <div className="mb-2 mt-4 flex items-center gap-1.5 text-body font-extrabold text-navy first:mt-0">
      <span className="material-icons-outlined" style={{ fontSize: 18, color: "var(--brand)" }}>{icon}</span>{children}
    </div>
  );

  return (
    <Dialog open onClose={onClose} size="lg" title={L("Edit request", "تعديل الطلب")} padded={false}>
      <div dir={ar ? "rtl" : "ltr"}>
        <div className="px-5 py-4">
          {/* ── 1 · Equipment ── */}
          <SecH icon="construction">{L("Equipment", "المعدات")}</SecH>
          {/* Off-catalogue: the machine's name is the renter's own text, so it is editable here and
              nowhere else. An ordinary line's taxonomy stays uneditable, as it always has been. */}
          {offCatalogue && (
            <label className="mb-3 block">
              <span className={lbl}>{L("Equipment name", "اسم المعدة")}</span>
              <input
                className={fld}
                value={customName}
                maxLength={120}
                placeholder={L("Name the machine you need", "اكتب اسم المعدة التي تحتاجها")}
                onChange={(e) => setCustomName(e.target.value)}
              />
            </label>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Num label={L("Quantity", "الكمية")} value={units} onChange={setUnits} min={1} />
            <Sel label={L("Operator", "المشغّل")} value={operator} onChange={setOperator} opts={OPERATOR_OPTS} />
            {withOperator && (
              <>
                <Sel label={L("Operator nationality", "جنسية المشغّل")} value={nationality} onChange={setNationality} opts={NATIONALITY_OPTS} />
                {/* Two answers, as the operator rail asks them. One control covering both was this
                    form's own invention. */}
                <Sel label={L("Food by", "الطعام من قبل")} value={fatFood} onChange={setFatFood} opts={BYWHO_OPTS} />
                <Sel label={L("Accommodation and transport by", "السكن والمواصلات من قبل")} value={fatStay} onChange={setFatStay} opts={BYWHO_OPTS} />
              </>
            )}
            <Sel label={L("Fuel type", "نوع الوقود")} value={fuel} onChange={setFuel} opts={FUEL_OPTS} />
            {/* Only a burnt fuel has a bill to carry — the canvas asks it on the same condition. */}
            {(fuel === "DIESEL" || fuel === "PETROL") && (
              <Sel label={L("Fuel by", "الوقود من قبل")} value={fuelBy} onChange={setFuelBy} opts={BYWHO_OPTS} />
            )}
            <Num label={L("Min. equipment year", "أقدم سنة صنع")} value={minYear} onChange={setMinYear} min={1990} max={2030} />
            <Sel label={L("Delivery (mobilization) by", "التوصيل من قبل")} value={mob} onChange={setMob} opts={BYWHO_OPTS} />
            <Sel label={L("Return (demobilization) by", "الإرجاع من قبل")} value={demob} onChange={setDemob} opts={BYWHO_OPTS} />
          </div>
          {withOperator && <Chk label={L("Night shift required", "يتطلب وردية ليلية")} value={nightShift} onChange={setNightShift} />}
          {/* The same picker the canvas uses, so the two surfaces cannot offer different lists.
              `touched` is true: this request has already been submitted, so an empty list is the
              renter's answer, not a question he has yet to reach. */}
          <div className="mt-2">
            <span className={lbl}>{L("Safety certificates", "شهادات السلامة")}</span>
            <div className="mt-1"><CertSelect values={certs} touched onChange={setCerts} /></div>
          </div>
          {/* Hidden entirely when this subtype has no admin-defined attachments, which is the
              canvas's own rule (MREQ-AC-22): an empty picker is a question with no answers. */}
          {attachOptions.length > 0 && (
            <div className="mt-2">
              <span className={lbl}>{L("Attachments", "الملحقات")}</span>
              <div className="mt-1 flex flex-wrap gap-2">
                {attachOptions.map((a) => {
                  const on = attachments.includes(a.id);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setAttachments((prev) => (prev.includes(a.id) ? prev.filter((x) => x !== a.id) : [...prev, a.id]))
                      }
                      className={`rounded-md border px-3 py-1.5 text-body font-semibold transition ${
                        on ? "border-brand bg-brand-soft text-brand-deep" : "border-border bg-surface text-navy hover:bg-surface2"
                      }`}
                    >
                      {ar ? a.nameAr || a.name : a.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {/* Crane-only, as the canvas has it. */}
          {isCrane && (
            <label className="mt-2 block"><span className={lbl}>{L("Work type", "نوع العمل")}</span>
              <input className={fld} value={workType} maxLength={255} onChange={(e) => setWorkType(e.target.value)} />
            </label>
          )}
          <label className="mt-1 block"><span className={lbl}>{L("Equipment notes", "ملاحظات المعدة")}</span>
            <textarea rows={2} className="mt-1 w-full rounded-md border border-border bg-surface2 p-3 text-body outline-0" value={itemNotes} onChange={(e) => setItemNotes(e.target.value)} />
          </label>

          {/* ── 2 · Where — stated, not edited. See the note on this component. ── */}
          <SecH icon="place">{L("Where", "الموقع")}</SecH>
          <p className="rounded-md border border-border bg-surface2 px-3 py-2.5 text-body text-navy">
            {r.projectAddressLabel || L("No site on this request", "لا موقع على هذا الطلب")}
          </p>
          <p className="mt-1 text-meta text-muted">
            {L(
              "The site is set on the map when the request is made. Moving it changes every distance and match, so it is not edited here.",
              "يُحدَّد الموقع على الخريطة عند إنشاء الطلب. تغييره يغيّر كل المسافات والمطابقات، لذلك لا يُعدَّل من هنا.",
            )}
          </p>

          {/* ── 3 · When ── */}
          <SecH icon="event">{L("When", "التوقيت")}</SecH>
          <div className="grid grid-cols-2 gap-3">
            {/* Each end bounds the other, as the numeric fields on this same row already bound
                themselves (owner, 2026-08-25). Save is blocked too — see `datesReversed`. */}
            <label><span className={lbl}>{L("Start date", "تاريخ البدء")}</span><input type="date" max={endDate || undefined} className={fld} value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
            <label><span className={lbl}>{L("End date", "تاريخ الانتهاء")}</span><input type="date" min={startDate || undefined} className={fld} value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label>
            <Sel label={L("Rental basis", "أساس الإيجار")} value={rentalType} onChange={setRentalType} opts={RENTAL_OPTS} />
            <Num label={L("Working hours/day", "ساعات العمل/يوم")} value={hours} onChange={setHours} min={1} max={24} />
            {/* <Sel label={L("Overtime rate", "معدل العمل الإضافي")} value={overtime} onChange={setOvertime} opts={OVERTIME_OPTS} /> */}
          </div>
          <Chk label={L("Extendable", "قابل للتمديد")} value={extendable} onChange={setExtendable} />

          {/* ── 4 · Preferences ── */}
          <SecH icon="tune">{L("Preferences", "التفضيلات")}</SecH>
          <div className="grid grid-cols-2 gap-3">
            <Sel label={L("Payment terms", "شروط الدفع")} value={payTerms} onChange={setPayTerms} opts={PAYTERMS_OPTS} />
            <Sel label={L("Maintenance by", "الصيانة من قبل")} value={maint} onChange={setMaint} opts={MAINT_OPTS} />
            {supplierMaintains && (
              <Sel label={L("Breakdown response", "زمن الاستجابة للأعطال")} value={sla} onChange={setSla} opts={SLA_OPTS} />
            )}
            <Num label={L("Budget ceiling (SAR)", "سقف الميزانية (ر.س)")} value={budget} onChange={setBudget} min={0} />
            <Sel label={L("Offer validity", "صلاحية العرض")} value={offer} onChange={setOffer} opts={OFFER_OPTS} />
          </div>
          <Chk label={L("Verified suppliers only", "المؤجّرون الموثّقون فقط")} value={verifiedOnly} onChange={setVerifiedOnly} />
          <Chk label={L("Allow subletting", "السماح بالتأجير من الباطن")} value={subletting} onChange={setSubletting} />
          <label className="mt-1 block"><span className={lbl}>{L("Additional notes", "ملاحظات إضافية")}</span>
            <textarea rows={3} className="mt-1 w-full rounded-md border border-border bg-surface2 p-3 text-body outline-0" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
        </div>

        <div className={CARD_FOOTER}>
          <button className={btn("secondary", "md", { className: "text-navy" })} onClick={onClose}>{L("Cancel", "إلغاء")}</button>
          {datesReversed && (
            <span className="me-auto text-meta font-semibold text-danger">
              {L("End date is before the start date.", "تاريخ الانتهاء يسبق تاريخ البدء.")}
            </span>
          )}
          <button className="rounded-sm bg-brand px-5 py-2.5 text-body font-semibold text-white disabled:bg-disabled-bg disabled:text-disabled-fg" disabled={busy || datesReversed} onClick={save}>{busy ? L("Saving…", "جارٍ الحفظ…") : L("Save changes", "حفظ التغييرات")}</button>
        </div>
      </div>
    </Dialog>
  );
}