import { APP_STORE_URL, PLAY_STORE_URL } from "@/lib/config/store-links";

/**
 * «Request now» from a supplier's public store, arriving on `/create` (Supplier OS
 * `docs/request-now-tickets-web.md`, frames 1a / 1b / 1c).
 *
 * Supplier OS decides the route before the renter gets here: a phone with the app never reaches this
 * page, and a desktop click carries `appLink`, a ChottuLink short link for the QR. Everything here is
 * the web half: which of the three surfaces this visitor sees, decided from the URL, the pointer and
 * the user agent. Pure functions, so the rules are testable without a browser.
 */

export type HandoffSurface = "qr" | "inApp" | "banner" | null;

export type HandoffInput = {
  /** `src` from the URL. Only `share` is a store link. */
  src: string | null;
  /** `appLink` from the URL. Supplier OS sends it on desktop clicks only, and only with app links on. */
  appLink: string | null;
  /** `matchMedia('(pointer: coarse)').matches`: a phone or tablet. */
  coarse: boolean;
  userAgent: string;
  /** The renter closed popup 1a for this `appLink` earlier in this browser session (WEB-4). */
  qrDismissed: boolean;
};

/**
 * Which surface to show.
 *
 * ⚠️ **Desktop is the POINTER, not the width.** A tablet runs the app, so a wide touch screen must
 * get the phone treatment; deciding by breakpoint would hand an iPad a QR to scan with itself.
 *
 * ⚠️ **No `appLink`, no popup.** Its absence is how Supplier OS says app links are off or the mint
 * failed, and the page must then behave exactly as it did before this existed.
 *
 * ⚠️ **1b needs a link to open.** «Open in app» must be a real anchor, and the only app link the web
 * is ever handed is `appLink`. Supplier OS sends that on desktop clicks only today, so on a phone 1b
 * stays dark and the banner covers the visitor instead: a screen whose main button goes nowhere is
 * worse than no screen.
 */
export function handoffSurface({ src, appLink, coarse, userAgent, qrDismissed }: HandoffInput): HandoffSurface {
  if (!coarse) return appLink && !qrDismissed ? "qr" : null;
  if (src !== "share") return null;
  if (appLink && isInAppBrowser(userAgent)) return "inApp";
  return "banner";
}

/**
 * In-app browsers that can stop a link from opening the app.
 *
 * ⚠️ **Not every one can be seen.** WhatsApp on iPhone opens links in an `SFSafariViewController`
 * and on Android in a Chrome Custom Tab; both send the plain browser's user agent. Those visitors get
 * the banner, which the ticket already says must cover "app blocked" as well as "no app".
 */
const IN_APP_UA = /FBAN|FBAV|FB_IAB|Instagram|WhatsApp|Snapchat|musical_ly|BytedanceWebview|TikTok|Line\/|Twitter|LinkedInApp/i;

export function isInAppBrowser(userAgent: string): boolean {
  return IN_APP_UA.test(userAgent);
}

/**
 * The one store this device can install from. iPadOS reports a Mac user agent, so a touch "Mac" is
 * an iPad. Anything else with a touch screen is sent to Google Play.
 */
export function storeUrlFor(userAgent: string, coarse: boolean): string {
  const ios = /iPhone|iPad|iPod/i.test(userAgent) || (coarse && /Macintosh/i.test(userAgent));
  return ios ? APP_STORE_URL : PLAY_STORE_URL;
}

/**
 * WEB-4 (owner, 2026-10-05): after «Continue on web» a refresh keeps popup 1a closed for the rest of
 * the browser session. Keyed by the link itself, so a different machine pressed later in the same
 * session still offers its own QR.
 */
const DISMISS_KEY = "moedatech.appHandoff.dismissed";

export function readQrDismissed(appLink: string | null): boolean {
  if (!appLink) return false;
  try {
    return sessionStorage.getItem(DISMISS_KEY) === appLink;
  } catch {
    return false;
  }
}

export function rememberQrDismissed(appLink: string): void {
  try {
    sessionStorage.setItem(DISMISS_KEY, appLink);
  } catch {
    // Private mode or blocked storage: the popup simply shows again on a refresh.
  }
}
