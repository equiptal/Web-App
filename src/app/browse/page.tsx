"use client";

import { AppShell } from "@/components/AppShell";
import { BrowseSurface } from "@/components/stores/BrowseSurface";
import { useT } from "@/lib/i18n";

/** /browse — read-only verified-supplier discovery (web-app/004 Flow 3). */
export default function BrowsePage() {
  const t = useT();
  return (
    <AppShell title={t.browse.title}>
      <BrowseSurface />
    </AppShell>
  );
}
