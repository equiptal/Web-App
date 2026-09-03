"use client";

import { Icon } from "@/components/ui";
import { useT } from "@/lib/i18n";

/**
 * «On Moedatech» — the firm has an account here.
 *
 * One badge, wherever that fact is stated (owner, 2026-09-03: *"show the On Moedatech tag badge
 * beside the vendor badge if the user is on Moedatech, same as in my suppliers table badge, also in
 * this supplier"*). It was the table's own inline markup, and elsewhere the same fact appeared as a
 * bare green shield with no words at all — which a reader cannot tell apart from «verified».
 *
 * ── What it is NOT ──────────────────────────────────────────────────────────────────────────────
 * Not the vendor mark: that is the renter's private label on a firm he works with, and it is his to
 * set. Not «verified by Moedatech» either: that is a claim WE make about the firm's papers. This
 * says only that the firm holds an account, which is why it matters here — it is where their bids
 * arrive, and a supplier without one is reached by e-mail alone.
 *
 * Navy, because the two facts beside it are green: the vendor chip and the verified chip. Three
 * green pills on one row would read as three degrees of the same thing.
 */
export function MoedatechBadge({ size = 12 }: { size?: number }) {
  const t = useT();
  return (
    <span className="inline-flex h-[19px] flex-none items-center gap-1 rounded-full bg-navy px-2 text-label font-extrabold text-surface">
      <Icon name="verified_user" size={size} />
      {t.suppliers.onMoedatech}
    </span>
  );
}
