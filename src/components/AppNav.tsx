"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The app's navigation — plain text links, centred in the top bar.
 *
 * ── Where it has lived (owner, 2026-08-25) ──────────────────────────────────────────────────────
 * A navy sidebar on the left; then `AppDock`, a floating pill at the foot of every page; now this.
 * The dock's own reasoning — ONE navigation surface rather than a desktop-sidebar / phone-bottom-bar
 * split — is unchanged and is why this is a single component. What the dock cost was the bottom edge:
 * every page reserved `pb-28` so the pill could not cover its last row, and on this product that row
 * is never furniture (the wizard's Back/Next, the workspace's export, the bid map's price bar).
 *
 * ── Why text, and why only three ────────────────────────────────────────────────────────────────
 * The reference the owner set is a marketing-style bar: a wordmark, three or four unadorned words in
 * the middle, one control on the far side. Icons are what a cramped pill needed to stay readable at
 * 12px; a centred row of words does not need them, and a row of four icon-plus-label pairs reads as a
 * toolbar rather than as the top of a site.
 *
 * PROFILE and INBOX are not here. They became icons in the account cluster on the trailing edge —
 * both are personal rather than places in the product, and the inbox carries a count, which a word
 * cannot. Settings is not here either: it sits in the account menu beside Sign out.
 *
 * The ACTIVE link is navy with a rule under it, the rest muted. That is the reference's own emphasis,
 * and it is the only one it uses — no pill, no fill.
 *
 * Direction is not handled here: `document.documentElement.dir` is set from the locale, so the row
 * mirrors itself in Arabic.
 */
export interface NavItem {
  key: string;
  label: string;
  href: string;
}

export function AppNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  // `/` matches only itself; every other item owns its subtree (`/requests/x` still lights Requests).
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <nav className="flex items-center gap-5 lg:gap-8">
      {items.map((it) => {
        const active = isActive(it.href);
        return (
          <Link
            key={it.key}
            href={it.href}
            aria-current={active ? "page" : undefined}
            className={`relative whitespace-nowrap py-1 text-[14px] transition ${
              active ? "font-extrabold text-navy" : "font-semibold text-muted hover:text-navy-mid"
            }`}
          >
            {it.label}
            {/* The rule is drawn rather than a border, so an inactive link reserves no space for one
                and the row does not shift by a pixel when the active item changes. */}
            {active && <span aria-hidden="true" className="absolute inset-x-0 -bottom-0.5 h-[2px] rounded-full bg-navy" />}
          </Link>
        );
      })}
    </nav>
  );
}
