"use client";

import { AppShell } from "@/components/AppShell";
import { useLocale } from "@/lib/i18n";

/**
 * /dashboard — the procurement-dashboard prototype embedded inside the app shell (full-bleed, so it
 * fills the content area rather than sitting in a padded card). The prototype hides its own
 * sidebar/topbar in ?embed=1 mode, so only the unified app sidebar shows.
 */
export default function DashboardPage() {
  const { locale } = useLocale();
  return (
    <AppShell fullBleed title={locale === "ar" ? "لوحة التحكم" : "Procurement Dashboard"}>
      <iframe
        src={`/procurement-dashboard.html?embed=1&lang=${locale}`}
        title="Procurement Dashboard"
        className="block min-h-0 w-full flex-1"
        style={{ border: 0 }}
      />
    </AppShell>
  );
}
