"use client";

import { HomeNotificationBubble } from "@/components/home/HomeNotificationBubble";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session";
import { useT } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import { cx } from "@/lib/ds";
import { GuestDashboardPreview, GuestWall } from "@/components/common/GuestWall";
import { previousPath } from "@/lib/nav-trail";
import { CtaBanner } from "@/components/home/CtaBanner";
import { HomeRequests } from "@/components/home/HomeRequests";
import { ProjectsSurface } from "@/components/projects/ProjectsSurface";
import { SuppliersPage } from "@/components/suppliers/SuppliersPage";
import { pin } from "@/lib/uiPins";

/** The three things the dashboard holds, one at a time (owner, 2026-09-16). */
type View = "requests" | "suppliers" | "projects";
const VIEWS: View[] = ["requests", "suppliers", "projects"];
const VIEW_ICON = { requests: "assignment", suppliers: "groups", projects: "place" } as const;

/**
 * The tab row.
 *
 * Exported for `dev/preview` — the dashboard itself needs a signed-in renter with requests,
 * suppliers and sites on a deployed backend, so this row could not otherwise be looked at while it
 * was being built. It takes the whole of its state as props for that reason, and holds none.
 *
 * It IS the three section headings: each tab carries the 38px navy plate's glyph, the section's own
 * name and the count the block used to print under it, so the blocks drop their headers
 * (`hideHeading`) rather than saying «My Suppliers · 42» twice a row apart.
 */
export function DashboardTabs({
  view,
  counts,
  onPick,
}: {
  view: View;
  counts: Record<View, number | null>;
  onPick: (v: View) => void;
}) {
  const t = useT();
  return (
    <div {...pin("home-tabs")} className="flex flex-wrap items-stretch gap-1.5">
      {VIEWS.map((k) => {
        const on = view === k;
        const n = counts[k];
        return (
          <button
            key={k}
            type="button"
            onClick={() => onPick(k)}
            aria-current={on ? "page" : undefined}
            className={cx(
              "inline-flex items-center gap-2.5 rounded-sm border px-3 py-2 transition-colors",
              on ? "border-navy bg-navy text-surface" : "border-border bg-surface text-navy hover:border-border-strong",
            )}
          >
            <span
              className={cx(
                "grid size-[30px] flex-none place-items-center rounded-sm",
                on ? "bg-surface/15 text-surface" : "bg-navy text-surface",
              )}
            >
              <Icon name={VIEW_ICON[k]} size={18} />
            </span>
            <span className="text-body font-extrabold">
              {k === "requests" ? t.home.yourRequests : k === "suppliers" ? t.suppliers.title : t.projects.surface.heading}
            </span>
            {/* A dash while the block has not answered yet: «0 suppliers» on a list still loading is
                a wrong statement, not a pending one. */}
            <span
              className={cx(
                "rounded-full px-2 py-0.5 text-meta font-semibold tabular-nums",
                on ? "bg-surface/20 text-surface" : "bg-surface3 text-muted",
              )}
            >
              {n ?? "–"}
            </span>
          </button>
        );
      })}
    </div>
  );
}
/**
 * Renter web home hub (web-app/004, AC-04/05/07/10/25). A gradient-to-dark hero (pitch left, Create-
 * request + Upload-RFQ buttons right), then the requests-and-bids block and the suggested suppliers.
 *
 * ── Two blocks removed (owner, 2026-08-30) ──────────────────────────────────────────────────────
 * The **activity tiles** (Your Requests / Price Bids / Completed Deals) and the **new-bids banner**
 * are gone. Both counted the same things `HomeRequests` states directly one block below — the tiles
 * as three numbers behind three links, all of which went to `/requests`, and the banner as a fourth
 * copy of the bid count that went there too. A page that says the same number four times and offers
 * the same door each time is not four features.
 *
 * `activity` is still fetched: `useStartRequestGate` reads `openRequests` from it.
 */
export function HomeHub() {
  const router = useRouter();
  const { status } = useSession();
  const t = useT();

  /* ── A guest LANDS on Browse, but is not held off the dashboard (owner, 2026-08-30 · 2026-09-04)
     The dashboard answers "what is mine and where does it stand", and a visitor arriving cold has no
     answer to that — he was landing on a hero and four empty states. Browse answers "who is out
     there", which is the question he actually has, so a cold entry still goes there.

     ~~And so did every other arrival.~~ *"In guest mode it will land to browse not dashboard, but
     note in guest the dashboard will show sign in CTA same one as all other pages."* A guest who
     PRESSES Dashboard has asked for this page, and bouncing him off a tab he can see is the one
     thing worse than an empty state: the tab appeared to do nothing. So the redirect is now the
     cold-entry case only, told apart by the nav trail — no previous in-app page means he arrived
     here rather than navigated here.

     `replace`, not `push`: a page he never chose must not sit in his history for Back to return him
     to. And only once `status` has settled — acting while it still reads "loading" would bounce
     every signed-in renter through Browse on a cold load, which is the flash this exists to avoid. */
  const [landed, setLanded] = useState(false);
  const decided = useRef(false);
  useEffect(() => {
    if (status !== "anon" || decided.current) return;
    decided.current = true;
    if (previousPath()) setLanded(true);
    else router.replace("/browse");
  }, [status, router]);

  /* ── One block at a time (owner, 2026-09-16) ─────────────────────────────────────────────────
     *"for dashboard can we have subtabs to show requests-suppliers-projects … without scrolling in
     one page"*. The page grew past two screens because both embedded blocks render their WHOLE
     surface — every supplier row, every site — and neither caps itself. A tab row is the owner's
     call over the alternative on the table (the two reference blocks side by side, each capped at a
     few rows with a «See all» door), and its cost is stated: two of the three states are behind a
     press, which is the thing a dashboard exists not to do. */
  const [view, setView] = useState<View>("requests");
  /* Which block is open is IN THE URL, so a reload, a Back from a supplier profile and a link a
     renter pastes all land on the same tab — the workspace's own ruling (2026-09-06).
     `replaceState`, never push: switching tabs is not a navigation, and pushing would make the
     browser's Back walk the three tabs instead of leaving the page. */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const want = new URL(window.location.href).searchParams.get("view");
    if (want === "suppliers" || want === "projects" || want === "requests") setView(want);
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const before = url.search;
    if (view !== "requests") url.searchParams.set("view", view);
    else url.searchParams.delete("view");
    if (url.search !== before) window.history.replaceState(window.history.state, "", url.toString());
  }, [view]);

  /* The counts on the tabs. Each block owns its own read, so it REPORTS what it found rather than
     this page fetching the same three lists a second time. `null` is "not answered yet" and draws a
     dash — a 0 while a list is still loading is a wrong statement, not a pending one. */
  const [counts, setCounts] = useState<Record<View, number | null>>({ requests: null, suppliers: null, projects: null });
  const countRequests = useCallback((n: number) => setCounts((c) => (c.requests === n ? c : { ...c, requests: n })), []);
  const countSuppliers = useCallback((n: number) => setCounts((c) => (c.suppliers === n ? c : { ...c, suppliers: n })), []);
  const countProjects = useCallback((n: number) => setCounts((c) => (c.projects === n ? c : { ...c, projects: n })), []);

  /* The same prompt the inbox, the profile and the workspace give a guest — one component, one
     shape, one door (`SignInPrompt` opens the auth modal; there is no /login page). Drawn only once
     the redirect has been ruled out, so a cold arrival never flashes it on the way to Browse. */
  /* ── The page behind the glass, and the card over it (owner, 2026-09-06) ──────────────────────
     ~~A bordered `SignInPrompt` alone in a column.~~ It told a guest the page needed an account and
     showed him nothing of what the account was for. The dashboard's own shape, blurred, with the
     card centred on it says both — the Supplier OS pattern, in this app's own modal. */
  if (status === "anon") {
    return landed ? (
      <GuestWall title={t.guestWall.dashboardTitle} body={t.guestWall.dashboardBody} preview={<GuestDashboardPreview />} />
    ) : null;
  }

  // Nothing is drawn while the session is still resolving: half a dashboard appearing first would be
  // a page nobody asked for, flashing past.
  if (status !== "authed") return null;

  return (
    /* ONE gap between every block (`gap-7`), and the bottom room belongs here rather than to
       whichever block happens to be last — the chat dock floats over that corner and a page ending on
       its final row reads as truncated (owner, 2026-08-31 · 2026-09-05). */
    <div {...pin("home-hub")} className="flex flex-col gap-7 pb-24">
      {/* Under the bell, not in this column: it hangs off the header and points at the control it is
          speaking for (owner, 2026-09-05). Rendered HERE because it belongs to the dashboard alone —
          a renter deep in the create flow must not be tapped on the shoulder. */}
      <HomeNotificationBubble />

      <CtaBanner />

      {/* ── The three tabs (owner, 2026-09-16) ────────────────────────────────────────────────────
          They ARE the section headings: each carries the plate glyph, the name and the count that
          the block's own header used to draw, and the blocks drop that header (`hideHeading`) so the
          dashboard does not say «My Suppliers · 42» twice, a tab apart. */}
      <DashboardTabs view={view} counts={counts} onPick={setView} />

      {/* Every block stays MOUNTED and the two that are closed are hidden (`display:none`), which is
          three deliberate consequences: the counts on the tabs are real for all three rather than
          only for the open one; the three reads happen exactly as they did before this change; and a
          renter's search box, his filters and his half-made group survive a trip to another tab. */}
      <div className={cx("flex flex-col gap-3", view !== "requests" && "hidden")}>
        {/* ── The requests, and the bids beside them (owner, 2026-08-29) ──────────────────────────
            What is out to the market, how long each one still takes bids, and what has come back —
            the two halves of one question, on one row. */}
        <HomeRequests hideHeading onCount={countRequests} />
        {/* It renders NOTHING when there are no requests, which behind a tab is a blank pane rather
            than a block that simply is not there. The line names the door that is already on screen
            above it rather than adding a second one. */}
        {counts.requests === 0 && (
          <p className="rounded-sm border border-dashed border-border bg-surface2 px-3 py-4 text-body text-muted">
            {t.home.noRequestsYet}
          </p>
        )}
      </div>

      {/* ── My Suppliers, BEFORE the sites (owner, 2026-09-04) ────────────────────────────────────
          The suppliers are the list he acts on from this page (he sends a request to them), and the
          sites are reference. The one he acts on comes first. */}
      <div className={cx(view !== "suppliers" && "hidden")}>
        <SuppliersPage embedded hideHeading onCount={countSuppliers} />
      </div>

      {/* ── The sites (owner, 2026-08-30 · reordered 2026-09-04) ──────────────────────────────────
          A renter's sites are part of the picture the dashboard draws — what is out to the market,
          what came back, and what is standing on the ground. */}
      <div className={cx(view !== "projects" && "hidden")}>
        <ProjectsSurface embedded hideHeading onCount={countProjects} />
      </div>

      {/* ~~Suggested suppliers.~~ They are the whole of BROWSE now (owner, 2026-08-30). The
          dashboard answers "what is mine and where does it stand"; a supplier directory answers
          "who else is out there", which is a different question and now has a tab of its own — the
          one a guest lands on, since a visitor with no requests has nothing else to read. */}
    </div>
  );
}

