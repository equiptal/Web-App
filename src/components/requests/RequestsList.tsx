"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/i18n";
import { fetchMyRequests, fetchRequestSubmissions, fetchBids, bidShareUrl, setBidDeadline, setShareLinkLogo, cancelRequest } from "@/lib/api/client";
import { groupRequests, cappedFilled, shortRef, cancellableItems, isCancellable, statusSummary, representativeStatus, cancelBlockedReason, type RequestGroup, type RequestListItem } from "@/lib/contract/requests";
import { ConfirmCancelModal, type CancelScope } from "@/components/requests/RequestDetail";
import { GroupBids } from "@/components/requests/GroupBids";
import { useHeaderBack } from "@/components/AppShell";
import { ShareForBidsSheet } from "@/components/requests/ShareForBidsSheet";
import { EquipImg } from "@/components/requests/EquipImg";
import "@/components/requests/requests-proto.css";

type L = (en: string, arr: string) => string;
type Router = ReturnType<typeof useRouter>;

function fmtDate(iso: string | null, ar: boolean): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(ar ? "ar-SA-u-ca-gregory" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
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
  const [bidsItemId, setBidsItemId] = useState<string | null>(null); // which item the bids view is scoped to (null = all)
  // Show a Back arrow in the AppShell top bar (beside "My Requests") while viewing bids.
  const goRequests = useCallback(() => setSeg("requests"), []);
  useHeaderBack(seg === "bids" ? goRequests : null);
  // web-app/006 — off-platform shared-link bids per group (keyed by group id). Fetched up front so My
  // Bids lists a group whose ONLY bid came through the link (those don't count toward on-platform totalBids).
  const [linkBids, setLinkBids] = useState<Record<string, number>>({});
  // RFQ group short code (RFQ-NNNNN) per group id — from the agents bid-submissions `groupRef`. Shown
  // in the RFQ tabs + header alongside the location. Falls back to the first item's REQ id when absent.
  const [groupRefs, setGroupRefs] = useState<Record<string, string>>({});
  // Off-platform bid count per individual request (requestId → count) so a request card's "N bids"
  // includes shared-link bids, not just on-platform ones.
  const [linkByRequest, setLinkByRequest] = useState<Record<string, number>>({});
  // Fulfillment: off-platform covered units per request (from submissions) + the combined filled count
  // per request item (on-platform offered units + off-platform), computed for the active RFQ.
  const [offUnitsByRequest, setOffUnitsByRequest] = useState<Record<string, number>>({});
  const [filledByItem, setFilledByItem] = useState<Record<string, number>>({});
  // Cancel from the RFQ chip (`item: null` → every cancellable member) or from one item card (that item
  // only). We send exactly the OPEN/ACTIVE members, because the backend rejects anything else — batching a
  // blocked sibling in (an accepted item, say) used to fail the whole cancel and strand the open lines.
  const [cancelTarget, setCancelTarget] = useState<{ group: RequestGroup; item: RequestListItem | null } | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  // Which greyed-out ✕ the renter tapped, so the card can say why it's disabled (a title tooltip can't, on touch).
  const [blockedItem, setBlockedItem] = useState<string | null>(null);
  const closeCancel = () => { setCancelTarget(null); setCancelBusy(false); setCancelError(null); };
  const doCancel = async () => {
    if (!cancelTarget || cancelBusy) return;
    const targets = cancelTarget.item ? [cancelTarget.item] : cancellableItems(cancelTarget.group.items);
    if (!targets.length) return closeCancel();
    setCancelBusy(true);
    setCancelError(null);
    // allSettled, not all: one rejection must not discard the outcome of the siblings that succeeded.
    const results = await Promise.allSettled(targets.map((t) => cancelRequest(t.id)));
    const failed = results.filter((r) => r.status === "rejected").length;
    // Refresh either way — a partial batch has already changed server state, so the list must show it.
    try {
      const d = await fetchMyRequests();
      setItems(d.requests);
    } catch { /* keep the stale list rather than blanking the screen */ }
    setCancelBusy(false);
    if (failed === 0) {
      closeCancel();
    } else {
      setCancelError(failed === targets.length
        ? L("Couldn’t cancel. Please try again.", "تعذّر الإلغاء. الرجاء المحاولة مرة أخرى.")
        : L(`${targets.length - failed} of ${targets.length} items were withdrawn. ${failed} couldn’t be cancelled.`, `تم سحب ${targets.length - failed} من ${targets.length} بنود. تعذّر إلغاء ${failed}.`));
    }
  };

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

  // Once requests load, fetch each group's off-platform submission count. Only broadcast groups carry a
  // shared link, so limit the fan-out to those. Best-effort — a failure just leaves the count at 0.
  useEffect(() => {
    if (!items) return;
    let active = true;
    const targets = groupRequests(items).filter((g) => g.type !== "DIRECT");
    Promise.all(
      targets.map((g) =>
        fetchRequestSubmissions(g.id)
          .then((r) => ({ gid: g.id, count: r.submittedCount, subs: r.submissions, gref: r.groupRef as string | null }))
          .catch(() => ({ gid: g.id, count: 0, subs: [] as Awaited<ReturnType<typeof fetchRequestSubmissions>>["submissions"], gref: null as string | null })),
      ),
    ).then((res) => {
      if (!active) return;
      const gmap: Record<string, number> = {};
      const rmap: Record<string, number> = {};
      const umap: Record<string, number> = {}; // off-platform covered units per request
      const grmap: Record<string, string> = {};
      for (const { gid, count, subs, gref } of res) {
        if (count > 0) gmap[gid] = count;
        if (gref) grmap[gid] = gref;
        // Each submission item carries its parent requestId → count submissions + sum covered units.
        for (const s of subs) for (const it of s.items) if (it.requestId) {
          rmap[it.requestId] = (rmap[it.requestId] ?? 0) + 1;
          // Partial bid: count the units the supplier actually OFFERED on this line, not the requested
          // count — so a shared-link bid on a subset (e.g. 1 of 3) fills 1/3, not 3/3.
          umap[it.requestId] = (umap[it.requestId] ?? 0) + (it.offeredUnits ?? it.numberOfUnits ?? 1);
        }
      }
      setLinkBids(gmap);
      setLinkByRequest(rmap);
      setOffUnitsByRequest(umap);
      setGroupRefs(grmap);
    });
    return () => { active = false; };
  }, [items]);

  // Cluster the fanned-out requests into submission groups (Airport project pinned first).
  // Order request-group tabs by date, latest first (newest request appears first).
  const groups = [...groupRequests(items ?? [])].sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return tb - ta;
  });
  const linkCountOf = (g: RequestGroup) => linkBids[g.id] ?? 0;
  // Show a group in My Bids if it received an on-platform bid OR an off-platform shared-link bid.
  const bidGroups = groups.filter((g) => g.totalBids > 0 || linkCountOf(g) > 0);

  const activeGroup = groups.find((g) => g.id === activeGroupId) ?? groups[0] ?? null;
  const activeBidGroup = bidGroups.find((g) => g.id === activeGroupId) ?? bidGroups[0] ?? null;

  // Fulfillment for the ACTIVE RFQ only: fetch each item's bids, sum the suppliers' offered units,
  // add off-platform covered units, cap at the units the line needs → "X / total" per equipment line.
  const activeId = activeGroup?.id ?? null;
  useEffect(() => {
    const g = groups.find((x) => x.id === activeId) ?? null;
    if (!g) return;
    let active = true;
    Promise.all(
      g.items.map((it) =>
        fetchBids(it.id)
          .then((d) => ({ id: it.id, on: d.bids.reduce((s, b) => s + (b.unitsOffered || 0), 0) }))
          .catch(() => ({ id: it.id, on: 0 })),
      ),
    ).then((res) => {
      if (!active) return;
      const map: Record<string, number> = {};
      for (const it of g.items) {
        const on = res.find((r) => r.id === it.id)?.on ?? 0;
        const needed = it.item?.qty ?? 1;
        map[it.id] = cappedFilled(needed, on, offUnitsByRequest[it.id] ?? 0);
      }
      setFilledByItem(map);
    });
    return () => { active = false; };
  }, [activeId, offUnitsByRequest]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="rproto" dir={ar ? "rtl" : "ltr"}>
      {items === null && !error && <div className="rstate"><span className="material-icons-outlined" style={{ fontSize: 28 }}>progress_activity</span></div>}
      {error && <div className="rempty">{L("Couldn’t load your requests.", "تعذّر تحميل طلباتك.")}</div>}

      {/* My Requests — grouped by submission (requestGroupId) */}
      {seg === "requests" && items && (
        groups.length === 0 ? (
          <div className="rempty">{L("No requests yet.", "لا توجد طلبات بعد.")}</div>
        ) : (
          <div>
            <GroupChips groups={groups} activeId={activeGroup?.id ?? null} onPick={setActiveGroupId} L={L} ar={ar} groupRefs={groupRefs} onCancel={(gr) => setCancelTarget({ group: gr, item: null })} />
            {activeGroup && (
              <>
                <GroupStrip group={activeGroup} ar={ar} L={L} router={router} filledByItem={filledByItem} />
                {/* items bar */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, margin: "2px 0 14px" }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: "#1c3550" }}>{L(`${activeGroup.items.length} items in this request`, `${activeGroup.items.length} بنود في هذا الطلب`)}</span>
                  <button onClick={() => { setBidsItemId(null); setSeg("bids"); setActiveGroupId(activeGroup.id); }} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 12, border: "none", background: "#1c3550", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer", flexShrink: 0 }}>
                    <span className="material-icons-outlined" style={{ fontSize: 17 }}>compare_arrows</span>{L("View all bids for all items", "عرض كل العروض لكل البنود")} <span style={{ fontSize: 12, fontWeight: 800, background: "rgba(255,255,255,.16)", color: "#FBBF6B", padding: "1px 8px", borderRadius: 20 }}>{activeGroup.totalBids + linkCountOf(activeGroup)}</span>
                  </button>
                </div>
                {/* 2-column item cards */}
                <div className="rq-item-grid">
                  {activeGroup.items.map((r) => {
                    const title = (ar ? r.item?.nameAr : r.item?.name) || L("Request", "طلب");
                    const qty = r.item?.qty ?? 1;
                    const filled = filledByItem[r.id] ?? 0;
                    const p = qty ? Math.round((filled / qty) * 100) : 0;
                    const bc = p >= 50 ? "#1daf58" : p > 0 ? "#f79009" : "#d9362a";
                    const bidN = r.bidCount + (linkByRequest[r.id] ?? 0);
                    const basis = r.rentalType ? r.rentalType.charAt(0) + r.rentalType.slice(1).toLowerCase() : null;
                    return (
                      <div key={r.id} style={{ background: "#fff", border: "1px solid #d4e0ec", borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 2px rgba(20,40,70,.04)" }}>
                        <div style={{ height: 4, background: "#f79009" }} />
                        <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                          <div style={{ width: 50, height: 50, borderRadius: 13, background: "#eff4f9", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <EquipImg src={r.item?.imageUrl ?? null} categoryId={r.item?.categoryId ?? null} name={title} box="" img="h-8 w-8 object-contain" iconSize={32} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                              <span style={{ fontSize: 14, fontWeight: 900, color: "#1c3550", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</span>
                              {qty > 1 && <span style={{ fontSize: 12, fontWeight: 800, color: "#d4780a", background: "#fff3e0", padding: "1px 8px", borderRadius: 20, flexShrink: 0 }}>×{qty}</span>}
                            </div>
                            {basis && <div style={{ fontSize: 13, color: "#6b8fa8", fontWeight: 600, marginTop: 2 }}>{basis}</div>}
                          </div>
                          <div style={{ width: 120, flexShrink: 0 }}>
                            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 6, marginBottom: 4 }}>
                              <span style={{ fontSize: 13, fontWeight: 900, color: bc }}>{filled}/{qty}</span>
                              <span style={{ fontSize: 11, color: "#6b8fa8", fontWeight: 700 }}>{L("fulfilled", "موردة")}</span>
                            </div>
                            <div style={{ height: 7, borderRadius: 6, background: "#E4EAF1", overflow: "hidden" }}>
                              <div style={{ height: "100%", borderRadius: 6, background: bc, width: `${Math.min(100, p)}%` }} />
                            </div>
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 16px", background: "#F8FAFC", borderTop: "1px solid #EFF2F6" }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: "#2a4f72" }}><b style={{ color: bidN > 0 ? "#f79009" : "#9AA7B8", fontWeight: 900 }}>{bidN}</b> {L("total bids", "إجمالي العروض")}</span>
                          <span style={{ flex: 1 }} />
                          <span style={{ fontSize: 12, fontWeight: 700, color: "#6b8fa8" }}>{r.displayId}</span>
                          {/* Per-item cancel. Always rendered — greyed out rather than removed — so a card
                              without it never reads as broken, and a tap explains why it's unavailable. */}
                          {(() => {
                            const can = isCancellable(r.status);
                            const label = can ? L("Cancel item", "إلغاء البند") : cancelBlockedReason(r.status, ar);
                            const act = () => (can ? setCancelTarget({ group: activeGroup, item: r }) : setBlockedItem((p) => (p === r.id ? null : r.id)));
                            return (
                              <span role="button" tabIndex={0} aria-disabled={!can} title={label} aria-label={label}
                                onClick={act} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); act(); } }}
                                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: "50%", flexShrink: 0, cursor: "pointer", color: can ? "#9AA7B8" : "#C3CDD9", background: can ? "#eef2f7" : "transparent", border: can ? "none" : "1px solid #E4EAF1" }}>
                                <span className="material-icons-outlined" style={{ fontSize: 15 }}>close</span>
                              </span>
                            );
                          })()}
                        </div>
                        {blockedItem === r.id && !isCancellable(r.status) && (
                          <div style={{ padding: "8px 16px", background: "#FFF7ED", borderTop: "1px solid #FDE8CC", fontSize: 12, fontWeight: 700, lineHeight: 1.5, color: "#92400e" }}>{cancelBlockedReason(r.status, ar)}</div>
                        )}
                        <div style={{ display: "flex", gap: 11, padding: "12px 16px", borderTop: "1px solid #eff4f9" }}>
                          <button onClick={() => router.push(`/requests/group/${encodeURIComponent(activeGroup.id)}`)} style={{ flex: 1, padding: "11px", borderRadius: 11, border: "1px solid #d4e0ec", background: "#fff", color: "#1c3550", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>{L("View Details", "عرض التفاصيل")}</button>
                          <button onClick={() => { setBidsItemId(r.id); setSeg("bids"); setActiveGroupId(activeGroup.id); }} style={{ flex: 1, padding: "11px", borderRadius: 11, border: "none", background: "#1c3550", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>{L("View Bids", "عرض العروض")} ({bidN})</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )
      )}

      {cancelTarget && (() => {
        const gr = cancelTarget.group;
        const rfqLabel = gr.groupRef ?? groupRefs[gr.id] ?? gr.items[0]?.displayId ?? shortRef(gr.id);
        const canc = cancellableItems(gr.items);
        const scope: CancelScope = cancelTarget.item
          ? { kind: "item", idLabel: cancelTarget.item.displayId, itemLabel: (ar ? cancelTarget.item.item?.nameAr : cancelTarget.item.item?.name) || L("This item", "هذا البند"), others: gr.items.length - 1 }
          : canc.length === gr.items.length
            ? { kind: "all", idLabel: rfqLabel, total: gr.items.length }
            : { kind: "remaining", idLabel: rfqLabel, total: gr.items.length, count: canc.length };
        return <ConfirmCancelModal ar={ar} L={L} busy={cancelBusy} scope={scope} error={cancelError} onClose={closeCancel} onConfirm={doCancel} />;
      })()}

      {/* My Bids — grouped by submission, then filtered by supplier (Phase 2) */}
      {seg === "bids" && items && (
        bidGroups.length === 0 ? (
          <div className="rempty">{L("No bids yet.", "لا توجد عروض بعد.")}</div>
        ) : (
          <div>
            <GroupChips groups={bidGroups} activeId={activeBidGroup?.id ?? null} onPick={(id) => { setActiveGroupId(id); setBidsItemId(null); }} L={L} ar={ar} groupRefs={groupRefs} onCancel={(gr) => setCancelTarget({ group: gr, item: null })} />
            {activeBidGroup && (
              <>
                <GroupStrip group={activeBidGroup} ar={ar} L={L} router={router} filledByItem={filledByItem} />
                {/* web-app/007 AC-02 — Compare is now per-bid: select cards → the Compare bar in GroupBids. */}
                <GroupBids group={activeBidGroup} initialItemId={bidsItemId} />
              </>
            )}
          </div>
        )
      )}
    </div>
  );
}

/** Level-1 location chips (one per submission group) — shared by both segments. */
function GroupChips({ groups, activeId, onPick, L, ar, groupRefs, onCancel }: { groups: RequestGroup[]; activeId: string | null; onPick: (id: string) => void; L: L; ar: boolean; groupRefs: Record<string, string>; onCancel: (gr: RequestGroup) => void }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".09em", color: "#6b8fa8", marginBottom: 9 }}>{L("REQUESTS FOR QUOTE", "طلبات التسعير")}</div>
      <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 6 }}>
        {groups.map((gr) => {
          const on = gr.id === activeId;
          // The ✕ is offered whenever ANY member is still cancellable — not when the whole RFQ shares one
          // status. A part-accepted RFQ still has open lines the renter is entitled to withdraw.
          const canc = cancellableItems(gr.items);
          const xTitle = canc.length === gr.items.length
            ? L("Cancel request", "إلغاء الطلب")
            : L(`Cancel remaining items (${canc.length})`, `إلغاء البنود المتبقية (${canc.length})`);
          return (
            <button key={gr.id} onClick={() => onPick(gr.id)} style={{ flexShrink: 0, textAlign: "start", minWidth: 180, padding: "11px 15px", borderRadius: 14, cursor: "pointer", background: on ? "#1c3550" : "#fff", border: `1px solid ${on ? "#1c3550" : "#d4e0ec"}` }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 900, color: on ? "#fff" : "#1c3550" }}>{gr.groupRef ?? groupRefs[gr.id] ?? gr.items[0]?.displayId ?? shortRef(gr.id)}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                  {(() => {
                    // One label for the whole RFQ: the shared status when the items agree, else the split
                    // ("Open (2) · Accepted (1)"). The dot follows whichever status is still actionable.
                    const rep = representativeStatus(gr.items);
                    const dot = rep && ["OPEN", "ACTIVE", "ACCEPTED"].includes(rep) ? "#1daf58" : rep === "PARTIALLY_ACCEPTED" ? "#f79009" : rep && ["EXPIRED", "FORCE_EXPIRED"].includes(rep) ? "#d9362a" : "#9AA7B8";
                    return <span style={{ display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap", fontSize: 11, fontWeight: 800, padding: "2px 9px", borderRadius: 20, background: on ? "rgba(255,255,255,.16)" : "#eff4f9", color: on ? "#fff" : "#2a4f72" }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: dot }} />{statusSummary(gr.items, ar)}</span>;
                  })()}
                  {canc.length > 0 && (
                    <span role="button" tabIndex={0} title={xTitle} aria-label={xTitle} onClick={(e) => { e.stopPropagation(); onCancel(gr); }} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); onCancel(gr); } }} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, borderRadius: "50%", cursor: "pointer", color: on ? "rgba(255,255,255,.8)" : "#9AA7B8", background: on ? "rgba(255,255,255,.12)" : "#eef2f7" }}><span className="material-icons-outlined" style={{ fontSize: 15 }}>close</span></span>
                  )}
                </span>
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: on ? "#C7D4E5" : "#6b8fa8", marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 165 }}>{gr.locationLabel}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Group context strip — prototype-exact navy header: left = request info + share link + stats,
 *  right = a fulfillment-tracking panel (one tile per equipment line, color-coded by coverage). */
export function GroupStrip({ group, ar, L, router, filledByItem = {} }: { group: RequestGroup; ar: boolean; L: L; router: Router; filledByItem?: Record<string, number> }) {
  const ovLabel = statusSummary(group.items, ar);
  const [ffExpanded, setFfExpanded] = useState(false);
  const barColor = (p: number) => (p >= 50 ? "#1daf58" : p > 0 ? "#FBBF6B" : "#F87171");
  // web-app/006 — shared-link tracker for this group (copy link + opened/submitted, keyed by group id).
  const [link, setLink] = useState<{ openedCount: number; submittedCount: number; renterName: string | null; bidDeadline: string | null; logoUrl: string | null; groupRef: string | null } | null>(null);
  // Share + deadline both happen in the shared sheet (same UI as the post-submit confirmation).
  const [shareOpen, setShareOpen] = useState(false);
  const saveDeadline = (iso: string | null) => {
    setBidDeadline(group.id, iso).then(() => setLink((p) => (p ? { ...p, bidDeadline: iso } : p))).catch(() => {});
  };
  const saveLogo = (url: string | null) => {
    setShareLinkLogo(group.id, url).then(() => setLink((p) => (p ? { ...p, logoUrl: url } : p))).catch(() => {});
  };
  useEffect(() => {
    let active = true;
    fetchRequestSubmissions(group.id).then((r) => active && setLink(r)).catch(() => {});
    return () => { active = false; };
  }, [group.id]);
  // Built from `bidShareUrl`, never from `window.location`: the link points at the supplier OS.
  const shareUrl = bidShareUrl(group.id);
  const isBroadcast = group.type !== "DIRECT";
  const ffItems = [...group.items].sort((a, b) => (b.item?.qty ?? 1) - (a.item?.qty ?? 1));
  const ffShown = ffExpanded ? ffItems : ffItems.slice(0, 4);
  return (
    <div style={{ background: "linear-gradient(135deg,#1c3550 0%,#12263a 100%)", borderRadius: 20, padding: "14px 20px", color: "#fff", margin: "12px 0 16px", boxShadow: "0 12px 32px rgba(19,35,60,.18)" }}>
      <div style={{ display: "flex", gap: 24, alignItems: "stretch", flexWrap: "wrap" }}>
        {/* LEFT — request info + share link + stats */}
        <div style={{ flex: "1 1 280px", minWidth: 210, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <span style={{ flex: "0 1 auto", minWidth: 0, fontSize: 18, fontWeight: 900, lineHeight: 1.25, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={group.locationLabel}>{group.locationLabel}</span>
            <span style={{ flexShrink: 0, whiteSpace: "nowrap", fontSize: 11, fontWeight: 800, padding: "3px 10px", borderRadius: 20, background: "rgba(29,175,88,.16)", color: "#7CE5A6" }}>● {ovLabel}</span>
            {isBroadcast && <span style={{ flexShrink: 0, whiteSpace: "nowrap", fontSize: 11, fontWeight: 800, padding: "3px 10px", borderRadius: 20, background: "rgba(255,255,255,.10)", color: "#C7D4E5" }}>📣 {L("Broadcast", "بثّ")}</span>}
          </div>
          <div style={{ fontSize: 13, color: "#9DAFC6", marginTop: 5, fontWeight: 600 }}>{group.groupRef ?? link?.groupRef ?? group.items[0]?.displayId ?? shortRef(group.id)}{group.createdAt ? ` · ${fmtDate(group.createdAt, ar)}` : ""}</div>
          <button onClick={() => router.push(`/requests/group/${encodeURIComponent(group.id)}`)} style={{ display: "inline-flex", alignItems: "center", gap: 6, alignSelf: "flex-start", marginTop: 8, padding: "6px 12px", borderRadius: 9, border: "1px solid rgba(255,255,255,.18)", background: "rgba(255,255,255,.06)", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>{L("View full request details", "عرض تفاصيل الطلب كاملة")} <span className="material-icons-outlined" style={{ fontSize: 15 }}>open_in_new</span></button>
          {isBroadcast && (
            <div style={{ marginTop: "auto", paddingTop: 11, borderTop: "1px solid rgba(255,255,255,.12)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 11, flexWrap: "wrap" }}>
                <span className="material-icons-outlined" style={{ fontSize: 17, color: "#FBBF6B" }}>link</span>
                <span style={{ flex: 1, minWidth: 120, fontSize: 13, fontWeight: 800, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{shareUrl}</span>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <button onClick={() => setShareOpen(true)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 10, border: "none", background: "#f79009", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer" }}><span className="material-icons-outlined" style={{ fontSize: 16 }}>ios_share</span>{L("Share", "مشاركة")}</button>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", fontSize: 12.5, fontWeight: 800, color: "#E3ECF6", marginTop: 9 }}>
                <span><span className="material-icons-outlined" style={{ fontSize: 14, verticalAlign: "-2px" }}>visibility</span> <b style={{ color: "#C7D4E5" }}>{link?.openedCount ?? 0}</b> {L("opened", "فتحة")}</span>
                <span><span className="material-icons-outlined" style={{ fontSize: 14, verticalAlign: "-2px" }}>inbox</span> <b style={{ color: "#FBBF6B" }}>{link?.submittedCount ?? 0}</b> {L("submitted", "عرض")}</span>
                <span><span className="material-icons-outlined" style={{ fontSize: 14, verticalAlign: "-2px" }}>schedule</span> {L("Closes", "يُغلق")} <b style={{ color: "#fff" }}>{link?.bidDeadline ? new Date(link.bidDeadline).toLocaleString(ar ? "ar-SA-u-ca-gregory" : "en-GB", { dateStyle: "medium", timeStyle: "short" }) : L("—", "—")}</b></span>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT — fulfillment tracking */}
        <div style={{ flex: "1 1 360px", minWidth: 210, maxWidth: 460, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.10)", borderRadius: 16, padding: "11px 13px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 9 }}>
            <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".07em", color: "#8FA2BC" }}>{L("FULFILLMENT TRACKING", "متابعة التوريد")}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span style={{ fontSize: 13, fontWeight: 900, color: "#FBBF6B", whiteSpace: "nowrap" }}>{group.totalBids + (link?.submittedCount ?? 0)} {L("bids", "عرض")}</span>
              {group.items.length > 4 && <button onClick={() => setFfExpanded((v) => !v)} style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, fontWeight: 800, color: "#FBBF6B", background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)", padding: "5px 10px", borderRadius: 8, cursor: "pointer", whiteSpace: "nowrap" }}>{ffExpanded ? L("Show less", "أقل") : L(`View all ${group.items.length} items`, `عرض كل ${group.items.length} بند`)}<span className="material-icons-outlined" style={{ fontSize: 14 }}>{ffExpanded ? "expand_less" : "expand_more"}</span></button>}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: ffItems.length <= 2 ? "1fr" : "repeat(2,1fr)", gap: 7 }}>
            {ffShown.map((it) => {
              const needed = it.item?.qty ?? 1, fl = filledByItem[it.id] ?? 0, p = needed ? Math.round((fl / needed) * 100) : 0, bc = barColor(p);
              const name = (ar ? it.item?.nameAr : it.item?.name) || L("Item", "بند");
              return (
                <div key={it.id} style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.10)", borderRadius: 12, padding: "7px 10px", display: "flex", alignItems: "center", gap: 9 }}>
                  <div style={{ position: "relative", width: 46, height: 46, flexShrink: 0 }}>
                    <div style={{ width: 46, height: 46, borderRadius: 12, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", padding: 1 }}>
                      <EquipImg src={it.item?.imageUrl ?? null} categoryId={it.item?.categoryId ?? null} name={name} box="" img="h-[42px] w-[42px] object-contain" iconSize={40} />
                    </div>
                    <span style={{ position: "absolute", top: -7, insetInlineEnd: -7, fontSize: 10, fontWeight: 900, color: "#1c3550", background: "#FBBF6B", padding: "1px 5px", borderRadius: 20, boxShadow: "0 1px 3px rgba(0,0,0,.25)" }}>×{needed}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 6 }}>
                      <span style={{ fontSize: 14, fontWeight: 900, color: bc, whiteSpace: "nowrap" }}>{fl}/{needed}</span>
                      <span style={{ fontSize: 10, color: "#9DAFC6", fontWeight: 700, whiteSpace: "nowrap" }}>{L("units filled", "موردة")}</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 6, background: "rgba(255,255,255,.14)", overflow: "hidden" }}>
                      <div style={{ height: "100%", borderRadius: 6, background: bc, width: `${Math.min(100, p)}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <ShareForBidsSheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        shareUrl={shareUrl}
        renterName={link?.renterName}
        deadline={link?.bidDeadline ?? null}
        onSaveDeadline={saveDeadline}
        logoUrl={link?.logoUrl ?? null}
        onSaveLogo={saveLogo}
        ar={ar}
        L={L}
      />
    </div>
  );
}
