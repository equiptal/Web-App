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
  { prefix: "/company", key: "company" },
  { prefix: "/inbox", key: "inbox" },
  { prefix: "/profile", key: "profile" },
  { prefix: "/stores", key: "browse" },
];

export type BackNameKey = "home" | "browse" | "marketplace" | "suppliers" | "company" | "inbox" | "profile";

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

/**
 * The target a page's back control should point at.
 *
 * The trail wins when it names a place we can label AND is not the page we are standing on — a
 * renter who reloaded `/create` twice must not be sent to `/create`. Otherwise the page's own
 * `fallback`, which is where that page belongs when nobody can say where he came from.
 */
export function backTarget(
  here: string | null,
  from: string | null,
  fallback: string,
): { href: string; key: BackNameKey | null } {
  const fromKey = backNameKey(from);
  if (from && fromKey && backNameKey(here) !== fromKey) return { href: from, key: fromKey };
  return { href: fallback, key: backNameKey(fallback) };
}
