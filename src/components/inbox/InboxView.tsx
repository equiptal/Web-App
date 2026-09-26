"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import { ChatDock } from "@/components/map/ChatDock";
import { PriceFooter } from "@/components/map/PriceFooter";
import { fetchBidDetail, fetchReceivedBids, fetchMyRequests, fetchStreamToken } from "@/lib/api/client";
import { leaseStream } from "@/lib/chat/stream-connection";
import { readInboxChatSummaries } from "@/lib/chat/inbox-chat-summary";
import type { BidCard } from "@/lib/contract/bids";
import type { InboxBid } from "@/lib/contract/inbox";
import type { RequestRecord } from "@/lib/contract/requests";
import { inboxPreview, inboxTimeLabel, type InboxChatSummary } from "@/lib/contract/inbox-chat";
import { useUrlOverlay } from "@/lib/nav/useUrlOverlay";
import { durationDaysBetween } from "@/lib/pricing/rental";
import { pin } from "@/lib/uiPins";
import "@/components/map/map-proto.css";

/**
 * **Inbox — the chats on the left, the conversation on the right** (owner, 2026-09-22: *"i want it
 * like the chats inbox look that open each chat beside it so maybe like the chat pannel in the map
 * but instead of equipments on the left, the chat inbox will be on the left and on right the
 * chats"*).
 *
 * Every bid offered to the renter across all his RFQs, each carrying its deal-room status and its
 * unread count (deal-room-per-bid). Pressing a row opens that conversation BESIDE the list rather
 * than navigating away from it.
 *
 * ── Read off the APP, which had moved a long way (owner: *"check the inbox changes on the app and
 *    align the web with"*) ──────────────────────────────────────────────────────────────────────
 * `features/inbox/` there: the row quotes the LAST MESSAGE with a «You:» prefix, a sent/read tick
 * and a time stamp, and carries a red unread pill. All four are new here and are the app's own
 * rules, ported in `contract/inbox-chat.ts` and `chat/inbox-chat-summary.ts`.
 *
 * 🔴 **The GROUPING stays the web's** (owner's pick of three): the request's site (its code was
 * dropped 2026-09-26), then equipment type, then the rows. The app groups by subtype alone because a phone has no room for two levels;
 * this list is a 360px column beside a conversation and it survives an account with many requests.
 *
 * ⚠️ **NOT merged in: off-platform submissions.** They arrive through the renter's own shared link
 * and have no Stream channel, so there is nothing to open beside the list. They live per-request,
 * as the empty state says.
 */

const nf = (n: number) => Math.round(n).toLocaleString("en-US");

/**
 * How often the list re-reads the unread counts and the last messages.
 *
 * 🔴 **The web has no push here, and the app does.** The app reloads this screen on an FCM
 * `DealRoomDataChanged` (its own `initState` listens for it) and again whenever the Inbox tab is
 * re-selected. There is no socket behind this list, so without a cadence the unread counts and the
 * previews go stale the moment the renter leaves the tab open — which on a chat inbox reads as a
 * broken screen rather than a slow one.
 *
 * ⚠️ **45s, the CHAT DOCK's own number**, and for its reason: this is a badge and a preview
 * line, not a conversation the renter is staring at. The open conversation is watched live by the
 * dock's own channel, so the two never disagree about the thread he is actually reading.
 */
const POLL_MS = 45_000;

export function InboxView() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const L = (en: string, a: string) => (ar ? a : en);
  const router = useRouter();
  /**
   * Opened on ONE supplier, from his profile's «deal rooms» card (owner, 2026-09-06: *"u can
   * redirect them to the inbox but to the specific supplier"*). Matched on either id: a supplier row
   * may be linked to a person's account or to a firm's, and a renter thinking «show me Al Faisal»
   * means the firm either way.
   */
  const only = useSearchParams().get("supplier");
  /**
   * WHICH conversation is open, in the URL (`?bid=`).
   *
   * 🔴 Component state would make this the exact complaint `useUrlOverlay` was written for: a renter
   * who opens a conversation, presses into the equipment map from it and comes back lands on the
   * list with nothing selected. Picking another row REPLACES the entry rather than stacking, so
   * reading four conversations costs one Back and not four.
   */
  const { value: openBidId, open: openBid, close: closeBid } = useUrlOverlay("bid");

  const [bids, setBids] = useState<InboxBid[] | null>(null);
  // requestId → requestGroupId, from `my-requests` (same source the requests page groups by). Lets the
  // inbox cluster a multi-item RFQ's fan-out siblings without any received-bids backend change.
  const [groupMap, setGroupMap] = useState<Map<string, string>>(new Map());
  /** dealRoomId → its last line of conversation. Empty until Stream answers, and empty for ever if
   *  Stream is unreachable: the rows then keep the equipment subtitle, which is the pre-chat row. */
  const [chats, setChats] = useState<Map<string, InboxChatSummary>>(new Map());
  /** The selected bid, read by ID. One call per selection, and the pane's only dependency. */
  const [card, setCard] = useState<BidCard | null>(null);
  /** Its request, for the two fields the price bar prices from. */
  const [cardReq, setCardReq] = useState<RequestRecord | null>(null);
  /** The read failed — a bid that is gone, or a dropped request. The pane SAYS so rather than
   *  spinning for ever, which is what a missing card used to do. */
  const [cardFailed, setCardFailed] = useState(false);
  /**
   * Ticks on the poll and on a RETURN to this tab — the two moments the app reloads on.
   *
   * ⚠️ A hidden tab is not read, so it is not polled: `visibilitychange` covers coming back,
   * and firing into a background tab would spend a request per 45s on a screen nobody is looking at.
   */
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((n) => n + 1);
    const id = window.setInterval(() => { if (!document.hidden) bump(); }, POLL_MS);
    const onVisible = () => { if (!document.hidden) bump(); };
    window.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  /**
   * 🔴 **The BIDS re-read on every tick; the REQUESTS read ONCE.** They answer two different
   * questions: the feed carries what changes minute to minute (a new offer, an unread count, a room
   * that closed), and the request list carries the site, the RFQ code and the two price fields,
   * which do not move while a renter reads his messages. Polling both would triple the traffic to
   * refresh the third of it that can actually change.
   *
   * ⚠️ A failed poll leaves the list ALONE rather than emptying it. `setBids([])` on the
   * catch belongs to the FIRST read, where there is nothing on screen to protect; on a later one it
   * would blank a working inbox over a dropped request.
   */
  useEffect(() => {
    let active = true;
    fetchReceivedBids()
      .then((r) => active && setBids(r.bids))
      .catch(() => { if (active) setBids((prev) => prev ?? []); });
    return () => { active = false; };
  }, [tick]);

  useEffect(() => {
    let active = true;
    fetchMyRequests()
      .catch(() => ({ requests: [] }))
      .then((req) => {
        if (!active) return;
        setGroupMap(new Map(req.requests.filter((x) => x.requestGroupId).map((x) => [x.id, x.requestGroupId as string])));
      });
    return () => { active = false; };
  }, []);

  /* ~~Each group's RFQ short code, one `fetchRequestSubmissions` per group.~~ Its only reader was the
     code badge on the group header, removed 2026-09-26 (owner: *"in inbox remove the request id"*). */

  /**
   * ── The last line of every conversation, in one pass (the app's `InboxChatSummaryReader`) ──────
   *
   * ⚠️ **The list paints BEFORE this and never waits for it.** A failure is silent and leaves every
   * row on its equipment subtitle, which is exactly the pre-chat row — the chat line is decoration
   * over a list that already works.
   *
   * ⚠️ **The lease is opened SYNCHRONOUSLY**, before the first await, which is the whole point of
   * `leaseStream`: cleanup runs at unmount whether or not the token fetch has landed, and the
   * alternative shape pins `refCount` above zero for the rest of the session.
   */
  const roomIds = useMemo(
    () => [...new Set((bids ?? []).map((b) => b.dealRoomId).filter((id): id is string => !!id))],
    [bids],
  );
  const roomKey = roomIds.join(",");
  useEffect(() => {
    if (!roomIds.length) return;
    const lease = leaseStream();
    let active = true;
    (async () => {
      try {
        const auth = await fetchStreamToken(roomIds[0]);
        if (!auth.token || !auth.userId || lease.released) return;
        const client = await lease.connect(auth.userId, auth.token);
        const out = await readInboxChatSummaries({ client, currentUserId: auth.userId, dealRoomIds: roomIds });
        if (active && out.size) setChats(out);
      } catch {
        // Presentation only. The rows keep their equipment subtitle.
      }
    })();
    return () => { active = false; lease.release(); };
    // `roomKey` rather than the array: a new array of the same ids must not re-read Stream. The
    // tick is what refreshes the PREVIEWS — the ids can be identical while every last message has
    // changed, which is the ordinary case on a busy account.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomKey, tick]);

  /** The open row, and the bid card behind it. */
  /**
   * The row behind the open conversation, for the LIST's highlight only.
   *
   * 🔴 **The pane no longer depends on it**, and that was a real bug on staging: a link of the
   * shape `/inbox?bid=<id>` showed no conversation at all. Two ways it failed, and either alone was
   * enough — the bid may not be on the received-bids feed this page holds, and the card behind it
   * was fetched with `fetchBids(requestId)`, which answers EXACT-SIZE bids only, so a bid on a larger
   * machine was never in the answer and the pane waited on a card that could not arrive.
   */
  const openRow = useMemo(() => (bids ?? []).find((b) => b.bidId === openBidId) ?? null, [bids, openBidId]);
  const cardBidId = useRef<string | null>(null);
  useEffect(() => {
    if (!openBidId) { setCard(null); setCardReq(null); cardBidId.current = null; return; }
    if (cardBidId.current === openBidId) return;
    cardBidId.current = openBidId;
    let active = true;
    setCard(null);
    setCardReq(null);
    setCardFailed(false);
    /* 🔴 **BY ID, through the bid's own route.** `fetchBidDetail` takes the id the URL carries
       and answers that bid whatever its size and wherever it sits in the feed — which is what makes a
       pasted link, a notification and a Back from the equipment map all land on the conversation.
       ⚠️ It hands back the REQUEST too, so the price bar is priced off the same two fields the
       map's footer is handed without the list having to be loaded first. */
    fetchBidDetail(openBidId)
      .then((r) => { if (!active) return; setCard(r.bid); setCardReq(r.request); })
      .catch(() => { if (active) setCardFailed(true); });
    return () => { active = false; };
  }, [openBidId]);

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

  /**
   * The billable window the price bar prices from.
   *
   * ⚠️ `RequestRecord` carries the RAW `estimatedDurationDays`, not the derived `durationDays`
   * of `RequestListItem` — so the fallback is `durationDaysBetween`, the same helper the list mapper
   * uses at its own call. Two derivations of one window is how a bid comes to read as two totals on
   * two surfaces.
   */
  const cardDurationDays = useMemo(
    () => cardReq?.estimatedDurationDays ?? durationDaysBetween(cardReq?.startDate ?? null, cardReq?.endDate ?? null),
    [cardReq],
  );

  const openEquipment = useCallback(() => {
    if (openBidId) router.push(`/bids/${encodeURIComponent(openBidId)}/equipment`);
  }, [openBidId, router]);

  if (bids === null) {
    return <div className="mt-10 text-center text-muted"><Icon name="progress_activity" size={26} /></div>;
  }
  if (bids.length === 0) {
    return (
      <div className="mx-auto mt-10 max-w-md rounded-lg border border-border bg-surface p-8 text-center">
        <Icon name="inbox" size={40} className="text-muted" />
        <h2 className="mt-3 text-subhead font-extrabold text-navy">{L("No in-app bids yet", "لا عروض داخل التطبيق بعد")}</h2>
        <p className="mt-1 text-body text-muted">{L("Bids suppliers send you inside the app show up here, grouped by request. Off-platform bids from your shared link appear on each request itself.", "تظهر هنا العروض التي يرسلها المؤجّرون داخل التطبيق، مُجمّعة حسب الطلب. أمّا عروض الرابط المشترك (خارج المنصة) فتظهر على كل طلب.")}</p>
      </div>
    );
  }

  /** Applied AFTER the empty check, so a renter whose inbox is genuinely empty still gets the empty
   *  state rather than a filtered view of nothing. */
  const shown = only
    ? bids.filter((b) => String(b.supplierId ?? "") === only || String(b.supplierCompanyId ?? "") === only)
    : bids;
  const filteredName = only ? (shown[0]?.supplierName ?? null) : null;

  // Two-level grouping: RFQ group (fan-out `requestGroupId`, falling back to the individual request
  // until the backend projects it) → equipment type (subtype) → bid rows.
  type Sub = { key: string; label: string; rows: InboxBid[] };
  type Grp = { key: string; label: string; subs: Map<string, Sub>; count: number };
  const groups = new Map<string, Grp>();
  for (const b of shown) {
    const gKey = groupMap.get(b.request.id) ?? b.request.groupId ?? b.request.id ?? b.bidId;
    // The site, else a plain word: the request's id is not shown here (owner, 2026-09-26).
    const gLabel = b.request.location || L("Request", "طلب");
    let g = groups.get(gKey);
    if (!g) { g = { key: gKey, label: gLabel, subs: new Map(), count: 0 }; groups.set(gKey, g); }
    const tKey = b.equipmentType.id || b.request.id || b.bidId;
    const tLabel = b.equipmentType.name || b.request.equipmentSummary || L("Equipment", "معدة");
    let sub = g.subs.get(tKey);
    if (!sub) { sub = { key: tKey, label: tLabel, rows: [] }; g.subs.set(tKey, sub); }
    sub.rows.push(b);
    g.count += 1;
  }

  const banner = only ? (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface2 px-3 py-2">
      <Icon name="filter_alt" size={14} className="flex-none text-muted" />
      <span className="min-w-0 flex-1 truncate text-meta text-navy">{filteredName ?? L("This supplier", "هذا المورّد")}</span>
      <button type="button" onClick={() => router.push("/inbox")} className="flex-none text-meta font-semibold text-brand hover:text-brand-hover">
        {L("Show everyone", "اعرض الجميع")}
      </button>
    </div>
  ) : null;

  /**
   * ── A CHAT ROW, the app's (`_InboxCard`) ───────────────────────────────────────────────────────
   * The counterparty's mark, his name and the time, then the last message with its tick or its
   * unread count.
   *
   * ⚠️ **The equipment line is the FALLBACK, not the default.** It is what shows before the Stream
   * read lands and what stays if Stream is unreachable, so a row is never blank and never waits on a
   * second network call.
   *
   * ⚠️ **A tick is drawn ONLY on a message the reader sent**, which is what makes the column
   * scannable: a tick always means «mine». Two states and no invented middle one — Stream has a
   * per-member `lastRead`, so «they read it» is free, and no per-device delivery receipt.
   */
  const row = (b: InboxBid) => {
    const chat = b.dealRoomId ? chats.get(b.dealRoomId) : undefined;
    const unread = b.unreadCount > 0;
    const active = b.bidId === openBidId;
    const preview = chat
      ? inboxPreview({
          text: chat.text,
          isMine: chat.isMine,
          youPrefix: L("You: ", "أنت: "),
          updateLabel: L("Update in the deal room", "تحديث في غرفة التفاوض"),
        })
      : [b.equipmentName || b.request.equipmentSummary, b.currentPrice != null ? `${nf(b.currentPrice)} ${L("SAR", "ر.س")}` : null]
          .filter(Boolean)
          .join(" · ");
    const time = chat
      ? inboxTimeLabel({ when: chat.sentAt, now: new Date(), ar, yesterdayLabel: L("Yesterday", "أمس") })
      : null;

    return (
      <button
        {...pin("inbox-row")}
        key={b.bidId}
        type="button"
        onClick={() => openBid(b.bidId)}
        aria-current={active ? "true" : undefined}
        className={`flex w-full items-center gap-2.5 rounded-lg border p-2.5 text-start ${
          active ? "border-navy bg-surface2" : "border-border bg-surface hover:bg-surface2"
        }`}
      >
        <div className="grid h-10 w-10 flex-none place-items-center overflow-hidden rounded-full bg-surface2 text-navy-mid">
          {b.supplierLogoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={b.supplierLogoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <Icon name="storefront" size={20} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className={`min-w-0 flex-1 truncate text-meta text-navy ${unread ? "font-extrabold" : "font-semibold"}`}>
              {b.supplierName}
            </span>
            {time && (
              <span className={`flex-none text-label ${unread ? "font-extrabold text-brand" : "text-muted-light"}`} dir="ltr">
                {time}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-1">
            {/* The tick, on a message the reader sent. `done_all` when every other member is past it. */}
            {chat?.isMine && (
              <Icon
                name={chat.readByOther ? "done_all" : "done"}
                size={14}
                className={`flex-none ${chat.readByOther ? "text-ok" : "text-muted-light"}`}
              />
            )}
            <span className={`min-w-0 flex-1 truncate text-label ${unread ? "font-semibold text-navy-mid" : "text-muted"}`}>
              {preview}
            </span>
            {unread && (
              <span className="grid h-[18px] min-w-[18px] flex-none place-items-center rounded-full bg-danger px-1 text-label font-extrabold text-white" dir="ltr">
                {b.unreadCount > 99 ? "99+" : b.unreadCount}
              </span>
            )}
          </div>
          {/* The room's own state, which the preview does not carry: a closed deal and a live
              negotiation quote their last message identically. */}
          <div className="mt-0.5 text-label font-semibold" style={{ color: b.supplierStarted ? "var(--brand)" : "var(--muted-light)" }}>
            {statusLabel(b)}
          </div>
        </div>
      </button>
    );
  };

  const list = (
    <div {...pin("inbox-list")} className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3">
      {banner}
      {only && shown.length === 0 && (
        <p className="rounded-md border border-dashed border-border bg-surface2 px-4 py-6 text-center text-meta text-muted">
          {L("Nothing from this supplier yet.", "لا شيء من هذا المورّد بعد.")}
        </p>
      )}
      {[...groups.values()].map((g) => (
        <div key={g.key} className="mb-4">
          {/* Level 1 — the RFQ group, by its site. ~~The short code first (RFQ-NNNNN, else REQ-).~~
              Removed (owner, 2026-09-26: *"in inbox remove the request id"*). */}
          <div className="mb-1.5 flex items-center gap-1.5 px-0.5 text-meta font-extrabold text-navy">
            <Icon name="folder_open" size={14} />
            <span className="min-w-0 flex-1 truncate text-muted">{g.label}</span>
            <span className="flex-none text-label font-semibold text-muted">{g.count}</span>
          </div>
          {[...g.subs.values()].map((sub) => (
            <div key={sub.key} className="mb-2 ms-1 border-s-2 border-border ps-2">
              {/* Level 2 — equipment type */}
              <div className="mb-1.5 inline-flex max-w-full items-center gap-1 rounded-sm bg-brand-soft px-2 py-0.5 text-label font-extrabold text-brand-deep">
                <Icon name="construction" size={13} /> <span className="truncate">{sub.label}</span>
                <span className="flex-none rounded-full bg-brand/15 px-1.5">{sub.rows.length}</span>
              </div>
              <div className="flex flex-col gap-1.5">{sub.rows.map(row)}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );

  /**
   * ── The conversation, in the column beside the list ─────────────────────────────────────────────
   *
   * 🔴 **`.bidmap` is the wrapper on purpose, and it is not a hack.** Every rule the dock draws
   * itself with is scoped under that class — the identity band, the tab strip, the bubbles, the
   * cards, the composer, some three hundred selectors — so a differently-named host would need all
   * of them copied. The class itself is a plain flex container (`position: relative; flex: 1;
   * min-height: 0; overflow: hidden`), which is exactly what a chat column wants, and the dock's own
   * `is-inbox` placement fills it.
   *
   * ⚠️ **The price bar is OUTSIDE the dock**, above it, so the conversation scrolls under a bar that
   * does not move. Inside the dock it would sit above the composer, which is where the map already
   * puts it and is the placement the owner is answering.
   *
   * 🔴 **`.bidmap` wraps the BAR as well as the dock, and that was found by looking.** Every
   * `.bm-foot*` rule is scoped under that class too, so with the bar mounted outside the wrapper it
   * rendered as a white row of default buttons — the navy slab, the hero figure and the two CTAs all
   * absent, on a specimen carrying the real stylesheet. It typechecks, it lints, and no case reads a
   * computed style. `flexDirection: "column"` because `.bidmap` is a ROW by default (it holds a panel
   * beside a map); here it holds a bar above a conversation.
   */
  const pane = openBidId ? (
    <div {...pin("inbox-pane")} className="bidmap min-h-0 flex-1" style={{ flexDirection: "column" }}>
      <div className="relative min-h-0 flex-1">
        {card ? (
          <ChatDock
            bid={card}
            embedded
            fleet={null}
            dealRoomId={card.dealRoomId}
            typeWord={ar ? openRow?.equipment.subtypeAr : openRow?.equipment.subtype}
            onClose={closeBid}
            onOpenEquipment={openEquipment}
            /* 🔴 **The price bar sits UNDER the identity band**, in the slot the request strip
               vacated (owner, 2026-09-23: *"here in the inbox replace it with price header"*). It was
               above the whole dock, which put it over the counterparty's own name — and the renter
               reaches the map from nowhere here, so this is the only surface carrying the rate and
               the way into the negotiation. */
            belowHeader={
              <PriceFooter
                bid={card}
                slim
                durationDays={cardDurationDays}
                startDate={cardReq?.startDate ?? null}
              />
            }
          />
        ) : cardFailed ? (
          <div className="grid h-full place-items-center p-8 text-center text-meta text-muted">
            {L("That conversation could not be opened.", "تعذّر فتح هذه المحادثة.")}
          </div>
        ) : (
          <div className="grid h-full place-items-center text-muted"><Icon name="progress_activity" size={24} /></div>
        )}
      </div>
    </div>
  ) : (
    <div {...pin("inbox-pane-empty")} className="grid min-h-0 flex-1 place-items-center p-8 text-center">
      <div>
        <Icon name="forum" size={40} className="text-muted-light" />
        <p className="mt-3 text-body font-semibold text-muted">{L("Pick a conversation", "اختر محادثة")}</p>
        <p className="mt-1 text-meta text-muted-light">
          {L("Your suppliers' offers are on the left. Open one to read it and reply.", "عروض المؤجّرين على اليسار. افتح أحدها لقراءته والرد عليه.")}
        </p>
      </div>
    </div>
  );

  /**
   * ⚠️ **Below `lg` there is one column, not two.** A 360px list beside a conversation is a desktop
   * layout; on a phone the list IS the page until a row is pressed, and the dock's ✕ is what comes
   * back to it. Two panes squeezed into 390px would leave neither readable.
   */
  return (
    <div
      {...pin("inbox-view")}
      dir={ar ? "rtl" : "ltr"}
      className="flex min-h-0 w-full flex-1"
    >
      <div className={`min-h-0 w-full flex-col border-border lg:flex lg:w-[360px] lg:flex-none lg:border-e ${openBidId ? "hidden" : "flex"}`}>
        {list}
      </div>
      <div className={`min-h-0 flex-1 flex-col ${openBidId ? "flex" : "hidden lg:flex"}`}>{pane}</div>
    </div>
  );
}
