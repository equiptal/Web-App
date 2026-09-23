"use client";

import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { useT } from "@/lib/i18n";
import { RequestsWorkspace } from "@/components/workspace/RequestsWorkspace";

/** /requests — the requests workspace: every request, its items and its bids on one page.
 *  It replaces the old list, the per-request bid pages and the comparison surface
 *  (docs/implementation-plans/requests-workspace/plan.md). Guests get a sign-in CTA from the
 *  workspace itself, since there is no /login page — auth is the modal. */
export default function RequestsPage() {
  const t = useT();
  return (
    // `fullBleed` (owner, 2026-08-25: "make the /requests page appear fully without scrolling"). An
    // ordinary page grows past the fold and hands the whole document to the browser's scrollbar,
    // which takes the rail and the request strip off screen with it. Full-bleed pins the shell to
    // exactly the viewport; the workspace then owns its own scrolling region, so the chrome stays put
    // and only the bids move. It is the same treatment the bid map already has.
    //
    // It is NOT a claim about width: since 2026-08-30 a full-bleed page takes the same gutter and the
    // same 1440 cap as every other one, and "full bleed" means only that it owns its height and its
    // own bands inside that column.
    <AppShell title={t.workspace.title} fullBleed>
      {/* Suspense boundary: the workspace reads `useSearchParams` for the dashboard's row actions
          (`?g=…&details=1`), and Next refuses to prerender a component that reads them without one. */}
      <Suspense fallback={null}>
        <RequestsWorkspace />
      </Suspense>
    </AppShell>
  );
}
