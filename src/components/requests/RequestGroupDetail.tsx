"use client";

import { useEffect, useState, Fragment } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/i18n";
import { fetchRequestGroup, fetchRequestDetail, cancelRequest } from "@/lib/api/client";
import { parseAddress, publicTaxonomyUrl, shortRef, statusMeta, type RequestRecord } from "@/lib/contract/requests";
import { EquipImg } from "@/components/requests/EquipImg";
import { LocationMap } from "@/components/requests/LocationMap";
import { Ditem, requestDetailRows, ConfirmCancelModal, EditRequestModal } from "@/components/requests/RequestDetail";
import { useHeaderBack } from "@/components/AppShell";
import "@/components/requests/requests-proto.css";


function fmtDate(v: string | null | undefined, ar: boolean): string {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(ar ? "ar-SA-u-ca-gregory" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
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
  // In-app Back arrow in the AppShell header → the Requests list (drill-down, not browser-back only).
  useHeaderBack(() => router.push("/requests"));
  const [records, setRecords] = useState<RequestRecord[] | null>(null);
  const [error, setError] = useState(false);
  // Group-level edit / cancel (applies to every member request in the RFQ).
  const [showEdit, setShowEdit] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey((k) => k + 1);
  const doCancel = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await Promise.all((records ?? []).map((r) => cancelRequest(r.id)));
      router.push("/requests");
    } catch { setBusy(false); setShowCancel(false); }
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        let { requests } = await fetchRequestGroup(groupId);
        // The param may be a MEMBER request id (e.g. the post-submit redirect uses a request UUID),
        // not the group id. If the group filter is empty, fetch that request, read its requestGroupId,
        // and resolve the whole group from it — so we render every item, not just one.
        if (!requests.length) {
          const one = await fetchRequestDetail(groupId);
          const gid = (one as { requestGroupId?: string | null }).requestGroupId ?? null;
          if (gid && gid !== groupId) {
            const grp = await fetchRequestGroup(gid);
            if (grp.requests.length) requests = grp.requests;
          }
        }
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
  }, [groupId, reloadKey]);

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
          {(() => { const sm = statusMeta(overall); return <span className={`stbadge ${sm.cls}`}><span className="dot" />{ar ? sm.ar : sm.en}</span>; })()}
          <span className={`typebadge ${type === "DIRECT" ? "tb-direct" : "tb-broadcast"}`}><span className="material-icons-outlined">{type === "DIRECT" ? "person" : "campaign"}</span>{type}</span>
          <span className="gx-bids"><span className="material-icons-outlined">gavel</span>{totalBids} {L("bids", "عروض")}</span>
        </div>
      </div>

      {/* group-level edit / cancel — edit applies its shared fields to every item; cancel withdraws all */}
      {(overall === "OPEN" || overall === "ACTIVE") && (
        <div className="actionbar" style={{ marginBottom: 14 }}>
          {overall === "OPEN" && totalBids === 0 && (
            <button className="btn sm" disabled={busy} onClick={() => setShowEdit(true)}><span className="material-icons-outlined">edit</span> {L("Edit request", "تعديل الطلب")}</button>
          )}
          <button className="btn sm danger" disabled={busy} onClick={() => setShowCancel(true)}><span className="material-icons-outlined">close</span> {L("Cancel request", "إلغاء الطلب")}</button>
        </div>
      )}

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
          const sm = statusMeta(rec.status);
          return (
            <div className="dcard" key={rec.id} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                <span className={`stbadge ${sm.cls}`}><span className="dot" />{ar ? sm.ar : sm.en}</span>
                <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>{rec.displayId ?? rec.shortCode ?? shortRef(rec.id)}</span>
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

      {showEdit && first && <EditRequestModal r={first} ar={ar} L={L} siblingIds={records.slice(1).map((r) => r.id)} onClose={() => setShowEdit(false)} onSaved={() => { setShowEdit(false); reload(); }} />}
      {showCancel && first && <ConfirmCancelModal ar={ar} L={L} busy={busy} idLabel={first.displayId ?? first.shortCode ?? shortRef(first.id)} onClose={() => setShowCancel(false)} onConfirm={doCancel} />}
    </div>
  );
}
