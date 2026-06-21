"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale } from "@/lib/i18n";
import { fetchMyRequests, fetchBids } from "@/lib/api/client";
import { groupRequests, type RequestGroup, type RequestListItem } from "@/lib/contract/requests";
import type { BidCard } from "@/lib/contract/bids";
import "@/components/dashboard/dashboard-proto.css";

const nf = (n: number) => Math.round(n).toLocaleString("en-US");
/** All-in total for a bid, matching the bid card / quotation math (rate × periods × units + mob/demob, +15% VAT). */
function grand(b: BidCard): number {
  const periods = b.duration ?? 1;
  const units = b.numberOfUnits || 1;
  const sub = (b.price ?? 0) * periods * units + (b.mobPrice ?? 0) + (b.demobPrice ?? 0);
  return Math.round(sub * 1.15);
}
function daysBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const d = (new Date(b).getTime() - new Date(a).getTime()) / 86_400_000;
  return Number.isFinite(d) && d >= 0 ? d : null;
}

type Insight = { kind: "buy" | "risk" | "gap" | "save"; tag: string; title: string; body: string };

interface Scope {
  rfqs: number;
  bidsReceived: number;
  withBids: number;
  coverage: number; // % of RFQs that got ≥1 bid
  avgBids: number;
  gmv: number; // SAR, sum of the cheapest qualifying bid per RFQ
  speed: number | null; // avg days request → first bid
  equipment: { name: string; reqs: number; units: number; bids: number; gmv: number; signal: "ok" | "neu" | "warn" | "bad"; signalEn: string; signalAr: string }[];
}

export function ProcurementDashboard() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const L = (en: string, arr: string) => (ar ? arr : en);

  const [groups, setGroups] = useState<RequestGroup[] | null>(null);
  const [bidsByReq, setBidsByReq] = useState<Record<string, BidCard[]>>({});
  const [error, setError] = useState(false);
  const [proj, setProj] = useState<string>("all"); // "all" or a group id
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    let active = true;
    fetchMyRequests()
      .then(async (d) => {
        if (!active) return;
        const gs = groupRequests(d.requests);
        setGroups(gs);
        const ids = d.requests.map((r) => r.id);
        const lists = await Promise.all(ids.map((id) => fetchBids(id).then((x) => x.bids).catch(() => [] as BidCard[])));
        if (!active) return;
        const map: Record<string, BidCard[]> = {};
        ids.forEach((id, i) => { map[id] = lists[i]; });
        setBidsByReq(map);
      })
      .catch(() => active && setError(true));
    return () => { active = false; };
  }, []);

  // The requests in the active scope (all groups, or one selected group).
  const scopeReqs = useMemo<RequestListItem[]>(() => {
    if (!groups) return [];
    const gs = proj === "all" ? groups : groups.filter((g) => g.id === proj);
    return gs.flatMap((g) => g.items);
  }, [groups, proj]);

  const scope = useMemo<Scope>(() => computeScope(scopeReqs, bidsByReq, ar), [scopeReqs, bidsByReq, ar]);
  const insights = useMemo<Insight[]>(() => buildInsights(scope, ar), [scope, ar]);

  if (error) return <div className="dashproto"><div className="dempty">{L("Couldn’t load the dashboard.", "تعذّر تحميل لوحة التحكم.")}</div></div>;
  if (!groups) return <div className="dashproto"><div className="dstate"><span className="material-icons-outlined" style={{ fontSize: 28 }}>progress_activity</span></div></div>;
  if (groups.length === 0) return <div className="dashproto"><div className="dempty">{L("No requests yet — your procurement metrics will appear here.", "لا توجد طلبات بعد — ستظهر مؤشرات المشتريات هنا.")}</div></div>;

  const covColor = scope.coverage >= 67 ? "var(--success)" : scope.coverage >= 34 ? "var(--warning)" : "var(--danger)";
  const projName = (g: RequestGroup) => g.locationLabel || g.city || L("Project", "مشروع");

  return (
    <div className="dashproto" dir={ar ? "rtl" : "ltr"}>
      {/* prototype banner */}
      <div className="dbanner">
        <span className="material-icons-outlined">science</span>
        {L("Procurement dashboard — prototype, on your real requests & bids", "لوحة المشتريات — نموذج أولي، على طلباتك وعروضك الحقيقية")}
      </div>

      {/* project tabs */}
      <div className="ptabs">
        <button className={`ptab${proj === "all" ? " on" : ""}`} onClick={() => setProj("all")}>
          <span className="material-icons-outlined">grid_view</span>{L("All projects", "كل المشاريع")}
        </button>
        {groups.map((g) => (
          <button key={g.id} className={`ptab${proj === g.id ? " on" : ""}`} onClick={() => setProj(g.id)}>
            {projName(g)}<span className="ptab-n">{g.totalBids}</span>
          </button>
        ))}
      </div>

      {/* KPIs */}
      <div className="kpis">
        <Kpi ic="ic-blue" icon="radar" label={L("Requests (RFQs)", "الطلبات")} val={nf(scope.rfqs)} hint={L("equipment requests in scope", "طلبات المعدّات في النطاق")} />
        <Kpi ic="ic-orange" icon="gavel" label={L("Bids received", "العروض الواردة")} val={nf(scope.bidsReceived)} hint={L("total supplier offers", "إجمالي عروض المؤجّرين")} />
        <Kpi ic="ic-teal" icon="insights" label={L("Avg bids / RFQ", "متوسط العروض/طلب")} val={scope.avgBids.toFixed(1)} hint={L("supply depth per request", "عمق التوريد لكل طلب")} />
        <Kpi ic="ic-green" icon="payments" label={L("Est. spend", "الإنفاق التقديري")} val={`${L("SAR", "ر.س")} ${nf(scope.gmv)}`} hint={L("cheapest qualifying bid per RFQ", "أرخص عرض مؤهّل لكل طلب")} />
        <Kpi ic="ic-amber" icon="bolt" label={L("Speed", "السرعة")} val={scope.speed != null ? scope.speed.toFixed(1) : "—"} unit={scope.speed != null ? L("days", "يوم") : undefined} hint={L("avg days: request → first bid", "متوسط الأيام: الطلب → أول عرض")} />
      </div>

      {/* analytics + coverage */}
      <div className="sec-title"><span className="material-icons-outlined">donut_small</span>{L("Analytics by equipment type", "تحليلات حسب نوع المعدّة")}</div>
      <div className="grid2">
        <div className="panel">
          <div className="panel-head"><span className="material-icons-outlined">category</span><b>{L("By equipment type — demand, spend & supply", "حسب نوع المعدّة — الطلب والإنفاق والتوريد")}</b></div>
          <div className="panel-body" style={{ padding: "4px 8px", overflowX: "auto" }}>
            {scope.equipment.length === 0 ? (
              <div className="dempty sm">{L("No equipment in scope.", "لا معدّات في النطاق.")}</div>
            ) : (
              <table className="tbl">
                <thead><tr><th>{L("Equipment", "المعدّة")}</th><th className="num">{L("RFQs", "الطلبات")}</th><th className="num">{L("Bids", "العروض")}</th><th className="num">{L("Est. spend", "الإنفاق")}</th><th>{L("Supply", "التوريد")}</th></tr></thead>
                <tbody>
                  {scope.equipment.map((e) => (
                    <tr key={e.name}>
                      <td><span className="off"><span className="material-icons-outlined" style={{ fontSize: 17, color: "var(--navy-mid)" }}>build</span>{e.name}</span></td>
                      <td className="num">{e.reqs}</td>
                      <td className="num">{e.bids}</td>
                      <td className="num">{e.gmv ? nf(e.gmv) : "—"}</td>
                      <td><span className={`tag-st ${e.signal}`}>{ar ? e.signalAr : e.signalEn}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
        <div className="panel">
          <div className="panel-head"><span className="material-icons-outlined">donut_large</span><b>{L("Bid coverage", "تغطية العروض")}</b></div>
          <div className="panel-body">
            <div className="gauge-wrap">
              <div className="gauge" style={{ background: `conic-gradient(${covColor} 0 ${scope.coverage}%, var(--surface3) ${scope.coverage}% 100%)` }}>
                <div className="gc"><b style={{ color: covColor }}>{Math.round(scope.coverage)}%</b><span>{L("got bids", "وصلتها عروض")}</span></div>
              </div>
              <div className="gauge-tx">
                <h4>{nf(scope.withBids)} {L("of", "من")} {nf(scope.rfqs)} {L("RFQs received at least one bid", "طلبات وصلها عرض واحد على الأقل")}</h4>
                <p>{L("The rest are still waiting on suppliers — chase or broaden the invite list.", "البقية ما زالت تنتظر المؤجّرين — تابع أو وسّع قائمة الدعوة.")}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* per-project scoring (all scope only) */}
      {proj === "all" && groups.length > 1 && (
        <>
          <div className="sec-title"><span className="material-icons-outlined">leaderboard</span>{L("By project", "حسب المشروع")}</div>
          <div className="panel"><div className="panel-body" style={{ padding: "4px 8px", overflowX: "auto" }}>
            <table className="tbl">
              <thead><tr><th>{L("Project", "المشروع")}</th><th className="num">{L("RFQs", "الطلبات")}</th><th className="num">{L("Bids", "العروض")}</th><th className="num">{L("Est. spend", "الإنفاق")}</th><th>{L("Coverage", "التغطية")}</th></tr></thead>
              <tbody>
                {groups.map((g) => {
                  const s = computeScope(g.items, bidsByReq, ar);
                  return (
                    <tr key={g.id} style={{ cursor: "pointer" }} onClick={() => setProj(g.id)}>
                      <td><span className="site-n">{projName(g)}</span></td>
                      <td className="num">{s.rfqs}</td>
                      <td className="num">{s.bidsReceived}</td>
                      <td className="num">{s.gmv ? nf(s.gmv) : "—"}</td>
                      <td><span className={`scorepill ${s.coverage >= 67 ? "hi" : s.coverage >= 34 ? "mid" : "lo"}`}>{Math.round(s.coverage)}%</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div></div>
        </>
      )}

      <div className="dfoot">© 2026 Moedatech · {L("Procurement dashboard · prototype", "لوحة المشتريات · نموذج أولي")}</div>

      {/* AI assistant FAB + drawer */}
      <button className="ai-fab" onClick={() => setChatOpen(true)}>
        <span className="material-icons-outlined">auto_awesome</span>{L("Ask AI", "اسأل الذكاء")}
        {insights.length > 0 && <span className="fab-badge">{insights.length}</span>}
      </button>
      {chatOpen && (
        <>
          <div className="drawer-bd" onClick={() => setChatOpen(false)} />
          <div className="drawer">
            <div className="drawer-head">
              <span className="ai-ic"><span className="material-icons-outlined">auto_awesome</span></span>
              <div className="dh-tx">
                <h3>{L("Procurement assistant", "مساعد المشتريات")}</h3>
                <p>{L(`Watching ${proj === "all" ? "all projects" : projName(groups.find((g) => g.id === proj)!)} · ${insights.length} finding${insights.length === 1 ? "" : "s"}`, `${insights.length} ملاحظة`)}</p>
              </div>
              <button className="dx" onClick={() => setChatOpen(false)}><span className="material-icons-outlined">close</span></button>
            </div>
            <div className="drawer-body">
              <div className="msg"><span className="av-m"><span className="material-icons-outlined">auto_awesome</span></span>
                <div className="bubble">{insights.length ? L("Here's what stands out on your real requests:", "إليك ما يبرز في طلباتك الحقيقية:") : L("Nothing flagged — every RFQ has healthy bid coverage.", "لا ملاحظات — كل الطلبات لها تغطية عروض جيدة.")}</div>
              </div>
              {insights.map((i, k) => (
                <div className={`ins ${i.kind}`} key={k}><span className="ins-tag">{i.tag}</span><b>{i.title}</b><p>{i.body}</p></div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ ic, icon, label, val, unit, hint }: { ic: string; icon: string; label: string; val: string; unit?: string; hint: string }) {
  return (
    <div className="kpi">
      <div className="k-top"><span className={`k-ic ${ic}`}><span className="material-icons-outlined">{icon}</span></span>{label}</div>
      <div className="k-val">{val}{unit && <small> {unit}</small>}</div>
      <div className="k-hint">{hint}</div>
    </div>
  );
}

/** Roll a scope's requests + their bids into the dashboard metrics. */
function computeScope(reqs: RequestListItem[], bidsByReq: Record<string, BidCard[]>, ar: boolean): Scope {
  const L = (en: string, arr: string) => (ar ? arr : en);
  let bidsReceived = 0, withBids = 0, gmv = 0;
  const speeds: number[] = [];
  const byEq = new Map<string, { reqs: number; units: number; bids: number; gmv: number; noBid: number; thin: number }>();

  for (const r of reqs) {
    const bids = bidsByReq[r.id] ?? [];
    bidsReceived += bids.length;
    const totals = bids.map(grand).filter((x) => x > 0);
    const cheapest = totals.length ? Math.min(...totals) : 0;
    if (bids.length > 0) { withBids += 1; gmv += cheapest; }
    // speed: request created → earliest bid submitted
    const firstBid = bids.map((b) => b.submittedAt).filter(Boolean).sort()[0] ?? null;
    const sp = daysBetween(r.createdAt, firstBid);
    if (sp != null) speeds.push(sp);
    // equipment bucket
    const name = (ar ? r.item?.nameAr : r.item?.name) || r.item?.name || L("Other", "أخرى");
    const e = byEq.get(name) ?? { reqs: 0, units: 0, bids: 0, gmv: 0, noBid: 0, thin: 0 };
    e.reqs += 1;
    e.units += r.item?.qty ?? 1;
    e.bids += bids.length;
    e.gmv += cheapest;
    if (bids.length === 0) e.noBid += 1;
    else if (bids.length < 2) e.thin += 1;
    byEq.set(name, e);
  }

  const rfqs = reqs.length;
  const equipment = [...byEq.entries()]
    .map(([name, e]) => {
      const avg = e.reqs ? e.bids / e.reqs : 0;
      let signal: Scope["equipment"][number]["signal"], signalEn: string, signalAr: string;
      if (e.noBid === e.reqs) { signal = "warn"; signalEn = "No bids yet"; signalAr = "لا عروض بعد"; }
      else if (avg < 2) { signal = "bad"; signalEn = "Single-source"; signalAr = "مصدر وحيد"; }
      else { signal = "ok"; signalEn = "Healthy"; signalAr = "جيّد"; }
      return { name, reqs: e.reqs, units: e.units, bids: e.bids, gmv: e.gmv, signal, signalEn, signalAr };
    })
    .sort((a, b) => b.gmv - a.gmv || b.reqs - a.reqs);

  return {
    rfqs,
    bidsReceived,
    withBids,
    coverage: rfqs ? (withBids / rfqs) * 100 : 0,
    avgBids: rfqs ? bidsReceived / rfqs : 0,
    gmv,
    speed: speeds.length ? speeds.reduce((s, x) => s + x, 0) / speeds.length : null,
    equipment,
  };
}

/** Derive a few procurement insights from the computed scope (real data). */
function buildInsights(scope: Scope, ar: boolean): Insight[] {
  const L = (en: string, arr: string) => (ar ? arr : en);
  const out: Insight[] = [];
  const noBids = scope.rfqs - scope.withBids;
  if (noBids > 0) {
    out.push({
      kind: "risk", tag: L("Supply risk", "مخاطر توريد"),
      title: L(`${noBids} RFQ${noBids === 1 ? "" : "s"} still have no bids`, `${noBids} طلب بلا عروض بعد`),
      body: L("Chase suppliers or broaden the invite list so these don't stall.", "تابع المؤجّرين أو وسّع قائمة الدعوة حتى لا تتعطّل."),
    });
  }
  const single = scope.equipment.filter((e) => e.signal === "bad");
  if (single.length) {
    out.push({
      kind: "gap", tag: L("Single source", "مصدر وحيد"),
      title: L(`${single.map((e) => e.name).join(", ")} — thin supply`, `${single.map((e) => e.name).join("، ")} — توريد ضعيف`),
      body: L("Fewer than 2 bids on average — add verified suppliers before you commit.", "أقل من عرضين وسطياً — أضف مؤجّرين موثّقين قبل الالتزام."),
    });
  }
  const topSpend = scope.equipment[0];
  if (topSpend && topSpend.gmv > 0) {
    out.push({
      kind: "save", tag: L("Savings", "توفير"),
      title: L(`${topSpend.name} is your biggest spend`, `${topSpend.name} أكبر بند إنفاق`),
      body: L(`Est. ${nf(topSpend.gmv)} SAR across ${topSpend.reqs} RFQ${topSpend.reqs === 1 ? "" : "s"} — compare bids to push it down.`, `تقدير ${nf(topSpend.gmv)} ر.س عبر ${topSpend.reqs} طلب — قارن العروض لخفضه.`),
    });
  }
  if (scope.speed != null && scope.speed > 3) {
    out.push({
      kind: "buy", tag: L("Speed", "السرعة"),
      title: L(`Bids take ${scope.speed.toFixed(1)} days on average`, `العروض تستغرق ${scope.speed.toFixed(1)} يوم وسطياً`),
      body: L("Slower than ideal — direct requests to known suppliers usually land faster.", "أبطأ من المثالي — الطلبات المباشرة لمؤجّرين معروفين أسرع عادةً."),
    });
  }
  return out;
}
