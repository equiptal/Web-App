"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useT } from "@/lib/i18n";
import { useAuthGate } from "@/components/auth/AuthGate";
import { Icon } from "@/components/ui";
import { PhotoPlaceholder } from "@/components/Photo";
import type { EquipmentDetail, StoreDetail } from "@/lib/contract/stores";
import { cityCentroid } from "@/lib/contract/saudi-cities";
import { btn } from "@/lib/ds";
import { pin } from "@/lib/uiPins";
import {
  BackArrowIcon,
  CameraIcon,
  CheckIcon,
  DocIcon,
  EyeIcon,
  PinIcon,
  PriceIcon,
  SHOP_PAGE,
  ShopLogo,
  StorefrontIcon,
  VerifiedDot,
} from "@/components/stores/shop";

const EquipmentLocationMap = dynamic(() => import("@/components/stores/EquipmentLocationMap"), { ssr: false });

/** The mosaic (a tall photo beside two), or one hero image over a thumbnail strip. */
export type GalleryLayout = "grid" | "hero";
/** Bordered spec boxes, or label/value rows on hairlines. */
export type SpecStyle = "boxed" | "list";

/**
 * One machine, as its own page — the prototype's Equipment Detail, value for value.
 *
 * The name and the amber Request button share the first row; under it a 420px band holds the gallery
 * beside the map; under that, the supplier and the machine as two equal cards. It used to be a modal
 * opened from a store's grid, which made the one thing a renter wants to send someone — "look at this
 * machine" — unaddressable: there was no URL for it.
 *
 * Two fetches, in order: the equipment (`/api/equipment/:id`, `?storeId=` so a signed-out visitor can
 * still be answered from the public projection), then the store behind it for the supplier card. The
 * store call is a nicety — the sheet renders in full without it, minus the supplier's own panel.
 *
 * The four specs are the reference's four: manufacturer, model, year, fuel. Operating hours and the
 * yard are not drawn on it — the yard is the map. Documents are TYPES only, never contents (AC-19),
 * which is what the app does too.
 */
export function EquipmentDetailSurface({
  id,
  storeId,
  onTitle,
  galleryLayout = "grid",
  specStyle = "boxed",
}: {
  id: string;
  storeId?: string | null;
  onTitle?: (title: string) => void;
  galleryLayout?: GalleryLayout;
  specStyle?: SpecStyle;
}) {
  const t = useT();
  const { locale } = useLocale();
  const ar = locale === "ar";
  const router = useRouter();
  const { requireAuth } = useAuthGate();

  const [eq, setEq] = useState<EquipmentDetail | null>(null);
  const [store, setStore] = useState<StoreDetail | null>(null);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    setError(false);
    setEq(null);
    setIdx(0);
    const ctrl = new AbortController();
    const qs = storeId ? `?storeId=${encodeURIComponent(storeId)}` : "";
    fetch(`/api/equipment/${encodeURIComponent(id)}${qs}`, { cache: "no-store", signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: EquipmentDetail) => setEq(d))
      .catch((e) => {
        if (e?.name !== "AbortError") setError(true);
      });
    return () => ctrl.abort();
  }, [id, storeId, reloadKey]);

  // The supplier panel. `storeId` from the URL when the renter arrived from a store, else the id the
  // equipment itself names. Failure is silent on purpose — an absent panel is not a broken page.
  const ownerStoreId = storeId ?? eq?.storeId ?? null;
  useEffect(() => {
    if (!ownerStoreId) return;
    const ctrl = new AbortController();
    fetch(`/api/stores/${encodeURIComponent(ownerStoreId)}`, { cache: "no-store", signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: StoreDetail) => setStore(d))
      .catch(() => {
        /* the sheet stands without it */
      });
    return () => ctrl.abort();
  }, [ownerStoreId]);

  const category = eq ? (ar ? eq.categoryAr : eq.category) : null;
  const subcategory = eq ? (ar ? eq.subcategoryAr : eq.subcategory) : null;
  const measurement = eq ? (ar ? eq.measurementAr : eq.measurement) : null;
  // The page's own name, as the reference writes it: «Crawler Excavator · 20T» — the subtype and the
  // size, not the category, because that is the machine a renter came to look at.
  const heading = [subcategory || category, measurement].filter(Boolean).join(" · ") || "—";

  useEffect(() => {
    if (eq) onTitle?.(heading);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eq, heading]);

  const unitKey = (eq?.priceUnit ?? "").toUpperCase();
  const unit =
    unitKey === "PER_WEEK" ? t.store.perWeek : unitKey === "PER_MONTH" ? t.store.perMonth : unitKey === "PER_JOB" ? t.store.perJob : t.store.perDay;
  const photos = useMemo(() => eq?.photos ?? [], [eq]);

  // Where the machine is. Yard coordinates when the payload carries them; otherwise the CITY's centre
  // at a city-wide zoom, which is the resolution of the fact we hold. Neither → no map.
  const city = eq?.yardCity ?? store?.city ?? null;
  const centroid = cityCentroid(city);
  const precise = eq?.yardLat != null && eq?.yardLng != null;
  const point = precise ? { lat: eq!.yardLat!, lng: eq!.yardLng! } : centroid;
  const where = [eq?.yardName, city].filter(Boolean).join(", ") || city;

  /**
   * Request this equipment — the app's DIRECT request (Epic 008), not a broadcast.
   *
   * The create flow is the same form either way; what the store adds is a recipient. A guest is asked
   * to sign in FIRST rather than at submit: the whole point of this button is that it is addressed to
   * one supplier, and letting a guest fill a form we cannot address is the wrong order.
   *
   * ⚠️ **A guest's copy of this page names no supplier, and that is deliberate on the backend's
   * side**: the public projections carry no account ids (an unauthenticated route that hands them out
   * is an enumeration surface). So the id is re-read AFTER sign-in, when the same two endpoints answer
   * with the authed projection — otherwise a visitor who signed in at this button would be sent into a
   * broadcast, addressed to nobody, with nothing on screen saying so.
   *
   * With still no `supplierId` the flow opens anyway, as an ordinary broadcast with the machine's
   * words prefilled. That degradation is visible rather than silent: no recipient ribbon appears,
   * because there is no recipient.
   */
  const supplierId = eq?.supplierId ?? store?.supplierId ?? null;
  const supplierName = store?.name ?? eq?.storeName ?? null;
  const requestThis = () =>
    requireAuth(() => {
      void (async () => {
        let sid = supplierId;
        let name = supplierName;
        if (!sid && ownerStoreId) {
          try {
            const r = await fetch(`/api/stores/${encodeURIComponent(ownerStoreId)}`, { cache: "no-store" });
            if (r.ok) {
              const fresh: StoreDetail = await r.json();
              sid = fresh.supplierId;
              name = name ?? fresh.name;
            }
          } catch {
            /* keep whatever we already had — the flow still opens */
          }
        }
        const qs = new URLSearchParams();
        if (sid) qs.set("supplierId", sid);
        if (name) qs.set("supplierName", name);
        if (ownerStoreId) qs.set("storeId", ownerStoreId);
        const label = [heading, eq?.manufacturer, eq?.modelName].filter(Boolean).join(" ");
        if (label) qs.set("prefill", label);
        router.push(`/create?${qs.toString()}`);
      })();
    });

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
  if (!eq) return <div className={`${SHOP_PAGE} pt-6 text-center text-shop-body text-shop-ink-3`}>{t.store.loading}</div>;

  const specs = [
    { label: t.store.specManufacturer, value: eq.manufacturer },
    { label: t.store.specModel, value: eq.modelName },
    { label: t.store.specYear, value: eq.year != null ? String(eq.year) : null },
    { label: t.store.specFuel, value: eq.fuel ? eq.fuel.toUpperCase() : null },
  ];

  return (
    <div {...pin("equipment-sheet")} className={`${SHOP_PAGE} pt-6`}>
      {/* Back to the store when the renter came from one, else back to the results he came from. */}
      {ownerStoreId ? (
        <Link
          href={`/stores/${ownerStoreId}`}
          className="mb-4 inline-flex items-center gap-[7px] text-shop-body font-semibold text-shop-ink-3 transition hover:text-shop-amber"
        >
          <BackArrowIcon /> {t.store.back}
        </Link>
      ) : (
        <button
          onClick={() => router.back()}
          className="mb-4 inline-flex items-center gap-[7px] text-shop-body font-semibold text-shop-ink-3 transition hover:text-shop-amber"
        >
          <BackArrowIcon /> {t.store.backToResults}
        </button>
      )}

      {/* The machine, and the one thing to do about it. */}
      <div className="mb-[18px] flex flex-wrap items-center justify-between gap-5">
        <h1 className="m-0 text-shop-page font-shop-bold text-shop-ink">{heading}</h1>
        <button
          onClick={requestThis}
          className="flex-none whitespace-nowrap rounded-shop-control bg-shop-amber px-6 py-3 text-shop-control font-shop-bold text-white transition hover:bg-shop-amber-deep"
        >
          {t.store.requestThis}
        </button>
      </div>

      {/* The band: photographs beside the place. 420px on a wide screen; each half keeps its own
          height below that, where they are stacked. */}
      <div className="grid gap-2 lg:h-[420px] lg:grid-cols-[7fr_3fr]">
        <Gallery photos={photos} layout={galleryLayout} idx={idx} setIdx={setIdx} t={t} />
        <div className="relative h-[280px] overflow-hidden rounded-shop-media border border-shop-line bg-shop-fill lg:h-full">
          {point ? (
            <EquipmentLocationMap lat={point.lat} lng={point.lng} label={null} precise={precise} />
          ) : (
            <div className="grid h-full place-items-center p-4 text-center text-shop-meta text-shop-ink-3">
              <span>
                <span className="mx-auto mb-1 block w-fit text-shop-ink-4">
                  <PinIcon size={20} />
                </span>
                {t.store.noLocation}
              </span>
            </div>
          )}
          {/* The address, on the map — and it says «approximate» when the pin is a city centre rather
              than a yard, because the pin cannot say that itself. */}
          {point && where && (
            <span className="pointer-events-none absolute bottom-2 start-2 z-[500] rounded-shop-control bg-shop-tag-strong px-[9px] py-1 text-shop-tag font-semibold text-white">
              {precise ? where : `${where} · ${t.store.approxLocation}`}
            </span>
          )}
        </div>
      </div>

      {/* The supplier, and the machine. */}
      <div className="mt-[34px] grid grid-cols-1 items-start gap-7 lg:grid-cols-2">
        <SupplierCard store={store} storeId={ownerStoreId} fallbackName={eq.storeName} t={t} />

        <section className="rounded-shop-card border border-shop-line bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="m-0 text-shop-name font-shop-bold text-shop-ink">{category || subcategory || "—"}</h2>
              {subcategory && subcategory !== category && (
                <span className="flex-none whitespace-nowrap rounded-shop-chip-lg bg-shop-fill px-3 py-[5px] text-shop-meta font-semibold text-shop-ink">
                  {subcategory}
                </span>
              )}
              {measurement && (
                <span className="flex-none whitespace-nowrap rounded-shop-chip-lg bg-shop-fill px-3 py-[5px] text-shop-meta font-semibold text-shop-ink">
                  {measurement}
                </span>
              )}
            </div>
            <span className="inline-flex flex-none items-center gap-1.5 whitespace-nowrap text-shop-item font-shop-bold text-shop-amber-deep">
              <PriceIcon />
              {eq.price != null ? `${eq.price.toLocaleString()} SAR ${unit}` : t.store.priceOnRequest}
            </span>
          </div>

          {specStyle === "boxed" ? (
            <div className="mt-5 grid grid-cols-2 gap-3">
              {specs.map((row) => (
                <div key={row.label} className="rounded-shop-control border border-shop-line bg-white px-3.5 py-3">
                  <div className="text-shop-tag font-shop-bold tracking-[0.3px] text-shop-ink-4">{row.label.toUpperCase()}</div>
                  <div className="mt-1 text-shop-value font-semibold text-shop-ink">{row.value ?? "—"}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-[18px] flex flex-col">
              {specs.map((row) => (
                <div key={row.label} className="flex items-center justify-between border-b border-shop-line-soft px-0.5 py-[11px]">
                  <span className="text-shop-item font-semibold text-shop-ink-4">{row.label}</span>
                  <span className="text-shop-control font-semibold text-shop-ink">{row.value ?? "—"}</span>
                </div>
              ))}
            </div>
          )}

          {/* What it comes with — counts and TYPES, never contents (AC-19). */}
          <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-shop-line-soft pt-5 text-shop-control font-semibold text-shop-ink">
            <span className="inline-flex items-center gap-[9px]">
              <span className="text-shop-ink-3">
                <CameraIcon />
              </span>
              {t.store.photos} <span className="font-normal text-shop-ink-4">({photos.length})</span>
            </span>
            <span className="inline-flex flex-wrap items-center gap-[9px]">
              <span className="text-shop-ink-3">
                <DocIcon />
              </span>
              {t.store.docsShort}
              {eq.docTypes.length === 0 ? (
                <span className="font-normal text-shop-ink-4">(0)</span>
              ) : (
                eq.docTypes.map((d) => (
                  <span
                    key={d}
                    className="inline-flex items-center gap-1 rounded-shop-pill bg-shop-ok-soft px-[9px] py-[3px] text-shop-chip font-shop-bold text-shop-ok"
                  >
                    <CheckIcon size={10} strokeWidth={2.6} /> {d.toUpperCase()}
                  </span>
                ))
              )}
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}

/** The supplier behind the machine: who they are, what they say, what they hold, and a way in. */
function SupplierCard({
  store,
  storeId,
  fallbackName,
  t,
}: {
  store: StoreDetail | null;
  storeId: string | null;
  fallbackName: string | null;
  t: ReturnType<typeof useT>;
}) {
  const name = store?.name ?? fallbackName ?? "";
  return (
    <section className="rounded-shop-card border border-shop-line bg-white p-5">
      <div className="flex items-start justify-between gap-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <ShopLogo src={store?.logoUrl ?? null} name={name} className="h-12 w-12 flex-none rounded-shop-logo-md" placeholderSize={26} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-shop-lead font-shop-bold text-shop-ink">
                {t.store.suppliedBy} {name || "—"}
              </span>
              {store?.isVerified && <VerifiedDot size={15} />}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-shop-meta text-shop-ink-4">
              {store?.city && (
                <span className="inline-flex items-center gap-[5px]">
                  <PinIcon /> {store.city}
                </span>
              )}
              {store && (
                <span>
                  {store.activeEquipmentCount} {t.store.equipment}
                </span>
              )}
              {store && (
                <span className="inline-flex items-center gap-[5px]">
                  <EyeIcon /> {store.viewCount.toLocaleString()} {t.store.views}
                </span>
              )}
            </div>
          </div>
        </div>

        {storeId && (
          <Link
            href={`/stores/${storeId}`}
            className="inline-flex flex-none items-center gap-[7px] whitespace-nowrap rounded-shop-control bg-shop-ink px-4 py-2.5 text-shop-item font-shop-bold text-white transition hover:bg-shop-ink-2"
          >
            {t.store.viewStore}
            <StorefrontIcon />
          </Link>
        )}
      </div>

      {store?.description && (
        <p dir="auto" className="m-0 mt-4 whitespace-pre-line text-end text-shop-value leading-[1.85] text-shop-ink-3">
          {store.description}
        </p>
      )}

      {store && (
        <div className="mt-4 flex flex-wrap items-center gap-[9px] border-t border-shop-line-soft pt-4 text-shop-control font-semibold text-shop-ink">
          <span className="text-shop-ink-3">
            <DocIcon />
          </span>
          {t.store.documents}
          {[t.store.docCR, t.store.docVAT, t.store.docNationalAddress].map((d) => (
            <span
              key={d}
              className={`inline-flex items-center gap-1 rounded-shop-pill px-[9px] py-[3px] text-shop-chip font-shop-bold ${
                store.isVerified ? "bg-shop-ok-soft text-shop-ok" : "bg-shop-fill text-shop-ink-3"
              }`}
            >
              {store.isVerified && <CheckIcon size={10} strokeWidth={2.6} />}
              {d.toUpperCase()}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * The photographs. `grid` is the reference's mosaic — one tall image at 1.4fr beside two stacked;
 * `hero` is one image with a strip of 120×84 thumbnails under it.
 *
 * The mosaic's tiles set the hero index, so switching the prop mid-session lands on the photo the
 * renter last looked at rather than back at the first.
 */
function Gallery({
  photos,
  layout,
  idx,
  setIdx,
  t,
}: {
  photos: string[];
  layout: GalleryLayout;
  idx: number;
  setIdx: (i: number) => void;
  t: ReturnType<typeof useT>;
}) {
  if (photos.length === 0) {
    return (
      <div className="h-[280px] overflow-hidden rounded-shop-media border border-shop-line lg:h-full">
        <PhotoPlaceholder size={72} />
      </div>
    );
  }

  if (layout === "grid" && photos.length > 1) {
    const rest = photos.slice(1, 3);
    return (
      <div className="grid h-[280px] grid-cols-[1.4fr_1fr] grid-rows-2 gap-2 overflow-hidden rounded-shop-media lg:h-full">
        <button
          type="button"
          onClick={() => setIdx(0)}
          className="row-span-2 h-full w-full bg-shop-fill bg-cover bg-center"
          style={{ backgroundImage: `url("${photos[0]}")` }}
          aria-label={`${t.store.photos} 1`}
        />
        {rest.map((p, i) => (
          <button
            type="button"
            key={p}
            onClick={() => setIdx(i + 1)}
            className="h-full w-full bg-shop-fill bg-cover bg-center"
            style={{ backgroundImage: `url("${p}")` }}
            aria-label={`${t.store.photos} ${i + 2}`}
          />
        ))}
        {/* Two photos and no third leaves one cell empty: the tall image keeps its 1.4fr rather than
            the grid collapsing into a shape the reference never draws. */}
        {rest.length === 1 && <div className="h-full w-full bg-shop-fill" />}
      </div>
    );
  }

  return (
    <div className="flex h-[280px] flex-col gap-2 lg:h-full">
      <div
        className="w-full flex-1 overflow-hidden rounded-shop-media bg-shop-fill bg-cover bg-center"
        style={{ backgroundImage: `url("${photos[Math.min(idx, photos.length - 1)]}")` }}
      />
      {photos.length > 1 && (
        <div className="flex flex-none gap-2 overflow-x-auto">
          {photos.map((p, i) => (
            <button
              type="button"
              key={p}
              onClick={() => setIdx(i)}
              className={`h-[84px] w-[120px] flex-none rounded-shop-chip bg-shop-fill bg-cover bg-center transition ${
                i === idx ? "ring-2 ring-shop-amber" : ""
              }`}
              style={{ backgroundImage: `url("${p}")` }}
              aria-label={`${t.store.photos} ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
