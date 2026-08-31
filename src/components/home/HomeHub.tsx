"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session";
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

  /* ── A guest belongs on Browse (owner, 2026-08-30) ───────────────────────────────────────────
     The dashboard answers "what is mine and where does it stand", and a visitor has no answer to
     that — he was landing on a hero and four empty states. Browse answers "who is out there", which
     is the question he actually has.

     `replace`, not `push`: the dashboard is not somewhere he has BEEN, so it must not sit in his
     history for Back to return him to. And only once `status` has settled — acting while it still
     reads "loading" would bounce every signed-in renter through Browse on a cold load, which is the
     flash this exists to avoid. */
  useEffect(() => {
    if (status === "anon") router.replace("/browse");
  }, [status, router]);

  // Nothing is drawn for a guest: the redirect is on its way, and half a dashboard appearing first
  // would be a page he never asked for, flashing past.
  if (status !== "authed") return null;

  return (
    <div {...pin("home-hub")} className="flex flex-col gap-7">
      <CtaBanner />

      {/* ── The requests, and the bids beside them (owner, 2026-08-29) ────────────────────────────
          The dashboard's first block, above the activity tiles: what is out to the market, how long
          each one still takes bids, and what has come back — the two halves of one question, on one
          row. It draws nothing for a renter with no requests, so a new account still opens on the
          hero and the suppliers. */}
      <HomeRequests />

      {/* ── The sites, under the requests (owner, 2026-08-30) ──────────────────────────────
          Not a route of its own. A renter's sites are part of the picture the dashboard already
          draws — what is out to the market, what came back, and what is standing on the ground — so
          they sit in that column rather than behind a tab that has to be remembered.

          It renders nothing for a guest or a renter with no sites, so a new account sees exactly
          today's dashboard. */}
      <ProjectsSurface embedded />

      {/* My Suppliers, under the sites rather than behind a tab of its own (owner, 2026-09-01).

          A renter asks "who do I send this to" while he is looking at the work that needs sending.
          Behind a tab, the question and the answer were two navigations apart — and a tab that has to
          be remembered is a tab that is not used. Under the projects because that is the order of the
          thought: this is my work, and these are the firms I put on it. */}
      <SuppliersPage embedded />

      {/* ~~Suggested suppliers.~~ They are the whole of BROWSE now (owner, 2026-08-30). The
          dashboard answers "what is mine and where does it stand"; a supplier directory answers
          "who else is out there", which is a different question and now has a tab of its own — the
          one a guest lands on, since a visitor with no requests has nothing else to read. */}
    </div>
  );
}

