"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale, useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { Icon } from "@/components/ui";
import type { Locale } from "@/lib/i18n/config";
// DISABLED — Outcome Survey feature switched off. See docs/surveys-disabled.md.
// import { SurveyProvider } from "@/components/surveys/SurveyProvider";
import { AuthGateProvider, useAuthGate } from "@/components/auth/AuthGate";
import { fetchDealRoomUnread } from "@/lib/api/client";
import { btn, cx, OVERLAY, PAGE_BACK, PAGE_MAX, PAGE_X, PAGE_Y, POPOVER, SCRIM } from "@/lib/ds";
import { NotificationsBell } from "@/components/NotificationsBell";
import { AppNav, AppNavMobile, type NavItem } from "@/components/AppNav";
import { ArrowBackIcon, MailIcon, CountBadge } from "@/components/HeaderIcons";
import { pin } from "@/lib/uiPins";

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
/* ~~`wide`.~~ Removed with the second gutter it chose (owner, 2026-08-30): with one gutter and one
   cap there is nothing left for it to select. Its one caller, `/create`, is unchanged on screen
   except that it now sits at the same margin as every other page. */
type AppShellProps = { children: ReactNode; title?: string; fullBleed?: boolean };

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
 * ~~Three of them — READING for prose, WORKING for a screen of controls, BLEED for a viewport-pinned
 * surface.~~ One, since 2026-08-30, and `PAGE_X` in `@/lib/ds` carries the owner's audit that closed
 * it. The short of it: the three put 112px, 40px and 24px of margin on pages a renter walks between
 * in one errand, and the reading case had stopped being true — the account pages are two columns of
 * fields and the home dashboard is a table beside a rail. A page that wants a narrow measure now
 * takes it from a `max-w` on its own content, where it is a decision about the content.
 */
/* The gutter lives in `@/lib/ds` now — placement is part of the design system, and a gutter
   declared here was a gutter no other file could find. Re-exported so existing callers are unmoved;
   `ds.ts` imports nothing, so there is no cycle. */
export { PAGE_MAX, PAGE_X, PAGE_Y } from "@/lib/ds";

/**
 * A page can show a Back arrow by registering a handler.
 *
 * **It renders on the PAGE, under the bar — not in it** (owner, 2026-08-26). It used to be a white
 * circle inside the navy header, which put "leave this page" in the one row that is identical
 * everywhere, next to the logo and the tabs. Those say what the app is; back says something about
 * this page only. On the page, on the content's own leading edge, it belongs to what it leaves.
 *
 * The page does not place it: `AppShell` draws it as the first thing inside `<main>`, so every page
 * that has one has it in the same spot, at the same size, with the same 16px under it.
 */
const BackContext = createContext<(fn: (() => void) | null) => void>(() => {});
export function usePageBack(handler: (() => void) | null) {
  const register = useContext(BackContext);
  useEffect(() => {
    register(handler);
    return () => register(null);
  }, [handler, register]);
}

/** Its old name, kept so a call site does not have to change to say the same thing. */
export const useHeaderBack = usePageBack;

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

function AppShellInner({ children, title, fullBleed }: AppShellProps) {
  const { locale, setLocale } = useLocale();
  const t = useT();
  const { tier, status, signOut, refresh: refreshSession } = useSession();
  /** The account menu: Profile, and the only door out of the app. */
  const [accountOpen, setAccountOpen] = useState(false);
  const accountBox = useRef<HTMLDivElement>(null);

  /* Dismissed the way every popover in this app is: a press outside it, or Escape. Also closed on
     every route change — the menu's own entries navigate, and a layer that outlives the page it was
     opened over is a layer the reader has to dismiss on a screen that no longer explains it. */
  useEffect(() => {
    if (!accountOpen) return;
    const away = (e: MouseEvent) => {
      if (accountBox.current && !accountBox.current.contains(e.target as Node)) setAccountOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAccountOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [accountOpen]);
  const { openAuth } = useAuthGate();
  const pathname = usePathname();
  const [name, setName] = useState("");
  // A child page may register a Back handler; the arrow then draws at the top of `<main>`, on the
  // page's own gutter. Never in the bar — see `usePageBack`.
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
  /* BROWSE leads for a guest, and follows Dashboard once there is an account (owner, 2026-08-30).
     A visitor has no requests and no organization, so the first tab has to be the one with something
     in it; a signed-in renter came for his own work, so his does. Same four destinations either way
     — only the order moves, because a nav that gains and loses tabs on sign-in teaches nothing. */
  const guest = status === "anon";
  const dashboardTab: NavItem = { key: "dashboard", label: t.shell.dashboard, href: "/" };
  const browseTab: NavItem = { key: "browse", label: t.shell.browse, href: "/browse" };
  const navItems: NavItem[] = [
    ...(guest ? [browseTab, dashboardTab] : [dashboardTab, browseTab]),
    { key: "requests", label: t.shell.requests, href: "/requests" },
    // ~~My Suppliers.~~ It is on the dashboard now, under the projects (owner, 2026-09-01) — a
    // renter asks who to send a request to while he is looking at the request, and a fifth tab was
    // one more thing to remember rather than one more thing to find.
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
    <div {...pin("app-shell")} className={`flex ${fullBleed ? "h-dvh overflow-hidden" : "min-h-screen"}`}>
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
        {/* ~~`border-b border-white/10`.~~ Removed (owner, 2026-08-30). White at 10% over `--navy`
            computes to #333d4c, and against the hero band directly beneath it that read as a thin
            white hairline rather than as an edge. The bar does not need one: it is navy, the page
            under it is not, and where the hero DOES sit under it the two navies meet and the join is
            the point — a rule drawn across it is the only thing that ever made it visible. */}
        <header {...pin("app-header")} className="sticky top-0 z-30 flex h-[52px] items-center gap-3 bg-navy px-4 text-white sm:px-7 relative">
          {/* ~~The Back arrow led this row.~~ It is on the PAGE now, under the bar (owner,
              2026-08-26) — see `usePageBack` and the block at the top of `<main>`. The bar carries
              only what is true of the app on every route; back is true of one page. */}

          {/* The FULL LOGO, 36px tall and bare — the header prototype's, and the same artwork
              (owner, 2026-08-25: "keep the moedatech logo not this watermark"). It replaced the
              logomark on its navy disc, which is what the dock carried when navigation was a pill.

              No active ring on it, though it points at `/`: Dashboard names that destination in the
              row beside it and already carries the state. Two marks for one place is one too many. */}
          <Link {...pin("header-logo")} href="/" aria-label={t.shell.home} className="flex-none transition">
            {/* ── 20px, matched to the owner's bar by SIZE, not by ratio (2026-08-26) ─────────────
                His screenshot is a 34px bar carrying a 13px mark. Matching that PROPORTION on our
                62px bar gave 24px — and he read it as still too big, which it is: the ratio holds
                but the bar it is measured against is nearly twice as tall, so the mark lands twice
                the size on the glass.

                20px is the compromise the row can carry: visibly a signature, still legible at the
                wordmark's 2.66 aspect (53px wide), and no smaller than the 20px glyphs in the icon
                cluster opposite — a logo that undercuts the icons beside it stops reading as the
                brand and starts reading as a favicon. Slimming the BAR is the other half of that
                answer, and the owner called for it on 2026-08-27: the bar is 52px now. That is the
                34px control cluster with 9px clear above and below it — the least a row holding a
                34px avatar, a 34px bell and a 34px inbox can be without them touching its edges.
                The mark stays 20px, which against 52 is much closer to the 34:13 of his reference
                than it ever was against 62. */}
            {/* The mark is one dark navy (var(--navy)) and would sink into the bar, so it is filtered to
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
          <div {...pin("header-nav-slot")} className="pointer-events-none absolute inset-x-0 hidden justify-center lg:flex">
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
          <div {...pin("header-account")} className="ms-auto flex flex-none items-center gap-3 text-body font-semibold text-white/75 sm:gap-6">
            {/* ── The language toggle steps out of the bar on a phone (owner, 2026-08-25) ──────────
                It is ~70px of a 360px row and it is pressed roughly never — a reader picks a language
                once. Below `sm` it moves into the nav sheet, under the three places, which is room
                the bar does not have to find. It is not removed anywhere. */}
            <span {...pin("header-locale")} className="hidden sm:inline-flex">
              <LocaleToggle locale={locale} setLocale={setLocale} />
            </span>

            {/* Signed-out visitors browse freely; this opens the auth modal (no /login page). */}
            {status === "anon" && (
              <button
                onClick={() => openAuth()}
                className={btn("primary", "sm", { pill: true, className: "transition" })}
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
                thing in the bar; the ink darkening to the prototype's own `var(--navy-deep)` says it instead. */}
            {/* Their boxes TOUCH (`gap-0`) rather than sitting 14px apart. Each is 34px and the glyph
                in it is 20px, so the two icons' CENTRES land 34px apart — exactly the 20 + 14 the
                prototype spaces them by. Same picture, and a pressable target instead of a 20px one
                (owner, 2026-08-25: "make sure all icons in the nav bar is consistent"). */}
            {status === "authed" && (
              <div {...pin("header-icons")} className="flex items-center gap-0 text-white/70">
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

              {/* ── The avatar opens TWO doors (owner, 2026-08-31) ────────────────────────────────
                  *"When clicking profile in the nav bar, show profile or logout."*

                  ~~It goes straight to settings.~~ ~~It opened a menu of three: «My Organization»,
                  «Settings», «Sign out».~~ Both were right about their own list and this is the
                  narrow case between them.

                  The menu of three failed because two of its entries were doors to the room you were
                  already standing in: My Organization is one of the three places in the bar, and
                  Settings was where the menu itself led. Removing it was correct.

                  But it took Sign out with it, and Sign out has no other home in the bar. Leaving is
                  a thing a reader does from anywhere, and it became: go to your profile, scroll to
                  the bottom, find it under the legal links. So two entries, both of which are the
                  only way to reach what they name.

                  The tick still says «verified», and only that state earns a mark: an absent tick is
                  the honest statement for the other two, where a grey «Guest» pill is a verdict
                  printed beside the reader's own face.

                  What this drops is the tier NUDGE (AC-06/08), which had this menu as its only home.
                  Not re-homed in the bar on purpose — the tier and its next step belong on the
                  settings page, and a second nudge up here would repeat the mistake the menu was
                  already making. Flagged for the owner rather than quietly kept. */}
            {status === "authed" && (
              <div ref={accountBox} className="relative flex-none">
              <button {...pin("header-avatar")}
                type="button"
                onClick={() => setAccountOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={accountOpen}
                className="flex flex-none items-center gap-1.5"
                aria-label={tier === "verified" ? `${t.shell.settings} · ${t.shell.tierVerified}` : `${t.shell.settings} · ${t.shell.verifyNudge}`}
                title={badge.label}
              >
                <span className="relative grid h-[34px] w-[34px] flex-none place-items-center rounded-full border border-white/25 bg-white/15 text-body font-semibold text-white transition hover:bg-white/25">
                {initials || <Icon name="account_circle" size={20} />}
                {/* ── Verified: a tick. Not verified: the word (owner, 2026-08-26) ──────────────────
                    The tick is a statement — this account is vetted — and its absence used to be the
                    whole message for the other two tiers. That was honest but silent: nothing told the
                    reader there was something to DO, and the nudge that used to say so left with the
                    account menu.

                    So the unverified states carry «Verify» instead, on the brand ground the app uses
                    for what it wants pressed. It rides BESIDE the avatar rather than on it: the house
                    scale starts at 11px, and 11px of «Verify» is wider than the 34px circle — hung off
                    it, the badge would either clip at the bar's edge or cover the reader's initials.
                    Inside the same link, so it is one press to the same place. */}
                {tier === "verified" ? (
                  <span className="absolute -end-0.5 -bottom-0.5 grid h-[15px] w-[15px] place-items-center rounded-full border-2 border-navy bg-ok text-white">
                    <Icon name="check" size={9} />
                  </span>
                ) : null}
                </span>
                {tier !== "verified" && (
                  <span className="rounded-full bg-brand px-2 py-0.5 text-label font-semibold uppercase tracking-[0.05em] text-white">
                    {t.shell.verifyNudge}
                  </span>
                )}
              </button>

              {/* Two entries, and each is the only way to reach what it names. On a dark bar the
                  popover keeps its own light ground — the same treatment the nav sheet gets — because
                  a translucent panel over navy reads as part of the bar rather than as a layer above
                  it. `end-0`, so it hangs inside the bar's trailing edge and mirrors in Arabic. */}
              {accountOpen && (
                <div
                  role="menu"
                  className={`${POPOVER} absolute end-0 top-11 flex w-[184px] flex-col p-1`}
                >
                  <Link
                    role="menuitem"
                    href="/profile"
                    onClick={() => setAccountOpen(false)}
                    className="flex items-center gap-2 rounded-sm px-3 py-2 text-start text-body text-navy transition hover:bg-surface2"
                  >
                    <Icon name="account_circle" size={15} className="flex-none text-muted" />
                    {t.shell.profile}
                  </Link>
                  {/* Red, and last. Leaving is the destructive end of a short list, and the house
                      rule for that is the same here as in the row menus on the chart. */}
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      setAccountOpen(false);
                      void signOut();
                    }}
                    className="flex items-center gap-2 rounded-sm px-3 py-2 text-start text-body text-danger transition hover:bg-surface2"
                  >
                    <Icon name="logout" size={15} className="flex-none" />
                    {t.profile.logout}
                  </button>
                </div>
              )}
              </div>
            )}

            {/* ── Navigation, for a bar too narrow to lay it out (owner, 2026-08-25) ───────────────
                Last in the row rather than first: the leading edge already belongs to Back and the
                logomark, and on a page that shows Back a third control there would crowd all three.

                It carries the language toggle down with it — see the note on that control above. */}
            <AppNavMobile items={navItems}>
              <LocaleToggle locale={locale} setLocale={setLocale} tone="sheet" />
            </AppNavMobile>
          </div>
        </header>

        {/* ── The foot of a page is the page's again (owner, 2026-08-25) ──────────────────────────
            `DOCK_CLEARANCE` reserved `pb-28` on EVERY page so the floating dock could not cover the
            last row — the wizard's Back/Next, a card's actions, the bid map's price bar. With the
            navigation in the header there is nothing down there to clear, so the reserve is gone and
            a full-bleed surface ends exactly where the viewport does.
            One page container across the app: one width, one gutter, one cap — see the note on
            `<main>` below. */}
        <main
          {...pin("page-main")}
          /* ── ONE gutter and ONE cap, for every page (owner, 2026-08-30) ────────────────────
             ~~Three gutters and two caps: `READING` + 1440 for account pages, `WORKING` + uncapped
             for `wide`, nothing at all for `fullBleed`.~~ That put 112px, 40px and 24px of margin on
             pages a renter walks between in one errand, and on a wide screen the caps widened the
             gap again — 352px beside 40px at 1920.

             The gutter and the cap are the shell's now, and they are the same on every page. What
             `fullBleed` still means is real and unchanged: pinned to the viewport's HEIGHT, its own
             scrolling region, and bands that draw their own edges inside this column.

             Vertical is ONE rule too: 24, then 28 from `sm` up. It read `py-6 pb-16 sm:pt-7 md:py-7`,
             where `md:py-7` silently overrode `pb-16` — so the foot of a page was 64px on a phone and
             28px on a desktop, the opposite way round from what either wants. The 64 was `AppDock`
             clearance, and the dock is gone. */
          className={cx(
            "mx-auto w-full",
            /* ── The cap belongs where the CONTENT is (owner, 2026-08-30) ─────────────────────
               An ordinary page is one column, so capping the container caps the column. A full-bleed
               surface is BANDS — the requests rail, the bid map — and a band is meant to reach the
               window: *"for the top bar of the circles in requests keep it on whole screen with full
               fit like it was before."* Capping the container cut those bands off at 1440 and left
               page ground either side of them.

               So it caps itself, one layer in: each band spans the window and puts `PAGE_MAX` +
               `PAGE_X` on its own inner row, which is what keeps the rail's tiles on the same left
               edge as the bids underneath and as every other page in the app. */
            fullBleed ? "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" : `${PAGE_MAX} ${PAGE_Y} ${PAGE_X}`,
          )}
        >
          {/* ── Back, on the page (owner, 2026-08-26) ────────────────────────────────────────────
              The shell draws it, not the page, so every screen that has one has it in the same place
              at the same size with the same 16px under it — which is the whole reason it is here and
              not left to each caller.

              A full-bleed surface has no gutter of its own to sit on, so the control brings one. */}
          {back && (
            <div {...pin("page-back")} className={cx(PAGE_BACK, fullBleed && `${PAGE_X} pt-4`)}>
              <button
                onClick={back}
                aria-label={locale === "ar" ? "رجوع" : "Back"}
                className={btn("secondary", "md", { icon: true, pill: true })}
              >
                <ArrowBackIcon className="rtl:-scale-x-100" />
              </button>
            </div>
          )}
          {children}
        </main>
      </div>

    </div>
    </BackContext.Provider>
  );
}

/**
 * The language control: a globe, the language you are reading in, and a chevron (owner, 2026-08-26).
 *
 * ── Why the switch went ─────────────────────────────────────────────────────────────────────────
 * It was «EN ⬤ عربي» — a track with a knob — and a switch reads as ON or OFF. A language is neither,
 * and the objection was on the record when the form was chosen. The owner's reference settles it: a
 * small pill naming the CURRENT language, which is the one thing the old control never said out loud
 * (it named both and left the knob to answer).
 *
 * ── Small on purpose ────────────────────────────────────────────────────────────────────────────
 * 28px tall against the bar's 62 and ~92px wide, where the switch spent ~120px of a row that also
 * carries three places, two icons and an account. The globe is the affordance every product uses for
 * this, so the label can shrink to 12px without the control becoming a guess.
 *
 * ── Two grounds, one component ──────────────────────────────────────────────────────────────────
 * `tone` picks the skin, because the identical control renders on the navy bar and inside the light
 * nav sheet on a phone. The reference draws both: an outline on light, a filled lozenge on dark.
 */
function LocaleToggle({ locale, setLocale, tone = "bar" }: { locale: Locale; setLocale: (l: Locale) => void; tone?: "bar" | "sheet" }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ar = locale === "ar";
  const onBar = tone === "bar";
  const label = ar ? "العربية" : "English";

  const pick = (l: Locale) => {
    setOpen(false);
    if (l !== locale) setLocale(l);
  };

  return (
    <div className="relative flex-none">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t.shell.switchLang}
        title={t.shell.switchLang}
        className={`inline-flex h-7 flex-none items-center gap-1.5 rounded-full border px-2.5 text-meta font-semibold leading-none transition ${
          onBar
            ? "border-white/25 text-white hover:bg-white/10"
            : "border-border text-navy hover:bg-surface2"
        }`}
      >
        <Icon name="language" size={15} className={onBar ? "text-white/85" : "text-navy-mid"} />
        {label}
        <Icon name="expand_more" size={14} className={onBar ? "text-white/60" : "text-muted"} />
      </button>
      {open && (
        <>
          <div className={SCRIM} onClick={() => setOpen(false)} />
          {/* The panel is a SURFACE wherever the control sits — a light menu on the navy bar reads as
              the app answering, where a translucent one reads as part of the bar. It is separated by
              the scrim behind it rather than by a shadow (see OVERLAY in `ds.ts`). */}
          <div role="menu" className={`${OVERLAY} absolute end-0 mt-1 w-[132px] overflow-hidden py-1`}>
            {([
              ["en", "English"],
              ["ar", "العربية"],
            ] as [Locale, string][]).map(([code, name]) => (
              <button
                key={code}
                role="menuitem"
                type="button"
                onClick={() => pick(code)}
                aria-current={locale === code ? "true" : undefined}
                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-meta transition hover:bg-surface2 ${
                  locale === code ? "font-extrabold text-navy" : "font-semibold text-navy-mid"
                }`}
              >
                {name}
                {locale === code && <Icon name="check" size={15} className="text-brand" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

