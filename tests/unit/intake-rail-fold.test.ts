import { describe, expect, it } from "vitest";
import { byRequest, type RailRow } from "@/components/create/RequestsRail";

/**
 * The intake's side panel folds a multi-item request into ONE row (owner, 2026-10-11): the combined
 * picture, the first machine's name and an orange «+N more»; pressing it opens the machines.
 */

const row = (reqId: string, itemId: string): RailRow =>
  ({ itemId, name: itemId, qty: 1, imageUrl: null, option: { id: reqId, kind: "request", ref: reqId, itemId, machine: itemId, quantity: 1, when: null } }) as RailRow;

describe("the side panel's runs", () => {
  it("keeps one request's machines together, in the chart's order", () => {
    const runs = byRequest([row("r1", "crane"), row("r2", "loader"), row("r1", "lift")]);
    expect(runs.map((r) => r.map((x) => x.itemId))).toEqual([["crane", "lift"], ["loader"]]);
  });
});
