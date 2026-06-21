"use client";

import { AppShell } from "@/components/AppShell";
import { useLocale } from "@/lib/i18n";
import { ProcurementDashboard } from "@/components/dashboard/ProcurementDashboard";

/** /dashboard — procurement command-center (prototype), wired to the renter's real requests + bids. */
export default function DashboardPage() {
  const { locale } = useLocale();
  return (
    <AppShell title={locale === "ar" ? "لوحة التحكم" : "Procurement Dashboard"}>
      <ProcurementDashboard />
    </AppShell>
  );
}
