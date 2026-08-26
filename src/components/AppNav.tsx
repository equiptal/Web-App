"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui";
import { CloseIcon, MenuIcon } from "@/components/HeaderIcons";
import { useT } from "@/lib/i18n";

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
 * ── On a phone ──────────────────────────────────────────────────────────────────────────────────
 * This row does not fit one, and squeezing it to icons would be the toolbar the design is
 * deliberately not. {@link AppNavMobile} takes over below `lg`: the same three places, same active
 * rule, stacked in a sheet under the bar.
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
    <nav className="flex items-center gap-1">
      {items.map((it) => {
        const active = isActive(it.href);
        return (
          <Link
            key={it.key}
            href={it.href}
            aria-current={active ? "page" : undefined}
            /* ── A PILL, on the navy bar (owner, 2026-08-26) ──────────────────────────────────
               His reference draws the place you are on as a white lozenge and the others as plain
               light text. It replaced a 2px rule under the active word, which was the right answer on
               a white bar and nearly invisible on a dark one.

               Both states carry the same padding, so the row does not shift by a pixel when the
               active item changes — which is what the drawn rule was protecting. */
            className={`whitespace-nowrap rounded-full px-4 py-1.5 text-[14px] transition ${
              active ? "bg-white font-extrabold text-navy" : "font-semibold text-white/70 hover:bg-white/10 hover:text-white"
            }`}
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * The same navigation, for a bar too narrow to hold it (owner, 2026-08-25: "make this header or nav
 * bar responsive to phone").
 *
 * ── The bug this closes ─────────────────────────────────────────────────────────────────────────
 * `AppDock` was visible at every width. Moving navigation into the header and hiding the row below
 * `lg` left a phone with no way to reach Requests or My Organization at all — only the logomark,
 * which goes Home. That is a regression the move introduced, not a limitation of the design.
 *
 * ── Why a sheet and not an icon rail ────────────────────────────────────────────────────────────
 * Three icons in the bar would read as a toolbar, which is the thing the owner moved away from when
 * the dock went. A button that opens a stack keeps the bar quiet and keeps the words — a phone has
 * the vertical room for full labels that a 62px row does not have horizontally.
 *
 * `children` is for controls that belong in the bar on a desktop and cannot afford its width on a
 * phone — today, the EN/AR toggle. They sit under a rule at the foot, below the places.
 */
export function AppNavMobile({ items, children }: { items: NavItem[]; children?: ReactNode }) {
  const t = useT();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  // Navigating is the point of the sheet, so arriving somewhere closes it. Keyed on the path rather
  // than on the click, so a link followed from INSIDE `children` closes it too.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={t.shell.menu}
        aria-expanded={open}
        aria-haspopup="menu"
        className="grid h-[34px] w-[34px] place-items-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
      >
        {/* 34px box, 20px glyph — the bar's one size for a standalone icon control, shared with the
            inbox, the bell, the avatar and Back. */}
        {open ? <CloseIcon /> : <MenuIcon />}
      </button>

      {open && (
        <>
          {/* Under the sheet but over the page. The header is z-30, and the sheet has to clear it. */}
          <div className="fixed inset-0 top-[62px] z-30 bg-navy/20" onClick={() => setOpen(false)} />
          {/* Pinned to the VIEWPORT's edges rather than the button's, so it spans the bar's full
              width whichever end the button sits at — the row mirrors itself in Arabic. */}
          <div
            role="menu"
            className="fixed inset-x-0 top-[62px] z-40 border-b border-border bg-surface px-4 py-2 shadow-lg sm:px-7"
          >
            {items.map((it) => {
              const active = isActive(it.href);
              return (
                <Link
                  key={it.key}
                  href={it.href}
                  role="menuitem"
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center justify-between rounded-[10px] px-3 py-3 text-[15px] transition ${
                    active ? "bg-surface2 font-extrabold text-navy" : "font-semibold text-navy-mid hover:bg-surface2"
                  }`}
                >
                  {it.label}
                  {/* The rule under a desktop link cannot survive a stack; the mark is what carries
                      the active state here, alongside the weight both surfaces share. */}
                  {active && <Icon name="check" size={18} className="text-navy" />}
                </Link>
              );
            })}
            {children && <div className="mt-2 flex items-center gap-3 border-t border-border px-3 pb-1 pt-3">{children}</div>}
          </div>
        </>
      )}
    </div>
  );
}
