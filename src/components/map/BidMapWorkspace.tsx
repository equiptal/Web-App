"use client";

/**
 * RMAP V1–V12 — the deal-room equipment-verification surface: a **fixed-width panel with the map
 * filling the rest** (spec 004 §5). v2's floating overlay is gone with the offers list it hosted; v3
 * scopes the view to ONE bid, so the panel is a column of that bid's own verification content and the
 * map is what is left over.
 *
 * **The composition owner.** It holds the panel's shell (V2), the counts (V3), the shortfall (V4) and
 * the equipment list (V5), and it mounts V7's detail and V9's company panel as takeovers. It is also
 * the one place a machine list is DERIVED — `listedMachines(fleet)` — which the map then draws minus
 * whatever has no coordinates. One derivation is what keeps a card and its marker in step (AC-15) and
 * what makes their colours a single fact (AC-19).
 *
 * **One bid, resolved by `bidId`** (V1, RM3-AC-01). The bid arrives as a prop from the route
 * (`/bids/[bidId]/equipment`), which owns every fetch on this screen — one fetch owner means the
 * refetch triggers of §7.5.1 have exactly one implementation. There is no list of other bids here and
 * no way to reach one.
 *
 * It DOES fetch the fleet, because that request has no other owner and no other trigger, and it is
 * **cached by `bidId`, never by supplier**. One firm can hold several bids on one request
 * (`@@unique([requestId, bidOwnerKey, equipmentId])`), and `inBid`/`yardConfirmed` are relative to ONE
 * bid — a supplier-keyed cache would draw bid A's offer on bid B's map. The cache is dropped when the
 * bid itself refetches, since a resubmitted bid can change which machines it names.
 *
 * It fetches the supplier's **company papers** the same way (V15), and for the same reason: the read is
 * bid-scoped, so it is keyed and invalidated identically. The one difference is its trigger — it waits
 * for the company panel to open, because the urls it returns are presigned and perishable and the panel
 * is behind a button most sessions never press.
 *
 * **Nothing here writes until the renter asks it to.** No deal room is created by opening, selecting
 * or reading (004a §4.5) — a `DealRoom` row freezes the supplier's offered count. The three acts that
 * DO create one are all explicit and all the renter's: sending a request card (V11), sending the
 * first chat message (V12's dock), and negotiating (V12's footer, which hands off to the existing
 * flow at `/deal-room/[id]`).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { VerifiedMark } from "@/components/VerifiedMark";
import dynamic from "next/dynamic";
import { ChatDock } from "@/components/map/ChatDock";
import type { MachinePin } from "@/components/map/MapCanvas";
import { PriceFooter } from "@/components/map/PriceFooter";
import { useRenteeRequestSender } from "@/components/map/useRenteeRequestSender";
import { EquipmentList } from "@/components/map/EquipmentList";
// The list's own card model, built here ONCE and handed to both readers — the cards in the column and
// the hover box on each marker. Two calls would be two answers waiting to differ (RM3-AC-19).
import { equipmentCardModel } from "@/components/map/equipment-card-model";
import { CompanyPanel, EquipmentDetail, type PanelRequestDraft } from "@/components/map/panel";
import type { BidCard } from "@/lib/contract/bids";
import { fetchBidCompanyDocuments, fetchBidFleet } from "@/lib/api/client";
import { companyPanelSource, type CompanyDocsPayload } from "@/lib/contract/company-documents";
import { documentsTargetUnit } from "@/lib/contract/workspace";
import {
  arabicIndicDigits,
  countCase,
  isPlottable,
  LANDING_CUE_MS,
  requestTypeWord,
  shortfallAlert,
  unitCountLabel,
  unitCounts,
} from "@/lib/contract/bid-map";
import {
  equipmentListView,
  landingSelectionId,
  machineMarkers,
  nextSelection,
  listedMachines,
} from "@/lib/contract/equipment-list";
import type { FleetMachine } from "@/lib/contract/fleet";
import {
  askIdentity,
  composeDocumentRequest,
  composeMachineRequest,
  composeShortfallRequest,
  isAskOutstanding,
  renteeDraftStep,
  type RenteeRequestDraft,
} from "@/lib/contract/rentee-request";
import { publicTaxonomyUrl, type RequestRecord } from "@/lib/contract/requests";
import { fmt, useLocale, useT } from "@/lib/i18n";
import "@/components/map/map-proto.css";
import { pin } from "@/lib/uiPins";

// `leaflet` reaches for `window` at import time, so the canvas is client-only — the same handling
// `MapLocationPicker`/`GoogleMapLocationPicker` need in this repo.
const MapCanvas = dynamic(() => import("@/components/map/MapCanvas"), { ssr: false });

/**
 * The panel's width, and the FLOOR the resize handle enforces — it may be widened, never narrowed
 * past this. Kept in step with `--bm-panel-w`'s fallback in `map-proto.css`; the two are the same
 * figure and a drift between them means the grip can drag below the width the cards are drawn for.
 *
 * ~~392, §5's figure~~ → ~~460 since 2026-08-20~~ → **400 since 2026-08-31** (owner: *"reduce the
 * cards width"*). 460 was bought to stop the old availability chip truncating; that chip and the
 * distance's ask prompt are both gone, so the card's widest line is the figure itself. See the
 * `.bm-panel` rule.
 */
const PANEL_MIN_W = 400;

/** A bid this surface can resolve. v3 scopes the view to exactly ONE of these (spec 004 §4). */
export type MapBid = BidCard & { itemLabel?: string; itemLabelAr?: string };

export interface BidMapWorkspaceProps {
  /** The one bid this surface resolves (V1). Null while the route is still resolving it. */
  bid: MapBid | null;
  /** The bid's own request — the only source of the project pin, and of the type word on the count
   *  pills (RM3-AC-08). Null while it loads, or when the request has no project location (AC-21). */
  request: RequestRecord | null;
  /** Drives the fleet cache invalidation on the falling edge — see the effect below. */
  refreshing: boolean;
  /** The machine selection, exposed upward for anything outside this panel that needs it. */
  onSelectMachine?: (equipmentId: string | null) => void;
  /**
   * Fired AFTER a request card is in the conversation (V11), never instead of sending it.
   *
   * **All four asks** (§6.7) — the shortfall's «اطلب إضافتها», the card's and the detail's
   * «اطلب تأكيد التوفّر», «اطلب معدّة أخرى», and the batch «اطلب مستنداً» — are now sent by this
   * surface itself through `useRenteeRequestSender` (create-or-fetch the room, then post). The
   * earlier `onRequest` prop, which handed a composed draft UP for someone else to post, is gone:
   * with the send path landed there is no second implementation to route to, and a caller that
   * could intercept an ask could also silently drop one. A caller may still REACT — a toast, an
   * analytics event — without being able to change what was sent or whether it was.
   */
  onRequestSent?: (draft: RenteeRequestDraft, ref: string | null) => void;
  /** Optional hook for a caller that wants to know the company panel was opened (analytics, a route
   *  change). The panel itself opens here — V9's component is mounted below. */
  onOpenCompanyDocs?: () => void;
  /**
   * Open V9's company-documents panel on arrival — the route's `?company=1` (owner, 2026-08-19).
   *
   * The deal room's «Company details» sends the renter here rather than opening a documents modal of
   * its own, so a firm's papers are ONE surface wherever they are asked for. Read once, as the panel's
   * INITIAL state: a renter who closes it must not have it reopened by a URL that has not changed.
   */
  openCompanyDocs?: boolean;
  /** Arriving from a chat icon: the dock opens with the surface (owner, 2026-08-26). */
  openChat?: boolean;
  /**
   * The OTHER offers on the same request, so the renter can walk from one supplier's yard to the
   * next without going back (owner, 2026-09-04: *"show other bids on the equipment request he is
   * checking so he navigates to other suppliers' equipment maps through it instead of going back and
   * forth between the map and the bid cards"*).
   *
   * This bid is included, and marks itself. The list is the route's to fetch: this surface has one
   * fetch owner for the bid and one for the fleet, and a third here would give the same rule two
   * implementations. Empty until it answers, and empty is simply a header with no strip.
   */
  siblings?: SiblingBid[];
}

/** One other offer on this request, in the few fields a chip can show. */
export interface SiblingBid {
  bidId: string;
  supplierName: string;
  supplierLogoUrl: string | null;
  currentPrice: number | null;
  priceUnit: string | null;
}

export function BidMapWorkspace({
  bid,
  request,
  refreshing,
  onSelectMachine,
  onRequestSent,
  onOpenCompanyDocs,
  openCompanyDocs = false,
  openChat = false,
  siblings = [],
}: BidMapWorkspaceProps) {
  const t = useT();
  const router = useRouter();
  const { locale } = useLocale();
  const ar = locale === "ar";
  /** bidId → its supplier's qualifying fleet. Keyed by BID for the reason in the file header. */
  const [fleetByBid, setFleetByBid] = useState<Record<string, FleetMachine[]>>({});
  const [loadingBidId, setLoadingBidId] = useState<string | null>(null);
  const [fleetFailed, setFleetFailed] = useState(false);
  /** bidId → that supplier's company papers, presigned (V14/V15). Keyed by BID for the fleet's exact
   *  reason — the read is bid-scoped and gated by the bid's own access check — and dropped by the same
   *  falling-edge invalidation, which also means a reopened panel gets freshly signed urls. */
  const [companyDocsByBid, setCompanyDocsByBid] = useState<Record<string, CompanyDocsPayload>>({});
  /** Exactly one machine is selected at a time (AC-81) — a single id, so a second ring is not
   *  representable. Cleared on every bid change (AC-177). */
  const [selectedMachineId, setSelectedMachineId] = useState<string | null>(null);
  /** V6's attention cue, held separately from the selection: the accent is a state that persists, the
   *  cue is an event that ends (AC-35). Null once it has rested, or as soon as the renter acts. */
  const [cueId, setCueId] = useState<string | null>(null);
  /** V7 — the machine whose detail has TAKEN OVER the panel, or null for the list. */
  const [detailId, setDetailId] = useState<string | null>(null);
  /**
   * Arriving from `View documents` in the requests workspace (`?panel=documents`). The papers are the
   * errand, so the detail opens on its documents tab rather than on the machine, and the renter does
   * not have to press again for the thing he asked for.
   *
   * It is consumed ONCE, by `openedForDocuments`, and never re-read: pressing Back to the list and
   * then opening another machine must land on the machine tab like any other, or the deep link would
   * quietly re-target every panel opened for the rest of the visit.
   */
  const [openedForDocuments, setOpenedForDocuments] = useState(false);
  const documentsDeepLinkUsed = useRef(false);
  /** V9 — the company panel, which takes over the same way. */
  const [companyOpen, setCompanyOpen] = useState(openCompanyDocs);
  /**
   * V17 — the pressed filter chips (§6.4a). **Empty on arrival, always**: a renter who cannot see all
   * the machines in an offer cannot tell whether the lessor sent few or a chip is hiding some. It lives
   * HERE rather than in the list because the map filters on the same answer (RM3-AC-28d/AC-15) — one
   * state, one derivation, so the cards and the markers cannot disagree about what the offer contains.
   */
  const [filterIds, setFilterIds] = useState<string[]>([]);
  /** V12 — the ask the renter has COMPOSED and not yet sent (RM3-AC-17). The dock renders it as a
   *  draft card; the lifecycle that moves it is `composeDraft`/`cancelDraft`/`confirmDraft` below. */
  const [pendingDraft, setPendingDraft] = useState<RenteeRequestDraft | null>(null);
  /**
   * The staged ask as the TRANSITION reads it, mirrored beside the state that renders it.
   *
   * A `setState` updater is not guaranteed to have run by the time the handler returns, so a confirm
   * that read the next state out of one would send nothing — and two presses landing in one batch
   * would both read the same staged ask and send it twice. The ref is what makes "exactly once" true
   * of the second press as well as the first, which is the whole reason `renteeDraftStep` yields the
   * payload and the next state together.
   */
  const pendingRef = useRef<RenteeRequestDraft | null>(null);
  const stage = useCallback((next: RenteeRequestDraft | null) => {
    pendingRef.current = next;
    setPendingDraft(next);
  }, []);
  /** The panel's scroller, handed to the list so a selection made on the MAP brings its card into
   *  view (AC-15). */
  const bodyRef = useRef<HTMLDivElement | null>(null);
  /** The bid V6's landing pre-selection has already run for — see the effect below. Declared with the
   *  state it guards, because the effect that RE-ARMS it (on a bid change) runs earlier in this file. */
  const landedForBid = useRef<string | null>(null);

  /* ── V11 · the one sender behind all four requests (§6.7) ──────────────────────────────────────
     Create-or-fetch the room, then post. Handed to the shortfall alert below, and exported as a hook
     so the surfaces that mount inside `bm-body` (V5's list, V7's detail, V8/V9's document rows) wire
     one prop instead of each repeating the room-creating sequence. */
  const sender = useRenteeRequestSender(bid);
  /**
   * ── One ask, one card (owner, 2026-08-10) ─────────────────────────────────────────────────────
   * The identities of every ask the lessor has not answered yet. A control whose draft is in here is
   * disabled and says why, because a renter who can repeat an open question floods the lessor's
   * conversation — verified on staging before the guard existed, where the identical availability ask
   * returned 201 three times and posted three cards.
   *
   * It is fed from two places, and the difference between them matters:
   *
   *  · **the conversation**, reported up by the dock, which is the RECORD — there is no table of these
   *    cards, so the channel is the only place an ask from a previous session survives. It arrives as
   *    a whole set and REPLACES what is here, because it is the complete answer for that room and a
   *    merge would keep resurrecting asks the lessor has since answered;
   *
   *  · **this session's own sends**, added one at a time. The dock holds no messages until it is
   *    opened, and most renters never open it, so without this an ask sent from the panel would leave
   *    its control live for the rest of the session. A refusal from the backend's own guard (409) adds
   *    one the same way — that is the case where the client was the one that did not know.
   *
   * It replaces the `shortfallSent` flag that used to acknowledge the shortfall ask alone: that was
   * this rule written for one of the four controls, and could not know about an ask made yesterday.
   *
   * It is NOT the card's state. A card in the conversation derives its own verdict from the machine on
   * every render (RM3-AC-18); this only answers "has the renter already asked this exact question".
   */
  const [outstandingAsks, setOutstandingAsks] = useState<ReadonlySet<string>>(() => new Set());

  /** One ask learned the hard way — sent, or refused as already pending. Merged rather than replacing:
   *  a single identity is not a statement about the whole conversation. */
  const noteOutstanding = useCallback((identity: string) => {
    setOutstandingAsks((prev) => (prev.has(identity) ? prev : new Set(prev).add(identity)));
  }, []);

  // The backstop closing the loop: when the backend refuses a repeat the client did not catch — a
  // stale tab, a dock never opened, a double-tap that beat the first response home — the surface
  // learns the identity it was missing and the control disables itself.
  useEffect(() => {
    if (sender.alreadyPendingAsk) noteOutstanding(sender.alreadyPendingAsk);
  }, [sender.alreadyPendingAsk, noteOutstanding]);

  /** Whether this exact question is already with the lessor. Null drafts — an ask the composer refuses
   *  — are never outstanding: they are disabled for their own reason, and claiming otherwise would
   *  explain an unsendable control with the wrong sentence. */
  const askPending = useCallback(
    (draft: RenteeRequestDraft | null): boolean => draft != null && isAskOutstanding(draft, outstandingAsks),
    [outstandingAsks],
  );

  const selectedBidId = bid?.id ?? null;
  // An off-platform submission has no listings, no yards and no coordinates — there is nothing to
  // fetch and nothing that could be plotted (AC-197, §6.13.5). Such a bid never opens this surface at
  // all (RM3-AC-25); this is the second line of defence, not the routing rule. `converted` bids are
  // NOT excluded: a converted submission is a real bid with real registered machines, and only its
  // LABELLING stays off-platform (AC-203).
  const offPlatform = bid?.viaSharedLink === true;

  /* ── fetch: lazy, per bid, once ────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!selectedBidId || offPlatform) return;
    if (fleetByBid[selectedBidId]) return; // cached — a re-render must not re-request
    let active = true;
    setLoadingBidId(selectedBidId);
    setFleetFailed(false);
    fetchBidFleet(selectedBidId)
      .then((r) => {
        if (!active) return;
        setFleetByBid((prev) => ({ ...prev, [selectedBidId]: r.machines }));
      })
      .catch(() => {
        // A failed fleet fetch must never be silent: an empty map would read as "this lessor has no
        // machines", which is a claim. It must also never produce counts — the pills would then read
        // «٠ لدى المورد», which is the same claim in a pill.
        if (active) setFleetFailed(true);
      })
      .finally(() => {
        if (active) setLoadingBidId((id) => (id === selectedBidId ? null : id));
      });
    return () => {
      active = false;
    };
  }, [selectedBidId, offPlatform, fleetByBid]);

  /* ── V15 · the company papers — the read that had no caller ─────────────────────────────────────
     `docs` used to be built from `bid.compliance`: presence booleans with no url, no expiry and no
     verification, so all five rows read "no document yet" with nothing to press and AC-69 was
     unreachable on this panel. This is the fetch that fills it, mirroring the fleet's mechanics above
     — keyed by `bidId`, invalidated on the same falling edge, and degrading without breaking the
     surface when it fails.

     **Lazily, on the first open per bid**, and NOT with the fleet. Two reasons, in order: the urls are
     presigned and therefore perishable, so signing them when the renter can actually press them beats
     signing them on arrival at a surface where the panel is behind a button most sessions never touch;
     and the landing path stays exactly as many requests as it is today. A failed read is not latched,
     so closing and reopening retries it.

     **This is a GET and nothing else** — opening the panel creates no deal room (004a §4.5). */
  useEffect(() => {
    if (!companyOpen) return;
    if (!selectedBidId || offPlatform) return;
    if (companyDocsByBid[selectedBidId]) return; // cached — reopening must not re-request
    let active = true;
    fetchBidCompanyDocuments(selectedBidId)
      .then((payload) => {
        if (!active) return;
        setCompanyDocsByBid((prev) => ({ ...prev, [selectedBidId]: payload }));
      })
      .catch(() => {
        // Deliberately unlatched and unreported HERE. The panel falls back to `bid.compliance`, which
        // states presence honestly and exposes no control — it must never render "no document yet",
        // because that is a statement about the LESSOR and a failed read is a statement about us.
      });
    return () => {
      active = false;
    };
  }, [companyOpen, selectedBidId, offPlatform, companyDocsByBid]);

  // Invalidate on the falling edge of a bid REFETCH (§7.5.1). A resubmitted bid can name different
  // machines, so a cache that outlived the refetch would keep drawing the previous offer. The papers
  // go with it: a resubmission can change the firm's filings, and the presigned urls are perishable.
  const wasRefreshing = useRef(false);
  useEffect(() => {
    if (wasRefreshing.current && !refreshing) {
      setFleetByBid({});
      setCompanyDocsByBid({});
    }
    wasRefreshing.current = refreshing;
  }, [refreshing]);

  // Switching the bid clears the machine selection (AC-177) — a ring left on a machine belonging to a
  // supplier no longer on the map is the defect this prevents. (The route resolves one bid, so this
  // fires on arrival and on nothing else.) It also re-arms the landing pre-selection and closes both
  // takeovers: a detail left open across a bid change would show one bid's machine over another's
  // counts.
  useEffect(() => {
    setSelectedMachineId((cur) => nextSelection(cur, { kind: "bid-change" }));
    setCueId(null);
    setDetailId(null);
    setCompanyOpen(false);
    setFilterIds([]);
    // An ask composed against one bid's machines has no meaning in another's conversation, and it was
    // never sent — so it is dropped rather than carried across.
    stage(null);
    landedForBid.current = null;
    onSelectMachine?.(null);
    // `onSelectMachine` is the parent's callback; re-running when only its identity changed would
    // clear a selection the renter just made.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBidId]);

  const site = useMemo(() => {
    const lat = request?.projectLat;
    const lng = request?.projectLng;
    // Never a half-resolved point: one missing side voids both (the same rule `resolveUnitLocation`
    // enforces per unit). A point at (lat, 0) is in the Gulf of Guinea.
    if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  }, [request?.projectLat, request?.projectLng]);

  const fleet = useMemo(
    () => (selectedBidId && !offPlatform ? fleetByBid[selectedBidId] ?? null : null),
    [fleetByBid, selectedBidId, offPlatform],
  );

  // The request item this bid answers — the source of the pills' type word (RM3-AC-08) and of the
  // pin's taxonomy image.
  const item = request?.equipmentItems?.[0] ?? null;

  /** The price basis' duration — `estimatedDurationDays`, which is EXACTLY the field `mapDealRoom`
   *  reads into `periods`. Reading a different one would make the footer's figures disagree with the
   *  deal room's for the same room (RM3-AC-24). */
  const requestDurationDays =
    typeof request?.estimatedDurationDays === "number" ? request.estimatedDurationDays : null;

  /** The RFQ group, resolved the way `inboxGroupKey` resolves it: the fan-out group when the request
   *  has one, else the request itself — which simply means "this bid has no siblings". Read through
   *  the record's index signature because `RequestRecord` does not type the field. */
  const requestGroupKey = ((): string | null => {
    if (!request) return null;
    const raw = request.requestGroupId;
    return typeof raw === "string" && raw.trim() ? raw : request.id;
  })();

  /* ── V5 · the list, and V10's pin set derived from it ───────────────────────────────────────────
     `listedMachines` is the single filter+sort: `inBid === true`, availability not `absent`, nearest
     first (§6.4, AC-09/AC-10). The map then draws the SAME set minus what has no coordinates, so the
     card list and the marker set cannot fall out of step (AC-15) — a machine is on the map only if it
     is in the list, and the one difference is stated: `isPlottable`.

     Only this bid's supplier's machines are ever assembled here (AC-75) — the endpoint is bid-scoped,
     so no other supplier's fleet is even in memory. Claimed units never reach either: the fleet is
     registered machines only, and the shortfall is stated in the panel's alert instead (§6.3). */
  const listed = useMemo(() => (fleet ? listedMachines(fleet) : []), [fleet]);

  /* ── V17 · the filters (§6.4a, RM3-AC-28a→28e) ─────────────────────────────────────────────────
     One model call answers all of it: which chips exist (only what the request asked for, and only
     where they would split the list), which machines survive them, and the two figures the count is
     made of. `bid` is passed as the request — a `BidCard` carries the request's asks projected onto
     the bid, which is the same object the match grid is scored against, so a chip and a grid cell can
     never disagree about the same certificate. */
  /* ── V18 · the offer first, the rest on request (owner, 2026-08-19) ────────────────────────────
     *"only show at beginning the ones in the offer and then at bottom option to show all equipments
     … and show others on map."* One flag, read by the model, and BOTH surfaces follow it — the cards
     because they render `view.machines`, the map because its pins are derived from the same array.
     Wiring the map separately would have been a second answer to "what is on screen".

     Not reset when the filters change: a renter who opened the fleet has said what he wants to see,
     and pressing a chip is not a retraction of it. `equipmentListView` collapses on its own when the
     expansion stops meaning anything (nothing outside the offer survives the chips). */
  const [showAllEquipment, setShowAllEquipment] = useState(false);
  const view = useMemo(
    () => equipmentListView(listed, bid, filterIds, { showAll: showAllEquipment }),
    [listed, bid, filterIds, showAllEquipment],
  );
  const visible = view.machines;

  /* The marker set is `machineMarkers(view.machines)` and nothing else — the FILTERED list minus what
     cannot be drawn (AC-15, AC-21, AC-22). The derivation lives in the model beside the list's own,
     so each marker's availability is the SAME `availabilityView` call the card's chip is built on
     (AC-19): one fact, two renderings, no possible disagreement. `isPlottable` reads coordinates
     only — never the availability, never the filter and never `yardConfirmed`.

     **Each marker carries the list card's own model as well** (owner, 2026-08-11: *"hovering an
     equipment on the map must show its details"*). The map's hover box states the card, so it is
     handed the card — the very object `EquipmentList` renders, from the very same
     `equipmentCardModel(machine, bid)` call, built once here for both readers. Deriving it a second
     time inside the canvas would put a fifth spelling of the availability, the distance and the
     certificate line on the surface, which is the failure RM3-AC-19 and the one-decimal ruling are
     both about. `bid` is the request a card is read against, exactly as it is for `<EquipmentList>`. */
  const machines: MachinePin[] = useMemo(() => {
    const cards = new Map(visible.map((m) => [m.equipmentId, equipmentCardModel(m, bid ?? undefined)] as const));
    // Spread onto `machineMarkers`' answer rather than mapping `visible` ourselves: the marker SET is
    // the model's decision (offered · plottable · filtered), and this must stay a passthrough that
    // cannot add a pin the list does not have.
    return machineMarkers(visible).map((marker) => ({ ...marker, card: cards.get(marker.id) }));
  }, [visible, bid]);

  // AC-80 decision 4: the REQUEST ITEM's taxonomy image, falling back to the category image, then a
  // generic icon inside the pin. The taxonomy bucket differs per env, so the URL is rebuilt against
  // the public one exactly as the rest of the app does.
  const itemImageUrl = publicTaxonomyUrl(item?.subtypeImageUrl ?? item?.categoryImageUrl ?? null);
  // Off-catalogue: the line has no taxonomy name in either locale, so the renter's own words are it.
  const customItemName = item?.isUndefined ? (item.customEquipmentName ?? "").trim() || null : null;
  const itemName =
    customItemName ?? (ar ? item?.subtypeNameAr ?? item?.subtypeName : item?.subtypeName ?? item?.subtypeNameAr) ?? item?.subtypeName ?? null;

  /* ── One opener for BOTH surfaces (owner, 2026-08-11) ──────────────────────────────────────────
     *"Clicking an equipment on the map must open the panel of this selected equipment."* A marker
     press used to be `nextSelection(…, "press")` and nothing else: it rang the machine, lit its card
     somewhere down a 50-card column, and left the renter — who had just pointed at the machine — to
     find that card and press it a second time to see anything. The card had already stopped working
     that way on 2026-08-10; this is the map catching up.

     `"open"`, never `"press"`: opening the detail of the ALREADY selected machine must not toggle the
     selection off underneath the panel it is about to fill. And it is ONE callback handed to the map
     and to the list, not two that happen to agree — the same reason AC-15 wants one selection value.

     The company panel is closed on the way in because it covers the whole column: a detail opened
     under it would be invisible and the press would read as broken. That belonged to
     `openMachineFromChat` alone and was a gap for the other two entrances. */
  /**
   * **Find this machine on the map** — the card body's press (app parity, owner 2026-08-15).
   *
   * It selects, and hands the canvas a focus token so the camera flies in. It deliberately does NOT
   * open the detail: the panel would cover the very map the renter just asked a question about.
   *
   * The token is what makes a second press on the same card fly again. Selection alone could not:
   * re-selecting the current machine is a no-op by design (`nextSelection`'s "open" never toggles),
   * so a renter comparing two machines would get one flight and then silence.
   */
  const [focus, setFocus] = useState<{ id: string; token: number } | null>(null);
  const focusMachine = useCallback(
    (id: string) => {
      setSelectedMachineId((cur) => nextSelection(cur, { kind: "open", id }));
      // The landing cue has done its job the moment the renter acts on any card.
      setCueId(null);
      setFocus((f) => ({ id, token: (f?.token ?? 0) + 1 }));
      onSelectMachine?.(id);
    },
    [onSelectMachine],
  );

  const openMachine = useCallback(
    (id: string) => {
      setSelectedMachineId((cur) => nextSelection(cur, { kind: "open", id }));
      // The renter has acted, so the landing cue has done its job and stops immediately. Waiting out
      // the remaining seconds would pulse a card he has already moved past.
      setCueId(null);
      setCompanyOpen(false);
      setDetailId(id);
      onSelectMachine?.(id);
    },
    [onSelectMachine],
  );


  /* ── Arriving from the workspace's `View documents` ────────────────────────────────────────────
     Open the offered machine's detail on its documents tab, once the fleet is actually here — the
     link cannot name a machine, because the workspace has the bid but not its fleet, so the choice is
     made here where the machines are. `documentsTargetUnit` prefers one whose location the lessor
     confirmed: that is the machine the renter is being asked to trust.

     Guarded by a ref rather than by state so a re-render cannot re-fire it, and the query string is
     scrubbed afterwards so a refresh — or a Back — does not reopen a panel the renter has closed. */
  useEffect(() => {
    if (documentsDeepLinkUsed.current || listed.length === 0) return;
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("panel") !== "documents") return;
    documentsDeepLinkUsed.current = true;
    const target = documentsTargetUnit(listed);
    if (!target) return;
    // `openMachine`, never a hand-written selection: it is the one writer that keeps the ring, the
    // card and the pin agreeing (AC-15), and a fourth copy of those statements here is how the two
    // surfaces begin to disagree.
    openMachine(target);
    setOpenedForDocuments(true);
    params.delete("panel");
    const q = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${q ? `?${q}` : ""}`);
  }, [listed, openMachine]);

  /* ── V17 · a filtered-out machine cannot stay selected ─────────────────────────────────────────
     Cards and markers move together (AC-15), so a selection pointing at a machine no chip lets
     through would be a ring with no card and no pin — the same orphaned-selection defect the bid
     change guards against. The whole `listed` set is checked, not `visible`, so this fires only when
     a FILTER hid it and never while the fleet is still loading. */
  useEffect(() => {
    if (!selectedMachineId) return;
    if (view.machines.some((m) => m.equipmentId === selectedMachineId)) return;
    if (!listed.some((m) => m.equipmentId === selectedMachineId)) return;
    setSelectedMachineId((cur) => nextSelection(cur, { kind: "hidden" }));
    setCueId(null);
    onSelectMachine?.(null);
    // `onSelectMachine` is the parent's callback; re-running on its identity would clear a selection
    // the renter just made.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.machines, listed, selectedMachineId]);

  /* ── V6 · landing pre-selection (§6.4, RM3-AC-34/35) ────────────────────────────────────────────
     **The bid's primary machine** — `Bid.equipmentId`, which is what the supplier committed and what
     the deal room is about — is selected as soon as the fleet answers, falling back to the first
     confirmed machine only when it is absent from the response (`landingSelectionId`).

     **No detail opens.** The renter is oriented, not navigated: `detailId` is untouched here, and the
     only visible effects are the card accent, the lifted marker with its halo and in-offer tag, and a
     finite attention cue. Once per bid — `landedForBid` is what stops a fleet refetch from re-selecting
     over a choice the renter has since made, and from firing the pulse a second time. */
  useEffect(() => {
    if (!bid || !fleet) return;
    if (landedForBid.current === bid.id) return;
    landedForBid.current = bid.id;
    const id = landingSelectionId(bid.equipment?.id, listed);
    // Null is a real answer: nothing primary and nothing confirmed → nothing is selected, because an
    // accent and a nine-second pulse on an arbitrary card read as a recommendation.
    if (!id) return;
    setSelectedMachineId((cur) => nextSelection(cur, { kind: "land", id }));
    setCueId(id);
    onSelectMachine?.(id);
    // `onSelectMachine` is the parent's callback; re-running on its identity would re-land.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bid, fleet, listed]);

  // The cue is FINITE (AC-35). The keyframes stop themselves after six iterations; this is what takes
  // the class back off, so the animation cannot be restarted by an unrelated re-render.
  useEffect(() => {
    if (!cueId) return;
    const timer = window.setTimeout(() => setCueId(null), LANDING_CUE_MS);
    return () => window.clearTimeout(timer);
  }, [cueId]);

  /* ── V12 · compose → review → send (RM3-AC-17, owner 2026-08-10) ───────────────────────────────
     Every ask on this surface goes through this ONE seam, and what it does changed on 2026-08-10:
     pressing an ask control used to POST immediately, which meant it also created the deal room
     immediately. There was no review step at all, and RM3-AC-17 asks for one.

     Now a press STAGES the ask. The dock puts it in the conversation as a draft card, and only
     «أرسل الطلب» writes — so a renter who composed and thought better of it has created nothing, and
     the supplier's offered count is not frozen by a question that was never asked (004a §4.5).

     The transition itself is `renteeDraftStep`, a pure model: composing never sends, cancelling never
     sends, and a confirm yields the payload exactly once because it clears the staged ask in the same
     step that hands it over. The state it moves is declared with the panel's other state above. */
  const composeDraft = useCallback(
    (draft: RenteeRequestDraft | null) => {
      // Null is an ask the backend would refuse — an availability ask naming no machine. The composer
      // is the one authority on that, so nothing is staged and no error is invented. `outstanding` is
      // the one-ask guard held at the seam as well as on each control: a control can be stale, this
      // cannot.
      const step = renteeDraftStep({ pending: pendingRef.current }, { type: "compose", draft, outstanding: outstandingAsks });
      stage(step.state.pending);
    },
    [outstandingAsks, stage],
  );

  /** «إلغاء». Nothing was written, so there is nothing to undo — that is the point of the review step. */
  const cancelDraft = useCallback(() => {
    stage(renteeDraftStep({ pending: pendingRef.current }, { type: "cancel" }).state.pending);
  }, [stage]);

  /** «أرسل الطلب» — the one act on this surface that writes: create-or-fetch the room, post the card,
   *  and only then tell a listener it happened. One seam means one place that can create a room and
   *  one place that reports a failure — `sender.error` below is the whole of that reporting. */
  const confirmDraft = useCallback(() => {
    const step = renteeDraftStep({ pending: pendingRef.current }, { type: "confirm" });
    stage(step.state.pending);
    const draft = step.send;
    if (!draft) return;
    void sender.send(draft).then((ok) => {
      // NOT restored on failure. The panel states a failed send in words (`sender.error` below), and
      // putting the card back would leave a live «أرسل الطلب» beside a 409 that will refuse it again.
      if (!ok) return;
      // The card is in the conversation, so this question is now with the lessor and the control
      // that sent it must stop offering to send it again. Recorded here rather than by each
      // control, so all four are acknowledged by the one act that put a card in the room.
      noteOutstanding(askIdentity(draft));
      onRequestSent?.(draft, sender.lastRef);
    });
  }, [sender, onRequestSent, noteOutstanding, stage]);

  /* ── the asks, as ONE handler ───────────────────────────────────────────────────────────────────
     V7/V8 describe an ask in their own vocabulary (`PanelRequestDraft`); the wire wants
     `RenteeRequestDraft`, where the scope is derived from the id rather than passed beside it. One
     translation, here, so no component can compose a scope/id pair the backend refuses.

     V9's company panel no longer arrives here at all: a document request names a machine, so the
     firm's papers are read and opened rather than asked for (product owner, 2026-08-08). */
  const panelDraftToWire = useCallback(
    (draft: PanelRequestDraft): RenteeRequestDraft | null =>
      draft.kind === "document"
        ? composeDocumentRequest(draft.equipmentId, draft.docTypes)
        : composeMachineRequest(draft.kind, draft.equipmentId),
    [],
  );

  const sendPanelRequest = useCallback(
    (draft: PanelRequestDraft) => composeDraft(panelDraftToWire(draft)),
    [composeDraft, panelDraftToWire],
  );

  /** The same translation read for the other verb. A panel control asks whether its ask is already out
   *  through the SAME composer that would have sent it — including `canonicalDocType`, so a row the
   *  surface spells `TUV` and a card carrying `tuv_cert` are recognised as one paper. Two spellings of
   *  the translation is how a control ends up disabled for an ask that was never sent, or live for one
   *  that was. */
  const panelAskPending = useCallback(
    (draft: PanelRequestDraft) => askPending(panelDraftToWire(draft)),
    [askPending, panelDraftToWire],
  );

  /** The detail's machine, re-read from the CURRENT list on every render (AC-18) — nothing about a
   *  machine is held in this component's state except its id. A refetch that changes its availability
   *  changes the chip under the renter's eyes rather than leaving a stale copy open. */
  const detailMachine = detailId ? listed.find((m) => m.equipmentId === detailId) ?? null : null;

  /* ── A request card is a way INTO the machine it names (owner, 2026-08-10) ─────────────────────
     His reason, in his words: the supplier reading the ask has to "quickly go to equipment and add its
     doc or confirm it". So pressing the card selects that machine and opens its detail — the same two
     acts the list's own card performs, deliberately, so arriving from the chat leaves the surface in
     exactly the state arriving from the list does.

     A machine hidden by a FILTER is still opened, and the filters are cleared to do it: the renter
     pressed a specific machine by name, and honouring a chip he set for the list by silently doing
     nothing would be the worst of both. */
  const canOpenMachineFromChat = useCallback(
    // `listed`, not the fleet: the detail resolves from the offered set, so a machine the offer does
    // not name has nothing to open and its card must not claim otherwise.
    (equipmentId: string) => listed.some((m) => m.equipmentId === equipmentId),
    [listed],
  );

  const openMachineFromChat = useCallback(
    (equipmentId: string) => {
      if (!canOpenMachineFromChat(equipmentId)) return;
      setFilterIds((prev) => (prev.length > 0 ? [] : prev));
      // …and then the SAME open the map and the list perform. Clearing the filters is the one thing
      // that is this entrance's own — the renter pressed a machine by name from a conversation, and
      // honouring a chip he set for the list by silently doing nothing would be the worst of both.
      openMachine(equipmentId);
    },
    [canOpenMachineFromChat, openMachine],
  );

  /**
   * **Read this firm's papers** — the chat dock's kebab entry (owner, 2026-08-19).
   *
   * A named intention of this surface's own, exactly as `openMachineFromChat` is, and for the same
   * reason: the dock must never hold a setter of the panel's state. It reports that the renter asked
   * for the company's documents; this surface decides that the answer is V9's panel.
   *
   * The deal room's «Company details» arrives at the same panel by another road — `?company=1` on this
   * route — so a firm's papers are one surface however the renter got to them.
   */
  const openCompanyDocsFromChat = useCallback(() => {
    setCompanyOpen(true);
    onOpenCompanyDocs?.();
  }, [onOpenCompanyDocs]);

  /** Bilingual literal for V7/V8/V9, which take copy as a prop rather than reaching for the
   *  dictionary — the pattern that directory already ships. */
  const L = (en: string, arText: string) => (ar ? arText : en);

  /** The company's papers as V9 needs them (V15). The REAL read when it has answered — five rows with
   *  presigned urls and expiry dates, which is what makes AC-69's view/download reachable at all — and
   *  `bid.compliance` as the fallback for what presence booleans can honestly say while it has not.
   *  The choice itself lives in `companyPanelSource`, so it is unit-testable without a component
   *  harness; this host only supplies the two inputs. */
  const companySource = useMemo(
    () => companyPanelSource(selectedBidId ? companyDocsByBid[selectedBidId] ?? null : null, bid),
    [companyDocsByBid, selectedBidId, bid],
  );

  /* ── V3 · the counts ───────────────────────────────────────────────────────────────────────────
     Computed ONLY once the fleet has arrived. Three numbers, one derivation (`unitCounts`):
       · owned      — the fleet response's row count, already filtered to machines that FIT this
                      request (004a §4.1), which is why the copy says «لدى المورد» and never «lessor's
                      fleet»;
       · registered — `inBid === true` rows only (004a §4.2);
       · claimed    — `offered − registered`, clamped at 0 (RM3-AC-31).
     `offered` is the OFFER's count, never `agreedUnits` and never `lastProposedRentalUnits`: the
     footer prices on what was agreed, these pills describe what was offered (RM3-AC-65/67). */
  const counts = bid && fleet ? unitCounts(bid, fleet) : null;
  const kase = counts ? countCase(counts) : null;
  /** V4's alert, or null. It carries the DIFFERENCE and not the offered total (RM3-AC-05), and its
   *  own orange (RM3-AC-06) — both decided in the model, so neither is re-derived at the render. */
  const shortfall = counts ? shortfallAlert(counts) : null;

  // NO "does the offer match" derivation here, deliberately (owner, 2026-08-11). Whether Accept is
  // available is the DEAL ROOM's rule — `termsMatched && priceMatches && unitsMatch`
  // (`DealRoom.tsx:567`) — and a second rule computed off the match grid would be a different question
  // wearing the same word. The footer gates on that rule instead; see `PriceFooter`.

  /** The alert's «اطلب إضافتها» and the list-foot's «اطلب معدّة أخرى» are the SAME ask reached from two
   *  places — an `alternative` naming no machine — so one outstanding card silences both. That was
   *  already true of the `shortfallSent` flag this replaces; what is new is that it is also true of an
   *  ask made in an earlier session, which a flag could never know about. */
  const shortfallPending = askPending(composeShortfallRequest());

  /** The type word, from the REQUEST's taxonomy — `item` is `request.equipmentItems[0]` and a fleet
   *  row cannot satisfy `RequestTypeSource` — and agreeing in number with the count (RM3-AC-08). */
  const typeWord = (n: number): string => {
    const word = requestTypeWord(item, n);
    return ar ? word.ar : word.en;
  };
  /** The bare numeral, in the reader's digits. */
  const num = (n: number): string => (ar ? arabicIndicDigits(n) : String(n));

  /**
   * One count pill: the NUMBER, then the label saying which count it is (§6.2, decoded 3763–3766).
   *
   * Two spans rather than one interpolated sentence, because the number is the thing being read and
   * has to carry the weight — a run-on line made both numbers invisible, which is why §6.2 asked for
   * pills at all. The dictionary keeps ONE key per pill and the template is split on `{n}`, so word
   * order stays the translator's; a locale that moved `{n}` off the front would read oddly but would
   * not break. The numeral is `dir="ltr"`: an Arabic-Indic figure inside an RTL run still reads left
   * to right.
   */
  const countPill = (template: string, n: number, vars: Record<string, string> = {}) => (
    <span className="bm-pill">
      <span className="bm-pill-n" dir="ltr">{num(n)}</span>
      <span className="bm-pill-l">{fmt(template.split("{n}").join("").trim(), vars)}</span>
    </span>
  );

  /* ── what the map is NOT showing, in words ─────────────────────────────────────────────────────
     Every one of these is a case where drawing nothing is correct and silence is not: an empty map
     otherwise reads as "this lessor has no machines", which is a claim the data does not support.
     The claimed-unit case is deliberately ABSENT — §6.3 makes the shortfall alert the only place
     claimed units exist in the UI, and a second statement of it on the canvas would be two. */
  const info: { title: string; sub: string } | null = (() => {
    if (!bid) return null;
    if (offPlatform) return { title: t.bidMap.offPlatformNoPins, sub: t.bidMap.offPlatformNoPinsWhy };
    if (loadingBidId === selectedBidId) return null;
    if (fleetFailed) return { title: t.bidMap.fleetFailed, sub: t.bidMap.fleetFailedWhy };
    // Only when there ARE offered machines and none of them can be drawn. A supplier who registered
    // none at all is a different statement, and the list makes it once (RM3-AC-26).
    //
    // Measured on the UNFILTERED list on purpose: this sentence is about the lessor never sharing a
    // yard, and a chip that happens to hide every plottable machine must not be able to say it. A
    // filter that empties the map is stated once, beside the chips that did it (RM3-AC-28e).
    if (fleet && listed.length > 0 && listed.filter((m) => isPlottable(m)).length === 0)
      return { title: t.bidMap.noLocatable, sub: t.bidMap.noLocatableWhy };
    return null;
  })();

  // ── The panel's width, and why it is draggable at all ─────────────────────────────────────────
  // §5 makes the panel a FIXED 392 px and says why: "the map gives up space, never the panel, because
  // a panel that narrows re-wraps the count pills and the equipment cards at every viewport." That
  // still holds — 392 is the floor here, and the default, so nothing re-wraps unless the renter asks
  // for it. What the renter can do is give the panel MORE, which the rule never forbade: a long firm
  // name, an Arabic manufacturer + model at 35 characters, a document list read beside the map.
  //
  // The ceiling is the same 62% the stylesheet already capped it at, so a drag can never leave the map
  // narrower than the panel it is being compared against.
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [panelW, setPanelW] = useState<number | null>(null);
  const dragRef = useRef<{ x: number; w: number } | null>(null);

  const clampW = useCallback((w: number) => {
    const host = rootRef.current?.clientWidth ?? 0;
    const max = host > 0 ? Math.round(host * 0.62) : PANEL_MIN_W;
    return Math.max(PANEL_MIN_W, Math.min(w, Math.max(PANEL_MIN_W, max)));
  }, []);

  const onResizeDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const from = (e.currentTarget.parentElement as HTMLElement | null)?.getBoundingClientRect().width ?? PANEL_MIN_W;
      dragRef.current = { x: e.clientX, w: from };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [],
  );

  const onResizeMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const d = dragRef.current;
      if (!d) return;
      // The panel is on the INLINE-START edge, so which way widens it flips with the locale: dragging
      // away from that edge is rightwards in English and leftwards in Arabic.
      const dx = (e.clientX - d.x) * (ar ? -1 : 1);
      setPanelW(clampW(d.w + dx));
    },
    [ar, clampW],
  );

  const onResizeUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }, []);

  // Keyboard: a drag handle nobody can reach without a pointer is not an affordance, it is a mouse
  // feature. Arrows nudge by 24 px, Home restores the 392 px the surface is specified at.
  const onResizeKey = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const grow = ar ? "ArrowLeft" : "ArrowRight";
      const shrink = ar ? "ArrowRight" : "ArrowLeft";
      const cur = (e.currentTarget.parentElement as HTMLElement | null)?.getBoundingClientRect().width ?? PANEL_MIN_W;
      if (e.key === grow) setPanelW(clampW(cur + 24));
      else if (e.key === shrink) setPanelW(clampW(cur - 24));
      else if (e.key === "Home") setPanelW(null);
      else return;
      e.preventDefault();
    },
    [ar, clampW],
  );

  return (
    // No `dir` here: the shell's direction is the locale's, and every offset in `map-proto.css` is a
    // logical property, so the panel lands on the inline-start edge in both (AC-30, AC-98).
    <div {...pin("bid-map-workspace")} className="bidmap" ref={rootRef} style={panelW == null ? undefined : ({ "--bm-panel-w": `${panelW}px` } as CSSProperties)}>
      <div {...pin("bidmap-canvas")} className="bm-canvas">
        <MapCanvas
          site={site}
          addressLabel={request?.projectAddressLabel ?? null}
          machines={machines}
          selectedMachineId={selectedMachineId}
          focus={focus}
          onOpenMachine={openMachine}
          itemImageUrl={itemImageUrl}
          itemName={itemName}
        />
        {/* The canvas still renders without a project location — it simply says so, and the panel's
            distances read «—» rather than 0 (AC-21). */}
        {!site && <div className="bm-nosite">{t.bidMap.noSiteLocation}</div>}

        {loadingBidId === selectedBidId && selectedBidId != null && (
          <div className="bm-mapbusy">
            <span className="bm-spin" />
            {t.bidMap.loadingFleet}
          </div>
        )}

        {info && (
          <div className="bm-info">
            <div className="bm-info-t">{info.title}</div>
            <div className="bm-info-s">{info.sub}</div>
          </div>
        )}
      </div>

      {/* ── V2 · the panel ─────────────────────────────────────────────────────────────────────────
          Fixed width, in flow beside the map rather than floating over it (§5). Its DOM position is
          what puts it on the inline-end edge — the same edge the prototype's `left: 18px` lands on in
          Arabic — and it mirrors with the reading direction instead of trading places with the map. */}
      <aside {...pin("bidmap-panel")} className="bm-panel">
        {/* The grip lives on the panel's map-facing edge and is invisible until the pointer is on it —
            the surface already carries a lot of furniture and a permanent handle would be one more
            thing to read. `role="separator"` with the width on `aria-valuenow` is what makes it a
            control rather than a div that happens to respond to drags. */}
        <div
          className="bm-resize"
          role="separator"
          aria-orientation="vertical"
          aria-label={t.bidMap.resizePanel}
          aria-valuemin={PANEL_MIN_W}
          aria-valuenow={Math.round(panelW ?? PANEL_MIN_W)}
          tabIndex={0}
          onPointerDown={onResizeDown}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeUp}
          onPointerCancel={onResizeUp}
          onKeyDown={onResizeKey}
          onDoubleClick={() => setPanelW(null)}
          title={t.bidMap.resizePanel}
        >
          <span className="bm-resize-grip" aria-hidden="true" />
        </div>
        {bid && detailMachine ? (
          // ── V7 · the equipment detail — «replaces the panel with that machine» (§6.5, AC-36). The
          // WHOLE panel, not the list alone: a hero photo, two tabs, the availability line and the
          // six-cell match grid are a column, and squeezing them under the header and the count pills
          // would leave the grid as a scrolling stub. It carries its own back control, and
          // `EquipmentDocuments` is already wired inside it as the second tab.
          <div className="bm-takeover">
            <EquipmentDetail
              machine={detailMachine}
              request={bid}
              ar={ar}
              L={L}
              onBack={() => {
                setDetailId(null);
                // The arrival is spent. The next machine opened is opened on the machine tab.
                setOpenedForDocuments(false);
              }}
              onRequest={sendPanelRequest}
              askPending={panelAskPending}
              initialTab={openedForDocuments ? "documents" : undefined}
            />
          </div>
        ) : bid ? (
          <>
            {/* Header: identity, not a profile. Company name · a verified chip ONLY when verified · an
                entry to the company's documents. Contact details, deals count, IBAN, CR and VAT are
                deliberately absent — they live in the company panel (V9), and a header that lists
                credentials invites judging the supplier before reading his machines (RM3-AC-02). */}
            <header className="bm-head">
              {/* The prototype's 64px identity band — one geometry across the equipment, company and
                  chat panels (`rEquipPanel` 2616), with the gradient and the single sheen on open. */}
              <div className="bm-head-id">
                {/* ONE row, the prototype's (2626): the name and its tick take `flex: 1`, and the way
                    into the company file is an explicit control on the TRAILING edge — its own comment
                    says "not the name itself". It was a full-width button on a second row here, which
                    made the identity block two storeys tall and the entry look like a menu item. */}
                <div className="bm-head-row">
                  <span className="bm-head-name">
                    <span className="bm-title" title={bid.supplierName}>{bid.supplierName}</span>
                    {/* The chip's label is short so the supplier's NAME survives the 392px row
                        (`en.ts`, owner 2026-08-19); the full sentence rides on `title`, where the
                        width costs nothing. The prototype's chip carries the same phrase there. */}
                    {bid.verified && (
                      <span className="bm-verified" title={t.bidMap.verifiedCompanyWhy}>
                        {/* ~~A bare stroked check at 11px, in the chip's own ink (`rVerifiedChip`,
                            prototype 4056).~~ The house mark (owner, 2026-09-02): one badge wherever
                            something is vetted, so the chip here and the chip on a supplier's profile
                            are the same claim in the same shape. It brings its own green rather than
                            taking the chip's, which is what makes it recognisable on any ground. */}
                        <VerifiedMark size={12} />
                        {t.bidMap.verifiedCompany}
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    className="bm-docsentry"
                    onClick={() => {
                      setCompanyOpen(true);
                      onOpenCompanyDocs?.();
                    }}
                  >
                    {t.bidMap.companyDocuments}
                    {/* A bare chevron, as the prototype draws it — no folder glyph. It points the way
                        the reader travels, so it flips with the locale rather than being mirrored by a
                        transform that would also mirror its weight. */}
                    <span className="bm-docsentry-chev" aria-hidden="true">{ar ? "‹" : "›"}</span>
                  </button>
                </div>
              </div>

              {/* ── The other offers on this request (owner, 2026-09-04) ───────────────────────────
                  *"Show other bids on the equipment request he is checking, so he navigates to other
                  suppliers' equipment maps through it instead of going back and forth between the map
                  and the bid cards in the requests."*

                  A ROW OF SUPPLIERS under the one whose yard is on screen, and pressing one loads
                  that supplier's map. It belongs in the identity band because that band is the
                  answer to "whose machines am I looking at" — the strip is the same question with
                  the other answers beside it.

                  Names alone, no prices: this is a way to travel, not a comparison, and the
                  comparison already exists one screen back with every figure on it. The current
                  supplier is in the row and marked rather than removed from it — a row that dropped
                  him would renumber itself under his feet each time he moved.

                  Nothing renders with fewer than two offers: a strip listing only the supplier named
                  directly above it is furniture. */}
              {siblings.length > 1 && (
                <div className="bm-sibs" role="tablist" aria-label={t.bidMap.otherBids}>
                  <span className="bm-sibs-l">{t.bidMap.otherBids}</span>
                  <div className="bm-sibs-row">
                    {siblings.map((sb) => {
                      const here = sb.bidId === bid.id;
                      return (
                        <button
                          key={sb.bidId}
                          type="button"
                          role="tab"
                          aria-selected={here}
                          className={`bm-sib${here ? " on" : ""}`}
                          title={sb.supplierName}
                          // The one being read is not a link to itself: pressing it would refetch the
                          // bid and the fleet and land the renter exactly where he stands.
                          onClick={() => { if (!here) router.push(`/bids/${encodeURIComponent(sb.bidId)}/equipment`); }}
                        >
                          <span className="bm-sib-av">
                            {sb.supplierLogoUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={sb.supplierLogoUrl} alt="" />
                            ) : (
                              sb.supplierName.trim().slice(0, 1).toUpperCase()
                            )}
                          </span>
                          <span className="bm-sib-n">{sb.supplierName}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </header>

            {/* ── V3 · the count pills ───────────────────────────────────────────────────────────
                Pills, not a sentence: a run-on line made both numbers invisible (§6.2). Nothing
                renders until the fleet has answered — a pill built on a failed or pending fetch would
                claim a number the surface does not have. */}
            {counts && (
              <div className="bm-counts">
                {countPill(t.bidMap.countOwned, counts.owned, { type: typeWord(counts.owned) })}
                {/* The offer pill is the multi-unit comparison: owned ≠ offered, and both are shown
                    because the comparison IS the point (§6.2). A single-unit offer renders the owned
                    pill alone (RM3-AC-03).

                    It is the SAME white pill as the one beside it. It used to be blue; colouring one
                    of a matched pair makes it the answer and the other the footnote, which is the
                    opposite of what a comparison is for — `map-proto.css` carries the full note. */}
                {kase !== "single" && countPill(t.bidMap.countInOffer, counts.offered)}
              </div>
            )}

            {/* ── V4 · the shortfall alert ───────────────────────────────────────────────────────
                Renders on `short` and on nothing else, so its absence reliably means nothing is
                claimed (RM3-AC-05). ORANGE, never red: on this surface red means availability only,
                and a shortfall is an incomplete offer, not an unavailable machine (RM3-AC-06). It
                states the DIFFERENCE — not the offered total — and the consequence: those units are
                not on the map.

                ONE SENTENCE AND A BUTTON, as the prototype draws it (decoded 3775–3784). The glyph,
                the bold heading and the grey paragraph that were here until 2026-08-11 made a
                three-part notice out of a fact that fits on one line, and the paragraph only
                unpacked the consequence the sentence already carries. */}
            {shortfall && (
              <div className="bm-short" role="status">
                <div className="bm-short-body">
                  <div className="bm-short-t">
                    {/* `shortfall.claimed` — the DIFFERENCE. `counts.offered` is the sentence's one
                        plausible wrong number and is not reachable from this model at all. */}
                    {fmt(t.bidMap.shortfall, { n: ar ? unitCountLabel(shortfall.claimed) : `${shortfall.claimed}` })}
                  </div>
                  {/* The reason the control beside this is inert, IN WORDS. A disabled button whose
                      label merely changed to «تم الطلب» leaves the renter guessing whether the ask
                      failed or the surface is broken; the rule is that his question is already with
                      the lessor, and that is a sentence, not a state on a button. */}
                  {shortfallPending && <div className="bm-short-s">{t.bidMap.askPendingWhy}</div>}
                </div>
                <button
                  type="button"
                  className="bm-short-act"
                  // The composer is the whole of this action's contract: an `alternative` card with a
                  // NULL `equipmentId` — there is no machine to name — which the backend pairs with
                  // `scope: "company"`. `add_to_offer` is retired and rejected server-side, and is
                  // unreachable from here by construction (RM3-AC-07).
                  //
                  // This control COMPOSES; it does not send. The draft card lands in the chat and
                  // «أرسل الطلب» is what writes — which is also what creates the deal room when the
                  // bid has none (004a §4.5), so opening the surface and pressing this both still
                  // leave the supplier's offered count unfrozen.
                  //
                  // Routed through the ONE seam like every other ask, so the acknowledgement that
                  // used to be this control's own `shortfallSent` flag is now the thing all four
                  // asks share: a card in the room means the question is out.
                  onClick={() => composeDraft(composeShortfallRequest())}
                  disabled={sender.busy || shortfallPending}
                  title={shortfallPending ? t.bidMap.askPendingWhy : undefined}
                >
                  {sender.busy ? t.bidMap.shortfallSending : shortfallPending ? t.bidMap.shortfallSent : t.bidMap.shortfallAction}
                </button>
              </div>
            )}

            {/* ── A failed ask is stated; the RULE is not a failure (owner, 2026-08-11) ──────────
                Two different things went through one red `role="alert"` box, and the owner saw the
                wrong one on staging. The 409 `already_pending` is the guard WORKING — his own "one
                ask, one card" arriving from the other side — and a red banner made the rule read as a
                defect he had caused. His ruling: the control adopts the blocked state and says the
                question is already with the supplier, **never a failure banner**.

                The control has already adopted it by the time this renders: `alreadyPendingAsk` is
                merged into `outstandingAsks` above, which is the same set a control read out of the
                conversation would have used, so the button beside this row is already inert and
                already says why. This row is only the sentence — quiet, and a `status` rather than an
                `alert`, because nothing here has gone wrong and nothing here says try again.

                A genuine failure keeps the red box and keeps `role="alert"`: the renter must not be
                left believing a question reached the supplier when it did not. */}
            {sender.error === "already_pending" ? (
              <div className="bm-sendnote" role="status">{t.bidMap.requestAlreadyPending}</div>
            ) : sender.error ? (
              <div className="bm-sendfail" role="alert">
                {sender.error === "invalid" ? t.bidMap.requestInvalid : t.bidMap.requestFailed}
              </div>
            ) : null}

            {/* ── V5 · the equipment list ────────────────────────────────────────────────────────
                The only part of the column that scrolls, so the counts and the shortfall stay in view
                while the renter reads the machines they describe. It renders nothing until the fleet
                has answered: an empty list before the response would read as «no machines», which is a
                claim. The price footer (V12) closes the column below it. */}
            <div className="bm-body" ref={bodyRef}>
              {fleet && (
                <EquipmentList
                  view={view}
                  request={bid}
                  filterIds={filterIds}
                  onToggleFilter={(id) =>
                    setFilterIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
                  }
                  onClearFilters={() => setFilterIds([])}
                  selectedId={selectedMachineId}
                  cueId={cueId}
                  // The SAME opener the map's markers press (owner, 2026-08-11). It was an inline
                  // handler here, spelling out what `openMachine` above now spells once — and a rule
                  // written twice is how a card and a marker start doing different things.
                  onOpenDetail={openMachine}
                  onFocusMachine={focusMachine}
                  // V11 landed the send path; V12 put a review card in front of it. `composeDraft` is
                  // the ONE seam every ask on this surface goes through — the shortfall, the card,
                  // the detail and both document surfaces — so there is exactly one place that stages
                  // an ask, one that creates the room, and one that reports a failure.
                  onAskAvailability={(m) => composeDraft(composeMachineRequest("availability", m.equipmentId))}
                  // …and the same composer read for the other verb: a card whose «اطلب التأكيد» is
                  // already out shows it as asked instead of offering to ask again (owner, 2026-08-10).
                  askPending={(m) => askPending(composeMachineRequest("availability", m.equipmentId))}
                  onToggleShowAll={() => setShowAllEquipment((v) => !v)}
                  scrollRef={bodyRef}
                />
              )}

              {/* The list-foot ask (§6.4, decoded 2643–2649). It closes the list with the one thing a
                  renter who has read every machine and still wants a different one can do — and it is
                  the ONLY control here that is not about a machine on screen, which is why it is
                  dashed and sits after the cards rather than among them.

                  Same composer as the shortfall alert's «اطلب إضافتها»: an `alternative` card with a
                  null `equipmentId`, which the backend pairs with `scope: "company"`. The two are the
                  same ask reached from two places — the alert is shown only when units are claimed,
                  this is always available — so they share one acknowledgement rather than letting the
                  renter send it twice from two controls that look unrelated. */}
              {fleet && (
                <button
                  type="button"
                  className="bm-eqask"
                  onClick={() => composeDraft(composeShortfallRequest())}
                  disabled={sender.busy || shortfallPending}
                  title={shortfallPending ? t.bidMap.askPendingWhy : undefined}
                >
                  {shortfallPending
                    ? t.bidMap.eqAskAnotherSent
                    : fmt(t.bidMap.eqAskAnother, { type: typeWord(1) })}
                </button>
              )}
            </div>

            {/* ── V12 · the price footer ─────────────────────────────────────────────────────────
                Figures and a hand-off, NOT a re-host: §6.10's "bar" is a three-page negotiation
                wizard bound to `DealRoom.tsx`'s local state (004a §4a.1). التفاصيل expands this in
                place, taking vertical space from the list above rather than overlaying it — the
                panel is a fixed-width column, so there is nowhere to overlay to. */}
            <PriceFooter bid={bid} durationDays={requestDurationDays} />
          </>
        ) : (
          // No bid resolved yet. The route renders its own not-found/loading states, so this is only
          // the frame's resting look — never a claim about an offer.
          <div className="bm-body" />
        )}

        {/* ── V9 · the company panel ────────────────────────────────────────────────────────────
            It opens OVER the whole panel (§6.1) rather than as a modal: a modal would black out the
            map and the list the renter is deciding between. It positions itself (`.mp-over`), so it is
            a sibling of whatever is underneath rather than a replacement for it — closing it returns
            the renter to exactly the list or detail he left. */}
        {bid && companyOpen && (
          <CompanyPanel
            // Identity from the BID, papers from the read — `companyPanelSource` holds that split, so
            // the panel can never name the firm differently from the header two lines above it.
            companyName={companySource.companyName ?? bid.supplierName}
            verified={companySource.verified}
            docs={companySource.docs}
            ar={ar}
            L={L}
            onBack={() => setCompanyOpen(false)}
          />
        )}
      </aside>

      {/* ── V12 · the chat dock ─────────────────────────────────────────────────────────────────
          Floating, persistent, and the ONLY global action — there is no edge rail (RM3-AC-23). It
          renders over the whole surface rather than inside the panel, because a tab strip inside a
          392px column would truncate every item name. */}
      {bid && !offPlatform && (
        <ChatDock
          bid={bid}
          initialOpen={openChat}
          groupKey={requestGroupKey}
          // The room as the SENDER knows it — the bid's own, or the one the first ask created. The
          // dock otherwise waits for `GET /received-bids` to mention a room that already exists, and
          // waits forever when the anchor bid is off that feed's page: the renter sends an ask and
          // the conversation he was just shown the card in still reads «لا رسائل بعد» (owner's UAT,
          // 2026-08-11).
          dealRoomId={sender.dealRoomId}
          // What the REQUEST asked for, so an `alternative` card in the conversation names the same
          // thing the control that raised it named (owner, 2026-08-11). Singular — one more machine.
          typeWord={item ? typeWord(1) : null}
          // Only the anchor bid's fleet exists on this surface, and that is what a request card's
          // state is derived from (RM3-AC-18). A sibling tab's cards state the ask and claim nothing
          // about the answer.
          fleet={fleet}
          // The kebab's «Company details» raises the panel behind the drawer rather than opening a
          // documents modal of its own (owner, 2026-08-19) — the same surface the deal room now sends
          // the renter to, and the same one the header's «مستندات الشركة ›» opens.
          onOpenCompanyDocs={openCompanyDocsFromChat}
          sendNonce={sender.nonce}
          // The conversation is the only record of these cards, and the dock is the only thing here
          // that reads it — so the outstanding asks travel UP from it. A set of opaque strings and
          // nothing else: it names no machine, moves no selection and opens no detail, so a tab press
          // still changes the conversation and nothing more (RM3-AC-49).
          onOutstandingAsks={setOutstandingAsks}
          // ── The review step (RM3-AC-17) ──
          // The ask the renter has composed, shown as a draft card IN the conversation and sent only
          // on «أرسل الطلب». The dock renders it and reports the two presses; the write stays here,
          // where the one send seam is.
          draft={pendingDraft}
          onConfirmDraft={confirmDraft}
          onCancelDraft={cancelDraft}
          draftBusy={sender.busy}
          // A card names a machine, and pressing it opens that machine — the owner's reason for the
          // card. The predicate travels with the handler because only this component knows which of
          // the fleet's machines the offer actually names, and therefore which have a detail.
          onOpenMachine={openMachineFromChat}
          canOpenMachine={canOpenMachineFromChat}
        />
      )}
    </div>
  );
}
