"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useT } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import type { StoreCard as StoreCardData } from "@/lib/contract/stores";
import { pin } from "@/lib/uiPins";

/**
 * A supplier card, in the two faces Browse gives it.
 *
 * **No category chosen** — the SHOPFRONT: logo, name, verified tick, the city, how much equipment,
 * and which categories they work in (two chips and a «+n», because a card that lists nine categories
 * is a paragraph). Clicking goes to the store.
 *
 * **A category chosen** — the MACHINE: the store's equipment IN that category, one at a time, with a
 * ‹ › stepper when there is more than one. A renter filtering for excavators is shopping for an
 * excavator, not for a firm, so the card shows the machine and clicking goes to the machine.
 *
 * The matching equipment is `store.matched`, which only a category-filtered projection sends. When it
 * is empty the card falls back to its shopfront face — an unfilled promise is worse than the plain
 * card, and the fallback is what keeps this screen working ahead of that backend field.
 */
export function StoreCard({ store }: { store: StoreCardData }) {
  const t = useT();
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [i, setI] = useState(0);

  const matched = store.matched;
  const eq = matched.length > 0 ? matched[Math.min(i, matched.length - 1)] : null;

  const verified = store.isVerified && (
    <span className="absolute end-2.5 top-2.5 grid h-[22px] w-[22px] place-items-center rounded-full bg-ok text-white" title={t.store.verified}>
      <Icon name="check" size={13} />
    </span>
  );
  const cityTag = (city: string | null) =>
    city && (
      <span className="absolute bottom-2.5 start-2.5 inline-flex items-center gap-1 rounded-full bg-navy/85 px-2 py-0.5 text-label font-semibold text-white">
        <Icon name="location_on" size={11} /> {city}
      </span>
    );

  if (eq) {
    const category = ar ? eq.categoryAr : eq.category;
    const subcategory = ar ? eq.subcategoryAr : eq.subcategory;
    const measurement = ar ? eq.measurementAr : eq.measurement;
    const title = [eq.make, eq.model].filter(Boolean).join(" ") || subcategory || category || "—";
    return (
      <div {...pin("store-card-equipment")} className="overflow-hidden rounded-sm border border-border bg-surface transition hover:border-brand/50">
        <Link href={`/equipment/${encodeURIComponent(eq.id)}?storeId=${encodeURIComponent(store.id)}`} className="block">
          <div
            className="relative grid h-[126px] place-items-center bg-gradient-to-br from-surface2 to-surface3"
            style={eq.photoUrl ? { backgroundImage: `url("${eq.photoUrl}")`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
          >
            {!eq.photoUrl && <Icon name="construction" size={36} className="text-muted" />}
            {eq.isVerified && (
              <span className="absolute end-2.5 top-2.5 grid h-[22px] w-[22px] place-items-center rounded-full bg-ok text-white" title={t.store.verified}>
                <Icon name="check" size={13} />
              </span>
            )}
            {cityTag(eq.city ?? store.city)}
          </div>
          <div className="px-3.5 pb-3 pt-2.5">
            <div className="truncate text-label font-semibold uppercase tracking-wide text-muted">{store.name}</div>
            <div className="mt-0.5 truncate text-body font-extrabold text-navy">{title}</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {measurement && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-label font-extrabold text-brand-deep">{measurement}</span>}
              {eq.year != null && <span className="rounded-full bg-surface2 px-2 py-0.5 text-label font-semibold text-navy-mid">{eq.year}</span>}
            </div>
          </div>
        </Link>
        {/* The stepper is OUTSIDE the link: paging through a store's machines is not navigation. */}
        {matched.length > 1 && (
          <div className="flex items-center justify-between border-t border-border px-2.5 py-1.5">
            <button
              type="button"
              onClick={() => setI((v) => (v - 1 + matched.length) % matched.length)}
              className="grid h-6 w-6 place-items-center rounded-full text-muted hover:bg-surface2 hover:text-navy"
              aria-label={t.store.prevPhoto}
            >
              <Icon name="chevron_left" size={16} className="rtl:scale-x-[-1]" />
            </button>
            <span className="text-label font-semibold tabular-nums text-muted">
              {Math.min(i, matched.length - 1) + 1}/{matched.length}
            </span>
            <button
              type="button"
              onClick={() => setI((v) => (v + 1) % matched.length)}
              className="grid h-6 w-6 place-items-center rounded-full text-muted hover:bg-surface2 hover:text-navy"
              aria-label={t.store.nextPhoto}
            >
              <Icon name="chevron_right" size={16} className="rtl:scale-x-[-1]" />
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
      className="block overflow-hidden rounded-sm border border-border bg-surface transition hover:border-brand/50"
    >
      {/* Banner */}
      <div className="relative flex h-[90px] items-end bg-gradient-to-br from-navy to-navy-deep px-4">
        <div
          className="grid h-[52px] w-[52px] flex-none translate-y-[26px] place-items-center overflow-hidden rounded-sm border-[3px] border-surface bg-surface text-display font-extrabold text-navy"
          style={store.logoUrl ? { backgroundImage: `url("${store.logoUrl}")`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
        >
          {!store.logoUrl && (store.name.trim()[0]?.toUpperCase() ?? "?")}
        </div>
        {verified}
        {cityTag(store.city)}
      </div>

      {/* Body */}
      <div className="px-4 pb-4 pt-9">
        <div className="truncate text-body font-semibold text-navy">{store.name}</div>
        <div className="mt-2 inline-flex items-center gap-1.5 text-meta text-muted">
          <Icon name="business_center" size={13} /> {store.activeEquipmentCount} {t.browse.equipmentCount}
        </div>
        {/* Which categories they work in — sent by the backend, or nothing at all. */}
        {chips.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <span key={c.id} className="rounded-full bg-surface2 px-2 py-0.5 text-label font-semibold text-navy-mid">
                {ar ? c.nameAr : c.name}
              </span>
            ))}
            {overflow > 0 && <span className="rounded-full bg-surface2 px-2 py-0.5 text-label font-semibold text-muted">+{overflow}</span>}
          </div>
        )}
      </div>
    </Link>
  );
}
