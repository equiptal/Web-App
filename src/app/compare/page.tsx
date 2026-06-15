"use client";

import { AppShell } from "@/components/AppShell";
import { useLocale } from "@/lib/i18n";
import { CompareBids } from "@/components/compare/CompareBids";

/** /compare — upload a Moedatech quotation and compare its bids per item (web-app/multi-item-requests). */
export default function ComparePage() {
  const { locale } = useLocale();
  return (
    <AppShell title={locale === "ar" ? "مقارنة العروض" : "Compare bids"}>
      <CompareBids />
    </AppShell>
  );
}
