"use client";

/**
 * **V12 · the chat dock** — spec 004 §6.9, 004a §2 and §2.1.
 *
 * A floating **المحادثة** control with the unread badge. **There is no edge rail** (RM3-AC-23): the
 * rail carried chat, equipment and documents in v2; v3 puts the equipment and the documents inline in
 * the panel, which leaves chat as the only persistent global action — and one action does not need a
 * rail.
 *
 * ── A tab per item, and why ──────────────────────────────────────────────────────────────────────
 * `DealRoom.bidId` is `@unique` and the backend fans a multi-item RFQ into one request per item, so
 * **one bid = one item = one deal room = one Stream channel**. A supplier bidding on three items has
 * three channels; merging them would mean inventing a fourth and re-parenting messages. Tabs present
 * the same rooms honestly. A supplier with one bid gets today's chat and no new chrome (RM3-AC-44).
 *
 * ── Three rules this component exists to hold ────────────────────────────────────────────────────
 * 1. **Opening a tab creates nothing** (RM3-AC-47). A bid with no room is *compose-only*; the SEND
 *    creates the room and then connects. A `DealRoom` row freezes the supplier's offered count.
 * 2. **Switching tabs does not move the map** (RM3-AC-49). This component owns no selection and no
 *    map state, which is what makes that true rather than something to remember.
 * 3. **Every custom card renders as a card** (RM3-AC-48) — the negotiation vocabulary plus
 *    `rentee_request` and `rentee_request_reply`, all through the same `parseChatCard` +
 *    `buildChatCardView` + `ChatCard` the deal room uses. Never a bare grey pill.
 *
 * Unread is REST (`GET /api/me/received-bids` rows carry `bidId` + `unreadCount`), so the arrival
 * notice is refresh-timed and its copy says *"you have a reply"*, never *"just arrived"*
 * (RM3-AC-64).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Channel } from "stream-chat";
import { ChatCard } from "@/components/deal-room/ChatCard";
import { fetchReceivedBids, fetchStreamToken } from "@/lib/api/client";
import { STREAM_API_KEY, acquireStream, releaseStream, watchDealRoom } from "@/lib/chat/stream-connection";
import { ensureDealRoom } from "@/lib/chat/ensure-deal-room";
import type { BidCard } from "@/lib/contract/bids";
import {
  arrivalNotice,
  dockTabs,
  dockUnreadTotal,
  type DockNotice,
  type DockReplyDigest,
  type DockTab,
} from "@/lib/contract/chat-dock";
import { buildChatCardView, chatCardOfMessage } from "@/lib/contract/deal-rounds";
import type { FleetMachine } from "@/lib/contract/fleet";
import type { InboxBid } from "@/lib/contract/inbox";
import {
  RENTEE_REQUEST_CARD_TYPE,
  RENTEE_REQUEST_REPLY_CARD_TYPE,
  type RenteeRequestCardPayload,
} from "@/lib/contract/rentee-request";
import { useLocale, useT } from "@/lib/i18n";
import "@/components/deal-room/deal-room-proto.css";

/** Refresh cadence for the REST unread + tab list. Deliberately slower than the deal room's 15s room
 *  poll: this is a badge, not a conversation the renter is staring at. */
const POLL_MS = 45_000;

type ChatMsg = {
  id: string;
  text?: string;
  user?: { id?: string };
  created_at?: string | Date;
  custom?: Record<string, unknown>;
};

export interface ChatDockProps {
  /** The bid this surface is scoped to — the dock's anchor tab, and the counterparty it groups by. */
  bid: BidCard;
  /** The bid's RFQ group, when the route resolved one. Only used when the received-bids feed does not
   *  contain the anchor bid (paging), so the tab strip degrades to "no siblings" rather than to a
   *  wrong group. */
  groupKey?: string | null;
  /** The anchor bid's fleet, for deriving each request card's state on every render (RM3-AC-18).
   *  Null until it arrives; a sibling tab has none, and its cards then state the ask without claiming
   *  an answer either way. */
  fleet: FleetMachine[] | null;
  /** Bumped by the surface after it sends a request card, so the dock refreshes on **post-send** —
   *  one of the four refresh points of 004a §2.1. */
  sendNonce?: number;
}

export function ChatDock({ bid, groupKey = null, fleet, sendNonce = 0 }: ChatDockProps) {
  const t = useT();
  const { locale } = useLocale();
  const ar = locale === "ar";
  const L = useCallback((en: string, arr: string) => (ar ? arr : en), [ar]);

  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<InboxBid[]>([]);
  const [activeBidId, setActiveBidId] = useState(bid.id);
  /** Rooms this dock created by sending, before the feed has caught up with them. */
  const [freshRooms, setFreshRooms] = useState<Record<string, string>>({});
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [myStreamId, setMyStreamId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [dismissedNotice, setDismissedNotice] = useState<string | null>(null);
  /** Ticks on mount · focus · post-send · poll — the four refresh points, and the ONLY moments the
   *  arrival notice is recomputed. That is what makes the notice refresh-timed rather than live. */
  const [refreshTick, setRefreshTick] = useState(0);

  const channelRef = useRef<Channel | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  /* ── the tabs (REST) ─────────────────────────────────────────────────────────────────────────── */

  const refresh = useCallback(() => {
    fetchReceivedBids()
      .then((r) => setRows(r.bids))
      // A failed feed must not empty the strip the renter is reading, and must never be reported as
      // "no messages" — silence about unread is safer than a zero that is a fetch failure.
      .catch(() => {});
    setRefreshTick((n) => n + 1);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (sendNonce > 0) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendNonce]);
  useEffect(() => {
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    const timer = setInterval(refresh, POLL_MS);
    return () => {
      window.removeEventListener("focus", onFocus);
      clearInterval(timer);
    };
  }, [refresh]);

  const tabs: DockTab[] = useMemo(() => {
    const base = dockTabs(
      {
        bidId: bid.id,
        supplierCompanyId: bid.supplierCompanyId,
        supplierId: bid.supplierId,
        supplierName: bid.supplierName,
        dealRoomId: bid.dealRoomId,
        label: bid.equipment?.model ?? bid.equipment?.make ?? null,
        groupKey,
      },
      rows,
    );
    // A room this dock just created is real even though the feed still says null — otherwise the tab
    // would fall back to compose-only for up to one poll and try to create a second room.
    return base.map((tab) => (tab.dealRoomId ? tab : { ...tab, dealRoomId: freshRooms[tab.bidId] ?? null }));
  }, [bid, groupKey, rows, freshRooms]);

  const active = tabs.find((tb) => tb.bidId === activeBidId) ?? tabs[0] ?? null;
  const unreadTotal = dockUnreadTotal(tabs);

  /* ── the connection (Stream) ─────────────────────────────────────────────────────────────────── */

  // ONE token for N tabs. The stream-token route is addressed by room, but the token it hands back is
  // a USER token (004a §4a.3.3) — so it is fetched from whichever room this counterparty already has,
  // and every other tab watches its own channel on that same client. The client itself is taken from
  // the shared reference-counted module: `/deal-room/[id]`'s unconditional `disconnectUser()` would
  // otherwise tear this connection down the moment the renter came back from negotiating.
  const tokenRoomId = active?.dealRoomId ?? tabs.find((tb) => tb.dealRoomId)?.dealRoomId ?? null;
  const activeRoomId = active?.dealRoomId ?? null;

  useEffect(() => {
    if (!STREAM_API_KEY || !open || !activeRoomId || !tokenRoomId) {
      setMessages([]);
      channelRef.current = null;
      return;
    }
    let cancelled = false;
    let held = false;
    let channel: Channel | null = null;
    const onNew = () => {
      if (channel) setMessages([...channel.state.messages] as ChatMsg[]);
    };
    (async () => {
      try {
        const tok = await fetchStreamToken(tokenRoomId);
        if (cancelled || !tok.token || !tok.userId) return;
        const client = await acquireStream(tok.userId, tok.token);
        held = true;
        if (cancelled) return;
        setMyStreamId(tok.userId);
        channel = await watchDealRoom(client, activeRoomId);
        if (cancelled) return;
        channelRef.current = channel;
        setMessages([...channel.state.messages] as ChatMsg[]);
        channel.on("message.new", onNew);
      } catch {
        /* chat unavailable — the tab still composes, and the rest of the surface is unaffected */
      }
    })();
    return () => {
      cancelled = true;
      channel?.off("message.new", onNew);
      channelRef.current = null;
      // Release, never disconnect: the deal-room route may still hold the same client.
      if (held) releaseStream();
    };
  }, [open, activeRoomId, tokenRoomId]);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, open]);

  /* ── the request loop's context (V11) ────────────────────────────────────────────────────────── */

  /** The fleet, by machine — re-read on EVERY render, because nothing about a request's state is
   *  stored (RM3-AC-18). Only the anchor tab has one; a sibling tab's cards state the ask and say
   *  nothing about the answer, which is honest rather than wrong. */
  const fleetById = useMemo(() => {
    const map = new Map<string, FleetMachine>();
    for (const m of fleet ?? []) map.set(m.equipmentId, m);
    return map;
  }, [fleet]);

  /** `ref` → the supplier's answer, read out of the conversation itself. */
  const repliesByRef = useMemo(() => {
    const map = new Map<string, { resolution: "provided" | "declined" | "unavailable" }>();
    for (const m of messages) {
      const card = chatCardOfMessage(m);
      if (card?.type === RENTEE_REQUEST_REPLY_CARD_TYPE) map.set(card.reply.inReplyTo, { resolution: card.reply.resolution });
    }
    return map;
  }, [messages]);

  const docLabel = useCallback(
    (docType: string) => {
      const key = docType.trim().toLowerCase().replace(/[\s-]+/g, "_");
      const known = DOC_TYPE_LABELS[key];
      if (known) return L(known[0], known[1]);
      // Never the raw key: `operating_license` humanises to "Operating license" rather than shouting
      // a database column at the renter.
      const words = key.replace(/_+/g, " ").trim();
      return words ? words.charAt(0).toUpperCase() + words.slice(1) : docType;
    },
    [L],
  );

  /*
   * The anchor bid's FIRM used to be assembled here, so a company-scope document ask could be resolved
   * against `compliance` + `companyCertCodes` instead of waiting for a reply card. There is no such ask
   * any more — a document request names a machine (product owner, 2026-08-08) — so the memo, and the
   * `company` resolver it fed on `requestCtx`, are deleted rather than left dangling.
   */

  const requestCtx = useMemo(
    () =>
      // Supplied only for the tab whose fleet this surface actually holds. Elsewhere it is omitted,
      // and the card renders with no verdict line at all.
      active?.bidId === bid.id && fleet
        ? {
            machine: (equipmentId: string) => {
              const m = fleetById.get(equipmentId);
              if (!m) return null;
              return {
                locationSource: m.locationSource ?? null,
                documentKeys: m.documentKeys,
                // Photos are their own list, and a document ask can name one — see
                // `documentAskSatisfied`.
                photoKeys: m.photoKeys,
                label: [m.manufacturer, m.modelName].filter(Boolean).join(" ") || m.serialNumber,
              };
            },
            reply: (ref: string) => repliesByRef.get(ref) ?? null,
            docLabel,
          }
        : undefined,
    [active?.bidId, bid.id, fleet, fleetById, repliesByRef, docLabel],
  );

  /* ── the arrival notice (004a §2.1) ──────────────────────────────────────────────────────────── */

  /** The most recent answer per tab, quoted as `↩ ref · serial`. The serial comes from the ASK, not
   *  from the reply — only the ask carries one (§7.3 stamps it from the resolved listing). */
  const replyDigests = useMemo(() => {
    const asks = new Map<string, RenteeRequestCardPayload>();
    const out: Record<string, DockReplyDigest | undefined> = {};
    if (!active) return out;
    for (const m of messages) {
      const card = chatCardOfMessage(m);
      if (card?.type === RENTEE_REQUEST_CARD_TYPE) asks.set(card.card.ref, card.card);
      if (card?.type === RENTEE_REQUEST_REPLY_CARD_TYPE) {
        out[active.bidId] = {
          ref: card.reply.inReplyTo,
          serial: asks.get(card.reply.inReplyTo)?.serial ?? null,
          resolution: card.reply.resolution,
        };
      }
    }
    return out;
    // Recomputed with the messages it reads; the NOTICE below is what is gated to refresh ticks.
  }, [messages, active]);

  const notice: DockNotice | null = useMemo(
    () => arrivalNotice(tabs, replyDigests, { open, bidId: activeBidId }),
    // `refreshTick` is a deliberate dependency and the reason this is refresh-timed: the notice is
    // recomputed on mount · focus · post-send · poll, and on nothing else. Without it a live
    // `message.new` would make a bubble appear the instant a message landed — which the copy is not
    // allowed to claim, and which the unread count behind it would not yet agree with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [refreshTick, tabs, replyDigests, open, activeBidId],
  );
  const noticeKey = notice ? `${notice.bidId}:${notice.reply?.ref ?? notice.unreadCount}` : null;
  const showNotice = notice && noticeKey !== dismissedNotice ? notice : null;
  /** A refusal is an answer that closes a door — «رفض طلبك» — and it takes the bubble's warm fill.
   *  `provided` is the only resolution that gave the renter what he asked for; the other two did not,
   *  and reading them as an ordinary reply is how a "no" gets skimmed past. */
  const refusal = showNotice?.reply != null && showNotice.reply.resolution !== "provided";

  /* ── sending ─────────────────────────────────────────────────────────────────────────────────── */

  /** The first message on a bid with no room is a **room-creating act** (004a §4.5): create, connect,
   *  then post. Opening the tab did none of that. */
  async function send() {
    const body = text.trim();
    if (!body || !active || busy) return;
    setBusy(true);
    try {
      if (!active.dealRoomId) {
        const roomId = await ensureDealRoom(active.bidId, null);
        setFreshRooms((prev) => ({ ...prev, [active.bidId]: roomId }));
        // The effect above reconnects on the new room id; the text is kept so the renter's first
        // message is not lost between creating the room and having a channel to put it in.
        const tok = await fetchStreamToken(roomId);
        if (tok.token && tok.userId) {
          const client = await acquireStream(tok.userId, tok.token);
          const channel = await watchDealRoom(client, roomId);
          await channel.sendMessage({ text: body });
          releaseStream();
        }
      } else {
        if (!channelRef.current) return;
        await channelRef.current.sendMessage({ text: body });
      }
      setText("");
      refresh();
    } catch {
      /* keep the text — a failed send must not swallow what the renter typed */
    } finally {
      setBusy(false);
    }
  }

  /* ── render ──────────────────────────────────────────────────────────────────────────────────── */

  const tabLabel = (tab: DockTab) => tab.label ?? t.chatDock.itemFallback;

  return (
    <>
      {/* The dock control. Persistent, floating, and the only global action on the surface. */}
      <button
        type="button"
        className={`bm-dock${open ? " is-open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="material-icons-outlined">forum</span>
        <span className="bm-dock-label">{t.chatDock.title}</span>
        {unreadTotal > 0 && (
          <span className="bm-dock-badge" dir="ltr">{unreadTotal > 99 ? "99+" : unreadTotal}</span>
        )}
      </button>

      {/* ── The arrival bubble (004a §2.1, the prototype's `rChatPop`) ────────────────────────────
          Anchored to the dock by a tail, refresh-timed, and worded as a STATE ("you have a reply")
          rather than an event ("just arrived") — there is no socket behind it (RM3-AC-64).

          **Filled, not outlined.** It competes with a whole map for attention, and the plain white
          box that stood here lost. A refusal takes the warm fill, so the one arrival a renter must
          not miss looks different before it is read — and warm rather than red, because red on this
          surface belongs to availability alone. */}
      {showNotice && !open && (
        <div className={`bm-dock-notice${refusal ? " is-refusal" : ""}`} role="status">
          <span className="bm-dock-notice-tail" aria-hidden="true" />
          <div className="bm-dock-notice-head">
            <span className="bm-dock-notice-kind">
              {refusal ? t.chatDock.kindRefusal : showNotice.reply ? t.chatDock.kindReply : t.chatDock.kindMessage}
            </span>
            <span className="bm-dock-notice-spacer" />
            <button type="button" className="bm-dock-notice-x" onClick={() => setDismissedNotice(noticeKey)} aria-label={t.chatDock.dismiss}>
              ✕
            </button>
          </div>
          <button type="button" className="bm-dock-notice-body" onClick={() => { setActiveBidId(showNotice.bidId); setOpen(true); }}>
            {/* Whose arrival it is, then what state it puts the renter in. The message text itself is
                deliberately absent: unread comes from REST, so this component does not hold the body
                of a message it is telling him about, and inventing one would be worse than naming
                the counterparty and handing off. */}
            <div className="bm-dock-notice-t">{bid.supplierName}</div>
            <div className="bm-dock-notice-x2">{showNotice.reply ? t.chatDock.noticeTitle : showNotice.label ?? t.chatDock.itemFallback}</div>
            {showNotice.reply && (
              <div className="bm-dock-notice-s">
                {`↩ ${showNotice.reply.ref}${showNotice.reply.serial ? ` · ${showNotice.reply.serial}` : ""}`}
              </div>
            )}
          </button>
        </div>
      )}

      {open && (
        <section className="bm-chat dlproto" aria-label={t.chatDock.title}>
          <header className="bm-chat-head">
            <span className="bm-chat-who">{bid.supplierName}</span>
            <button type="button" className="bm-chat-x" onClick={() => setOpen(false)} aria-label={t.chatDock.close}>
              <span className="material-icons-outlined">close</span>
            </button>
          </header>

          {/* A tab per item — and NO strip at all when this counterparty holds one bid (RM3-AC-44). */}
          {tabs.length > 1 && (
            <div className="bm-chat-tabs" role="tablist">
              {tabs.map((tab) => (
                <button
                  key={tab.bidId}
                  type="button"
                  role="tab"
                  aria-selected={tab.bidId === activeBidId}
                  className={`bm-chat-tab${tab.bidId === activeBidId ? " is-on" : ""}`}
                  // Switching tab changes the conversation and NOTHING else — not the map, not the
                  // machine selection (RM3-AC-49). This component holds neither.
                  onClick={() => setActiveBidId(tab.bidId)}
                >
                  <span className="bm-chat-tab-t">{tabLabel(tab)}</span>
                  {tab.unreadCount > 0 && <span className="bm-chat-tab-n" dir="ltr">{tab.unreadCount}</span>}
                </button>
              ))}
            </div>
          )}

          <div className="bm-chat-body">
            {!STREAM_API_KEY ? (
              <div className="bm-chat-note">{t.chatDock.unavailable}</div>
            ) : !active?.dealRoomId ? (
              // Compose-only. The tab exists, the room does not, and NOTHING here creates one — the
              // send does (RM3-AC-47).
              <div className="bm-chat-note">{t.chatDock.composeOnly}</div>
            ) : messages.length === 0 ? (
              <div className="bm-chat-note">{t.chatDock.empty}</div>
            ) : (
              messages.map((m) => {
                const card = chatCardOfMessage(m);
                if (card) {
                  // EVERY custom type renders as a card — the negotiation vocabulary and the request
                  // loop alike. Never a bare grey pill (RM3-AC-48).
                  const view = buildChatCardView(card, {
                    ar, L, terms: [], at: m.created_at, responded: false, superseded: false,
                    // The dock never negotiates: it shows the conversation and hands off to
                    // `/deal-room/[id]` (004a §4a.2). `live: false` is what removes accept/counter
                    // from a rate card here, so there is exactly one place a rate can be accepted.
                    live: false,
                    requestCtx,
                  });
                  return <ChatCard key={m.id} view={view} ar={ar} L={L} busy={false} onAccept={() => {}} onCounter={() => {}} />;
                }
                if (!m.text) return null;
                const mine = myStreamId != null && m.user?.id === myStreamId;
                return (
                  <div key={m.id} className={`msg ${mine ? "mine" : "them"}`}>
                    {m.text}
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
          </div>

          <div className="bm-chat-compose">
            <input
              className="bm-chat-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
              placeholder={t.chatDock.placeholder}
              disabled={busy || !active}
            />
            <button type="button" className="bm-chat-send" onClick={() => void send()} disabled={busy || !text.trim() || !active}>
              {/* The glyph is mirrored in CSS with the script, not swapped for another icon. */}
              <span className="material-icons-outlined">send</span>
            </button>
          </div>
        </section>
      )}
    </>
  );
}

/** Wire document types → the renter's words. Only the types the four requests can name; anything else
 *  is humanised from its key rather than guessed at, because a wrong label on a document request is a
 *  request for the wrong paper. */
const DOC_TYPE_LABELS: Record<string, [string, string]> = {
  istimara: ["Registration (Istimara)", "الاستمارة"],
  istimarah: ["Registration (Istimara)", "الاستمارة"],
  registration: ["Registration", "التسجيل"],
  customs: ["Customs card", "البطاقة الجمركية"],
  customs_card: ["Customs card", "البطاقة الجمركية"],
  sale_contract: ["Sale contract", "عقد البيع"],
  sales_contract: ["Sale contract", "عقد البيع"],
  saso_registration: ["SASO registration", "تسجيل ساسو"],
  tuv: ["TÜV certificate", "شهادة TÜV"],
  spsp: ["SPSP certificate", "شهادة SPSP"],
  saso: ["SASO certificate", "شهادة ساسو"],
  aramco: ["Aramco certificate", "شهادة أرامكو"],
  insurance: ["Insurance", "التأمين"],
  operating_license: ["Operator licence", "رخصة المشغّل"],
  operator_license: ["Operator licence", "رخصة المشغّل"],
  operator_tuv: ["Operator TÜV", "شهادة TÜV للمشغّل"],
  operator_spsp: ["Operator SPSP", "شهادة SPSP للمشغّل"],
  operator_id: ["Operator ID", "هوية المشغّل"],
  operator_insurance: ["Operator insurance", "تأمين المشغّل"],
  cr: ["Commercial registration", "السجل التجاري"],
  vat: ["VAT certificate", "الشهادة الضريبية"],
  national_address: ["National address", "العنوان الوطني"],
  local_content: ["Local content", "المحتوى المحلي"],
};
