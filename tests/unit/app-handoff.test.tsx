import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AppHandoff } from "@/components/create/AppHandoff";
import { LocaleProvider } from "@/lib/i18n";
import { en } from "@/lib/i18n/en";
import { ar } from "@/lib/i18n/ar";
import { handoffSurface, isInAppBrowser, storeUrlFor } from "@/lib/app-handoff";
import { APP_STORE_URL, PLAY_STORE_URL } from "@/lib/config/store-links";

/**
 * «Request now» from a supplier's public store (Supplier OS `docs/request-now-tickets-web.md`):
 * WEB-1 popup 1a, WEB-2 banner 1c, WEB-3 screen 1b, WEB-4 the refresh rule.
 */

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36";
const INSTAGRAM = `${IPHONE} Instagram 340.0.0.22.109`;
const DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36";
const LINK = "https://moedatech.chottu.link/drq-0123456789abcdef";

describe("handoffSurface", () => {
  const base = { src: "share", appLink: LINK, coarse: false, userAgent: DESKTOP, qrDismissed: false };

  it("desktop with appLink shows the QR popup", () => {
    expect(handoffSurface(base)).toBe("qr");
  });
  it("desktop without appLink shows nothing, as before app links existed", () => {
    expect(handoffSurface({ ...base, appLink: null })).toBeNull();
  });
  it("desktop after «Continue on web» in this session shows nothing (WEB-4)", () => {
    expect(handoffSurface({ ...base, qrDismissed: true })).toBeNull();
  });
  it("a wide touch screen is a phone, not a desktop: no QR for a tablet", () => {
    expect(handoffSurface({ ...base, coarse: true, userAgent: IPHONE })).toBe("banner");
  });
  it("phone from a store link shows the banner", () => {
    expect(handoffSurface({ ...base, coarse: true, userAgent: ANDROID, appLink: null })).toBe("banner");
  });
  it("phone not from a store link shows nothing", () => {
    expect(handoffSurface({ ...base, coarse: true, userAgent: ANDROID, src: null })).toBeNull();
  });
  it("in-app browser with a link shows screen 1b", () => {
    expect(handoffSurface({ ...base, coarse: true, userAgent: INSTAGRAM })).toBe("inApp");
  });
  it("in-app browser with no link to open falls back to the banner", () => {
    expect(handoffSurface({ ...base, coarse: true, userAgent: INSTAGRAM, appLink: null })).toBe("banner");
  });
});

describe("device helpers", () => {
  it("detects in-app browsers it can see", () => {
    expect(isInAppBrowser(INSTAGRAM)).toBe(true);
    expect(isInAppBrowser(`${ANDROID} [FBAN/FB4A;FBAV/470.0]`)).toBe(true);
    expect(isInAppBrowser(IPHONE)).toBe(false);
  });
  it("sends iPhone and a touch Mac (iPad) to the App Store, others to Google Play", () => {
    expect(storeUrlFor(IPHONE, true)).toBe(APP_STORE_URL);
    expect(storeUrlFor("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", true)).toBe(APP_STORE_URL);
    expect(storeUrlFor(ANDROID, true)).toBe(PLAY_STORE_URL);
  });
});

const url = vi.hoisted(() => ({ search: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {} }),
  usePathname: () => "/create",
  useSearchParams: () => new URLSearchParams(url.search),
}));

function device(coarse: boolean, ua: string) {
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: q === "(pointer: coarse)" ? coarse : false, media: q }));
  Object.defineProperty(navigator, "userAgent", { value: ua, configurable: true });
}

const draw = (locale: "en" | "ar" = "en") => {
  // The provider settles the language from storage on mount, so the choice has to be stored too.
  localStorage.setItem("moedatech.locale", locale);
  return render(
    <LocaleProvider initialLocale={locale}>
      <AppHandoff />
    </LocaleProvider>,
  );
};

beforeEach(() => {
  sessionStorage.clear();
  vi.stubGlobal("fetch", async () =>
    new Response(JSON.stringify({ name: "Al Noor Rentals", logoUrl: null }), { status: 200 }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("<AppHandoff>", () => {
  it("desktop: draws the QR from appLink, store name and initial, and closes on «Continue on web»", async () => {
    url.search = `?supplierId=7&storeId=s1&src=share&appLink=${encodeURIComponent(LINK)}`;
    device(false, DESKTOP);
    draw();
    expect(await screen.findByText(en.appHandoff.title)).toBeTruthy();
    expect(screen.getByRole("img", { name: LINK })).toBeTruthy();
    expect(await screen.findByText("Al Noor Rentals store")).toBeTruthy();
    expect(screen.getAllByText("A")).toHaveLength(2); // the store tile and the QR centre
    expect(screen.getByRole("link", { name: /App Store/ }).getAttribute("target")).toBe("_blank");

    fireEvent.click(screen.getByRole("button", { name: en.appHandoff.continueWeb }));
    expect(screen.queryByText(en.appHandoff.title)).toBeNull();
  });

  it("desktop: a store with a logo shows it in the store line and the QR centre, no initial", async () => {
    vi.stubGlobal("fetch", async () =>
      new Response(JSON.stringify({ name: "Al Noor Rentals", logoUrl: "https://cdn.example/logo.png" }), { status: 200 }),
    );
    url.search = `?storeId=s1&src=share&appLink=${encodeURIComponent(LINK)}`;
    device(false, DESKTOP);
    const { container } = draw();
    await screen.findByText("Al Noor Rentals store");
    const logos = Array.from(container.ownerDocument.querySelectorAll("img")).filter((i) => i.src === "https://cdn.example/logo.png");
    expect(logos).toHaveLength(2);
    expect(screen.queryByText("A")).toBeNull();
  });

  it("desktop: «Continue on web» is the only way out (no close, Escape does nothing)", async () => {
    url.search = `?src=share&appLink=${encodeURIComponent(LINK)}`;
    device(false, DESKTOP);
    draw();
    await screen.findByText(en.appHandoff.title);
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByText(en.appHandoff.title)).toBeTruthy();
  });

  it("desktop: a refresh after «Continue on web» keeps the popup closed (WEB-4)", async () => {
    url.search = `?src=share&appLink=${encodeURIComponent(LINK)}`;
    device(false, DESKTOP);
    draw();
    fireEvent.click(await screen.findByRole("button", { name: en.appHandoff.continueWeb }));
    cleanup();
    draw();
    await waitFor(() => expect(screen.queryByText(en.appHandoff.title)).toBeNull());
  });

  it("desktop without appLink: nothing", async () => {
    url.search = "?supplierId=7&src=share";
    device(false, DESKTOP);
    const { container } = draw();
    await waitFor(() => expect(container.textContent).toBe(""));
  });

  it("phone: Arabic banner, App Store on iPhone, × removes it", async () => {
    url.search = "?supplierId=7&src=share";
    device(true, IPHONE);
    draw("ar");
    expect((await screen.findByTestId("handoff-banner")).textContent).toContain(ar.appHandoff.bannerText);
    expect(screen.getByRole("link", { name: ar.appHandoff.download }).getAttribute("href")).toBe(APP_STORE_URL);
    fireEvent.click(screen.getByRole("button", { name: ar.startRequest.close }));
    expect(screen.queryByTestId("handoff-banner")).toBeNull();
  });

  it("in-app browser: «Open in app» is a real link to appLink; «Continue in browser» shows the banner", async () => {
    url.search = `?src=share&storeId=s1&appLink=${encodeURIComponent(LINK)}`;
    device(true, INSTAGRAM);
    draw();
    const open = await screen.findByRole("link", { name: en.appHandoff.openInApp });
    expect(open.getAttribute("href")).toBe(LINK);
    fireEvent.click(screen.getByRole("button", { name: en.appHandoff.continueBrowser }));
    expect(await screen.findByTestId("handoff-banner")).toBeTruthy();
  });
});
