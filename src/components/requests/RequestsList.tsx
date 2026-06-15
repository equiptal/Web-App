"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/i18n";
import { fetchMyRequests } from "@/lib/api/client";
import { groupRequests, type RequestGroup, type RequestListItem } from "@/lib/contract/requests";
import { GroupBids } from "@/components/requests/GroupBids";
import { EquipImg } from "@/components/requests/EquipImg";
import "@/components/requests/requests-proto.css";

const STATUS: Record<string, { cls: string; en: string; ar: string }> = {
  OPEN: { cls: "st-open", en: "Open", ar: "مفتوح" },
  ACTIVE: { cls: "st-active", en: "Active", ar: "نشط" },
  ACCEPTED: { cls: "st-accepted", en: "Accepted", ar: "مقبول" },
  EXPIRED: { cls: "st-expired", en: "Expired", ar: "منتهٍ" },
  CLOSED: { cls: "st-closed", en: "Closed", ar: "مغلق" },
  MIXED: { cls: "st-mixed", en: "Mixed", ar: "متعدد" },
};
const TYPE: Record<string, { cls: string; icon: string; en: string; ar: string }> = {
  BROADCAST: { cls: "tb-broadcast", icon: "campaign", en: "Broadcast", ar: "بث" },
  DIRECT: { cls: "tb-direct", icon: "person", en: "Direct", ar: "مباشر" },
};

type L = (en: string, arr: string) => string;
type Router = ReturnType<typeof useRouter>;

function fmtDate(iso: string | null, ar: boolean): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(ar ? "ar-SA" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function RequestsList() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const L: L = (en, arr) => (ar ? arr : en);
  const router = useRouter();
  const [items, setItems] = useState<RequestListItem[] | null>(null);
  const [error, setError] = useState(false);
  // Default to "requests" on both server and first client render (avoids a hydration mismatch);
  // honor ?tab=bids after mount instead of reading window during render.
  const [seg, setSeg] = useState<"requests" | "bids">("requests");
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tab") === "bids") setSeg("bids");
  }, []);

  useEffect(() => {
    let active = true;
    fetchMyRequests()
      .then((d) => active && setItems(d.requests))
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, []);

  // Cluster the fanned-out requests into submission groups.
  const groups = groupRequests(items ?? []);
  const bidGroups = groups.filter((g) => g.totalBids > 0); // only groups with received bids
  const totalBids = groups.reduce((s, g) => s + g.totalBids, 0);

  const activeGroup = groups.find((g) => g.id === activeGroupId) ?? groups[0] ?? null;
  const activeBidGroup = bidGroups.find((g) => g.id === activeGroupId) ?? bidGroups[0] ?? null;

  return (
    <div className="rproto" dir={ar ? "rtl" : "ltr"}>
      {/* seg-tabs: My Requests / My Bids */}
      <div className="seg-tabs">
        <div className={`seg${seg === "requests" ? " on" : ""}`} onClick={() => setSeg("requests")}>
          <span className="c">{items ? groups.length : "—"}</span>
          <span className="l">{L("My Requests", "طلباتي")}</span>
        </div>
        <div className={`seg${seg === "bids" ? " on" : ""}`} onClick={() => setSeg("bids")}>
          <span className="c">{totalBids}</span>
          <span className="l">{L("My Bids", "العروض الواردة")}</span>
        </div>
      </div>

      {items === null && !error && <div className="rstate"><span className="material-icons-outlined" style={{ fontSize: 28 }}>progress_activity</span></div>}
      {error && <div className="rempty">{L("Couldn’t load your requests.", "تعذّر تحميل طلباتك.")}</div>}

      {/* My Requests — grouped by submission (requestGroupId) */}
      {seg === "requests" && items && (
        groups.length === 0 ? (
          <div className="rempty">{L("No requests yet.", "لا توجد طلبات بعد.")}</div>
        ) : (
          <div>
            <GroupChips groups={groups} activeId={activeGroup?.id ?? null} onPick={setActiveGroupId} L={L} />
            {activeGroup && (
              <>
                <GroupStrip group={activeGroup} ar={ar} L={L} router={router} />
                <div className="contentbar">
                  <span className="count">{activeGroup.items.length} {activeGroup.items.length > 1 ? L("items in this request", "عناصر في هذا الطلب") : L("item in this request", "عنصر في هذا الطلب")}</span>
                </div>
                {activeGroup.items.map((r) => {
                  const st = STATUS[r.status] ?? { cls: "st-closed", en: r.status, ar: r.status };
                  const ty = TYPE[r.type];
                  const asap = r.urgency === "ASAP";
                  const title = (ar ? r.item?.nameAr : r.item?.name) || L("Request", "طلب");
                  return (
                    <button className={`rq${asap ? " asap" : ""}`} key={r.id} onClick={() => router.push(`/requests/${r.id}`)}>
                      <span className="accent" />
                      <div className="rq-in">
                        <div className="rq-head">
                          <span className="rq-thumb">
                            <EquipImg src={r.item?.imageUrl ?? null} categoryId={r.item?.categoryId ?? null} name={ar ? r.item?.nameAr : r.item?.name} box="" img="h-9 w-9 object-contain" iconSize={28} />
                          </span>
                          <div className="rq-h">
                            <div className="rq-title">{title}{r.item && r.item.qty > 1 ? ` · ×${r.item.qty}` : ""}</div>
                            <div className="rq-created">{fmtDate(r.createdAt, ar)} · {r.displayId}</div>
                          </div>
                          <span className="material-icons-outlined rq-arrow">chevron_right</span>
                        </div>
                        <div className="rq-badges">
                          <span className={`stbadge ${st.cls}`}><span className="dot" />{ar ? st.ar : st.en}</span>
                          {ty && <span className={`typebadge ${ty.cls}`}><span className="material-icons-outlined">{ty.icon}</span>{ar ? ty.ar : ty.en}</span>}
                          {asap && <span className="asap"><span className="material-icons-outlined">flash_on</span>{L("ASAP", "فوري")}</span>}
                        </div>
                        <div className="rq-grid">
                          <div className="rq-cell"><span className="ci"><span className="material-icons-outlined">schedule</span></span><span className="tx">{r.rentalType ?? "—"}</span></div>
                          <div className="rq-cell"><span className="ci"><span className="material-icons-outlined">calendar_today</span></span><span className="tx">{r.durationDays ? `${r.durationDays} ${L("days", "يوم")}` : fmtDate(r.startDate, ar)}</span></div>
                          <div className="rq-cell bids"><span className="ci"><span className="material-icons-outlined">gavel</span></span><span className="tx"><b>{r.bidCount}</b> {L("bids", "عروض")}</span></div>
                          <div className="rq-cell"><span className="ci"><span className="material-icons-outlined">{asap ? "flash_on" : "inventory_2"}</span></span><span className="tx">{r.displayId}</span></div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </>
            )}
          </div>
        )
      )}

      {/* My Bids — grouped by submission, then filtered by supplier (Phase 2) */}
      {seg === "bids" && items && (
        bidGroups.length === 0 ? (
          <div className="rempty">{L("No bids yet.", "لا توجد عروض بعد.")}</div>
        ) : (
          <div>
            <GroupChips groups={bidGroups} activeId={activeBidGroup?.id ?? null} onPick={setActiveGroupId} L={L} />
            {activeBidGroup && (
              <>
                <GroupStrip group={activeBidGroup} ar={ar} L={L} router={router} />
                <GroupBids group={activeBidGroup} />
              </>
            )}
          </div>
        )
      )}
    </div>
  );
}

/** Level-1 location chips (one per submission group) — shared by both segments. */
function GroupChips({ groups, activeId, onPick, L }: { groups: RequestGroup[]; activeId: string | null; onPick: (id: string) => void; L: L }) {
  return (
    <div className="flevel">
      <div className="flab"><span className="material-icons-outlined">inventory_2</span>{L("Location", "الموقع")}</div>
      <div className="chips-row">
        {groups.map((gr) => (
          <button key={gr.id} className={`req-chip${gr.id === activeId ? " on" : ""}`} onClick={() => onPick(gr.id)}>
            {gr.asap && <span className="asap-dot" />}
            {gr.locationLabel} <span className="ct">{gr.items.length} {L("items", "عناصر")}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Group context strip — title, address, date, overall status/type, total bids, view-details link. */
export function GroupStrip({ group, ar, L, router }: { group: RequestGroup; ar: boolean; L: L; router: Router }) {
  const ov = STATUS[group.overallStatus] ?? { cls: "st-mixed", en: group.overallStatus, ar: group.overallStatus };
  const gty = TYPE[group.type];
  const lead = group.items[0]?.item;
  const leadBase = (ar ? lead?.nameAr : lead?.name) || group.locationLabel;
  const leadName = lead ? `${leadBase} · ${lead.qty} ${lead.qty === 1 ? L("unit", "وحدة") : L("units", "وحدات")}` : leadBase;
  const more = group.items.length - 1;
  return (
    <div className="gctx">
      <span className="gx-ic">
        <EquipImg src={lead?.imageUrl ?? null} categoryId={lead?.categoryId ?? null} name={ar ? lead?.nameAr : lead?.name} box="" img="h-6 w-6 object-contain" iconSize={22} />
        {more > 0 && <span className="gx-more-badge">+{more}</span>}
      </span>
      <div className="gx-main">
        <div className="gx-title">{leadName}{more > 0 && <span className="gx-more"> + {more} {L("more", "أخرى")}</span>}<span className="gx-count">{group.totalUnits} {L("total equipment", "إجمالي المعدات")}</span></div>
        <div className="gx-meta">{group.locationLabel}{group.createdAt ? ` · ${fmtDate(group.createdAt, ar)}` : ""}</div>
        <button className="gx-link" onClick={() => router.push(`/requests/group/${encodeURIComponent(group.id)}`)}>
          <span className="material-icons-outlined">description</span>{L("View full request details", "عرض تفاصيل الطلب كاملة")}<span className="material-icons-outlined">open_in_new</span>
        </button>
      </div>
      <div className="gx-badges">
        {group.asap && <span className="asap"><span className="material-icons-outlined">flash_on</span>{L("ASAP", "فوري")}</span>}
        <span className={`stbadge ${ov.cls}`}><span className="dot" />{ar ? ov.ar : ov.en}</span>
        {gty && <span className={`typebadge ${gty.cls}`}><span className="material-icons-outlined">{gty.icon}</span>{ar ? gty.ar : gty.en}</span>}
        <span className="gx-bids"><span className="material-icons-outlined">gavel</span>{group.totalBids} {L("bids", "عروض")}</span>
      </div>
    </div>
  );
}
