"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useLocale, useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { Icon } from "@/components/ui";
import type { Locale } from "@/lib/i18n/config";
import { SurveyProvider } from "@/components/surveys/SurveyProvider";
import { AuthGateProvider, useAuthGate } from "@/components/auth/AuthGate";
import { fetchDealRoomUnread } from "@/lib/api/client";
import { canSeeProcurementDashboard } from "@/lib/access/dashboard";
import { NotificationsBell } from "@/components/NotificationsBell";

/**
 * App shell for the renter web app (web-app/004, AC-01/02/03/09/25). Navy sidebar (brand, a Request
 * action, Home + Profile nav, and a tier-status footer card that nudges guest→profile / basic→verify
 * — AC-06/08) plus a top bar with a "Welcome, {name}" greeting, the EN/AR toggle, and an avatar
 * account menu with Sign out (AC-03/09). No Requests/Jobs/notifications surfaces (AC-25).
 */
type AppShellProps = { children: ReactNode; title?: string; fullBleed?: boolean; wide?: boolean };

/** A page can show a Back arrow in the top bar (beside the title) by registering a handler. */
const BackContext = createContext<(fn: (() => void) | null) => void>(() => {});
export function useHeaderBack(handler: (() => void) | null) {
  const register = useContext(BackContext);
  useEffect(() => {
    register(handler);
    return () => register(null);
  }, [handler, register]);
}

/** Public shell: hosts the Outcome Survey gate + the app-wide auth-gate modal (public-web has no
 *  `/login` page — sign-in/register is a modal fired by actions), so the chrome and pages can use both. */
export function AppShell(props: AppShellProps) {
  return (
    <SurveyProvider>
      <AuthGateProvider>
        <AppShellInner {...props} />
      </AuthGateProvider>
    </SurveyProvider>
  );
}

function AppShellInner({ children, title, fullBleed, wide }: AppShellProps) {
  const { locale, setLocale } = useLocale();
  const t = useT();
  const { tier, status, signOut, user } = useSession();
  const { openAuth } = useAuthGate();
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [name, setName] = useState("");
  // A child page may register a Back handler to show an arrow in the top bar beside the title.
  const [back, setBack] = useState<(() => void) | null>(null);
  const registerBack = useCallback((fn: (() => void) | null) => setBack(() => fn), []);
  // Collapsible sidebar — persisted so the choice sticks across navigations. Default expanded on first
  // render (server + first client paint match), then honor the stored preference after mount.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try { setCollapsed(localStorage.getItem("sb-collapsed") === "1"); } catch {}
  }, []);
  const toggleCollapsed = () =>
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem("sb-collapsed", next ? "1" : "0"); } catch {}
      return next;
    });

  // The signed-in renter's display name (for the greeting + avatar initials) comes from /api/me.
  useEffect(() => {
    if (status !== "authed") return;
    fetch("/api/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: { user?: { firstName?: string; lastName?: string } }) => {
        setName([d.user?.firstName, d.user?.lastName].filter(Boolean).join(" "));
      })
      .catch(() => setName(""));
  }, [status]);

  // Unread deal-room messages (inbox badge) — role-scoped total from the app-backend.
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (status !== "authed") return;
    let active = true;
    fetchDealRoomUnread().then((r) => active && setUnread(r.total)).catch(() => {});
    return () => { active = false; };
  }, [status]);

  const handleSignOut = async () => {
    setMenuOpen(false);
    await signOut(); // AC-09
    router.push("/login");
  };

  // `gated` items are the personal, account-bound areas (mirror middleware's GATED_PREFIXES). The web
  // is public to browse, so signed-out visitors only see the public nav; the rest appears once authed.
  const allNav = [
    { key: "home", icon: "home", label: t.shell.home, href: "/", gated: false },
    { key: "requests", icon: "grid_view", label: t.shell.requests, href: "/requests", gated: true },
    { key: "compare", icon: "compare_arrows", label: t.shell.compare, href: "/compare", gated: true },
    // Procurement dashboard is a demo surface — only the CCC mock account sees it.
    ...(canSeeProcurementDashboard(user) ? [{ key: "dashboard", icon: "dashboard", label: t.shell.dashboard, href: "/dashboard", gated: true }] : []),
    { key: "inbox", icon: "inbox", label: t.shell.inbox, href: "/inbox", gated: true },
    { key: "profile", icon: "person", label: t.shell.profile, href: "/profile", gated: true },
  ];
  // All tabs are visible to everyone (guests included) — each account-bound tab renders a guest
  // empty-state + CTA rather than being hidden, so the site feels open and there are no dead ends.
  const navItems = allNav;
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const initials = (name.trim() ? name.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("") : "").toUpperCase();
  const greeting = `${t.shell.welcome}${name ? `, ${name}` : ""}`;
  // Tier badge beside the avatar: green = verified, blue = basic, grey = guest.
  const tierBadge: Record<string, { label: string; cls: string }> = {
    verified: { label: t.shell.tierVerified, cls: "border-ok/30 bg-ok-soft text-ok" },
    basic: { label: t.shell.tierBasic, cls: "border-info/30 bg-info-soft text-info" },
    guest: { label: t.shell.tierGuest, cls: "border-border bg-surface2 text-muted" },
  };
  const badge = tierBadge[tier] ?? tierBadge.guest;

  return (
    <BackContext.Provider value={registerBack}>
    <div className="flex min-h-screen">
      {/* Sidebar (navy) — AC-02. Sticky full-height so the tier card stays in view (no page-scroll). */}
      <aside className={`hidden flex-none flex-col self-start bg-gradient-to-b from-[#1e3a5f] to-[#0f1e2e] py-5 text-white transition-[width] duration-200 md:flex md:sticky md:top-0 md:h-screen md:overflow-y-auto ${collapsed ? "w-[68px] px-2" : "w-[232px] px-3.5"}`}>
        <div className={`flex items-center pb-2 pt-1 ${collapsed ? "justify-center px-0" : "justify-between px-2"}`}>
          {!collapsed && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src="/moedatech-logo.png" alt="Moedatech" className="h-8 w-auto [filter:brightness(0)_invert(1)]" />
          )}
          <button
            onClick={toggleCollapsed}
            className="grid h-8 w-8 flex-none place-items-center rounded-[9px] text-white/70 transition hover:bg-white/[.08] hover:text-white"
            aria-label={collapsed ? t.shell.expandSidebar : t.shell.collapseSidebar}
            aria-expanded={!collapsed}
            title={collapsed ? t.shell.expandSidebar : t.shell.collapseSidebar}
          >
            <Icon name={collapsed ? "chevron_right" : "chevron_left"} size={20} />
          </button>
        </div>

        <nav className="mt-2 flex flex-col gap-0.5">
          {navItems.map((it) => (
            <Link
              key={it.key}
              href={it.href}
              title={collapsed ? it.label : undefined}
              className={`flex items-center rounded-[10px] py-2.5 text-[13.5px] font-bold transition ${collapsed ? "justify-center px-0" : "gap-3 px-3"} ${
                isActive(it.href) ? "bg-white/10 text-white shadow-[inset_3px_0_0_#f79009]" : "text-white/70 hover:bg-white/[.06] hover:text-white"
              }`}
            >
              <Icon name={it.icon} size={21} /> {!collapsed && it.label}
            </Link>
          ))}
        </nav>

        {/* Tier-status footer card (AC-06/08) — hidden when collapsed (no room for the CTA) and for
            signed-out visitors (its guest→profile nudge assumes a session). */}
        {!collapsed && status === "authed" && <TierCard tier={tier} onGo={(href) => router.push(href)} />}
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar — AC-03 */}
        <header className="sticky top-0 z-30 flex h-[62px] items-center gap-3 border-b border-border bg-surface px-4 sm:px-7">
          {back && (
            <button
              onClick={back}
              aria-label={locale === "ar" ? "رجوع" : "Back"}
              className="grid h-9 w-9 flex-none place-items-center rounded-full border border-border text-navy transition hover:bg-surface2"
            >
              <Icon name={locale === "ar" ? "arrow_forward" : "arrow_back"} size={20} />
            </button>
          )}
          <b className="truncate text-[19px] font-extrabold tracking-[-.4px] text-navy">
            {title ?? (
              <>
                {greeting} <span className="wave-emoji">👋</span>
              </>
            )}
          </b>

          <div className="ms-auto flex items-center gap-3 text-[13px] font-semibold text-navy-mid">
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

            {/* Signed-out visitors browse freely; this opens the auth modal (no /login page). */}
            {status === "anon" && (
              <button
                onClick={() => openAuth()}
                className="inline-flex items-center gap-1.5 rounded-full bg-brand px-3.5 py-1.5 text-[12.5px] font-bold text-white transition hover:brightness-105"
              >
                <Icon name="login" size={16} /> {t.shell.signIn}
              </button>
            )}

            {status === "authed" && (
              <span className={`hidden rounded-full border px-2.5 py-1 text-[11px] font-bold sm:inline-flex ${badge.cls}`}>{badge.label}</span>
            )}

            {status === "authed" && (
              <button
                onClick={() => router.push("/inbox")}
                className="relative grid h-9 w-9 place-items-center rounded-full text-navy-mid transition hover:bg-surface2"
                aria-label={t.shell.inbox}
                title={t.shell.inbox}
              >
                <Icon name="inbox" size={20} />
                {unread > 0 && (
                  <span className="absolute -end-0.5 -top-0.5 grid h-[17px] min-w-[17px] place-items-center rounded-full bg-brand px-1 text-[10px] font-extrabold text-white ring-2 ring-surface">{unread > 99 ? "99+" : unread}</span>
                )}
              </button>
            )}

            {status === "authed" && <NotificationsBell />}

            {status === "authed" && (
              <div className="relative">
                <button
                  onClick={() => setMenuOpen((o) => !o)}
                  className="grid h-9 w-9 place-items-center rounded-full bg-surface3 text-[13px] font-bold text-navy"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  aria-label={t.shell.account}
                >
                  {initials || <Icon name="account_circle" size={22} />}
                </button>
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
                    <div role="menu" className="absolute end-0 z-40 mt-1 w-44 overflow-hidden rounded-[10px] border border-border bg-surface py-1 shadow-lg">
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

        {/* pb-24 keeps the wizard's Back/Next footer clear of the fixed mobile bottom-nav. The nav is
            only hidden at md+, so keep the bottom padding large until md (sm:py-7 alone would shrink
            it at 640–767px while the nav is still showing, hiding the footer under it). */}
        {/* One consistent page container across the app (T1/T2): My Requests' 1440px width + a slightly
            larger horizontal gutter so content isn't flush to the sidebar / page edge. `wide` stays
            uncapped (My Requests caps itself at 1440 via .rproto). */}
        <main className={fullBleed ? "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" : `mx-auto w-full px-6 py-6 pb-24 sm:px-12 sm:pt-7 md:py-7 lg:px-20 xl:px-28 ${wide ? "max-w-none" : "max-w-[1440px]"}`}>{children}</main>
      </div>

      {/* Mobile bottom nav — the navy sidebar is desktop-only, so phones navigate from here. */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-surface md:hidden">
        {navItems.map((it) => (
          <Link
            key={it.key}
            href={it.href}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-bold transition ${
              isActive(it.href) ? "text-brand" : "text-muted"
            }`}
          >
            <Icon name={it.icon} size={22} /> {it.label}
          </Link>
        ))}
      </nav>
    </div>
    </BackContext.Provider>
  );
}

/** Sidebar tier-status card: tier label + progress + a tier-appropriate CTA (AC-06/08). */
function TierCard({ tier, onGo }: { tier: string; onGo: (href: string) => void }) {
  const t = useT();
  const verified = tier === "verified";
  const guest = tier === "guest";
  const label = verified ? t.shell.tierVerified : guest ? t.shell.tierGuest : t.shell.tierBasic;
  const pct = verified ? 100 : guest ? 33 : 66;
  const note = verified ? t.shell.verifiedNote : guest ? t.shell.stepsGuest : t.shell.stepsBasic;

  return (
    <div className="mt-auto rounded-[14px] border border-white/10 bg-white/[.06] p-3.5">
      <div className="flex items-center gap-1.5 text-[12.5px] font-extrabold">
        <Icon name={verified ? "verified" : "workspace_premium"} size={17} className={verified ? "text-ok" : "text-[#FCD9A0]"} /> {label}
      </div>
      <div className="my-[11px] mb-1.5 h-[5px] overflow-hidden rounded-full bg-white/[.14]">
        <div className={`h-full rounded-full ${verified ? "bg-ok" : "bg-brand"}`} style={{ width: `${pct}%` }} />
      </div>
      <small className="block text-[11px] leading-snug text-white/55">{note}</small>
      {!verified && (
        <button
          onClick={() => onGo(guest ? "/onboarding" : "/verify")}
          className="mt-[11px] w-full rounded-[10px] bg-brand px-3 py-2 text-[12px] font-bold text-white"
        >
          {guest ? t.home.nudgeGuestCta : t.home.nudgeBasicCta}
        </button>
      )}
    </div>
  );
}
