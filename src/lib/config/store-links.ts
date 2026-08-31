/**
 * Public app-store listings for the Moedatech renter app.
 *
 * Kept in sync with the mobile app's `AppConstants.appStoreUrl` / `playStoreUrl`
 * (apps/mobile/lib/core/constants/app_constants.dart) — they're the same two
 * listings, so the invite text a renter shares from the web reads identically to
 * one shared from the app.
 */
/**
 * Where a supplier is sent to join — SUP-T01.
 *
 * ONE constant, because the same invitation leaves from two places: the off-platform bid card
 * (`BidCards.tsx`, `t.workspace.inviteMessage`) and, later, the renter's supplier list. Until this
 * existed those two pointed at different pages, so the same supplier invited twice landed twice.
 *
 * It is the live Linktree, which is where suppliers are already sent. If marketing builds
 * `moedatech.net/get` — a user-agent redirect carrying its own preview card and an invite ref —
 * this line is the only edit, and both paths move together.
 */
export const JOIN_URL = "https://linktr.ee/moedatech";

export const APP_STORE_URL = "https://apps.apple.com/il/app/moedatech/id6749363341";
export const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.moedatech.user&pcampaignid=web_share&utm_campaign=268197058-website&utm_source=website&utm_medium=GP-website&utm_term=GP-website&utm_content=GP-website&pli=1";
