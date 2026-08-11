"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui";

/**
 * The app's navigation dock — a floating pill fixed to the bottom of every page, and the only
 * navigation surface there is. It replaces the navy sidebar that stood on the left until the
 * requests-workspace redesign (docs/implementation-plans/requests-workspace/plan.md, phase 0), so
 * desktop and phone now navigate the same way instead of the sidebar/bottom-bar split.
 *
 * The items are handed in split around the centre: the brand button sits between the two halves,
 * raised out of the pill. Direction is not handled here — `document.documentElement.dir` is set from
 * the locale, so the row mirrors itself in Arabic.
 */
export interface DockItem {
  key: string;
  icon: string;
  label: string;
  /** Short form for narrow screens, where the pill has no room for the full label. */
  short?: string;
  href: string;
  /** Unread count; rendered as a small brand pip on the icon. */
  badge?: number;
}

export interface AppDockProps {
  /** Items left of the brand button (in reading order). */
  start: DockItem[];
  /** Items right of it. */
  end: DockItem[];
  /** Where the brand button goes — Home. */
  homeHref: string;
  homeLabel: string;
}

/** Height reserved for the dock, so pages can keep their last row clear of it. */
export const DOCK_CLEARANCE = "pb-28";

export function AppDock({ start, end, homeHref, homeLabel }: AppDockProps) {
  const pathname = usePathname();
  // `/` matches only itself; every other item owns its subtree (`/requests/x` still lights Requests).
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const homeActive = pathname === homeHref;

  return (
    // The outer bar spans the viewport but ignores the pointer, so a page can still be clicked
    // either side of the pill.
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center pb-3 sm:pb-4">
      <nav
        aria-label={homeLabel}
        className="pointer-events-auto flex items-center gap-0.5 rounded-full border border-border bg-surface px-2 py-1.5 shadow-[0_12px_34px_rgba(16,32,52,.18)] sm:gap-1 sm:px-3"
      >
        {start.map((it) => (
          <DockLink key={it.key} item={it} active={isActive(it.href)} />
        ))}

        <Link
          href={homeHref}
          aria-label={homeLabel}
          title={homeLabel}
          aria-current={homeActive ? "page" : undefined}
          // Raised out of the pill and pulled tight on both sides — it reads as the app's own mark
          // rather than as a fifth tab.
          className={`-my-3 mx-1 grid h-[54px] w-[54px] flex-none place-items-center rounded-full bg-navy shadow-[0_8px_20px_rgba(28,53,80,.38)] transition hover:brightness-110 sm:mx-2 ${
            homeActive ? "ring-2 ring-brand ring-offset-2 ring-offset-surface" : ""
          }`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/moedatech-logomark.svg" alt="" className="h-7 w-7 [filter:brightness(0)_invert(1)]" />
        </Link>

        {end.map((it) => (
          <DockLink key={it.key} item={it} active={isActive(it.href)} />
        ))}
      </nav>
    </div>
  );
}

function DockLink({ item, active }: { item: DockItem; active: boolean }) {
  const label = item.short ?? item.label;
  return (
    <Link
      href={item.href}
      title={item.label}
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
      className={`relative flex min-w-0 items-center gap-1.5 rounded-full px-2.5 py-2 text-[12.5px] font-bold transition sm:px-3.5 sm:text-[13px] ${
        active ? "bg-brand-soft text-brand" : "text-navy-mid hover:bg-surface2"
      }`}
    >
      <span className="relative flex-none">
        <Icon name={item.icon} size={20} />
        {item.badge != null && item.badge > 0 && (
          <span className="absolute -end-1.5 -top-1 grid h-[16px] min-w-[16px] place-items-center rounded-full bg-brand px-1 text-[10px] font-extrabold text-white ring-2 ring-surface">
            {item.badge > 99 ? "99+" : item.badge}
          </span>
        )}
      </span>
      {/* The label is what makes the pill readable, but four labelled tabs plus the brand mark do not
          fit a phone — below sm the icons carry it alone. */}
      <span className="hidden max-w-full truncate sm:inline">{label}</span>
    </Link>
  );
}
