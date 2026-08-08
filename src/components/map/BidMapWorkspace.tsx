"use client";

/**
 * RMAP V1–V10 — the deal-room equipment-verification surface: a **fixed-width panel with the map
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
 * **Nothing here writes.** No deal room is created by opening, selecting or reading (004a §4.5) — a
 * `DealRoom` row freezes the supplier's offered count, and this surface is a read.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { MachinePin } from "@/components/map/MapCanvas";
import { EquipmentList } from "@/components/map/EquipmentList";
import { CompanyPanel, EquipmentDetail, type CompanyDocInput, type CompanyDocKey, type PanelRequestDraft } from "@/components/map/panel";
import type { BidCard } from "@/lib/contract/bids";
import { fetchBidFleet } from "@/lib/api/client";
import {
  arabicIndicDigits,
  countCase,
  englishTypePlural,
  isPlottable,
  unitAvailability,
  unitCountLabel,
  unitCounts,
} from "@/lib/contract/bid-map";
import { landingSelectionId, offeredMachines } from "@/lib/contract/equipment-list";
import type { FleetMachine } from "@/lib/contract/fleet";
import { composeMachineRequest, composeShortfallRequest, type RenteeRequestDraft } from "@/lib/contract/rentee-request";
import { publicTaxonomyUrl, type RequestRecord } from "@/lib/contract/requests";
import { fmt, useLocale, useT } from "@/lib/i18n";
import "@/components/map/map-proto.css";

/** How long the landing attention cue runs before the card rests — 6 × 1.5s, the `bmCue` keyframes'
 *  own budget plus a beat, so the class leaves the DOM after the animation has already finished
 *  rather than cutting it short (RM3-AC-35). */
const LANDING_CUE_MS = 9_400;

// `leaflet` reaches for `window` at import time, so the canvas is client-only — the same handling
// `MapLocationPicker`/`GoogleMapLocationPicker` need in this repo.
const MapCanvas = dynamic(() => import("@/components/map/MapCanvas"), { ssr: false });

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
   * **All four asks** (§6.7) — the shortfall's «اطلب إضافتها», the card's and the detail's
   * «اطلب تأكيد التوفّر», «اطلب معدّة أخرى», and the batch «اطلب مستنداً» from either document
   * surface. The composed card is handed UP rather than posted here: the POST is
   * `/deal-rooms/{dealRoomId}/requests`, and the send is what creates the room (004a §4.5) — that path
   * lands with the chat dock (V11/V12). Until it does, every ask renders disabled, which shows less
   * rather than claiming an ask was sent.
   */
  onRequest?: (draft: RenteeRequestDraft) => void;
  /** Optional hook for a caller that wants to know the company panel was opened (analytics, a route
   *  change). The panel itself opens here — V9's component is mounted below. */
  onOpenCompanyDocs?: () => void;
}

export function BidMapWorkspace({
  bid,
  request,
  refreshing,
  onSelectMachine,
  onRequest,
  onOpenCompanyDocs,
}: BidMapWorkspaceProps) {
  const t = useT();
  const { locale } = useLocale();
  const ar = locale === "ar";
  /** bidId → its supplier's qualifying fleet. Keyed by BID for the reason in the file header. */
  const [fleetByBid, setFleetByBid] = useState<Record<string, FleetMachine[]>>({});
  const [loadingBidId, setLoadingBidId] = useState<string | null>(null);
  const [fleetFailed, setFleetFailed] = useState(false);
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
  /** The panel's scroller, handed to the list so a selection made on the MAP brings its card into
   *  view (AC-15). */
  const bodyRef = useRef<HTMLDivElement | null>(null);
  /** The bid V6's landing pre-selection has already run for — see the effect below. Declared with the
   *  state it guards, because the effect that RE-ARMS it (on a bid change) runs earlier in this file. */
  const landedForBid = useRef<string | null>(null);

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

  // Invalidate on the falling edge of a bid REFETCH (§7.5.1). A resubmitted bid can name different
  // machines, so a cache that outlived the refetch would keep drawing the previous offer.
  const wasRefreshing = useRef(false);
  useEffect(() => {
    if (wasRefreshing.current && !refreshing) setFleetByBid({});
    wasRefreshing.current = refreshing;
  }, [refreshing]);

  // Switching the bid clears the machine selection (AC-177) — a ring left on a machine belonging to a
  // supplier no longer on the map is the defect this prevents. (The route resolves one bid, so this
  // fires on arrival and on nothing else.) It also re-arms the landing pre-selection and closes both
  // takeovers: a detail left open across a bid change would show one bid's machine over another's
  // counts.
  useEffect(() => {
    setSelectedMachineId(null);
    setCueId(null);
    setDetailId(null);
    setCompanyOpen(false);
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

  /* ── V5 · the list, and V10's pin set derived from it ───────────────────────────────────────────
     `offeredMachines` is the single filter+sort: `inBid === true`, availability not `absent`, nearest
     first (§6.4, AC-09/AC-10). The map then draws the SAME set minus what has no coordinates, so the
     card list and the marker set cannot fall out of step (AC-15) — a machine is on the map only if it
     is in the list, and the one difference is stated: `isPlottable`.

     Only this bid's supplier's machines are ever assembled here (AC-75) — the endpoint is bid-scoped,
     so no other supplier's fleet is even in memory. Claimed units never reach either: the fleet is
     registered machines only, and the shortfall is stated in the panel's alert instead (§6.3). */
  const listed = useMemo(() => (fleet ? offeredMachines(fleet) : []), [fleet]);

  const machines: MachinePin[] = useMemo(
    () =>
      listed
        // AC-19/AC-22: a machine with no usable coordinates is not plotted. `isPlottable` reads
        // coordinates only — never the availability, and never `yardConfirmed`.
        .filter((m) => isPlottable(m))
        .map((m) => ({
          id: m.equipmentId,
          lat: m.lat as number,
          lng: m.lng as number,
          // `absent` cannot reach here — `offeredMachines` already dropped it — and the marker type has
          // no third state, so the fall-through resolves to the one that claims less.
          availability: unitAvailability(m) === "confirmed" ? ("confirmed" as const) : ("unconfirmed" as const),
          distanceKm: typeof m.distanceKm === "number" && Number.isFinite(m.distanceKm) ? m.distanceKm : null,
        })),
    [listed],
  );

  // AC-80 decision 4: the REQUEST ITEM's taxonomy image, falling back to the category image, then a
  // generic icon inside the pin. The taxonomy bucket differs per env, so the URL is rebuilt against
  // the public one exactly as the rest of the app does.
  const itemImageUrl = publicTaxonomyUrl(item?.subtypeImageUrl ?? item?.categoryImageUrl ?? null);
  const itemName = (ar ? item?.subtypeNameAr ?? item?.subtypeName : item?.subtypeName ?? item?.subtypeNameAr) ?? item?.subtypeName ?? null;

  const selectMachine = useCallback(
    (id: string) => {
      // Re-clicking the selected marker deselects it — the only way back to an unselected map.
      const next = selectedMachineId === id ? null : id;
      setSelectedMachineId(next);
      // The renter has acted, so the landing cue has done its job and stops immediately. Waiting out
      // the remaining seconds would pulse a card he has already moved past.
      setCueId(null);
      onSelectMachine?.(next);
    },
    [selectedMachineId, onSelectMachine],
  );

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
    setSelectedMachineId(id);
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

  /* ── the four asks, as ONE handler ──────────────────────────────────────────────────────────────
     V7/V8/V9 describe an ask in their own vocabulary (`PanelRequestDraft`); the wire wants
     `RenteeRequestDraft`, where the scope is derived from the id rather than passed beside it. One
     translation, here, so no component can compose a scope/id pair the backend refuses. */
  const sendPanelRequest = useCallback(
    (draft: PanelRequestDraft) => {
      if (!onRequest) return;
      onRequest(
        draft.kind === "document"
          ? composeMachineRequest("document", draft.equipmentId, draft.docTypes)
          : composeMachineRequest(draft.kind, draft.equipmentId),
      );
    },
    [onRequest],
  );

  /** The detail's machine, re-read from the CURRENT list on every render (AC-18) — nothing about a
   *  machine is held in this component's state except its id. A refetch that changes its availability
   *  changes the chip under the renter's eyes rather than leaving a stale copy open. */
  const detailMachine = detailId ? listed.find((m) => m.equipmentId === detailId) ?? null : null;

  /** Bilingual literal for V7/V8/V9, which take copy as a prop rather than reaching for the
   *  dictionary — the pattern that directory already ships. */
  const L = (en: string, arText: string) => (ar ? arText : en);

  /** The company's papers as V9 needs them, from what the bid already serves (§7 — no new endpoint).
   *  `compliance` is presence only; the panel adds the verification and expiry wording from
   *  `verified`. A key omitted here reads as "no document yet", which is the honest default. */
  const companyDocs: Partial<Record<CompanyDocKey, CompanyDocInput>> = useMemo(() => {
    if (!bid) return {};
    const c = bid.compliance;
    return {
      cr: { present: c.activityLicense },
      // A VAT certificate is reissued every year rather than carrying an expiry date.
      vat: { present: c.taxNumber, renewsAnnually: true },
      national_address: { present: c.nationalAddress },
      local_content: { present: c.localContent },
    };
  }, [bid]);

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

  /** The type word, from the REQUEST's taxonomy and agreeing in number with the count (RM3-AC-08).
   *  English inflects the subtype's head noun; Arabic keeps one literal form, the same product
   *  decision `unitCountLabel` records — the taxonomy stores a single form per node. */
  const typeWord = (n: number): string => {
    const subtype = (ar ? item?.subtypeNameAr ?? item?.subtypeName : item?.subtypeName ?? item?.subtypeNameAr) ?? null;
    const capacity = (ar ? item?.capacityNameAr ?? item?.capacityName : item?.capacityName ?? item?.capacityNameAr) ?? null;
    const head = ar ? subtype ?? "" : englishTypePlural(subtype, n);
    return [head, capacity].filter(Boolean).join(" ").trim();
  };
  /** The bare numeral, in the reader's digits. */
  const num = (n: number): string => (ar ? arabicIndicDigits(n) : String(n));

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
    if (fleet && listed.length > 0 && machines.length === 0) return { title: t.bidMap.noLocatable, sub: t.bidMap.noLocatableWhy };
    return null;
  })();

  return (
    // No `dir` here: the shell's direction is the locale's, and every offset in `map-proto.css` is a
    // logical property, so the panel lands on the inline-end edge in both (AC-30, AC-98).
    <div className="bidmap">
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
              onRequest={onRequest ? sendPanelRequest : undefined}
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
                <span className="bm-pill bm-pill-owned">
                  {fmt(t.bidMap.countOwned, { n: num(counts.owned), type: typeWord(counts.owned) })}
                </span>
                {/* The offer pill is the multi-unit comparison: owned ≠ offered, and both are shown
                    because the comparison IS the point (§6.2). A single-unit offer renders the owned
                    pill alone (RM3-AC-03). */}
                {kase !== "single" && (
                  <span className="bm-pill bm-pill-offer">{fmt(t.bidMap.countInOffer, { n: num(counts.offered) })}</span>
                )}
              </div>
            )}

            {/* ── V4 · the shortfall alert ───────────────────────────────────────────────────────
                Renders on `short` and on nothing else, so its absence reliably means nothing is
                claimed (RM3-AC-05). ORANGE, never red: on this surface red means availability only,
                and a shortfall is an incomplete offer, not an unavailable machine (RM3-AC-06). It
                states the DIFFERENCE — not the offered total — and the consequence: those units are
                not on the map, because a claimed unit has no location, no documents and no serial. */}
            {counts && kase === "short" && (
              <div className="bm-short" role="status">
                <span className="bm-short-ic material-icons-outlined">error_outline</span>
                <div className="bm-short-body">
                  <div className="bm-short-t">
                    {fmt(t.bidMap.shortfall, { n: ar ? unitCountLabel(counts.claimed) : `${counts.claimed}` })}
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
                  onClick={() => onRequest?.(composeShortfallRequest())}
                  disabled={!onRequest}
                >
                  {t.bidMap.shortfallAction}
                </button>
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
                  machines={listed}
                  selectedId={selectedMachineId}
                  cueId={cueId}
                  onSelect={selectMachine}
                  onOpenDetail={(id) => {
                    // Opening a detail also focuses that machine, so coming back out leaves the map
                    // where the renter left it rather than on the previous selection.
                    setSelectedMachineId(id);
                    setCueId(null);
                    setDetailId(id);
                    onSelectMachine?.(id);
                  }}
                  onAskAvailability={
                    onRequest ? (m) => onRequest(composeMachineRequest("availability", m.equipmentId)) : undefined
                  }
                  scrollRef={bodyRef}
                />
              )}
            </div>
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
            companyName={bid.supplierName}
            verified={bid.verified === true}
            docs={companyDocs}
            ar={ar}
            L={L}
            onBack={() => setCompanyOpen(false)}
            onRequest={onRequest ? sendPanelRequest : undefined}
          />
        )}
      </aside>
    </div>
  );
}
