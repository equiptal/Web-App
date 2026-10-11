import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * **«Ask availability» on each fleet card** (owner, 2026-10-12, option 4B). One machine, one press,
 * into the SAME review step every map ask goes through (`composeDraft`, RM3-AC-17), so it is
 * reviewed in the chat and sent by the surface's one seam. Once asked it says so and stops offering.
 */
const list = readFileSync("src/components/map/EquipmentList.tsx", "utf8");
const surface = readFileSync("src/components/map/BidMapWorkspace.tsx", "utf8");

describe("the fleet card's own availability ask", () => {
  it("is drawn only on a machine not yet confirmed, and states an ask already out", () => {
    expect(list).toContain('{yard !== "ok" && onAskAvailability && (');
    expect(list).toContain('yard === "asked" ? (');
    expect(list).toContain("{t.bidMap.eqAvailabilityAsked}");
    expect(list).toContain("onClick={() => onAskAvailability(machine)}");
  });

  it("goes into the map's review step, never straight to the wire", () => {
    expect(surface).toContain('onAskAvailability={(m) => composeDraft(composeMachineRequest("availability", m.equipmentId))}');
  });
});
