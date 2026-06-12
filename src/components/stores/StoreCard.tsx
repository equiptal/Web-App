"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import type { StoreCard as StoreCardData } from "@/lib/contract/stores";

/**
 * Supplier store card — matches the prototype's `.store` design (navy cover with avatar + verified
 * check + badge pill, body with name, equipment-count line, and a city chip). Per AC-16 the rating,
 * completed-deals count, and category tags shown in the mock are omitted (not in the data).
 */
export function StoreCard({ store }: { store: StoreCardData }) {
  const t = useT();
  return (
    <Link
      href={`/stores/${store.id}`}
      className="block overflow-hidden rounded-[14px] border border-border bg-surface shadow-[0_1px_3px_rgba(0,0,0,.04)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(16,40,68,.14)]"
    >
      {/* Cover (navy) */}
      <div className="bg-navy px-3.5 pb-3 pt-4 text-white">
        <div className="flex items-start justify-between gap-2.5">
          <div className="relative flex-none">
            <div
              className="grid h-[60px] w-[60px] place-items-center overflow-hidden rounded-[10px] bg-white text-[24px] font-extrabold text-navy"
              style={store.logoUrl ? { backgroundImage: `url("${store.logoUrl}")`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
            >
              {!store.logoUrl && (store.name.trim()[0]?.toUpperCase() ?? "?")}
            </div>
            {store.isVerified && (
              <Icon name="check_circle" size={22} className="absolute -bottom-1 -end-1 rounded-full bg-navy text-ok" />
            )}
          </div>
          {store.isVerified ? (
            <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-ok/65 bg-ok/45 px-2.5 py-1 text-[10.5px] font-bold text-white">
              <Icon name="check" size={13} /> {t.store.verified}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-info/65 bg-info/45 px-2.5 py-1 text-[10.5px] font-bold text-white">
              <Icon name="star" size={13} /> {t.browse.newLabel}
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="px-3.5 pb-4 pt-3">
        <div className="truncate text-[15px] font-bold leading-tight tracking-[-.2px] text-navy">{store.name}</div>
        <div className="mt-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-muted">
          <Icon name="business_center" size={15} /> {store.activeEquipmentCount} {t.browse.equipmentCount}
        </div>
        {store.city && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <span className="rounded-full bg-black/[.04] px-2.5 py-[3px] text-[11px] font-semibold text-muted">{store.city}</span>
          </div>
        )}
      </div>
    </Link>
  );
}
