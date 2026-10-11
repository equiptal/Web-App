/**
 * **One supplier's bids across the machines of one request**, for the bid map's machine bar (owner,
 * 2026-10-11, multi-item decision 6, M1; `docs/multi-item-decisions.md`). Pure.
 *
 * «Other bids» in the back header already moves ACROSS SUPPLIERS on one machine. This moves across
 * MACHINES for one supplier: every machine of the submission, in the order the renter asked for them,
 * with this supplier's bid on it, or none.
 */

import { bidSupplierKey } from "./bids";
import type { InboxBid } from "./inbox";
import type { RequestListItem } from "./requests";

export interface SupplierMachine {
  /** The request (one machine of the submission). */
  itemId: string;
  name: string;
  nameAr: string;
  qty: number;
  imageUrl: string | null;
  imageIsPhoto: boolean;
  /** His bid on this machine, or null when he did not bid on it. */
  bidId: string | null;
  price: number | null;
  priceUnit: string | null;
}

/**
 * The submission's machines with this supplier's bid on each. When he has more than one bid on one
 * machine, the one on screen wins, else his cheapest (the rule «Other bids» uses for a supplier chip).
 */
export function supplierMachines(
  items: readonly RequestListItem[],
  received: readonly InboxBid[],
  current: { bidId: string; supplierCompanyId: string | null; supplierId: string | null; supplierName: string },
): SupplierMachine[] {
  const key = bidSupplierKey(current);
  const his = received.filter((b) => bidSupplierKey(b) === key);
  return items.map((it) => {
    const mine = his
      .filter((b) => b.request.id === it.id)
      .sort((a, b) => (a.bidId === current.bidId ? -1 : b.bidId === current.bidId ? 1 : (a.currentPrice ?? Infinity) - (b.currentPrice ?? Infinity)));
    const b = mine[0] ?? null;
    return {
      itemId: it.id,
      name: it.item?.name ?? it.displayId ?? "",
      nameAr: it.item?.nameAr || it.item?.name || it.displayId || "",
      qty: it.item?.qty ?? 1,
      imageUrl: it.item?.imageUrl ?? null,
      imageIsPhoto: it.item?.imageIsPhoto ?? false,
      bidId: b?.bidId ?? null,
      price: b?.currentPrice ?? null,
      priceUnit: b?.priceUnit ?? null,
    };
  });
}

/**
 * Whether the bar (and the machine line under the supplier's name in the chat) shows at all: a
 * multi-item request where this supplier has bids on two or more of its machines.
 */
export function showsMachineBar(machines: readonly SupplierMachine[]): boolean {
  return machines.length > 1 && machines.filter((m) => m.bidId).length > 1;
}
