"use client";

import { AppShell } from "@/components/AppShell";
import { useLocale } from "@/lib/i18n";

/**
 * /dashboard — the procurement-dashboard prototype embedded inside the app shell, so it uses the
 * real (unified) web-app sidebar. The prototype hides its own sidebar/topbar in ?embed=1 mode.
 */
export default function DashboardPage() {
  const { locale } = useLocale();
  return (
    <AppShell title={locale === "ar" ? "لوحة التحكم" : "Procurement Dashboard"}>
      <iframe
        src={`/procurement-dashboard.html?embed=1&lang=${locale}`}
        title="Procurement Dashboard"
        className="w-full"
        style={{ height: "calc(100vh - 110px)", border: 0 }}
      />
    </AppShell>
  );
}
