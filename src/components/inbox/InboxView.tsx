"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import { fetchReceivedBids, fetchMyRequests, startDealRoom } from "@/lib/api/client";
import type { InboxBid } from "@/lib/contract/inbox";

const nf = (n: number) => Math.round(n).toLocaleString("en-US");

/**
 * Inbox — every bid offered to the renter across all RFQs, each carrying its deal-room status + unread
 * count (deal-room-per-bid). A bid where the supplier opened the room and messaged first surfaces as
 * "New message · Reply". Tapping opens the existing room or creates one on the spot (open-or-create).
 * NOTE: shows on-platform bids (received-bids); off-platform shared-link bids live per-request — a
 * future merge will fold them in here too.
 */
export function InboxView() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const L = (en: string, a: string) => (ar ? a : en);
  const router = useRouter();
  const [bids, setBids] = useState<InboxBid[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // requestId → requestGroupId, from `my-requests` (same source the requests page groups by). Lets the
  // inbox cluster a multi-item RFQ's fan-out siblings without any received-bids backend change.
  const [groupMap, setGroupMap] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    let active = true;
    Promise.all([fetchReceivedBids(), fetchMyRequests().catch(() => ({ requests: [] }))])
      .then(([r, req]) => {
        if (!active) return;
        setBids(r.bids);
        setGroupMap(new Map(req.requests.filter((x) => x.requestGroupId).map((x) => [x.id, x.requestGroupId as string])));
      })
      .catch(() => active && setBids([]));
    return () => { active = false; };
  }, []);

  async function open(b: InboxBid) {
    if (busyId) return;
    if (b.dealRoomId) { router.push(`/deal-room/${b.dealRoomId}`); return; }
    setBusyId(b.bidId);
    try {
      const { id } = await startDealRoom(b.bidId);
      router.push(`/deal-room/${encodeURIComponent(id)}`);
    } catch {
      setBusyId(null);
    }
  }

  const statusLabel = (b: InboxBid) => {
    if (b.supplierStarted) return L("New message", "رسالة جديدة");
    switch (b.dealRoomStatus) {
      case "NEGOTIATING": return L("Negotiating", "قيد التفاوض");
      case "AWAITING_SUPPLIER_CONFIRMATION": return L("Awaiting supplier", "بانتظار المؤجّر");
      case "CLOSED": return L("Closed", "مغلق");
      case "ABANDONED": return L("Cancelled", "ملغى");
      case "OPEN": return L("Open", "مفتوح");
      default: return L("New bid", "عرض جديد");
    }
  };
  const ctaLabel = (b: InboxBid) => {
    if (b.supplierStarted) return L("Reply", "رد");
    if (b.dealRoomStatus === "CLOSED") return L("View deal", "عرض الصفقة");
    if (b.dealRoomId) return L("Open chat", "فتح المحادثة");
    return L("Start negotiation", "بدء التفاوض");
  };

  if (bids === null) {
    return <div className="mt-10 text-center text-muted"><Icon name="progress_activity" size={26} /></div>;
  }
  if (bids.length === 0) {
    return (
      <div className="mx-auto mt-10 max-w-md rounded-2xl border border-border bg-surface p-8 text-center">
        <Icon name="inbox" size={40} className="text-muted" />
        <h2 className="mt-3 text-[16px] font-extrabold text-navy">{L("No bids yet", "لا عروض بعد")}</h2>
        <p className="mt-1 text-[13px] text-muted">{L("Bids suppliers send you will show up here, grouped by request.", "ستظهر هنا العروض التي يرسلها المورّدون، مُجمّعة حسب الطلب.")}</p>
      </div>
    );
  }

  // Two-level grouping: RFQ group (fan-out `requestGroupId`, falling back to the individual request
  // until the backend projects it) → equipment type (subtype) → bid rows.
  type Sub = { key: string; label: string; rows: InboxBid[] };
  type Grp = { key: string; label: string; subs: Map<string, Sub>; count: number };
  const groups = new Map<string, Grp>();
  for (const b of bids) {
    const gKey = groupMap.get(b.request.id) ?? b.request.groupId ?? b.request.id ?? b.bidId;
    const gLabel = b.request.location || b.request.displayId || b.request.shortCode || L("Request", "طلب");
    let g = groups.get(gKey);
    if (!g) { g = { key: gKey, label: gLabel, subs: new Map(), count: 0 }; groups.set(gKey, g); }
    const tKey = b.equipmentType.id || b.request.id || b.bidId;
    const tLabel = b.equipmentType.name || b.request.equipmentSummary || L("Equipment", "معدة");
    let sub = g.subs.get(tKey);
    if (!sub) { sub = { key: tKey, label: tLabel, rows: [] }; g.subs.set(tKey, sub); }
    sub.rows.push(b);
    g.count += 1;
  }

  const row = (b: InboxBid) => (
    <div key={b.bidId} className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3">
      <div className="grid h-11 w-11 flex-none place-items-center overflow-hidden rounded-xl bg-surface2 text-navy-mid">
        {b.supplierLogoUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={b.supplierLogoUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <Icon name="storefront" size={22} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[14px] font-bold text-navy">{b.supplierName}</span>
          <span className="inline-flex flex-none items-center gap-0.5 rounded-full bg-info-soft px-1.5 py-0.5 text-[9px] font-extrabold text-info">
            <Icon name="verified_user" size={11} /> {L("via app", "عبر التطبيق")}
          </span>
          {b.unreadCount > 0 && <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-brand px-1 text-[10px] font-extrabold text-white">{b.unreadCount}</span>}
        </div>
        <div className="truncate text-[12px] font-semibold text-muted">
          {b.equipmentName || b.request.equipmentSummary || L("Equipment", "معدة")}
          {b.currentPrice != null && <> · {nf(b.currentPrice)} {L("SAR", "ر.س")}</>}
        </div>
        <div className="mt-1 text-[11px] font-bold" style={{ color: b.supplierStarted ? "var(--brand)" : "var(--muted)" }}>{statusLabel(b)}</div>
      </div>
      <button
        type="button"
        disabled={busyId === b.bidId}
        onClick={() => open(b)}
        className={`flex-none rounded-[10px] px-3.5 py-2 text-[12.5px] font-bold ${b.supplierStarted ? "bg-brand text-white" : "border border-border bg-surface text-navy"} disabled:opacity-50`}
      >
        {ctaLabel(b)}
      </button>
    </div>
  );

  return (
    <div dir={ar ? "rtl" : "ltr"} className="mx-auto w-full max-w-3xl">
      {[...groups.values()].map((g) => (
        <div key={g.key} className="mb-6">
          {/* Level 1 — the RFQ group */}
          <div className="mb-2 flex items-center gap-2 px-1 text-[13.5px] font-extrabold text-navy">
            <Icon name="folder_open" size={16} /> <span className="truncate">{g.label}</span>
            <span className="flex-none text-[11px] font-bold uppercase tracking-wide text-muted">· {g.count} {L("bids", "عروض")}</span>
          </div>
          {[...g.subs.values()].map((sub) => (
            <div key={sub.key} className="mb-3 ms-2 border-s-2 border-border ps-3">
              {/* Level 2 — equipment type */}
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-muted">
                <Icon name="construction" size={13} /> <span className="truncate">{sub.label}</span>
                <span className="flex-none normal-case text-muted/70">· {sub.rows.length}</span>
              </div>
              <div className="flex flex-col gap-2">{sub.rows.map(row)}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
