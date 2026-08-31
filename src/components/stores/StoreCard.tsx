"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useT } from "@/lib/i18n";
import type { StoreCard as StoreCardData } from "@/lib/contract/stores";
import { pin } from "@/lib/uiPins";
import { CityTag, PinIcon, VerifiedDot } from "@/components/stores/shop";

/**
 * A supplier card, in the two faces Browse gives it — same skin as the profile's machine card:
 * a 14px outline, a 16:11 image with the tick top-right and the city bottom-left, then the words.
 *
 * **No category chosen** — the SHOPFRONT: the store's logo over its name, how much equipment it
 * holds, and up to two categories it works in with a «+n» for the rest. Clicking goes to the store.
 *
 * **A category chosen** — the MACHINE: that store's matching equipment, one at a time, with ‹ › and
 * a `1/2` counter when there is more than one. A renter filtering for excavators is shopping for an
 * excavator, not for a firm, so the card shows the machine and clicking goes to the machine.
 *
 * The matching equipment is `store.matched`, which only a category-filtered projection sends. Empty
 * → the card keeps its shopfront face, which is what lets this screen run ahead of that field.
 */
export function StoreCard({ store }: { store: StoreCardData }) {
  const t = useT();
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [i, setI] = useState(0);

  const matched = store.matched;
  const eq = matched.length > 0 ? matched[Math.min(i, matched.length - 1)] : null;

  if (eq) {
    const category = ar ? eq.categoryAr : eq.category;
    const subcategory = ar ? eq.subcategoryAr : eq.subcategory;
    const measurement = ar ? eq.measurementAr : eq.measurement;
    const label = subcategory || [eq.make, eq.model].filter(Boolean).join(" ") || category || "—";
    const city = eq.city ?? store.city;
    return (
      <div
        {...pin("store-card-equipment")}
        className="overflow-hidden rounded-shop-card border border-shop-line text-shop-ink transition hover:border-shop-amber"
      >
        <Link href={`/equipment/${encodeURIComponent(eq.id)}?storeId=${encodeURIComponent(store.id)}`} className="block">
          <div className="relative aspect-[16/11] w-full bg-shop-fill">
            {eq.photoUrl && <div className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url("${eq.photoUrl}")` }} />}
            {(eq.isVerified || store.isVerified) && (
              <span className="absolute end-2 top-2">
                <VerifiedDot size={22} />
              </span>
            )}
            {city && <CityTag city={city} />}
          </div>
          <div className="px-3 pb-3 pt-2.5">
            <div className="truncate text-shop-label font-shop-bold uppercase tracking-[0.3px] text-shop-ink-4">{store.name}</div>
            <div className="mt-1.5 truncate text-shop-item font-semibold text-shop-ink">{label}</div>
            <div className="mt-[5px] flex gap-1.5">
              {measurement && (
                <span className="rounded-shop-chip bg-shop-amber-soft px-[9px] py-[3px] text-shop-meta font-semibold text-shop-amber-deep">
                  {measurement}
                </span>
              )}
              {eq.year != null && (
                <span className="rounded-shop-chip bg-shop-fill px-[9px] py-[3px] text-shop-meta font-semibold text-shop-ink">{eq.year}</span>
              )}
            </div>
          </div>
        </Link>
        {/* The stepper sits OUTSIDE the link: paging a store's machines is not navigation. */}
        {matched.length > 1 && (
          <div className="flex items-center justify-between border-t border-shop-line-soft px-2.5 py-1.5">
            <button
              type="button"
              onClick={() => setI((v) => (v - 1 + matched.length) % matched.length)}
              className="grid h-6 w-6 place-items-center rounded-full text-shop-ink-3 transition hover:bg-shop-fill hover:text-shop-ink"
              aria-label={t.store.prevPhoto}
            >
              <Chevron dir="prev" />
            </button>
            <span className="text-shop-tag font-shop-bold tabular-nums text-shop-ink-3">
              {Math.min(i, matched.length - 1) + 1}/{matched.length}
            </span>
            <button
              type="button"
              onClick={() => setI((v) => (v + 1) % matched.length)}
              className="grid h-6 w-6 place-items-center rounded-full text-shop-ink-3 transition hover:bg-shop-fill hover:text-shop-ink"
              aria-label={t.store.nextPhoto}
            >
              <Chevron dir="next" />
            </button>
          </div>
        )}
      </div>
    );
  }

  const chips = store.categories.slice(0, 2);
  const overflow = store.categories.length - chips.length;

  return (
    <Link
      {...pin("store-card")}
      href={`/stores/${store.id}`}
      className="block overflow-hidden rounded-shop-card border border-shop-line text-shop-ink transition hover:border-shop-amber"
    >
      <div className="relative grid aspect-[16/11] w-full place-items-center bg-shop-fill">
        {store.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={store.logoUrl} alt={store.name} className="h-16 w-16 rounded-shop-logo object-cover" />
        ) : (
          <span className="grid h-16 w-16 place-items-center rounded-shop-logo bg-white text-shop-name font-shop-bold text-shop-ink">
            {store.name.trim()[0]?.toUpperCase() ?? "?"}
          </span>
        )}
        {store.isVerified && (
          <span className="absolute end-2 top-2">
            <VerifiedDot size={22} />
          </span>
        )}
        {store.city && <CityTag city={store.city} />}
      </div>
      <div className="px-3 pb-3 pt-2.5">
        <div className="truncate text-shop-item font-shop-bold text-shop-ink">{store.name}</div>
        <div className="mt-1.5 inline-flex items-center gap-[5px] text-shop-meta text-shop-ink-3">
          <span className="text-shop-ink-4">
            <PinIcon size={13} />
          </span>
          {store.activeEquipmentCount} {t.browse.equipmentCount}
        </div>
        {chips.length > 0 && (
          <div className="mt-[5px] flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <span key={c.id} className="rounded-shop-chip bg-shop-fill px-[9px] py-[3px] text-shop-meta font-semibold text-shop-ink">
                {ar ? c.nameAr : c.name}
              </span>
            ))}
            {overflow > 0 && (
              <span className="rounded-shop-chip bg-shop-fill px-[9px] py-[3px] text-shop-meta font-semibold text-shop-ink-3">+{overflow}</span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}

/** The stepper's arrow — the prototype's own path, mirrored for the other direction and for RTL. */
function Chevron({ dir }: { dir: "prev" | "next" }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={dir === "next" ? "scale-x-[-1] rtl:scale-x-100" : "rtl:scale-x-[-1]"}
    >
      <path d="M14 6L8 12L14 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
