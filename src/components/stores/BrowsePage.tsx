"use client";

import { CtaBanner } from "@/components/home/CtaBanner";
import { BrowseSurface } from "@/components/stores/BrowseSurface";
import { useT } from "@/lib/i18n";
import { pin } from "@/lib/uiPins";

/**
 * Browse — the CTA banner, then every supplier.
 *
 * Two blocks, and the order is the argument: the banner says a renter can ask the market for what he
 * needs, and the directory underneath says who the market is. A visitor who is not ready to ask can
 * read the second and come back to the first.
 *
 * `previewCount` is not passed. On the dashboard the directory was a PREVIEW — eight cards under a
 * "view all" — because it was the fourth block of a page about something else. Here it is the page,
 * so it opens on everything it has.
 */
export function BrowsePage() {
  const t = useT();
  return (
    <div {...pin("browse-page")} className="flex flex-col gap-7">
      <CtaBanner />
      <BrowseSurface title={t.home.suppliersTitle} />
    </div>
  );
}
