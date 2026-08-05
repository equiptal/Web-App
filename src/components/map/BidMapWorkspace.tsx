"use client";

/**
 * RMAP T12 — the map workspace: a full-bleed map with the bid panel floating over it (design.md §1).
 * Not a two-column split; the panel, and later the rail (T33) and the machine panel (T18), all overlay
 * the same canvas so the map is never boxed into a corner.
 *
 * **This component does not fetch** (decision A4). Bids, the request and the freshness controls all
 * arrive as props from `GroupBids`, which owns every request on this screen — one fetch owner means the
 * refetch triggers of §7.5.1 have exactly one implementation and the list and the map can never
 * disagree about what has arrived.
 *
 * **No item strip.** A multi-item RFQ is scoped by the existing item selector in the controls cluster
 * (AC-22), and a single-item RFQ renders no strip at all (AC-23) — so there is nothing to draw here in
 * either case, and a second item control would be a second source of truth for the same choice.
 */

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { BidListPanel, type MapBid } from "@/components/map/BidListPanel";
import type { RequestRecord } from "@/lib/contract/requests";
import { useT } from "@/lib/i18n";
import "@/components/map/map-proto.css";

// `leaflet` reaches for `window` at import time, so the canvas is client-only — the same handling
// `MapLocationPicker`/`GoogleMapLocationPicker` need in this repo.
const MapCanvas = dynamic(() => import("@/components/map/MapCanvas"), { ssr: false });

export interface BidMapWorkspaceProps {
  /** Bids for the active item scope, already filtered by `GroupBids`. */
  bids: MapBid[];
  /** The active item's request record — the only source of the project pin. Null while it loads, or
   *  when the request has no project location at all (AC-21). */
  request: RequestRecord | null;
  /** Map state lives in `GroupBids` (§6.6 "Store — none"), so selection is lifted, not local. */
  selectedBidId: string | null;
  onSelectBid: (bidId: string) => void;
  freshBidIds: ReadonlySet<string>;
  onRefresh: () => void;
  refreshing: boolean;
}

export function BidMapWorkspace({
  bids,
  request,
  selectedBidId,
  onSelectBid,
  freshBidIds,
  onRefresh,
  refreshing,
}: BidMapWorkspaceProps) {
  const t = useT();
  // Hovering a row highlights that supplier's pins (prototype `hoverSup`). There are no machine pins
  // until T16, so the state is surfaced on the canvas as a data attribute rather than dropped — the
  // wiring is the part that is easy to forget, and it belongs with the row that raises it.
  const [hoveredBidId, setHoveredBidId] = useState<string | null>(null);

  const site = useMemo(() => {
    const lat = request?.projectLat;
    const lng = request?.projectLng;
    // Never a half-resolved point: one missing side voids both (the same rule `resolveUnitLocation`
    // enforces per unit). A point at (lat, 0) is in the Gulf of Guinea.
    if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  }, [request?.projectLat, request?.projectLng]);

  return (
    // No `dir` here: the shell's direction is the locale's, and every offset in `map-proto.css` is a
    // logical property, so the panel lands on the inline-end edge in both (AC-30, AC-98).
    <div className="bidmap">
      <div className="bm-canvas" data-hovered-bid={hoveredBidId ?? ""}>
        <MapCanvas site={site} addressLabel={request?.projectAddressLabel ?? null} />
        {/* The canvas still renders without a project location — it simply says so, and the panel's
            distances read «—» rather than 0 (AC-21). */}
        {!site && <div className="bm-nosite">{t.bidMap.noSiteLocation}</div>}

        {bids.length === 0 ? (
          // Zero bids → the site pin alone, an empty state, and no bid list (AC-29, AC-99).
          <div className="bm-empty">
            <div className="bm-empty-t">{t.bidMap.noBids}</div>
            <div className="bm-empty-s">{t.bidMap.freshnessNote}</div>
          </div>
        ) : (
          <BidListPanel
            bids={bids}
            selectedBidId={selectedBidId}
            onSelectBid={onSelectBid}
            onHoverBid={setHoveredBidId}
            freshBidIds={freshBidIds}
            hasSite={site != null}
            onRefresh={onRefresh}
            refreshing={refreshing}
          />
        )}
      </div>
    </div>
  );
}
