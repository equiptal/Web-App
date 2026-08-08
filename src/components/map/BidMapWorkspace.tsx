"use client";

/**
 * RMAP T12 + T16 — the map workspace: a full-bleed map with the bid panel floating over it
 * (design.md §1). Not a two-column split; the panel, and later the rail (T33) and the machine panel
 * (T18), all overlay the same canvas so the map is never boxed into a corner.
 *
 * **This component does not fetch BIDS** (decision A4). Bids, the request and the freshness controls
 * all arrive as props from `GroupBids`, which owns every request on this screen — one fetch owner means
 * the refetch triggers of §7.5.1 have exactly one implementation and the list and the map can never
 * disagree about what has arrived.
 *
 * It DOES fetch the selected bid's fleet, because that request has no other owner and no other trigger:
 * it is lazy (nothing loads until a row is selected — a renter who never selects one never pays for
 * ~N fleet calls) and **cached by `bidId`, never by supplier**. One firm can hold several bids on one
 * request (`@@unique([requestId, bidOwnerKey, equipmentId])`), and `inBid`/`yardConfirmed` are
 * relative to ONE bid — a supplier-keyed cache would draw bid A's offer on bid B's map. The cache is
 * dropped when the bids themselves refetch, since a resubmitted bid can change which machines it names.
 *
 * **No item strip.** A multi-item RFQ is scoped by the existing item selector in the controls cluster
 * (AC-22), and a single-item RFQ renders no strip at all (AC-23) — so there is nothing to draw here in
 * either case, and a second item control would be a second source of truth for the same choice.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { MachinePin } from "@/components/map/MapCanvas";
import type { BidCard } from "@/lib/contract/bids";
import { fetchBidFleet } from "@/lib/api/client";
import { isPlottable, unitAvailability, unitCountLabel, unitCounts } from "@/lib/contract/bid-map";
import { computeUnitReadiness, readinessInputsFor } from "@/lib/contract/bid-readiness";
import type { FleetMachine } from "@/lib/contract/fleet";
import { publicTaxonomyUrl, type RequestRecord } from "@/lib/contract/requests";
import { fmt, useLocale, useT } from "@/lib/i18n";
import "@/components/map/map-proto.css";

// `leaflet` reaches for `window` at import time, so the canvas is client-only — the same handling
// `MapLocationPicker`/`GoogleMapLocationPicker` need in this repo.
const MapCanvas = dynamic(() => import("@/components/map/MapCanvas"), { ssr: false });

/** A bid this surface can resolve. v3 scopes the view to exactly ONE of these (spec 004 §4). */
export type MapBid = BidCard & { itemLabel?: string; itemLabelAr?: string };

export interface BidMapWorkspaceProps {
  /** Bids for the active item scope, already filtered by `GroupBids`. */
  bids: MapBid[];
  /** The active item's request record — the only source of the project pin. Null while it loads, or
   *  when the request has no project location at all (AC-21). */
  request: RequestRecord | null;
  /** The bid this surface resolves. v3 scopes the view to exactly one (spec 004 §4 assumption 2); it is
   *  lifted rather than local so an entry point can address the surface by `bidId` (V1). */
  selectedBidId: string | null;
  /** Drives the fleet cache invalidation on the falling edge — see the effect below. */
  refreshing: boolean;
  /** T16 exposes the machine selection upward for the machine panel (V7), which does not exist yet.
   *  Kept a callback rather than a lifted prop so nothing above has to hold state it cannot yet use. */
  onSelectMachine?: (equipmentId: string | null) => void;
}

export function BidMapWorkspace({
  bids,
  request,
  selectedBidId,
  refreshing,
  onSelectMachine,
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

  const selectedBid = useMemo(() => bids.find((b) => b.id === selectedBidId) ?? null, [bids, selectedBidId]);
  // An off-platform submission has no listings, no yards and no coordinates — there is nothing to
  // fetch and nothing that could be plotted (AC-197, §6.13.5). `converted` bids are NOT excluded: a
  // converted submission is a real bid with real registered machines, and only its LABELLING stays
  // off-platform (AC-203).
  const offPlatform = selectedBid?.viaSharedLink === true;

  /* ── fetch: lazy, per bid, once ────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!selectedBidId || offPlatform) return;
    if (fleetByBid[selectedBidId]) return; // cached — a re-selection must not re-request
    let active = true;
    setLoadingBidId(selectedBidId);
    setFleetFailed(false);
    fetchBidFleet(selectedBidId)
      .then((r) => {
        if (!active) return;
        setFleetByBid((prev) => ({ ...prev, [selectedBidId]: r.machines }));
      })
      .catch(() => {
        // A failed fleet fetch must never empty the bid list the renter is reading, and must never be
        // silent either — an empty map would read as "this lessor has no machines", which is a claim.
        if (active) setFleetFailed(true);
      })
      .finally(() => {
        if (active) setLoadingBidId((id) => (id === selectedBidId ? null : id));
      });
    return () => {
      active = false;
    };
  }, [selectedBidId, offPlatform, fleetByBid]);

  // Invalidate on the falling edge of a bids REFETCH (§7.5.1). A resubmitted bid can name different
  // machines, so a cache that outlived the refetch would keep drawing the previous offer. Keyed off
  // `refreshing` rather than off the `bids` array, whose identity changes on every parent render.
  const wasRefreshing = useRef(false);
  useEffect(() => {
    if (wasRefreshing.current && !refreshing) setFleetByBid({});
    wasRefreshing.current = refreshing;
  }, [refreshing]);

  // Switching the bid row clears the machine selection (AC-177) — a ring left on a machine belonging
  // to a supplier no longer on the map is the defect this prevents.
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

  /* ── pins ──────────────────────────────────────────────────────────────────────────────────────
     Only the SELECTED bid's supplier's machines are ever assembled here (AC-75) — the endpoint is
     bid-scoped, so no other supplier's fleet is even in memory. Claimed units never reach this list:
     the fleet is registered machines only, and the shortfall is stated in the info box instead
     (AC-77, §6.2). */
  const machines: MachinePin[] = useMemo(() => {
    if (!fleet || !selectedBid) return [];
    // The request-side asks. Taken from the BID, not from `request`: `mapBid` already reads them off
    // that bid's own request item, so they are correct even when the map is showing a multi-item
    // group where `request` is only the FIRST item's record. The request item is the fallback for a
    // payload that predates those fields.
    const item = request?.equipmentItems?.[0] ?? null;
    // `operatorLicenseLevel` is on the wire but not on the typed `RequestItem`, so it is read
    // defensively rather than added to a shared type this ticket has no reason to widen.
    const itemOperatorLevel = (item as Record<string, unknown> | null)?.operatorLicenseLevel;
    const inputs = readinessInputsFor({
      reqEquipmentCerts: selectedBid.reqEquipmentCerts ?? item?.safetyCertifications ?? null,
      operatorCertReq: selectedBid.operatorCertReq ?? (typeof itemOperatorLevel === "string" ? itemOperatorLevel : null),
      reqMinYear: selectedBid.reqMinYear ?? item?.maxEquipmentAge ?? null,
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
  }, [fleet, selectedBid, request]);

  // AC-80 decision 4: the REQUEST ITEM's taxonomy image, falling back to the category image, then a
  // generic icon inside the pin. The taxonomy bucket differs per env, so the URL is rebuilt against
  // the public one exactly as the rest of the app does.
  const item = request?.equipmentItems?.[0] ?? null;
  const itemImageUrl = publicTaxonomyUrl(item?.subtypeImageUrl ?? item?.categoryImageUrl ?? null);
  const itemName = (ar ? item?.subtypeNameAr ?? item?.categoryNameAr : item?.subtypeName ?? item?.categoryName) ?? item?.subtypeName ?? null;

  const selectMachine = (id: string) => {
    // Re-clicking the selected pin deselects it — the only way back to state 2 without changing bid.
    const next = selectedMachineId === id ? null : id;
    setSelectedMachineId(next);
    onSelectMachine?.(next);
  };

  /* ── what the map is NOT showing, in words ─────────────────────────────────────────────────────
     Every one of these is a case where drawing nothing is correct and silence is not: an empty map
     otherwise reads as "this lessor has no machines", which is a claim the data does not support. */
  const counts = selectedBid ? unitCounts(selectedBid) : null;
  const info: { title: string; sub: string } | null = (() => {
    if (!selectedBid) return null;
    if (offPlatform) return { title: t.bidMap.offPlatformNoPins, sub: t.bidMap.offPlatformNoPinsWhy };
    if (loadingBidId === selectedBidId) return null;
    if (fleetFailed) return { title: t.bidMap.fleetFailed, sub: t.bidMap.fleetFailedWhy };
    if (fleet && machines.length === 0) return { title: t.bidMap.noLocatable, sub: t.bidMap.noLocatableWhy };
    if (counts && counts.unidentified > 0) {
      // `unitCountLabel` is the one literal Arabic form (AC-146) and carries «وحدة» itself; English
      // has no such rule, so it prints the plain count and the noun comes from the line's own copy.
      const n = ar ? unitCountLabel(counts.unidentified) : String(counts.unidentified);
      return { title: fmt(t.bidMap.claimedNotDrawn, { n }), sub: t.bidMap.claimedNotDrawnWhy };
    }
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

        {bids.length === 0 && (
          // Zero bids → the site pin alone with an empty state (RM3-AC-26).
          <div className="bm-empty">
            <div className="bm-empty-t">{t.bidMap.noBids}</div>
            <div className="bm-empty-s">{t.bidMap.freshnessNote}</div>
          </div>
        )}
        {/* The panel slot. v2's offers list (`BidListPanel`) was deleted with the rescope to v3 — this
            surface is scoped to ONE bid, so there is nothing to list. V2–V9 build the verification panel
            here: header, counts, shortfall alert, equipment list, detail and documents. */}
      </div>
    </div>
  );
}
