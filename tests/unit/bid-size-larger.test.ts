import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { bidSizeCounts } from "@/lib/contract/bids";
import { fetchBids } from "@/lib/api/client";

/**
 * Bids offering a machine LARGER than the one asked for (owner, 2026-09-08).
 *
 * `GET /marketplace/requests/{id}/bids` answers `exact` unless the call carries
 * `sizeMatch=exact_or_larger`, and `exact` DROPS every larger-size bid while dispatch still
 * notifies the renter about it. The backend reports what it held in `sizeCounts.larger` for exactly
 * that reason, and this repo read neither the flag nor the count until now.
 */

const src = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

const ROUTE = "src/app/api/me/requests/[id]/bids/route.ts";
const SINGLE = "src/components/requests/RequestBids.tsx";
const GROUP = "src/components/requests/GroupBids.tsx";

describe("bidSizeCounts", () => {
  it("reads the envelope's own counts", () => {
    expect(bidSizeCounts({ sizeCounts: { exact: 2, larger: 1 } })).toEqual({ exact: 2, larger: 1 });
  });

  it("is zero for an envelope that carries none, so nothing invents a hidden bid", () => {
    expect(bidSizeCounts({ activeBids: [] })).toEqual({ exact: 0, larger: 0 });
    expect(bidSizeCounts(null)).toEqual({ exact: 0, larger: 0 });
    expect(bidSizeCounts({ sizeCounts: { larger: "3" } })).toEqual({ exact: 0, larger: 0 });
    expect(bidSizeCounts({ sizeCounts: { larger: -1 } })).toEqual({ exact: 0, larger: 0 });
  });
});

describe("fetchBids", () => {
  const calls: string[] = [];

  beforeEach(() => {
    calls.length = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(String(url));
        return { ok: true, status: 200, json: async () => ({ bids: [], sizeCounts: { exact: 0, larger: 2 } }) } as unknown as Response;
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("asks for the exact size by default, which is what the backend does anyway", async () => {
    await fetchBids("req-1");
    expect(calls[0]).toBe("/api/me/requests/req-1/bids");
  });

  it("carries sizeMatch when the renter asks for larger machines, and keeps the count", async () => {
    const r = await fetchBids("req-1", true);
    expect(calls[0]).toBe("/api/me/requests/req-1/bids?sizeMatch=exact_or_larger");
    expect(r.sizeCounts?.larger).toBe(2);
  });
});

describe("the bids route", () => {
  it("passes the flag through and returns the counts", () => {
    const s = src(ROUTE);
    expect(s).toContain('searchParams.get("sizeMatch") === "exact_or_larger"');
    expect(s).toContain("bidSizeCounts(raw)");
  });

  it("accepts nothing else as the wider scope, so a hand-edited value cannot widen the list", () => {
    // The ternary answers `null` for anything but the one token, and `null` sends no query at all.
    expect(src(ROUTE)).toContain('? "exact_or_larger" : null');
  });
});

/* ── The two renter surfaces (source-level, as this repo's component facts are pinned) ─────────── */

describe("RequestBids — one request", () => {
  const s = src(SINGLE);

  it("refetches when the switch moves, rather than filtering what is loaded", () => {
    expect(s).toContain("fetchBids(requestId, showLarger)");
    expect(s).toContain("}, [requestId, showLarger]);");
  });

  it("carries the switch and the held count on the bar", () => {
    expect(s).toContain('L("Show bids with larger size", "عرض العروض بمقاس أكبر")');
    expect(s).toContain("setLargerHeld(d.sizeCounts?.larger ?? 0)");
  });

  it("names the held bid under «no bids», and says nothing once they are showing", () => {
    expect(s).toContain("const heldOnEmpty = showLarger ? 0 : largerHeld;");
    expect(s).toContain('L("1 bid offers a larger size", "عرض واحد بمقاس أكبر")');
    expect(s).toContain('L("Show it", "اعرضه")');
  });
});

describe("GroupBids — every item of one submission", () => {
  const s = src(GROUP);

  it("sums the count across the fan-out, which is per item", () => {
    expect(s).toContain("fetchBids(it.id, showLarger)");
    expect(s).toContain("heldRef.current += d.sizeCounts?.larger ?? 0;");
    expect(s).toContain("setLargerHeld(heldRef.current);");
  });

  it("re-runs the fan-out when the switch moves", () => {
    expect(s).toContain("[group.items, showLarger],");
  });

  it("counts the switch as an active filter, so the icon says the list was widened", () => {
    expect(s).toContain("+ (showLarger ? 1 : 0);");
  });

  it("«Clear all» turns it off too, rather than leaving a filter the panel says is clear", () => {
    expect(s).toContain("setFKm(false); setShowLarger(false);");
  });

  it("names the held bid under «no bids»", () => {
    expect(s).toContain("const heldOnEmpty = showLarger ? 0 : largerHeld;");
    expect(s).toContain('L("Show them", "اعرضها")');
  });
});
