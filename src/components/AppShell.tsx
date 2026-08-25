"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLocale, useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { Icon } from "@/components/ui";
import type { Locale } from "@/lib/i18n/config";
// DISABLED — Outcome Survey feature switched off. See docs/surveys-disabled.md.
// import { SurveyProvider } from "@/components/surveys/SurveyProvider";
import { AuthGateProvider, useAuthGate } from "@/components/auth/AuthGate";
import { PUBLIC_WEB_ENABLED } from "@/lib/flags";
import { fetchDealRoomUnread } from "@/lib/api/client";
import { NotificationsBell } from "@/components/NotificationsBell";
import { AppNav, AppNavMobile, type NavItem } from "@/components/AppNav";

/**
 * App shell for the renter web app (web-app/004, AC-01/02/03/09/25). One bar across the top holding
 * the app's mark, its four tabs ({@link AppNav}), the page's title, the EN/AR toggle, notifications
 * and an avatar account menu with Sign out (AC-03/09). Below it, the page.
 *
 * ── Navigation has moved twice, and each move deleted something ─────────────────────────────────
 * A navy SIDEBAR stood on the left until the requests-workspace redesign, which replaced it with
 * `AppDock` — a floating pill at the foot of every page — so desktop and phone would stop navigating
 * two different ways. That much stands. What the dock cost was the bottom edge: every page reserved
 * `pb-28` so the pill could not cover its last row, and on this product that row is never furniture
 * (the wizard's Back/Next, the bid map's price bar, the workspace's export).
 *
 * The header already spans every route and already ends in a cluster of controls, so navigation
 * costs nothing there — and the foot of a page belongs to the page again (owner, 2026-08-25).
 *
 * The sidebar's other two jobs kept their newer homes: the tier-status nudge (AC-06/08) sits in the
 * account menu with the rest of the account, and the brand mark leads the nav row.
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
  const { tier, status, signOut, refresh: refreshSession } = useSession();
  const { openAuth } = useAuthGate();
  const router = useRouter();
  const pathname = usePathname();
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

  /**
   * The page's title now names the BROWSER TAB rather than a slot in the bar (owner, 2026-08-25).
   *
   * Eleven pages pass one, and the bar no longer prints it; dropping the prop would have thrown that
   * away and left eleven call sites lying. A tab is where a title still earns its place — it is how
   * you find this page among twenty others. The suffix is the same one `layout.tsx` sets as its
   * metadata template, so a shell page and a static one read alike.
   *
   * These pages are client components, so Next's metadata export is not open to them; this is.
   */
  useEffect(() => {
    if (!title) return;
    const prev = document.title;
    document.title = `${title} — Moedatech`;
    return () => { document.title = prev; };
  }, [title]);

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

  // ── The three places, and the two icons (owner, 2026-08-25) ─────────────────────────────────────
  // The nav names PLACES IN THE PRODUCT and nothing else. Every one is visible to everyone, guests
  // included — each account-bound surface renders a guest empty-state and a sign-in CTA rather than
  // being hidden, so the site feels open and there are no dead ends.
  //
  // DASHBOARD points at `/`, the home hub under the name the owner uses for it. Deliberately NOT
  // `/dashboard`: that route is the procurement demo and `canSeeProcurementDashboard` returns false
  // for every account in production, so a link there would be a dead end for everyone.
  //
  // NOT HERE, and each for its own reason: INBOX is an icon in the account cluster, because it
  // carries a count and a word cannot; PROFILE is the avatar beside it; SETTINGS is inside that
  // avatar's menu, next to Sign out, where a reader looks for it.
  const navItems: NavItem[] = [
    { key: "dashboard", label: t.shell.dashboard, href: "/" },
    { key: "requests", label: t.shell.requests, href: "/requests" },
    { key: "company", label: t.shell.company, href: "/company" },
  ];
  const initials = (name.trim() ? name.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("") : "").toUpperCase();
  // Tier badge beside the avatar: green = verified, blue = basic, grey = guest.
  const tierBadge: Record<string, { label: string; cls: string }> = {
    verified: { label: t.shell.tierVerified, cls: "border-ok/30 bg-ok-soft text-ok" },
    basic: { label: t.shell.tierBasic, cls: "border-info/30 bg-info-soft text-info" },
    guest: { label: t.shell.tierGuest, cls: "border-border bg-surface2 text-muted" },
  };
  const badge = tierBadge[tier] ?? tierBadge.guest;

  return (
    <BackContext.Provider value={registerBack}>
    {/* `fullBleed` pins the shell to EXACTLY the viewport instead of merely filling it. `min-h-screen`
        alone lets the page grow past the fold, and on a surface whose own footer is the last thing in
        the column — the bid map's price bar — the page's scrollbar is what takes that bar off screen.
        A full-bleed surface owns its own scrolling regions (the equipment list, the map); the PAGE
        must have none. Paged layouts keep `min-h-screen` and keep scrolling normally.

        KEPT ACROSS THE REDESIGN MERGE (2026-08-25). The redesign rewrote this element to drop the
        sidebar, and had no reason to carry the pin — it forked on 2026-08-13 and the pin landed on
        08-19 — so taking its side wholesale would have quietly reopened the bug the pin fixes. The
        dock shell is the redesign's; the conditional is staging's. */}
    <div className={`flex ${fullBleed ? "h-dvh overflow-hidden" : "min-h-screen"}`}>
      {/* Main column — the whole page; navigation is the row in its header. */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* ── Top bar (AC-03), and the app's navigation (owner, 2026-08-25) ──────────────────────
            The mark and the tabs lead the row, then the page's own title, then the account cluster.
            That order is the reference's and it is also the right one: what the app IS does not
            change, so it sits where the eye starts; what the page is changes with every route. */}
        <header className="sticky top-0 z-30 flex h-[62px] items-center gap-3 border-b border-border bg-surface px-4 sm:px-7 relative">
          {back && (
            <button
              onClick={back}
              aria-label={locale === "ar" ? "رجوع" : "Back"}
              className="grid h-9 w-9 flex-none place-items-center rounded-full border border-border text-navy transition hover:bg-surface2"
            >
              <Icon name={locale === "ar" ? "arrow_forward" : "arrow_back"} size={20} />
            </button>
          )}

          {/* The LOGOMARK on its navy disc — the mark the navigation has carried since the dock, not
              the wordmark (owner, 2026-08-25). It is Home.

              No active ring on it, though it points at `/`: Dashboard names that destination in the
              row beside it and already carries the state. Two marks for one place is one too many. */}
          <Link
            href="/"
            aria-label={t.shell.home}
            className="grid h-9 w-9 flex-none place-items-center rounded-full bg-navy transition hover:brightness-110"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/moedatech-logomark.svg" alt="Moedatech" className="h-5 w-5 [filter:brightness(0)_invert(1)]" />
          </Link>

          {/* ── The nav sits DEAD CENTRE of the bar, not after the title ────────────────────────────
              Absolutely placed, so it is centred on the HEADER rather than on whatever space the
              title and the cluster happen to leave — which is what the reference does and what stops
              the row shifting as titles change length. It is out of the flow, so the title beside it
              cannot push it; the title's own `max-w` is what stops the two meeting.

              Below `lg` it is hidden entirely rather than squeezed. Three words plus a wordmark plus
              the account cluster do not fit a phone, and an icon rail here would be the toolbar this
              design is deliberately not. */}
          <div className="pointer-events-none absolute inset-x-0 hidden justify-center lg:flex">
            <div className="pointer-events-auto">
              <AppNav items={navItems} />
            </div>
          </div>

          {/* ── No page title in the bar (owner, 2026-08-25) ────────────────────────────────────────
              It used to stand here, truncating, capped so it could not run under the centred nav —
              and on the home route it fell back to a greeting. Both are gone. The bar now says what
              the APP is and where you are in it; what the PAGE is, the page's own first heading
              already says, one row below and larger. Saying it twice bought nothing and cost the
              only span of the bar wide enough to be quiet.

              `title` is still taken, and still used — see the document-title effect above. */}

          <div className="ms-auto flex flex-none items-center gap-2 text-[13px] font-semibold text-navy-mid sm:gap-3">
            {/* ── The language toggle steps out of the bar on a phone (owner, 2026-08-25) ──────────
                It is ~70px of a 360px row and it is pressed roughly never — a reader picks a language
                once. Below `sm` it moves into the nav sheet, under the three places, which is room
                the bar does not have to find. It is not removed anywhere. */}
            <span className="hidden sm:inline-flex">
              <LocaleToggle locale={locale} setLocale={setLocale} />
            </span>

            {/* Signed-out visitors browse freely; this opens the auth modal (no /login page). */}
            {status === "anon" && (
              <button
                onClick={() => openAuth()}
                className="inline-flex items-center gap-1.5 rounded-full bg-brand px-3 py-1.5 text-[12.5px] font-bold text-white transition hover:brightness-105 sm:px-3.5"
              >
                <Icon name="login" size={16} /> {t.shell.signIn}
              </button>
            )}

            {/* ── The INBOX is an icon here, not a word in the nav (owner, 2026-08-25) ─────────────
                It carries a count, and a count is the one thing a text link cannot show. It sits with
                the account controls because a conversation is personal, where Dashboard, Requests and
                My Organization are places in the product. */}
            {status === "authed" && (
              <Link
                href="/inbox"
                aria-label={t.shell.inbox}
                title={t.shell.inbox}
                aria-current={pathname.startsWith("/inbox") ? "page" : undefined}
                className={`relative grid h-9 w-9 place-items-center rounded-full transition ${
                  pathname.startsWith("/inbox") ? "bg-brand-soft text-brand" : "text-navy-mid hover:bg-surface2"
                }`}
              >
                <Icon name="inbox" size={21} />
                {unread > 0 && (
                  <span className="absolute -end-0.5 -top-0.5 grid h-[17px] min-w-[17px] place-items-center rounded-full bg-brand px-1 text-[10px] font-extrabold text-white ring-2 ring-surface">
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </Link>
            )}

            {status === "authed" && <NotificationsBell />}

            {status === "authed" && (
              <div className="relative">
                {/* ── The tier is a TICK on the avatar, not a pill beside it (owner, 2026-08-25) ────
                    «Verified» / «Basic rentee» / «Guest» took a labelled pill in the bar to say what
                    a mark says in 14px. Only the verified state earns a mark: an absent tick is the
                    honest statement for the other two, where a grey «Guest» pill is a verdict printed
                    beside the reader's own face. The full words survive in the account menu, which is
                    where the tier nudge that explains them already lives. */}
                <button
                  onClick={() => setMenuOpen((o) => !o)}
                  className="relative grid h-9 w-9 place-items-center rounded-full bg-surface3 text-[13px] font-bold text-navy"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  aria-label={tier === "verified" ? `${t.shell.account} · ${t.shell.tierVerified}` : t.shell.account}
                  title={badge.label}
                >
                  {initials || <Icon name="account_circle" size={22} />}
                  {tier === "verified" && (
                    <span className="absolute -end-0.5 -bottom-0.5 grid h-[15px] w-[15px] place-items-center rounded-full bg-ok text-white ring-2 ring-surface">
                      <Icon name="check" size={11} />
                    </span>
                  )}
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
                          the Requests tab, so a second entry to the same thing is gone. */}
                      {/* SETTINGS, not Profile (owner, 2026-08-25). The route is the same `/profile`
                          and its content has not moved — the word has. «Settings» is what a reader
                          looks for beside Sign out, and this menu is where the owner ruled it should
                          live rather than spending one of four header tabs on it. */}
                      <button
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false);
                          router.push("/profile");
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-[13px] font-semibold text-navy-mid hover:bg-surface2"
                      >
                        <Icon name="settings" size={16} /> {t.shell.settings}
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

            {/* ── Navigation, for a bar too narrow to lay it out (owner, 2026-08-25) ───────────────
                Last in the row rather than first: the leading edge already belongs to Back and the
                logomark, and on a page that shows Back a third control there would crowd all three.

                It carries the language toggle down with it — see the note on that control above. */}
            <AppNavMobile items={navItems}>
              <LocaleToggle locale={locale} setLocale={setLocale} />
            </AppNavMobile>
          </div>
        </header>

        {/* ── The foot of a page is the page's again (owner, 2026-08-25) ──────────────────────────
            `DOCK_CLEARANCE` reserved `pb-28` on EVERY page so the floating dock could not cover the
            last row — the wizard's Back/Next, a card's actions, the bid map's price bar. With the
            navigation in the header there is nothing down there to clear, so the reserve is gone and
            a full-bleed surface ends exactly where the viewport does.
            One consistent page container across the app (T1/T2): My Requests' 1440px width and a
            generous gutter. `wide` stays uncapped (My Requests caps itself at 1440 via .rproto). */}
        <main
          className={
            fullBleed
              ? "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
              : `mx-auto w-full px-6 py-6 pb-16 sm:px-12 sm:pt-7 md:py-7 lg:px-20 xl:px-28 ${wide ? "max-w-none" : "max-w-[1440px]"}`
          }
        >
          {children}
        </main>
      </div>

    </div>
    </BackContext.Provider>
  );
}

/** The EN/AR pair. Lifted out of the bar so the identical control can be rendered in two places —
 *  the header on a tablet and up, the nav sheet on a phone — without the markup being written twice
 *  and drifting apart. */
function LocaleToggle({ locale, setLocale }: { locale: Locale; setLocale: (l: Locale) => void }) {
  return (
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
