"use client";

import { HomeNotificationBubble } from "@/components/home/HomeNotificationBubble";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session";
import { useT } from "@/lib/i18n";
import { SignInPrompt } from "@/components/common/SignInPrompt";
import { previousPath } from "@/lib/nav-trail";
import { CtaBanner } from "@/components/home/CtaBanner";
import { HomeRequests } from "@/components/home/HomeRequests";
import { ProjectsSurface } from "@/components/projects/ProjectsSurface";
import { SuppliersPage } from "@/components/suppliers/SuppliersPage";
import { pin } from "@/lib/uiPins";
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

  /* The same prompt the inbox, the profile and the workspace give a guest — one component, one
     shape, one door (`SignInPrompt` opens the auth modal; there is no /login page). Drawn only once
     the redirect has been ruled out, so a cold arrival never flashes it on the way to Browse. */
  if (status === "anon") {
    return landed ? (
      <div className="mx-auto max-w-xl">
        <SignInPrompt icon="dashboard" title={t.home.signInTitle} body={t.home.signInBody} />
      </div>
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

      {/* ── The requests, and the bids beside them (owner, 2026-08-29) ────────────────────────────
          The dashboard's first block, above the activity tiles: what is out to the market, how long
          each one still takes bids, and what has come back — the two halves of one question, on one
          row. It draws nothing for a renter with no requests, so a new account still opens on the
          hero and the suppliers. */}
      <HomeRequests />

      {/* ── My Suppliers, ABOVE the sites (owner, 2026-09-04) ───────────────────────────────
          It sat under the projects, on the reasoning that the order of the thought is *this is my
          work, and these are the firms I put on it*. Reversed on the owner's call: the suppliers are
          the list he acts on from this page (he sends a request to them), and the sites are
          reference. The one he acts on comes first.

          Not a route of its own either way (owner, 2026-09-01): a renter asks "who do I send this
          to" while he is looking at the work that needs sending, and a tab that has to be remembered
          is a tab that is not used. */}
      <SuppliersPage embedded />

      {/* ── The sites, under the suppliers (owner, 2026-08-30 · reordered 2026-09-04) ──────
          Not a route of its own. A renter's sites are part of the picture the dashboard already
          draws — what is out to the market, what came back, and what is standing on the ground — so
          they sit in that column rather than behind a tab that has to be remembered.

          It renders nothing for a guest or a renter with no sites, so a new account sees exactly
          today's dashboard. */}
      <ProjectsSurface embedded />

      {/* ~~Suggested suppliers.~~ They are the whole of BROWSE now (owner, 2026-08-30). The
          dashboard answers "what is mine and where does it stand"; a supplier directory answers
          "who else is out there", which is a different question and now has a tab of its own — the
          one a guest lands on, since a visitor with no requests has nothing else to read. */}
    </div>
  );
}

