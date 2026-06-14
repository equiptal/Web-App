"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/i18n";
import { fetchMyRequests } from "@/lib/api/client";
import type { RequestListItem } from "@/lib/contract/requests";
import { RequestBids } from "@/components/requests/RequestBids";
import { EquipImg } from "@/components/requests/EquipImg";
import "@/components/requests/requests-proto.css";

const STATUS: Record<string, { cls: string; en: string; ar: string }> = {
  OPEN: { cls: "st-open", en: "Open", ar: "مفتوح" },
  ACTIVE: { cls: "st-active", en: "Active", ar: "نشط" },
  ACCEPTED: { cls: "st-accepted", en: "Accepted", ar: "مقبول" },
  EXPIRED: { cls: "st-expired", en: "Expired", ar: "منتهٍ" },
  CLOSED: { cls: "st-closed", en: "Closed", ar: "مغلق" },
};
const TYPE: Record<string, { cls: string; icon: string; en: string; ar: string }> = {
  BROADCAST: { cls: "tb-broadcast", icon: "campaign", en: "Broadcast", ar: "بث" },
  DIRECT: { cls: "tb-direct", icon: "person", en: "Direct", ar: "مباشر" },
};

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
  const [seg, setSeg] = useState<"requests" | "bids">(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tab") === "bids" ? "bids" : "requests",
  );
  const [bidsReq, setBidsReq] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchMyRequests()
      .then((d) => active && setItems(d.requests))
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, []);

  const withBids = (items ?? []).filter((r) => r.bidCount > 0);
  const activeBidsReq = bidsReq ?? withBids[0]?.id ?? null;
  const totalBids = withBids.reduce((s, r) => s + r.bidCount, 0);

  return (
    <div className="rproto" dir={ar ? "rtl" : "ltr"}>
      {/* seg-tabs: My Requests / My Bids */}
      <div className="seg-tabs">
        <div className={`seg${seg === "requests" ? " on" : ""}`} onClick={() => setSeg("requests")}>
          <span className="c">{items?.length ?? "—"}</span>
          <span className="l">{L("My Requests", "طلباتي")}</span>
        </div>
        <div className={`seg${seg === "bids" ? " on" : ""}`} onClick={() => setSeg("bids")}>
          <span className="c">{totalBids}</span>
          <span className="l">{L("My Bids", "العروض الواردة")}</span>
        </div>
      </div>

      {items === null && !error && <div className="rstate"><span className="material-icons-outlined" style={{ fontSize: 28 }}>progress_activity</span></div>}
      {error && <div className="rempty">{L("Couldn’t load your requests.", "تعذّر تحميل طلباتك.")}</div>}

      {/* My Requests */}
      {seg === "requests" && items && (
        items.length === 0 ? (
          <div className="rempty">{L("No requests yet.", "لا توجد طلبات بعد.")}</div>
        ) : (
          <div>
            {items.map((r) => {
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
                        <EquipImg src={r.item?.imageUrl ?? null} categoryId={r.item?.categoryId ?? null} box="" img="" iconSize={28} />
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
                      <div className="rq-cell"><span className="ci"><span className="material-icons-outlined">location_on</span></span><span className="tx">{r.city ?? "—"}</span></div>
                      <div className="rq-cell"><span className="ci"><span className="material-icons-outlined">schedule</span></span><span className="tx">{r.rentalType ?? "—"}</span></div>
                      <div className="rq-cell"><span className="ci"><span className="material-icons-outlined">calendar_today</span></span><span className="tx">{r.durationDays ? `${r.durationDays} ${L("days", "يوم")}` : fmtDate(r.startDate, ar)}</span></div>
                      <div className="rq-cell bids"><span className="ci"><span className="material-icons-outlined">gavel</span></span><span className="tx"><b>{r.bidCount}</b> {L("bids", "عروض")}</span></div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )
      )}

      {/* My Bids */}
      {seg === "bids" && items && (
        withBids.length === 0 ? (
          <div className="rempty">{L("No bids yet.", "لا توجد عروض بعد.")}</div>
        ) : (
          <>
            <div className="req-chips">
              {withBids.map((r) => (
                <button key={r.id} className={`req-chip${activeBidsReq === r.id ? " on" : ""}`} onClick={() => setBidsReq(r.id)}>
                  {(ar ? r.item?.nameAr : r.item?.name) || r.displayId}
                </button>
              ))}
            </div>
            {activeBidsReq && <RequestBids requestId={activeBidsReq} />}
          </>
        )
      )}
    </div>
  );
}
