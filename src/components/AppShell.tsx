"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { Icon } from "@/components/ui";
import type { Locale } from "@/lib/i18n/config";
// DISABLED — Outcome Survey feature switched off. See docs/surveys-disabled.md.
// import { SurveyProvider } from "@/components/surveys/SurveyProvider";
import { AuthGateProvider, useAuthGate } from "@/components/auth/AuthGate";
import { PUBLIC_WEB_ENABLED } from "@/lib/flags";
import { fetchDealRoomUnread } from "@/lib/api/client";
import { canSeeProcurementDashboard } from "@/lib/access/dashboard";
import { NotificationsBell } from "@/components/NotificationsBell";
import { AppDock, DOCK_CLEARANCE, type DockItem } from "@/components/AppDock";

/**
 * App shell for the renter web app (web-app/004, AC-01/02/03/09/25). A top bar with a
 * "Welcome, {name}" greeting, the EN/AR toggle, and an avatar account menu with Sign out
 * (AC-03/09), over a page column that ends in the floating {@link AppDock}.
 *
 * The navy sidebar that used to stand on the left is gone (requests-workspace plan, phase 0). It
 * carried three things and each has a new home: the nav is the dock, which every screen size now
 * shares instead of desktop-sidebar / phone-bottom-bar; the tier-status nudge (AC-06/08) moved into
 * the account menu, where the rest of the account already lives; and the brand mark is the dock's
 * centre button.
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

/** Public shell: hosts the app-wide auth-gate modal (public-web has no `/login` page — sign-in/register
 *  is a modal fired by actions), so the chrome and pages can use it.
 *  DISABLED: the Outcome Survey gate that used to wrap this is commented out — that <SurveyProvider>
 *  was the ONLY survey trigger (it polled /api/me/surveys/pending on auth and auto-opened the modal
 *  once per browser session). See docs/surveys-disabled.md. */
export function AppShell(props: AppShellProps) {
  return (
    // <SurveyProvider>
      <AuthGateProvider>
        <AppShellInner {...props} />
      </AuthGateProvider>
    // </SurveyProvider>
  );
}

function AppShellInner({ children, title, fullBleed, wide }: AppShellProps) {
  const { locale, setLocale } = useLocale();
  const t = useT();
  const { tier, status, signOut, user, refresh: refreshSession } = useSession();
  const { openAuth } = useAuthGate();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [name, setName] = useState("");
  // A child page may register a Back handler to show an arrow in the top bar beside the title.
  const [back, setBack] = useState<(() => void) | null>(null);
  const registerBack = useCallback((fn: (() => void) | null) => setBack(() => fn), []);

  // Read through a ref so the /api/me effect below can compare against the CURRENT tier without
  // listing `tier` as a dependency — that would re-fire the fetch on every tier change, and since
  // the effect itself can change the tier (via refreshSession) that's a needless extra round-trip.
  const tierRef = useRef(tier);
  tierRef.current = tier;

  // The signed-in renter's display name (for the greeting + avatar initials) comes from /api/me.
  useEffect(() => {
    if (status !== "authed") return;
    fetch("/api/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: { user?: { firstName?: string; lastName?: string; tier?: string } }) => {
        setName([d.user?.firstName, d.user?.lastName].filter(Boolean).join(" "));
        // /api/me re-stamped the cookie from a fresh read; if the tier moved (e.g. this member was
        // just approved into a verified company), pull it into the live session so the sidebar card
        // and the verified-only gates update now instead of on the next navigation.
        if (d.user?.tier && d.user.tier !== tierRef.current) void refreshSession();
      })
      .catch(() => setName(""));
    // `refreshSession` is a stable useCallback([]) from SessionProvider, so listing it can't re-fire
    // this effect; `tier` is deliberately read via tierRef instead of being a dependency.
  }, [status, refreshSession]);

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
    // Public web: no /login page — a signed-out user lands on the public home and browses as a guest
    // (auth is the modal form on the next gated action). Legacy/prod: back to the /login gate.
    router.push(PUBLIC_WEB_ENABLED ? "/" : "/login");
  };

  // The dock carries four tabs around the brand mark, and Home is the mark itself. Every tab is
  // visible to everyone, guests included — each account-bound surface renders a guest empty-state and
  // a sign-in CTA rather than being hidden, so the site feels open and there are no dead ends.
  //
  // Procurement dashboard is a demo surface, so only the CCC mock account sees its tab.
  const dockStart: DockItem[] = [
    ...(canSeeProcurementDashboard(user)
      ? [{ key: "dashboard", icon: "dashboard", label: t.shell.dashboard, short: t.shell.dashboardShort, href: "/dashboard" }]
      : []),
    { key: "requests", icon: "grid_view", label: t.shell.requests, href: "/requests" },
  ];
  const dockEnd: DockItem[] = [
    { key: "inbox", icon: "inbox", label: t.shell.inbox, href: "/inbox", badge: unread },
    { key: "profile", icon: "person", label: t.shell.profile, href: "/profile" },
  ];
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
      {/* Main column — the whole page now; navigation is the dock at the foot of it. */}
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
          <b className="min-w-0 flex-1 truncate text-[19px] font-extrabold tracking-[-.4px] text-navy">
            {title ?? (
              <>
                {greeting} <span className="wave-emoji">👋</span>
              </>
            )}
          </b>

          <div className="ms-auto flex flex-none items-center gap-2 text-[13px] font-semibold text-navy-mid sm:gap-3">
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

            {/* The Inbox lived here as well as in the nav while the nav was a sidebar. The dock puts
                it in reach on every screen size and carries the same unread badge, so a second one in
                the top bar would only be a second place to read the same number. */}
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
                    <div role="menu" className="absolute end-0 z-40 mt-1 w-[260px] overflow-hidden rounded-[12px] border border-border bg-surface py-1 shadow-lg">
                      {/* The tier nudge (AC-06/08) came off the sidebar and landed here, where the rest
                          of the account already is. Verified accounts have nothing to be nudged towards,
                          so it renders only below that. */}
                      {tier !== "verified" && (
                        <div className="px-2 pb-1 pt-2">
                          <TierCard
                            tier={tier}
                            onGo={(href) => {
                              setMenuOpen(false);
                              router.push(href);
                            }}
                            onCompleteProfile={() => {
                              setMenuOpen(false);
                              openAuth();
                            }}
                          />
                        </div>
                      )}
                      <button
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false);
                          router.push("/company");
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-[13px] font-semibold text-navy-mid hover:bg-surface2"
                      >
                        <Icon name="business_center" size={16} /> {t.shell.company}
                      </button>
                      {/* Compare had a home here while it was still its own page. It is a tab of the
                          requests workspace now (docs/requests-workspace-disabled.md), reached by
                          the Requests tab in the dock, so a second entry to the same thing is gone. */}
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

        {/* `DOCK_CLEARANCE` keeps the last row of a page — the wizard's Back/Next footer, a card's
            actions — clear of the floating dock, which now covers the foot of the viewport at every
            width (it used to be a phone-only bar hidden from md up).
            One consistent page container across the app (T1/T2): My Requests' 1440px width and a
            generous gutter. `wide` stays uncapped (My Requests caps itself at 1440 via .rproto). */}
        <main
          className={
            fullBleed
              ? `flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${DOCK_CLEARANCE}`
              : `mx-auto w-full px-6 py-6 ${DOCK_CLEARANCE} sm:px-12 sm:pt-7 md:py-7 lg:px-20 xl:px-28 ${wide ? "max-w-none" : "max-w-[1440px]"}`
          }
        >
          {children}
        </main>
      </div>

      <AppDock start={dockStart} end={dockEnd} homeHref="/" homeLabel={t.shell.home} />
    </div>
    </BackContext.Provider>
  );
}

/** Tier-status card: tier label + progress + a tier-appropriate CTA (AC-06/08). It stood at the foot
 *  of the sidebar; it now sits at the head of the account menu, so it keeps its dark treatment. */
function TierCard({ tier, onGo, onCompleteProfile }: { tier: string; onGo: (href: string) => void; onCompleteProfile: () => void }) {
  const t = useT();
  const verified = tier === "verified";
  const guest = tier === "guest";
  const label = verified ? t.shell.tierVerified : guest ? t.shell.tierGuest : t.shell.tierBasic;
  const pct = verified ? 100 : guest ? 33 : 66;
  const note = verified ? t.shell.verifiedNote : guest ? t.shell.stepsGuest : t.shell.stepsBasic;

  return (
    <div className="rounded-[12px] bg-navy p-3.5 text-white">
      <div className="flex items-center gap-1.5 text-[12.5px] font-extrabold">
        <Icon name={verified ? "verified" : "workspace_premium"} size={17} className={verified ? "text-ok" : "text-[#FCD9A0]"} /> {label}
      </div>
      <div className="my-[11px] mb-1.5 h-[5px] overflow-hidden rounded-full bg-white/[.14]">
        <div className={`h-full rounded-full ${verified ? "bg-ok" : "bg-brand"}`} style={{ width: `${pct}%` }} />
      </div>
      <small className="block text-[11px] leading-snug text-white/55">{note}</small>
      {!verified && (
        <button
          // Basic → /company (the hub: create your own company by verifying, OR join one with an
          // invite code) rather than dropping straight into the verification form.
          //
          // A GUEST opens the account modal instead of navigating. It is the only profile-creation
          // surface: `hasGuestSession` lands them straight on the profile step with email REQUIRED,
          // keeping the "every account ends with both phone + email" invariant. This used to push to
          // /onboarding, which rendered the same form with `requireEmail` defaulted off — so the one
          // route that skipped the email requirement was the one the chrome linked to.
          onClick={() => (guest ? onCompleteProfile() : onGo("/company"))}
          className="mt-[11px] w-full rounded-[10px] bg-brand px-3 py-2 text-[12px] font-bold text-white"
        >
          {guest ? t.home.nudgeGuestCta : t.home.nudgeBasicCta}
        </button>
      )}
    </div>
  );
}
