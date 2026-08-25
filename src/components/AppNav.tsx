"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui";

/**
 * The app's navigation — a row inside the top bar, and the only navigation surface there is.
 *
 * ── Where it has lived, and why it moved twice (owner, 2026-08-25) ───────────────────────────────
 * A navy sidebar on the left until the requests-workspace redesign; then `AppDock`, a floating pill
 * fixed to the foot of every page at every width. Now the header.
 *
 * The dock's own reasoning — one navigation surface instead of a sidebar/bottom-bar split — is
 * unchanged and is why this is a single component rather than two. What changed is the edge. A dock
 * at the foot competes with whatever a page puts there, and on this product that is never furniture:
 * the bid map's price bar, the workspace's export row, the wizard's Back/Next. Every one of them had
 * to reserve `pb-28` to stay clear of it, which is a page paying rent for chrome it did not ask for.
 * The header already exists on every route and already ends in a cluster of controls, so navigation
 * costs nothing there.
 *
 * The brand mark leads it — Home, and the app's own mark rather than a fifth tab.
 *
 * Direction is not handled here: `document.documentElement.dir` is set from the locale, so the row
 * mirrors itself in Arabic.
 */
export interface NavItem {
  key: string;
  icon: string;
  label: string;
  href: string;
  /** Unread count; rendered as a small brand pip on the icon. */
  badge?: number;
}

export interface AppNavProps {
  items: NavItem[];
  /** Where the brand mark goes — Home. */
  homeHref: string;
  homeLabel: string;
}

export function AppNav({ items, homeHref, homeLabel }: AppNavProps) {
  const pathname = usePathname();
  // `/` matches only itself; every other item owns its subtree (`/requests/x` still lights Requests).
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const homeActive = pathname === homeHref;

  return (
    <nav aria-label={homeLabel} className="flex flex-none items-center gap-0.5 sm:gap-1">
      <Link
        href={homeHref}
        aria-label={homeLabel}
        title={homeLabel}
        aria-current={homeActive ? "page" : undefined}
        className={`grid h-9 w-9 flex-none place-items-center rounded-full bg-navy transition hover:brightness-110 ${
          homeActive ? "ring-2 ring-brand ring-offset-2 ring-offset-surface" : ""
        }`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/moedatech-logomark.svg" alt="" className="h-5 w-5 [filter:brightness(0)_invert(1)]" />
      </Link>

      {/* A hairline between the mark and the tabs: the mark is the app, the tabs are places in it. */}
      <span aria-hidden="true" className="mx-1 h-6 w-px flex-none bg-border sm:mx-1.5" />

      {items.map((it) => (
        <NavLink key={it.key} item={it} active={isActive(it.href)} />
      ))}
    </nav>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      title={item.label}
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
      className={`relative flex min-w-0 items-center gap-1.5 rounded-full px-2 py-1.5 text-[12.5px] font-bold transition sm:px-3 sm:text-[13px] ${
        active ? "bg-brand-soft text-brand" : "text-navy-mid hover:bg-surface2"
      }`}
    >
      <span className="relative flex-none">
        <Icon name={item.icon} size={19} />
        {item.badge != null && item.badge > 0 && (
          <span className="absolute -end-1.5 -top-1 grid h-[16px] min-w-[16px] place-items-center rounded-full bg-brand px-1 text-[10px] font-extrabold text-white ring-2 ring-surface">
            {item.badge > 99 ? "99+" : item.badge}
          </span>
        )}
      </span>
      {/* The label is what makes a tab readable, but four labelled tabs plus the mark, the title and
          the account cluster do not fit a phone header — below `lg` the icons carry it alone. That is
          one breakpoint later than the dock needed, because this row shares its bar with the title. */}
      <span className="hidden max-w-full truncate lg:inline">{item.label}</span>
    </Link>
  );
}
