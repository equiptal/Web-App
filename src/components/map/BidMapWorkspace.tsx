"use client";

/**
 * RMAP V1–V4 — the deal-room equipment-verification surface: a **fixed-width panel with the map
 * filling the rest** (spec 004 §5). v2's floating overlay is gone with the offers list it hosted; v3
 * scopes the view to ONE bid, so the panel is a column of that bid's own verification content and the
 * map is what is left over.
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

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { MachinePin } from "@/components/map/MapCanvas";
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
import { computeUnitReadiness, readinessInputsFor } from "@/lib/contract/bid-readiness";
import type { FleetMachine } from "@/lib/contract/fleet";
import { composeShortfallRequest, type RenteeRequestDraft } from "@/lib/contract/rentee-request";
import { publicTaxonomyUrl, type RequestRecord } from "@/lib/contract/requests";
import { fmt, useLocale, useT } from "@/lib/i18n";
import "@/components/map/map-proto.css";

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
  /** T16 exposes the machine selection upward for the equipment detail (V7), which does not exist yet.
   *  Kept a callback rather than a lifted prop so nothing above has to hold state it cannot yet use. */
  onSelectMachine?: (equipmentId: string | null) => void;
  /** V4's action. The composed card is handed UP rather than posted here: the POST is
   *  `/deal-rooms/{dealRoomId}/requests`, and the send is what creates the room (004a §4.5) — that
   *  path lands with the chat dock (V11/V12). Until it does the action renders disabled, which shows
   *  less rather than claiming an ask was sent. */
  onRequestAlternative?: (draft: RenteeRequestDraft) => void;
  /** V9's company-document panel, which is not built here (a parallel ticket owns `map/panel/`). The
   *  header's entry renders either way; without a handler it is inert rather than absent. */
  onOpenCompanyDocs?: () => void;
}

export function BidMapWorkspace({
  bid,
  request,
  refreshing,
  onSelectMachine,
  onRequestAlternative,
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
  // fires on arrival and on nothing else.)
  useEffect(() => {
    setSelectedMachineId(null);
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

  /* ── pins ──────────────────────────────────────────────────────────────────────────────────────
     Only this bid's supplier's machines are ever assembled here (AC-75) — the endpoint is bid-scoped,
     so no other supplier's fleet is even in memory. Claimed units never reach this list: the fleet is
     registered machines only, and the shortfall is stated in the panel's alert instead (§6.3). */
  const machines: MachinePin[] = useMemo(() => {
    if (!fleet || !bid) return [];
    // The request-side asks. Taken from the BID first, not from `request`: the bid already reads them
    // off its own request item, so they are correct even where `request` is a different projection.
    // The request item is the fallback for a payload that predates those fields.
    // `operatorLicenseLevel` is on the wire but not on the typed `RequestItem`, so it is read
    // defensively rather than added to a shared type this ticket has no reason to widen.
    const itemOperatorLevel = (item as Record<string, unknown> | null)?.operatorLicenseLevel;
    const inputs = readinessInputsFor({
      reqEquipmentCerts: bid.reqEquipmentCerts ?? item?.safetyCertifications ?? null,
      operatorCertReq: bid.operatorCertReq ?? (typeof itemOperatorLevel === "string" ? itemOperatorLevel : null),
      reqMinYear: bid.reqMinYear ?? item?.maxEquipmentAge ?? null,
    });
    return fleet
      // AC-19: a machine with no usable coordinates is not plotted. `isPlottable` reads coordinates
      // only — never the availability, and never `yardConfirmed`.
      .filter((m) => isPlottable(m))
      .map((m) => {
        const availability = unitAvailability(m);
        const readiness = computeUnitReadiness(m, inputs.equipCerts, inputs.operatorCerts, inputs.minYear);
        return {
          id: m.equipmentId,
          lat: m.lat as number,
          lng: m.lng as number,
          // `absent` is unreachable for a plottable machine (it has coordinates, so its level is not
          // `unidentified`), but the pin type has no third state, so it resolves to the safe one.
          availability: availability === "confirmed" ? ("confirmed" as const) : ("unconfirmed" as const),
          inBid: m.inBid,
          band: readiness.band,
          done: readiness.done,
          total: readiness.total,
        };
      });
  }, [fleet, bid, item]);

  // AC-80 decision 4: the REQUEST ITEM's taxonomy image, falling back to the category image, then a
  // generic icon inside the pin. The taxonomy bucket differs per env, so the URL is rebuilt against
  // the public one exactly as the rest of the app does.
  const itemImageUrl = publicTaxonomyUrl(item?.subtypeImageUrl ?? item?.categoryImageUrl ?? null);
  const itemName = (ar ? item?.subtypeNameAr ?? item?.subtypeName : item?.subtypeName ?? item?.subtypeNameAr) ?? item?.subtypeName ?? null;

  const selectMachine = (id: string) => {
    // Re-clicking the selected pin deselects it — the only way back to an unselected map.
    const next = selectedMachineId === id ? null : id;
    setSelectedMachineId(next);
    onSelectMachine?.(next);
  };

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
    if (fleet && machines.length === 0) return { title: t.bidMap.noLocatable, sub: t.bidMap.noLocatableWhy };
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
        {bid ? (
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
                onClick={() => onOpenCompanyDocs?.()}
                disabled={!onOpenCompanyDocs}
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
                  onClick={() => onRequestAlternative?.(composeShortfallRequest())}
                  disabled={!onRequestAlternative}
                >
                  {t.bidMap.shortfallAction}
                </button>
              </div>
            )}

            {/* The panel body. V5–V9 mount here: the equipment list, the landing pre-selection, the
                machine detail, its documents and the company panel — all owned by the `map/panel/`
                ticket, which is why this ticket leaves a slot rather than a placeholder component.
                The price footer (V12) closes the column below it. */}
            <div className="bm-body" />
          </>
        ) : (
          // No bid resolved yet. The route renders its own not-found/loading states, so this is only
          // the frame's resting look — never a claim about an offer.
          <div className="bm-body" />
        )}
      </aside>
    </div>
  );
}
