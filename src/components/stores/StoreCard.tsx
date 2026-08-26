"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import type { StoreCard as StoreCardData } from "@/lib/contract/stores";
import { pin } from "@/lib/uiPins";

/**
 * Supplier store card — gradient banner with an overlapping logo, a verified/New pill, then the
 * store name + meta (equipment count, city). Per AC-16 there is no rating, completed-deals count, or
 * category tag (not in the data).
 */
export function StoreCard({ store }: { store: StoreCardData }) {
  const t = useT();
  return (
    <Link {...pin("store-card")}
      href={`/stores/${store.id}`}
      className="block overflow-hidden rounded-sm border border-border bg-surface transition"
    >
      {/* Banner */}
      <div className="relative flex h-[90px] items-end bg-gradient-to-br from-navy to-navy-deep px-4">
        <div
          className="grid h-[52px] w-[52px] flex-none translate-y-[26px] place-items-center overflow-hidden rounded-sm border-[3px] border-surface bg-surface text-display font-extrabold text-navy"
          style={store.logoUrl ? { backgroundImage: `url("${store.logoUrl}")`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
        >
          {!store.logoUrl && (store.name.trim()[0]?.toUpperCase() ?? "?")}
        </div>
        {store.isVerified ? (
          <span className="absolute end-3 top-2.5 inline-flex items-center gap-1 rounded-full bg-ok px-2.5 py-1 text-label font-semibold text-white">
            <Icon name="check" size={11} /> {t.store.verified}
          </span>
        ) : (
          <span className="absolute end-3 top-2.5 inline-flex items-center gap-1 rounded-full bg-info px-2.5 py-1 text-label font-semibold text-white">
            {t.browse.newLabel}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="px-4 pb-4 pt-9">
        <div className="truncate text-body font-semibold text-navy">{store.name}</div>
        <div className="mt-2 flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-meta text-muted">
            <Icon name="business_center" size={13} /> {store.activeEquipmentCount} {t.browse.equipmentCount}
          </span>
          {store.city && (
            <span className="inline-flex items-center gap-1.5 text-meta text-muted">
              <Icon name="location_on" size={13} /> {store.city}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
