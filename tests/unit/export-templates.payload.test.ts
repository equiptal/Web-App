import { describe, it, expect } from "vitest";
import {
  buildExportPayload,
  rankingSourceOf,
  resolveRecommendation,
  type BuildExportPayloadInput,
} from "@/lib/contract/export-templates";
import type { BidColumn, Money } from "@/lib/contract/comparison";
import type { RecommendResult } from "@/lib/contract/agent-bids";

/**
 * The payload builder is where a mistake becomes a wrong number in a procurement sheet that
 * someone forwards to finance. Two behaviours matter more than the rest:
 *
 *  1. `stated` survives. Unstated money must NOT arrive as a bare 0 — the backend needs the
 *     flag to leave the cell blank instead of printing "SAR 0".
 *  2. "Recommended" is only claimed when a live agent actually made a recommendation. It must
 *     never fall back to the top-ranked bid, which is what `pickId` does.
 */

const col = (id: string, over: Partial<BidColumn["bid"]> = {}, rest: Partial<BidColumn> = {}): BidColumn =>
  ({
    bid: {
      id,
      supplierName: `Supplier ${id}`,
      price: 1000,
      priceUnit: "PER_DAY",
      verified: true,
      distanceKm: 12.4,
      equipment: { year: 2019 },
      equipmentCertCodes: ["tuv"],
      ownershipDocs: [],
      operatorCertDeclared: null,
      compliance: { localContent: true, saso: false, activityLicense: false, taxNumber: false, nationalAddress: false },
      ...over,
    },
    rental: { value: 30000, stated: true },
    mob: { value: 500, stated: true },
    demob: { value: 500, stated: true },
    allIn: { value: 31000, stated: true },
    cashUpfront: { value: 0, stated: false },
    pctVsLowest: 0,
    isLowest: true,
    costResponsibilities: [],
    ...rest,
  } as unknown as BidColumn);

const baseInput = (over: Partial<BuildExportPayloadInput> = {}): BuildExportPayloadInput => ({
  requestId: "req-1",
  columns: [col("b1")],
  totals: { b1: { grandTotal: { value: 41400, stated: true }, mobDemob: { value: 1000, stated: true } } },
  header: { requestDisplayId: "REQ-1024", itemName: "Excavator", location: "Riyadh", durationDays: 30, units: 1 },
  rankingSource: "preset:lowest",
  rec: null,
  agentLive: false,
  lang: "en",
  ...over,
});

const rec = (pick: string | null, confidence = 0.82): RecommendResult =>
  ({
    ranking: [{ bid_id: pick, rank: 1, recognition: null }],
    recommendation: {
      pick_bid_id: pick,
      confidence,
      reasons: [{ tag: "cost", text: "Lowest all-in cost" }, { tag: "trust", text: "Verified supplier" }],
      cost_shift_flags: [],
    },
  } as unknown as RecommendResult);

describe("export payload — money keeps its stated flag", () => {
  it("given unstated money, when built, then stated:false survives instead of a bare 0", () => {
    const input = baseInput({
      totals: { b1: { grandTotal: { value: 0, stated: false }, mobDemob: { value: 0, stated: false } } },
    });
    const out = buildExportPayload(input);
    const f = out.suppliers[0].fields as Record<string, Money>;
    expect(f.grandTotalInclVat).toEqual({ value: 0, stated: false });
    expect(f.mobDemobTotal).toEqual({ value: 0, stated: false });
  });

  it("given stated money, when built, then the value carries through", () => {
    const f = buildExportPayload(baseInput()).suppliers[0].fields as Record<string, Money>;
    expect(f.grandTotalInclVat).toEqual({ value: 41400, stated: true });
  });

  it("given a genuinely stated zero, when built, then it stays stated", () => {
    // Free delivery is a real answer, not a missing one.
    const input = baseInput({
      totals: { b1: { grandTotal: { value: 41400, stated: true }, mobDemob: { value: 0, stated: true } } },
    });
    const f = buildExportPayload(input).suppliers[0].fields as Record<string, Money>;
    expect(f.mobDemobTotal).toEqual({ value: 0, stated: true });
  });

  it("given per-column money, when built, then rental/mob/demob keep their own flags", () => {
    const c = col("b1");
    (c as unknown as { mob: Money }).mob = { value: 0, stated: false };
    const f = buildExportPayload(baseInput({ columns: [c] })).suppliers[0].fields as Record<string, Money>;
    expect(f.mobilizationTotal).toEqual({ value: 0, stated: false });
    expect(f.demobilizationTotal).toEqual({ value: 500, stated: true });
  });
});

describe("export payload — the recommendation is a claim, not an ordering", () => {
  it("given NO live agent, when built, then no recommendation is sent at all", () => {
    // The failure this guards: naming the top-ranked bid as "recommended" in a cell that goes
    // to finance for sign-off.
    const out = buildExportPayload(baseInput({ agentLive: false, rec: rec("b1") }));
    expect(out.header.recommendedSupplierName).toBeUndefined();
    expect(out.header.recommendationConfidence).toBeUndefined();
  });

  it("given a live agent with a pick, when built, then the pick is named", () => {
    const out = buildExportPayload(baseInput({ agentLive: true, rec: rec("b1") }));
    expect(out.header.recommendedSupplierName).toBe("Supplier b1");
  });

  it("given a live agent, when built, then confidence is converted to a percentage", () => {
    const out = buildExportPayload(baseInput({ agentLive: true, rec: rec("b1", 0.82) }));
    expect(out.header.recommendationConfidence).toBe(82);
  });

  it("given a live agent, when built, then reasons become plain strings", () => {
    const out = buildExportPayload(baseInput({ agentLive: true, rec: rec("b1") }));
    expect(out.header.recommendationReasons).toEqual(["Lowest all-in cost", "Verified supplier"]);
  });

  it("given a pick that is not among the exported bids, when built, then nothing is claimed", () => {
    const out = buildExportPayload(baseInput({ agentLive: true, rec: rec("someone-else") }));
    expect(out.header.recommendedSupplierName).toBeUndefined();
  });

  it("given a null pick id, when resolved, then there is no recommendation", () => {
    expect(resolveRecommendation([col("b1")], rec(null), true)).toBeNull();
  });

  it("given no rec at all, when resolved, then there is no recommendation", () => {
    expect(resolveRecommendation([col("b1")], null, true)).toBeNull();
  });
});

describe("export payload — ranking source reflects what actually ordered the list", () => {
  it("given a free-text query with a live agent ranking, when derived, then it is agent", () => {
    expect(rankingSourceOf("best", "cheapest crane", true, true)).toBe("agent");
  });

  it("given a preset with no free text, when derived, then it is that preset", () => {
    // The four presets are always a deterministic web sort — never the agent.
    expect(rankingSourceOf("lowest", "", true, true)).toBe("preset:lowest");
    expect(rankingSourceOf("newest", "", false, false)).toBe("preset:newest");
  });

  it("given free text but the agent offline, when derived, then it falls back to the preset", () => {
    expect(rankingSourceOf("trusted", "cheapest crane", false, true)).toBe("preset:trusted");
  });

  it("given an unrecognized preset, when derived, then it degrades to best", () => {
    expect(rankingSourceOf("nonsense", "", false, false)).toBe("preset:best");
  });
});

describe("export payload — shape", () => {
  it("given columns in order, when built, then bidIds preserve the displayed order", () => {
    const out = buildExportPayload(baseInput({ columns: [col("b1"), col("b2"), col("b3")], totals: {} }));
    expect(out.suppliers.map((s) => s.bidId)).toEqual(["b1", "b2", "b3"]);
  });

  it("given a rate unit, when built, then the supplier's own period is sent", () => {
    // Per supplier, not per export — one bid may quote monthly while another quotes daily.
    const out = buildExportPayload(
      baseInput({ columns: [col("b1", { priceUnit: "PER_MONTH" }), col("b2", { priceUnit: "PER_DAY" })], totals: {} })
    );
    expect((out.suppliers[0].fields as Record<string, string>).rateUnit).toBe("month");
    expect((out.suppliers[1].fields as Record<string, string>).rateUnit).toBe("day");
  });

  it("given compliance flags, when built, then company docs are listed and flagged", () => {
    const f = buildExportPayload(baseInput()).suppliers[0].fields as Record<string, unknown>;
    expect(f.companyDocs).toEqual(["Local Content"]);
    expect(f.docLocalContent).toBe(true);
    expect(f.docSaso).toBe(false);
  });

  it("given a distance, when built, then it is rounded to whole km", () => {
    const f = buildExportPayload(baseInput()).suppliers[0].fields as Record<string, number>;
    expect(f.distanceKm).toBe(12);
  });

  it("given header values, when built, then they are passed through with an export date", () => {
    const out = buildExportPayload(baseInput());
    expect(out.header.requestDisplayId).toBe("REQ-1024");
    expect(out.header.location).toBe("Riyadh");
    expect(typeof out.header.exportDate).toBe("string");
  });
});
