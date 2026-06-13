"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/i18n";
import { fetchMyRequests } from "@/lib/api/client";
import type { RequestListItem } from "@/lib/contract/requests";
import { Icon } from "@/components/ui";

/** Status → badge palette (app tokens), mirroring the prototype's st-* classes. */
const STATUS: Record<string, { cls: string; en: string; ar: string }> = {
  OPEN: { cls: "bg-info-soft text-info", en: "Open", ar: "مفتوح" },
  ACTIVE: { cls: "bg-ok-soft text-ok", en: "Active", ar: "نشط" },
  ACCEPTED: { cls: "bg-ok-soft text-ok", en: "Accepted", ar: "مقبول" },
  EXPIRED: { cls: "bg-warn-soft text-warn", en: "Expired", ar: "منتهٍ" },
  CLOSED: { cls: "bg-surface2 text-muted", en: "Closed", ar: "مغلق" },
};
const TYPE: Record<string, { icon: string; en: string; ar: string }> = {
  BROADCAST: { icon: "campaign", en: "Broadcast", ar: "بث" },
  DIRECT: { icon: "person", en: "Direct", ar: "مباشر" },
};
const FILTERS = ["ALL", "OPEN", "ACTIVE", "ACCEPTED", "CLOSED"] as const;

function fmtDate(iso: string | null, ar: boolean): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(ar ? "ar-SA" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function RequestsList() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const L = (en: string, arr: string) => (ar ? arr : en);
  const router = useRouter();
  const [items, setItems] = useState<RequestListItem[] | null>(null);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("ALL");

  useEffect(() => {
    let active = true;
    setItems(null);
    setError(false);
    fetchMyRequests(filter === "ALL" ? undefined : { status: filter })
      .then((d) => active && setItems(d.requests))
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, [filter]);

  return (
    <div className="mx-auto w-full max-w-[1060px]">
      {/* Filter chips */}
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full border px-4 py-2 text-[12.5px] font-bold transition ${
              filter === f ? "border-navy bg-navy text-white" : "border-border bg-surface text-navy-mid hover:border-navy-mid"
            }`}
          >
            {f === "ALL" ? L("All", "الكل") : STATUS[f]?.[ar ? "ar" : "en"] ?? f}
          </button>
        ))}
      </div>

      {items === null && !error && (
        <div className="grid place-items-center py-16 text-muted">
          <Icon name="progress_activity" size={28} className="animate-spin" />
        </div>
      )}
      {error && (
        <div className="rounded-[14px] border border-border bg-surface p-8 text-center">
          <p className="text-[14px] font-semibold text-navy">{L("Couldn’t load your requests.", "تعذّر تحميل طلباتك.")}</p>
          <button onClick={() => setFilter((f) => f)} className="mt-3 rounded-lg border border-border px-4 py-2 text-[13px] font-bold text-navy-mid">
            {L("Retry", "إعادة المحاولة")}
          </button>
        </div>
      )}
      {items?.length === 0 && !error && (
        <div className="rounded-[14px] border border-dashed border-border bg-surface2/40 p-10 text-center text-[13.5px] text-muted">
          {L("No requests yet.", "لا توجد طلبات بعد.")}
        </div>
      )}

      <div className="flex flex-col gap-3">
        {items?.map((r) => {
          const st = STATUS[r.status] ?? { cls: "bg-surface2 text-muted", en: r.status, ar: r.status };
          const ty = TYPE[r.type];
          const asap = r.urgency === "ASAP";
          const title = (ar ? r.item?.nameAr : r.item?.name) || L("Request", "طلب");
          return (
            <button
              key={r.id}
              onClick={() => router.push(`/requests/${r.id}`)}
              className="relative overflow-hidden rounded-[14px] border border-border bg-surface text-start transition hover:-translate-y-px hover:shadow-[0_8px_20px_rgba(28,53,80,.06)]"
            >
              <span className={`absolute inset-y-0 start-0 w-1 ${asap ? "bg-gradient-to-b from-danger to-warn" : "bg-gradient-to-b from-navy to-navy-mid"}`} />
              <div className="py-4 pe-4 ps-5">
                <div className="flex items-start gap-3.5">
                  <span className="grid h-[54px] w-[54px] flex-none place-items-center overflow-hidden rounded-xl border border-border bg-surface2">
                    {r.item?.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.item.imageUrl} alt="" className="h-8 w-8 object-contain" />
                    ) : (
                      <Icon name="construction" size={26} className="text-muted" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15.5px] font-extrabold text-navy">
                      {title} {r.item && r.item.qty > 1 && <span className="text-muted">× {r.item.qty}</span>}
                    </div>
                    <div className="mt-0.5 text-[11.5px] font-semibold text-muted">
                      {fmtDate(r.createdAt, ar)} · {r.displayId}
                    </div>
                  </div>
                  <Icon name="chevron_right" size={20} className="text-muted/60 rtl:scale-x-[-1]" />
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-extrabold ${st.cls}`}>
                    <span className="h-1.5 w-1.5 rounded-full bg-current" /> {ar ? st.ar : st.en}
                  </span>
                  {ty && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-surface2 px-2.5 py-1 text-[11px] font-extrabold text-navy-mid">
                      <Icon name={ty.icon} size={13} /> {ar ? ty.ar : ty.en}
                    </span>
                  )}
                  {asap && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-danger-soft px-2.5 py-1 text-[11px] font-extrabold text-danger">
                      <Icon name="flash_on" size={13} /> {L("ASAP", "فوري")}
                    </span>
                  )}
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2.5 border-t border-line pt-3 sm:grid-cols-2">
                  <Cell icon="location_on">{r.city ?? "—"}</Cell>
                  <Cell icon="schedule">{r.rentalType ?? "—"}</Cell>
                  <Cell icon="calendar_today">{r.durationDays ? `${r.durationDays} ${L("days", "يوم")}` : fmtDate(r.startDate, ar)}</Cell>
                  <Cell icon="gavel" accent>
                    <b className="font-extrabold text-ok">{r.bidCount}</b> {L("bids", "عروض")}
                  </Cell>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Cell({ icon, accent, children }: { icon: string; accent?: boolean; children: React.ReactNode }) {
  return (
    <span className="flex min-w-0 items-center gap-2 text-[12.5px] font-semibold text-navy-mid">
      <span className={`grid h-7 w-7 flex-none place-items-center rounded-lg ${accent ? "bg-ok-soft text-ok" : "bg-brand-soft text-brand"}`}>
        <Icon name={icon} size={16} />
      </span>
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}
