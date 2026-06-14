"use client";

import { AppShell } from "@/components/AppShell";
import { RfqProvider } from "@/lib/store/rfq-store";
import { CreateSurface } from "@/components/CreateSurface";
import { useT } from "@/lib/i18n";

/**
 * /create — the RFQ creation flow (web-app/002), reached from the home's Create-request entry and
 * the sidebar Request action (web-app/004 AC-07). Guests run the whole flow; the account gate is at
 * Submit (Step 4 → AccountModal), then the request auto-posts.
 */
export default function CreatePage() {
  const t = useT();
  return (
    <RfqProvider>
      <AppShell title={t.shell.request}>
        <CreateSurface />
      </AppShell>
    </RfqProvider>
  );
}
