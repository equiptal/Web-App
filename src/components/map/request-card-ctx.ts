/**
 * **One fleet row → the machine a request card names** — the identity half of `RequestCardCtx`.
 *
 * Shared by the two surfaces that render the request loop's cards off the SAME Stream channel: the
 * map's `ChatDock` and `/deal-room/[id]`. The owner's ruling of 2026-08-11 — *"i want it like request
 * card"* — put the full card on the deal room, and the resolver it needs is this one; a second copy
 * would be a second answer to "what is this machine called and what does it look like?" about one
 * card the renter and the supplier are both reading.
 *
 * **NO React and NO JSX**, so it is unit-testable in this repo's `node` vitest env — but deliberately
 * NOT in `lib/contract/`. It reaches for `heroPhotoUrl`, which lives in the panel's model, and a
 * contract module importing a component-side module is the cycle `fleet.ts` ← `machine-panel-model.ts`
 * already sets up in the other direction. It sits beside `RequestCard.tsx` instead — the component
 * both surfaces already import — which is the honest place for the context that feeds it.
 *
 * Rule 1 of `request-card.ts` is what this exists to serve: **the machine is resolved from
 * `equipmentId`, never parsed out of the message text.** The payload's `serial` is display-only
 * (§7.3 stamps it) and is what the view falls back TO, not the source.
 */

import { heroPhotoUrl } from "@/components/map/panel/machine-panel-model";
import type { FleetMachine } from "@/lib/contract/fleet";
import type { RequestCardMachine } from "@/lib/contract/request-card";

/**
 * The fleet row as the card's identity strip needs it.
 *
 * `label` is `model · spec`, composed the way `EquipmentDetail` composes it — same two fields, same
 * separator — so the card and the panel name one machine one way. `photoUrl` walks the same
 * `heroPhotoUrl` chain the machine detail walks, so the tile on the card is the picture the renter
 * sees when he presses it.
 */
export function fleetRequestMachine(m: FleetMachine, ar: boolean): RequestCardMachine {
  return {
    locationSource: m.locationSource ?? null,
    documentKeys: m.documentKeys,
    // Photos are their own list, and a document ask can name one — see `documentAskSatisfied`.
    photoKeys: m.photoKeys,
    label:
      [
        [m.manufacturer, m.modelName].filter(Boolean).join(" "),
        (ar ? m.subcategoryNameAr : m.subcategoryName) || m.subcategoryName,
      ]
        .map((s) => (s ?? "").trim())
        .filter(Boolean)
        .join(" · ") || null,
    serial: m.serialNumber,
    photoUrl: heroPhotoUrl(m),
  };
}

/**
 * `equipmentId` → the machine, or **null when this fleet does not hold it**.
 *
 * The null is load-bearing and is why this is a function rather than a map lookup at the call site:
 * a machine missing from the fleet response — sold, unlisted, never qualifying — must yield `null`
 * so `renteeRequestState` answers `unknown` and the card says *"this equipment isn't in his current
 * list"* rather than inventing a verdict about the supplier. A surface that has NO fleet at all says
 * something different again, and says it through `fleetKnown: false` (see `RequestCardCtx`).
 */
export function fleetMachineResolver(
  fleet: readonly FleetMachine[] | null,
  ar: boolean,
): (equipmentId: string) => RequestCardMachine | null {
  const byId = new Map<string, FleetMachine>();
  for (const m of fleet ?? []) byId.set(m.equipmentId, m);
  return (equipmentId: string) => {
    const m = byId.get(equipmentId);
    return m ? fleetRequestMachine(m, ar) : null;
  };
}
