"use client";

import { useCallback, useEffect, useMemo, useRef, useState, Fragment } from "react";
import { useRouter } from "next/navigation";
import { type Channel } from "stream-chat";
import { useLocale } from "@/lib/i18n";
import { STREAM_API_KEY, leaseStream } from "@/lib/chat/stream-connection";
import { useHeaderBack } from "@/components/AppShell";
import { fetchBidFleet, fetchBids, fetchRequestDetail, fetchRequestGroup, fetchDealRoom, fetchStreamToken, fetchQuotation, proposeRate, acceptDeal, batchUpdateTerms, releaseDeal, withdrawAcceptance, closeDealRoom, ApiError } from "@/lib/api/client";
import { computeDealTotals, buildDealRoomQuotationDoc, quotationLinkKind, lastTermMove, type DealRoomView, type DealTerm, type QuotationView } from "@/lib/contract/deal-room";
import { reconstructRounds, collapseRounds, latestRoundBy, withOpeningRound, liveRound, roundOverride, chatCardOfMessage, chatCardTime, buildChatCardView, requestRepliesByRef, requestThreadCards, respondedProposalIds, latestProposalId, type DealRound } from "@/lib/contract/deal-rounds";
import type { FleetMachine } from "@/lib/contract/fleet";
import { RENTEE_REQUEST_CARD_TYPE, RENTEE_REQUEST_REPLY_CARD_TYPE } from "@/lib/contract/rentee-request";
import { ANSWER_CUE_MS, answeredAskRefs, latestAnsweredRef, postedSubject, replyFoldsIntoAsk, requestCardView, requestDocLabel, type RequestCardCtx } from "@/lib/contract/request-card";
import { valText, type ResolutionsMap } from "@/components/deal-room/DealRoomTerms";
import { cityLabel, rentalTypeLabel, urgencyLabel, termValueLabel } from "@/lib/contract/labels";
import { buildSiblingTabs, type SiblingItemTab } from "@/lib/contract/sibling-tabs";
import { dealSystemEventIcon } from "@/lib/contract/deal-system-event";
import type { BidCard } from "@/lib/contract/bids";
import { ChatCard } from "@/components/deal-room/ChatCard";
import { RequestCard } from "@/components/map/RequestCard";
import { fleetMachineResolver } from "@/components/map/request-card-ctx";
import { VoiceRecorder } from "@/components/deal-room/VoiceRecorder";
// Extracted so the map's chat dock mounts the SAME sheet rather than growing a second answer to
// "call the supplier" (owner, 2026-08-19). Its own file carries the reasoning.
import { CallModal } from "@/components/deal-room/CallModal";
// Extracted alongside `CallModal` so the map's chat dock can offer the same cancellation, with the
// same six reasons the supplier will be shown (owner, 2026-08-19).
import { CancelReasonsModal } from "@/components/deal-room/CancelReasonsModal";
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
  type ChatAttachment,
} from "@/lib/chat/chat-attachments";
import { renderQuotationSection, wrapQuotationPage } from "@/lib/quotation/render";
import "@/components/deal-room/deal-room-proto.css";
import { computeQuoteTotals, computeRentalTotal, divisorNote } from "@/lib/pricing/rental";

// The attachment shape is the SHARED one — this surface and the map's chat dock read the same
// channel, so a second declaration here is a second thing to keep in step.
type StreamAttachment = ChatAttachment;
// `custom` carries the app's round payload (type:'rate_proposal', …) + location kind; i18n carries
// Stream's message translations. Both are read defensively (reconstructRounds / the translate toggle).
type ChatMsg = { id: string; text?: string; user?: { id?: string }; created_at?: string | Date; attachments?: StreamAttachment[]; custom?: Record<string, unknown>; i18n?: Record<string, unknown> };

/** Deal-room rounds → the standing supplier/rentee snapshots, for the allMatched gate + history. */
function roomOpeningRound(room: DealRoomView) {
  return {
    rate: room.rate, priceUnit: room.priceUnit, mobPrice: room.mobPrice, demobPrice: room.demobPrice,
    rentalUnits: room.agreedUnits ?? room.numberOfUnits, mobUnits: room.mobUnits, demobUnits: room.demobUnits,
    mobExcluded: room.mobExcluded, demobExcluded: room.demobExcluded,
  };
}
const eqNum = (a: number | null, b: number | null) => (a == null || b == null ? a == b : Math.round(a) === Math.round(b));
/** Total for one reconstructed round. The ladder itself is `roundOverride`, in the contract. */
function roundTotals(room: DealRoomView, r: DealRound) {
  return computeDealTotals(room, roundOverride(room, r));
}

/** The room's live position, from the raw message list: reconstruct the rounds, take the last. */
function liveRoundOf(room: DealRoomView, msgs: readonly unknown[]): DealRound | null {
  return liveRound(withOpeningRound(collapseRounds(reconstructRounds(msgs as unknown[])), roomOpeningRound(room)));
}

const nf = (n: number) => Math.round(n).toLocaleString("en-US");
type LFn = (en: string, arr: string) => string;

/** A chat attachment's filename. `attName` produces a LOCALISED label for the bubble ("مرفق"), which is
 *  the wrong thing to write to disk — prefer the real title, then the name off the URL. The rule and
 *  the save itself moved to `lib/chat/chat-attachments` when the map's dock grew the same control:
 *  one channel, one answer to what a file is called (owner, 2026-08-11). */
function attFilename(a: StreamAttachment): string {
  return chatAttachmentFilename({ title: a.title, url: a.asset_url || a.image_url || a.thumb_url });
}

/**
 * The rentee's quotation, as an HTML page.
 *
 * A thin wrapper now: the document itself is built by `buildDealRoomQuotationDoc`, which reads the LIVE
 * room the way the app does. It used to be built here out of a HYBRID of the frozen `Quotation` row and
 * the room — see that function for exactly which fields moved.
 *
 * A PREVIEW does not auto-print. The app never prints either; and offering a print dialog for a document
 * that is explicitly not final invites a mid-negotiation draft onto paper as if it were the deal. The
 * FINAL keeps auto-print, because that is what the Download CTA promises.
 */
function buildQuotationHtml(
  room: DealRoomView,
  q: QuotationView | null,
  rentee: { name: string; phone?: string | null; email?: string | null },
  ar: boolean,
  L: LFn,
  /** The room’s live position, so the paper and the price bar cannot print two different deals. */
  live?: DealRound | null,
): string {
  const kind = quotationLinkKind(room.status) ?? "preview";
  const doc = buildDealRoomQuotationDoc(room, q, rentee, ar, L, {
    logoUrl: typeof window !== "undefined" ? `${window.location.origin}/moedatech-logomark.svg` : undefined,
  }, live ? roundOverride(room, live) : null);
  return wrapQuotationPage(renderQuotationSection(doc), {
    lang: doc.lang,
    title: kind === "final" ? L("Final quotation", "عرض السعر النهائي") : L("Preview quotation", "معاينة عرض السعر"),
    autoPrint: kind === "final",
  });
}

export function DealRoom({ id, onTitle, initialFlow }: {
  id: string;
  onTitle?: (t: string) => void;
  /**
   * Open one of the two flows on arrival — the deep link behind `/deal-room/[id]?act=counter|accept`
   * (owner, 2026-08-11).
   *
   * The rentee-map price footer's buttons are *these* buttons pressed from a surface that cannot host
   * the flow (004a §4a.2); without this they landed the renter on the room and asked him to press
   * Negotiate again for the thing he had already asked for. It seeds `openFlow` and nothing else — no
   * part of the flow is reachable, or duplicated, through this prop.
   */
  initialFlow?: "counter" | "accept";
}) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  /* `useCallback`, as the map's dock declares the same helper. Identical semantics — it is still
     "pick the string for this script" — but a STABLE reference, which the request-card context below
     lists as a dependency. Re-created every render it would rebuild that context on every render,
     which is the one thing a memo exists not to do. */
  const L = useCallback((en: string, arr: string) => (ar ? arr : en), [ar]);
  const router = useRouter();
  // In-app Back arrow in the AppShell header → the Inbox (the deal-room list). A deal room is a
  // drill-down, so this gives an explicit way up instead of relying on the browser back button.
  useHeaderBack(() => router.push("/inbox"));

  const [room, setRoom] = useState<DealRoomView | null>(null);
  const [error, setError] = useState(false);
  const [breakdown, setBreakdown] = useState(false);
  const [priceAll, setPriceAll] = useState(false); // price-bar للكل/للوحدة toggle (per-unit default)
  const [busy, setBusy] = useState(false);
  // App parity: a single guided flow modal (3 steps: Terms → Price → Summary) handles both Counter and
  // Accept. `flowMode` picks which — null = closed.
  const [flowMode, setFlowMode] = useState<"counter" | "accept" | null>(null);
  const [counterErr, setCounterErr] = useState<string | null>(null);
  const [callOpen, setCallOpen] = useState(false); // call-supplier modal (shows the number + dial/copy)
  const [menuOpen, setMenuOpen] = useState(false); // ⋮ kebab (equipment · company · cancel)
  const [showRequest, setShowRequest] = useState(false); // request-summary modal, off the header chip
  const [cancelOpen, setCancelOpen] = useState(false); // cancel-the-deal reasons modal
  const [cancelling, setCancelling] = useState(false);
  const [cancelErr, setCancelErr] = useState<string | null>(null);
  const [siblingTabs, setSiblingTabs] = useState<SiblingItemTab[]>([]);
  // Touch device → dial (tel:). Desktop/laptop → just SHOW the number (you can't place a call from a laptop).
  const [canCall, setCanCall] = useState(false);
  useEffect(() => { setCanCall(typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches === true); }, []);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [quoteErr, setQuoteErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const [voiceRecording, setVoiceRecording] = useState(false); // mic active → composer hands its row to the recorder
  const [releaseOpen, setReleaseOpen] = useState(false); // reopen-accepted-deal confirm modal
  const [releasing, setReleasing] = useState(false);
  const [releaseErr, setReleaseErr] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState(false); // withdraw a pending acceptance (AWAITING)
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // App parity: term accept/counter are collected LOCALLY here and submitted once (batched) on
  // Counter/Accept — nothing is PATCHed per click.
  const [resolutions, setResolutions] = useState<ResolutionsMap>({});

  /**
   * ── V12b · the bid's fleet, so a request card can be a CARD here too (owner, 2026-08-11) ────────
   * The ruling: *"i want it like request card"*. The map's chat dock renders the renter's ask — and
   * the supplier's answer — as the prototype's `rRequestCard`: an identity strip naming the machine,
   * the ask, and a live status row. This route rendered the SAME two messages off the SAME channel as
   * a title and a list of key/value rows, because the one thing it lacked was the machine's NAME:
   * `RenteeRequestCardPayload` carries `equipmentId` and a display-only `serial` (§7.3) and no label,
   * so the name can only come from the fleet.
   *
   * So the fleet is fetched here, by the SAME client function the map uses (`fetchBidFleet`, keyed by
   * bid because `inBid`/`yardConfirmed` are only meaningful relative to one bid). Three properties
   * this state exists to guarantee, in order of how badly each would hurt:
   *
   * 1. **The conversation never waits for it.** `null` is the initial value and the thread renders
   *    immediately; the cards fill in when it lands. A chat that blocks on a fleet read is a chat
   *    broken by an endpoint that has nothing to do with talking.
   * 2. **A failure changes nothing.** The catch leaves this `null`, which is exactly the state this
   *    route was in before today — `fleetKnown: false`, the generic `ChatCard`, the ask stated and no
   *    verdict claimed. Latching a failure flag would only give the surface something to say about it,
   *    and there is nothing here to say it in.
   * 3. **It is a READ.** Opening a deal room that already exists creates nothing, and this must not
   *    become a second write path — `GET` all the way down.
   */
  const [fleet, setFleet] = useState<FleetMachine[] | null>(null);

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [myStreamId, setMyStreamId] = useState<string | null>(null);
  const [chatReady, setChatReady] = useState(false);
  const [text, setText] = useState("");
  // deal-room/chat parity — per-message inline translation (incoming text only): id → translated text.
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [translating, setTranslating] = useState<string | null>(null);
  const channelRef = useRef<Channel | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const roomRefetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const errMsg = (e: unknown, fb: string) => (e instanceof ApiError ? (ar ? e.messageAr : e.detail) || fb : fb);

  const loadRoom = () => fetchDealRoom(id).then(setRoom).catch(() => setError(true));
  // Reopen an accepted (CLOSED) deal for re-negotiation (app parity: "release"). Backend flips
  // CLOSED → NEGOTIATING and re-arms the bid; loadRoom then brings the terms/price card + composer back.
  async function doRelease() {
    setReleaseErr(null);
    setReleasing(true);
    try {
      await releaseDeal(id);
      setReleaseOpen(false);
      await loadRoom();
    } catch (e) {
      setReleaseErr(e instanceof ApiError ? e.message : L("Couldn't reopen the deal. Please try again.", "تعذّر إعادة فتح الصفقة. حاول مرة أخرى."));
    } finally {
      setReleasing(false);
    }
  }

  // Cancel the negotiation (app parity: `DealRoomCloseRequested`). Backend flips the room to
  // ABANDONED and releases whatever the bid was holding; loadRoom then renders the read-only room.
  //
  // The reason text is what the renter picked in the modal — one of the five canned reasons, or his
  // own words under "Other". It is sent as written rather than as a code because that is what the
  // backend stores and what the supplier is shown.
  async function doCancel(reasonText: string) {
    setCancelErr(null);
    setCancelling(true);
    try {
      await closeDealRoom(id, reasonText);
      setCancelOpen(false);
      await loadRoom();
    } catch (e) {
      setCancelErr(errMsg(e, L("Couldn't cancel the deal. Please try again.", "تعذّر إلغاء الصفقة. حاول مرة أخرى.")));
    } finally {
      setCancelling(false);
    }
  }

  // deal-room/negotiation — withdraw a pending acceptance (AWAITING → NEGOTIATING). App parity:
  // "withdraw acceptance"; backend clears the reserved units + re-arms the bid, loadRoom restores the
  // negotiate controls. Distinct from release (which reopens a CLOSED deal).
  async function doWithdraw() {
    if (withdrawing) return;
    setWithdrawing(true);
    try {
      await withdrawAcceptance(id);
      await loadRoom();
    } catch (e) {
      window.alert(errMsg(e, L("Couldn't withdraw right now — please try again.", "تعذّر سحب القبول الآن — حاول مرة أخرى.")));
    } finally {
      setWithdrawing(false);
    }
  }

  // The rentee's quotation — ALWAYS RENDERED, never a stored file, at any status (app parity:
  // `bid_quotation_page` re-renders from a fresh `getBidDetail` on every open).
  //
  // ⚠ The app is NOT missing a PDF button — it has one. What it has no path to is a STORED file: its
  // "تنزيل PDF" rasterizes the document it has just rendered (`buildRasterizedQuotationPdf`) rather than
  // downloading one the server made. What is commented out is the SERVER-side generation, in the
  // backend's `confirmDeal`. So "the app always renders" is about the source of the document, not about
  // the absence of an export.
  //
  // This used to prefer `q.pdfUrl` and open the stored PDF instead of rendering. Server-side generation
  // was switched off on 2026-06-23, so only deals closed before then have a file — but
  // `POST /quotation/retry-pdf` accepts PENDING and can still mint one for ANY deal, and from that
  // moment that deal's quotation stopped being live forever. The endpoint stays (owner's call); it is
  // the RENDERER that no longer defers to it. A pre-June deal now shows the same rendered document
  // every other deal shows, built from the room that deal closed on.
  //
  // The Quotation row exists only once the deal is CLOSED — `GET .../quotation` 404s before that — so
  // the fetch is best-effort and `null` is a perfectly good answer. It supplies only the formal
  // quotation number and the supplier's e-mail; every other value comes off the live room.
  async function openQuotation() {
    if (quoteBusy || !room) return;
    setQuoteBusy(true);
    setQuoteErr(null);
    try {
      const q = await fetchQuotation(id).catch(() => null);
      // The buyer block, live from the signed-in rentee (the app fills it from the profile the same way).
      let rentee: { name: string; phone?: string | null; email?: string | null } = { name: "" };
      try {
        const meRes = await fetch("/api/me", { cache: "no-store" });
        if (meRes.ok) {
          const d = (await meRes.json()) as {
            user?: { firstName?: string | null; lastName?: string | null; companyName?: string | null; phone?: string | null; email?: string | null };
          };
          const u = d.user ?? {};
          rentee = {
            name: (u.companyName?.trim() || [u.firstName, u.lastName].filter(Boolean).join(" ")) ?? "",
            phone: u.phone ?? null,
            email: u.email ?? null,
          };
        }
      } catch {
        /* the buyer block is best-effort */
      }
      const w = window.open("", "_blank");
      if (!w) {
        setQuoteErr(L("Allow pop-ups to open the quotation.", "اسمح بالنوافذ المنبثقة لفتح عرض السعر."));
        return;
      }
      // The SAME live position the price bar prices on — a paper that re-derived from the room’s
      // columns would print the last agreement under a heading the renter just read a counter on.
      w.document.write(buildQuotationHtml(room, q, rentee, ar, L, liveRoundOf(room, messages)));
      w.document.close();
    } catch (e) {
      setQuoteErr(errMsg(e, L("Couldn’t load the quotation.", "تعذّر تحميل عرض السعر.")));
    } finally {
      setQuoteBusy(false);
    }
  }

  useEffect(() => {
    let active = true;
    fetchDealRoom(id).then((d) => active && setRoom(d)).catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, [id]);

  // Live refresh (app parity): the supplier's moves happen server-side — a rate counter, term updates,
  // and especially the CONFIRM that closes the deal (and a decline that reopens it). The app reacts to
  // FCM signals; here we poll the room while it's active so the renter sees those without reloading.
  // Stops once the deal is terminal (CLOSED / ABANDONED).
  useEffect(() => {
    const st = room?.status;
    if (!st || st === "CLOSED" || st === "ABANDONED") return;
    const t = setInterval(() => { void loadRoom(); }, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.status, id]);

  useEffect(() => {
    if (room && onTitle) onTitle(room.supplier.name);
  }, [room, onTitle]);

  /* ── The fleet behind the request cards — once per room, and never in the way ────────────────────
     Fired off the moment the room answers with a bid id, in its own effect: it is not on the chat's
     path, not on the room's, and nothing renders behind it. `room.bidId` is the whole dependency, so
     the 15s room poll above cannot re-request it — a bid id does not change under a deal room
     (`DealRoom.bidId` is `@unique`).

     The catch is EMPTY on purpose. Every plausible failure here — the endpoint refusing a caller it
     does not serve, a network drop, a bid whose supplier has since delisted — leaves `fleet` null,
     and null is precisely the state this route shipped in until today: the ask still states what was
     asked and simply claims no verdict (`fleetKnown: false`). There is nothing for the renter to do
     about a fleet read, so there is nothing to tell him about one; the conversation is what he came
     for and it is untouched. */
  useEffect(() => {
    const bidId = room?.bidId;
    if (!bidId) return;
    let active = true;
    fetchBidFleet(bidId)
      .then((r) => { if (active) setFleet(r.machines); })
      .catch(() => { /* the cards fall back to the fleet-less form — see the state's comment */ });
    return () => {
      active = false;
    };
  }, [room?.bidId]);


  /* ── The sibling strip (app parity: `sibling_item_tabs.dart`) ────────────────────────────────────
     A multi-item post fans out into one request per item, so a renter who posted three machines and
     got bids from one supplier has three rooms with that firm — and, the deal room being a route, no
     way between them but backing out to the offers list.

     Three reads, and the first two are cheap: the group id usually rides on the room payload, and
     falling back to the request detail is one call. The per-sibling bid lists then run in parallel,
     each catching its own failure — an unreadable list costs its own tab, never the whole strip.

     The whole effect is silent on failure. There is nothing for the renter to do about a strip that
     did not load, and the conversation he came for is untouched. */
  useEffect(() => {
    const requestId = room?.requestId;
    const supplierId = room?.supplierId;
    if (!requestId || supplierId == null) return;
    let active = true;

    void (async () => {
      try {
        const groupId = room?.requestGroupId
          ?? ((await fetchRequestDetail(requestId).catch(() => null))?.requestGroupId as string | undefined)
          ?? null;
        if (!active || !groupId) return;

        const { requests } = await fetchRequestGroup(groupId);
        // A group of one has nothing to switch between; the rule refuses it too, but there is no
        // reason to fetch a bid list to be told so.
        if (!active || requests.length < 2) return;

        const byRequest = new Map<string, BidCard[]>();
        await Promise.all(
          requests.map((r) =>
            fetchBids(r.id)
              .then((d) => { byRequest.set(r.id, d.bids); })
              .catch(() => { /* this sibling loses its tab; the rest of the strip still draws */ }),
          ),
        );
        if (!active) return;

        setSiblingTabs(buildSiblingTabs({
          siblings: requests,
          currentRequestId: requestId,
          bidOn: (rid) => {
            const hit = (byRequest.get(rid) ?? []).find((x) => String(x.supplierId ?? "") === String(supplierId));
            return hit ? { bidId: hit.id, dealRoomId: hit.dealRoomId } : null;
          },
        }));
      } catch { /* silent — see the block comment */ }
    })();

    return () => { active = false; };
  }, [room?.requestId, room?.requestGroupId, room?.supplierId]);


  // Live chat (GetStream).
  //
  // The connection is taken from the shared, REFERENCE-COUNTED module rather than owned here. It used
  // to be `StreamChat.getInstance(...)` + an unconditional `disconnectUser()` on unmount — which is
  // safe only while exactly one component ever connects. The chat dock on the equipment-verification
  // surface (004a §4a.3) breaks that: whichever of the two unmounted first would silently kill the
  // other's channels. Now the last release disconnects, and this component's cleanup is a release.
  useEffect(() => {
    if (!STREAM_API_KEY) return;
    // The lease is opened SYNCHRONOUSLY, before the token fetch. Cleanup runs synchronously at
    // unmount, so a flag set *after* the await would still read false there and the reference taken
    // a moment later would never be given back — pinning `refCount` above zero and leaving every
    // later visit on a cached client that is never re-authenticated. The lease records the release
    // instead, and whichever of the two runs last honours it.
    const lease = leaseStream();
    let cancelled = false;
    (async () => {
      try {
        const tok = await fetchStreamToken(id);
        if (cancelled || !tok.token || !tok.userId || !tok.channelId) return;
        const client = await lease.connect(tok.userId, tok.token);
        if (cancelled) return;
        setMyStreamId(tok.userId);
        const ch = client.channel("messaging", tok.channelId);
        await ch.watch();
        if (cancelled) return;
        channelRef.current = ch;
        setMessages([...ch.state.messages] as ChatMsg[]);
        setChatReady(true);
        ch.on("message.new", () => {
          setMessages([...ch.state.messages] as ChatMsg[]);
          // A supplier action (rate counter / term update / confirm / decline) arrives as a system
          // message — refetch the room (debounced ~1.5s, app parity) so the status + terms reflect it
          // immediately rather than waiting for the 15s poll.
          if (roomRefetchTimer.current) clearTimeout(roomRefetchTimer.current);
          roomRefetchTimer.current = setTimeout(() => { void loadRoom(); }, 1500);
        });
      } catch {
        /* chat unavailable — the rest of the room still works */
      }
    })();
    return () => {
      cancelled = true;
      channelRef.current = null;
      if (roomRefetchTimer.current) clearTimeout(roomRefetchTimer.current);
      // Release, never disconnect: another surface may still be reading the same client. Releasing
      // the LEASE (rather than a `held` flag) is what makes an unmount-during-connect safe.
      lease.release();
    };
    // loadRoom just re-reads fetchDealRoom(id) (id stable) — don't re-open the chat connection for it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const body = text.trim();
    if (!body || !channelRef.current) return;
    setText("");
    try {
      await channelRef.current.sendMessage({ text: body });
    } catch {
      setText(body);
    }
  }

  /** Upload + send ONE attachment via GetStream. The gate, the caps and the message shape are the
   *  SHARED ones (`lib/chat/chat-attachments`) — the map's chat dock sends through the same pair, so
   *  a file is the same object whichever surface it left from. */
  async function sendFiles(files: FileList | null) {
    const ch = channelRef.current;
    // App parity: one attachment per message — take the first only.
    const file = files?.[0];
    if (!ch || !file) return;
    setFileErr(null);
    const verdict = classifyChatFile(file);
    // A refusal never reached the wire, so no spinner is owed for it.
    if (!verdict.ok) { setFileErr(chatFileRejection(verdict, L)); return; }
    setUploading(true);
    try {
      await sendChatAttachment(ch, file, verdict.kind, text);
      setText("");
    } catch {
      setFileErr(chatSendFailure("attachment", L));
    } finally {
      setUploading(false);
    }
  }

  /** Send a recorded voice note as an audio attachment (app parity: mic → voice bubble). */
  async function sendVoiceNote(file: File) {
    const ch = channelRef.current;
    if (!ch) return;
    setFileErr(null);
    setUploading(true);
    try {
      await sendChatVoiceNote(ch, file);
    } catch {
      setFileErr(chatSendFailure("voice", L));
    } finally {
      setUploading(false);
    }
  }

  function openFlow(mode: "counter" | "accept") {
    if (!room || busy) return;
    setCounterErr(null);
    setFlowMode(mode);
  }

  // ── The `?act=` deep link (owner, 2026-08-11) ───────────────────────────────────────────────────
  // Seeded ONCE per visit, through `openFlow` itself, so the flow keeps every guard it already had —
  // including the one this file states twice over: nothing opens before the room is here or while a
  // submit is in flight.
  const seededFlow = useRef(false);
  // Written during the render below, read here. The verdict belongs to that render — `canAccept`
  // compares the room's terms against the last two negotiation rounds and is derived long past the
  // early returns, far past where a hook may be declared. A ref is the only way the two can meet, and
  // it is a pure mirror of what this render's own buttons carry, so a discarded render costs nothing.
  const flowGate = useRef<{ counter: boolean; accept: boolean }>({ counter: false, accept: false });
  useEffect(() => {
    if (seededFlow.current || !initialFlow || !room || busy) return;
    // Accept waits for the chat, Counter does not. `canAccept`'s price/units halves are reconstructed
    // from the message stream; judged before it lands they degrade to "nothing to compare", so an
    // outstanding supplier counter would be invisible and the gate would read open when it is shut.
    // Counter's own condition is `room.myTurn` — a field of the room — so it needs nothing else.
    // Where the chat never connects at all the accept link simply never fires, leaving the renter on
    // the room: the same place a blocked accept leaves him, under the same strip.
    if (initialFlow === "accept" && !chatReady && STREAM_API_KEY) return;
    seededFlow.current = true; // whatever the verdict — closing the sheet must not reopen it
    if (flowGate.current[initialFlow]) openFlow(initialFlow);
    // `openFlow` is redeclared every render; the one-shot ref above is what actually bounds this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFlow, room, busy, chatReady]);

  // Collect a term resolution locally (no server call — app parity). Submitted on Counter/Accept.
  const setResolution = (key: string, action: "accept" | "counter", value?: unknown) =>
    setResolutions((r) => ({ ...r, [key]: { action, value } }));
  const clearResolution = (key: string) =>
    setResolutions((r) => { const n = { ...r }; delete n[key]; return n; });
  const resolutionUpdates = () =>
    Object.entries(resolutions).map(([termKey, r]) => ({ termKey, action: r.action, value: r.value }));

  async function submitCounter(next: {
    rate: number; mobPrice?: number; demobPrice?: number;
    // deal-room/negotiation — per-type unit counts + leg exclusion travel with the counter.
    rentalUnits?: number; mobUnits?: number; demobUnits?: number; mobExcluded?: boolean; demobExcluded?: boolean;
  }) {
    if (!room || busy) return;
    setBusy(true);
    setCounterErr(null);
    try {
      // App parity (DealRoomCounterWithRate): batch the locally-resolved term updates, THEN propose the
      // rate + mob/demob prices + per-type unit counts + leg exclusion — all as one counter move.
      const updates = resolutionUpdates();
      if (updates.length) await batchUpdateTerms(id, updates);
      await proposeRate(id, {
        proposedRate: next.rate, priceUnit: room.priceUnit ?? "PER_DAY",
        mobPrice: next.mobPrice, demobPrice: next.demobPrice,
        rentalUnits: next.rentalUnits, mobUnits: next.mobUnits, demobUnits: next.demobUnits,
        mobExcluded: next.mobExcluded, demobExcluded: next.demobExcluded,
      });
      setResolutions({});
      await loadRoom();
      setFlowMode(null);
    } catch (e) {
      setCounterErr(errMsg(e, L("Couldn’t send your counter — please try again.", "تعذّر إرسال عرضك المقابل — حاول مرة أخرى.")));
    } finally {
      setBusy(false);
    }
  }

  async function doAccept(contractType: string = "formal") {
    if (!room || busy) return;
    setBusy(true);
    try {
      // App parity (accept-all-terms): submit the locally-collected term resolutions together with the
      // accept. contractType is chosen on the flow's Summary step (defaults to "formal"). Send the
      // accepted rental count as agreedUnits (the app sends it — records the count for multi-unit /
      // partial-fulfilment requests instead of defaulting to the full offer).
      await acceptDeal(id, contractType, { termResolutions: resolutionUpdates(), agreedUnits: room.agreedUnits ?? room.numberOfUnits });
      setResolutions({});
      await loadRoom();
      setFlowMode(null);
    } catch (e) {
      window.alert(errMsg(e, L("Couldn’t accept right now — please try again.", "تعذّر القبول الآن — حاول مرة أخرى.")));
    } finally {
      setBusy(false);
    }
  }

  // Inline translate (app parity): toggle an incoming message to the opposite script via Stream's
  // translateMessage; a second tap restores the original. Best-effort — silent if translate is off.
  async function translateMsg(m: ChatMsg) {
    const body = (m.text ?? "").trim();
    if (!body || translating) return;
    if (translations[m.id]) { setTranslations((t) => { const n = { ...t }; delete n[m.id]; return n; }); return; }
    const client = channelRef.current?.getClient?.();
    if (!client) return;
    const target = /[؀-ۿ]/.test(body) ? "en" : "ar";
    setTranslating(m.id);
    try {
      const res = await client.translateMessage(m.id, target);
      const i18n = ((res as { message?: { i18n?: Record<string, unknown> } })?.message?.i18n ?? {}) as Record<string, unknown>;
      const tx = (i18n[`${target}_text`] as string) || "";
      if (tx) setTranslations((t) => ({ ...t, [m.id]: tx }));
    } catch {
      /* translation unavailable — keep original */
    } finally {
      setTranslating(null);
    }
  }

  /* ── V12b · the request loop's context, exactly as the map's dock assembles it ───────────────────
     Owner, 2026-08-11: *"i want it like request card"*. Everything below is SHARED with `ChatDock`
     rather than restated: `requestThreadCards` is the one projection of a message list into asks and
     answers, `requestRepliesByRef` the one reading of what was answered, `fleetMachineResolver` the
     one answer to what a machine is called and looks like, and `requestDocLabel` the one word for a
     paper. Two surfaces, one channel, one set of cards — a second copy of any of these is how the
     renter's screen and the supplier's start describing the same ask differently.

     These are hooks, so they sit ABOVE the two early returns below: a room that has not loaded yet
     still has to run them, and a conversation with no cards in it costs three empty derivations. */
  const threadCards = useMemo(() => requestThreadCards(messages as unknown[]), [messages]);
  const repliesByRef = useMemo(() => requestRepliesByRef(threadCards), [threadCards]);
  const machineOf = useMemo(() => fleetMachineResolver(fleet, ar), [fleet, ar]);

  /* ── V12c · ONE card per request, and the light cue on it (owner, 2026-08-11) ───────────────────
     *"make it one card for request and show his answer, but light plumbing or something to show the
     answer when opening the chat"*. Both halves are decided in the contract layer and are therefore
     the SAME fold the map's dock performs — the supplier reads this conversation from the other chair
     and must not see a different number of cards in it.

     `answeredRefs` suppresses the reply whose ask is on screen carrying the answer; `cueRef` names the
     card that answer landed in. The cue is finite (`ANSWER_CUE_MS`) and cannot re-fire on the room's
     15s poll: `latestAnsweredRef` returns the same string for the same conversation, so the effect
     does not re-run. It DOES fire on arriving at the route, which is this surface's "opening the
     chat". */
  const answeredRefs = useMemo(() => answeredAskRefs(threadCards), [threadCards]);
  const cueRef = useMemo(() => latestAnsweredRef(threadCards), [threadCards]);
  const [cuedRef, setCuedRef] = useState<string | null>(null);
  useEffect(() => {
    if (!cueRef) {
      setCuedRef(null);
      return;
    }
    setCuedRef(cueRef);
    const timer = window.setTimeout(() => setCuedRef(null), ANSWER_CUE_MS);
    return () => window.clearTimeout(timer);
  }, [cueRef]);

  const cardCtx: RequestCardCtx = useMemo(
    () => ({
      L,
      /* The rule this route documented and now finally satisfies (see `RequestCardCtx.fleetKnown`):
         **the status row is omitted when the fleet is genuinely unknown, never guessed.** Until the
         fetch lands — and forever, if it fails — this is false and the card states the ask without a
         verdict, which is what `/deal-room/[id]` has always done. Once the fleet is in hand the
         verdict is derived on every render (RM3-AC-18) from the machine as the fleet holds it NOW.

         A machine MISSING from a fleet we do hold is a different answer again: `machineOf` returns
         null, `renteeRequestState` reads `unknown`, and the card says the equipment is not in his
         current list — a statement the fleet supports, rather than one made out of our ignorance. */
      fleetKnown: fleet != null,
      machine: machineOf,
      reply: (ref: string) => repliesByRef.get(ref) ?? null,
      docLabel: (docType: string) => requestDocLabel(docType, L),
      /* **Nothing here is pressable, and the card must say so before it is pressed.** The card's whole
         reason to exist is that pressing it lands the reader on the machine (owner, 2026-08-10) — but
         that detail is the MAP's panel, and this route has no equipment surface to open. A chevron
         that did nothing would be worse than one that never claimed to be there. */
      canOpen: () => false,
      /* The REQUEST's type word — "Crawler Excavator 30 ton" — which only an `alternative` card reads.
         Null here by the rule `RequestCardCtx.typeWord` already states for this surface: the deal
         room holds the accepted BID's equipment, not the request's taxonomy, and `details.equipmentLabel`
         falls back to the bid's make+model. Naming one machine where the card means a TYPE would make
         the ask read as a swap for that unit, which is the exact misreading the type word was added
         to remove. The card names no type instead. */
      typeWord: null,
    }),
    [L, fleet, machineOf, repliesByRef],
  );

  if (error) return <div className="dlproto"><div className="rempty">{L("Couldn’t open this deal room.", "تعذّر فتح غرفة الصفقة.")}</div></div>;
  if (!room) return <div className="dlproto"><div className="rstate"><span className="material-icons-outlined" style={{ fontSize: 28 }}>progress_activity</span></div></div>;

  // Single source of truth for the money — SHARED with the confirmed quotation via computeDealTotals so
  // the price bar and the quotation can never diverge. Prorated ÷26/÷7; PER_JOB / no-duration = one full
  // period; mob/demob use their own counts + honor exclusion; VAT 15%.
  // deal-room/negotiation rounds — reconstructed from the chat's rate_proposal messages (app parity).
  // Drive the allMatched accept gate, the turn badges, the round-history log AND the money below.
  // Falls back to the room's standing values if the chat custom data isn't reachable.
  const rounds = withOpeningRound(collapseRounds(reconstructRounds(messages as unknown[])), roomOpeningRound(room));
  /* ── The LIVE position, not the last agreement (app parity: `resolveLivePosition`) ───────────────
     The app resolves the room's own position as *"the latest round from EITHER side — what the deal
     is worth right now"*, and spends it on exactly these three: the price bar, the breakdown and the
     quotation. Its ladder puts the latest round FIRST, ahead of `agreedUnits`.

     ~~The web started at `agreedUnits`.~~ So a supplier who countered 3 units down to 2 left the room
     pricing 3 while the bid card — which reads `currentRentalUnits` — already showed 2. Worse, the
     price bar's own source line said «Supplier's counter» over units from the last agreement: it
     named a counter and priced something else.

     A count nobody has accepted is the POINT of a room mid-negotiation, and the label already says
     whose position it is. `roundTotals` is the same seam the compare card uses, and every field it
     passes falls back to the room's column when the round does not carry it — which is the rest of
     the app's chain. */
  const livePosition = liveRound(rounds);
  const totals = livePosition ? roundTotals(room, livePosition) : computeDealTotals(room);
  const rate = totals.rate;
  const basisU = totals.priceUnit;
  const hasDuration = totals.hasDuration;
  const periods = totals.periods; // duration in DAYS; no duration = one full period
  const rentalUnits = totals.rentalUnits;
  const mobUnitsN = totals.mobUnitsN;
  const demobUnitsN = totals.demobUnitsN;
  const units = rentalUnits; // the rental count drives the card display
  // `rentalTotal` / `mobTotal` / `demobTotal` / `subtotal` / `vat` are no longer unpacked here: the
  // breakdown states those five lines PER UNIT now (see below), and `grand` is the one all-units
  // figure still drawn — on the overall row. They remain on `totals` for any caller that wants them.
  const grand = totals.grand;
  /**
   * ── The breakdown states its lines PER UNIT, as the bid card does (owner, 2026-08-19) ──────────
   *
   * The renter reaches this room from a bid card whose price panel breaks the same offer down for one
   * machine and then totals it across the count (`RequestBids.tsx:522`). This panel showed all-units
   * figures only, so the two screens put two different numbers against the same offer and neither said
   * which was which. One shape now, on both.
   *
   * `computeQuoteTotals` is the bid card's own line maths, fed the per-unit rental this room already
   * computed — NOT a second derivation. Its `overall` block is `computeDealTotals`' to the riyal
   * (verified across PER_DAY/WEEK/MONTH/JOB and fractional bases), which is why the figures above are
   * still read from `totals` and only the PER-UNIT block comes from here: the money is unchanged, the
   * rows it is stated in are what moved.
   */
  const perUnit = computeQuoteTotals({
    perUnitRental: totals.perUnitRental,
    rentalUnits: units,
    mob: { amount: room.mobPrice, units: mobUnitsN, excluded: room.mobExcluded },
    demob: { amount: room.demobPrice, units: demobUnitsN, excluded: room.demobExcluded },
  }).perUnit;
  /** Multi-unit is the only case where the two blocks differ, so it is the only case that draws both
   *  and the only case that has to say which is which. One machine → one set of rows, unlabelled. */
  const multi = units > 1;
  // Billing-period label from the bid's price unit (same mapping the bid cards use).
  const periodLabel = (() => {
    switch ((room.priceUnit ?? "PER_DAY").toUpperCase()) {
      case "PER_WEEK": return L("week", "أسبوع");
      case "PER_MONTH": return L("month", "شهر");
      case "PER_JOB": return L("job", "مهمة");
      default: return L("day", "يوم");
    }
  })();
  // Rental factor label, in the bid card's words: the supplier's RAW quoted rate over its own period,
  // the divisor that turns it into days, and the BILLABLE day count it is charged across. It used to
  // read "229/day × 61 days" off the calendar duration while the total charged 53 — a label stating an
  // arithmetic its own total did not follow. Nothing prorated (PER_JOB, open-ended, no start date)
  // keeps the bare rate, since there is no day count to explain.
  const rentalDivisorNote = divisorNote(basisU, L);
  const rentalLabel =
    basisU === "PER_JOB"
      ? nf(rate)
      : totals.rentalRaw
        ? `${nf(rate)}/${periodLabel}`
        : `${nf(rate)}/${periodLabel}${rentalDivisorNote ? ` · ${rentalDivisorNote}` : ""} × ${totals.billableDays} ${L("billable days", "يوم محتسب")}`;
  const closed = room.status === "CLOSED";
  const abandoned = room.status === "ABANDONED";
  const awaiting = room.status === "AWAITING_SUPPLIER_CONFIRMATION";
  // The quotation link — offered at every status except ABANDONED (app parity, quotation_button.dart).
  // `final` only once the deal is CLOSED; everything before it is a `preview`, and the label has to say
  // so: an agreed price the supplier hasn't confirmed yet is not a signed deal, and a rentee who reads
  // one as if it were stops chasing the deal.
  const quoteKind = quotationLinkKind(room.status);
  const quoteLabel = quoteKind === "final"
    ? L("Final quotation", "عرض السعر النهائي")
    : L("Preview quotation", "معاينة عرض السعر");
  // Equipment title — real name + size (like the request/bid cards), not the bare "Equipment" fallback.
  const eqName = (ar ? room.details.equipmentLabelAr || room.details.equipmentLabel : room.details.equipmentLabel) || L("Equipment", "المعدّة");
  const eqSize = ar ? room.details.equipmentSizeAr || room.details.equipmentSize : room.details.equipmentSize || room.details.equipmentSizeAr;
  const rRound = latestRoundBy(rounds, "rentee");
  const sRound = latestRoundBy(rounds, "supplier");
  // DRCARD — which rate proposals a later `rate_response` has settled, and which one is still the live
  // offer. Both derived from the stream, not from local state, so a reload shows the same
  // settled/actionable split and only the standing offer is ever actionable.
  const respondedIds = respondedProposalIds(messages as unknown[]);
  const lastProposalId = latestProposalId(messages as unknown[]);

  // Accept gate — app parity `allMatched` (rentee perspective): every non-fixed term matched/accepted,
  // AND the rentee's latest price+units round equals the supplier's (nothing left to change). When rounds
  // can't be reconstructed, rRound/sRound are the room fallback so the price/units checks pass and the gate
  // degrades to the term check — never stricter than the backend's disputed-only 409.
  const termMatched = (t: DealTerm): boolean => {
    if (t.state === "fixed" || t.state === "agreed" || t.state === "soft_accepted") return true;
    const r = resolutions[t.key];
    if (!r) return false;
    if (r.action === "accept") return true;
    return r.value != null && String(r.value) === String(t.supplierDeclared);
  };
  const termsMatched = room.terms.every(termMatched);
  const priceMatches = !rRound || !sRound ? true
    : eqNum(rRound.rate, sRound.rate) && (rRound.priceUnit ?? "") === (sRound.priceUnit ?? "") && eqNum(rRound.mobPrice, sRound.mobPrice) && eqNum(rRound.demobPrice, sRound.demobPrice);
  const unitsMatch = !rRound || !sRound ? true
    : eqNum(rRound.rentalUnits, sRound.rentalUnits) && eqNum(rRound.mobUnits, sRound.mobUnits) && eqNum(rRound.demobUnits, sRound.demobUnits) && rRound.mobExcluded === sRound.mobExcluded && rRound.demobExcluded === sRound.demobExcluded;
  const unresolvedDisputed = room.terms.filter((t) => t.state === "disputed" && !resolutions[t.key]);
  const canAccept = termsMatched && priceMatches && unitsMatch;
  // Show the Accept/Negotiate CTAs on the renter's turn OR whenever everything already matches (app parity
  // deadlock-break: allMatched surfaces Accept even if it would otherwise read as the supplier's turn).
  const live = !closed && !abandoned && !awaiting;
  const showAct = live && (room.myTurn || canAccept);
  const acceptBlockMsg = !termsMatched
    ? L("Resolve the differing terms below before you can accept", "قم بحل الشروط المختلفة أدناه قبل القبول")
    : L("Match the supplier's latest price and quantities before you can accept", "طابق أحدث سعر وكميات المورد قبل القبول");
  // Turn cue (app `negotiateFresh` vs `negotiate`): the supplier countered last vs the renter's opening move.
  const supplierCountered = room.myTurn && room.lastCounterBy === "supplier";
  // What the two buttons below would allow right now, handed to the `?act=` deep link. Read off the
  // SAME expressions the buttons are gated by, on the same render, so a deep link can never open a
  // sheet the renter could not have opened himself with a press.
  /* ── What the `?act=` link is allowed to open (owner, 2026-08-19) ────────────────────────────────
     *"when i click counter this price from the map footer it will open the 3 style sheet not the chat."*

     COUNTER is gated on `live` alone now, not on `showAct`. `showAct = live && (myTurn || canAccept)`
     governs whether the price bar DRAWS its two buttons — a different question from whether the flow
     may open. A renter who pressed «اطلب سعراً أقل» on the map has already chosen to counter; landing
     him in the conversation because the room happens to read as the supplier's turn answers a question
     he did not ask. Negotiating is available whenever the deal is live, which is the app's own rule and
     what the price bar's comment already claims: *"Negotiate is always available."*

     `live` is still a real gate and the one that matters: a CLOSED, ABANDONED or AWAITING room has
     nothing to counter — in an awaiting room the renter has accepted and the bar offers Withdraw — so
     the link falls through and he lands on the room, under the strip that says why.

     ACCEPT keeps `showAct && canAccept` untouched. Accepting is settling, and its gate is the room's
     own comparison of terms, price and units; nothing here loosens it. */
  flowGate.current = { counter: live, accept: showAct && canAccept };

  return (
    <div className="dlproto" dir={ar ? "rtl" : "ltr"}>
      {/* top bar (§5.2) — supplier chip · equipment/request block · phase pill · icon actions */}
      <div className="topbar">
        {/* supplier chip → profile & documents. NOTE: the deal-room payload only carries name + isVerified
            (no rating/deals/commitment), so that prototype stat line is omitted rather than fabricated. */}
        {/* The chip goes where the kebab's «Company details» goes — one destination for one firm's
            papers (owner, 2026-08-19). It opened the room's own documents modal; two controls in one
            bar opening two differently-shaped surfaces onto the same question is what this removes. */}
        <button
          type="button"
          className="tb-sup"
          disabled={!room.bidId}
          onClick={() => { if (room.bidId) router.push(`/bids/${encodeURIComponent(room.bidId)}/equipment?company=1`); }}
        >
          <span className="av">{room.supplier.name.charAt(0).toUpperCase()}</span>
          <span className="nm">
            <span className="n">{room.supplier.name}{room.supplier.isVerified && (
              /* The stroked check the panel header and the chat dock both draw (owner, 2026-08-19).
                 Material's filled rosette was a second mark beside the name rather than the tick for
                 it, and it made one company read two ways across the product. */
              <svg className="tb-tick" width="12" height="12" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"
                aria-label={L("Verified", "شركة موثّقة")} role="img">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            )}</span>
            <span className="sub">{L("Supplier", "المورد")}</span>
          </span>
        </button>
        <span className="tb-div" />
        {/* Request block — now a BUTTON onto the request-summary modal (app parity).
            The app's chip pairs a clipboard with the request ref, on the reasoning that a control
            should say what it opens and that a renter with three rooms open needs to know WHICH
            request this one settles. The web block already carried the ref and the meta line, so it
            becomes the chip rather than gaining a second one beside it. */}
        <button type="button" className="tb-eq" onClick={() => setShowRequest(true)} title={L("Request details", "تفاصيل الطلب")}>
          <span className="ic"><span className="material-icons-outlined">assignment</span></span>
          <span className="meta">
            <span className="t">
              {room.shortCode && <span className="tb-code">{room.shortCode}</span>}
              {eqName}{eqSize ? ` · ${eqSize}` : ""}
              {room.numberOfUnits > 1 ? ` · ${room.numberOfUnits} ${L("units", "وحدة")}` : ""}
              {room.details.operatorIncluded ? ` · ${L("with operator", "مع عامل")}` : ""}
            </span>
            <span className="sub">{[room.details.location, periods ? `${periods} ${L("days", "يوم")}` : room.details.rentalType].filter(Boolean).join(" · ")}</span>
          </span>
          <span className="material-icons-outlined chev">chevron_right</span>
        </button>
        {/* phase pill (status label placement — §5.2) */}
        <span className="tb-phase">
          <span className="dot" />
          {closed ? L("Closed", "مغلق") : abandoned ? L("Cancelled", "ملغاة") : awaiting ? L("Awaiting confirmation", "بانتظار التأكيد") : L("Negotiating", "قيد التفاوض")}
        </span>
        <span className="tb-spacer" />
        {/* icon actions — documents + call */}
        <div className="tb-icons">
          {/* ── The documents icon is GONE (owner, 2026-08-19) ──────────────────────────────────
              It was the third way into the supplier's papers from one bar — the chip on the left, this
              icon, and the kebab's «Company details» all opened the same sheet. One entry now, in the
              kebab, and it goes to the documents PANEL rather than a modal of its own. */}
          {/* deal-room/negotiation (B5): the rentee gets the supplier's number from the start (server-gated).
              A single Call button opens a modal with the number — dial on touch, copy on desktop. */}
          {!room.supplier.phone
            ? <span className="tb-ic call locked" title={L("Number unavailable", "الرقم غير متاح")}><span className="material-icons-outlined">call</span></span>
            : <span className="tb-ic call" role="button" tabIndex={0} title={L("Call", "اتصال")} onClick={() => setCallOpen(true)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setCallOpen(true)}><span className="material-icons-outlined">call</span></span>}
          {/* ── The ⋮ kebab (app parity) ────────────────────────────────────────────────────────
              Three entries, and the app's own reasoning for each:

                · INSPECT THE EQUIPMENT — the machine this room is about. The chip beside the kebab
                  names the REQUEST; nothing here named the plant. Disabled when the payload carried
                  no bid id, since the equipment map is addressed by it.
                · COMPANY DETAILS — the counterparty's papers, through the same documents modal the
                  supplier chip opens, so one firm's documents are read one way wherever they open.
                · CANCEL THE DEAL — here because it is where both parties already know to look for it
                  (owner, 2026-08-17: *"i want the same place as existing one before our design"*,
                  after a redesign moved it onto the request sheet and had to move it back).

              REQUEST DETAILS is deliberately NOT here — it sits on the chip beside the kebab, where
              the app puts it, so the control names the request it opens.

              Cancelling is hidden on a read-only room — CLOSED or ABANDONED — where there is nothing
              left to cancel. Same gate as the app's `showCancel: !room.isReadOnly`. */}
          <span className="tb-ic" role="button" tabIndex={0} aria-haspopup="menu" aria-expanded={menuOpen} title={L("More", "المزيد")} onClick={() => setMenuOpen((o) => !o)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setMenuOpen((o) => !o)}><span className="material-icons-outlined">more_vert</span></span>
        </div>
      </div>

      {/* ── The sibling strip (app parity: `sibling_item_tabs.dart`) ───────────────────────────────
          The renter's other conversations with THIS supplier about the same submission. Absent
          unless there are at least two and one of them is this room — both refusals are the model's,
          so this renders the array or nothing.

          A tab with no room yet still navigates: opening a conversation creates nothing, and the
          first message is what creates the room. With no room id to go to, the destination is that
          bid's equipment surface — the one addressable place for an offer nobody has spoken in. */}
      {siblingTabs.length > 1 && (
        <div className="dr-sibs" role="tablist" aria-label={L("Other items in this request", "بنود أخرى في هذا الطلب")}>
          {siblingTabs.map((tab) => (
            <button
              key={tab.requestId}
              type="button"
              role="tab"
              aria-selected={tab.isCurrent}
              className={tab.isCurrent ? "on" : undefined}
              disabled={tab.isCurrent}
              onClick={() => router.push(tab.dealRoomId ? `/deal-room/${encodeURIComponent(tab.dealRoomId)}` : `/bids/${encodeURIComponent(tab.bidId)}/equipment`)}
            >
              {ar ? tab.label.ar : tab.label.en}
              {!tab.dealRoomId && <span className="dot" title={L("Not started", "لم تبدأ")} />}
            </button>
          ))}
        </div>
      )}

      {/* The kebab's menu is a sibling of the top bar, NOT a child of it: `.topbar` scrolls sideways
          on a narrow screen (`overflow-x: auto`), and a dropdown inside a scroll box is clipped by it.
          It anchors to `.dlproto` instead, pinned under the bar's end corner. */}
      {menuOpen && (
        <>
          <div className="dr-menu-scrim" onClick={() => setMenuOpen(false)} />
          <div className="dr-menu" role="menu">
            <button type="button" role="menuitem" disabled={!room.bidId} onClick={() => { setMenuOpen(false); if (room.bidId) router.push(`/bids/${encodeURIComponent(room.bidId)}/equipment`); }}>
              <span className="material-icons-outlined">construction</span>{L("Inspect the equipment", "فحص المعدّة")}
            </button>
            {/* ── «Company details» goes to the PANEL, not a modal (owner, 2026-08-19) ────────────
                The company documents surface is V9's takeover on the bid's own equipment page — the
                one the panel header's «مستندات الشركة ›» opens — and it is where a renter reads a
                firm's papers everywhere else in the product. Opening a second, differently-shaped
                sheet from here made the same papers two surfaces.

                Disabled without a `bidId`, exactly as «Inspect the equipment» above is: the panel is
                addressed by bid, and a menu entry that cannot reach its destination should say so by
                being inert rather than by failing after the press. */}
            <button
              type="button"
              role="menuitem"
              disabled={!room.bidId}
              onClick={() => { setMenuOpen(false); if (room.bidId) router.push(`/bids/${encodeURIComponent(room.bidId)}/equipment?company=1`); }}
            >
              <span className="material-icons-outlined">business_center</span>{L("Company details", "بيانات الشركة")}
            </button>
            {!closed && !abandoned && (
              <button type="button" role="menuitem" className="danger" onClick={() => { setMenuOpen(false); setCancelOpen(true); }}>
                <span className="material-icons-outlined">cancel</span>{L("Cancel the deal", "إلغاء الصفقة")}
              </button>
            )}
          </div>
        </>
      )}

      {/* price bar — prototype navy banner: centered hero price + end-side status/CTA cluster + breakdown popover */}
      <div className="price-bar">
        {/* status pill — pinned to the top corner (end: right in LTR, left in RTL) */}
        {closed ? (
          <span className="pb-status done"><span className="dot" />{L("Approved", "معتمد")}</span>
        ) : abandoned ? (
          <span className="pb-status" style={{ background: "var(--danger-bg)", borderColor: "color-mix(in srgb, var(--danger) 40%, transparent)", color: "var(--danger)" }}><span className="dot" />{L("Cancelled", "ملغاة")}</span>
        ) : awaiting ? (
          <span className="pb-status wait"><span className="dot" />{L("Awaiting confirmation", "بانتظار التأكيد")}</span>
        ) : (
          <span className="pb-status"><span className="dot" />{L("Negotiating", "قيد التفاوض")}</span>
        )}

        {/* centered price + CTAs below */}
        <div className="pb-center">
          <div className={`pb-src${closed ? " done" : awaiting ? " wait" : ""}`}>
            <span className="dot" />
            {closed ? L("Agreed", "متفق عليه") : room.myTurn ? L("Supplier's counter", "عرض المورد المقابل") : L("Supplier's offer", "عرض المورد الافتتاحي")}
            {units > 1 ? ` · ${priceAll ? L("all units", "للكل") : L("per unit", "للوحدة")}` : ""}
          </div>
          <div className="pb-hero">
            <span className="n">{nf(priceAll ? rate * units : rate)}</span>
            <span className="u">{L("SAR", "ر.س")}/{periodLabel}</span>
          </div>
          <div className="pb-tools">
            {units > 1 && (
              <div className="pb-seg">
                <button className={priceAll ? "on" : ""} onClick={() => setPriceAll(true)}>{L("All", "للكل")} ({units})</button>
                <button className={!priceAll ? "on" : ""} onClick={() => setPriceAll(false)}>{L("Per unit", "للوحدة")}</button>
              </div>
            )}
            <button className={`pb-details${breakdown ? " open" : ""}`} onClick={() => setBreakdown((b) => !b)}>
              {L("Details", "التفاصيل")}<span className="material-icons-outlined">expand_more</span>
            </button>
          </div>
          {/* Turn cue (app parity): supplier countered → pulsing "New reply"; renter's opening move → "Your turn". */}
          {showAct && (supplierCountered || room.myTurn) && (
            <div className={`pb-turn${supplierCountered ? " alert" : ""}`}>{supplierCountered ? `🔔 ${L("New reply", "ردّ جديد")}` : `⚡ ${L("Your turn", "دورك")}`}</div>
          )}
          {/* CTAs — centered below the price */}
          {closed ? (
            <div className="pb-btns">
              {/* The CLOSED price-bar CTA — app parity (`TurnCtaKind.download`), which the app also shows
                  only at CLOSED. Everything before CLOSED reaches the quotation through the pinned link
                  under the composer instead, exactly as the app arranges it. */}
              <button className="pb-btn accept" disabled={quoteBusy} onClick={openQuotation}><span className="material-icons-outlined">download</span>{L("Download quote", "تنزيل العرض")}</button>
              <button className="pb-btn ghost" onClick={() => setReleaseOpen(true)}><span className="material-icons-outlined">refresh</span>{L("Reopen", "إعادة فتح")}</button>
            </div>
          ) : abandoned ? null : awaiting ? (
            <div className="pb-btns">
              {/* deal-room/negotiation — withdraw the pending acceptance (AWAITING → NEGOTIATING). */}
              <button className="pb-btn ghost" disabled={withdrawing} onClick={doWithdraw}><span className="material-icons-outlined">undo</span>{withdrawing ? L("Withdrawing…", "جارٍ السحب…") : L("Withdraw", "سحب القبول")}</button>
            </div>
          ) : showAct ? (
            <div className="pb-btns">
              {/* App parity: Negotiate always available; Accept surfaces via allMatched (deadlock-break) even
                  when it'd otherwise be the supplier's turn, and stays gated until terms+price+units match. */}
              <button className={`pb-btn neg${supplierCountered ? " pulse" : ""}`} disabled={busy} onClick={() => openFlow("counter")}><span className="material-icons-outlined">swap_horiz</span>{L("Negotiate", "تفاوض")}</button>
              <button className="pb-btn accept" disabled={busy || !canAccept} onClick={() => openFlow("accept")}><span className="material-icons-outlined">check</span>{L("Accept", "قبول")}</button>
            </div>
          ) : null}
        </div>

        {breakdown && (
          <>
            <div className="pb-bd-backdrop" onClick={() => setBreakdown(false)} />
          <div className="pb-breakdown">
            {/* The bid card's shape (owner, 2026-08-19): every line below is for ONE machine, and the
                count is applied once, at the foot. A multi-unit deal says so in a heading rather than
                by hanging «× ٣» off each row — three multipliers down a column is arithmetic the
                reader has to carry, and the overall row is where it lands anyway. */}
            {multi && <div className="pb-bhead">{L("Per unit", "لكل وحدة")}</div>}
            <div className="pb-brow"><span className="l">{L("Rental", "الإيجار")} ({rentalLabel})</span><span className="v">{nf(perUnit.rental)}</span></div>
            {room.mobExcluded
              ? <div className="pb-brow"><span className="l">{L("Mobilization", "التعبئة — موب")}</span><span className="v ex">{L("Not included", "غير مشمول")}</span></div>
              : room.mobPrice ? <div className="pb-brow"><span className="l">{L("Mobilization", "التعبئة — موب")}</span><span className="v">{nf(perUnit.mob)}</span></div> : null}
            {room.demobExcluded
              ? <div className="pb-brow"><span className="l">{L("Return", "الإرجاع — ديموب")}</span><span className="v ex">{L("Not included", "غير مشمول")}</span></div>
              : room.demobPrice ? <div className="pb-brow"><span className="l">{L("Return", "الإرجاع — ديموب")}</span><span className="v">{nf(perUnit.demob)}</span></div> : null}
            <div className="pb-brow"><span className="l">{L("Subtotal before VAT", "المجموع قبل الضريبة")}</span><span className="v">{nf(perUnit.subtotal)}</span></div>
            <div className="pb-brow"><span className="l">{L("VAT (15%)", "ضريبة القيمة المضافة (١٥٪)")}</span><span className="v">{nf(perUnit.vat)}</span></div>
            <div className="pb-brow tot"><span className="l">{L("Estimated total", "الإجمالي التقديري")}</span><span className="v">{nf(perUnit.total)} {L("SAR", "ر.س")}</span></div>

            {/* NOT per-unit × units. The transport legs carry their own negotiated counts — a room with
                five delivery trips against three rented machines bills five — so the overall row is
                `computeDealTotals`' own figure and never a multiplication of the block above it. The
                leg counts are named here, where they are the thing that makes the two blocks differ. */}
            {multi && (
              <div className="pb-brow tot overall">
                <span className="l">
                  {L("Overall total", "الإجمالي الكلي")}
                  <span className="sub">
                    {L("Units", "الوحدات")}: {units}
                    {!room.mobExcluded && room.mobPrice && mobUnitsN !== units ? ` · ${L("delivery", "نقل")} × ${mobUnitsN}` : ""}
                    {!room.demobExcluded && room.demobPrice && demobUnitsN !== units ? ` · ${L("return", "إرجاع")} × ${demobUnitsN}` : ""}
                  </span>
                </span>
                <span className="v">{nf(grand)} {L("SAR", "ر.س")}</span>
              </div>
            )}
          </div>
          </>
        )}
      </div>

      {/* below-bar strips */}
      {showAct && !canAccept && (
        <div className="pb-strip"><span className="material-icons-outlined">error_outline</span>{acceptBlockMsg}</div>
      )}
      {abandoned && (
        <div className="pb-strip danger"><span className="material-icons-outlined">cancel</span>{L("This deal room has been cancelled", "تم إلغاء غرفة الصفقة هذه")}</div>
      )}

      {/* terms are negotiated inside the negotiation sheet (§6 step ②) — no standalone terms card here. */}

      {/* thread */}
      <div className="thread">
        {!STREAM_API_KEY ? (
          <div className="sysev">{L("Chat is unavailable.", "المحادثة غير متاحة.")}</div>
        ) : !chatReady ? (
          <div className="rstate"><span className="material-icons-outlined" style={{ fontSize: 22 }}>progress_activity</span></div>
        ) : messages.length === 0 ? (
          <div className="sysev">{L("No messages yet — say hello 👋", "لا رسائل بعد — ابدأ المحادثة 👋")}</div>
        ) : (
          messages.map((m) => {
            // deal-room/negotiation — the structured `custom` payload FIRST (DRCARD). This branch has to
            // precede the `system_bot` check below: all six negotiation card types are posted by
            // `system_bot`, so the early return used to swallow them into one grey pill, showing English
            // `text` in an Arabic chat and dropping a counter-offer's figures entirely.
            const card = chatCardOfMessage(m);
            /* ── WHOSE message this is, and why the CARDS ask it too (owner, 2026-08-11) ───────────
               *"make these cards appear like messages sent by the other side or by me whether the
               request or the response."*

               The side is read from the Stream AUTHOR, never from the card's TYPE — the renter and
               the supplier read the SAME channel from opposite chairs, and "an ask is mine, a reply
               is theirs" is true from one of them and inverted from the other. Authorship is the one
               reading that is correct from both, and it is the reading the plain bubbles below have
               always used. The dock sides its cards off this same fact; this route centred every one
               of them, so a renter's own request read as narration the room had emitted. */
            const cardMine = myStreamId != null && m.user?.id === myStreamId;
            /* ── The renter's ASK, as the card he sent (owner, 2026-08-11: "i want it like request
               card") ──────────────────────────────────────────────────────────────────────────────
               The identity strip, the ask, the reference and — now that this route holds the fleet —
               the live verdict, built by the very function the map's dock builds it with. Both sides
               of the conversation are looking at one object; it must not be one object on one surface
               and a list of rows on the other. */
            if (card?.type === RENTEE_REQUEST_CARD_TYPE) {
              return (
                <div key={m.id} className={`dl-rq-card ${cardMine ? "is-mine" : "is-them"}`}>
                  <RequestCard
                    view={requestCardView(postedSubject(card.card), cardCtx)}
                    // The SAME clock face every other card in this thread carries (AC-16).
                    at={chatCardTime(m.created_at, ar)}
                    // The answer folds into THIS card (V12c), wherever in the thread the question was
                    // asked — so this is the card that points at itself when the answer is new.
                    cue={cuedRef != null && cuedRef === card.card.ref}
                  />
                </div>
              );
            }
            /* ── The supplier's ANSWER has no card of its own (owner, 2026-08-11) ──────────────────
               *"make it one card for request and show his answer"* — which SUPERSEDES this morning's
               *"the supplier response must arrive in the same format of the sent card"*. That ruling
               drew the ask's card a second time under the reply (`replyCardView`, now withdrawn), and
               because each card takes its own author's side the pair sat on opposite edges of the
               column both stating the answer in different words. The ask's card carries it now, in the
               reply's own kind-specific wording.

               The fallback survives and is why this suppresses rather than deletes: a reply whose ask
               is NOT in the loaded window — an older page, a partial channel read — falls through to
               the bare `ChatCard` below, which states the reference and the answer and names no
               equipment nobody read. */
            if (card?.type === RENTEE_REQUEST_REPLY_CARD_TYPE && replyFoldsIntoAsk(answeredRefs, card.reply)) {
              return null;
            }
            if (card) {
              const view = buildChatCardView(card, {
                ar, L, terms: room.terms, at: m.created_at,
                responded: respondedIds.has(m.id),
                superseded: card.type === "rate_proposal" && lastProposalId !== null && lastProposalId !== m.id,
                live,
              });
              const chatCard = (
                <ChatCard
                  view={view}
                  ar={ar}
                  L={L}
                  busy={busy}
                  onAccept={() => openFlow("accept")}
                  onCounter={() => openFlow("counter")}
                  onTranslate={(m.text ?? "").trim() ? () => void translateMsg(m) : undefined}
                  translating={translating === m.id}
                  translation={translations[m.id]}
                />
              );
              /* An unpaired ANSWER is still a message somebody wrote, so it takes his side the way
                 the full card above does — the bare form is a smaller card, not a different kind of
                 event. The negotiation vocabulary is NOT sided: a rate, a counter, an acceptance is
                 an event in the room rather than either party's remark, and `.chatcard` centres
                 itself for exactly that reason (a wrapper here would turn its `align-self` inert). */
              return card.type === RENTEE_REQUEST_REPLY_CARD_TYPE ? (
                <div key={m.id} className={`dl-rq-card ${cardMine ? "is-mine" : "is-them"}`}>{chatCard}</div>
              ) : (
                <Fragment key={m.id}>{chatCard}</Fragment>
              );
            }
            // deal-room/negotiation — system narration (posted by the backend's `system_bot`) renders as a
            // centered chip (prototype's role-tinted narration), NOT a left/right bubble. An UNKNOWN
            // `custom.type` lands here too: a card type added later degrades to this pill rather than
            // vanishing from the conversation.
            if (m.user?.id === "system_bot") {
              return (
                <div className="sysev" key={m.id}>
                  {/* The glyph says WHICH move this was — the app reads the same five out of the same
                      narration, in both locales, because the backend sends no type beside it. One
                      lightning bolt for every line said only "something happened". */}
                  <span className="material-icons-outlined">{dealSystemEventIcon(m.text)}</span>
                  <span>{m.text}</span>
                </div>
              );
            }
            const mine = m.user?.id === myStreamId;
            const custom = m.custom ?? {};
            const lat = Number(custom.lat), lng = Number(custom.lng);
            const isLocation = custom.kind === "location" && Number.isFinite(lat) && Number.isFinite(lng);
            const shownText = translations[m.id] ?? m.text;
            const canTranslate = !mine && !isLocation && !!(m.text ?? "").trim();
            // Attachments are open to both parties at ANY status. A file the counterparty deliberately
            // sent in chat is the recipient's to keep — a renter has to be able to save a quotation while
            // they're deciding on it, which is precisely when the room is NOT closed. The old lock (open
            // only once `closed`, app parity with mobile's isDownloadEnabled) was never protection either:
            // images were viewable inline the whole time, so it only added friction.
            const attName = (a: StreamAttachment) => a.title || (a.type === "image" ? L("Photo", "صورة") : a.type === "audio" || (a.mime_type || "").startsWith("audio/") ? L("Voice note", "ملاحظة صوتية") : L("Attachment", "مرفق"));
            return (
              <div className={`msg ${mine ? "mine" : "them"}`} key={m.id}>
                {isLocation ? (
                  <a href={`https://www.google.com/maps?q=${lat},${lng}`} target="_blank" rel="noopener noreferrer" className="msg-att-file msg-loc">
                    <span className="material-icons-outlined">place</span>
                    <span className="msg-att-name">{(shownText && String(shownText).trim()) || L("Shared location", "موقع مشترك")}</span>
                  </a>
                ) : shownText}
                {m.attachments?.map((a, i) => {
                  // The element itself OPENS the attachment (image fullsize, PDF in the browser's viewer,
                  // voice note inline). Saving is a separate, explicit action beside it — opening a file
                  // is not keeping it, and the anchor alone gave no way to keep it.
                  const src = a.asset_url || a.image_url || a.thumb_url || "";
                  return (
                    <Fragment key={i}>
                      {a.type === "image" ? (
                        <a href={a.image_url || a.thumb_url} target="_blank" rel="noopener noreferrer" className="msg-att-img">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={a.thumb_url || a.image_url} alt={a.fallback || ""} />
                        </a>
                      ) : a.type === "audio" || (a.mime_type || "").startsWith("audio/") ? (
                        <audio controls preload="none" src={a.asset_url} className="msg-att-audio" style={{ display: "block", maxWidth: "100%", marginTop: 6 }} />
                      ) : (
                        <a href={a.asset_url} target="_blank" rel="noopener noreferrer" className="msg-att-file">
                          <span className="material-icons-outlined">{(a.mime_type || "").includes("pdf") ? "picture_as_pdf" : "insert_drive_file"}</span>
                          <span className="msg-att-name">{attName(a)}</span>
                        </a>
                      )}
                      {src && (
                        <button type="button" className="msg-att-dl" onClick={() => void saveChatAttachment(src, attFilename(a))}>
                          <span className="material-icons-outlined">download</span>
                          {L("Save", "حفظ")}
                        </button>
                      )}
                    </Fragment>
                  );
                })}
                {canTranslate && (
                  <button type="button" className="msg-tr" disabled={translating === m.id} onClick={() => void translateMsg(m)}>
                    {translating === m.id ? L("Translating…", "جارٍ الترجمة…") : translations[m.id] ? L("Show original", "النص الأصلي") : L("Translate", "ترجمة")}
                  </button>
                )}
                <div className="meta">{m.created_at ? new Date(m.created_at as string).toLocaleTimeString(ar ? "ar-SA-u-ca-gregory" : "en-GB", { hour: "2-digit", minute: "2-digit" }) : ""}</div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Footer — the composer (or what replaces it) with the quotation link PINNED underneath. One
          sticky container, because two `position: sticky; bottom: 0` siblings would both pin to the
          viewport bottom and overlap. */}
      <div className="dl-footer">
      {closed ? (
        <div className="composer ro quote-bar">
          {/* The quotation itself has moved to the pinned link below — this bar keeps only the action
              that is specific to a closed room. Leaving both here printed the same link twice. */}
          <button type="button" className="dl-quote reopen" onClick={() => { setReleaseErr(null); setReleaseOpen(true); }} disabled={releasing}>
            <span className="material-icons-outlined">lock_open</span>
            {L("Reopen negotiation", "إعادة فتح التفاوض")}
          </button>
        </div>
      ) : abandoned ? (
        <div className="composer ro"><span className="ro-note">{L("Deal room has been cancelled", "تم إلغاء غرفة الصفقة")}</span></div>
      ) : (
        <div className="composer">
          {!voiceRecording && (
            <>
              <button type="button" className="ib" disabled={!chatReady || uploading} onClick={() => fileInputRef.current?.click()} aria-label={L("Attach a file", "إرفاق ملف")}>
                <span className="material-icons-outlined">{uploading ? "hourglass_top" : "attach_file"}</span>
              </button>
              <input ref={fileInputRef} type="file" accept={CHAT_ACCEPT} hidden onChange={(e) => { void sendFiles(e.target.files); e.target.value = ""; }} />
            </>
          )}
          <VoiceRecorder
            disabled={!chatReady || uploading}
            ar={ar}
            L={L}
            maxBytes={CHAT_MAX_MEDIA}
            onRecordingChange={setVoiceRecording}
            onRecorded={(f) => void sendVoiceNote(f)}
            onError={setFileErr}
          />
          {!voiceRecording && (
            <>
              <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} disabled={!chatReady} placeholder={L("Type a message…", "اكتب رسالة…")} />
              <span className="ib send" onClick={send}><span className="material-icons-outlined">send</span></span>
            </>
          )}
          {fileErr && <span className="ro-note quote-err">{fileErr}</span>}
        </div>
      )}

      {/* The rentee's quotation link, PINNED below the composer — app parity (quotation_button.dart).
          It sits outside the thread so it never scrolls away with the conversation, it is there at
          EVERY status except ABANDONED (an abandoned room has no deal to quote), there is no
          verification or tier gate, and its LABEL carries what the availability alone would destroy:
          «معاينة» before the deal closes, «النهائي» after. */}
      {quoteKind && (
        <div className="composer ro quote-bar quote-link-bar">
          <button type="button" className={`dl-quote quote-link ${quoteKind}`} onClick={openQuotation} disabled={quoteBusy}>
            <span className="material-icons-outlined">
              {quoteBusy ? "hourglass_top" : quoteKind === "final" ? "receipt_long" : "description"}
            </span>
            {quoteBusy ? L("Preparing quotation…", "يتم تجهيز عرض السعر…") : quoteLabel}
            <span className="material-icons-outlined chev">chevron_right</span>
          </button>
          {quoteErr && <span className="ro-note quote-err">{quoteErr}</span>}
        </div>
      )}
      </div>

      {flowMode && (
        <CounterFlow
          mode={flowMode}
          room={room}
          ar={ar}
          L={L}
          busy={busy}
          error={counterErr}
          resolutions={resolutions}
          onResolveLocal={setResolution}
          onReopenLocal={clearResolution}
          unresolvedCount={unresolvedDisputed.length}
          periodLabel={periodLabel}
          periods={periods}
          hasDuration={hasDuration}
          units={units}
          messages={messages}
          onClose={() => !busy && setFlowMode(null)}
          onCounter={submitCounter}
          onAccept={doAccept}
        />
      )}

      {releaseOpen && (
        <div className="dl-modal" dir={ar ? "rtl" : "ltr"} onClick={() => !releasing && setReleaseOpen(false)}>
          <div className="dl-modal-card" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div className="dl-modal-head">
              <span className="dl-modal-ic warn"><span className="material-icons-outlined">lock_open</span></span>
              <div className="dl-modal-tt"><div className="dl-modal-title">{L("Reopen this deal?", "إعادة فتح هذه الصفقة؟")}</div></div>
              <button className="dl-modal-x" disabled={releasing} onClick={() => setReleaseOpen(false)} aria-label={L("Close", "إغلاق")}><span className="material-icons-outlined">close</span></button>
            </div>
            <div className="dl-modal-body">
              <p className="dl-modal-msg">
                {L("This reopens negotiation with the supplier — the accepted deal returns to negotiating and the terms/price can change again. A new quotation is issued once you re-confirm.", "يعيد هذا فتح التفاوض مع المؤجّر — تعود الصفقة المقبولة إلى التفاوض ويمكن تغيير الشروط والسعر. يصدر عرض سعر جديد بعد إعادة التأكيد.")}
              </p>
              {releaseErr && <p className="dl-err">{releaseErr}</p>}
            </div>
            <div className="dl-modal-foot">
              <button className="dl-mbtn" disabled={releasing} onClick={() => setReleaseOpen(false)}>{L("Cancel", "إلغاء")}</button>
              <button className="dl-mbtn warn" disabled={releasing} onClick={() => void doRelease()}>{releasing ? L("Reopening…", "جارٍ إعادة الفتح…") : L("Reopen", "إعادة الفتح")}</button>
            </div>
          </div>
        </div>
      )}

      
      {callOpen && room.supplier.phone && (
        <CallModal ar={ar} L={L} phone={room.supplier.phone} name={room.supplier.name} canCall={canCall} onClose={() => setCallOpen(false)} />
      )}

      {showRequest && <RequestSummaryModal room={room} ar={ar} L={L} onClose={() => setShowRequest(false)} />}

      {cancelOpen && (
        <CancelReasonsModal
          ar={ar}
          L={L}
          busy={cancelling}
          error={cancelErr}
          onSubmit={(reason) => void doCancel(reason)}
          onClose={() => { setCancelOpen(false); setCancelErr(null); }}
        />
      )}
    </div>
  );
}

/**
 * Request-summary modal — app parity (`showRequestSummarySheet`). A statement of what this room is
 * about, in the app's four sections: equipment, location, duration, preferences.
 *
 * Every row reads `room.details`, which the deal-room payload already carries, so the modal fetches
 * nothing. Rows whose value is missing are DROPPED rather than shown empty — the payload maps the
 * request tolerantly and a blank "Working hours: —" states less than no row at all.
 *
 * The app's equipment section also carries a YEAR and an asking PRICE. Neither is on the web's
 * `DealItemDetails`, so neither is rendered; nothing here is fabricated from the negotiated rate,
 * which is a different number from the request's ask.
 */
function RequestSummaryModal({ room, ar, L, onClose }: {
  room: DealRoomView;
  ar: boolean;
  L: (en: string, arr: string) => string;
  onClose: () => void;
}) {
  const d = room.details;
  const yn = (v: boolean | null, yes: [string, string], no: [string, string]) =>
    v === null ? null : v ? L(yes[0], yes[1]) : L(no[0], no[1]);
  // The shared vocabulary, not a local copy. This modal briefly had its own — which read `FAR_FUTURE`
  // as "Later" while the app read it as "Flexible", two answers to one code on two surfaces a renter
  // sees minutes apart.
  const urgency = d.urgency ? urgencyLabel(d.urgency, L) : null;

  const sections: Array<{ title: string; icon: string; rows: Array<[string, string | null]> }> = [
    {
      title: L("Equipment", "المعدّة"), icon: "construction",
      rows: [
        [L("Name", "الاسم"), [ar ? d.equipmentLabelAr ?? d.equipmentLabel : d.equipmentLabel, ar ? d.equipmentSizeAr ?? d.equipmentSize : d.equipmentSize].filter(Boolean).join(" · ") || null],
        [L("Units", "عدد الوحدات"), room.requestedUnits > 0 ? String(room.requestedUnits) : null],
        [L("Operator", "المشغّل"), yn(d.operatorIncluded, ["Included", "مشمول"], ["Not included", "غير مشمول"])],
        [L("Operator nationality", "جنسية المشغّل"), d.operatorNationality],
        [L("Operators", "عدد المشغّلين"), d.numberOfOperators ? String(d.numberOfOperators) : null],
      ],
    },
    {
      title: L("Location", "الموقع"), icon: "place",
      rows: [[L("Address", "العنوان"), d.location ? cityLabel(d.location, L) : null]],
    },
    {
      title: L("Duration", "المدة"), icon: "event",
      rows: [
        [L("Start date", "تاريخ البدء"), d.startDate],
        [L("End date", "تاريخ الانتهاء"), d.endDate],
        [L("Working hours", "ساعات العمل"), d.workingHoursPerDay ? `${d.workingHoursPerDay}h / ${L("day", "يوم")}` : null],
        [L("Working days", "أيام العمل"), d.workingDaysPerWeek ? `${d.workingDaysPerWeek} / ${L("week", "أسبوع")}` : null],
        [L("Rental type", "نوع التأجير"), d.rentalType ? rentalTypeLabel(d.rentalType, L) : null],
        [L("Night shift", "وردية ليلية"), yn(d.nightShift, ["Yes", "نعم"], ["No", "لا"])],
        [L("Extendable", "قابل للتمديد"), yn(d.extendable, ["Yes", "نعم"], ["No", "لا"])],
      ],
    },
    {
      title: L("Preferences", "التفضيلات"), icon: "tune",
      rows: [
        [L("Urgency", "الاستعجال"), urgency],
        [L("Subletting", "التأجير من الباطن"), yn(d.subletting, ["Allowed", "مسموح"], ["Not allowed", "غير مسموح"])],
        [L("Local content", "المحتوى المحلي"), yn(d.localContent, ["Required", "مطلوب"], ["Not required", "غير مطلوب"])],
        [L("Overtime rate", "أجر العمل الإضافي"), d.overtimeRate],
        [L("Notes", "ملاحظات"), d.additionalNotes],
      ],
    },
  ];

  return (
    <div dir={ar ? "rtl" : "ltr"} onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 80, background: "color-mix(in srgb, var(--info-deep) 50%, transparent)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 460, maxHeight: "88vh", display: "flex", flexDirection: "column", background: "var(--surface)", borderRadius: 20, overflow: "hidden", }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "18px 20px", borderBottom: "1px solid var(--surface2)" }}>
          <span className="material-icons-outlined" style={{ color: "var(--navy)" }}>assignment</span>
          <span style={{ flex: 1, textAlign: ar ? "right" : "left" }}>
            <span style={{ display: "block", fontSize: 15, fontWeight: 900, color: "var(--navy)" }}>{L("Request details", "تفاصيل الطلب")}</span>
            {room.shortCode && <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>{room.shortCode}</span>}
          </span>
          <button type="button" onClick={onClose} aria-label={L("Close", "إغلاق")} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--muted)", display: "flex" }}>
            <span className="material-icons-outlined">close</span>
          </button>
        </div>

        <div style={{ overflowY: "auto", padding: "6px 20px 20px" }}>
          {sections.map((sec) => {
            const rows = sec.rows.filter(([, v]) => v);
            if (!rows.length) return null;
            return (
              <div key={sec.title} style={{ marginTop: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, color: "var(--navy)" }}>
                  <span className="material-icons-outlined" style={{ fontSize: 16 }}>{sec.icon}</span>
                  <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: ".02em", textTransform: "uppercase" }}>{sec.title}</span>
                </div>
                <div style={{ display: "grid", gap: 1, background: "var(--surface2)", borderRadius: 12, overflow: "hidden" }}>
                  {rows.map(([k, v]) => (
                    <div key={k} style={{ display: "flex", gap: 12, justifyContent: "space-between", background: "var(--surface)", padding: "10px 12px" }}>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--muted)" }}>{k}</span>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--navy)", textAlign: ar ? "left" : "right" }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Certificates the request asked for — flat chips, since each is a name and nothing more. */}
          {(room.details.equipmentCerts.length > 0 || room.details.operatorCerts.length > 0) && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, color: "var(--navy)" }}>
                <span className="material-icons-outlined" style={{ fontSize: 16 }}>verified</span>
                <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: ".02em", textTransform: "uppercase" }}>{L("Certificates", "الشهادات")}</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {[...room.details.equipmentCerts, ...room.details.operatorCerts].map((c) => (
                  <span key={c} style={{ fontSize: 12, fontWeight: 700, color: "var(--navy)", background: "var(--background)", border: "1px solid color-mix(in srgb, var(--surface2) 60%, transparent)", borderRadius: 999, padding: "4px 10px" }}>{c}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Guided counter/accept flow — app parity (counter_offer_flow_sheet + accept flow). One 3-step modal
 * drives BOTH modes, in the order `STEPS` states: PRICE → TERMS → REVIEW.
 *  · Step 1 Price — the quotation paper's line items (rental / mobilization / return) with unit
 *    steppers and a live total, plus the payment-terms card. In ACCEPT mode these are read-only
 *    (you're accepting the standing offer); in COUNTER mode editable. Next is gated on a valid rate.
 *  · Step 2 Terms — the operating-terms table: unsettled rows first, grouped by category, then
 *    Settled, then Acknowledge. Each is resolved LOCALLY (accept / counter). Next is gated until
 *    nothing is unresolved (the app's "resolve all first" rule; accept-all-terms 409s otherwise).
 *  · Step 3 Review — the composed offer + (accept only) a contract-type selector, plus an
 *    acknowledgment. The CTA morphs: "Send counter offer" vs "Accept offer".
 *
 * ~~"reuses `DealRoomTerms`"~~ — it never did. That component rendered nowhere and has been removed;
 * the terms step is the table below. `payment_terms` sits on step 1 rather than step 2 (`PAY_KEYS`),
 * matching the app: it is settled beside the money it governs, and drawing it in both places asked
 * the renter for the same schedule twice.
 * Accept is preceded by a binding-commitment warning. Nothing is submitted until the final CTA — the
 * parent's `submitCounter`/`doAccept` do the batched term + rate/accept-all call.
 */
function CounterFlow({
  mode, room, ar, L, busy, error,
  resolutions, onResolveLocal, onReopenLocal, unresolvedCount,
  periodLabel, periods, hasDuration, units, messages, onClose, onCounter, onAccept,
}: {
  mode: "counter" | "accept";
  room: DealRoomView;
  ar: boolean;
  L: LFn;
  busy: boolean;
  error: string | null;
  resolutions: ResolutionsMap;
  onResolveLocal: (key: string, action: "accept" | "counter", value?: unknown) => void;
  onReopenLocal: (key: string) => void;
  unresolvedCount: number;
  periodLabel: string;
  periods: number;
  hasDuration: boolean;
  units: number;
  messages: ChatMsg[];
  onClose: () => void;
  onCounter: (next: {
    rate: number; mobPrice?: number; demobPrice?: number;
    rentalUnits?: number; mobUnits?: number; demobUnits?: number; mobExcluded?: boolean; demobExcluded?: boolean;
  }) => void;
  onAccept: (contractType: string) => void;
}) {
  const editable = mode === "counter";
  // Reconstructed negotiation history (app parity) — the LIVE position is read off this, not just the
  // room columns, so a supplier's unit counter is RECEIVED here (app resolveLivePosition). Also drives
  // the round number, the "Supplier: N units" references, and the supplier-total on the compare card.
  const flowRounds = withOpeningRound(collapseRounds(reconstructRounds(messages as unknown[])), roomOpeningRound(room));
  const latestRound = flowRounds.length ? flowRounds[flowRounds.length - 1] : null;
  const supRound = latestRoundBy(flowRounds, "supplier");
  // Accept is gated behind a binding-commitment warning first (app parity). Counter skips it.
  const [bindingOk, setBindingOk] = useState(mode === "counter");
  const [page, setPage] = useState(0); // 0 = Terms, 1 = Price, 2 = Summary
  // Price seeds from the LIVE position too (app resolveLivePosition: latest?.rate ?? room.lastProposedRate
  // ?? bid.priceAmount). room.rate already collapses lastProposedRate → bid.priceAmount, so preferring the
  // latest reconstructed round first guards against any lag between the DB column and the chat message.
  const seedRate = latestRound?.rate ?? room.rate;
  const seedMob = latestRound?.mobPrice ?? room.mobPrice;
  const seedDemob = latestRound?.demobPrice ?? room.demobPrice;
  const [rateStr, setRateStr] = useState(seedRate ? String(seedRate) : "");
  const [mobStr, setMobStr] = useState(seedMob ? String(seedMob) : "");
  const [demobStr, setDemobStr] = useState(seedDemob ? String(seedDemob) : "");
  const [contractType, setContractType] = useState(room.contractType ?? "formal");
  const [ack, setAck] = useState(false);

  // deal-room/negotiation — per-type unit counts (cap = requested; mob/demob ≤ rental) + leg exclusion.
  // Seed from the LIVE position (app resolveLivePosition precedence: latest reconstructed round → room
  // columns → offered/requested → clamp) so the supplier's countered units land on the rentee side.
  const cap = Math.max(1, room.requestedUnits || units || 1);
  const liveRental = Math.max(1, Math.min(cap, latestRound?.rentalUnits ?? room.agreedUnits ?? units ?? 1));
  // Seeded UNCAPPED (app parity: `effectiveMobUnits` has no clamp) — the stepper's own `max` is what
  // stops the renter PROPOSING more trips than machines; a count already on the table is shown as it is.
  const liveMob = Math.max(0, latestRound?.mobUnits ?? room.mobUnits ?? liveRental);
  const liveDemob = Math.max(0, latestRound?.demobUnits ?? room.demobUnits ?? liveRental);
  const [rentalUnits, setRentalUnits] = useState<number>(liveRental);
  const [mobUnitsN, setMobUnitsN] = useState<number>(liveMob);
  const [demobUnitsN, setDemobUnitsN] = useState<number>(liveDemob);
  const [mobExcluded, setMobExcluded] = useState<boolean>(latestRound?.mobExcluded ?? room.mobExcluded);
  const [demobExcluded, setDemobExcluded] = useState<boolean>(latestRound?.demobExcluded ?? room.demobExcluded);
  const [cmpOpen, setCmpOpen] = useState(false); // compare-card per-line breakdown toggle
  // Confirm before a leg (delivery/return) is excluded from the offer — reversible, but the app confirms.
  const [pendingEx, setPendingEx] = useState<null | { title: string; onYes: () => void }>(null);
  // Quotation-paper UI-only state (spec §6): collapsible دليل البنود categories + the السجل log modal.
  const [guideOpen, setGuideOpen] = useState<Record<string, boolean>>({});
  const [logOpen, setLogOpen] = useState(false);
  const [logTab, setLogTab] = useState<"all" | "price" | "terms">("all");
  const [paperZoom, setPaperZoom] = useState(0.85); // desk paper zoom (§6 oldWrap): 50%–180%

  const num = (s: string) => { const n = Number(s); return s.trim() !== "" && !Number.isNaN(n) && n >= 0 ? n : 0; };
  const rate = editable ? num(rateStr) : (room.rate ?? 0);
  const mob = editable ? num(mobStr) : (room.mobPrice ?? 0);
  const demob = editable ? num(demobStr) : (room.demobPrice ?? 0);
  const rateValid = rate > 0;

  // The counter-offer editor recomputes locally (the rate + unit counts are being edited, so it can't
  // read `computeDealTotals`' snapshot) — but it must recompute the SAME WAY, through the shared module.
  // It previously carried its own divisor table with a SEVEN-day week and no Friday exclusion, so a
  // counter-offer at an unchanged rate showed a different total from the price bar right above it.
  const rNU = editable ? rentalUnits : (room.agreedUnits ?? units);
  // Editing is bounded by the stepper (you can't PROPOSE more trips than machines); READING is not —
  // a stored count above the rental count is what the app bills, so the sheet shows and prices it.
  const mNU = editable ? Math.min(mobUnitsN, rNU) : (room.mobUnits ?? rNU);
  const dNU = editable ? Math.min(demobUnitsN, rNU) : (room.demobUnits ?? rNU);
  const mEx = editable ? mobExcluded : room.mobExcluded;
  const dEx = editable ? demobExcluded : room.demobExcluded;
  // Same date the price bar prorates against. It lives on `details`, NOT at the top of the room — a
  // `room.startDate` here type-checks under a loose signature and silently evaluates to undefined,
  // which turns proration off and shows the raw rate.
  const startDate = room.details?.startDate ?? null;
  // `periods` arrives as one full period when the room has no duration, so it must NOT be handed to the
  // module as a window — that would strike out Fridays nobody booked and undercut the rate the renter
  // typed. Open deals price at the bare rate, exactly as the app's open-deal branch does.
  const rentalCalc = hasDuration
    ? computeRentalTotal({ rate, priceUnit: room.priceUnit, startDate, durationDays: periods })
    : { total: rate, billable: 0, raw: true, exact: true };
  const perUnitRental = rentalCalc.total;
  // The paper states the days the rate is actually charged across, not the calendar duration — the same
  // number the bid card puts on its rental row, and the one `perUnitRental` above was built from.
  const rentalDivisorNote = divisorNote(room.priceUnit, L);
  const lines = computeQuoteTotals({
    perUnitRental,
    rentalUnits: rNU,
    mob: { amount: mob, units: mNU, excluded: mEx },
    demob: { amount: demob, units: dNU, excluded: dEx },
  });
  const rentalLine = lines.overall.rental;
  const mobLine = lines.overall.mob;
  const demobLine = lines.overall.demob;
  const subtotal = lines.overall.subtotal;
  const vat = Math.round(lines.overall.vat);
  const total = subtotal + vat;

  // العدد stepper — symmetric, capped. Rental caps at requested; mob/demob cap at the current rental.
  const Stepper = ({ value, min, max, onChange, disabled }: { value: number; min: number; max: number; onChange: (v: number) => void; disabled?: boolean }) => {
    const btn = (d: number, lbl: string, off: boolean) => (
      <button type="button" disabled={disabled || off} onClick={() => onChange(Math.max(min, Math.min(max, value + d)))}
        className="grid h-[26px] w-[26px] place-items-center rounded-sm border text-subhead font-extrabold disabled:bg-disabled-bg disabled:text-disabled-fg"
        style={{ borderColor: "var(--border,var(--border))", color: "var(--navy,var(--navy-deep))", background: "var(--surface1,var(--surface))" }}>{lbl}</button>
    );
    return (
      <span className="inline-flex items-center gap-1.5">
        {btn(-1, "−", value <= min)}
        <span className="min-w-[20px] text-center text-body font-extrabold" style={{ color: "var(--navy,var(--navy-deep))" }}>{value}</span>
        {btn(1, "+", value >= max)}
      </span>
    );
  };
  const sar = L("SAR", "ر.س");
  const money = (v: number) => `${nf(v)} ${sar}`;

  const CONTRACT_TYPES: { value: string; label: string }[] = [
    { value: "formal", label: L("Formal contract", "عقد رسمي") },
    { value: "simple", label: L("Simple agreement", "اتفاق مبسّط") },
    { value: "platform", label: L("Platform terms", "شروط المنصّة") },
    { value: "direct", label: L("Direct", "مباشر") },
    { value: "none", label: L("No contract", "بدون عقد") },
  ];

  // Binding-commitment warning before the accept flow.
  if (!bindingOk) {
    return (
      <div className="dl-modal" dir={ar ? "rtl" : "ltr"} onClick={onClose}>
        <div className="dl-modal-card" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
          <div className="dl-modal-head">
            <span className="dl-modal-ic danger"><span className="material-icons-outlined">gavel</span></span>
            <div className="dl-modal-tt"><div className="dl-modal-title">{L("This is a binding commitment", "هذا التزام مُلزِم")}</div></div>
            <button className="dl-modal-x" onClick={onClose} aria-label={L("Close", "إغلاق")}><span className="material-icons-outlined">close</span></button>
          </div>
          <div className="dl-modal-body center">
            <p className="dl-modal-msg">
              {L("Accepting confirms the agreed rate and terms with the supplier for final confirmation. Please review the terms and price before you continue.", "القبول يؤكّد السعر والشروط المتفق عليها مع المؤجّر للتأكيد النهائي. يُرجى مراجعة الشروط والسعر قبل المتابعة.")}
            </p>
            <label className="dl-modal-ack">
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
              {L("I understand this is binding", "أفهم أن هذا مُلزِم")}
            </label>
          </div>
          <div className="dl-modal-foot">
            <button className="dl-mbtn" onClick={onClose}>{L("Cancel", "إلغاء")}</button>
            <button className="dl-mbtn green" disabled={!ack} onClick={() => { setAck(false); setBindingOk(true); }}>{L("Continue", "متابعة")}</button>
          </div>
        </div>
      </div>
    );
  }

  // Pages reordered to spec §6: 0 = السعر (price), 1 = الشروط (terms), 2 = المراجعة (review).
  const canNext = page === 0 ? (editable ? rateValid : true) : page === 1 ? unresolvedCount === 0 : true;
  const canSubmit = editable ? rateValid : ack;
  const allMatched = unresolvedCount === 0;
  const doSubmit = () =>
    editable
      ? onCounter({ rate, mobPrice: mob || undefined, demobPrice: demob || undefined, rentalUnits, mobUnits: Math.min(mobUnitsN, rentalUnits), demobUnits: Math.min(demobUnitsN, rentalUnits), mobExcluded, demobExcluded })
      : onAccept(contractType);

  // ── quotation-paper helpers (classic terms table + payment card + دليل البنود) ──
  const PAY_KEYS = new Set(["payment_terms", "payment_method"]);
  const payTerms = room.terms.filter((t) => PAY_KEYS.has(t.key));
  const operatingTerms = room.terms.filter((t) => !PAY_KEYS.has(t.key));
  const supStr = (t: DealTerm) => (t.supplierDeclared != null ? String(t.supplierDeclared) : null);
  type Dec = { badge: "match" | "conflict" | "none" | "locked"; chosen: unknown; server: boolean };
  const decide = (t: DealTerm): Dec => {
    if (t.state === "fixed") return { badge: "locked", chosen: t.value ?? t.platformDefault, server: true };
    if (t.state === "agreed" || t.state === "soft_accepted") return { badge: "match", chosen: t.value ?? t.supplierDeclared ?? t.renteePreference, server: true };
    const r = resolutions[t.key];
    if (!r) return { badge: "none", chosen: null, server: false };
    if (r.action === "accept") return { badge: "match", chosen: t.supplierDeclared, server: false };
    const cv = r.value != null ? String(r.value) : null;
    return { badge: cv != null && cv === supStr(t) ? "match" : "conflict", chosen: r.value, server: false };
  };
  const choicesFor = (t: DealTerm): { value: string; label: string }[] => {
    const seen = new Set<string>();
    const out: { value: string; label: string }[] = [];
    const push = (v: unknown, label?: string) => {
      if (v == null || v === "") return;
      const val = String(v);
      if (seen.has(val)) return;
      seen.add(val);
      out.push({ value: val, label: label ?? valText(v, L) });
    };
    push(t.supplierDeclared);
    for (const o of t.options) push(o.value, ar ? o.labelAr : o.labelEn);
    push(t.renteePreference);
    return out;
  };
  const pickTerm = (t: DealTerm, val: string) => {
    if (val === "__none") { onReopenLocal(t.key); return; }
    if (supStr(t) != null && val === supStr(t)) onResolveLocal(t.key, "accept");
    else onResolveLocal(t.key, "counter", val);
  };
  const chosenSel = (t: DealTerm): string => { const c = decide(t).chosen; return c != null ? String(c) : "__none"; };
  const catOf = (k: string): string => {
    if (/^operator|^fat|nationality|night_shift/.test(k)) return L("Operator", "المشغّل");
    if (/fuel|maintenance|breakdown|equipment|saso|attachment/.test(k)) return L("Equipment", "المعدّة");
    if (/overtime|working|crosshire|local_content|shift/.test(k)) return L("Work", "العمل");
    return L("Other", "أخرى");
  };
  const badgeLabel = (b: Dec["badge"]) => (b === "match" ? L("Match", "مطابق") : b === "conflict" ? L("Differs", "يختلف") : b === "locked" ? L("Fixed", "مثبّت") : L("Not set", "لم تحدّد"));
  const isSettled = (b: Dec["badge"]) => b === "match" || b === "locked";

  /**
   * A term's value as a renter reads it, in the term's OWN vocabulary.
   *
   * `valText` alone handles booleans, arrays and the responsibility words, but not the enums whose
   * meaning depends on which term they belong to — an SLA's `FOUR_HR` and a maintenance term's
   * `SUPPLIER` are both bare strings, and only the key says which is which. Same helper the quotation
   * uses, so a term reads identically here and on the paper the renter signs.
   */
  const tval = (t: DealTerm, v: unknown): string => termValueLabel(t.key, v, L) ?? valText(v, L);

  // ── term provenance + history (app parity: TermSource + the checklist's history hint) ──
  //
  // A term carries three reference values — the renter's preference, the supplier's declaration and
  // the platform default — and the table can only show one of them per column. `source` says which
  // one is actually IN FORCE, so the renter is not left inferring which of three numbers binds him.
  //
  // A FIXED term needs no such line: locked means the value came from the renter's own request and
  // was accepted by the act of bidding, which the lock already says.
  const srcNote = (t: DealTerm): string | null => {
    if (t.state === "fixed") return null;
    return t.source === "rentee_fixed" ? L("from your request", "من طلبك")
      : t.source === "supplier_declared" ? L("supplier's declaration", "إقرار المورد")
      : L("platform default", "الافتراضي");
  };

  // The LAST move on a term, one line — "Countered: 30 days · 4 Mar". The app shows the same single
  // line rather than a log: a term argued three times is still decided on its latest position, and
  // the whole exchange is already in the conversation above.
  const histNote = (t: DealTerm): string | null => {
    const h = lastTermMove(t);
    if (!h) return null;
    const verb = h.action === "counter" ? L("Countered", "عرض مضاد")
      : h.action === "accept" ? L("Accepted", "قُبل")
      : h.action === "propose_update" ? L("Proposed", "اقتُرح")
      : h.action;
    const when = new Date(h.at);
    const stamp = Number.isNaN(when.getTime()) ? null : when.toLocaleDateString(ar ? "ar" : "en", { day: "numeric", month: "short" });
    const val = h.value == null || h.value === "" ? null : tval(t, h.value);
    return [val ? `${verb}: ${val}` : verb, stamp].filter(Boolean).join(" · ");
  };

  /** The two sub-label lines a term row carries, when it has them. */
  const termNotes = (t: DealTerm) => {
    const src = srcNote(t);
    const hist = histNote(t);
    if (!src && !hist) return null;
    return (
      <>
        {src && <span className="qp-tsrc">{src}</span>}
        {hist && <span className="qp-thist"><span className="material-icons-outlined">history</span>{hist}</span>}
      </>
    );
  };
  const groupByCat = (list: DealTerm[]): [string, DealTerm[]][] => {
    const m = new Map<string, DealTerm[]>();
    for (const t of list) { const c = catOf(t.key); const g = m.get(c) ?? []; g.push(t); m.set(c, g); }
    return [...m];
  };

  // Supplier's standing offer (compare card) — from the SUPPLIER's latest reconstructed round (their real
  // offer INCL. their unit counts + leg exclusion), via the shared ÷26/÷7 + VAT math; falls back to the
  // room's on-table numbers when no supplier round exists. This is why a supplier unit counter now moves it.
  const supDeal = supRound ? roundTotals(room, supRound) : computeDealTotals(room);
  const supTotal = supDeal.grand;
  // "Supplier: {price}" references — read the supplier's own round (app parity: otherSide.rate/mobPrice/
  // demobPrice), falling back to the room columns, exactly like the "Supplier: N units" refs beside them.
  const refRate = supRound?.rate ?? room.rate;
  const refMobPrice = supRound?.mobPrice ?? room.mobPrice;
  const refDemobPrice = supRound?.demobPrice ?? room.demobPrice;
  const showCompare = editable && room.lastCounterBy === "supplier";
  const priceDiff = Math.abs(total - supTotal);

  const STEPS = [L("Price", "السعر"), L("Terms", "الشروط"), L("Review", "المراجعة")];
  const sheetTitle = `${room.details.equipmentLabel ?? L("Equipment", "المعدّة")}${rNU > 1 ? ` — ${rNU} ${L("units", "وحدات")}` : ""}`;
  const roomCode = room.shortCode ?? "";
  // Round number in the header + the Log list — from the history reconstructed at the top of the flow.
  const roundNo = flowRounds.length + 1;
  const today = new Date().toLocaleDateString(ar ? "ar-SA-u-ca-gregory" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
  const changedFrom = (cur: number, ref: number | null) => ref != null && Math.round(cur) !== Math.round(ref);

  // Quotation head (reused on the price + review papers). CR/VAT + a formal quotation number aren't in
  // the deal-room payload, so we show the company + location + the room short code (no fabricated ids).
  const qhead = () => (
    <div className="qp-qhead">
      <div className="qp-qco">
        <div className="qp-qlogo">{room.supplier.name.charAt(0).toUpperCase()}</div>
        <div className="qp-qcoinfo">
          <b>{room.supplier.name}</b>
          {room.details.location && <span className="ln">{room.details.location}</span>}
        </div>
      </div>
      <div className="qp-qno" dir="ltr">
        <div className="lbl">{L("QUOTATION №", "عرض سعر رقم")}</div>
        <div className="num">{roomCode || "—"}</div>
        <div className="sub">{L("Issued", "التاريخ")} {today}</div>
      </div>
    </div>
  );

  // Editable price → the prototype's green "عدّل" box (green tint + inner edit icon).
  const priceBox = (val: string, onChange: (s: string) => void) => (
    <span className="qp-pricebox"><span className="material-icons-outlined ic">edit</span><input type="number" inputMode="numeric" min={0} value={val} onChange={(e) => onChange(e.target.value)} className="qp-price-in" placeholder="0" /></span>
  );

  // A price-table leg row (mob/demob): red ✕ exclude + trip stepper + green price box + المورد ref.
  const legTr = (label: string, sub: string, priceStr: string, setPrice: (s: string) => void, u: number, setU: (v: number) => void, ex: boolean, setEx: (b: boolean) => void, refPrice: number | null, refUnits: number | null, exTitle: string) => {
    // Capped only while editing — see `mNU`/`dNU` above.
    const shown = editable ? Math.min(u, rentalUnits) : u;
    const line = ex ? 0 : num(priceStr) * shown;
    return (
      <tr className={ex ? "ex" : undefined}>
        <td>
          <div className="qp-itemcell">
            {editable && !ex && <button type="button" className="qp-legx" title={L("Exclude", "استبعاد")} onClick={() => setPendingEx({ title: exTitle, onYes: () => setEx(true) })}>✕</button>}
            <div>
              <div className="lbl">{label}</div>
              <div className="sub">{sub}</div>
              {editable && ex && <button type="button" className="qp-legbtn restore" onClick={() => setEx(false)}>+ {L("Restore", "استعادة")}</button>}
            </div>
          </div>
        </td>
        <td className="mut">{L("Trip", "رحلة")}</td>
        <td>{ex ? "—" : <div className="qp-qty">{editable && <span className="hint">{L("Your choice", "خيارك")}</span>}{editable ? <Stepper value={shown} min={0} max={rentalUnits} onChange={setU} /> : <b>{shown}</b>}{editable && refUnits != null && <div className={`qp-ref${changedFrom(shown, refUnits) ? " changed" : ""}`}>{L("Supplier", "المورد")}: {refUnits} {L("units", "وحدة")}</div>}</div>}</td>
        <td>
          {ex ? <span className="qp-excluded">{L("Excluded", "مستبعد")}</span>
            : editable ? <>{priceBox(priceStr, setPrice)}{refPrice != null && <div className={`qp-ref${changedFrom(num(priceStr), refPrice) ? " changed" : ""}`}>{L("Supplier", "المورد")}: {nf(refPrice)}</div>}</>
            : <b className="tot">{money(num(priceStr))}</b>}
        </td>
        <td><b className="tot">{ex ? L("Not incl.", "غير مشمول") : money(line)}</b></td>
      </tr>
    );
  };

  // One row of the compare-card per-line breakdown (app _DeltaTable parity): your PER-UNIT price vs the
  // supplier's per-unit price (rate / mobPrice / demobPrice) + the per-line difference. Units are shown
  // separately in the qty steppers' "Supplier: N units" refs (app splits price vs count the same way).
  // Excluded legs read "Not included".
  const cmpRow = (label: string, mine: number, myEx: boolean, theirs: number, theirEx: boolean) => {
    const bothEx = myEx && theirEx;
    const oneEx = myEx !== theirEx;
    const eq = Math.round(mine) === Math.round(theirs);
    const noDiff = bothEx || (!oneEx && eq); // no meaningful per-unit difference to show
    return (
      <tr>
        <td className="ln">{label}</td>
        <td>{myEx ? <span className="na">{L("Not incl.", "غير مشمول")}</span> : nf(mine)}</td>
        <td>{theirEx ? <span className="na">{L("Not incl.", "غير مشمول")}</span> : nf(theirs)}</td>
        <td className={noDiff ? "na" : "gap"}>{bothEx ? "—" : oneEx ? "±" : eq ? "—" : nf(Math.abs(mine - theirs))}</td>
      </tr>
    );
  };

  return (
    <div className="qp-scrim" dir={ar ? "rtl" : "ltr"} onClick={() => !busy && onClose()}>
      <div className="qp-sheet qp-full" onClick={(e) => e.stopPropagation()}>
        {/* two-row header */}
        <div className="qp-head">
          <div className="qp-head-r1">
            <div className="qp-htitle">
              <div className="t">{sheetTitle}</div>
              <div className="s">{L("Negotiation room", "غرفة التفاوض")}{roomCode ? ` · ${roomCode}` : ""} · {L(`Round ${roundNo}`, `الجولة ${roundNo}`)}</div>
            </div>
            <div className="qp-htotal"><div className="k">{L("Your offer", "إجمالي عرضك")}</div><div className="v">{nf(total)} {sar}</div></div>
            <button className="qp-x" onClick={() => !busy && onClose()} aria-label={L("Close", "إغلاق")}><span className="material-icons-outlined">close</span></button>
          </div>
          <div className="qp-steps">
            {STEPS.map((s, i) => (
              <Fragment key={i}>
                {i > 0 && <span className={`bar${i <= page ? " done" : ""}`} />}
                <span className={`qp-step${i === page ? " on" : i < page ? " done" : ""}`}>
                  <span className="badge">{i < page ? "✓" : i + 1}</span>
                  <span className="lbl">{s}</span>
                </span>
              </Fragment>
            ))}
          </div>
        </div>

        {/* body — full-screen grey desk holding the zoomable white paper (§6 oldWrap) */}
        <div className="qp-desk">
          <div className="qp-deskpad">
          {/* ① السعر — quotation paper */}
          {page === 0 && (
            <div className="qp-paper" style={{ zoom: String(paperZoom) }}>
              {showCompare && (
                <div className="qp-compare">
                  <div className="duo">
                    <div className="side sup"><div className="k">{L("Supplier's offer", "عرض المورد")}</div><div className="v">{nf(supTotal)}</div></div>
                    <div className="side me"><div className="k">{L("Your offer", "عرضك")}</div><div className="v">{nf(total)}</div></div>
                  </div>
                  <div className="conv"><span className="track" /><span className={`chip${priceDiff === 0 ? " ok" : ""}`}>{priceDiff === 0 ? L("Match ✓", "تطابق ✓") : `${L("Gap", "الفرق")} ${nf(priceDiff)}`}</span><span className="track" /></div>
                  <button type="button" className="qp-cmp-toggle" onClick={() => setCmpOpen((o) => !o)} aria-expanded={cmpOpen}>
                    <span>{cmpOpen ? L("Hide breakdown", "إخفاء التفاصيل") : L("Show breakdown", "عرض التفاصيل")}</span>
                    <span className="material-icons-outlined">{cmpOpen ? "expand_less" : "expand_more"}</span>
                  </button>
                  {cmpOpen && (
                    <div className="qp-scrollx"><table className="qp-cmp-tbl">
                      <thead><tr><th>{L("Per-unit rate", "السعر لكل وحدة")}</th><th>{L("Yours", "عرضك")}</th><th>{L("Supplier", "المورد")}</th><th>{L("Difference", "الفرق")}</th></tr></thead>
                      <tbody>
                        {cmpRow(L("Base rental", "الإيجار الأساسي"), rate, false, supDeal.rate, false)}
                        {cmpRow(L("Mobilization", "التعبئة"), mob, mEx, supDeal.mobPrice, supDeal.mobExcluded)}
                        {cmpRow(L("Return — demob", "الإرجاع"), demob, dEx, supDeal.demobPrice, supDeal.demobExcluded)}
                      </tbody>
                    </table></div>
                  )}
                </div>
              )}
              {qhead()}
              <div className="qp-sech">{L("Price quotation", "عرض السعر")}</div>
              <div className="qp-scrollx"><table className="qp-table">
                <thead><tr><th>{L("Item", "البند")}</th><th>{L("Duration", "المدة")}</th><th>{L("Qty", "العدد")}</th><th>{L("Price", "السعر")}</th><th>{L("Total", "الإجمالي")}</th></tr></thead>
                <tbody>
                  <tr>
                    <td><div className="lbl">{L("Base rental", "الإيجار الأساسي")}</div><div className="sub">{room.details.equipmentLabel ?? periodLabel}</div></td>
                    {/* Billable days, not the calendar duration — the rate below is charged across THESE,
                        exactly as the bid card's rental row states it. The calendar span stays underneath
                        so the renter can see where the number came from. */}
                    <td className="mut">
                      {hasDuration && !rentalCalc.raw ? (
                        <>
                          <div>{rentalCalc.billable} {L("days", "يوم")}</div>
                          <div className="sub">{periods} {L("days, Fridays excluded", "يوم، باستثناء الجمعة")}</div>
                        </>
                      ) : hasDuration ? `${periods} ${L("days", "يوم")}` : "—"}
                    </td>
                    <td><div className="qp-qty">{editable && <span className="hint">{L("Your choice", "خيارك")}</span>}{editable ? <Stepper value={rentalUnits} min={1} max={cap} onChange={(v) => { setRentalUnits(v); setMobUnitsN((u) => Math.min(u, v)); setDemobUnitsN((u) => Math.min(u, v)); }} /> : <b>{rNU}</b>}<span className="qp-qmatch">✓ {L("Qty", "العدد")} {rNU}</span>{editable && supRound?.rentalUnits != null && <div className={`qp-ref${changedFrom(rentalUnits, supRound.rentalUnits) ? " changed" : ""}`}>{L("Supplier", "المورد")}: {supRound.rentalUnits} {L("units", "وحدة")}</div>}</div></td>
                    <td>
                      {editable ? <>{priceBox(rateStr, setRateStr)}{refRate != null && <div className={`qp-ref${changedFrom(rate, refRate) ? " changed" : ""}`}>{L("Supplier", "المورد")}: {nf(refRate)}</div>}</> : <b className="tot">{money(rate)}</b>}
                      {/* The rate is per PERIOD, and the divisor is what turns it into the day count in the
                          Duration column. Both stated the way the bid card states them. */}
                      <div className="sub">/ {periodLabel}{rentalDivisorNote ? ` · ${rentalDivisorNote}` : ""}</div>
                    </td>
                    <td><b className="tot">{money(rentalLine)}</b></td>
                  </tr>
                  {legTr(L("Mobilization — mob", "التعبئة — موب"), L("delivery", "توصيل"), mobStr, setMobStr, mobUnitsN, setMobUnitsN, mobExcluded, setMobExcluded, refMobPrice, supRound?.mobUnits ?? null, L("Cancel mobilization (delivery to site) from the supplier?", "إلغاء التعبئة (النقل إلى الموقع) من المورد؟"))}
                  {legTr(L("Return — demob", "الإرجاع — ديموب"), L("pickup", "استلام"), demobStr, setDemobStr, demobUnitsN, setDemobUnitsN, demobExcluded, setDemobExcluded, refDemobPrice, supRound?.demobUnits ?? null, L("Cancel demobilization (return from site) from the supplier?", "إلغاء الإرجاع (النقل من الموقع) من المورد؟"))}
                </tbody>
              </table></div>
              <div className="qp-totals">
                <div className="qp-trow"><span className="l">{L("Subtotal before VAT", "المجموع قبل الضريبة")}</span><span className="v">{money(subtotal)}</span></div>
                <div className="qp-trow"><span className="l">{L("VAT 15%", "ضريبة القيمة المضافة ١٥٪")}</span><span className="v">{money(vat)}</span></div>
                <div className="qp-trow net"><span className="l">{L("Net incl. VAT", "الصافي شامل الضريبة")}</span><span className="v">{money(total)}</span></div>
              </div>
              <div className="qp-words"><span className="k">{L("Amount in words", "المبلغ بالحروف")}</span>{nf(total)} {L("Saudi Riyals only", "ريال سعودي فقط لا غير")}</div>
              {payTerms.length > 0 && (
                <div className="qp-pay">
                  <div className="qp-sech">{L("Payment terms", "شروط الدفع")}</div>
                  {payTerms.map((t) => { const d = decide(t); const opts = choicesFor(t); return (
                    <div key={t.key} className="qp-pay-row">
                      <span className="k">{ar ? t.labelAr : t.label}{termNotes(t)}</span>
                      {editable && !d.server ? (
                        <select className="qp-sel" value={chosenSel(t)} onChange={(e) => pickTerm(t, e.target.value)}>
                          <option value="__none">{L("— choose —", "— اختر —")}</option>
                          {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      ) : <b style={{ flex: 1 }}>{tval(t, d.chosen ?? t.supplierDeclared)}</b>}
                      <span className={`qp-badge ${isSettled(d.badge) ? "match" : d.badge === "conflict" ? "diff" : "none"}`}>{badgeLabel(d.badge)}</span>
                    </div>
                  ); })}
                </div>
              )}
              {editable && !rateValid && <p style={{ marginTop: 10, fontSize: 12, fontWeight: 700, color: "var(--danger,var(--danger))" }}>{L("Enter a rate to continue", "أدخل سعرًا للمتابعة")}</p>}
            </div>
          )}

          {/* ② الشروط — classic quotation table */}
          {page === 1 && (
            <div className="qp-paper" style={{ zoom: String(paperZoom) }}>
              {qhead()}
              <div className="qp-sech">{L("Operating terms", "شروط التشغيل")}</div>
              {operatingTerms.length === 0 ? (
                <p style={{ padding: "20px 0", textAlign: "center", color: "var(--muted,var(--muted))", fontSize: 13 }}>{L("No operating terms.", "لا توجد شروط تشغيل.")}</p>
              ) : (
                <div className="qp-scrollx"><table className="qp-tt">
                  <thead><tr><th>{L("Term", "البند")}</th><th>{L("Supplier's offer", "عرض المورد")}</th><th>{L("Your decision", "قرارك")}</th><th>{L("Status", "الحالة")}</th></tr></thead>
                  <tbody>
                    {groupByCat(operatingTerms.filter((t) => !isSettled(decide(t).badge))).map(([cat, list]) => (
                      <Fragment key={cat}>
                        <tr className="cat"><td colSpan={4}>{cat}</td></tr>
                        {list.map((t) => { const d = decide(t); const opts = choicesFor(t); return (
                          <tr key={t.key}>
                            <td className="lbl">{ar ? t.labelAr : t.label}{termNotes(t)}</td>
                            <td className="sup">{tval(t, t.supplierDeclared)}</td>
                            <td>{editable ? (
                              <select className="qp-sel" value={chosenSel(t)} onChange={(e) => pickTerm(t, e.target.value)}>
                                <option value="__none">{L("— choose —", "— اختر —")}</option>
                                {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                              </select>
                            ) : <span className="sup">{tval(t, d.chosen)}</span>}</td>
                            <td><span className={`qp-ttbadge ${d.badge}`}>{badgeLabel(d.badge)}</span></td>
                          </tr>
                        ); })}
                      </Fragment>
                    ))}
                    {/* SETTLED and ACKNOWLEDGE are two sections, not one (app parity: the terms page's
                        Negotiable and Acknowledge buckets).

                        ~~One "Settled & fixed terms" section.~~ It put two unlike things under one
                        heading: a term the renter just settled, which he chose and can reopen, beside
                        a term FIXED by his own request and accepted by the act of bidding, which was
                        never his to argue. Both carried the right badge, so nothing was wrong — but a
                        renter scanning headings had to read every badge to learn which rows were still
                        his to touch. */}
                    {operatingTerms.some((t) => decide(t).badge === "match") && (
                      <>
                        <tr className="cat settled"><td colSpan={4}>{L("Settled", "البنود المحسومة")}</td></tr>
                        {operatingTerms.filter((t) => decide(t).badge === "match").map((t) => { const d = decide(t); return (
                          <tr key={t.key}>
                            <td className="lbl">{ar ? t.labelAr : t.label}{termNotes(t)}</td>
                            <td className="sup" colSpan={2}>{tval(t, d.chosen ?? t.value)}{editable && !d.server && <button type="button" className="qp-ttreopen" title={L("Reopen", "إعادة فتح")} onClick={() => onReopenLocal(t.key)}>↻</button>}</td>
                            <td><span className={`qp-ttbadge ${d.badge}`}>{badgeLabel(d.badge)}</span></td>
                          </tr>
                        ); })}
                      </>
                    )}
                    {operatingTerms.some((t) => decide(t).badge === "locked") && (
                      <>
                        <tr className="cat settled"><td colSpan={4}>{L("Acknowledge — fixed by your request", "للعلم — مثبّتة من طلبك")}</td></tr>
                        {operatingTerms.filter((t) => decide(t).badge === "locked").map((t) => { const d = decide(t); return (
                          <tr key={t.key} className="locked">
                            <td className="lbl">🔒 {ar ? t.labelAr : t.label}{termNotes(t)}</td>
                            <td className="sup" colSpan={2}>{tval(t, d.chosen ?? t.value)}</td>
                            <td><span className={`qp-ttbadge ${d.badge}`}>{badgeLabel(d.badge)}</span></td>
                          </tr>
                        ); })}
                      </>
                    )}
                  </tbody>
                </table></div>
              )}
            </div>
          )}

          {/* ③ المراجعة — quotation summary */}
          {page === 2 && (
            <div className="qp-paper" style={{ zoom: String(paperZoom) }}>
              {qhead()}
              {room.details.location && (
                <div className="qp-addr">
                  <div className="qp-addrbox"><span className="k">{L("Address", "العنوان")}</span><span className="v">{room.details.location ? cityLabel(room.details.location, L) : "—"}</span></div>
                  <div className="qp-addrbox"><span className="k">{L("City", "المدينة")}</span><span className="v">{room.details.location.split(/[·,،]/).map((s) => s.trim()).filter(Boolean).pop()}</span></div>
                </div>
              )}
              <div className="qp-rgrid">
                <div className="qp-rcol">
                  <div className="qp-rcard">
                    <div className="qp-rcard-h"><span className="material-icons-outlined">receipt_long</span>{L("Price summary", "ملخص عرض السعر")}</div>
                    <div className="qp-totals" style={{ borderTop: 0, paddingTop: 0 }}>
                      {/* The days quoted here are the BILLABLE ones — the rental below is charged across
                          exactly these, and naming the calendar span would overstate what the money buys. */}
                      <div className="qp-trow"><span className="l">{L("Quantity", "الكمية")}</span><span className="v">{rNU} {L("units", "وحدة")}{hasDuration ? (rentalCalc.raw ? ` · ${periods} ${L("days", "يوم")}` : ` · ${rentalCalc.billable} ${L("billable days", "يوم محتسب")}`) : ""}</span></div>
                      <div className="qp-trow"><span className="l">{L("Base rental", "الإيجار الأساسي")}</span><span className="v">{money(rentalLine)}{rentalDivisorNote ? <span className="sub"> · {rentalDivisorNote}</span> : null}</span></div>
                      <div className="qp-trow"><span className="l">{L("Mobilization", "التعبئة (موب)")}</span><span className="v">{mEx ? L("Excluded", "غير مشمولة") : money(mobLine)}</span></div>
                      <div className="qp-trow"><span className="l">{L("Return", "الإرجاع (ديموب)")}</span><span className="v">{dEx ? L("Excluded", "غير مشمول") : money(demobLine)}</span></div>
                      <div className="qp-trow"><span className="l">{L("Subtotal before VAT", "المجموع قبل الضريبة")}</span><span className="v">{money(subtotal)}</span></div>
                      <div className="qp-trow"><span className="l">{L("VAT (15%)", "ضريبة القيمة المضافة (١٥٪)")}</span><span className="v">{money(vat)}</span></div>
                      <div className="qp-trow net"><span className="l">{L("Net incl. VAT", "الصافي · شامل الضريبة")}</span><span className="v">{money(total)}</span></div>
                    </div>
                    {showCompare && <span className={`qp-sumbadge${priceDiff === 0 ? " match" : " diff"}`}>{priceDiff === 0 ? L("Matches supplier's offer", "مطابق لعرض المورد") : `${L("Differs from supplier", "يختلف عن عرض المورد")} (${nf(priceDiff)})`}</span>}
                  </div>
                  {payTerms.length > 0 && (
                    <div className="qp-rcard">
                      <div className="qp-rcard-h"><span className="material-icons-outlined">credit_card</span>{L("Payment terms", "شروط الدفع")}</div>
                      <div className="qp-totals" style={{ borderTop: 0, paddingTop: 0 }}>
                        {payTerms.map((t) => { const d = decide(t); return <div key={t.key} className="qp-trow"><span className="l">{ar ? t.labelAr : t.label}</span><span className="v" style={{ fontFamily: "inherit", color: d.badge === "conflict" ? "var(--danger,var(--danger))" : "var(--navy,var(--navy))" }}>{tval(t, d.chosen ?? t.supplierDeclared)}</span></div>; })}
                      </div>
                    </div>
                  )}
                </div>
                {operatingTerms.length > 0 && (() => {
                  const matched = operatingTerms.filter((t) => isSettled(decide(t).badge)).length;
                  const diff = operatingTerms.filter((t) => decide(t).badge === "conflict").length;
                  const pct = (n: number) => `${Math.round((n / operatingTerms.length) * 100)}%`;
                  return (
                    <div className="qp-guide-navy">
                      <div className="qp-gn-h"><span className="material-icons-outlined">list_alt</span>{L("Terms index", "دليل البنود")}<span className="rdy">{matched}/{operatingTerms.length} {L("ready", "جاهز")}</span></div>
                      <div className="qp-gn-bar"><div className="ok" style={{ width: pct(matched) }} /><div className="df" style={{ width: pct(diff) }} /></div>
                      <div className="qp-gn-legend"><span className="d ok" />{matched} {L("ready", "جاهز")}<span className="d df" />{diff} {L("differ", "يختلف")}</div>
                      {diff > 0 && <div className="qp-gn-review"><span className="material-icons-outlined" style={{ fontSize: 15 }}>autorenew</span>{L("Review differing terms", "راجع البنود المختلفة")} ({diff})</div>}
                      {groupByCat(operatingTerms).map(([cat, list]) => { const open = guideOpen[cat] ?? true; const cm = list.filter((t) => isSettled(decide(t).badge)).length; return (
                        <div key={cat} className="qp-gncat">
                          <button type="button" className="qp-gncat-h" onClick={() => setGuideOpen((g) => ({ ...g, [cat]: !open }))}>{cat}<span className="cnt">{cm}/{list.length}</span><span className={`material-icons-outlined chev${open ? " open" : ""}`}>expand_more</span></button>
                          {open && list.map((t) => { const d = decide(t); return <div key={t.key} className={`qp-gnrow ${d.badge}`}><span className="k">{ar ? t.labelAr : t.label}</span><span className={`qp-gnbadge ${d.badge}`}>{badgeLabel(d.badge)}</span></div>; })}
                        </div>
                      ); })}
                    </div>
                  );
                })()}
              </div>
              {mode === "accept" && (
                <label style={{ display: "block", marginTop: 16 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: "var(--navy-mid,var(--navy-mid))" }}>{L("Contract type", "نوع العقد")}</span>
                  <select value={contractType} onChange={(e) => setContractType(e.target.value)} className="qp-sel" style={{ marginTop: 5, width: "100%", height: 42 }}>
                    {CONTRACT_TYPES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </label>
              )}
              {mode === "accept" && (
                <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 14, fontSize: 12.5, fontWeight: 600, color: "var(--navy,var(--navy))" }}>
                  <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} style={{ marginTop: 2 }} />
                  {L("I confirm the agreed rate and terms.", "أؤكّد السعر والشروط المتفق عليها.")}
                </label>
              )}
              {error && <p style={{ marginTop: 8, fontSize: 12.5, fontWeight: 700, color: "var(--danger,var(--danger))" }}>{error}</p>}
            </div>
          )}
          </div>
          {/* zoom rail — fixed in the desk's side margin (right in RTL, left in LTR) */}
          <div className="qp-zoom">
            <button type="button" title={L("Zoom in", "تكبير")} onClick={() => setPaperZoom((z) => Math.min(1.8, Math.round((z + 0.15) * 100) / 100))}>+</button>
            <button type="button" className="pct" title={L("Fit (85%)", "ملاءمة ٨٥٪")} onClick={() => setPaperZoom(0.85)}>{Math.round(paperZoom * 100)}%</button>
            <button type="button" title={L("Zoom out", "تصغير")} onClick={() => setPaperZoom((z) => Math.max(0.5, Math.round((z - 0.15) * 100) / 100))}>−</button>
          </div>
        </div>

        {/* footer */}
        <div className="qp-foot">
          <button type="button" className="qp-log" onClick={() => setLogOpen(true)}><span className="material-icons-outlined" style={{ fontSize: 16 }}>history</span>{L("Log", "السجل")}</button>
          <div className="spacer" />
          <div className="qp-foot-main">
            {!editable && allMatched && page < 2 && <button className="qp-fbtn accept" onClick={() => setPage(2)}>✓ {L("Accept offer", "قبول العرض")}</button>}
            {page < 2 ? (
              <button className="qp-fbtn primary" disabled={!canNext} onClick={() => setPage((p) => (p + 1) as 0 | 1 | 2)}>{page === 0 ? L("Next: Terms", "التالي: الشروط") : L("Review & send", "مراجعة وإرسال")}<span className="qp-cch">‹</span></button>
            ) : (
              <button className={`qp-fbtn ${editable ? "primary" : "accept"}`} disabled={busy || !canSubmit} onClick={doSubmit}>{busy ? L("Sending…", "جارٍ الإرسال…") : editable ? L("Send reply", "إرسال الرد") : L("Accept offer", "قبول العرض")}<span className="qp-cch">‹</span></button>
            )}
            <button className="qp-fbtn back" disabled={busy} onClick={() => (page > 0 ? setPage((p) => (p - 1) as 0 | 1 | 2) : onClose())}>{page > 0 ? L("Back", "رجوع") : L("Close", "إغلاق")}<span className="qp-cch">›</span></button>
          </div>
          <div className="spacer" />
        </div>

        {pendingEx && (
          <div className="qp-scrim" style={{ zIndex: 75 }} dir={ar ? "rtl" : "ltr"} onClick={() => setPendingEx(null)}>
            <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 400, background: "var(--surface)", borderRadius: 20, overflow: "hidden", padding: "22px 22px 20px", textAlign: "start" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <h3 style={{ fontSize: 16.5, fontWeight: 900, color: "var(--navy)", margin: 0, lineHeight: 1.45 }}>{pendingEx.title}</h3>
                <span style={{ flexShrink: 0, display: "inline-flex", width: 42, height: 42, borderRadius: 12, background: "var(--brand-soft)", color: "var(--warn)", alignItems: "center", justifyContent: "center" }}>
                  <span className="material-icons-outlined" style={{ fontSize: 24 }}>warning_amber</span>
                </span>
              </div>
              <p style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)", lineHeight: 1.7, margin: "10px 0 18px" }}>
                {L("If you cancel, the supplier won't handle it — it becomes your responsibility: you arrange the transport and cover its cost, and it won't appear in the supplier's offer.", "عند الإلغاء لن يتكفّل المورد بها — تصبح على مسؤوليتك أنت: تنظّم النقل وتتحمّل تكلفته، ولن تظهر ضمن عرض المورد.")}
              </p>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setPendingEx(null)} style={{ flex: "0 0 auto", padding: "13px 22px", borderRadius: 13, border: "1.5px solid var(--border)", background: "var(--surface)", color: "var(--navy)", fontWeight: 800, fontSize: 13.5, cursor: "pointer", fontFamily: "inherit" }}>{L("Go back", "تراجع")}</button>
                <button onClick={() => { pendingEx.onYes(); setPendingEx(null); }} style={{ flex: 1, padding: "13px 12px", borderRadius: 13, border: "none", background: "var(--danger)", color: "var(--surface)", fontWeight: 800, fontSize: 13.5, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>{L("Yes, cancel it — on me", "نعم، ألغِها — عليّ أنا")}</button>
              </div>
            </div>
          </div>
        )}

        {logOpen && (
          <div className="qp-scrim" style={{ zIndex: 70 }} onClick={() => setLogOpen(false)}>
            <div className="qp-sheet" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
              <div className="qp-head-r1"><div className="qp-htitle"><div className="t">{L("Negotiation log", "سجل التفاوض")}</div></div><button className="qp-x" onClick={() => setLogOpen(false)}><span className="material-icons-outlined">close</span></button></div>
              <div className="qp-log-tabs">
                {([["all", L("All", "الكل")], ["price", L("Price", "السعر")], ["terms", L("Terms", "الشروط")]] as const).map(([k, lbl]) => (
                  <button key={k} type="button" className={`qp-log-tab${logTab === k ? " on" : ""}`} onClick={() => setLogTab(k)}>{lbl}</button>
                ))}
              </div>
              <div className="qp-body" style={{ background: "var(--surface)", padding: "4px 0 8px" }}>
                {/* Reconstructed price rounds (newest first) — role, rate, units, legs, total per round. */}
                {logTab !== "terms" && flowRounds.length > 0 && (
                  <div className="qp-rounds">
                    {[...flowRounds].reverse().map((r, i) => {
                      const rt = roundTotals(room, r);
                      const per = ({ PER_DAY: L("day", "يوم"), PER_WEEK: L("week", "أسبوع"), PER_MONTH: L("month", "شهر"), PER_JOB: L("job", "مهمة") } as Record<string, string>)[rt.priceUnit] ?? L("day", "يوم");
                      return (
                        <div key={`rnd-${i}`} className="qp-round">
                          <div className="qp-round-h">
                            <span className={`qp-round-role ${r.role}`}>{r.role === "supplier" ? L("Supplier", "المورد") : L("You", "أنت")}</span>
                            <span className="qp-round-tot">{nf(rt.grand)} {sar}</span>
                          </div>
                          <div className="qp-round-d">
                            {nf(rt.rate)}/{per} · {rt.rentalUnits} {L("units", "وحدة")}
                            {rt.mobExcluded ? ` · ${L("no mob", "بدون تعبئة")}` : rt.mobPrice ? ` · ${L("mob", "تعبئة")} ${nf(rt.mobPrice)}×${rt.mobUnitsN}` : ""}
                            {rt.demobExcluded ? ` · ${L("no demob", "بدون إرجاع")}` : rt.demobPrice ? ` · ${L("demob", "إرجاع")} ${nf(rt.demobPrice)}×${rt.demobUnitsN}` : ""}
                          </div>
                          {r.at && <div className="qp-round-t">{new Date(r.at).toLocaleString(ar ? "ar-SA-u-ca-gregory" : "en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</div>}
                        </div>
                      );
                    })}
                  </div>
                )}
                {(() => {
                  // Real activity log — the deal room's system_bot narration (each counter / rate proposal /
                  // term action / lifecycle event), newest-first. Full structured per-round price history is
                  // still latest-only backend-side (spec §11), but every round is narrated here as it happens.
                  const sys = messages.filter((m) => m.user?.id === "system_bot" && (m.text ?? "").trim());
                  const sorted = [...sys].sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime());
                  const PRICE_RE = /سعر|ر\.?\s?س|price|rate|تعبئة|إرجاع|موب|ديموب|SAR/i;
                  const TERMS_RE = /شرط|بند|term|إعاشة|وقود|صيانة|دفع|مشغّل|مشغل|قبول/i;
                  const shown = sorted.filter((m) => (logTab === "all" ? true : logTab === "price" ? PRICE_RE.test(m.text ?? "") : TERMS_RE.test(m.text ?? "")));
                  if (shown.length === 0) return <p style={{ fontSize: 13, color: "var(--muted,var(--muted))", textAlign: "center", padding: "24px 0" }}>{L("No activity yet.", "لا يوجد نشاط بعد.")}</p>;
                  return (
                    <ul className="qp-log-list">
                      {shown.map((m) => (
                        <li key={m.id} className="qp-log-row">
                          <span className="material-icons-outlined qp-log-ic">bolt</span>
                          <span className="qp-log-txt">{m.text}</span>
                          {m.created_at && <span className="qp-log-time">{new Date(m.created_at).toLocaleString(ar ? "ar-SA-u-ca-gregory" : "en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>}
                        </li>
                      ))}
                    </ul>
                  );
                })()}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
