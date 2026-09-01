"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { CtaBanner } from "@/components/home/CtaBanner";
import { BrowseSurface } from "@/components/stores/BrowseSurface";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { pin } from "@/lib/uiPins";
import { SHOP_PAGE } from "@/components/stores/shop";

/**
 * Browse — the CTA banner, then every supplier.
 *
 * Two blocks, and the order is the argument: the banner says a renter can ask the market for what he
 * needs, and the directory underneath says who the market is. A visitor who is not ready to ask can
 * read the second and come back to the first.
 *
 * `previewCount` is not passed. On the dashboard the directory was a PREVIEW — eight cards under a
 * "view all" — because it was the fourth block of a page about something else. Here it is the page,
 * so it opens on everything it has.
 */
export function BrowsePage() {
  const t = useT();
  const router = useRouter();
  const { status } = useSession();

  /* ── Signing in ends the visit here — on the TRANSITION, not on arrival (owner, 2026-08-31) ───
     *"After I logged in I must be in dashboard route — browse is for guests before login."*

     Half of that rule was already here and the other half was only claimed. `/` sends a guest to this
     page; nothing sent him back. The header's Sign in opens the auth modal OVER whatever page raised
     it, and with no follow-up action it simply closes — so a renter who signed in from here stayed on
     the directory, which is the guest's answer to a question he no longer has.

     But it cannot be "authed users are not allowed on /browse". Browse is a permanent nav tab for a
     signed-in renter too — it moves from first to second and stays (owner, 2026-08-30: *"same four
     destinations either way"*) — so a flat redirect would make that tab impossible to open. The rule
     is about the MOMENT the account arrives, not about the page being forbidden.

     Hence the ref: it fires on `anon`/`loading` → `authed` and never on a render where the renter was
     already signed in when he got here. Clicking Browse from the nav leaves him on Browse.

     `replace`, not `push`: this page is where he WAS as a guest, not somewhere he chose to be as an
     account, so Back must not return him to it. */
  const wasAuthed = useRef(status === "authed");
  useEffect(() => {
    const arrived = status === "authed" && !wasAuthed.current;
    wasAuthed.current = status === "authed";
    if (arrived) router.replace("/");
  }, [status, router]);

  /* The prototype's column — 1360, a 24px gutter, 80px of foot — matching the store profile and the
     equipment sheet it links to (owner, 2026-09-01). The CTA banner above the directory is NOT in
     the prototype, which models the storefront screens and imports only the header; it stays because
     it is this page's own reason for existing (owner, 2026-08-30: the banner says a renter can ask
     the market, the directory says who the market is). */
  return (
    /* ── No page ground above the banner (owner, 2026-09-01) ─────────────────────────────────────
       *"What is this?"* — a pale 11px band between the navy header and the hero, on the page a guest
       lands on.

       `pt-9` (36px) is the storefront column's own head, and it is right for the DIRECTORY. The
       banner is not in that column: it breaks out to `w-screen` and pulls itself up by
       `PAGE_Y + 1px` (25/29) to sit flush under the header — a figure written against the shell's
       padding, not against this page's. 36 less 25 left eleven pixels of page showing through, and
       against a dark header and a dark photograph eleven pixels of near-white reads as a seam.

       So this column's head is set to exactly what the banner pulls — the same `PAGE_Y + 1px` the
       banner was written against — and the two cancel to zero. The banner then sits flush under the
       header on this page as it already does on the home hub, where the shell's own padding is what
       it was cancelling. The directory keeps its 28px of air from `gap-7`, unchanged. */
    <div
      {...pin("browse-page")}
      className={`${SHOP_PAGE} flex flex-col gap-7 pt-[calc(1.5rem+1px)] sm:pt-[calc(1.75rem+1px)]`}
    >
      <CtaBanner />
      <BrowseSurface title={t.home.suppliersTitle} />
    </div>
  );
}
