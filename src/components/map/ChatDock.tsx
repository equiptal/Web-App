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
 * 3. **Every custom card renders as a card** (RM3-AC-48) — the negotiation vocabulary and
 *    `rentee_request_reply` through the same `parseChatCard` + `buildChatCardView` + `ChatCard` the
 *    deal room uses, and the renter's own **`rentee_request` through `RequestCard`**, which is the
 *    prototype's `rRequestCard`: an identity strip naming the machine, the ask, and a live status row.
 *    Never a bare grey pill, and never a row-list where the prototype drew a card.
 *
 * ── Compose → review → send (RM3-AC-17, owner 2026-08-10) ────────────────────────────────────────
 * An ask raised on the surface arrives here as a **draft card** and is not sent until «أرسل الطلب» is
 * pressed. Composing writes nothing — no message, and no deal room, which is the write that freezes
 * the supplier's offered count (004a §4.5). The room is still created by the SEND, one layer up in
 * `useRenteeRequestSender`; this component only shows the card and reports the two presses.
 *
 * ── The composer (owner, 2026-08-11) ────────────────────────────────────────────────────────────
 * «just add things already exist in the existing chat like upload and voice note, the composer».
 * Both are the DEAL ROOM's, lifted rather than rebuilt: `lib/chat/chat-attachments` owns the gate,
 * the caps and the message shape for both surfaces, and `deal-room/VoiceRecorder` is mounted here
 * unchanged. They post through `deliver` — the same room-creating seam a typed message uses — so an
 * upload cannot become a second way to create a `DealRoom` row.
 *
 * Unread is REST (`GET /api/me/received-bids` rows carry `bidId` + `unreadCount`), so the arrival
 * notice is refresh-timed and its copy says *"you have a reply"*, never *"just arrived"*
 * (RM3-AC-64).
 */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Channel } from "stream-chat";
import { ChatCard } from "@/components/deal-room/ChatCard";
import { VoiceRecorder } from "@/components/deal-room/VoiceRecorder";
import { RequestCard } from "@/components/map/RequestCard";
import { fleetMachineResolver } from "@/components/map/request-card-ctx";
import { fetchReceivedBids, fetchStreamToken } from "@/lib/api/client";
import {
  CHAT_ACCEPT,
  CHAT_MAX_MEDIA,
  chatAttachmentFilename,
  chatFileRejection,
  chatSendFailure,
  classifyChatFile,
  saveChatAttachment,
  sendChatAttachment,
  sendChatVoiceNote,
} from "@/lib/chat/chat-attachments";
import { STREAM_API_KEY, leaseStream, watchDealRoom } from "@/lib/chat/stream-connection";
import { ensureDealRoom } from "@/lib/chat/ensure-deal-room";
import type { BidCard } from "@/lib/contract/bids";
import {
  arrivalNotice,
  dockMayReportAsks,
  dockMessageView,
  dockNoticeQuote,
  dockTabs,
  dockTabsWithKnownRooms,
  dockUnreadTotal,
  dockWatchRoomId,
  type DockNotice,
  type DockReplyDigest,
  type DockTab,
} from "@/lib/contract/chat-dock";
import {
  buildChatCardView,
  chatCardOfMessage,
  chatCardTime,
  requestRepliesByRef,
  requestThreadCards,
} from "@/lib/contract/deal-rounds";
import type { FleetMachine } from "@/lib/contract/fleet";
import type { InboxBid } from "@/lib/contract/inbox";
import {
  RENTEE_REQUEST_CARD_TYPE,
  RENTEE_REQUEST_REPLY_CARD_TYPE,
  outstandingAskIdentities,
  type RenteeRequestCardPayload,
  type RenteeRequestDraft,
} from "@/lib/contract/rentee-request";
import {
  ANSWER_CUE_MS,
  answeredAskRefs,
  draftSubject,
  latestAnsweredRef,
  postedSubject,
  replyFoldsIntoAsk,
  requestCardView,
  requestDocLabel,
  type RequestCardCtx,
  type RequestThreadCard,
} from "@/lib/contract/request-card";
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
  /** Read through `dockMessageView` — the deal room renders these, so the dock must not drop them. */
  attachments?: { type?: string; image_url?: string; thumb_url?: string; asset_url?: string; title?: string; mime_type?: string; fallback?: string }[];
  custom?: Record<string, unknown>;
};

export interface ChatDockProps {
  /** The bid this surface is scoped to — the dock's anchor tab, and the counterparty it groups by. */
  bid: BidCard;
  /** The bid's RFQ group, when the route resolved one. Only used when the received-bids feed does not
   *  contain the anchor bid (paging), so the tab strip degrades to "no siblings" rather than to a
   *  wrong group. */
  groupKey?: string | null;
  /**
   * The anchor bid's room **as the surface knows it**, including one the surface's own ask-send just
   * created (owner's UAT, 2026-08-11).
   *
   * Sending a request card is a room-creating act, and until now it was one the dock could not see:
   * the room existed, the card was in it, and the dock waited for `GET /received-bids` to mention it
   * — a wait that never ends at all when the anchor bid is off that feed's first page. The renter
   * sent an ask and the conversation stayed on «لا رسائل بعد».
   *
   * Only ever ADDS a room. It cannot take one away, so a feed that already knows the room wins and a
   * stale prop cannot disconnect a live tab.
   */
  dealRoomId?: string | null;
  /**
   * What the REQUEST asked for — "Crawler Excavator 30 ton" — singular and localised by the surface.
   * The `alternative` cards say it, so the card in the conversation names the same thing the control
   * that raised it named (owner, 2026-08-11).
   */
  typeWord?: string | null;
  /** The anchor bid's fleet, for deriving each request card's state on every render (RM3-AC-18).
   *  Null until it arrives; a sibling tab has none, and its cards then state the ask without claiming
   *  an answer either way. */
  fleet: FleetMachine[] | null;
  /** Bumped by the surface after it sends a request card, so the dock refreshes on **post-send** —
   *  one of the four refresh points of 004a §2.1. */
  sendNonce?: number;
  /**
   * Every ask in this conversation the lessor has not answered, by identity — the renter-facing half
   * of the owner's "one ask, one card" rule (2026-08-10). The surface's ask controls disable
   * themselves from it, so a repeat is a control that says why rather than a live button that 409s.
   *
   * **The channel is the only record of these cards**, and this component is the only thing on the
   * surface that reads it, which is why the report starts here and travels up rather than the other
   * way round.
   *
   * **A report, not a handle** (RM3-AC-49). It hands out opaque strings and receives nothing: there
   * is no selection, no detail, no filter and no marker on the far end of it, so a tab press still
   * moves nothing. It fires for the ANCHOR bid's own conversation only — a sibling tab describes a
   * different room — and only when there is a conversation to read, so a closed dock says nothing
   * rather than saying that nothing is outstanding.
   */
  onOutstandingAsks?: (identities: ReadonlySet<string>) => void;
  /**
   * The ask the renter has composed but not sent (RM3-AC-17). Rendered as a DRAFT card pinned between
   * the stream and the composer — the prototype's `rPendingCard` position — and it opens the dock, so
   * an ask raised from the panel is reviewed where it will live rather than in a dialog of its own.
   *
   * It belongs to the ANCHOR bid: an ask is composed from this surface, and this surface resolves one
   * bid. A draft is therefore only ever shown on the anchor tab.
   */
  draft?: RenteeRequestDraft | null;
  /** «أرسل الطلب». The ONLY thing here that writes — it creates the room if the bid has none. */
  onConfirmDraft?: () => void;
  /** «إلغاء» — discards the draft. Nothing was written, so there is nothing to undo. */
  onCancelDraft?: () => void;
  /** A send is in flight; both draft buttons go inert so the confirm cannot fire twice. */
  draftBusy?: boolean;
  /**
   * Open the machine a request card names (the owner's reason for the card, 2026-08-10: a supplier
   * reading an ask should land on the machine he has to act on). Omitted makes every card inert, which
   * is why {@link canOpenMachine} exists beside it rather than the card guessing.
   */
  onOpenMachine?: (equipmentId: string) => void;
  /** Whether the surface can actually open this machine. The dock knows the FLEET; the surface knows
   *  which of those machines have a detail to open, and a card that looked pressable and did nothing
   *  would be worse than one that never claimed to be. */
  canOpenMachine?: (equipmentId: string) => boolean;
}

export function ChatDock({
  bid,
  groupKey = null,
  dealRoomId = null,
  typeWord = null,
  fleet,
  sendNonce = 0,
  onOutstandingAsks,
  draft = null,
  onConfirmDraft,
  onCancelDraft,
  draftBusy = false,
  onOpenMachine,
  canOpenMachine,
}: ChatDockProps) {
  const t = useT();
  const { locale } = useLocale();
  const ar = locale === "ar";
  const L = useCallback((en: string, arr: string) => (ar ? arr : en), [ar]);

  const [open, setOpen] = useState(false);
  /**
   * WHERE the conversation sits (`rDrawer`'s `chatPlace`, prototype 1573). `fill` is the prototype's
   * default and its stated intent — the conversation *replaces* the map rather than floating over it,
   * flush and square beside the panel, so only ever one thing occupies that space. `mirror` is the
   * original placement, a column on the opposite edge with the map still visible between the two.
   *
   * A view preference and nothing more: it moves no selection, fetches nothing, and changes no
   * message. That is why it lives here rather than in the surface's state.
   */
  const [place, setPlace] = useState<"fill" | "mirror">("fill");
  const [rows, setRows] = useState<InboxBid[]>([]);
  const [activeBidId, setActiveBidId] = useState(bid.id);
  /** Rooms this dock created by sending, before the feed has caught up with them. */
  const [freshRooms, setFreshRooms] = useState<Record<string, string>>({});
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  /** WHICH room {@link messages} were loaded from. The outstanding-ask report is gated on it, so a
   *  set read from a sibling tab can never be reported as the anchor's. */
  const [loadedRoomId, setLoadedRoomId] = useState<string | null>(null);
  const [myStreamId, setMyStreamId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  /** An upload is on the wire. Separate from `busy` only so the attach control can show it. */
  const [uploading, setUploading] = useState(false);
  /** A refused or failed attachment, stated above the composer rather than inside it — this row is
   *  ~340px wide and an error squeezed into it would push the input to nothing. */
  const [fileErr, setFileErr] = useState<string | null>(null);
  /** Mic active → the composer hands its whole row to the recorder (deal-room parity). */
  const [voiceRecording, setVoiceRecording] = useState(false);
  const [dismissedNotice, setDismissedNotice] = useState<string | null>(null);
  /** Ticks on mount · focus · post-send · poll — the four refresh points, and the ONLY moments the
   *  arrival notice is recomputed. That is what makes the notice refresh-timed rather than live. */
  const [refreshTick, setRefreshTick] = useState(0);

  const channelRef = useRef<Channel | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
    // A room this dock just created — or one the SURFACE created by sending a request card — is real
    // even though the feed still says null. Otherwise the tab falls back to compose-only for up to
    // one poll, tries to create a second room, and (when the anchor bid is off the feed's first
    // page) never recovers at all. The rule is `dockTabsWithKnownRooms`.
    return dockTabsWithKnownRooms(base, { fresh: freshRooms, anchorBidId: bid.id, surfaceRoomId: dealRoomId });
  }, [bid, groupKey, rows, freshRooms, dealRoomId]);

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
  /** The room belonging to the bid this surface resolves — the one whose asks gate its controls. */
  const anchorRoomId = tabs.find((tb) => tb.bidId === bid.id)?.dealRoomId ?? null;
  /* **Watched open or shut** (owner's UAT, 2026-08-11). See `dockWatchRoomId`: the channel is the
     only record of a request card, so a dock that read it only while open forgot every ask the
     renter had made the moment he reloaded. Shut, it reads the ANCHOR's room — the conversation the
     surface's ask controls answer to — rather than whichever tab was last selected. */
  const watchRoomId = dockWatchRoomId({ activeRoomId, anchorRoomId, open });

  useEffect(() => {
    if (!STREAM_API_KEY || !watchRoomId || !tokenRoomId) {
      setMessages([]);
      setLoadedRoomId(null);
      channelRef.current = null;
      return;
    }
    let cancelled = false;
    // Opened SYNCHRONOUSLY, before the token fetch — see `leaseStream`. A `held` flag set after the
    // await reads false in a cleanup that runs at unmount, and the reference taken a moment later
    // would never come back.
    const lease = leaseStream();
    let channel: Channel | null = null;
    const onNew = () => {
      if (channel) setMessages([...channel.state.messages] as ChatMsg[]);
    };
    (async () => {
      try {
        const tok = await fetchStreamToken(tokenRoomId);
        if (cancelled || !tok.token || !tok.userId) return;
        const client = await lease.connect(tok.userId, tok.token);
        if (cancelled) return;
        setMyStreamId(tok.userId);
        channel = await watchDealRoom(client, watchRoomId);
        if (cancelled) return;
        channelRef.current = channel;
        setMessages([...channel.state.messages] as ChatMsg[]);
        setLoadedRoomId(watchRoomId);
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
      lease.release();
    };
  }, [watchRoomId, tokenRoomId]);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, open]);

  /* A composed ask OPENS the dock and lands on the anchor tab — the prototype's `composeRequest` sets
     `activePanel='chat'; drawerOpen=true` for the same reason. The renter pressed «اطلب…» somewhere in
     the panel; if the card he now has to confirm were behind a closed dock, the press would look like
     it did nothing. Deliberately keyed on the draft's ARRIVAL only: it must not re-open a dock the
     renter closed while the draft is still staged. */
  useEffect(() => {
    if (!draft) return;
    setOpen(true);
    setActiveBidId(bid.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  /* ── the request loop's context (V11) ────────────────────────────────────────────────────────── */

  /** The fleet, by machine — re-read on EVERY render, because nothing about a request's state is
   *  stored (RM3-AC-18). Only the anchor tab has one; a sibling tab's cards state the ask and say
   *  nothing about the answer, which is honest rather than wrong.
   *
   *  The projection itself is `fleetMachineResolver`, shared with `/deal-room/[id]` since the owner
   *  put the same cards there (2026-08-11) — one answer to what a machine is called and looks like. */
  const machineOf = useMemo(() => fleetMachineResolver(fleet, ar), [fleet, ar]);
  /** Whether the fleet even HOLDS this machine — the `canOpen` fallback, which asks a different
   *  question from "what is it called" and must not resolve a whole projection to answer it. */
  const fleetHas = useCallback((id: string) => machineOf(id) != null, [machineOf]);

  /* ── one ask, one card (owner, 2026-08-10) ─────────────────────────────────────────────────────
     The identities of every ask the lessor has not answered, threaded by `ref` in ONE pass so a
     reply counts whether it arrives before or after its own ask — a channel read is not guaranteed
     to be ordered, and a partially-loaded page must not resurrect an answered question.

     Deliberately NOT the same reading as `requestCtx` above. That one derives a card's STATE from
     the machine, because the lessor usually acts from his fleet page rather than from the card; this
     one asks only "has he replied to this ref", which is exactly what the backend's own guard asks.
     Reading derived state here would let a machine that satisfies an ask silently re-enable a
     control — and the surface already withdraws the control in that case (a confirmed machine has no
     «اطلب التأكيد», a held document is not a requestable row), so there is nothing to gain and one
     more way for the two halves of the guard to disagree. */
  /* The request loop's own cards, out of the message list and in load order — the ONE projection two
     readings share: the outstanding-ask guard below, and the reply card's search for the ask it
     answers (`replyCardView`). Ordinary chat and the negotiation vocabulary travel this list too as
     empty entries, and neither may block a control or be mistaken for an ask. */
  const threadCards: RequestThreadCard[] = useMemo(() => requestThreadCards(messages), [messages]);

  /** `ref` → the supplier's answer, off the SAME projection — so the reply a card consults and the
   *  reply the card renders can never be two different readings of one channel. */
  const repliesByRef = useMemo(() => requestRepliesByRef(threadCards), [threadCards]);

  /* ── V12c · ONE card per request (owner, 2026-08-11) ────────────────────────────────────────────
     *"make it one card for request and show his answer"*. The refs whose ask AND answer are both in
     this window: the ask card carries the answer (through `cardCtx.reply` below), and the reply's own
     card is suppressed in the stream. Decided in the contract layer so `/deal-room/[id]` folds the
     same channel the same way — see the V12c section of `request-card.ts`. */
  const answeredRefs = useMemo(() => answeredAskRefs(threadCards), [threadCards]);

  /* ── …and the light cue that points at it ───────────────────────────────────────────────────────
     *"light plumbing or something to show the answer when opening the chat"*. Folding the answer into
     the question's card puts it wherever the question was asked, which may be well above the newest
     message.

     `latestAnsweredRef` is a stable STRING, and that is what keeps this from firing twice: a poll or a
     `message.new` that leaves the same last answer in place recomputes the same value, the effect does
     not re-run, and no timer restarts. It fires on a NEW answer, and on the dock being opened — the
     moment the owner named — because that is when the thread is read. `open` is a term of the rule for
     the same reason: this dock stays mounted while shut (it watches the anchor's room), so a cue
     started then would burn its five seconds behind a closed drawer. */
  const cueRef = useMemo(() => latestAnsweredRef(threadCards), [threadCards]);
  const [cuedRef, setCuedRef] = useState<string | null>(null);
  useEffect(() => {
    if (!open || !cueRef) {
      // Also the tab switch: a sibling conversation's answer is not this one's.
      setCuedRef(null);
      return;
    }
    setCuedRef(cueRef);
    // FINITE (the keyframes stop themselves after three iterations). This is what takes the class back
    // off, so an unrelated re-render cannot restart the animation.
    const timer = window.setTimeout(() => setCuedRef(null), ANSWER_CUE_MS);
    return () => window.clearTimeout(timer);
  }, [open, cueRef]);

  const outstandingAsks = useMemo(() => outstandingAskIdentities(threadCards), [threadCards]);

  useEffect(() => {
    if (!onOutstandingAsks) return;
    // Silence, never an empty set, when this component has nothing to say: reporting an empty set
    // out of our own ignorance would tell the surface that nothing is outstanding and re-enable a
    // control the renter had just used. The rule is `dockMayReportAsks`, and what it deliberately
    // does NOT ask is whether the dock is open — that question is what made a reload forget every
    // ask (owner's UAT, 2026-08-11).
    if (!dockMayReportAsks({ loadedRoomId, anchorRoomId, messageCount: messages.length })) return;
    onOutstandingAsks(outstandingAsks);
  }, [onOutstandingAsks, outstandingAsks, loadedRoomId, anchorRoomId, messages.length]);

  /** The document vocabulary. ONE table, in `request-card.ts`, since `/deal-room/[id]` renders the
   *  same chips off the same channel (owner, 2026-08-11) — never the raw key, and never two words
   *  for one paper on two surfaces. */
  const docLabel = useCallback((docType: string) => requestDocLabel(docType, L), [L]);

  /*
   * The anchor bid's FIRM used to be assembled here, so a company-scope document ask could be resolved
   * against `compliance` + `companyCertCodes` instead of waiting for a reply card. There is no such ask
   * any more — a document request names a machine (product owner, 2026-08-08) — so the memo, and the
   * `company` resolver it fed, are deleted rather than left dangling.
   */

  /**
   * Everything a request card needs, assembled from the fleet this dock already receives.
   *
   * **The machine is resolved by `equipmentId`, never parsed out of the message text** — the payload's
   * `serial` is display-only (§7.3 stamps it) and is the fallback the view falls back TO, not the
   * source. `photoUrl` comes through the same `heroPhotoUrl` the machine detail uses, so the tile on
   * the card is the picture the renter sees when he presses it.
   *
   * `fleetKnown` is false on a SIBLING tab: that is a different room about a different item, and its
   * fleet is not fetched here. The cards there state the ask and say nothing about the answer.
   */
  const cardCtx: RequestCardCtx = useMemo(
    () => ({
      L,
      fleetKnown: active?.bidId === bid.id && fleet != null,
      machine: machineOf,
      reply: (ref: string) => repliesByRef.get(ref) ?? null,
      docLabel,
      // No handler means no press, whatever the fleet holds — the card must not offer an affordance
      // this host cannot honour.
      canOpen: onOpenMachine ? canOpenMachine ?? fleetHas : () => false,
      // The REQUEST's type, and only on the anchor tab: a sibling tab is a different item, and a card
      // there naming this item's type would name the wrong machine in words.
      typeWord: active?.bidId === bid.id ? typeWord : null,
    }),
    [L, active?.bidId, bid.id, fleet, machineOf, fleetHas, repliesByRef, docLabel, onOpenMachine, canOpenMachine, typeWord],
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
  /**
   * A refusal is an answer that closes a door — «رفض طلبك» — and it takes the bubble's warm tone.
   * `declined` and `unavailable` are the two that close it, and reading them as an ordinary reply is
   * how a "no" gets skimmed past.
   *
   * **`partial` is deliberately NOT one of them** (owner ruling, 2026-08-11, §8: *"Not 'provided',
   * not 'declined'"*). Written as an allow-list of the two refusals rather than as `!== "provided"`,
   * which is what it was: that form silently swept the new resolution into «رفض طلبك» and told the
   * renter the supplier had refused him when the supplier had just sent him a document. The bubble
   * still RAISES for a partial — it is an answer and it is news — it simply is not a refusal.
   */
  const refusal =
    showNotice?.reply != null &&
    (showNotice.reply.resolution === "declined" || showNotice.reply.resolution === "unavailable");

  /**
   * **What was actually said** (owner, 2026-08-11: the bubble *"never shows what was actually
   * said"*).
   *
   * Quoted from the conversation this dock is already watching — `dockWatchRoomId` keeps the ANCHOR
   * bid's channel connected while the dock is shut, which is the only reason the words are in hand
   * at all. Gated on the notice being about that same conversation, and on the messages having been
   * loaded from it: a SIBLING tab is a different room whose messages this component does not hold,
   * and quoting the anchor's last line under a sibling's name would attribute one supplier's words
   * to another's conversation.
   *
   * Nothing here changes the notice's TIMING. `arrivalNotice` above is still refresh-gated; this
   * only decides which words the bubble it already decided to show carries.
   */
  const noticeQuote =
    showNotice && showNotice.bidId === bid.id && loadedRoomId != null && loadedRoomId === anchorRoomId
      ? dockNoticeQuote(messages, myStreamId)
      : null;
  /** The bubble's middle line. The message itself when there are words; the kind of arrival when
   *  there are none (a file, a point, a card) — never an invented sentence. */
  const noticeBody =
    noticeQuote?.text?.trim() ||
    (noticeQuote?.attachment ? t.chatDock.noticeAttachment : null) ||
    (showNotice?.reply ? t.chatDock.noticeTitle : showNotice?.label ?? t.chatDock.itemFallback);

  /* ── sending ─────────────────────────────────────────────────────────────────────────────────── */

  /**
   * **The one seam every send goes through** — the typed message, an attachment and a voice note
   * alike.
   *
   * The first message on a bid with no room is a **room-creating act** (004a §4.5): create, connect,
   * then post. Opening the tab did none of that. An upload that posted on its own would need the
   * same three steps, and a second copy of them is a second place that can create a `DealRoom` row —
   * the write that freezes the lessor's offered count. So the composer's three controls hand this
   * function what to post and know nothing about rooms.
   *
   * Answers whether the post LANDED, because each caller clears something different afterwards (the
   * typed line, the caption, nothing at all) and none of them may clear it on a failure.
   */
  async function deliver(post: (channel: Channel) => Promise<void>): Promise<boolean> {
    if (!active || busy) return false;
    setBusy(true);
    try {
      if (!active.dealRoomId) {
        const roomId = await ensureDealRoom(active.bidId, null);
        setFreshRooms((prev) => ({ ...prev, [active.bidId]: roomId }));
        // The effect above reconnects on the new room id; what the renter composed is kept until the
        // post lands, so it is not lost between creating the room and having a channel to put it in.
        const tok = await fetchStreamToken(roomId);
        // No token is a failure, not a silent success: the room exists but nothing was posted, and
        // reporting otherwise would clear the renter's message into a room it never reached.
        if (!tok.token || !tok.userId) return false;
        // `finally`, not a trailing release: a throw out of `watchDealRoom` or the post is swallowed
        // by the outer catch below, and without this the reference would leak there too.
        const lease = leaseStream();
        try {
          const client = await lease.connect(tok.userId, tok.token);
          const channel = await watchDealRoom(client, roomId);
          await post(channel);
        } finally {
          lease.release();
        }
      } else {
        if (!channelRef.current) return false;
        await post(channelRef.current);
      }
      refresh();
      return true;
    } catch {
      /* keep what the renter composed — a failed send must not swallow it */
      return false;
    } finally {
      setBusy(false);
    }
  }

  /** The typed message. */
  async function send() {
    const body = text.trim();
    if (!body) return;
    if (await deliver(async (channel) => { await channel.sendMessage({ text: body }); })) setText("");
  }

  /**
   * ONE attachment, through the deal room's own gate and upload (`lib/chat/chat-attachments`).
   *
   * A refusal — wrong type, over the cap — never touches the channel, so it costs no spinner and
   * cannot create a room. What survives the gate goes down {@link deliver} like any other message,
   * which is what makes a file sent from the map indistinguishable from one sent in the deal room.
   */
  async function sendFiles(files: FileList | null) {
    // App parity: one attachment per message — take the first only.
    const file = files?.[0];
    if (!file || uploading) return;
    setFileErr(null);
    const verdict = classifyChatFile(file);
    if (!verdict.ok) { setFileErr(chatFileRejection(verdict, L)); return; }
    setUploading(true);
    // The composer's line rides along as the caption, exactly as it does in the deal room.
    const caption = text;
    const sent = await deliver((channel) => sendChatAttachment(channel, file, verdict.kind, caption));
    setUploading(false);
    if (sent) setText("");
    else setFileErr(chatSendFailure("attachment", L));
  }

  /** A recorded voice note, down the same seam. `VoiceRecorder` has already applied the cap. */
  async function sendVoiceNote(file: File) {
    setFileErr(null);
    setUploading(true);
    const sent = await deliver((channel) => sendChatVoiceNote(channel, file));
    setUploading(false);
    if (!sent) setFileErr(chatSendFailure("voice", L));
  }

  /* ── render ──────────────────────────────────────────────────────────────────────────────────── */

  const tabLabel = (tab: DockTab) => tab.label ?? t.chatDock.itemFallback;

  /** The header avatar's letters (`pChat`'s `initials`). Two words at most — a firm name runs long in
   *  both scripts, and three letters in a 42px circle is a smudge. */
  const initials =
    bid.supplierName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => [...w][0] ?? "")
      .join("") || "—";

  return (
    <>
      {/* The dock control — the only global action on the surface, and gone while the conversation is
          open: `rChatDock` returns null in that state and says why, *"while the conversation is open
          it IS the affordance — a button under it would be a second one."* The drawer's own ✕ closes
          it, so there is one control for one state rather than two that both claim to toggle. */}
      {!open && (
        <button type="button" className="bm-dock" onClick={() => setOpen(true)} aria-expanded={false}>
          <span className="material-icons-outlined">forum</span>
          <span className="bm-dock-label">{t.chatDock.title}</span>
          {unreadTotal > 0 && (
            <span className="bm-dock-badge" dir="ltr">{unreadTotal > 99 ? "99+" : unreadTotal}</span>
          )}
        </button>
      )}

      {/* ── The arrival bubble (004a §2.1, the prototype's `rChatPop`) ────────────────────────────
          Anchored to the dock by a tail, refresh-timed, and worded as a STATE ("you have a reply")
          rather than an event ("just arrived") — there is no socket behind it (RM3-AC-64).

          **A white card that QUOTES the message** (owner, 2026-08-11). It was a solid blue slab
          reading «رسالة جديدة» over the supplier's name over the item's type: three things the
          renter already knew, and not one word of what was actually said. Now it reads as a message
          does — who it is from, a chip saying it answers his request, the words themselves, and the
          reference underneath — on white, because a card that quotes someone has to look like paper
          rather than like a banner.

          The refusal distinction SURVIVES the change of fill: it moves from the card's ground to the
          chip and the rail down the leading edge, so the one arrival a renter must not miss still
          looks different before it is read — and warm rather than red, because red on this surface
          belongs to availability alone. */}
      {showNotice && !open && (
        <div className={`bm-dock-notice${refusal ? " is-refusal" : ""}`} role="status">
          <span className="bm-dock-notice-tail" aria-hidden="true" />
          <div className="bm-dock-notice-head">
            {/* Who is speaking, then in a chip what this is — an answer to HIS request, which is
                what makes the quote below worth reading before the dock is even opened. */}
            <span className="bm-dock-notice-t">{bid.supplierName}</span>
            <span className="bm-dock-notice-kind">
              {refusal ? t.chatDock.kindRefusal : showNotice.reply ? t.chatDock.kindReply : t.chatDock.kindMessage}
            </span>
            <span className="bm-dock-notice-spacer" />
            <button type="button" className="bm-dock-notice-x" onClick={() => setDismissedNotice(noticeKey)} aria-label={t.chatDock.dismiss}>
              ✕
            </button>
          </div>
          <button type="button" className="bm-dock-notice-body" onClick={() => { setActiveBidId(showNotice.bidId); setOpen(true); }}>
            {/* The message. Clamped to three lines by the stylesheet — the bubble quotes the arrival
                and hands off; a bubble that grows with the message becomes the conversation. */}
            <div className="bm-dock-notice-x2">{noticeBody}</div>
            {showNotice.reply && (
              <div className="bm-dock-notice-s">
                {`↩ ${showNotice.reply.ref}${showNotice.reply.serial ? ` · ${showNotice.reply.serial}` : ""}`}
              </div>
            )}
          </button>
        </div>
      )}

      {open && (
        <section className={`bm-chat dlproto is-${place}`} aria-label={t.chatDock.title}>
          {/* ── The identity band (`pChat`, prototype 05:17–24) ────────────────────────────────
              WHITE, with the counterparty's initials in a circle and his name in dark ink (owner,
              2026-08-11: *"the dock header is blue — make it white"*). It was `pChat`'s blue band
              for a day; on this surface blue means an ACTION, and 64px of it was spent saying
              something that is not one — who you are talking to — while fighting the pale bubbles
              and the blue kind-line of the cards in the same column. See `map-proto.css`.

              What the prototype draws here and this does NOT: the presence dot, the two simulator
              buttons and the call control. All three were excluded by name, so the band carries the
              identity and the two controls that are real — where the conversation sits, and closing
              it. */}
          <header className="bm-chat-head">
            <span className="bm-chat-av" aria-hidden="true">{initials}</span>
            <span className="bm-chat-who">
              {bid.supplierName}
              {bid.verified && <span className="bm-chat-tick material-icons-outlined">verified</span>}
            </span>
            {/* ONE control decides the placement (prototype 1590). Not a resize handle — there are two
                placements, not a continuum, and each is a whole layout rather than a width. */}
            <button
              type="button"
              className="bm-chat-place"
              onClick={() => setPlace((p) => (p === "fill" ? "mirror" : "fill"))}
              aria-label={place === "fill" ? t.chatDock.placeMirror : t.chatDock.placeFill}
              title={place === "fill" ? t.chatDock.placeMirror : t.chatDock.placeFill}
            >
              <span className="material-icons-outlined">
                {place === "fill" ? "vertical_split" : "open_in_full"}
              </span>
            </button>
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
                /* ── WHOSE message this is, and why it is asked of the channel ──────────────────
                   Owner, 2026-08-11: *"not floating cards in the middle, same on the supplier view
                   make these cards appear like messages sent by the other side or by me whether the
                   request or the response."*

                   So the side is read from the Stream AUTHOR, exactly as the plain bubbles below
                   read it, and never from the card's TYPE. Type worked only because this surface
                   happens to be the renter's: "an ask is mine, a reply is theirs" is true from his
                   chair and inverted from the supplier's, and the two of them read the SAME channel.
                   Authorship is the one reading that is correct from both. */
                const mine = myStreamId != null && m.user?.id === myStreamId;
                // The renter's own ask keeps its CARD form — he and the supplier look at the same
                // object, and it is the one thing in the thread with an identity strip and a live
                // verdict on it. The prototype renders it with the same function it renders the draft
                // with, which is why one component serves both.
                if (card?.type === RENTEE_REQUEST_CARD_TYPE) {
                  return (
                    // A card is a MESSAGE in the stream, so it takes a side and a width like one
                    // (`chatMsg`, prototype 05:141) — the author's side, hugging his edge. Stretched
                    // across the full column it read as a banner the conversation was wrapped around
                    // rather than as something either party said.
                    <div key={m.id} className={`bm-chat-card ${mine ? "is-mine" : "is-them"}`}>
                      <RequestCard
                        view={requestCardView(postedSubject(card.card), cardCtx)}
                        onOpenMachine={onOpenMachine}
                        openLabel={t.chatDock.openMachine}
                        // The SAME formatter `ChatCard` prints — one clock face in one thread (AC-16).
                        at={chatCardTime(m.created_at, ar)}
                        // The answer landed HERE rather than at the foot of the thread, so this is the
                        // card that has to announce itself (V12c). Finite, and off by itself.
                        cue={cuedRef != null && cuedRef === card.card.ref}
                      />
                    </div>
                  );
                }
                /* ── The ANSWER has no card of its own (owner, 2026-08-11) ───────────────────────
                   *"why the cards each one on different side… make it one card for request and show
                   his answer."*

                   This morning's ruling — *"the supplier response must arrive in the same format of
                   the sent card"* — is WITHDRAWN and its second card with it. It was built by
                   `replyCardView`, which rendered the ask's view again under the reply; because each
                   card is sided by its own author (which is still right), the two landed on opposite
                   edges of the column, both saying the answer, in different words. The renter's ask
                   card now carries it, in the reply's own kind-specific wording — see the V12c
                   sections of `request-card.ts`.

                   The FALLBACK is untouched and is why this is a suppression rather than a deletion:
                   an answer whose question is NOT in the loaded window — an older page, a partial
                   channel read — has nothing to fold into, so it falls through to the bare `ChatCard`
                   form below, which states the reference and the answer and names no equipment
                   nobody read. Suppressing it there would delete the answer from the conversation. */
                if (card?.type === RENTEE_REQUEST_REPLY_CARD_TYPE && replyFoldsIntoAsk(answeredRefs, card.reply)) {
                  return null;
                }
                if (card) {
                  // EVERY other custom type renders as a card — the negotiation vocabulary and the
                  // supplier's reply that could not be paired with its ask alike. Never a bare grey
                  // pill (RM3-AC-48).
                  const view = buildChatCardView(card, {
                    ar, L, terms: [], at: m.created_at, responded: false, superseded: false,
                    // The dock never negotiates: it shows the conversation and hands off to
                    // `/deal-room/[id]` (004a §4a.2). `live: false` is what removes accept/counter
                    // from a rate card here, so there is exactly one place a rate can be accepted.
                    live: false,
                  });
                  const chatCard = <ChatCard view={view} ar={ar} L={L} busy={false} onAccept={() => {}} onCounter={() => {}} />;
                  // An ANSWER is a message of whoever wrote it, so it takes his side the way the ask
                  // takes its author's (prototype 05:140) — his own answer hugs his edge on his
                  // screen and the other edge on the asker's, off the one reading both share. The
                  // negotiation vocabulary is not sided: those cards are events in the room rather
                  // than either party's remark.
                  return card.type === RENTEE_REQUEST_REPLY_CARD_TYPE ? (
                    <div key={m.id} className={`bm-chat-card ${mine ? "is-mine" : "is-them"}`}>{chatCard}</div>
                  ) : (
                    // An EVENT in the room — a rate, a counter, an acceptance. It belongs to the
                    // conversation rather than to either party, so it is centred rather than sided.
                    // The class exists because `ChatCard` centres itself with `align-self`, which a
                    // wrapper turns inert: without it the "not sided" card silently took a side.
                    <div key={m.id} className="bm-chat-event">{chatCard}</div>
                  );
                }
                // NOT `if (!m.text) return null`. The dock and `/deal-room/[id]` read the SAME
                // channel, so a message the deal room shows and the dock drops is the renter seeing
                // an unread badge, opening the dock, and finding nothing — unread counts every
                // message. Only a message with no text, no attachment and no point is skipped.
                const view = dockMessageView(m);
                if (view.empty) return null;
                return (
                  <div key={m.id} className={`msg ${mine ? "mine" : "them"}`}>
                    {view.location ? (
                      <a
                        href={`https://www.google.com/maps?q=${view.location.lat},${view.location.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="msg-att-file msg-loc"
                      >
                        <span className="material-icons-outlined">place</span>
                        <span className="msg-att-name">{view.text ?? L("Shared location", "موقع مشترك")}</span>
                      </a>
                    ) : (
                      view.text
                    )}
                    {/* The element OPENS the attachment; «حفظ» beside it KEEPS it — opening a paper
                        in a browser tab is not having a copy of it, which is the owner's point
                        (2026-08-11: documents in this chat need a download, *"same as existing
                        behaviour of existing deal room"*).

                        Deliberately the deal room's own `saveChatAttachment` and its own `.msg-att-dl`
                        markup, not a second implementation: both surfaces show the same files off the
                        same channel, so a file saved from the map must land on disk under the same
                        name it lands under from the deal room. Translating still stays in
                        `/deal-room/[id]` — the dock shows the conversation and hands off (004a
                        §4a.2). */}
                    {view.attachments.map((a, i) => (
                      <Fragment key={i}>
                        {a.kind === "image" ? (
                          <a href={a.url ?? undefined} target="_blank" rel="noopener noreferrer" className="msg-att-img">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={a.thumbUrl ?? a.url ?? ""} alt={a.title ?? ""} style={{ maxWidth: "100%" }} />
                          </a>
                        ) : a.kind === "audio" ? (
                          <audio controls preload="none" src={a.url ?? undefined} style={{ display: "block", maxWidth: "100%", marginTop: 6 }} />
                        ) : (
                          <a href={a.url ?? undefined} target="_blank" rel="noopener noreferrer" className="msg-att-file">
                            <span className="material-icons-outlined">
                              {(a.mimeType ?? "").includes("pdf") ? "picture_as_pdf" : "insert_drive_file"}
                            </span>
                            <span className="msg-att-name">{a.title ?? L("Attachment", "مرفق")}</span>
                          </a>
                        )}
                        {a.url && (
                          <button
                            type="button"
                            className="msg-att-dl"
                            onClick={() => void saveChatAttachment(a.url as string, chatAttachmentFilename({ title: a.title, url: a.url }))}
                          >
                            <span className="material-icons-outlined">download</span>
                            {t.chatDock.save}
                          </button>
                        )}
                      </Fragment>
                    ))}
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
          </div>

          {/* ── The review card (RM3-AC-17) ─────────────────────────────────────────────────────
              Pinned between the stream and the composer, where `rPendingCard` puts it — it must not
              scroll away with the conversation it is about to join. Shown on the ANCHOR tab only: the
              ask was composed from this surface, and this surface resolves one bid.

              Nothing has been written at this point. «إلغاء» leaves no trace, and «أرسل الطلب» is
              what creates the room and posts the card. */}
          {draft && activeBidId === bid.id && (
            <div className="bm-chat-draft">
              <RequestCard
                view={requestCardView(draftSubject(draft), cardCtx, { draft: true })}
                draft
                busy={draftBusy}
                onCancel={onCancelDraft}
                onConfirm={onConfirmDraft}
                onOpenMachine={onOpenMachine}
                openLabel={t.chatDock.openMachine}
                cancelLabel={t.chatDock.draftCancel}
                confirmLabel={t.chatDock.draftSend}
              />
            </div>
          )}

          {/* A refusal or a failed upload, in its own row. It is about the composer, not about the
              conversation, so it must not enter the stream and scroll away. */}
          {fileErr && <div className="bm-chat-err" role="status">{fileErr}</div>}

          {/* ── The composer (owner, 2026-08-11) ────────────────────────────────────────────────
              «just add things already exist in the existing chat like upload and voice note, the
              composer». So: the deal room's OWN attach control and its OWN `VoiceRecorder`, sending
              through the seam above — not a second upload path, and nothing the product does not
              already have. Geometry is the prototype's (05:42–45); see `map-proto.css`.

              Every control goes inert while a send is in flight, the attach and the mic included: a
              second press during the room-creating first message would race the create. */}
          <div className="bm-chat-compose">
            {/* The recorder takes the WHOLE row while it is running (deal-room parity) — at this
                width a timer, a cancel and a send cannot share the row with an input. */}
            {!voiceRecording && (
              <>
                <button
                  type="button"
                  className="ib"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={busy || uploading || !active}
                  aria-label={t.chatDock.attach}
                  title={t.chatDock.attach}
                >
                  <span className="material-icons-outlined">{uploading ? "hourglass_top" : "attach_file"}</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={CHAT_ACCEPT}
                  hidden
                  // Cleared on the way out so choosing the SAME file twice still fires `change`.
                  onChange={(e) => { void sendFiles(e.target.files); e.target.value = ""; }}
                />
              </>
            )}
            <VoiceRecorder
              disabled={busy || uploading || !active}
              ar={ar}
              L={L}
              maxBytes={CHAT_MAX_MEDIA}
              onRecordingChange={setVoiceRecording}
              onRecorded={(f) => void sendVoiceNote(f)}
              onError={setFileErr}
            />
            {!voiceRecording && (
              <>
                <input
                  className="bm-chat-input"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
                  placeholder={t.chatDock.placeholder}
                  disabled={busy || uploading || !active}
                />
                <button
                  type="button"
                  className="bm-chat-send"
                  onClick={() => void send()}
                  disabled={busy || uploading || !text.trim() || !active}
                  aria-label={t.chatDock.send}
                  title={t.chatDock.send}
                >
                  {/* The glyph is mirrored in CSS with the script, not swapped for another icon. */}
                  <span className="material-icons-outlined">send</span>
                </button>
              </>
            )}
          </div>
        </section>
      )}
    </>
  );
}
