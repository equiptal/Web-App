"use client";

import { AppShell } from "@/components/AppShell";
import { useLocale } from "@/lib/i18n";
import { RequestsList } from "@/components/requests/RequestsList";

/** /requests — the renter's own requests (web-app/request-details-bids). */
export default function RequestsPage() {
  const { locale } = useLocale();
  return (
    <AppShell title={locale === "ar" ? "طلباتي" : "My Requests"} wide>
      <RequestsList />
    </AppShell>
  );
}
