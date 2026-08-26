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
import { ArrowBackIcon, MailIcon, CountBadge } from "@/components/HeaderIcons";

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

/**
 * ── The page gutters, defined once (owner, 2026-08-25: "unify the margin - paddings for all
 * screens") ─────────────────────────────────────────────────────────────────────────────────────
 *
 * There were FOUR scales before this, and two of them did not line up with each other:
 *
 *   page container   24 / 48 / 80 / 112     <- every ordinary screen
 *   create canvas    16 / 24 / 32 / 40      <- reached by cancelling the above with negative margins
 *   workspace rail   16 / 26                <- a full-bleed band
 *   workspace rows   12 / 20                <- the bands directly under that rail
 *
 * Now there are two, and they are roles rather than accidents.
 *
 * READING is the default: a generous edge for a column of prose, a form, a list. Unchanged from what
 * every ordinary screen already had, so nothing on those screens moves.
 *
 * WORKING is for a screen that is CONTROLS rather than reading. The create canvas is three columns of
 * them, and at 112px a side the machine card, the operator rail and the schedule wrapped instead of
 * sharing a row. It is what `wide` now means — the prop already existed and only /create passes it,
 * so this replaces that page's negative-margin escape with the same numbers, declared.
 *
 * BLEED is for surfaces that own the whole viewport (`fullBleed`), whose bands set their own edges.
 * It is the working gutter's first two steps, which is why the requests rail and the strip beneath it
 * now line up — at 16/26 against 12/20 they never did.
 */
export const PAGE_X_READING = "px-6 sm:px-12 lg:px-20 xl:px-28";
export const PAGE_X_WORKING = "px-4 sm:px-6 lg:px-8 xl:px-10";
export const PAGE_X_BLEED = "px-4 sm:px-6";
/** The same bleed step as a margin, for a band that insets a card rather than padding a row. */
export const PAGE_MX_BLEED = "mx-4 sm:mx-6";


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
        {/* ── The bar is NAVY (owner, 2026-08-26) ────────────────────────────────────────────────
            His own reference: a dark bar, the places centred on it, and the one you are on drawn as a
            white pill. It was white with a 2px rule under the active word — legible, but it spent the
            top of every page on chrome that looked like content. Dark, the bar reads as the frame and
            the page reads as the thing.

            Everything in the row inverts with it: the logo is filtered to white, the icons and the
            account controls take white at reduced strength, and the hairlines become white/15. Where a
            control keeps a light ground of its own — the account menu, the nav sheet — it stays light,
            because it is a surface, not part of the bar. */}
        <header className="sticky top-0 z-30 flex h-[62px] items-center gap-3 border-b border-white/10 bg-navy px-4 text-white sm:px-7 relative">
          {back && (
            <button
              onClick={back}
              aria-label={locale === "ar" ? "رجوع" : "Back"}
              className="grid h-[34px] w-[34px] flex-none place-items-center rounded-full border border-white/20 text-white/80 transition hover:bg-white/10 hover:text-white"
            >
              <ArrowBackIcon className="rtl:-scale-x-100" />
            </button>
          )}

          {/* The FULL LOGO, 36px tall and bare — the header prototype's, and the same artwork
              (owner, 2026-08-25: "keep the moedatech logo not this watermark"). It replaced the
              logomark on its navy disc, which is what the dock carried when navigation was a pill.

              No active ring on it, though it points at `/`: Dashboard names that destination in the
              row beside it and already carries the state. Two marks for one place is one too many. */}
          <Link href="/" aria-label={t.shell.home} className="flex-none transition hover:opacity-80">
            {/* ── 20px, matched to the owner's bar by SIZE, not by ratio (2026-08-26) ─────────────
                His screenshot is a 34px bar carrying a 13px mark. Matching that PROPORTION on our
                62px bar gave 24px — and he read it as still too big, which it is: the ratio holds
                but the bar it is measured against is nearly twice as tall, so the mark lands twice
                the size on the glass.

                20px is the compromise the row can carry: visibly a signature, still legible at the
                wordmark's 2.66 aspect (53px wide), and no smaller than the 20px glyphs in the icon
                cluster opposite — a logo that undercuts the icons beside it stops reading as the
                brand and starts reading as a favicon. Slimming the BAR is the other half of that
                answer, and it is a change to every page's chrome, so it waits for the owner. */}
            {/* The mark is one dark navy (#25384a) and would sink into the bar, so it is filtered to
                white rather than swapped for a second asset — one file, one logo, and no risk of the
                two drifting. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/moedatech-logo.svg" alt="Moedatech" className="block h-5 w-auto brightness-0 invert" />
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

          {/* 22px between the groups of this cluster is the prototype's spacing; a phone cannot spend
              it, so it opens up at `sm` where the language control also returns. */}
          <div className="ms-auto flex flex-none items-center gap-3 text-[13px] font-semibold text-white/75 sm:gap-[22px]">
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

            {/* ── The INBOX and the BELL, as the prototype draws them (owner, 2026-08-25) ──────────
                The inbox is an icon rather than a word in the nav because it carries a count, and a
                count is the one thing a text link cannot show. It sits with the account controls
                because a conversation is personal, where Dashboard, Requests and My Organization are
                places in the product.

                14px apart and grouped, then a hairline rule, then the account — the prototype's own
                rhythm. The pair reads as one thing that way, which is what they are: the two places
                the app talks to this reader.

                No pill behind the active inbox any more. The prototype gives these icons no active
                treatment at all, and a filled lozenge under a 1.7px hairline outline was the loudest
                thing in the bar; the ink darkening to the prototype's own `#1f2d3a` says it instead. */}
            {/* Their boxes TOUCH (`gap-0`) rather than sitting 14px apart. Each is 34px and the glyph
                in it is 20px, so the two icons' CENTRES land 34px apart — exactly the 20 + 14 the
                prototype spaces them by. Same picture, and a pressable target instead of a 20px one
                (owner, 2026-08-25: "make sure all icons in the nav bar is consistent"). */}
            {status === "authed" && (
              <div className="flex items-center gap-0 text-white/70">
                <Link
                  href="/inbox"
                  aria-label={t.shell.inbox}
                  title={t.shell.inbox}
                  aria-current={pathname.startsWith("/inbox") ? "page" : undefined}
                  className={`grid h-[34px] w-[34px] place-items-center rounded-full transition hover:text-white ${
                    pathname.startsWith("/inbox") ? "text-white" : ""
                  }`}
                >
                  {/* The badge hangs off the GLYPH, not off the 34px box — pinned to the box it would
                      float clear of the envelope it is counting. */}
                  <span className="relative inline-flex">
                    <MailIcon />
                    <CountBadge count={unread} />
                  </span>
                </Link>
                <NotificationsBell />
              </div>
            )}

            {/* The prototype's separator: 1px by 24px, between what the app says to you and who you
                are signed in as. */}
            {status === "authed" && <span aria-hidden="true" className="h-6 w-px flex-none bg-white/15" />}

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
                  className="relative grid h-[34px] w-[34px] place-items-center rounded-full border border-white/25 bg-white/15 text-[13px] font-bold text-white"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  aria-label={tier === "verified" ? `${t.shell.account} · ${t.shell.tierVerified}` : t.shell.account}
                  title={badge.label}
                >
                  {initials || <Icon name="account_circle" size={20} />}
                  {/* The prototype puts a plain green dot here. It stays a TICK: the owner asked for
                      one by name, and a bare dot on an avatar is the presence convention — online,
                      not vetted. The prototype's green (#3fbf6f) and its 2px white ring are taken. */}
                  {tier === "verified" && (
                    <span className="absolute -end-0.5 -bottom-0.5 grid h-[15px] w-[15px] place-items-center rounded-full border-2 border-navy bg-[#3fbf6f] text-white">
                      <Icon name="check" size={9} />
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
              : // Vertical is ONE rule now: 24, then 28 from `sm` up. It read
                // `py-6 pb-16 sm:pt-7 md:py-7`, where `md:py-7` silently overrode `pb-16` — so the
                // foot of a page was 64px on a phone and 28px on a desktop, the opposite way round
                // from what either wants. The 64 was `AppDock` clearance, and the dock is gone.
                `mx-auto w-full py-6 sm:py-7 ${wide ? `max-w-none ${PAGE_X_WORKING}` : `max-w-[1440px] ${PAGE_X_READING}`}`
          }
        >
          {children}
        </main>
      </div>

    </div>
    </BackContext.Provider>
  );
}

/**
 * The language control: EN · switch · عربي, drawn from the header prototype (owner, 2026-08-25).
 *
 * It replaced a segmented EN/ع pair. The owner took the prototype's form here having been told the
 * objection — a switch reads as on/off, and a language is not off — and that call stands; the note
 * survives so the next reader knows it was weighed rather than missed.
 *
 * ── One button, not three ───────────────────────────────────────────────────────────────────────
 * The prototype draws both words as inert spans. Making the WHOLE control one button costs nothing,
 * gives the labels a hit area they did not have, and keeps the bar to one tab stop. It is labelled
 * by its DESTINATION («Switch to Arabic») because that is what pressing it does — `aria-pressed`
 * would claim an on/off state the control does not have.
 *
 * ── The knob travels the right way in both directions ───────────────────────────────────────────
 * `start-0.5` is where EN sits, and EN is the FIRST child — so in Arabic, where the row mirrors, the
 * knob's rest position mirrors with it and stays under EN. The Arabic state then moves it toward the
 * LAST child, which is why the translate is signed per direction rather than shared.
 *
 * ── The colours are the prototype's too ────────────────────────────────────────────────────────
 * This first shipped on the app's own tokens, on the reasoning that one control in a second palette
 * would read as a patch. It did read as a patch — the wrong way round: `--surface3` is blue-tinted
 * and next to the prototype's grey track it looked like a different control (owner, 2026-08-25).
 * So the hexes are literal and exact: `#e5e8eb` track, `#1f2d3a` knob and active label, `#9aa2ab`
 * for the resting one. Geometry likewise — 40×22 track, 18px knob, 2px inset, 13px labels, 700 on
 * the active side and 600 on the other.
 *
 * Lifted out of the bar so the identical control renders in two places — the header on a tablet and
 * up, the nav sheet on a phone — without the markup being written twice and drifting apart.
 */
function LocaleToggle({ locale, setLocale }: { locale: Locale; setLocale: (l: Locale) => void }) {
  const t = useT();
  const ar = locale === "ar";
  return (
    <button
      type="button"
      onClick={() => setLocale(ar ? "en" : "ar")}
      aria-label={t.shell.switchLang}
      className="inline-flex flex-none items-center gap-2 rounded-full text-[13px] leading-none"
    >
      {/* On the navy bar the two words and the track invert: the chosen language takes white, the
          other white at a third, and the knob is white on a translucent track. */}
      <span className={ar ? "font-semibold text-white/45" : "font-bold text-white"}>EN</span>
      <span className="relative h-[22px] w-10 flex-none rounded-full bg-white/20">
        <span
          className={`absolute top-0.5 start-0.5 h-[18px] w-[18px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,.35)] transition-transform duration-200 ${
            ar ? "ltr:translate-x-[18px] rtl:-translate-x-[18px]" : ""
          }`}
        />
      </span>
      <span className={ar ? "font-bold text-white" : "font-semibold text-white/45"}>عربي</span>
    </button>
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
