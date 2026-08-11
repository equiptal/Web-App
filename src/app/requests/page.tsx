"use client";

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
    <AppShell title={t.workspace.title} wide>
      <RequestsWorkspace />
    </AppShell>
  );
}
