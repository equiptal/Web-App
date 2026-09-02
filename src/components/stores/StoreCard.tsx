"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useT } from "@/lib/i18n";
import type { StoreCard as StoreCardData } from "@/lib/contract/stores";
import { pin } from "@/lib/uiPins";
import { PinIcon, ShopLogo, ShopPhoto, VerifiedDot } from "@/components/stores/shop";

/**
 * A supplier card, in the two faces the prototype gives it. One 14px outline either way; what
 * changes is the tile at the top and the three lines under it.
 *
 * **All** — the SHOPFRONT. The tile IS the logo: fitted to the card on white, at the size the mark
 * can actually be read, with the tick top-right and the city in a dark pill bottom-left. ~~A navy
 * block with a 52px badge on it~~ (owner, 2026-09-02: *"show the logo in fit with the card instead
 * of the navy"*) — the badge was a stamp on a coloured ground, and most of these marks are wordmarks
 * that need width before they need a backdrop. Then the logo again at 24px beside the name, how much
 * equipment, and up to two category chips with a «+n» in amber for the rest.
 *
 * **A category** — the MACHINE. The tile is the photo; the pill goes dark over it; a store with more
 * than one match gets a `1/2` counter top-left and ‹ › over the image. Then the store's name, the
 * machine's name, and its size and year.
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
  const at = Math.min(i, Math.max(0, matched.length - 1));
  const eq = matched.length > 0 ? matched[at] : null;

  /** The 24px mark beside the name, on both faces. */
  const smallLogo = (
    <ShopLogo
      src={store.logoUrl}
      name={store.name}
      className="h-6 w-6 flex-none rounded-shop-logo-sm"
      initialClassName="grid h-6 w-6 flex-none place-items-center rounded-shop-logo-sm bg-shop-fill text-shop-tag font-shop-bold text-shop-ink"
    />
  );

  /** The name row: the small logo, then the store, wrapping to two lines rather than truncating. */
  const nameRow = (
    <div className="flex min-h-5 min-w-0 items-start gap-[7px]">
      {smallLogo}
      <span className="min-w-0 text-pretty text-shop-control font-semibold leading-[1.3] text-shop-ink">{store.name}</span>
    </div>
  );

  if (eq) {
    const subcategory = ar ? eq.subcategoryAr : eq.subcategory;
    const category = ar ? eq.categoryAr : eq.category;
    const measurement = ar ? eq.measurementAr : eq.measurement;
    const label = subcategory || [eq.make, eq.model].filter(Boolean).join(" ") || category || "—";
    const city = eq.city ?? store.city;
    return (
      <div {...pin("store-card-equipment")} className="overflow-hidden rounded-shop-card border border-shop-line bg-white">
        <Link href={`/equipment/${encodeURIComponent(eq.id)}?storeId=${encodeURIComponent(store.id)}`} className="block text-shop-ink">
          <div className="relative aspect-[16/11] w-full bg-shop-fill">
            <ShopPhoto src={eq.photoUrl} alt={label} />
            {store.isVerified && (
              <span className="absolute end-2 top-2">
                <VerifiedDot size={22} />
              </span>
            )}
            <span className="absolute bottom-2 start-2 inline-flex items-center gap-1 rounded-shop-pill bg-shop-tag px-[9px] py-1 text-shop-tag font-shop-bold text-white">
              <PinIcon size={11} strokeWidth={1.8} /> {city}
            </span>
            {matched.length > 1 && (
              <>
                <span className="absolute start-2 top-2 rounded-shop-control bg-shop-tag px-[7px] py-[3px] text-shop-micro font-shop-bold text-white">
                  {at + 1}/{matched.length}
                </span>
                {/* Over the image, as the prototype has them — and outside the link, since paging a
                    store's machines is not navigation. */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    setI((v) => (v - 1 + matched.length) % matched.length);
                  }}
                  aria-label={t.store.prevPhoto}
                  className="absolute start-1.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full bg-shop-tag-mid text-shop-item font-shop-bold text-white"
                >
                  <span className="rtl:hidden">‹</span>
                  <span className="hidden rtl:inline">›</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    setI((v) => (v + 1) % matched.length);
                  }}
                  aria-label={t.store.nextPhoto}
                  className="absolute end-1.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full bg-shop-tag-mid text-shop-item font-shop-bold text-white"
                >
                  <span className="rtl:hidden">›</span>
                  <span className="hidden rtl:inline">‹</span>
                </button>
              </>
            )}
          </div>
          <div className="px-3 pb-3 pt-2.5">
            {nameRow}
            <div className="mt-2 text-shop-item font-semibold text-shop-ink">{label}</div>
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
      </div>
    );
  }

  const chips = store.categories.slice(0, 2);
  const overflow = store.categories.length - chips.length;

  return (
    <Link
      {...pin("store-card")}
      href={`/stores/${store.id}`}
      className="block overflow-hidden rounded-shop-card border border-shop-line bg-white text-shop-ink"
    >
      {/* The tile is the mark. White, because a logo is drawn for paper and most of these carry their
          own white; contained and generously sized, because a wordmark needs width to be read. */}
      <div className="relative flex aspect-[16/11] w-full items-center justify-center border-b border-shop-line bg-white p-5">
        <ShopLogo
          src={store.logoUrl}
          name={store.name}
          className="max-h-full max-w-full"
          initialClassName="grid h-[52px] w-[52px] place-items-center rounded-shop-logo bg-shop-fill text-shop-name font-shop-bold text-shop-ink"
        />
        {store.isVerified && (
          <span className="absolute end-2 top-2">
            <VerifiedDot size={22} />
          </span>
        )}
        {store.city && (
          <span className="absolute bottom-2 start-2 inline-flex items-center gap-1 rounded-shop-pill bg-shop-tag px-[9px] py-1 text-shop-tag font-shop-bold text-white">
            <PinIcon size={11} strokeWidth={1.8} /> {store.city}
          </span>
        )}
      </div>
      <div className="px-3 pb-3 pt-2.5">
        {nameRow}
        <div className="mt-2 text-shop-item font-shop-bold text-shop-ink">
          {store.activeEquipmentCount} {t.browse.equipmentCount}
        </div>
        {/* One row, clipped: a shop working in six categories must not make its card taller than the
            five beside it. The «+n» is what says the row was cut. */}
        <div className="mt-1.5 flex h-5 flex-wrap gap-[5px] overflow-hidden">
          {chips.map((c) => (
            <span
              key={c.id}
              className="whitespace-nowrap rounded-shop-chip bg-shop-fill px-[9px] py-[3px] text-shop-chip font-semibold text-shop-ink-3"
            >
              {ar ? c.nameAr : c.name}
            </span>
          ))}
          {overflow > 0 && (
            <span className="whitespace-nowrap rounded-shop-chip bg-shop-amber-soft px-[9px] py-[3px] text-shop-chip font-shop-bold text-shop-amber-deep">
              +{overflow}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
