"use client";

/**
 * RMAP V1–V12 — the deal-room equipment-verification surface: a **fixed-width panel with the map
 * filling the rest** (spec 004 §5). v2's floating overlay is gone with the offers list it hosted; v3
 * scopes the view to ONE bid, so the panel is a column of that bid's own verification content and the
 * map is what is left over.
 *
 * **The composition owner.** It holds the panel's shell (V2), the counts (V3), the shortfall (V4) and
 * the equipment list (V5), and it mounts V7's detail and V9's company panel as takeovers. It is also
 * the one place a machine list is DERIVED — `offeredMachines(fleet)` — which the map then draws minus
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
import dynamic from "next/dynamic";
import { ChatDock } from "@/components/map/ChatDock";
import type { MachinePin } from "@/components/map/MapCanvas";
import { PriceFooter } from "@/components/map/PriceFooter";
import { useRenteeRequestSender } from "@/components/map/useRenteeRequestSender";
import { EquipmentList } from "@/components/map/EquipmentList";
import { CompanyPanel, EquipmentDetail, type PanelRequestDraft } from "@/components/map/panel";
import type { BidCard } from "@/lib/contract/bids";
import { fetchBidCompanyDocuments, fetchBidFleet } from "@/lib/api/client";
import { companyPanelSource, type CompanyDocsPayload } from "@/lib/contract/company-documents";
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
  offeredMachines,
} from "@/lib/contract/equipment-list";
import type { FleetMachine } from "@/lib/contract/fleet";
import {
  composeDocumentRequest,
  composeMachineRequest,
  composeShortfallRequest,
  type RenteeRequestDraft,
} from "@/lib/contract/rentee-request";
import { publicTaxonomyUrl, type RequestRecord } from "@/lib/contract/requests";
import { fmt, useLocale, useT } from "@/lib/i18n";
import "@/components/map/map-proto.css";

// `leaflet` reaches for `window` at import time, so the canvas is client-only — the same handling
// `MapLocationPicker`/`GoogleMapLocationPicker` need in this repo.
const MapCanvas = dynamic(() => import("@/components/map/MapCanvas"), { ssr: false });

/** §5's fixed panel width, and the FLOOR the resize handle enforces. T41 judges every wrapping check
 *  on this surface at exactly 392 px, so the panel may be widened but never narrowed past it. */
const PANEL_MIN_W = 392;

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
}

export function BidMapWorkspace({
  bid,
  request,
  refreshing,
  onSelectMachine,
  onRequestSent,
  onOpenCompanyDocs,
}: BidMapWorkspaceProps) {
  const t = useT();
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
  /** V9 — the company panel, which takes over the same way. */
  const [companyOpen, setCompanyOpen] = useState(false);
  /**
   * V17 — the pressed filter chips (§6.4a). **Empty on arrival, always**: a renter who cannot see all
   * the machines in an offer cannot tell whether the lessor sent few or a chip is hiding some. It lives
   * HERE rather than in the list because the map filters on the same answer (RM3-AC-28d/AC-15) — one
   * state, one derivation, so the cards and the markers cannot disagree about what the offer contains.
   */
  const [filterIds, setFilterIds] = useState<string[]>([]);
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
  /** Local acknowledgement for the shortfall control only — an ask the renter just made should not
   *  look unasked. It is NOT the card's state: the card in the conversation derives its own on every
   *  render (RM3-AC-18), and this button knows nothing about it. */
  const [shortfallSent, setShortfallSent] = useState(false);

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
        // «٠ لدى المؤجّر», which is the same claim in a pill.
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
     `offeredMachines` is the single filter+sort: `inBid === true`, availability not `absent`, nearest
     first (§6.4, AC-09/AC-10). The map then draws the SAME set minus what has no coordinates, so the
     card list and the marker set cannot fall out of step (AC-15) — a machine is on the map only if it
     is in the list, and the one difference is stated: `isPlottable`.

     Only this bid's supplier's machines are ever assembled here (AC-75) — the endpoint is bid-scoped,
     so no other supplier's fleet is even in memory. Claimed units never reach either: the fleet is
     registered machines only, and the shortfall is stated in the panel's alert instead (§6.3). */
  const listed = useMemo(() => (fleet ? offeredMachines(fleet) : []), [fleet]);

  /* ── V17 · the filters (§6.4a, RM3-AC-28a→28e) ─────────────────────────────────────────────────
     One model call answers all of it: which chips exist (only what the request asked for, and only
     where they would split the list), which machines survive them, and the two figures the count is
     made of. `bid` is passed as the request — a `BidCard` carries the request's asks projected onto
     the bid, which is the same object the match grid is scored against, so a chip and a grid cell can
     never disagree about the same certificate. */
  const view = useMemo(() => equipmentListView(listed, bid, filterIds), [listed, bid, filterIds]);
  const visible = view.machines;

  /* The marker set is `machineMarkers(view.machines)` and nothing else — the FILTERED list minus what
     cannot be drawn (AC-15, AC-21, AC-22). The derivation lives in the model beside the list's own,
     so each marker's availability is the SAME `availabilityView` call the card's chip is built on
     (AC-19): one fact, two renderings, no possible disagreement. `isPlottable` reads coordinates
     only — never the availability, never the filter and never `yardConfirmed`. */
  const machines: MachinePin[] = useMemo(() => machineMarkers(visible), [visible]);

  // AC-80 decision 4: the REQUEST ITEM's taxonomy image, falling back to the category image, then a
  // generic icon inside the pin. The taxonomy bucket differs per env, so the URL is rebuilt against
  // the public one exactly as the rest of the app does.
  const itemImageUrl = publicTaxonomyUrl(item?.subtypeImageUrl ?? item?.categoryImageUrl ?? null);
  const itemName = (ar ? item?.subtypeNameAr ?? item?.subtypeName : item?.subtypeName ?? item?.subtypeNameAr) ?? item?.subtypeName ?? null;

  const selectMachine = useCallback(
    (id: string) => {
      // The ONE selection rule, for both surfaces (AC-15): re-pressing the selected machine deselects
      // it — the only way back to an unselected map — and the value this returns is what reaches
      // `EquipmentList.selectedId` and `MapCanvas.selectedMachineId` alike.
      const next = nextSelection(selectedMachineId, { kind: "press", id });
      setSelectedMachineId(next);
      // The renter has acted, so the landing cue has done its job and stops immediately. Waiting out
      // the remaining seconds would pulse a card he has already moved past.
      setCueId(null);
      onSelectMachine?.(next);
    },
    [selectedMachineId, onSelectMachine],
  );

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

  /** Every ask on this surface goes through here (V11): create-or-fetch the room, post the card, and
   *  only then tell a listener it happened. One seam means one place that can create a room and one
   *  place that reports a failure — `sender.error` below is the whole of that reporting. */
  const sendDraft = useCallback(
    (draft: RenteeRequestDraft | null) => {
      // Null is an ask the backend would refuse — an availability ask naming no machine. The composer
      // is the one authority on that, so nothing is sent and no error is invented.
      if (!draft) return;
      void sender.send(draft).then((ok) => {
        if (ok) onRequestSent?.(draft, sender.lastRef);
      });
    },
    [sender, onRequestSent],
  );

  /* ── the asks, as ONE handler ───────────────────────────────────────────────────────────────────
     V7/V8 describe an ask in their own vocabulary (`PanelRequestDraft`); the wire wants
     `RenteeRequestDraft`, where the scope is derived from the id rather than passed beside it. One
     translation, here, so no component can compose a scope/id pair the backend refuses.

     V9's company panel no longer arrives here at all: a document request names a machine, so the
     firm's papers are read and opened rather than asked for (product owner, 2026-08-08). */
  const sendPanelRequest = useCallback(
    (draft: PanelRequestDraft) => {
      sendDraft(
        draft.kind === "document"
          ? composeDocumentRequest(draft.equipmentId, draft.docTypes)
          : composeMachineRequest(draft.kind, draft.equipmentId),
      );
    },
    [sendDraft],
  );

  /** The detail's machine, re-read from the CURRENT list on every render (AC-18) — nothing about a
   *  machine is held in this component's state except its id. A refetch that changes its availability
   *  changes the chip under the renter's eyes rather than leaving a stale copy open. */
  const detailMachine = detailId ? listed.find((m) => m.equipmentId === detailId) ?? null : null;

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
                      request (004a §4.1), which is why the copy says «لدى المؤجّر» and never «lessor's
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
    <div className="bidmap" ref={rootRef} style={panelW == null ? undefined : ({ "--bm-panel-w": `${panelW}px` } as CSSProperties)}>
      <div className="bm-canvas">
        <MapCanvas
          site={site}
          addressLabel={request?.projectAddressLabel ?? null}
          machines={machines}
          selectedMachineId={selectedMachineId}
          onSelectMachine={selectMachine}
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
      <aside className="bm-panel">
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
              onBack={() => setDetailId(null)}
              onRequest={sendPanelRequest}
            />
          </div>
        ) : bid ? (
          <>
            {/* Header: identity, not a profile. Company name · a verified chip ONLY when verified · an
                entry to the company's documents. Contact details, deals count, IBAN, CR and VAT are
                deliberately absent — they live in the company panel (V9), and a header that lists
                credentials invites judging the supplier before reading his machines (RM3-AC-02). */}
            <header className="bm-head">
              <div className="bm-head-row">
                <span className="bm-title" title={bid.supplierName}>{bid.supplierName}</span>
                {bid.verified && (
                  <span className="bm-verified">
                    <span className="material-icons-outlined">verified</span>
                    {t.bidMap.verifiedCompany}
                  </span>
                )}
              </div>
              <button
                type="button"
                className="bm-docsentry"
                onClick={() => {
                  setCompanyOpen(true);
                  onOpenCompanyDocs?.();
                }}
              >
                <span className="material-icons-outlined">folder_shared</span>
                {t.bidMap.companyDocuments}
                {/* The chevron points the way the reader travels, so it flips with the locale rather
                    than being mirrored by a transform that would also mirror the glyph's weight. */}
                <span className="bm-docsentry-chev material-icons-outlined">{ar ? "chevron_left" : "chevron_right"}</span>
              </button>
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
                not on the map, because a claimed unit has no location, no documents and no serial. */}
            {shortfall && (
              <div className="bm-short" role="status">
                <span className="bm-short-ic material-icons-outlined">error_outline</span>
                <div className="bm-short-body">
                  <div className="bm-short-t">
                    {/* `shortfall.claimed` — the DIFFERENCE. `counts.offered` is the sentence's one
                        plausible wrong number and is not reachable from this model at all. */}
                    {fmt(t.bidMap.shortfall, { n: ar ? unitCountLabel(shortfall.claimed) : `${shortfall.claimed}` })}
                  </div>
                  <div className="bm-short-s">{t.bidMap.claimedNotDrawnWhy}</div>
                </div>
                <button
                  type="button"
                  className="bm-short-act"
                  // The composer is the whole of this action's contract: an `alternative` card with a
                  // NULL `equipmentId` — there is no machine to name — which the backend pairs with
                  // `scope: "company"`. `add_to_offer` is retired and rejected server-side, and is
                  // unreachable from here by construction (RM3-AC-07).
                  //
                  // Sending is ALSO what creates the deal room when the bid has none (004a §4.5) —
                  // which is why this is the one control on the panel that writes, and why opening
                  // the surface still does not.
                  onClick={() => {
                    const draft = composeShortfallRequest();
                    void sender.send(draft).then((ok) => {
                      if (!ok) return;
                      setShortfallSent(true);
                      onRequestSent?.(draft, sender.lastRef);
                    });
                  }}
                  disabled={sender.busy || shortfallSent}
                >
                  {sender.busy ? t.bidMap.shortfallSending : shortfallSent ? t.bidMap.shortfallSent : t.bidMap.shortfallAction}
                </button>
              </div>
            )}

            {/* A failed ask is stated, never swallowed: the renter must not be left believing a
                question reached the lessor when it did not. */}
            {sender.error && (
              <div className="bm-sendfail" role="alert">
                {sender.error === "invalid" ? t.bidMap.requestInvalid : t.bidMap.requestFailed}
              </div>
            )}

            {/* ── V5 · the equipment list ────────────────────────────────────────────────────────
                The only part of the column that scrolls, so the counts and the shortfall stay in view
                while the renter reads the machines they describe. It renders nothing until the fleet
                has answered: an empty list before the response would read as «no machines», which is a
                claim. The price footer (V12) closes the column below it. */}
            <div className="bm-body" ref={bodyRef}>
              {fleet && (
                <EquipmentList
                  view={view}
                  filterIds={filterIds}
                  onToggleFilter={(id) =>
                    setFilterIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
                  }
                  onClearFilters={() => setFilterIds([])}
                  selectedId={selectedMachineId}
                  cueId={cueId}
                  onSelect={selectMachine}
                  onOpenDetail={(id) => {
                    // Opening a detail also focuses that machine, so coming back out leaves the map
                    // where the renter left it rather than on the previous selection. `open`, never
                    // `press`: opening the detail of the ALREADY selected card must not toggle the
                    // selection off underneath the panel it is about to fill.
                    setSelectedMachineId((cur) => nextSelection(cur, { kind: "open", id }));
                    setCueId(null);
                    setDetailId(id);
                    onSelectMachine?.(id);
                  }}
                  // V11 landed the send path, so the card's ask posts for real instead of being
                  // handed up and disabled. `sendDraft` is the ONE seam every ask on this surface
                  // goes through — the shortfall, the card, the detail and both document surfaces —
                  // so there is exactly one place that creates the room and one place that reports
                  // a failure.
                  onAskAvailability={(m) => sendDraft(composeMachineRequest("availability", m.equipmentId))}
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
                  onClick={() => {
                    const draft = composeShortfallRequest();
                    void sender.send(draft).then((ok) => {
                      if (!ok) return;
                      setShortfallSent(true);
                      onRequestSent?.(draft, sender.lastRef);
                    });
                  }}
                  disabled={sender.busy || shortfallSent}
                >
                  {shortfallSent
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
          groupKey={requestGroupKey}
          // Only the anchor bid's fleet exists on this surface, and that is what a request card's
          // state is derived from (RM3-AC-18). A sibling tab's cards state the ask and claim nothing
          // about the answer.
          fleet={fleet}
          sendNonce={sender.nonce}
        />
      )}
    </div>
  );
}
