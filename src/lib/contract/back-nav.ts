/**
 * **Where the renter came from, and what to call it** (owner, 2026-09-03).
 *
 * *"Add a back option on all screens that make sense, like create request will show back to home or
 * back to marketplace or back to browse depending on where he was."*
 *
 * A back control that always says the same thing is a guess. `/create` is reached from the home CTA,
 * from Browse, from a supplier row and from the Marketplace tab, and "Back" alone leaves the renter
 * to remember which. So the label names the DESTINATION, and the destination is the page he actually
 * came from.
 *
 * ── Why a trail and not `router.back()` ─────────────────────────────────────────────────────────
 * `router.back()` would go to the right place and could not NAME it: browser history is opaque to
 * the page. It also walks into whatever preceded the app — a search engine, a mail client — which is
 * not a destination this product can label or should offer.
 *
 * So the shell keeps the last in-app pathname it saw. It is one string, it never leaves the tab, and
 * a cold load simply has none, which is what `fallback` is for.
 *
 * ── NO React, NO DOM ────────────────────────────────────────────────────────────────────────────
 * Naming a route is a decision about the product's vocabulary, and it is tested without a renderer.
 */

/** The routes a back control is allowed to name. Anything else is somewhere we do not send people. */
const NAMED: { prefix: string; key: BackNameKey; exact?: boolean }[] = [
  { prefix: "/", key: "home", exact: true },
  { prefix: "/browse", key: "browse" },
  { prefix: "/requests", key: "marketplace" },
  { prefix: "/suppliers", key: "suppliers" },
  { prefix: "/inbox", key: "inbox" },
  { prefix: "/profile", key: "profile" },
  { prefix: "/stores", key: "browse" },
];

/** ~~`company`~~ — `/company` was retired on 2026-09-04; the firm is part of `/profile` now. */
export type BackNameKey = "home" | "browse" | "marketplace" | "suppliers" | "inbox" | "profile";

/**
 * Which of the named places a path belongs to, or `null`.
 *
 * `/` is EXACT and the rest own their subtree, the same rule the nav's own active-tab test uses: a
 * deal room under `/inbox/…` is still the inbox, but every route in the app starts with `/` and
 * only one of them is home.
 *
 * `/stores/:id` answers "browse", because a store page is a supplier read from the directory and
 * "back to stores" would name a route rather than a place.
 */
export function backNameKey(path: string | null): BackNameKey | null {
  if (!path) return null;
  const clean = path.split("?")[0].split("#")[0];
  for (const r of NAMED) {
    if (r.exact ? clean === r.prefix : clean === r.prefix || clean.startsWith(`${r.prefix}/`)) return r.key;
  }
  return null;
}

/** A path with its query and hash taken off, which is what "the same page" means here. */
const clean = (path: string): string => path.split("?")[0].split("#")[0];

/**
 * Routes the product retired, and which the edge now redirects (`middleware.ts`).
 *
 * They must never be a back TARGET: pressing Back to reach a 308 that lands somewhere else — or,
 * worse, back on the page he pressed it from — reads as a broken control. Duplicated here as
 * prefixes rather than imported, because `middleware.ts` pulls in `next/server` and this module is
 * deliberately dependency-free.
 */
const RETIRED = ["/company", "/compare", "/requests/"];

const retired = (path: string): boolean =>
  RETIRED.some((r) => (r.endsWith("/") ? path.startsWith(r) : path === r || path.startsWith(`${r}/`)));

/**
 * The target a page's back control should point at.
 *
 * ── Any page he was actually on, not only the ones we can name (owner, 2026-09-04) ──────────────
 *
 * *"All back buttons, whether from the web itself or browser, must be wired to the page where he
 * was actually on."*
 *
 * ~~The trail won only when it named one of the places in `NAMED`.~~ That rule came from when the
 * control SAID where it went («Back to browse»): an unnameable page could not be offered because
 * there was no word for it. The label is plain «Back» since 2026-09-03, so the constraint outlived
 * its reason — and it was sending a renter who came from a store's equipment page, or from a legal
 * document, to the page's `fallback` instead of to the page he had just left.
 *
 * Three things still send him to the `fallback` instead:
 *   · no trail at all — a deep link, a fresh tab, a cold reload;
 *   · a trail pointing at THIS page — a reload, or a query-string change on the same route;
 *   · a trail pointing at a route the product retired, which would redirect him elsewhere anyway.
 *
 * The query is KEPT on the href: `/requests?g=…&details=1` is a different view of the workspace, and
 * dropping it would return him to the list rather than to the request he was reading.
 */
export function backTarget(
  here: string | null,
  from: string | null,
  fallback: string,
): { href: string; key: BackNameKey | null } {
  if (from) {
    const there = clean(from);
    if (!retired(there) && there !== clean(here ?? "")) return { href: from, key: backNameKey(from) };
  }
  return { href: fallback, key: backNameKey(fallback) };
}
