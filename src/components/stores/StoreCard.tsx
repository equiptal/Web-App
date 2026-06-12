"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import type { StoreCard as StoreCardData } from "@/lib/contract/stores";

/**
 * Supplier store card for the home preview and the browse grid (web-app/004, AC-16). Shows store
 * name, logo (when present), verified state (or a `New` label when unverified, AC-13), active-
 * equipment count, and city (when present). No rating / completed-deals / category tags (AC-16).
 */
export function StoreCard({ store }: { store: StoreCardData }) {
  const t = useT();
  return (
    <Link
      href={`/stores/${store.id}`}
      className="flex items-center gap-3 rounded-[12px] border border-border bg-surface p-3.5 transition hover:border-brand hover:shadow-sm"
    >
      <div
        className="grid h-12 w-12 flex-none place-items-center overflow-hidden rounded-[10px] bg-surface2 text-[18px] font-extrabold text-navy-mid"
        style={store.logoUrl ? { backgroundImage: `url(${store.logoUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
      >
        {!store.logoUrl && (store.name.trim()[0]?.toUpperCase() ?? "?")}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[14px] font-bold text-navy">{store.name}</span>
          {store.isVerified ? (
            <span className="inline-flex flex-none items-center gap-0.5 rounded-full bg-ok-soft px-1.5 py-0.5 text-[10px] font-bold text-ok">
              <Icon name="verified" size={12} /> {t.store.verified}
            </span>
          ) : (
            <span className="flex-none rounded-full bg-info-soft px-1.5 py-0.5 text-[10px] font-bold text-info">{t.browse.newLabel}</span>
          )}
        </div>
        <div className="mt-0.5 truncate text-[12.5px] text-muted">
          {store.activeEquipmentCount} {t.browse.equipmentCount}
          {store.city ? <> · {store.city}</> : null}
        </div>
      </div>
      <Icon name="chevron_right" size={18} className="flex-none text-muted" />
    </Link>
  );
}
