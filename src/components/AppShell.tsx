"use client";

import { useState, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useLocale, useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { Icon } from "@/components/ui";
import type { Locale } from "@/lib/i18n/config";

/**
 * App shell for the renter web app (web-app/004, AC-01/02/03/09/25). A left sidebar (Home, Profile,
 * and a Request action — and nothing else: no Requests/Jobs/notifications, AC-02/25) plus a top bar
 * with the page title, the EN/AR toggle, the renter's tier, and an account menu containing Sign out
 * (AC-03/09). Tier-aware onboarding lives on the home hub, not here.
 */
export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  const { locale, setLocale } = useLocale();
  const t = useT();
  const { tier, status, signOut } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleSignOut = async () => {
    setMenuOpen(false);
    await signOut(); // AC-09: end the session…
    router.push("/login"); // …and return to the sign-in screen
  };

  const navItems = [
    { key: "home", icon: "home", label: t.shell.home, href: "/" },
    { key: "profile", icon: "person", label: t.shell.profile, href: "/profile" },
  ];
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <div className="flex min-h-screen">
      {/* Sidebar (AC-02) */}
      <aside className="hidden w-[232px] flex-none flex-col border-e border-border bg-surface px-3 py-4 md:flex">
        <div className="mb-6 flex items-center gap-2.5 px-2 text-[16px] font-extrabold tracking-tight">
          <span className="grid h-[32px] w-[32px] place-items-center rounded-[9px] bg-navy">
            <Icon name="precision_manufacturing" className="text-white" size={18} />
          </span>
          <span>
            MOEDA<span className="text-brand">TECH</span>
          </span>
        </div>
        <nav className="flex flex-col gap-1">
          {navItems.map((it) => (
            <button
              key={it.key}
              onClick={() => router.push(it.href)}
              className={`flex items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-[13.5px] font-semibold transition ${
                isActive(it.href) ? "bg-navy text-white" : "text-navy-mid hover:bg-surface2"
              }`}
            >
              <Icon name={it.icon} size={18} /> {it.label}
            </button>
          ))}
        </nav>
        <button
          onClick={() => router.push("/create")}
          className="mt-4 flex items-center justify-center gap-1.5 rounded-[10px] bg-brand px-3 py-2.5 text-[13.5px] font-bold text-brand-fg transition hover:brightness-[1.04]"
        >
          <Icon name="add" size={18} /> {t.shell.request}
        </button>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar (AC-03) */}
        <header className="sticky top-0 z-30 flex h-[60px] items-center justify-between border-b border-border bg-surface px-6">
          <h1 className="truncate text-[16px] font-extrabold text-navy">{title ?? t.shell.home}</h1>

          <div className="flex items-center gap-2 text-[13px] font-semibold text-navy-mid">
            <span className="inline-flex overflow-hidden rounded-md border border-border">
              {(["en", "ar"] as Locale[]).map((l) => (
                <button
                  key={l}
                  onClick={() => setLocale(l)}
                  className={`px-2.5 py-1 text-xs font-bold ${locale === l ? "bg-navy text-white" : "bg-surface text-muted"}`}
                >
                  {l === "en" ? "EN" : "ع"}
                </button>
              ))}
            </span>
            <span className="rounded-md border border-border bg-surface2 px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted">
              {tier}
            </span>

            {status === "authed" && (
              <div className="relative">
                <button
                  onClick={() => setMenuOpen((o) => !o)}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-xs font-semibold text-muted hover:text-navy"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  aria-label={t.shell.account}
                >
                  <Icon name="account_circle" size={18} />
                  <Icon name="expand_more" size={14} />
                </button>
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
                    <div
                      role="menu"
                      className="absolute end-0 z-40 mt-1 w-44 overflow-hidden rounded-[10px] border border-border bg-surface py-1 shadow-lg"
                    >
                      <button
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false);
                          router.push("/profile");
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-[13px] font-semibold text-navy-mid hover:bg-surface2"
                      >
                        <Icon name="person" size={16} /> {t.shell.profile}
                      </button>
                      <button
                        role="menuitem"
                        onClick={handleSignOut}
                        className="flex w-full items-center gap-2 px-3 py-2 text-[13px] font-semibold text-danger hover:bg-surface2"
                      >
                        <Icon name="logout" size={16} /> {t.auth.signOut}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl px-6 py-7 pb-24">{children}</main>
      </div>
    </div>
  );
}
