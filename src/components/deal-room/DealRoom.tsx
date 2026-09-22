"use client";

import { useCallback, useEffect, useRef, useState, Fragment } from "react";
import { Dropdown } from "@/components/Dropdown";
import { Dialog, DialogButton } from "@/components/Dialog";
import { Icon } from "@/components/Icon";
import { useRouter } from "next/navigation";
import { type Channel } from "stream-chat";
import { useLocale } from "@/lib/i18n";
import { STREAM_API_KEY, leaseStream } from "@/lib/chat/stream-connection";
import { usePageBack } from "@/components/AppShell";
import { fetchBids, fetchRequestDetail, fetchRequestGroup, fetchDealRoom, fetchStreamToken, fetchQuotation, proposeRate, acceptDeal, batchUpdateTerms, releaseDeal, withdrawAcceptance, closeDealRoom, ApiError } from "@/lib/api/client";
import { counterpartyDisplayName } from "@/lib/contract/counterparty-name";
import { computeDealTotals, buildDealRoomQuotationDoc, quotationLinkKind, lastTermMove, isConflictingTerm, isSettledByValues, type DealRoomView, type DealTerm, type QuotationView } from "@/lib/contract/deal-room";
import { reconstructRounds, collapseRounds, latestRoundBy, withOpeningRound, liveRound, roundOverride, type DealRound } from "@/lib/contract/deal-rounds";
import { valText, type ResolutionsMap } from "@/components/deal-room/DealRoomTerms";
import { cityLabel, rentalTypeLabel, urgencyLabel, termValueLabel } from "@/lib/contract/labels";
import { buildSiblingTabs, type SiblingItemTab } from "@/lib/contract/sibling-tabs";
import type { BidCard } from "@/lib/contract/bids";
// Extracted so the map's chat dock mounts the SAME sheet rather than growing a second answer to
// "call the supplier" (owner, 2026-08-19). Its own file carries the reasoning.
import { CallModal } from "@/components/deal-room/CallModal";
// Extracted alongside `CallModal` so the map's chat dock can offer the same cancellation, with the
// same six reasons the supplier will be shown (owner, 2026-08-19).
import { CancelReasonsModal } from "@/components/deal-room/CancelReasonsModal";
import {
  type ChatAttachment,
} from "@/lib/chat/chat-attachments";
import { renderQuotationSection, wrapQuotationPage } from "@/lib/quotation/render";
import "@/components/deal-room/deal-room-proto.css";
import { computeQuoteTotals, computeRentalTotal, divisorNote } from "@/lib/pricing/rental";
import { pin } from "@/lib/uiPins";

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
  /** The RENTER's own gap — screen only, dropped by the print stylesheet. */
  ownerPrompt?: { text: string; actionLabel?: string | null; href?: string | null } | null,
): string {
  const kind = quotationLinkKind(room.status) ?? "preview";
  const doc = buildDealRoomQuotationDoc(room, q, rentee, ar, L, {
    logoUrl: typeof window !== "undefined" ? `${window.location.origin}/moedatech-logomark.svg` : undefined,
  }, live ? roundOverride(room, live) : null);
  if (ownerPrompt) doc.ownerPrompt = ownerPrompt;
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
  /* `{ fallback }`, not a handler: the shell can then NAME where the press lands, and a renter who
     reached this room from the Marketplace goes back there rather than to the inbox he never
     visited (owner, 2026-09-03). The inbox stays the answer for a cold load, which is where a deal
     room belongs when nobody can say how he arrived. */
  usePageBack({ fallback: "/inbox" });

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
  const [releaseOpen, setReleaseOpen] = useState(false); // reopen-accepted-deal confirm modal
  const [releasing, setReleasing] = useState(false);
  const [releaseErr, setReleaseErr] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState(false); // withdraw a pending acceptance (AWAITING)
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

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [chatReady, setChatReady] = useState(false);
  // deal-room/chat parity — per-message inline translation (incoming text only): id → translated text.
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
      window.alert(errMsg(e, L("Couldn't withdraw right now: please try again.", "تعذّر سحب القبول الآن: حاول مرة أخرى.")));
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
      /* 🔴 **The renter's OWN gap, named on his own document** (owner, 2026-09-22). His side of the
         header prints as a bare name beside a supplier carrying a logo and a tick, and nothing told
         him why or what to do. His gap only — a strip naming a missing SUPPLIER mark would tell him
         to fix something only the supplier can, on a document the supplier wrote. */
      let ownerPrompt: { text: string; actionLabel?: string | null; href?: string | null } | null = null;
      try {
        const meRes = await fetch("/api/me", { cache: "no-store" });
        if (meRes.ok) {
          const d = (await meRes.json()) as {
            user?: {
              firstName?: string | null; lastName?: string | null; companyName?: string | null;
              companyLegalName?: string | null; companyLogoUrl?: string | null;
              tier?: string | null; phone?: string | null; email?: string | null;
            };
          };
          const u = d.user ?? {};
          rentee = {
            // ⚠️ The shared naming rule, not a hand-rolled `companyName || person`: one counterparty
            // must not read one way here and another on the card beside it.
            name: counterpartyDisplayName({
              companyLegalName: u.companyLegalName,
              profileCompanyName: u.companyName,
              personName: [u.firstName, u.lastName].filter(Boolean).join(" "),
            }),
            phone: u.phone ?? null,
            email: u.email ?? null,
          };
          // Unverified outranks "no mark": there is no point asking for a logo from an account that
          // has not established a company to put one on.
          if (u.tier !== "verified") {
            ownerPrompt = {
              text: L("Your company is not verified yet, so this quotation carries your name without a mark.",
                      "لم يُوثّق ملف شركتك بعد، لذلك يحمل عرض السعر اسمك دون علامة."),
              actionLabel: L("Verify your company", "وثّق شركتك"),
              href: `${window.location.origin}/profile?verify=1`,
            };
          } else if (!u.companyLogoUrl) {
            ownerPrompt = {
              text: L("Your company has no logo on file, so this quotation shows your name alone.",
                      "لا يوجد شعار لشركتك، لذلك يظهر اسمك وحده على عرض السعر."),
              actionLabel: L("Add your logo", "أضف شعارك"),
              href: `${window.location.origin}/profile?logo=1`,
            };
          }
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
      w.document.write(buildQuotationHtml(room, q, rentee, ar, L, liveRoundOf(room, messages), ownerPrompt));
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

  function openFlow(mode: "counter" | "accept") {
    if (!room || busy) return;
    setCounterErr(null);
    setFlowMode(mode);
  }

  /**
   * Whether this visit exists only to host the sheet — `?act=` opened it, nobody asked for the room.
   *
   * A ref rather than state: closing reads it once and navigates, and nothing renders differently
   * for it.
   */
  const arrivedForFlow = useRef(false);

  /**
   * Closing the sheet.
   *
   * Pressed from the room's own Negotiate or Accept, the X goes back to the room — that is where the
   * renter was. Pressed on a room reached BY `?act=counter`, going back to the room means landing on
   * a screen he never asked for and, until now, one still carrying a pointer to a chat that lives on
   * the map (owner, 2026-08-28: *"that x button must just close it and return to existing screen
   * before opening the 3 styles sheet"*). So the deep-linked case leaves the way it came.
   *
   * `history.length` guards the pasted URL: with nothing behind it `back()` leaves the renter
   * wherever the browser decides, so that one falls through to the same place the header's own back
   * arrow goes.
   */
  function closeFlow() {
    if (busy) return;
    setFlowMode(null);
    if (!arrivedForFlow.current) return;
    arrivedForFlow.current = false;
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/inbox");
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
    if (flowGate.current[initialFlow]) {
      openFlow(initialFlow);
      // The room was never the destination — see `closeFlow`.
      arrivedForFlow.current = true;
    }
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
      setCounterErr(errMsg(e, L("Couldn’t send your counter: please try again.", "تعذّر إرسال عرضك المقابل: حاول مرة أخرى.")));
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
      window.alert(errMsg(e, L("Couldn’t accept right now: please try again.", "تعذّر القبول الآن: حاول مرة أخرى.")));
    } finally {
      setBusy(false);
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

  // Accept gate — app parity `allMatched` (rentee perspective): every non-fixed term matched/accepted,
  // AND the rentee's latest price+units round equals the supplier's (nothing left to change). When rounds
  // can't be reconstructed, rRound/sRound are the room fallback so the price/units checks pass and the gate
  // degrades to the term check — never stricter than the backend's disputed-only 409.
  const termMatched = (t: DealTerm): boolean => {
    // ⚠️ `isSettledByValues`, not the state column alone (app parity, 2026-09-21): a counter that
    // landed ON the supplier's value writes `pending`, never `agreed`, so two identical values were
    // reported as an open question and held the accept gate shut for good.
    if (t.state === "fixed" || t.state === "soft_accepted" || isSettledByValues(t)) return true;
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
  /* ⚠️ `isConflictingTerm`, matching the app's own gate (2026-09-21). Keyed on `state === "disputed"`
     this count stayed at zero on a clash raised in round two — the server writes `disputed` only at
     room creation — so the sheet showed no outstanding conflict while two contradictory values sat
     on the card, and every door that reads this count let a press through. */
  const unresolvedDisputed = room.terms.filter((t) => isConflictingTerm(t) && !resolutions[t.key]);
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

     ~~`live` is still a real gate.~~ **Counter opens the sheet at EVERY status** (owner, 2026-09-08:
     *"the counter offer must always show the 3 styles sheet, and if the deal room is cancelled show
     that note in the sheet's header"*). It used to fall through on a CLOSED, ABANDONED or AWAITING
     room, which dropped the renter onto the retired room view — a masthead, a price hero and two
     lines saying it was cancelled: the very screen that was retired on 2026-09-07, reachable again
     through the one link that is supposed to open the sheet. The sheet now opens read-only and says
     so in its own header, which is both the answer to «what happened here» and the negotiation
     history he came to read.

     ACCEPT keeps `showAct && canAccept` untouched. Accepting is settling, and its gate is the room's
     own comparison of terms, price and units; nothing here loosens it. */
  flowGate.current = { counter: true, accept: showAct && canAccept };

  return (
    <div {...pin("deal-room")} className="dlproto" dir={ar ? "rtl" : "ltr"}>
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
              {/* 🔴 **NEVER THE WORD «NEGOTIATE»** (owner, on the app, 2026-08-17, restated
                  2026-09-20). Asking for less is the renter's errand and proposing a price is the
                  supplier's, so the two roles do not share a verb — and this button opens a sheet
                  seeded from the READER's own last position, which decides the rest of it:
                    · I have already countered → «Edit your counter-offer», because that is the thing
                      on the table and it is mine.
                    · I have not → «Counter this price» / «اطلب سعراً أقل», the renter's ask.
                  ~~«Negotiate».~~ It named neither the act nor whose it was. */}
              <button className={`pb-btn neg${supplierCountered ? " pulse" : ""}`} disabled={busy} onClick={() => openFlow("counter")}><span className="material-icons-outlined">swap_horiz</span>{rRound ? L("Edit your counter-offer", "تعديل العرض المقابل") : L("Counter this price", "اطلب سعراً أقل")}</button>
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
                by hanging «× 3» off each row — three multipliers down a column is arithmetic the
                reader has to carry, and the overall row is where it lands anyway. */}
            {multi && <div className="pb-bhead">{L("Per unit", "لكل وحدة")}</div>}
            <div className="pb-brow"><span className="l">{L("Rental", "الإيجار")} ({rentalLabel})</span><span className="v">{nf(perUnit.rental)}</span></div>
            {room.mobExcluded
              ? <div className="pb-brow"><span className="l">{L("Mobilization", "التعبئة: موب")}</span><span className="v ex">{L("Not included", "غير مشمول")}</span></div>
              : room.mobPrice ? <div className="pb-brow"><span className="l">{L("Mobilization", "التعبئة: موب")}</span><span className="v">{nf(perUnit.mob)}</span></div> : null}
            {room.demobExcluded
              ? <div className="pb-brow"><span className="l">{L("Return", "الإرجاع: ديموب")}</span><span className="v ex">{L("Not included", "غير مشمول")}</span></div>
              : room.demobPrice ? <div className="pb-brow"><span className="l">{L("Return", "الإرجاع: ديموب")}</span><span className="v">{nf(perUnit.demob)}</span></div> : null}
            <div className="pb-brow"><span className="l">{L("Subtotal before VAT", "المجموع قبل الضريبة")}</span><span className="v">{nf(perUnit.subtotal)}</span></div>
            <div className="pb-brow"><span className="l">{L("VAT (15%)", "ضريبة القيمة المضافة (15٪)")}</span><span className="v">{nf(perUnit.vat)}</span></div>
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

      {/* ── No chat on this route, not even a pointer to one (owner, 2026-08-26, 2026-08-28) ─────
          *"i want this chat ui for all chat surfaces, no more this one … it is just chat"*, and then
          *"we decided to not include this chat view at all, our chat is now in the map, so this must
          be removed from any route"*.

          This page carried a second chat — its own thread, its own bubbles, its own composer, its
          own `Translate` link — under a price bar with Negotiate and Accept on it. Two chat UIs in
          one app, and the one that lived here was the only place a conversation shared a screen
          with a negotiation. That went on 08-26, and the signpost that replaced it («the
          conversation lives with the machines», with an Open chat button onto the map) has now gone
          too: a card advertising chat is still chat on a route that is meant to have none, and the
          renter arrives here from the map he would be sent back to.

          The dock was ALREADY only chat and needed no change for this — `live: false` strips
          accept/counter from a rate card there (`ChatDock.tsx:1104`), "so there is exactly one
          place a rate can be accepted". This deletion is what makes that sentence true of the app
          rather than only of the dock.

          What does NOT go is the message FETCH. The rounds are reconstructed from the channel —
          `reconstructRounds(messages)` is what produces the live position and seeds the sheet's
          rate — so the messages are this page's ledger even with nothing rendering them. Only the
          rendering left. */}

      {/* Footer — the quotation link, and the note a closed or cancelled room puts in its place.
          One sticky container: two `position: sticky; bottom: 0` siblings would both pin to the
          viewport bottom and overlap. The composer that used to head it is gone with the thread. */}
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
      ) : null}

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
          onClose={closeFlow}
          onCounter={submitCounter}
          onAccept={doAccept}
          // Accept from the counter's review step goes through the accept flow, gate and all.
          onAcceptInstead={() => setFlowMode("accept")}
          onOpenQuotation={openQuotation}
        />
      )}

      {releaseOpen && (
        <Dialog
          open
          onClose={() => setReleaseOpen(false)}
          size="sm"
          // ⚠️ `dismissible` goes off while the call is in flight: the scrim and Escape were already
          // guarded by `!releasing`, and the corner close by `disabled`. One flag now says it once.
          dismissible={!releasing}
          icon={<Icon name="lock_open" size={20} className="text-warn-deep" />}
          title={L("Reopen this deal?", "إعادة فتح هذه الصفقة؟")}
          footer={
            <>
              <DialogButton tone="ghost" disabled={releasing} onClick={() => setReleaseOpen(false)}>{L("Cancel", "إلغاء")}</DialogButton>
              <DialogButton tone="primary" disabled={releasing} onClick={() => void doRelease()}>
                {releasing ? L("Reopening…", "جارٍ إعادة الفتح…") : L("Reopen", "إعادة الفتح")}
              </DialogButton>
            </>
          }
        >
          <p className="text-body text-navy-mid">
            {L("This reopens negotiation with the supplier. The accepted deal returns to negotiating and the terms/price can change again. A new quotation is issued once you re-confirm.", "يعيد هذا فتح التفاوض مع المؤجّر: تعود الصفقة المقبولة إلى التفاوض ويمكن تغيير الشروط والسعر. يصدر عرض سعر جديد بعد إعادة التأكيد.")}
          </p>
          {releaseErr && <p className="mt-2 text-meta font-semibold text-danger">{releaseErr}</p>}
        </Dialog>
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
        /* 🔴 ~~Operator nationality.~~ hidden on every surface (see `term-visibility.ts`). The room's TERM table
           has dropped it at the parse since 2026-09-18; this details card read the request
           directly and therefore kept printing it. */
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
        // Overtime is retired (see WhenPanel). This row printed `d.overtimeRate` raw, so a legacy
        // request read «أجر العمل الإضافي: 0» — the sentinel, not a rate.
        // [L("Overtime rate", "أجر العمل الإضافي"), d.overtimeRate],
        [L("Notes", "ملاحظات"), d.additionalNotes],
      ],
    },
  ];

  return (
    <div dir={ar ? "rtl" : "ltr"} onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 80, background: "color-mix(in srgb, var(--info-deep) 50%, transparent)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 460, maxHeight: "88vh", display: "flex", flexDirection: "column", background: "var(--surface)", borderRadius: "var(--radius-lg)", overflow: "hidden", }}>
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
                <div style={{ display: "grid", gap: 1, background: "var(--surface2)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
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
                  <span key={c} style={{ fontSize: 12, fontWeight: 700, color: "var(--navy)", background: "var(--background)", border: "1px solid color-mix(in srgb, var(--border-strong) 60%, transparent)", borderRadius: 999, padding: "4px 10px" }}>{c}</span>
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
/* 🔴 **These two live at MODULE scope, and that is a BUG FIX rather than tidying**
 * (owner, 2026-09-22: *"there is a bug that i cant write into price box it takes me out after each
 * character"*).
 *
 * They were declared inside `CounterFlow`'s body. A component defined in a render body is a NEW
 * function identity on every render, and React compares types by identity - so each keystroke
 * unmounted the whole subtree and mounted a fresh one, destroying the `<input>` that held the
 * caret. The renter typed one character and the focus was gone with the node.
 *
 * ⚠️ **It cannot be fixed by memoising the parent or the value.** The identity changes
 * because the declaration is re-evaluated; nothing downstream can make React treat two different
 * function objects as the same type. Hoisting is the fix, and everything the two closed over is a
 * prop now.
 *
 * ⚠️ **Any component that renders an input must never be declared in a render body.** The
 * rule is general - this file has three more inline components and they are safe only because
 * nothing inside them holds focus.
 */

/** The count stepper, on the prototype's own 18px squares. */
function Qty({ value, min, max, onChange, live }: { value: number; min: number; max: number; onChange: (v: number) => void; live: boolean }) {
  return (
    <span className="ng-qty">
      <button type="button" disabled={!live || value <= min} onClick={() => onChange(Math.max(min, value - 1))}>−</button>
      <b>{value}</b>
      <button type="button" disabled={!live || value >= max} onClick={() => onChange(Math.min(max, value + 1))}>+</button>
    </span>
  );
}

/**
 * One money cell. 🔴 Its COLOURS are the state: green while the figure still matches the
 * supplier's standing offer, amber the moment it is edited, and the «Supplier: N» line under it
 * turns with them. That is the whole of how the prototype says "you have moved this".
 */
function PriceCell({ val, onChange, refVal, live, supplierWord }: {
  val: string; onChange: (s: string) => void; refVal: number | null; live: boolean; supplierWord: string;
}) {
  const edited = changedFrom(numOf(val), refVal);
  if (!live) return <div className="ng-price"><b>{nf(numOf(val))}</b></div>;
  return (
    <div className={`ng-price${edited ? " edited" : ""}`}>
      <input type="number" inputMode="numeric" min={0} value={val} placeholder="0" onChange={(e) => onChange(e.target.value)} />
      {refVal != null && <div className="ref">{supplierWord}: {nf(refVal)}</div>}
    </div>
  );
}

/** ⚠️ ONE comparator for «has this moved off the supplier's figure», shared by the cell's own
 *  skin and by anything else that asks. It rounds both ends: the input is a string and a trailing
 *  `.0` is not a change anybody made. */
function changedFrom(cur: number, ref: number | null): boolean {
  return ref != null && Math.round(cur) !== Math.round(ref);
}

/** The body's own `num`, at module scope so {@link PriceCell} can read it. */
function numOf(s: string): number {
  const n = Number(s);
  return s.trim() !== "" && !Number.isNaN(n) && n >= 0 ? n : 0;
}

function CounterFlow({
  mode, room, ar, L, busy, error,
  resolutions, onResolveLocal, onReopenLocal, unresolvedCount,
  periodLabel, periods, hasDuration, units, messages, onClose, onCounter, onAccept,
  onAcceptInstead, onOpenQuotation,
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
  /**
   * «Accept offer» from the REVIEW step of a counter (app parity, 2026-09-18: accept stands beside
   * send when everything matches — they are different acts and neither stands in for the other).
   *
   * ⚠️ It hands the decision back to the ROOM rather than calling `onAccept` here, so the press lands
   * on the accept flow's binding-commitment gate. Accepting is the one act on this sheet the renter
   * is warned about, and reaching it through a button that skipped the warning would be the sheet
   * deciding he had already read it.
   */
  onAcceptInstead?: () => void;
  /** The room's own quotation, from step ③ — the same document its CTA opens, never a second one. */
  onOpenQuotation?: () => void;
}) {
  /**
   * A settled room still opens the sheet, read-only, and says why in its header (owner, 2026-09-08).
   *
   * The renter arriving from «counter this price» on a cancelled or closed room is not asking to
   * negotiate — he cannot — he is asking what happened, and the answer is the negotiation itself:
   * the three steps hold the price, the terms and the round-by-round log. Dropping him on the
   * retired room view instead answered nothing and showed him a screen the product retired.
   */
  const settledNote =
    room.status === "ABANDONED"
      ? L("This deal room has been cancelled", "تم إلغاء غرفة الصفقة هذه")
      : room.status === "CLOSED"
        ? L("This deal is agreed and closed", "تم الاتفاق على هذه الصفقة وإغلاقها")
        : room.status === "AWAITING_SUPPLIER_CONFIRMATION"
          ? L("Waiting for the supplier to confirm", "بانتظار تأكيد المورد")
          : null;
  /** Nothing can be sent from a settled room, whichever mode opened the sheet. */
  const settled = settledNote != null;
  const editable = mode === "counter" && !settled;
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
  /* 🔴 ~~`cmpOpen` — the compare card's «The gap, line by line» expander.~~ **Gone 2026-09-21 with
     the app's own:** the totals say how far apart the two sides are, the per-leg rows say WHERE, and
     that is the only part anyone can act on. It is always open now. */
  // The term whose options are open. ONE at a time: the prototype answers the queue in order, and two
  // option lists open at once is two questions asked at once.
  const [openTerm, setOpenTerm] = useState<string | null>(null);
  // The collapsible sections. The two WALKING ones are open (that is where the work is); the settled
  // ones are shut, as the app draws them.
  const [ackOpen, setAckOpen] = useState(false);
  const [agreedOpen, setAgreedOpen] = useState(false);
  const [pendOpen, setPendOpen] = useState(true);
  const [conflictOpen, setConflictOpen] = useState(true);
  const [awaitOpen, setAwaitOpen] = useState(false);
  /** The card the reader pressed open, overriding the automatic one. Null means "whichever is first
   *  unanswered", which is what walks the list forward on its own as each row is settled. A press on
   *  a settled row sets this, because a reader who wants to revisit row three should not have to
   *  unanswer rows one and two. */
  const [forcedTerm, setForcedTerm] = useState<string | null>(null);
  // Confirm before a leg (delivery/return) is excluded from the offer — reversible, but the app confirms.
  const [pendingEx, setPendingEx] = useState<null | { title: string; onYes: () => void }>(null);
  // Quotation-paper UI-only state (spec §6): collapsible دليل البنود categories + the السجل log modal.
  /* 🔴 **The review's term list starts OPEN** (owner, 2026-09-22: *"for the summary and review
     also structure the terms cleanly and make them open at first not closed"*). ~~`{}`, so every
     section read `?? false` and the reader met a closed accordion on the step whose whole job is
     to let him check the position before he sends it.~~ A summary that hides what it summarises
     asks for a press to do the one thing the step exists for. */
  const [guideOpen, setGuideOpen] = useState<Record<string, boolean>>({ all: true });
  const [logOpen, setLogOpen] = useState(false);
  const [logTab, setLogTab] = useState<"all" | "price" | "terms">("all");
  /** The send's own refusal, said in place rather than as a toast: the press reached a button that
   *  had already greyed itself, so the line explains the grey rather than announcing a failure. */
  const [nothingSent, setNothingSent] = useState(false);

  const num = (s: string) => { const n = Number(s); return s.trim() !== "" && !Number.isNaN(n) && n >= 0 ? n : 0; };
  const rate = editable ? num(rateStr) : (room.rate ?? 0);

  /* ⚠️ **The machine, for the header** (item 7). Same pair the room's own top bar reads, and
     the same fallbacks - a room whose taxonomy names never arrived still has a name to show. The
     size rides the same run because a 20-ton and a 30-ton excavator are two different
     negotiations. */
  const machineLine = [
    (ar ? room.details.equipmentLabelAr || room.details.equipmentLabel : room.details.equipmentLabel) || null,
    (ar ? room.details.equipmentSizeAr || room.details.equipmentSize : room.details.equipmentSize) || null,
  ].filter(Boolean).join(" · ") || null;

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

  const sar = L("SAR", "ر.س");
  const money = (v: number) => `${nf(v)} ${sar}`;

  /**
   * Do all three unit counts agree, so the summary may state one machine and multiply once at the
   * end? App parity, `NegotiationTotals._unitsAligned`. An EXCLUDED leg does not disagree — it is
   * not in the arithmetic at all — and a single machine has nothing to distinguish, which is why
   * `rNU > 1` leads.
   */
  const unitsAligned = rNU > 1 && (mEx || mNU === rNU) && (dEx || dNU === rNU);
  /** The day count the Duration column already states — billable days, else the raw window. */
  const rentalDays = hasDuration ? (rentalCalc.raw ? periods : rentalCalc.billable) : 0;

  /**
   * 🔴 **THE FACTORS BEHIND EACH LINE, as the bid card prints them** (app parity, 2026-09-20: *"show
   * it in the same structure as the bid card"*). The block printed a bare total per leg, so «4,000»
   * had to be taken on trust — the reader could not see it was 2,000 × 2, and a row whose own
   * numbers do not multiply is the one thing a customer checks.
   *
   * ⚠️ An EXCLUDED leg drops its factors entirely rather than showing a zero: a zero reads as free,
   * which is a claim nobody made. ⚠️ No count while the rows are per-unit — the count is applied
   * once, in «Overall total» below. Printing it here too would multiply twice on the page even
   * though the arithmetic is right. ⚠️ One factor is not a product: «2,000» under «2,000» says
   * nothing, so a single-part line draws nothing at all.
   */
  const factorLine = (leg: "rental" | "mob" | "demob"): string | null => {
    const excluded = leg === "mob" ? mEx : leg === "demob" ? dEx : false;
    if (excluded) return null;
    const price = leg === "rental" ? rate : leg === "mob" ? mob : demob;
    const legUnits = leg === "rental" ? rNU : leg === "mob" ? mNU : dNU;
    const parts = [
      nf(price),
      ...(leg === "rental" && hasDuration ? [String(rentalDays)] : []),
      ...(unitsAligned ? [] : [String(legUnits)]),
    ];
    return parts.length < 2 ? null : parts.join(" × ");
  };

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
      <Dialog
        open
        onClose={onClose}
        size="sm"
        icon={<Icon name="gavel" size={20} className="text-danger" />}
        title={L("This is a binding commitment", "هذا التزام مُلزِم")}
        footer={
          <>
            <DialogButton tone="ghost" onClick={onClose}>{L("Cancel", "إلغاء")}</DialogButton>
            <DialogButton tone="primary" disabled={!ack} onClick={() => { setAck(false); setBindingOk(true); }}>
              {L("Continue", "متابعة")}
            </DialogButton>
          </>
        }
      >
        <p className="text-body text-navy-mid">
          {L("Accepting confirms the agreed rate and terms with the supplier for final confirmation. Please review the terms and price before you continue.", "القبول يؤكّد السعر والشروط المتفق عليها مع المؤجّر للتأكيد النهائي. يُرجى مراجعة الشروط والسعر قبل المتابعة.")}
        </p>
        {/* The acknowledgement is what unlocks «Continue» — it is the whole point of this layer, so
            it sits in the body rather than as a line of small print under it. */}
        <label className="mt-3 flex cursor-pointer items-center gap-2.5 rounded-sm border border-border bg-surface2 px-3 py-2.5 text-body font-semibold text-navy">
          <input type="checkbox" className="h-4 w-4 flex-none accent-brand" checked={ack} onChange={(e) => setAck(e.target.checked)} />
          {L("I understand this is binding", "أفهم أن هذا مُلزِم")}
        </label>
      </Dialog>
    );
  }

  // Pages reordered to spec §6: 0 = السعر (price), 1 = الشروط (terms), 2 = المراجعة (review).
  /* 🔴 **UNANSWERED TERMS ARE NOT A GATE, and never were one in the app.** Checked against
     `negotiation_sheet.dart` rather than assumed: `onAllReviewedChanged` is an empty callback and
     `_next()` is an unconditional `setState`. The server accepts a reply with terms still `pending` —
     they simply stay open — so refusing here invents a rule the backend does not have and strands
     anyone who means to settle the price first. ~~`page === 1 ? unresolvedCount === 0 : true`.~~ */
  const canNext = page === 0 ? (editable ? rateValid : true) : true;
  // A settled room is read all the way through and sends nothing at the end of it.
  const canSubmit = settled ? false : editable ? rateValid : ack;

  /**
   * Has the renter actually moved anything? App parity: `CounterDraft.hasChanges`, against the LIVE
   * position the sheet was seeded from.
   *
   * 🔴 **The no-change refusal is the whole send gate, and it is the one the reader cannot see for
   * himself** (owner, on the app, 2026-09-19: *"I sent the same bid 4 times in a row, no changes"*).
   * A resend of an identical position is noise in the supplier's inbox and reads to him as a round
   * that moved nothing. ⚠️ It is DRAWN as well as enforced — the button greys — because one that
   * looks live and then refuses is worse than one that says up front it has nothing to do.
   */
  const draftChanged =
    rate !== (seedRate ?? 0) || mob !== (seedMob ?? 0) || demob !== (seedDemob ?? 0) ||
    rentalUnits !== liveRental || mobUnitsN !== liveMob || demobUnitsN !== liveDemob ||
    mobExcluded !== (latestRound?.mobExcluded ?? room.mobExcluded) ||
    demobExcluded !== (latestRound?.demobExcluded ?? room.demobExcluded);
  const hasSomethingToSend = draftChanged || Object.keys(resolutions).length > 0;
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
    // ⚠️ `isSettledByValues`, not `state === "agreed"` alone (app parity, 2026-09-21): a counter that
    // landed ON the other side's value writes `pending`, so two identical values read as unanswered.
    if (t.state === "soft_accepted" || isSettledByValues(t)) return { badge: "match", chosen: t.value ?? t.supplierDeclared ?? t.renteePreference, server: true };
    const r = resolutions[t.key];
    // ⚠️ And `isConflictingTerm`, not `state === "disputed"`: the server stamps `disputed` only at
    // room creation, so a clash raised in round two arrived here as «Not set» with two contradictory
    // values sitting on the card.
    if (!r) return { badge: isConflictingTerm(t) ? "conflict" : "none", chosen: null, server: false };
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
  /* 🔴 ~~`badgeLabel` / `isSettled` — the guide's pill words.~~ Gone with the pills: the app's guide
     states each row's status as a WORD in the bar's own colour, which the card's `word()` builds. */

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
  /* 🔴 **«supplier's declaration» is GONE from a pending card** (owner, 2026-09-22: *"for terms
     pending remove this supplier's declaration"*). ~~The three-way provenance line.~~ On a pending
     row the card ALREADY names both sides one line below - «Your choice: X · Supplier: Y» - so the
     note repeated the half the reader had just read, in smaller grey type, directly under the
     term's own name. It was answering «whose value is this» on the one card that answers it twice
     over.
     ⚠️ The OTHER two survive, and they are not the same fact. «from your request» and
     «platform default» name a value the side row does NOT carry: the side row states what each
     party WANTS, and those two say where a value with no party behind it came from. */
  const srcNote = (t: DealTerm): string | null => {
    if (t.state === "fixed") return null;
    if (t.source === "supplier_declared") return null;
    return t.source === "rentee_fixed" ? L("from your request", "من طلبك")
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
  /* 🔴 ~~`groupByCat` — the review guide grouped by category.~~ Gone with `catOf` above: the app's
     guide is ONE flat list behind a single «Matched» toggle, and the categories were a web-only layer
     over it that made the two products' last screen read differently. */

  // Supplier's standing offer (compare card) — from the SUPPLIER's latest reconstructed round (their real
  // offer INCL. their unit counts + leg exclusion), via the shared ÷26/÷7 + VAT math; falls back to the
  // room's on-table numbers when no supplier round exists. This is why a supplier unit counter now moves it.
  const supDeal = supRound ? roundTotals(room, supRound) : computeDealTotals(room);
  const supTotal = supDeal.grand;
  // "Supplier: {price}" references — read the supplier's own round (app parity: otherSide.rate/mobPrice/
  // demobPrice), falling back to the room columns, exactly like the "Supplier: N units" refs beside them.
  const refRate = supRound?.rate ?? room.rate;

  /* ⚠️ **`null` until the renter has actually moved the figure** (item 8). `rate` is the
     supplier's standing rate while the box is untouched, so a before/after pair drawn from the
     start would show one number struck through beside itself. `changedFrom` is the same rounding
     comparator the price cells paint with, so the bar and the cell cannot disagree about whether
     anything moved. */
  const counterRate = editable && changedFrom(num(rateStr), refRate) ? num(rateStr) : null;
  const refMobPrice = supRound?.mobPrice ?? room.mobPrice;
  const refDemobPrice = supRound?.demobPrice ?? room.demobPrice;
  /**
   * 🔴 **The card needs a position on BOTH sides** (app parity, `NegotiationPriceStep`): the renter
   * has none until she has actually countered, and drawing it before that echoes the supplier's own
   * numbers back at her under «Your total» — the very mirror the app's `resolveLivePosition` fix was
   * about. ~~`room.lastCounterBy === "supplier"`.~~ That asked who moved last, not whether there are
   * two positions to compare.
   */
  const myRound = latestRoundBy(flowRounds, "rentee");
  const showCompare = editable && supRound != null && myRound != null;
  const priceDiff = Math.abs(total - supTotal);
  /**
   * The supplier's round BEFORE their standing one — the baseline for «… from their last offer».
   * Correct only because `collapseRounds` folded consecutive same-role messages: an edit-while-
   * waiting appends a second message rather than replacing the first, so without the collapse this
   * would diff against a round the supplier never actually sent.
   */
  const supRounds = flowRounds.filter((r) => r.role === "supplier");
  const supPrev = supRounds.length > 1 ? supRounds[supRounds.length - 2] : null;
  /** The FULL close gate (app `_Footer.allMatched`): every negotiable term matched, no price gap,
   *  and nothing edited locally. Only then may Accept stand beside the send. */
  const allMatched = unresolvedCount === 0 && priceDiff < 0.005 && !draftChanged;

  /* 🔴 ~~`STEP_NAMES` — the caption inside the `‹ step ›` switcher.~~ Gone with the switcher: every
     footer control names its own destination now, so nothing has to name where you are. */

  /* 🔴 ~~`theirsIsLatest` — «🔔 New offer from the supplier» over the header figure, and ONLY
     then.~~ **REMOVED 2026-09-22, following the app's own removal of 2026-09-19** on the owner's
     word. The app deleted `negotiationHasNewOffer` with it and the header now carries the bare
     figure: the eyebrow pushed the column past the bar's height, and the «Total» caption beside it
     named what the bar's only number obviously is. `dealNewOfferFrom` survives in both ARBs, unread,
     on the app side too. The turn cue itself is not lost — the ROOM's price bar still draws
     «🔔 New reply» on `supplierCountered`, which is where a renter meets it before opening this. */


  /** One line of the price table: the machine, then each transport leg. */
  const priceRow = (o: {
    key: string; label: string; duration: string; durationSub?: string | null;
    qty: number; qtyMin: number; qtyMax: number; onQty: (v: number) => void;
    val: string; onVal: (s: string) => void; refVal: number | null;
    excluded?: boolean; onExclude?: (b: boolean) => void; exTitle?: string;
  }) => (
    <div key={o.key} className={`ng-row${o.excluded ? " off" : ""}`}>
      {o.onExclude && editable && (
        <button type="button" className={`ng-rm${o.excluded ? " on" : ""}`} title={o.excluded ? L("Restore", "استعادة") : L("Exclude", "استبعاد")}
          onClick={() => (o.excluded ? o.onExclude!(false) : setPendingEx({ title: o.exTitle ?? "", onYes: () => o.onExclude!(true) }))}>
          {o.excluded ? "+" : "✕"}
        </button>
      )}
      <span className="lbl" title={o.label}>{o.label}</span>
      <span className="dur">{o.duration}{o.durationSub ? <span className="sub">{o.durationSub}</span> : null}</span>
      {o.excluded ? <span className="out">{L("Excluded", "مستبعد")}</span> : <Qty value={o.qty} min={o.qtyMin} max={o.qtyMax} onChange={o.onQty} live={editable} />}
      {o.excluded ? <span className="out">—</span> : <PriceCell val={o.val} onChange={o.onVal} refVal={o.refVal} live={editable} supplierWord={L("Supplier", "المورد")} />}
    </div>
  );

  /* ── the supplier's standing offer, against yours ─────────────────────────────────────────────
     🔴 **THE APP'S 2026-09-21 MOCK, matched exactly** — a WHITE card, the two totals side by side
     across a vertical hairline, the gap pill riding the card's TOP EDGE, and one row per leg
     beneath, ALWAYS OPEN.

     ~~A navy card whose per-leg rows hid behind a «The gap, line by line» expander, with the pill on
     a horizontal rule BETWEEN the two totals.~~ Three things were wrong with it and the mock fixes
     all three: the sheet around it is light, so the one navy block read as a foreign panel dropped
     onto the page; the expander cost a press to reach the only content that answers WHERE the gap
     is; and a pill sitting on a rule between the totals made the rule look like a divider with a
     label rather than a measurement between two ends.

     ⚠️ **Theirs LEADS and carries the emphasis.** It is the figure on the table — the one being
     answered — and in both directionalities the leading slot is read first. Mine is muted beside it,
     not because it matters less but because I already know it. */
  const cmpMoney = (v: number, excluded: boolean): string =>
    excluded ? `— ${L("Removed", "مُلغى")}` : v === 0 ? L("Free", "مجاناً") : nf(v);

  /** Did the SUPPLIER move since his own last round, and which way. Nothing to say on his first
   *  round: without this the card answers "how far apart are we" and never "did he move", and
   *  movement is the whole reason to read a second round. */
  const vsPrevious = (theirs: number, prev: number | null, theirEx: boolean, prevEx: boolean) => {
    if (prev == null) return null;
    const sup = L("the supplier", "المورد");
    const d = theirs - prev;
    const [text, tone] =
      !prevEx && theirEx ? [`✓ ${L(`Removed by ${sup}, your call`, `ألغاه ${sup}، قرارك`)}`, "ok"]
      : prevEx && !theirEx ? [`⚠ ${L(`Restored by ${sup}`, `أعاده ${sup}`)}`, "bad"]
      : theirs === 0 && prev > 0 ? [`▼ ${L("Made it free", "جعله مجانياً")}`, "ok"]
      : theirs === prev ? [`— ${L("Unchanged from last", "ثابت عن السابق")}`, "flat"]
      : theirs > prev ? [L(`+${nf(d)} from their last offer`, `+${nf(d)} عن عرضه السابق`), "bad"]
      : [L(`−${nf(Math.abs(d))} from their last offer`, `−${nf(Math.abs(d))} عن عرضه السابق`), "ok"];
    return <span className={`ng-cmp-prev ${tone}`}>{text}</span>;
  };

  const compareCard = () => {
    const matched = priceDiff < 0.005;
    /* ⚠️ A cancelled leg carries NO price — the counter sends the flag and a null price (a bare null
       price is dropped by the validator, so exclusion is the only signal). Keying "have they
       answered?" off the price alone drew «⏳» on a line they had explicitly removed. */
    const rows: { lbl: string; mine: number; mineEx: boolean; theirs: number | null; theirEx: boolean; prev: number | null; prevEx: boolean }[] = [
      { lbl: L("Rental", "الإيجار"), mine: rate, mineEx: false, theirs: supDeal.rate ?? null, theirEx: false, prev: supPrev?.rate ?? null, prevEx: false },
      { lbl: L("Mobilization", "توصيل"), mine: mob, mineEx: mEx, theirs: supDeal.mobPrice ?? null, theirEx: supDeal.mobExcluded, prev: supPrev?.mobPrice ?? null, prevEx: supPrev?.mobExcluded ?? false },
      { lbl: L("Demobilization", "الإرجاع"), mine: demob, mineEx: dEx, theirs: supDeal.demobPrice ?? null, theirEx: supDeal.demobExcluded, prev: supPrev?.demobPrice ?? null, prevEx: supPrev?.demobExcluded ?? false },
    ];
    return (
      <div className="ng-cmp">
        {/* Drawn whether or not they match — green «✓ Matched» in the agreed case. Nothing at all
            left the matched card looking unfinished, and the reader could not tell it from a card
            still waiting for a figure. */}
        <span className={`ng-cmp-pill${matched ? " ok" : ""}`}>
          {matched ? `✓ ${L("Matched", "مطابق")}` : `${L("Difference", "الفرق")} ${nf(priceDiff)}`}
        </span>
        <div className="ng-cmp-duo">
          <div className="ng-cmp-side lead">
            <div className="k">{L("Supplier's total", "إجمالي عرض المورد")}</div>
            <div className="v">{nf(supTotal)}</div>
          </div>
          <div className="ng-cmp-side">
            <div className="k">{L("Your total", "إجمالي عرضك")}</div>
            <div className="v">{nf(total)}</div>
          </div>
        </div>
        {rows.map((r) => {
          const theyAnswered = r.theirs != null || r.theirEx;
          const theirs = r.theirs ?? 0;
          const delta = theyAnswered ? theirs - r.mine : null;
          const same = delta != null && Math.abs(delta) < 0.005;
          return (
            <div key={r.lbl} className="ng-cmp-row">
              <span className="k">{r.lbl}</span>
              <span className="sides">
                <span className="lab">{L("You", "أنت")}</span> <b>{cmpMoney(r.mine, r.mineEx)}</b>
                {" "}
                <span className="lab">{L("Supplier", "المورد")}</span>{" "}
                {theyAnswered ? <b>{cmpMoney(theirs, r.theirEx)}</b> : <b className="wait">⏳</b>}
              </span>
              {delta != null && (
                <span className={`ng-delta${same ? " ok" : ""}`}>
                  {same ? `✓ ${L("Matched", "مطابق")}` : `${delta > 0 ? "+" : "−"}${nf(Math.abs(delta))}`}
                </span>
              )}
              {vsPrevious(theirs, r.prev, r.theirEx, r.prevEx)}
            </div>
          );
        })}
      </div>
    );
  };

  /**
   * A term, in the prototype's three states.
   *
   * `done` — settled, a quiet strip with ✓ (took the supplier's) or ✎ (countered).
   * `now`  — the one being answered: the two positions, then «Change» and «Take theirs».
   * `later`— waiting its turn, dashed and dimmed.
   *
   * ⚠️ ONE queue, one term at a time. ~~A four-column table of every term at once, with a dropdown in
   * each row.~~ The prototype answers them in order, which is what makes «resolve everything before
   * you send» readable rather than a table the renter has to audit.
   */
  const termCard = (t: DealTerm, state: "done" | "now" | "later") => {
    const d = decide(t);
    const mine = resolutions[t.key];
    const label = ar ? t.labelAr : t.label;
    const notes = termNotes(t);
    if (state === "later") return null; // the app draws nothing at all — see `attention` above.
    if (state === "done") {
      const countered = mine?.action === "counter";
      return (
        <div key={t.key} className="ng-t done" role={editable ? "button" : undefined} tabIndex={editable ? 0 : undefined}
          onClick={() => editable && setForcedTerm(t.key)}
          onKeyDown={(e) => { if (editable && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setForcedTerm(t.key); } }}>
          <span className="k">{label}{notes && <span className="why">{notes}</span>}</span>
          <span className={`v${countered ? " changed" : ""}`}>
            {countered ? "✎" : "✓"} {tval(t, d.chosen ?? t.value ?? t.supplierDeclared)}
            {editable && mine && <button type="button" className="undo" title={L("Reopen", "إعادة فتح")} onClick={(e) => { e.stopPropagation(); onReopenLocal(t.key); }}>↻</button>}
          </span>
        </div>
      );
    }
    const opts = choicesFor(t);
    const open = openTerm === t.key;
    /**
     * 🔴 **THREE LABELS, because they answer three different situations** (app parity, `NegActionRow`,
     * 2026-09-20). ~~«Change» on every row.~~
     *   · pending, nothing of mine stated → «Choose another». There is nothing of the reader's to
     *     "change" on a term only the supplier has named, and «Change» reads as editing HIS value
     *     when what the button does is let her name one of her own for the first time.
     *   · conflict with exactly TWO values on the catalogue → «Keep my choice». The only alternative
     *     is the one she already holds, so a picker would show her her own answer and the one she is
     *     refusing.
     *   · conflict with three or more → «Change». There is a real menu to open.
     */
    const conflict = isConflictingTerm(t);
    const changeLabel = !conflict && !iStated(t)
      ? L("Choose another", "اختيار آخر")
      : conflict && opts.length <= 2
        ? L("Keep my choice", "الاستمرار باختياري")
        : L("Change", "تغيير");
    /** «Keep my choice» has no menu to open: it settles on the value already held. */
    const keepMine = conflict && opts.length <= 2;
    const myVal = d.chosen ?? t.renteePreference;
    /* ⚠️ The card names its STATE, so the stylesheet can paint the two apart: red for a clash,
       the app's blue for a term nobody has answered (owner, 2026-09-22, on the app's own
       `negotiate_tones.dart`). `picking` no longer carries a colour of its own - opening the
       options on a pending term does not make it a conflict, which is what the shared red said. */
    return (
      <div key={t.key} {...pin("ng-term-card")} className={`ng-t now${conflict ? " clash" : " pending"}${open ? " picking" : ""}`}>
        <div className="h">
          <span className="k">{label}{notes && <span className="why">{notes}</span>}</span>
          <span className="side">{L("Your choice", "اختيارك")}: <b>{myVal != null && String(myVal) !== "" ? tval(t, myVal) : L("not set", "غير محدد")}</b> · {L("Supplier", "المورد")}: <b>{tval(t, t.supplierDeclared)}</b></span>
        </div>
        {editable && (
          <>
            <div className="acts">
              <button type="button" className="change" disabled={keepMine && (myVal == null || String(myVal) === "")}
                onClick={() => { if (keepMine) { onResolveLocal(t.key, "counter", myVal); setOpenTerm(null); setForcedTerm(null); } else setOpenTerm(open ? null : t.key); }}>{changeLabel}</button>
              {/* 🔴 **«Accept», the APP's own word** (owner, 2026-09-22: *"follow the app in the langiage
                  of the buttons"*). ~~«Take theirs».~~ The app calls it `dealRoomAccept` - «Accept» /
                  «قبول» - and the Arabic here was ALREADY «قبول», so the two locales were saying
                  different things about one button. */}
              <button type="button" className="take" disabled={supStr(t) == null} onClick={() => { onResolveLocal(t.key, "accept"); setOpenTerm(null); setForcedTerm(null); }}>{L("Accept", "قبول")}</button>
            </div>
            {/* 🔴 **The options stand OPEN, and they run ACROSS** (owner, 2026-09-22: *"alwasy
                show other options if he chose 'choose another' to be shown horizantaly not
                vertically"*). ~~Hidden until the button was pressed, then a column.~~ A press to
                reveal a list of three chips is a press that buys nothing, and a column of them
                made a two-option term as tall as the card it sits in. `.opts` wraps in a row now.
                ⚠️ Still withheld on «Keep my choice», which has no menu by construction:
                the only alternative there is the value she already holds. */}
            {!keepMine && opts.length > 0 && (
              <div className="opts">
                {opts.map((o) => (
                  <button key={o.value} type="button" className={o.value === (myVal != null ? String(myVal) : supStr(t)) ? "on" : undefined}
                    onClick={() => { pickTerm(t, o.value); setOpenTerm(null); setForcedTerm(null); }}>{o.label}</button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  /** The one open card in `list`, or nothing at all. 🔴 A section whose turn has not come draws only
   *  its header and its count — owner, on the app: *"don't show any other term except the opened
   *  one"*. So a section with rows left but none of them ACTIVE is the section the reader is not on
   *  yet, and its count is the whole message. */
  const activeCardIn = (list: DealTerm[]) => {
    const t = list.find((x) => x.key === activeKey);
    return t ? termCard(t, "now") : null;
  };

  /** One section: a header band carrying its name and `(resolved/total)`, with its rows INSIDE the
   *  same card — one border, one radius (app parity, `_SectionHeader`). */
  const section = (o: { key: string; label: string; tone?: "agreed" | "ack"; mark?: string; done: number; total: number; open: boolean; onToggle: () => void; body: React.ReactNode }) =>
    o.total === 0 ? null : (
      <div key={o.key} className={`ng-sect${o.tone ? ` ${o.tone}` : ""}`}>
        <button type="button" className="ng-sect-h" onClick={o.onToggle} aria-expanded={o.open}>
          <span className="t">{o.label} ({o.done}/{o.total})</span>
          {o.mark && <span className="mk">{o.mark}</span>}
          <span className={`chev${o.open ? " open" : ""}`}>‹</span>
        </button>
        {o.open && <div className="ng-sect-b">{o.body}</div>}
      </div>
    );

  /** A settled / read-only row inside a section body. */
  const settledRow = (t: DealTerm, tone: "agreed" | "plain", onReopen?: () => void) => {
    const d = decide(t);
    return (
      <div key={t.key} className={`ng-grow${tone === "agreed" ? " agreed" : ""}${onReopen ? " live" : ""}`}
        role={onReopen ? "button" : undefined} tabIndex={onReopen ? 0 : undefined}
        onClick={onReopen}
        onKeyDown={(e) => { if (onReopen && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onReopen(); } }}>
        <span className="k">{ar ? t.labelAr : t.label}</span>
        <span className="v">{tval(t, d.chosen ?? t.value ?? t.supplierDeclared ?? t.renteePreference)}</span>
      </div>
    );
  };

  /* ── the buckets (app parity, `CounterOfferTermsPage`) ────────────────────────────────────────
     🔴 **PENDING AND CONFLICT ARE TWO SECTIONS, and they are two questions** (owner, on the app,
     2026-09-17): a pending term is one nobody has answered, a disputed one is two answers that
     clash, and the second is the one that can cost the deal. ~~One queue, every row drawn, the ones
     not yet reached dashed and dimmed as «waiting for the one above».~~ A placeholder is still a row
     to read past, and the section's own `(n/m)` count carries everything those rows were saying.

     🔴 **PENDING SPLITS BY WHO HAS STATED A VALUE** (owner, on the app, 2026-09-19). `pending` is one
     state covering two opposite situations, and the sheet showed both as the renter's homework: the
     supplier declared a value she never specified (an offer to accept or change), or she asked and
     he has not replied (nothing for her to do). ⚠️ Presentation only — the state stays `pending` and
     every gate still counts both. */
  const iStated = (t: DealTerm) => t.renteePreference != null && String(t.renteePreference).trim() !== "";
  const theyStated = (t: DealTerm) => t.supplierDeclared != null && String(t.supplierDeclared).trim() !== "";

  const conflicts = operatingTerms.filter(isConflictingTerm);
  const pendingAll = operatingTerms.filter(
    (t) => t.state !== "fixed" && !isSettledByValues(t) && !isConflictingTerm(t) && t.state === "pending",
  );
  const needsFixing = pendingAll.filter(theyStated);
  const awaitingThem = pendingAll.filter((t) => !theyStated(t) && iStated(t));
  /** Neither side has named a value (a platform default nobody chose). It walks with the rest:
   *  somebody has to pick. */
  const unstated = pendingAll.filter((t) => !theyStated(t) && !iStated(t));
  const ackTerms = operatingTerms.filter((t) => t.state === "fixed");
  const agreedTerms = operatingTerms.filter(
    (t) => t.state !== "fixed" && (t.state === "soft_accepted" || isSettledByValues(t)),
  );

  /** Answered ON THE SUPPLIER'S VALUE leaves the walk for «Agreed terms»; answered on a different
   *  one stays and stays red, because it is still something he has not agreed to. */
  const settledMatch = (t: DealTerm) => {
    const r = resolutions[t.key];
    if (!r) return false;
    if (r.action === "accept") return true;
    return r.value != null && String(r.value) === supStr(t);
  };
  const pendingWalk = [...needsFixing, ...unstated];
  const openPending = pendingWalk.filter((t) => !settledMatch(t));
  const openConflicts = conflicts.filter((t) => !settledMatch(t));
  const openAwaiting = awaitingThem.filter((t) => !settledMatch(t));
  /* ⚠️ ONE list for the walk, PENDING FIRST (owner, on the app, 2026-09-17). A pending row is one
     answer away and a disputed one is a negotiation, so clearing the quick ones first leaves the
     reader with only the arguments — and the section order below matches the walk, or the open card
     appears under the second heading while the first still says it has rows left. */
  const attention = [...openPending, ...openConflicts, ...openAwaiting];
  const settledHere = [...needsFixing, ...conflicts, ...awaitingThem, ...unstated].filter(settledMatch);
  /* 🔴 The ONE open card: whichever the reader pressed, else the FIRST row still without an answer.
     Answering the open one takes it out of `attention`, so the next unanswered row becomes active by
     itself — the list walks forward without a second mechanism. */
  const unansweredRows = attention.filter((t) => !resolutions[t.key]);
  const activeKey = forcedTerm && attention.some((t) => t.key === forcedTerm)
    ? forcedTerm
    : unansweredRows.length ? unansweredRows[0].key : null;

  const payCard = (t: DealTerm) => {
    const d = decide(t);
    const answered = d.server || !!resolutions[t.key];
    return termCard(t, answered ? "done" : "now");
  };


  return (
    <div className="qp-scrim" dir={ar ? "rtl" : "ltr"} onClick={() => !busy && onClose()}>
      <div {...pin("ng-sheet")} className="ng-shell" onClick={(e) => e.stopPropagation()}>
        {/* ── header: who is on the other side, and the RATE ──────────────────────────────────
            🔴 **THE RATE, exactly as the bid card and the room's price bar print it** — no VAT, no
            duration, no unit count (app parity, 2026-09-20: *"show the price at top header without
            VAT/duration/units so it shows the same number as in the bid card exactly"*).
            ~~`total`: subtotal + transport + 15% VAT.~~ Both figures were right and they were
            different quantities, so the room said «50/day» and the sheet said «58» over the same
            deal and read as a contradiction. This sheet is where the RATE is edited, so the rate is
            what it shows.
            🔴 ~~An amber «🔔 New offer from the supplier» eyebrow over the figure, else a «Total»
            caption.~~ **Both removed 2026-09-19 on the owner's word, on the app.** A caption that is
            always there names what the bar's only number obviously is, and the eyebrow went with it
            (`negotiationHasNewOffer` is deleted in the app; the ARB key survives unread).
            🔴 **The short code is RESTORED, under the name.** The old quotation head on the price
            page carried it and the redesign dropped the block whole, leaving NO reference anywhere
            in the sheet — a renter negotiating several deals with one firm had only the firm's name
            to tell the sheets apart. Under the name, not beside it: the name is looked for first. */}
        <div {...pin("ng-sheet-head")} className="ng-head">
          <div className="ng-inner">
          {/* 🔴 **The firm, then the MACHINE** (owner, 2026-09-22: *"for the header keep company
              name of supplier with equuoment name ans size dont mention request id"*).
              ~~The supplier's name over the request's short code.~~ That code answers a question
              nobody asks inside a sheet they opened FROM the request: he is negotiating one
              machine with one firm, and on a multi-item room the code cannot even say which line
              he is on. The machine and its size can.
              ⚠️ **This reverses the same morning's «the short code is restored under the
              name»**, which put it back because the redesign had left no reference anywhere in the
              sheet. It is still reachable - the log, the quotation and the room behind all carry
              it - and his instruction is explicit. */}
          <div className="ng-party">
            <span className="ng-ava">{room.supplier.name.charAt(0).toUpperCase()}</span>
            <span className="ng-who">
              <b title={room.supplier.name}>{room.supplier.name}</b>
              {machineLine && <span className="ref" title={machineLine}>{machineLine}</span>}
            </span>
          </div>
          <div className="ng-head-l">
            {/* Money reads left-to-right in both locales. */}
            {/* 🔴 **BEFORE → AFTER, the way the app's chat counter card reads it** (owner,
                2026-09-22: *"the price here will take the original bid then if new offer sent will
                show before and after like the price -counter in the app chat"*).
                The figure starts as the SUPPLIER's standing rate and stays that until the renter
                moves it; from then on both are on the bar, his own leading, with the original
                struck through beside it. One place, always in view while he edits - which is why
                it is here rather than on each row, where the green/amber «Supplier: N» line
                already says the same thing per leg. */}
            <div className="ng-net" dir="ltr">
              {counterRate != null && <span className="was">{nf(rate)}</span>}
              {nf(counterRate ?? rate)} <span className="cur">{sar}</span><span className="per">/{periodLabel}</span>
            </div>
            {settledNote && (
              <div className={`ng-note${room.status === "ABANDONED" ? " danger" : ""}`}>
                <span className="material-icons-outlined">{room.status === "ABANDONED" ? "cancel" : room.status === "CLOSED" ? "verified" : "schedule"}</span>
                {settledNote}
              </div>
            )}
          </div>
          <button type="button" className="ng-x" onClick={() => !busy && onClose()} aria-label={L("Close", "إغلاق")}><span className="material-icons-outlined">close</span></button>
          </div>
        </div>

        {/* 🔴 **NO STEP RAIL** (owner, 2026-09-22: *"remove the 3 steps process bar"*).
            ~~① Price —— ② Terms —— ③ Review, a band under the header, argued that morning as
            «what makes three pages read as three SHEETS».~~ It cost a whole band of a sheet whose
            body is the thing worth reading, and it was `aria-hidden` and unpressable - so it was
            decoration that took height from the content.
            ⚠️ **The FOOTER carries the step now, and that was his pick** when the cost was put
            to him: «Next: Terms» / «Review & send» / «Send to the supplier». It names where the
            press GOES rather than where the reader is, which is the half the rail used to add;
            he took that trade explicitly rather than a heading standing in for it. */}

        <div className="ng-body">
          <div className="ng-inner">
          {/* ── ① the price ─────────────────────────────────────────────────────────────────── */}
          {page === 0 && (
            <div {...pin("ng-sheet-price")}>
              {showCompare && (
                <div className="ng-pad">{compareCard()}</div>
              )}

              <div className="ng-card">
                {/* 🔴 **These fields are EX-VAT and nothing said so** (app parity, `dealPricesExVat`).
                    The bid price sheet asks the supplier outright which basis he is quoting on and
                    shows him the other figure; this screen asks nothing and silently treats every
                    number as net. A renter who reads the room's gross figure and types it back here
                    counters 15% high. The totals below DO label their subtotal «before VAT», but that
                    is under the table, after the typing. Stated here, it is read before.
                    ⚠️ Deliberately a caption, not a second basis control: the basis is an input
                    convenience that belongs where a bid is composed, and two controls on two screens
                    is how the two drift. */}
                <p className="ng-exvat">{L("All prices below are before VAT", "جميع الأسعار أدناه بدون ضريبة")}</p>
                <div className="ng-thead">
                  <span>{L("Item", "البند")}</span>
                  <span className="c">{L("Duration", "المدة")}</span>
                  <span className="c">{L("Count", "العدد")}</span>
                  <span className="e">{L("Price / unit", "السعر/وحدة")}</span>
                </div>

                {priceRow({
                  key: "rental",
                  label: room.details.equipmentLabel ?? L("Base rental", "الإيجار الأساسي"),
                  duration: hasDuration ? (rentalCalc.raw ? `${periods} ${L("days", "يوم")}` : `${rentalCalc.billable} ${L("days", "يوم")}`) : periodLabel,
                  // The billable days are what the rate is charged across; the calendar span is stated
                  // under them so the renter can see where the number came from.
                  durationSub: hasDuration && !rentalCalc.raw ? `${periods} ${L("days, Fridays out", "يوم، دون الجمعة")}` : rentalDivisorNote,
                  qty: rNU, qtyMin: 1, qtyMax: cap,
                  onQty: (v) => { setRentalUnits(v); setMobUnitsN((u) => Math.min(u, v)); setDemobUnitsN((u) => Math.min(u, v)); },
                  val: editable ? rateStr : String(room.rate ?? 0), onVal: setRateStr, refVal: refRate,
                })}
                {priceRow({
                  key: "mob",
                  label: L("Delivery to site", "التوصيل إلى الموقع"),
                  duration: L("trip", "رحلة"),
                  qty: mNU, qtyMin: 0, qtyMax: rNU, onQty: setMobUnitsN,
                  val: editable ? mobStr : String(room.mobPrice ?? 0), onVal: setMobStr, refVal: refMobPrice,
                  excluded: mEx, onExclude: setMobExcluded,
                  exTitle: L("Cancel delivery to site from the supplier?", "إلغاء التوصيل إلى الموقع من المورد؟"),
                })}
                {priceRow({
                  key: "demob",
                  label: L("Return from site", "الإرجاع من الموقع"),
                  duration: L("trip", "رحلة"),
                  qty: dNU, qtyMin: 0, qtyMax: rNU, onQty: setDemobUnitsN,
                  val: editable ? demobStr : String(room.demobPrice ?? 0), onVal: setDemobStr, refVal: refDemobPrice,
                  excluded: dEx, onExclude: setDemobExcluded,
                  exTitle: L("Cancel the return leg from the supplier?", "إلغاء الإرجاع من الموقع من المورد؟"),
                })}

                {/* 🔴 **PER-UNIT ROWS, THE COUNT APPLIED ONCE AT THE END — the bid card's shape**
                    (app parity, 2026-09-20: *"follow the structure of the bid card where units are
                    multiplied at the end"*). The room's own breakdown states every row for ONE
                    machine and applies the count in «Overall total»; this block multiplied inside
                    every line, so the two surfaces decomposed the same money differently.
                    ⚠️ **Only when the three counts AGREE.** The deal room negotiates rental, delivery
                    and return counts INDEPENDENTLY — 2 machines, 1 delivery trip, 2 returns is a
                    legal position — and a single multiplier at the end cannot describe that. When
                    they diverge the block keeps its per-leg totals, which are the only honest shape
                    for it. The bid card never faces this: a bid carries one count. */}
                <div {...pin("ng-sheet-sum")} className="ng-sum">
                  <div className="item">
                    <span className="lbl">{room.details.equipmentLabel ?? L("Base rental", "الإيجار الأساسي")}{hasDuration ? ` · ${rentalDays} ${L("days", "يوم")}` : ""}
                      {factorLine("rental") && <span className="fx">{factorLine("rental")}</span>}
                    </span>
                    <span>{nf(unitsAligned ? lines.perUnit.rental : rentalLine)}</span>
                  </div>
                  <div className={`item${mEx ? " off" : ""}`}>
                    <span className="lbl">{L("Delivery to site", "التوصيل إلى الموقع")}
                      {factorLine("mob") && <span className="fx">{factorLine("mob")}</span>}
                    </span>
                    <span>{mEx ? L("not priced", "غير مسعّر") : nf(unitsAligned ? lines.perUnit.mob : mobLine)}</span>
                  </div>
                  <div className={`item${dEx ? " off" : ""}`}>
                    <span className="lbl">{L("Return from site", "الإرجاع من الموقع")}
                      {factorLine("demob") && <span className="fx">{factorLine("demob")}</span>}
                    </span>
                    <span>{dEx ? L("not priced", "غير مسعّر") : nf(unitsAligned ? lines.perUnit.demob : demobLine)}</span>
                  </div>
                  <div className="rule" />
                  <div className="line"><span>{L("Subtotal before VAT", "المجموع قبل الضريبة")}</span><span>{nf(unitsAligned ? lines.perUnit.subtotal : subtotal)}</span></div>
                  <div className="line"><span>{L("VAT 15%", "ضريبة القيمة المضافة 15٪")}</span><span>{nf(Math.round(unitsAligned ? lines.perUnit.vat : vat))}</span></div>
                  <div className="ng-net-box">
                    <span className="k">{unitsAligned ? L("Net incl. VAT per unit", "الصافي شامل الضريبة للوحدة") : L("Net incl. VAT", "الصافي شامل الضريبة")}</span>
                    <span className="v">{nf(unitsAligned ? Math.round(lines.perUnit.total) : total)}</span>
                  </div>
                  {/* 🔴 **THE COUNT, APPLIED ONCE, AT THE END.** Everything above it describes one
                      machine. */}
                  {unitsAligned && (
                    <div className="ng-overall">
                      <span className="k">{L("Overall total", "الإجمالي الكلي")} · {L(`${rNU} units agreed`, `تم الاتفاق على ${rNU} وحدة`)}</span>
                      <span className="v">{nf(total)}</span>
                    </div>
                  )}
                </div>

                {payTerms.length > 0 && <div style={{ padding: "0 16px 14px" }}>{payTerms.map(payCard)}</div>}
                {editable && !rateValid && <p className="ng-err" style={{ padding: "0 16px 14px" }}>{L("Enter a rate to continue", "أدخل سعرًا للمتابعة")}</p>}
              </div>
            </div>
          )}

          {/* ── ② the terms ─────────────────────────────────────────────────────────────────── */}
          {page === 1 && (
            <div {...pin("ng-sheet-terms")} className="ng-card pad">
              {operatingTerms.length === 0 ? (
                <p style={{ padding: "20px 0", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>{L("No operating terms.", "لا توجد شروط تشغيل.")}</p>
              ) : (
                <>
                  <div className="ng-sect-title">{L("Negotiable", "قابلة للتفاوض")}</div>

                  {section({
                    key: "pending", label: L("Pending · not specified by you", "قيد الانتظار · لم تحدّده"),
                    done: pendingWalk.length - openPending.length, total: pendingWalk.length,
                    open: pendOpen, onToggle: () => setPendOpen((o) => !o),
                    body: activeCardIn(openPending),
                  })}

                  {section({
                    key: "conflict", label: L("Conflict terms", "بنود التعارض"),
                    done: conflicts.length - openConflicts.length, total: conflicts.length,
                    open: conflictOpen, onToggle: () => setConflictOpen((o) => !o),
                    body: activeCardIn(openConflicts),
                  })}

                  {section({
                    key: "agreed", label: L("Agreed terms", "الشروط المتفق عليها"), tone: "agreed", mark: "✓",
                    done: agreedTerms.length + settledHere.length, total: agreedTerms.length + settledHere.length,
                    open: agreedOpen, onToggle: () => setAgreedOpen((o) => !o),
                    // Pressing a settled row hands it back to the walk as an open card — the same
                    // reopen the resolved card's ↻ fires.
                    body: [...agreedTerms, ...settledHere].map((t) =>
                      settledRow(t, "agreed", editable ? () => { onReopenLocal(t.key); setForcedTerm(t.key); setOpenTerm(t.key); } : undefined)),
                  })}

                  {/* 🔴 **ANSWERED BY ME, WAITING ON HIM.** Listed as a settled row, not a card: there
                      is no action for this reader, and putting it in the walk told her to re-answer a
                      term her own request had already answered. It still COUNTS toward the close —
                      the backend refuses `pending` whoever is waiting. */}
                  {section({
                    key: "awaiting", label: L("Pending · not specified by the supplier", "قيد الانتظار · لم يحدّده المورد"),
                    done: openAwaiting.length, total: openAwaiting.length,
                    open: awaitOpen, onToggle: () => setAwaitOpen((o) => !o),
                    body: openAwaiting.map((t) => settledRow(t, "plain", editable ? () => setForcedTerm(t.key) : undefined)),
                  })}

                  {/* ═════ SETTLED, AT THE END ═════ (owner, on the app, 2026-09-17: *"show them at
                      the end not on top"*). What is already decided must not stand between the reader
                      and the rows that still need an answer. */}
                  {section({
                    key: "ack", label: L("Acknowledged", "الشروط المُقَرّة"), tone: "ack", mark: "🔒",
                    done: ackTerms.length, total: ackTerms.length,
                    open: ackOpen, onToggle: () => setAckOpen((o) => !o),
                    body: ackTerms.map((t) => settledRow(t, "plain")),
                  })}
                </>
              )}
            </div>
          )}

          {/* ── ③ the review ────────────────────────────────────────────────────────────────── */}
          {page === 2 && (
            <div {...pin("ng-sheet-review")} className="ng-pad" style={{ paddingBottom: 14 }}>
              <div className="ng-rcard">
                <div className="ng-rcard-h"><span className="material-icons-outlined">receipt_long</span>{L("The price you are sending", "السعر الذي سترسله")}</div>
                <div className="ng-rbody">
                  <div className="ng-rrow"><span className="k">{L("Quantity", "الكمية")}</span><span className="v">{rNU} {L("units", "وحدة")}{hasDuration ? (rentalCalc.raw ? ` · ${periods} ${L("days", "يوم")}` : ` · ${rentalCalc.billable} ${L("billable days", "يوم محتسب")}`) : ""}</span></div>
                  <div className="ng-rrow"><span className="k">{L("Base rental", "الإيجار الأساسي")}</span><span className="v">{money(rentalLine)}{rentalDivisorNote ? <span className="sub"> · {rentalDivisorNote}</span> : null}</span></div>
                  <div className="ng-rrow"><span className="k">{L("Delivery to site", "التوصيل إلى الموقع")}</span><span className="v">{mEx ? L("Excluded", "غير مشمول") : money(mobLine)}</span></div>
                  <div className="ng-rrow"><span className="k">{L("Return from site", "الإرجاع من الموقع")}</span><span className="v">{dEx ? L("Excluded", "غير مشمول") : money(demobLine)}</span></div>
                  <div className="ng-rrow"><span className="k">{L("Subtotal before VAT", "المجموع قبل الضريبة")}</span><span className="v">{money(subtotal)}</span></div>
                  <div className="ng-rrow"><span className="k">{L("VAT (15%)", "ضريبة القيمة المضافة (15٪)")}</span><span className="v">{money(vat)}</span></div>
                  <div className="ng-rrow net"><span className="k">{L("Net incl. VAT", "الصافي شامل الضريبة")}</span><span className="v">{money(total)}</span></div>
                </div>
              </div>

              {/* ── the terms guide (app parity, `TermsGuide`) ──────────────────────────────────
                  🔴 **THE TWO NAVY HEADERS ARE THE SAME HEIGHT** (owner, on the app, 2026-09-20:
                  *"price and terms header length must be the same, now the terms has more wasted
                  height"*). The price card's band holds a title; this one held a title, a progress
                  bar and a legend, so the two cards read as different kinds of block stacked on one
                  screen. The bar moved DOWN into the white body — it is content, not chrome.
                  🔴 ~~A legend under the bar: «3 ready · 1 differ».~~ **Removed** on the owner's
                  word: it was the THIRD statement of one fact — the ready count is already on the
                  title row, and the bar under it is the same numbers drawn to scale.
                  🔴 ~~Grouped by category, each group a collapsible with its own count.~~ **Flat,
                  behind ONE collapsed «Matched» toggle**, which is the app's shape. The rows carry a
                  status WORD rather than a badge word.
                  ⚠️ **FOUR segments, not two**: matched, differs, pending, needs-confirm. Two left
                  the unanswered rows invisible on the bar, which is the half the reader is here to
                  see. */}
              {operatingTerms.length > 0 && (() => {
                const status = (t: DealTerm): "locked" | "match" | "conflict" | "pending" => {
                  const b = decide(t).badge;
                  return b === "locked" ? "locked" : b === "match" ? "match" : b === "conflict" ? "conflict" : "pending";
                };
                const n = operatingTerms.length;
                const matched = operatingTerms.filter((t) => { const s = status(t); return s === "match" || s === "locked"; }).length;
                const diff = operatingTerms.filter((t) => status(t) === "conflict").length;
                const pend = n - matched - diff;
                const pct = (v: number) => `${Math.round((v / n) * 100)}%`;
                const word = (s: ReturnType<typeof status>) =>
                  s === "locked" ? L("Acknowledged", "مُقَرّ به")
                  : s === "match" ? L("Matched", "مطابق")
                  : s === "conflict" ? L("Conflict", "تعارض")
                  : L("Undecided", "لم تُحدّد");
                return (
                  <div className="ng-rcard">
                    <div className="ng-rcard-h"><span className="material-icons-outlined">list_alt</span>{L("Terms Guide", "دليل البنود")}<span className="rdy">{matched}/{n} {L("ready", "جاهز")}</span></div>
                    <div className="ng-rbody">
                      <div className="ng-bar">
                        <div className="ok" style={{ width: pct(matched) }} />
                        <div className="df" style={{ width: pct(diff) }} />
                        <div className="pd" style={{ width: pct(pend) }} />
                      </div>
                      <button type="button" className="ng-guide-h" onClick={() => setGuideOpen((g) => ({ ...g, all: !(g.all ?? true) }))} aria-expanded={guideOpen.all ?? true}>
                        <span>{L("Matched", "متوافقة")}</span>
                        <span className={`material-icons-outlined chev${guideOpen.all ? " open" : ""}`}>expand_more</span>
                      </button>
                      {(guideOpen.all ?? true) && operatingTerms.map((t) => { const s = status(t); return (
                        <div key={t.key} className="ng-gnrow"><span className="k">{ar ? t.labelAr : t.label}</span><span className={`ng-gst ${s}`}>{word(s)}</span></div>
                      ); })}
                    </div>
                  </div>
                );
              })()}


              {mode === "accept" && (
                <div style={{ marginTop: 12 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: "var(--navy-mid)" }}>{L("Contract type", "نوع العقد")}</span>
                  <div style={{ marginTop: 5 }}>
                    <Dropdown
                      label={L("Contract type", "نوع العقد")}
                      placeholder="—"
                      value={contractType}
                      onChange={setContractType}
                      options={CONTRACT_TYPES.map((c) => ({ value: c.value, label: c.label }))}
                    />
                  </div>
                </div>
              )}
              {mode === "accept" && (
                <label className="ng-ack">
                  <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} style={{ marginTop: 2 }} />
                  {L("I confirm the agreed rate and terms.", "أؤكّد السعر والشروط المتفق عليها.")}
                </label>
              )}
              {error && <p className="ng-err">{error}</p>}
            </div>
          )}
          </div>
        </div>

        {/* ── footer ───────────────────────────────────────────────────────────────────────────
            🔴 **BACK TO A NAMED ACTION ON EVERY STEP** (owner, on the app, 2026-09-19: *"in the
            footer can't we get back to the live one, which has a next button explicitly, with log
            and accept if it is allowed"*).

            ~~A centred `‹ step ›` switcher, with the forward action hidden in a chevron and the send
            a separate labelled button on step ③ only.~~ The chevron never said where it went, and on
            the last step it fired the one irreversible act in the sheet while looking like
            navigation. The shape is now:

              🕘 · [Back] · [✓ Accept, when allowed] · [**Next: Terms / Review & send / Send to …**]

            ⚠️ **Only the COMMITTING step names its recipient.** The two walking steps say where they
            go; step ③ says who it goes to, because that is the fact a reader is about to act on.
            ⚠️ Navy, never the accept button's green: green on this sheet means «I take your
            position», and sending a reply is the opposite of that. */}
        <div {...pin("ng-sheet-foot")} className="ng-foot">
          <div className="ng-inner">
          <button type="button" className="ng-log" onClick={() => setLogOpen(true)} aria-label={L("Log", "السجل")} title={L("Log", "السجل")}>
            <span className="material-icons-outlined">history</span>
          </button>
          {/* 🔴 **The quotation sits beside the history, on EVERY step** (owner, 2026-09-22:
              *"always show the qoutation on the footer of this negotioation beside the history"*).
              ~~A link at the foot of step ③ only.~~ The paper states the position he is building,
              so a renter pricing step ① had to walk forward twice to read what he was changing.
              ⚠️ Both are the footer's REFERENCE pair - what has happened, and what it adds up
              to - and they sit at the leading edge, away from the acts at the trailing one. */}
          {onOpenQuotation && (
            <button type="button" className="ng-log ng-quote-btn" onClick={() => onOpenQuotation()}
              aria-label={L("Read the quotation", "عرض السعر")} title={L("Read the quotation", "عرض السعر")}>
              <span className="material-icons-outlined">description</span>
            </button>
          )}
          {page > 0 && (
            <button type="button" className="ng-back" disabled={busy} onClick={() => setPage((p) => (p - 1) as 0 | 1 | 2)}>{L("Back", "رجوع")}</button>
          )}
          {!settled && allMatched && onAcceptInstead && (
            <button type="button" className="ng-accept" disabled={busy} onClick={editable ? onAcceptInstead : () => setPage(2)}>✓ {L("Accept offer", "قبول العرض")}</button>
          )}
          {!settled && !editable && !onAcceptInstead && page === 2 && (
            <button type="button" className="ng-accept" disabled={busy || !canSubmit} onClick={doSubmit}>✓ {L("Accept offer", "قبول العرض")}</button>
          )}
          {/* ⚠️ Grey on the LAST step when there is nothing to send, so the refusal is visible before
              it is pressed — and still PRESSABLE, so pressing it says why rather than doing nothing.
              The earlier steps are plain navigation and always live. */}
          {(editable || page < 2) && (
            <button type="button" className={`ng-primary${page === 2 && !hasSomethingToSend ? " blocked" : ""}`}
              disabled={busy || (page < 2 && !canNext) || (page === 2 && !canSubmit)}
              onClick={() => {
                if (page < 2) { setPage((p) => (p + 1) as 0 | 1 | 2); return; }
                if (!hasSomethingToSend) { setNothingSent(true); return; }
                doSubmit();
              }}>
              {busy ? L("Sending…", "جارٍ الإرسال…")
                : settled ? L("Closed", "مغلقة")
                : page === 0 ? L("Next: Terms", "التالي: الشروط")
                : page === 1 ? L("Review & send", "مراجعة وإرسال")
                : L("Send to the supplier", "إرسال إلى المورد")}
            </button>
          )}
          </div>
          {nothingSent && page === 2 && !hasSomethingToSend && (
            <p className="ng-err ng-foot-err">{L("Nothing has changed since your last reply, change a price or answer a term first", "لم يتغيّر شيء منذ ردّك الأخير، غيّر سعراً أو أجب عن بند أولاً")}</p>
          )}
        </div>

        {pendingEx && (
          <div className="qp-scrim" style={{ zIndex: 75 }} dir={ar ? "rtl" : "ltr"} onClick={() => setPendingEx(null)}>
            <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 400, background: "var(--surface)", borderRadius: "var(--radius-lg)", overflow: "hidden", padding: "22px 22px 20px", textAlign: "start" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <h3 style={{ fontSize: 16.5, fontWeight: 900, color: "var(--navy)", margin: 0, lineHeight: 1.45 }}>{pendingEx.title}</h3>
                <span style={{ flexShrink: 0, display: "inline-flex", width: 42, height: 42, borderRadius: "var(--radius-md)", background: "var(--brand-soft)", color: "var(--warn)", alignItems: "center", justifyContent: "center" }}>
                  <span className="material-icons-outlined" style={{ fontSize: 24 }}>warning_amber</span>
                </span>
              </div>
              <p style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)", lineHeight: 1.7, margin: "10px 0 18px" }}>
                {L("If you cancel, the supplier won't handle it. It becomes your responsibility: you arrange the transport and cover its cost, and it won't appear in the supplier's offer.", "عند الإلغاء لن يتكفّل المورد بها: تصبح على مسؤوليتك أنت: تنظّم النقل وتتحمّل تكلفته، ولن تظهر ضمن عرض المورد.")}
              </p>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setPendingEx(null)} style={{ flex: "0 0 auto", padding: "13px 22px", borderRadius: "var(--radius-lg)", border: "1.5px solid var(--border)", background: "var(--surface)", color: "var(--navy)", fontWeight: 800, fontSize: 13.5, cursor: "pointer", fontFamily: "inherit" }}>{L("Go back", "تراجع")}</button>
                <button onClick={() => { pendingEx.onYes(); setPendingEx(null); }} style={{ flex: 1, padding: "13px 12px", borderRadius: "var(--radius-lg)", border: "none", background: "var(--danger)", color: "var(--surface)", fontWeight: 800, fontSize: 13.5, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>{L("Yes, cancel it: on me", "نعم، ألغِها: عليّ أنا")}</button>
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
              <div className="qp-body" style={{ padding: "4px 0 8px" }}>
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
                  // term action / lifecycle event), newest-first.
                  const sys = messages.filter((m) => m.user?.id === "system_bot" && (m.text ?? "").trim());
                  const sorted = [...sys].sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime());
                  const PRICE_RE = /سعر|ر\.?\s?س|price|rate|تعبئة|إرجاع|موب|ديموب|SAR/i;
                  const TERMS_RE = /شرط|بند|term|إعاشة|وقود|صيانة|دفع|مشغّل|مشغل|قبول/i;
                  const shown = sorted.filter((m) => (logTab === "all" ? true : logTab === "price" ? PRICE_RE.test(m.text ?? "") : TERMS_RE.test(m.text ?? "")));
                  if (shown.length === 0) return <p style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", padding: "24px 0" }}>{L("No activity yet.", "لا يوجد نشاط بعد.")}</p>;
                  return (
                    /* 🔴 **GROUPED BY ROUND** (owner, on the app, 2026-09-19: *"the UI of the
                       negotiation log needs work"*). The rounds were derived, collapsed and then
                       FLATTENED, so ten entries read as ten unrelated events and nothing on screen
                       said which round any of them belonged to. The data was always here; only the
                       grouping was missing.
                       ⚠️ A term answered BEFORE anyone proposed a rate still belongs to round ONE:
                       it was part of the opening exchange, and a «Round 0» would name a thing the
                       rest of the product does not have. */
                    <ul className="qp-log-list">
                      {(() => {
                        const starts = flowRounds.map((r) => (r.at ? Date.parse(r.at) : NaN)).filter((n) => !Number.isNaN(n));
                        const roundOf = (at: string | Date | null | undefined) => {
                          const t = at == null ? NaN : at instanceof Date ? at.getTime() : Date.parse(at);
                          if (Number.isNaN(t) || !starts.length) return null;
                          const n = starts.filter((s) => s <= t).length;
                          return n < 1 ? 1 : n;
                        };
                        let last: number | null = null;
                        const out: React.ReactNode[] = [];
                        for (const m of shown) {
                          const r = roundOf(m.created_at);
                          if (r != null && r !== last) {
                            out.push(<li key={`rh-${r}-${m.id}`} className="qp-log-round">{L(`Round ${r}`, `الجولة ${r}`)}</li>);
                            last = r;
                          }
                          out.push(
                            <li key={m.id} className="qp-log-row">
                              <span className="material-icons-outlined qp-log-ic">bolt</span>
                              <span className="qp-log-txt">{m.text}</span>
                              {m.created_at && <span className="qp-log-time">{new Date(m.created_at).toLocaleString(ar ? "ar-SA-u-ca-gregory" : "en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>}
                            </li>,
                          );
                        }
                        return out;
                      })()}
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
