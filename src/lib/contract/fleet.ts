/**
 * RMAP T16 — the wire type + mapper for a bid's supplier fleet.
 *
 * Source: app backend `GET /marketplace/bids/{bidId}/fleet` → `supplier-fleet.service.getSupplierFleetForBid`,
 * which returns ONE row per qualifying machine the bid's supplier owns — every machine of the requested
 * type, not only the units the bid put on the table, so the renter can see what else could be sent.
 *
 * **Bid-scoped, never supplier-scoped.** `@@unique([requestId, bidOwnerKey, equipmentId])` lets one
 * supplier hold several bids on one request, so `inBid` and `yardConfirmed` are only meaningful
 * relative to ONE bid. Two bids from the same firm on the same request return different rows for the
 * same machine — which is why the client cache is keyed by `bidId` and never by supplier.
 *
 * The row IS an `offeredUnitsDetail` entry (the backend projects both through the same
 * `projectOfferedUnit`) plus `serialNumber`, `inBid` and a `yardConfirmed` the fleet service overrides.
 * So the machine half is parsed by `mapOfferedUnit` from `bids.ts` rather than re-derived here: one
 * parser means a machine can never read differently on the map than it does on the bid card.
 *
 * Location levels on this surface are deliberately only two — the service blanks `bid_pin`/`bid_yard`
 * (they describe where the BID is, which says nothing about some other machine in the fleet), leaving
 * `unit_yard` (confirmed) → `listing_yard` (not confirmed) → `none`. Colour still comes only from
 * `unitAvailability()`; nothing here interprets a level.
 */

import { mapOfferedUnit, type OfferedUnitDetail } from "./bids";

/** One qualifying machine of the bidding supplier's fleet, as the renter's map plots it. */
export interface FleetMachine extends OfferedUnitDetail {
  /**
   * The machine's own serial — the only field that tells two otherwise identical units of the same
   * make/model/year apart. Null when the listing has none.
   */
  serialNumber: string | null;
  /**
   * Whether THIS bid's `unitsOffered` names this machine. False = the supplier owns it and it fits the
   * request, but he did not put it on the table — the renter can ask for it (the dashed «يمكنك طلبها»
   * pin). **Defaults to false when the field is absent**: a missing flag must never promote a machine
   * into an offer the supplier did not make.
   */
  inBid: boolean;
  /**
   * Reported verbatim (§7.7 / AC-10) and **rendered nowhere**. On this endpoint it means "this bid has
   * an entry for the machine naming a yard the supplier's firm actually owns" — but the pin's colour
   * still comes from `unitAvailability()` alone (`bid-map.ts` explains why at length). Kept required
   * here, unlike on `OfferedUnitDetail`, because the fleet service always computes it.
   */
  yardConfirmed: boolean;
}

/**
 * Parse the fleet payload. Tolerant of camel/snake and of the row being wrapped — the BFF route hands
 * this the backend's unwrapped `data`, but a `{ fleet: [...] }` / `{ machines: [...] }` envelope from a
 * different projection of the same data still parses rather than silently drawing nothing.
 *
 * **Rows with no `equipmentId` are dropped.** The id is the pin's identity, the selection key and the
 * de-collision key; a row without one cannot be selected, cannot be de-collided deterministically, and
 * would collapse onto any other id-less row. Dropping it draws less, which is the safe direction.
 */
export function mapFleet(raw: unknown): FleetMachine[] {
  const rows = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as Record<string, unknown> | null)?.fleet)
      ? ((raw as Record<string, unknown>).fleet as unknown[])
      : Array.isArray((raw as Record<string, unknown> | null)?.machines)
        ? ((raw as Record<string, unknown>).machines as unknown[])
        : Array.isArray((raw as Record<string, unknown> | null)?.data)
          ? ((raw as Record<string, unknown>).data as unknown[])
          : [];

  const out: FleetMachine[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const o = (r ?? {}) as Record<string, unknown>;
    const unit = mapOfferedUnit(o);
    if (!unit.equipmentId) continue;
    // The backend keys its own map by equipmentId so duplicates cannot occur — but a duplicate here
    // would draw two pins on one machine and give the selection two rows with the same id, so the
    // parser refuses to represent it at all.
    if (seen.has(unit.equipmentId)) continue;
    seen.add(unit.equipmentId);
    const serial = o.serialNumber ?? o.serial_number ?? o.serial;
    out.push({
      ...unit,
      serialNumber: serial == null || serial === "" ? null : String(serial),
      inBid: (o.inBid ?? o.in_bid) === true,
      yardConfirmed: (o.yardConfirmed ?? o.yard_confirmed) === true,
    });
  }
  return out;
}
