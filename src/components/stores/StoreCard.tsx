"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import type { StoreCard as StoreCardData } from "@/lib/contract/stores";

/**
 * Supplier store card — gradient banner with an overlapping logo, a verified/New pill, then the
 * store name + meta (equipment count, city). Per AC-16 there is no rating, completed-deals count, or
 * category tag (not in the data).
 */
export function StoreCard({ store }: { store: StoreCardData }) {
  const t = useT();
  return (
    <Link
      href={`/stores/${store.id}`}
      className="block overflow-hidden rounded-[16px] border border-border bg-surface transition hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,.1)]"
    >
      {/* Banner */}
      <div className="relative flex h-[90px] items-end bg-gradient-to-br from-navy to-[#1e3a5f] px-4">
        <div
          className="grid h-[52px] w-[52px] flex-none translate-y-[26px] place-items-center overflow-hidden rounded-[12px] border-[3px] border-surface bg-surface text-[20px] font-extrabold text-navy"
          style={store.logoUrl ? { backgroundImage: `url("${store.logoUrl}")`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
        >
          {!store.logoUrl && (store.name.trim()[0]?.toUpperCase() ?? "?")}
        </div>
        {store.isVerified ? (
          <span className="absolute end-3 top-2.5 inline-flex items-center gap-1 rounded-full bg-ok px-2.5 py-[3px] text-[11px] font-semibold text-white">
            <Icon name="check" size={11} /> {t.store.verified}
          </span>
        ) : (
          <span className="absolute end-3 top-2.5 inline-flex items-center gap-1 rounded-full bg-info px-2.5 py-[3px] text-[11px] font-semibold text-white">
            {t.browse.newLabel}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="px-4 pb-4 pt-9">
        <div className="truncate text-[14px] font-bold text-navy">{store.name}</div>
        <div className="mt-2 flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-[12px] text-muted">
            <Icon name="business_center" size={13} /> {store.activeEquipmentCount} {t.browse.equipmentCount}
          </span>
          {store.city && (
            <span className="inline-flex items-center gap-1.5 text-[12px] text-muted">
              <Icon name="location_on" size={13} /> {store.city}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
