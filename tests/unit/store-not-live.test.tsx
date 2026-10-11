import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { LocaleProvider } from "@/lib/i18n";
import { StoreDetailSurface } from "@/components/stores/StoreDetailSurface";

/**
 * A store whose owner has no live package answers 404 `STORE_NOT_LIVE` (E9019) since release PR #548
 * (alignment 1.10). The page says so, with no Retry; any other failure keeps «couldn't load» + Retry.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {} }),
  usePathname: () => "/stores/s1",
  useSearchParams: () => new URLSearchParams(),
}));

const answer = (status: number, body: unknown) =>
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) =>
    String(input).includes("/api/stores/taxonomy")
      ? new Response(JSON.stringify({ taxonomy: [] }), { status: 200 })
      : new Response(JSON.stringify(body), { status }),
  );

const draw = () => {
  localStorage.setItem("moedatech.locale", "en");
  render(
    <LocaleProvider initialLocale="en">
      <StoreDetailSurface id="s1" />
    </LocaleProvider>,
  );
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("a store that is not live", () => {
  it("says it is not available, with no Retry", async () => {
    answer(404, { code: "not_found", backendCode: "E9019" });
    draw();
    expect(await screen.findByText("This store is not available right now")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("keeps the general error and Retry for any other failure", async () => {
    answer(404, { code: "not_found", backendCode: "E9007" });
    draw();
    expect(await screen.findByText("We couldn't load this store.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });
});
