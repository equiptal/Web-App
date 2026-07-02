"use client";

import { useEffect, useState, Fragment } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/i18n";
import { fetchRequestGroup, fetchRequestDetail } from "@/lib/api/client";
import { parseAddress, publicTaxonomyUrl, type RequestRecord } from "@/lib/contract/requests";
import { EquipImg } from "@/components/requests/EquipImg";
import { LocationMap } from "@/components/requests/LocationMap";
import { Ditem, requestDetailRows } from "@/components/requests/RequestDetail";
import "@/components/requests/requests-proto.css";

const STATUS_CLS: Record<string, string> = {
  OPEN: "st-open", ACTIVE: "st-active", ACCEPTED: "st-accepted", EXPIRED: "st-expired", CLOSED: "st-closed", ABANDONED: "st-closed", MIXED: "st-mixed",
};

function fmtDate(v: string | null | undefined, ar: boolean): string {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(ar ? "ar-SA" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Multi-item group detail (web-app/multi-item-requests, T4). Renders every request in a submission
 * group on one screen: shared project info once (location, timing, preferences — identical across
 * the group) + one card per item. Reconstructs the original multi-item RFQ view from the fan-out.
 */
export function RequestGroupDetail({ groupId, onTitle }: { groupId: string; onTitle?: (t: string) => void }) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const L = (en: string, arr: string) => (ar ? arr : en);
  const router = useRouter();
  const [records, setRecords] = useState<RequestRecord[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { requests } = await fetchRequestGroup(groupId);
        // Historical/solo fallback: a request with no requestGroupId yields an empty group filter —
        // in that case treat the param as a single request id.
        const ids = requests.length ? requests.map((r) => r.id) : [groupId];
        const recs = await Promise.all(ids.map((id) => fetchRequestDetail(id)));
        if (active) setRecords(recs);
      } catch {
        if (active) setError(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [groupId]);

  const first = records?.[0];
  const loc = parseAddress(first?.projectAddressLabel ?? null);
  const title = loc.city ? (loc.neighbourhood ? `${loc.city} — ${loc.neighbourhood}` : loc.city) : (first?.projectAddressLabel ?? L("Request group", "مجموعة الطلبات"));

  useEffect(() => {
    if (first && onTitle) onTitle(title);
  }, [first, title, onTitle]);

  if (error) return <div className="rproto"><div className="rempty">{L("Couldn’t load this request.", "تعذّر تحميل هذا الطلب.")}</div></div>;
  if (!records) return <div className="rproto"><div className="rstate"><span className="material-icons-outlined" style={{ fontSize: 28 }}>progress_activity</span></div></div>;
  if (!records.length || !first) return <div className="rproto"><div className="rempty">{L("Request not found.", "الطلب غير موجود.")}</div></div>;

  const period = first.startDate ? (first.endDate ? `${fmtDate(first.startDate, ar)} – ${fmtDate(first.endDate, ar)}` : fmtDate(first.startDate, ar)) : "—";
  const statuses = [...new Set(records.map((r) => r.status))];
  const overall = statuses.length === 1 ? statuses[0] : "MIXED";
  const totalBids = records.reduce((s, r) => s + (r.bidCount ?? 0), 0);
  const type = first.type;
  const leadItem = first.equipmentItems?.[0];
  const leadUnits = leadItem?.numberOfUnits ?? 1;
  const leadBase = leadItem
    ? [ar ? leadItem.subtypeNameAr ?? leadItem.subtypeName : leadItem.subtypeName, ar ? leadItem.capacityNameAr ?? leadItem.capacityName : leadItem.capacityName].filter(Boolean).join(" · ")
      || (ar ? leadItem.categoryNameAr ?? leadItem.categoryName : leadItem.categoryName) || title
    : title;
  const leadName = leadItem ? `${leadBase} · ${leadUnits} ${leadUnits === 1 ? L("unit", "وحدة") : L("units", "وحدات")}` : title;
  const moreCount = records.length - 1;
  const totalUnits = records.reduce((s, r) => s + (r.equipmentItems?.[0]?.numberOfUnits ?? 1), 0);

  return (
    <div className="rproto" dir={ar ? "rtl" : "ltr"}>
      {/* group context strip — leads with the equipment, location in the meta line */}
      <div className="gctx">
        <span className="gx-ic">
          <EquipImg src={publicTaxonomyUrl(leadItem?.subtypeImageUrl ?? leadItem?.categoryImageUrl)} categoryId={leadItem?.categoryId ?? null} name={leadBase} box="" img="h-6 w-6 object-contain" iconSize={22} />
          {moreCount > 0 && <span className="gx-more-badge">+{moreCount}</span>}
        </span>
        <div className="gx-main">
          <div className="gx-title">{leadName}{moreCount > 0 && <span className="gx-more"> + {moreCount} {L("more", "أخرى")}</span>}<span className="gx-count">{totalUnits} {L("total equipment", "إجمالي المعدات")}</span></div>
          <div className="gx-meta">{title}{period !== "—" ? ` · ${period}` : ""}</div>
        </div>
        <div className="gx-badges">
          <span className={`stbadge ${STATUS_CLS[overall] ?? "st-mixed"}`}><span className="dot" />{overall}</span>
          <span className={`typebadge ${type === "DIRECT" ? "tb-direct" : "tb-broadcast"}`}><span className="material-icons-outlined">{type === "DIRECT" ? "person" : "campaign"}</span>{type}</span>
          <span className="gx-bids"><span className="material-icons-outlined">gavel</span>{totalBids} {L("bids", "عروض")}</span>
        </div>
      </div>

      {/* shared project location */}
      <div className="dsec">
        <div className="dsec-h"><span className="material-icons-outlined">place</span>{L("Project location", "موقع المشروع")}</div>
        <div className="dcard">
          {first.projectLat != null && first.projectLng != null && <LocationMap lat={Number(first.projectLat)} lng={Number(first.projectLng)} />}
          <div className="addr">
            <span className="material-icons-outlined pin">location_on</span>
            <span><b>{first.projectAddressLabel ?? "—"}</b></span>
          </div>
        </div>
      </div>

      {/* shared request details (identical across the group) — every stored field that has a value */}
      {(() => {
        const prefs = requestDetailRows(first, ar, L);
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

      {/* every item's FULL details inline — all on one screen (no per-item navigation) */}
      <div className="dsec">
        <div className="dsec-h"><span className="material-icons-outlined">construction</span>{L("Equipment", "المعدات")} · {records.length} {L("items", "عناصر")}</div>
        {records.map((rec) => {
          const it = rec.equipmentItems?.[0];
          const st = STATUS_CLS[rec.status] ?? "st-closed";
          return (
            <div className="dcard" key={rec.id} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                <span className={`stbadge ${st}`}><span className="dot" />{rec.status}</span>
                <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>{rec.displayId ?? rec.shortCode ?? rec.id}</span>
                {(rec.bidCount ?? 0) > 0 && (
                  <button className="btn sm" style={{ marginInlineStart: "auto" }} onClick={() => router.push(`/requests/${rec.id}?view=bids`)}>
                    <span className="material-icons-outlined">gavel</span> {L("View bids", "عرض العروض")} ({rec.bidCount})
                  </button>
                )}
              </div>
              {it ? <Ditem item={it} ar={ar} L={L} /> : <div className="notes">—</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
