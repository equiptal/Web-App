"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useT } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import type { EquipmentCard, StoreDetail, TaxonomyNode } from "@/lib/contract/stores";
import { btn } from "@/lib/ds";
import { pin } from "@/lib/uiPins";
import { CheckIcon, CityTag, DocIcon, EyeIcon, PinIcon, SHOP_PAGE, ShopLogo, ShopPhoto, VerifiedDot } from "@/components/stores/shop";

/**
 * A supplier's profile — the approved prototype, matched value for value.
 *
 * One column, 28px between its two rows: the store, then its equipment four to a row. The store card
 * is a 14px-radius outline holding three bands separated by hairlines — identity (logo, name, tick,
 * then city · count · views), About (RTL prose, the full width of the card), and the documents row.
 * A machine is a photo at 16:11 with the tick top-right and the city bottom-left, then its category
 * over its name, then a size chip and a year chip.
 *
 * ⚠️ **The prototype's equipment cards carry NO price**, and the profile shows no operators tile and
 * no verification-status word. All three were on the previous build; they are gone because they are
 * not in the reference (owner, 2026-09-01: *"match the prototype exactly in everything"*). The price
 * still lives on the equipment sheet, which is where the reference puts it.
 *
 * The DATA stays the app's: the document chips are the store's own three (AC-19), not the
 * prototype's ISTIMARA / COMMERCIAL REG. / TUV, and they still say status by colour alone —
 * contents are never surfaced.
 */
export function StoreDetailSurface({ id, onTitle }: { id: string; onTitle?: (name: string) => void }) {
  const t = useT();
  const [detail, setDetail] = useState<StoreDetail | null>(null);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [icons, setIcons] = useState<Record<string, string>>({});

  // Taxonomy icons (shared bucket) → node id → iconUrl, for a machine with no photo. The BFF answers
  // a guest from the app's public taxonomy, so a signed-out visitor gets the same artwork.
  useEffect(() => {
    fetch("/api/stores/taxonomy", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: { taxonomy: TaxonomyNode[] }) => {
        const map: Record<string, string> = {};
        const walk = (n: TaxonomyNode) => {
          if (n.iconUrl) map[n.id] = n.iconUrl;
          n.children.forEach(walk);
        };
        (d.taxonomy ?? []).forEach(walk);
        setIcons(map);
      })
      .catch(() => setIcons({}));
  }, []);

  useEffect(() => {
    setError(false);
    setDetail(null);
    const ctrl = new AbortController();
    fetch(`/api/stores/${encodeURIComponent(id)}`, { cache: "no-store", signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: StoreDetail) => {
        setDetail(d);
        onTitle?.(d.name);
      })
      .catch((e) => {
        if (e?.name !== "AbortError") setError(true);
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, reloadKey]);

  if (error) {
    return (
      <div className={`${SHOP_PAGE} pt-6`}>
        <div className="rounded-shop-card border border-shop-line bg-white p-8 text-center text-shop-body text-shop-ink-3">
          <Icon name="error_outline" size={22} className="mx-auto mb-2" />
          <p>{t.store.error}</p>
          <button onClick={() => setReloadKey((k) => k + 1)} className={btn("secondary", "sm", { className: "mt-3" })}>
            {t.store.retry}
          </button>
        </div>
      </div>
    );
  }
  if (!detail) {
    return <div className={`${SHOP_PAGE} pt-6 text-center text-shop-body text-shop-ink-3`}>{t.store.loading}</div>;
  }

  return (
    <div {...pin("store-detail")} className={`${SHOP_PAGE} pt-6`}>
      {/* ~~«Back to suppliers», the prototype's own grey link.~~ Removed (owner, 2026-09-03): the
          page above this already renders the shell's `PageBack`, so a store showed TWO back
          controls in two different shapes, one under the other, going to the same place. The shell's
          is the one that survives everywhere. */}

      <div className="flex flex-col gap-7">
        {/* ── The store ─────────────────────────────────────────────────────────────────────── */}
        <section className="rounded-shop-card border border-shop-line bg-white p-5">
          <div className="flex items-center gap-3">
            <ShopLogo src={detail.logoUrl} name={detail.name} className="h-14 w-14 flex-none rounded-shop-logo" placeholderSize={30} />
            <div className="min-w-0">
              <div className="flex items-center gap-[7px]">
                <span className="truncate text-shop-name font-shop-bold text-shop-ink">{detail.name}</span>
                {detail.isVerified && <VerifiedDot />}
              </div>
              <div className="mt-[7px] flex flex-wrap items-center gap-x-3.5 gap-y-1 text-shop-meta text-shop-ink-3">
                {detail.city && (
                  <span className="inline-flex items-center gap-[5px]">
                    <span className="text-shop-ink-4">
                      <PinIcon />
                    </span>
                    {detail.city}
                  </span>
                )}
                <span>
                  {detail.activeEquipmentCount} {t.browse.equipmentCount}
                </span>
                <span className="inline-flex items-center gap-[5px]">
                  <span className="text-shop-ink-4">
                    <EyeIcon />
                  </span>
                  {detail.viewCount.toLocaleString()} {t.store.views}
                </span>
              </div>
            </div>
          </div>

          {/* About — the full width of the card, at the prototype's 1.85 line height. */}
          {detail.description && (
            <div className="mt-4 border-t border-shop-line-soft pt-4">
              <h2 className="m-0 mb-2.5 text-shop-body font-shop-bold text-shop-ink">{t.store.about}</h2>
              <p dir="auto" className="m-0 whitespace-pre-line text-end text-shop-body leading-[1.85] text-shop-ink-2">
                {detail.description}
              </p>
            </div>
          )}

          {/* Documents — the app's three (AC-19), status by colour, contents never. */}
          <div className="mt-4 flex flex-wrap items-center gap-[9px] border-t border-shop-line-soft pt-4 text-shop-item font-semibold text-shop-ink">
            <span className="text-shop-ink-3">
              <DocIcon />
            </span>
            {t.store.documents}
            {[t.store.docCR, t.store.docVAT, t.store.docNationalAddress].map((doc) => (
              <span
                key={doc}
                className={`inline-flex items-center gap-1 rounded-shop-pill px-[9px] py-[3px] text-shop-chip font-shop-bold ${
                  detail.isVerified ? "bg-shop-ok-soft text-shop-ok" : "bg-shop-fill text-shop-ink-3"
                }`}
              >
                {detail.isVerified && <CheckIcon size={10} strokeWidth={2.6} />}
                {doc.toUpperCase()}
              </span>
            ))}
          </div>
        </section>

        {/* ── Its equipment ─────────────────────────────────────────────────────────────────── */}
        {detail.equipment.length === 0 ? (
          <div className="rounded-shop-card border border-shop-line bg-white p-8 text-center text-shop-body text-shop-ink-3">{t.store.noEquipment}</div>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {detail.equipment.map((e) => (
              <EquipmentTile
                key={e.id}
                eq={e}
                storeId={id}
                storeCity={detail.city}
                storeVerified={detail.isVerified}
                iconUrl={(e.subcategoryId && icons[e.subcategoryId]) || (e.measurementId && icons[e.measurementId]) || null}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** One machine: a 16:11 photo, the category over the name, then size and year. */
function EquipmentTile({
  eq,
  storeId,
  storeCity,
  storeVerified,
  iconUrl,
}: {
  eq: EquipmentCard;
  storeId: string;
  storeCity: string | null;
  storeVerified: boolean;
  iconUrl: string | null;
}) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const category = ar ? eq.categoryAr : eq.category;
  const subcategory = ar ? eq.subcategoryAr : eq.subcategory;
  const measurement = ar ? eq.measurementAr : eq.measurement;
  // The prototype's `label` is the machine — "Crawler Excavator" under "EXCAVATOR". The subtype is
  // that name; make/model stands in when a listing has no subtype to show.
  const label = subcategory || [eq.make, eq.model].filter(Boolean).join(" ") || category || "—";
  const city = eq.city ?? storeCity;

  return (
    <Link
      {...pin("store-equipment-card")}
      href={`/equipment/${encodeURIComponent(eq.id)}?storeId=${encodeURIComponent(storeId)}`}
      className="block overflow-hidden rounded-shop-card border border-shop-line bg-white text-shop-ink transition hover:border-shop-amber"
    >
      <div className="relative aspect-[16/11] w-full bg-shop-fill">
        {eq.photoUrl ? (
          <ShopPhoto src={eq.photoUrl} alt={label} />
        ) : iconUrl ? (
          <div className="h-full w-full bg-center bg-no-repeat" style={{ backgroundImage: `url("${iconUrl}")`, backgroundSize: "44px" }} />
        ) : null}
        {(eq.isVerified || storeVerified) && (
          <span className="absolute end-2 top-2">
            <VerifiedDot size={22} />
          </span>
        )}
        {city && <CityTag city={city} />}
      </div>
      <div className="px-3 pb-3 pt-2.5">
        {category && <div className="text-shop-label font-shop-bold uppercase tracking-[0.3px] text-shop-ink-4">{category}</div>}
        <div className="mt-1.5 text-shop-item font-semibold text-shop-ink">{label}</div>
        <div className="mt-[5px] flex gap-1.5">
          {measurement && (
            <span className="rounded-shop-chip bg-shop-amber-soft px-[9px] py-[3px] text-shop-meta font-semibold text-shop-amber-deep">{measurement}</span>
          )}
          {eq.year != null && (
            <span className="rounded-shop-chip bg-shop-fill px-[9px] py-[3px] text-shop-meta font-semibold text-shop-ink">{eq.year}</span>
          )}
        </div>
      </div>
    </Link>
  );
}
