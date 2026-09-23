/**
 * **The yard card, on the machine detail** (owner, 2026-09-08).
 *
 * *"Show it red yard and distance similar to how it appears in the fleet cards, so no need to
 * «availability not confirmed» and no need for availability differentiation, just the red card of the
 * distance and yard with maybe a small badge on the card saying not confirmed"*, and *"remove these
 * 2 [footer buttons] … for availability let it be like the fleet card as «?» on the yard card, and
 * clicking it whether from the details or from the fleet will open this [the layer]"*.
 *
 * Three things are asserted here that only a render can see: the card is the FLEET card's control
 * (same classes, so the shared rules in `map-proto.css` reach it), the press reports upward with the
 * right `asked` verdict, and the two footer buttons are gone from the panel rather than merely
 * relabelled.
 *
 * The panel's other rules are pinned against the model and the source in `machine-panel.test.ts` and
 * `availability-chip.test.ts`; this file exists because a card that renders under the wrong class
 * paints as unstyled text and no model test can tell.
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EquipmentDetail } from "@/components/map/panel/EquipmentDetail";
import { mapFleet, type FleetMachine } from "@/lib/contract/fleet";
import type { MatchRequest } from "@/components/map/panel/machine-panel-model";

const L = (en: string) => en;

/** One offered machine. `locationSource` is the only knob that matters here — it is what
 *  `unitAvailability` reads, and therefore what colours the card. */
const machine = (locationSource: string | null): FleetMachine =>
  mapFleet([
    {
      equipmentId: "eq-1",
      manufacturer: "Caterpillar",
      modelName: "320D",
      year: 2022,
      locationSource,
      distanceKm: 12.4,
      yardName: "Al Sahafah yard",
      photoKeys: [],
      documentKeys: [],
      inBid: true,
    },
  ])[0];

const request: MatchRequest = {};

describe("the machine detail draws the fleet card's yard card", () => {
  it("puts the distance and the yard inside ONE red control, with a small badge and no chip", async () => {
    const onYardPress = vi.fn();
    render(
      <EquipmentDetail
        machine={machine("listing_yard")}
        request={request}
        ar={false}
        L={L}
        onBack={() => {}}
        onYardPress={onYardPress}
      />,
    );

    // The control, in the fleet list's own class — which is what the shared rules match on.
    const card = document.querySelector("button.bm-eq-yard.no");
    expect(card).not.toBeNull();
    expect(card!.textContent).toContain("12.4");
    expect(card!.textContent).toContain("Al Sahafah yard");
    // The badge says the state, small, ON the card.
    expect(card!.querySelector(".mp-yard-badge")?.textContent).toBe("Not confirmed");
    // ~~«Availability not confirmed yet» in a chip, and a titled paragraph under it.~~ Both gone: the
    // colour and the badge state it once, and the layer the press opens explains it.
    expect(document.querySelector(".mp-chip")).toBeNull();
    expect(screen.queryByText(/Availability not confirmed yet/)).toBeNull();
    expect(screen.queryByText(/an open question, not a refusal/)).toBeNull();

    // The press reports up. The surface owns the layer, because the fleet list opens the same one.
    await userEvent.click(card!);
    expect(onYardPress).toHaveBeenCalledTimes(1);
    expect(onYardPress.mock.calls[0][1]).toBe(false); // not asked yet
  });

  it("says «asked» and still opens, when the question is already with the supplier", async () => {
    const onYardPress = vi.fn();
    render(
      <EquipmentDetail
        machine={machine("listing_yard")}
        request={request}
        ar={false}
        L={L}
        onBack={() => {}}
        onYardPress={onYardPress}
        // The same composer the surface would have sent through — an availability ask that is out.
        askPending={(draft) => draft.kind === "availability"}
      />,
    );
    const card = document.querySelector("button.bm-eq-yard.asked");
    expect(card).not.toBeNull();
    expect(card!.querySelector(".mp-yard-badge")?.textContent).toBe("Asked");
    await userEvent.click(card!);
    // `asked: true` is what makes the layer show the question he put instead of offering to ask again.
    expect(onYardPress.mock.calls[0][1]).toBe(true);
  });

  it("is NOT a control once the supplier has named the yard — there is nothing left to ask", () => {
    render(
      <EquipmentDetail
        machine={machine("unit_yard")}
        request={request}
        ar={false}
        L={L}
        onBack={() => {}}
        onYardPress={() => {}}
      />,
    );
    expect(document.querySelector("span.bm-eq-yard.ok")).not.toBeNull();
    expect(document.querySelector("button.bm-eq-yard")).toBeNull();
    // Green is settled: no badge, because "confirmed" is the tick and the colour.
    expect(document.querySelector(".mp-yard-badge")).toBeNull();
  });

  it("has no footer: neither ask is raised twice from this panel", () => {
    render(
      <EquipmentDetail
        machine={machine("listing_yard")}
        request={request}
        ar={false}
        L={L}
        onBack={() => {}}
        onRequest={() => {}}
        onYardPress={() => {}}
      />,
    );
    expect(screen.queryByRole("button", { name: /Ask him to confirm availability/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Ask for different equipment/ })).toBeNull();
    expect(document.querySelector(".mp-foot")).toBeNull();
  });

  it("draws the card with no skin, no badge and no press for a unit with no machine behind it", () => {
    /* `locationSource: "unidentified"` is padding in `unitsOffered` beyond the machines named, and
       `unitAvailability` answers `absent`: none of a colour, a badge or a press would be a fact about
       it. `listedMachines` drops such a row before the list or the map sees it, so this state is
       reachable only by a caller that opens one directly — which is why the branch exists at all. */
    render(
      <EquipmentDetail
        machine={machine("unidentified")}
        request={request}
        ar={false}
        L={L}
        onBack={() => {}}
        onYardPress={() => {}}
      />,
    );
    const card = document.querySelector(".bm-eq-yard");
    expect(card).not.toBeNull();
    expect(card!.className).toBe("bm-eq-yard");
    expect(document.querySelector(".mp-yard-badge")).toBeNull();
    expect(document.querySelector("button.bm-eq-yard")).toBeNull();
  });
});
