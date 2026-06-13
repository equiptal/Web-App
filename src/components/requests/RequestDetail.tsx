"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/i18n";
import { fetchRequestDetail } from "@/lib/api/client";
import type { RequestItem, RequestRecord } from "@/lib/contract/requests";
import { Icon } from "@/components/ui";

/** Keys handled by a dedicated section or that are internal/relational — excluded from the generic dump. */
const SKIP = new Set([
  "id", "displayId", "shortCode", "equipmentItems", "dealRoomId", "dealRooms", "tenantId", "renteeId",
  "rentee", "supplier", "bids", "createdAt", "updatedAt", "deletedAt", "isTrial", "requestOrigin",
  "projectLat", "projectLng", "projectAddressLabel", "type", "status", "urgency", "bidCount",
  "unreadBidCount", "lastViewedAt", "version", "fat", "has_site_access_restrictions",
]);

const humanize = (k: string) =>
  k.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());

function fmtVal(v: unknown, ar: boolean): string {
  if (v == null || v === "") return "—";
  if (typeof v === "boolean") return v ? (ar ? "نعم" : "Yes") : ar ? "لا" : "No";
  if (Array.isArray(v)) return v.length ? v.join("، ") : "—";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString(ar ? "ar-SA" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
  }
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function RequestDetail({ id, onTitle }: { id: string; onTitle?: (t: string) => void }) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const L = (en: string, arr: string) => (ar ? arr : en);
  const router = useRouter();
  const [r, setR] = useState<RequestRecord | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    fetchRequestDetail(id)
      .then((d) => active && setR(d))
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, [id]);

  // Push the screen title up once loaded (in an effect — never during render).
  useEffect(() => {
    const it = r?.equipmentItems?.[0];
    if (onTitle && it) onTitle((ar ? it.subtypeNameAr ?? it.subtypeName : it.subtypeName) ?? "");
  }, [r, ar, onTitle]);

  if (error) return <div className="mx-auto max-w-[820px] rounded-[14px] border border-border bg-surface p-8 text-center text-[14px] font-semibold text-navy">{L("Couldn’t load this request.", "تعذّر تحميل هذا الطلب.")}</div>;
  if (!r) return <div className="grid place-items-center py-16 text-muted"><Icon name="progress_activity" size={28} className="animate-spin" /></div>;

  const item = r.equipmentItems?.[0];

  // Every remaining body field, so nothing the renter sent is hidden.
  const fields = Object.entries(r).filter(([k, v]) => !SKIP.has(k) && typeof v !== "object" && v != null && v !== "");

  return (
    <div className="mx-auto w-full max-w-[820px]">
      {/* status row */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge cls={r.status === "EXPIRED" ? "bg-warn-soft text-warn" : r.status === "CLOSED" ? "bg-surface2 text-muted" : "bg-info-soft text-info"}>{r.status}</Badge>
        <Badge cls="bg-surface2 text-navy-mid"><Icon name={r.type === "DIRECT" ? "person" : "campaign"} size={13} /> {r.type}</Badge>
        <span className="text-[12px] font-bold text-muted">{r.displayId ?? r.shortCode ?? r.id}</span>
        {(r.bidCount ?? 0) > 0 && <Badge cls="bg-ok-soft text-ok ms-auto"><Icon name="gavel" size={13} /> {r.bidCount} {L("bids", "عروض")}</Badge>}
      </div>

      {/* infostrip */}
      <div className="mb-5 grid grid-cols-2 overflow-hidden rounded-[14px] bg-gradient-to-br from-navy to-navy-deep text-white sm:grid-cols-4">
        <Info lab={L("Location", "الموقع")} val={r.projectAddressLabel ?? "—"} />
        <Info lab={L("Start", "البدء")} val={fmtVal(r.startDate, ar)} />
        <Info lab={L("Duration", "المدة")} val={r.estimatedDurationDays ? `${r.estimatedDurationDays} ${L("days", "يوم")}` : "—"} mono />
        <Info lab={L("Urgency", "الإلحاح")} val={r.urgency === "ASAP" ? L("ASAP", "فوري") : r.urgency === "SOON" ? L("Soon", "قريباً") : L("Scheduled", "مجدول")} />
      </div>

      {/* equipment */}
      <Section icon="construction" title={L("Equipment", "المعدات")}>
        {item ? <EquipmentItemCard item={item} ar={ar} L={L} /> : <p className="p-4 text-[13px] text-muted">—</p>}
      </Section>

      {/* location */}
      <Section icon="place" title={L("Project location", "موقع المشروع")}>
        <div className="flex items-center gap-2.5 p-4 text-[13.5px]">
          <Icon name="location_on" size={20} className="text-brand" />
          <span className="font-extrabold text-navy">{r.projectAddressLabel ?? "—"}</span>
          {r.projectLat != null && r.projectLng != null && (
            <span className="text-[12px] text-muted" dir="ltr">({Number(r.projectLat).toFixed(4)}, {Number(r.projectLng).toFixed(4)})</span>
          )}
        </div>
      </Section>

      {/* ALL request fields (everything from the body) */}
      <Section icon="tune" title={L("Request details", "تفاصيل الطلب")}>
        <dl className="grid grid-cols-[130px_1fr] gap-x-3 gap-y-3 p-4 text-[13.5px] sm:grid-cols-[180px_1fr]">
          {fields.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="font-semibold text-muted">{humanize(k)}</dt>
              <dd className="font-bold text-navy">{fmtVal(v, ar)}</dd>
            </div>
          ))}
        </dl>
      </Section>

      {/* actions */}
      <div className="mt-6 flex flex-wrap items-center gap-2.5 border-t border-border pt-4">
        <span className="flex-1" />
        {r.dealRoomId && (
          <button onClick={() => router.push(`/deal-room/${r.dealRoomId}`)} className="inline-flex items-center gap-1.5 rounded-[10px] border border-border bg-surface px-4 py-2.5 text-[13px] font-bold text-navy">
            <Icon name="forum" size={16} /> {L("Deal room", "غرفة الصفقة")}
          </button>
        )}
        <button
          disabled={(r.bidCount ?? 0) === 0}
          onClick={() => router.push(`/requests/${r.id}/bids`)}
          className="inline-flex items-center gap-1.5 rounded-[10px] bg-brand px-5 py-2.5 text-[13.5px] font-bold text-brand-fg disabled:opacity-50"
        >
          <Icon name="gavel" size={16} /> {L("View bids", "عرض العروض")} ({r.bidCount ?? 0})
        </button>
      </div>
    </div>
  );
}

function EquipmentItemCard({ item, ar, L }: { item: RequestItem; ar: boolean; L: (en: string, arr: string) => string }) {
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
    <div className="flex gap-3 p-4">
      <span className="grid h-10 w-10 flex-none place-items-center overflow-hidden rounded-[10px] bg-brand-soft">
        {item.subtypeImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.subtypeImageUrl} alt="" className="h-6 w-6 object-contain" />
        ) : (
          <Icon name="construction" size={20} className="text-brand" />
        )}
      </span>
      <div className="min-w-0">
        <div className="text-[14px] font-extrabold text-navy">
          {name} {item.numberOfUnits > 1 && <span className="text-muted">× {item.numberOfUnits}</span>}
        </div>
        {terms.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {terms.map(([ic, label], i) => (
              <span key={i} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface2 px-2 py-1 text-[11px] font-bold text-navy-mid">
                <Icon name={ic} size={13} className="text-muted" /> {label}
              </span>
            ))}
          </div>
        )}
        {item.additionalNotes && <p className="mt-2 text-[12.5px] text-navy-mid">{item.additionalNotes}</p>}
      </div>
    </div>
  );
}

function Badge({ cls, children }: { cls: string; children: React.ReactNode }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-extrabold ${cls}`}>{children}</span>;
}
function Info({ lab, val, mono }: { lab: string; val: string; mono?: boolean }) {
  return (
    <div className="p-4">
      <div className="text-[10.5px] font-bold uppercase tracking-wide text-white/55">{lab}</div>
      <div className={`mt-1 text-[14px] font-extrabold ${mono ? "font-mono" : ""}`}>{val}</div>
    </div>
  );
}
function Section({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="mb-2.5 flex items-center gap-2 px-0.5 text-[12px] font-extrabold uppercase tracking-wide text-navy-mid">
        <Icon name={icon} size={17} className="text-muted" /> {title}
      </div>
      <div className="overflow-hidden rounded-[14px] border border-border bg-surface">{children}</div>
    </div>
  );
}
