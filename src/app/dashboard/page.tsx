"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { useLocale } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { canSeeProcurementDashboard } from "@/lib/access/dashboard";

/**
 * /dashboard — the procurement-dashboard prototype embedded inside the app shell (full-bleed). It's a
 * DEMO surface limited to the CCC mock account, so non-CCC accounts are redirected home even if they
 * type the URL (the sidebar item is hidden for them too — see AppShell). The prototype hides its own
 * sidebar/topbar in ?embed=1 mode, so only the unified app sidebar shows.
 */
export default function DashboardPage() {
  const { locale } = useLocale();
  const { user, status } = useSession();
  const router = useRouter();
  const allowed = canSeeProcurementDashboard(user);

  useEffect(() => {
    if (status === "authed" && !allowed) router.replace("/");
  }, [status, allowed, router]);

  // Don't render the dashboard for anyone but the CCC mock account (or while the session loads).
  if (status !== "authed" || !allowed) return null;

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
