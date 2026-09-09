import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { bidSizeCounts } from "@/lib/contract/bids";
import { fetchBids } from "@/lib/api/client";
import { BidSizeFilter } from "@/components/workspace/BidSizeFilter";
import { BidCards } from "@/components/workspace/BidCards";
import { LocaleProvider } from "@/lib/i18n";

/**
 * Bids offering a machine LARGER than the one asked for (owner, 2026-09-08).
 *
 * The backend drops them unless the call says `sizeMatch=exact_or_larger`, so three things have to
 * hold together: the request carries the flag, the envelope's own count survives the mapping, and
 * the surfaces say how many are being held — the filter panel always, and the empty state where
 * «No bids on this item yet» would otherwise be a false claim.
 */

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
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calls.push(String(url));
      return { ok: true, status: 200, json: async () => ({ bids: [], sizeCounts: { exact: 0, larger: 2 } }) } as unknown as Response;
    }));
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

describe("BidSizeFilter", () => {
  function draw(showLarger: boolean, largerHeld: number) {
    const onChange = vi.fn();
    render(
      <LocaleProvider>
        <BidSizeFilter showLarger={showLarger} largerHeld={largerHeld} onChange={onChange} />
      </LocaleProvider>,
    );
    return onChange;
  }

  it("opens on the button and turns the toggle on", () => {
    const onChange = draw(false, 1);
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    expect(screen.getByText("1 bid offers a larger size")).toBeTruthy();
    fireEvent.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("says so when nothing is being held, rather than leaving the renter to guess", () => {
    draw(false, 0);
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    expect(screen.getByText("Every bid here offers the size you asked for")).toBeTruthy();
  });

  it("can be turned back off", () => {
    const onChange = draw(true, 3);
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    expect(screen.getByText("3 bids offer a larger size")).toBeTruthy();
    fireEvent.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith(false);
  });
});

describe("the empty cards tab", () => {
  function draw(props: { largerHeld: number; showLarger: boolean }) {
    const onShowLarger = vi.fn();
    render(
      <LocaleProvider>
        <BidCards
          bids={[]}
          checked={new Set()}
          unreadByBid={{}}
          submissionsByBid={{}}
          durationDays={30}
          startDate={null}
          largerHeld={props.largerHeld}
          showLarger={props.showLarger}
          onShowLarger={onShowLarger}
          onToggle={() => {}}
        />
      </LocaleProvider>,
    );
    return onShowLarger;
  }

  it("names the held bid under «no bids», and its button asks for it", () => {
    const onShowLarger = draw({ largerHeld: 1, showLarger: false });
    expect(screen.getByText("No bids on this item yet")).toBeTruthy();
    expect(screen.getByText("1 bid offers a larger size")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show it" }));
    expect(onShowLarger).toHaveBeenCalled();
  });

  it("says nothing extra once those bids are already being asked for", () => {
    draw({ largerHeld: 2, showLarger: true });
    expect(screen.getByText("No bids on this item yet")).toBeTruthy();
    expect(screen.queryByText("2 bids offer a larger size")).toBeNull();
  });

  it("says nothing when no bid of any size arrived", () => {
    draw({ largerHeld: 0, showLarger: false });
    expect(screen.getByText("No bids on this item yet")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Show it" })).toBeNull();
  });
});
