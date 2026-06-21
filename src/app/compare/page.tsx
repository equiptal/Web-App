"use client";

import { AppShell } from "@/components/AppShell";
import { useLocale } from "@/lib/i18n";
import { BidComparisonWorkspace } from "@/components/compare/BidComparisonWorkspace";

/** /compare — the bid-comparison procurement workspace (web-app/007): location → request → item,
 *  three-block side-by-side compare, qualified against the request's requirements. */
export default function ComparePage() {
  const { locale } = useLocale();
  return (
    <AppShell title={locale === "ar" ? "مقارنة العروض" : "Bid Comparison"}>
      <BidComparisonWorkspace />
    </AppShell>
  );
}
