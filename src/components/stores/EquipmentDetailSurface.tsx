"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useT } from "@/lib/i18n";
import { useAuthGate } from "@/components/auth/AuthGate";
import { Icon } from "@/components/ui";
import type { EquipmentDetail, StoreDetail } from "@/lib/contract/stores";
import { cityCentroid } from "@/lib/contract/saudi-cities";
import { btn } from "@/lib/ds";
import { pin } from "@/lib/uiPins";
import { BackArrowIcon, CheckIcon, CityTag, DocIcon, EyeIcon, PinIcon, SHOP_PAGE, VerifiedDot } from "@/components/stores/shop";

const EquipmentLocationMap = dynamic(() => import("@/components/stores/EquipmentLocationMap"), { ssr: false });

/** Airbnb-style mosaic, or one hero image with a thumbnail strip. Both draw the same photo list. */
export type GalleryLayout = "grid" | "hero";
/** Bordered spec boxes, or compact label/value rows. */
export type SpecStyle = "boxed" | "list";

/**
 * A single piece of equipment, as its own page.
 *
 * This surface used to be a modal opened from a store's grid, which made the one thing a renter wants
 * to send someone — "look at this machine" — unaddressable: there was no URL for it. It is a page now,
 * reached from the store profile and from a category card on Browse, and the modal is gone.
 *
 * Two fetches, in order: the equipment (`/api/equipment/:id`, `?storeId=` so a signed-out visitor can
 * still be answered from the public store projection), then the store behind it for the supplier card.
 * The store call is a nicety — the sheet renders in full without it, minus the supplier's own panel.
 *
 * Documents are shown as TYPES only, never contents (AC-19), which is what the app does too.
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
  const title = category || subcategory || measurement || "—";

  useEffect(() => {
    if (eq) onTitle?.([eq.manufacturer, eq.modelName].filter(Boolean).join(" ") || title);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eq, title]);

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
        const label = [title, measurement, eq?.manufacturer, eq?.modelName].filter(Boolean).join(" ");
        if (label) qs.set("prefill", label);
        router.push(`/create?${qs.toString()}`);
      })();
    });

  if (error) {
    return (
      <div className={SHOP_PAGE}>
        <div className="rounded-shop-card border border-shop-line p-8 text-center text-shop-body text-shop-ink-3">
          <Icon name="error_outline" size={22} className="mx-auto mb-2" />
          <p>{t.store.error}</p>
          <button onClick={() => setReloadKey((k) => k + 1)} className={btn("secondary", "sm", { className: "mt-3" })}>
            {t.store.retry}
          </button>
        </div>
      </div>
    );
  }
  if (!eq) return <div className={`${SHOP_PAGE} text-center text-shop-body text-shop-ink-3`}>{t.store.loading}</div>;

  return (
    <div {...pin("equipment-sheet")} className={`${SHOP_PAGE} flex flex-col gap-4`}>
      {/* Back — to the store when we came from one, else the browser's own history. */}
      <div className="flex items-center gap-2">
        {ownerStoreId ? (
          <Link
            href={`/stores/${ownerStoreId}`}
            className="mb-1 inline-flex items-center gap-[7px] text-shop-body font-semibold text-shop-ink-3 transition hover:text-shop-amber"
          >
            <BackArrowIcon /> {t.store.back}
          </Link>
        ) : (
          <button
            onClick={() => router.back()}
            className="mb-1 inline-flex items-center gap-[7px] text-shop-body font-semibold text-shop-ink-3 transition hover:text-shop-amber"
          >
            <BackArrowIcon /> {t.store.back}
          </button>
        )}
      </div>

      {/* Gallery (70%) + where it is (30%). Stacked below lg — a 30% map on a phone is a smear. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[7fr_3fr]">
        <Gallery photos={photos} layout={galleryLayout} idx={idx} setIdx={setIdx} verified={eq.isVerified} city={city} t={t} />
        <div className="relative min-h-[240px] overflow-hidden rounded-shop-card border border-shop-line bg-shop-fill">
          {point ? (
            <EquipmentLocationMap lat={point.lat} lng={point.lng} label={city} precise={precise} />
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
          {point && !precise && (
            <span className="pointer-events-none absolute bottom-2 start-2 z-[500] rounded-shop-pill bg-shop-tag px-[9px] py-1 text-shop-tag font-shop-bold text-white">
              {t.store.approxLocation}
            </span>
          )}
        </div>
      </div>

      {/* Supplier | machine — two equal columns, both full-height cards. */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <SupplierCard store={store} storeId={ownerStoreId} fallbackName={eq.storeName} t={t} />

        <section className="rounded-shop-card border border-shop-line p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-[7px]">
              <h2 className="m-0 me-1 text-shop-name font-shop-bold text-shop-ink">{title}</h2>
              {eq.isVerified && <VerifiedDot />}
              {subcategory && subcategory !== title && (
                <span className="rounded-shop-chip bg-shop-fill px-[9px] py-[3px] text-shop-meta font-semibold text-shop-ink">{subcategory}</span>
              )}
              {measurement && (
                <span className="rounded-shop-chip bg-shop-amber-soft px-[9px] py-[3px] text-shop-meta font-semibold text-shop-amber-deep">
                  {measurement}
                </span>
              )}
            </div>
            <div className="text-end">
              {eq.price != null ? (
                <div className="text-shop-name font-shop-bold tabular-nums text-shop-amber-deep">
                  {eq.price.toLocaleString()} <span className="text-shop-tag font-semibold">SAR {unit}</span>
                </div>
              ) : (
                <div className="text-shop-meta font-semibold text-shop-ink-3">{t.store.priceOnRequest}</div>
              )}
            </div>
          </div>

          <button onClick={requestThis} className={btn("primary", "md", { className: "mt-3.5 flex" })}>
            {t.store.requestThis}
          </button>

          {/* Specs — boxed grid or compact rows, same facts either way. */}
          <div className={specStyle === "boxed" ? "mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3" : "mt-4 flex flex-col divide-y divide-shop-line-soft"}>
            <Spec style={specStyle} label={t.store.specManufacturer} value={eq.manufacturer} />
            <Spec style={specStyle} label={t.store.specModel} value={eq.modelName} />
            <Spec style={specStyle} label={t.store.specYear} value={eq.year != null ? String(eq.year) : null} />
            <Spec style={specStyle} label={t.store.specFuel} value={eq.fuel ? eq.fuel.toUpperCase() : null} />
            <Spec style={specStyle} label={t.store.specHours} value={eq.operatingHours != null ? eq.operatingHours.toLocaleString() : null} />
            <Spec style={specStyle} label={t.store.specLocation} value={[eq.yardName, eq.yardCity].filter(Boolean).join(" · ") || null} />
          </div>

          {/* Photos + documents — counts and TYPES, never contents (AC-19). */}
          {(eq.docTypes.length > 0 || photos.length > 0) && (
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-shop-line-soft pt-4 text-shop-item font-semibold text-shop-ink">
              <span className="inline-flex items-center gap-[9px]">
                <span className="text-shop-ink-3">
                  <CameraIcon />
                </span>
                {t.store.photos}
                <span className="rounded-shop-chip bg-shop-fill px-[9px] py-[3px] text-shop-chip font-shop-bold text-shop-ink-3">{photos.length}</span>
              </span>
              {eq.docTypes.length > 0 && (
                <span className="inline-flex flex-wrap items-center gap-[9px]">
                  <span className="text-shop-ink-3">
                    <DocIcon />
                  </span>
                  {t.store.docsShort}
                  {eq.docTypes.map((d) => (
                    <span
                      key={d}
                      className="inline-flex items-center gap-1 rounded-shop-pill bg-shop-ok-soft px-[9px] py-[3px] text-shop-chip font-shop-bold text-shop-ok"
                    >
                      <CheckIcon size={10} strokeWidth={2.6} /> {d.toUpperCase()}
                    </span>
                  ))}
                </span>
              )}
            </div>
          )}
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
    <section className="flex h-full flex-col rounded-shop-card border border-shop-line p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {store?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={store.logoUrl} alt={name} className="h-14 w-14 flex-none rounded-shop-logo object-cover" />
          ) : (
            <span className="grid h-14 w-14 flex-none place-items-center rounded-shop-logo bg-shop-fill text-shop-name font-shop-bold text-shop-ink">
              {name.trim()[0]?.toUpperCase() ?? "?"}
            </span>
          )}
          <div className="min-w-0">
            <div className="text-shop-label font-shop-bold uppercase tracking-[0.3px] text-shop-ink-4">{t.store.suppliedBy}</div>
            <div className="flex items-center gap-[7px]">
              <span className="truncate text-shop-name font-shop-bold text-shop-ink">{name || "—"}</span>
              {store?.isVerified && <VerifiedDot />}
            </div>
          </div>
        </div>
        {storeId && (
          <Link href={`/stores/${storeId}`} className={btn("secondary", "sm", { className: "flex-none" })}>
            {t.store.viewStore}
          </Link>
        )}
      </div>

      {store && (
        <div className="mt-[7px] flex flex-wrap items-center gap-x-3.5 gap-y-1 text-shop-meta text-shop-ink-3">
          {store.city && (
            <span className="inline-flex items-center gap-[5px]">
              <span className="text-shop-ink-4">
                <PinIcon />
              </span>
              {store.city}
            </span>
          )}
          <span>
            {store.activeEquipmentCount} {t.store.equipment}
          </span>
          <span className="inline-flex items-center gap-[5px]">
            <span className="text-shop-ink-4">
              <EyeIcon />
            </span>
            {store.viewCount.toLocaleString()} {t.store.views}
          </span>
        </div>
      )}

      {store?.description && (
        <div className="mt-4 border-t border-shop-line-soft pt-4">
          <p dir="auto" className="m-0 whitespace-pre-line text-end text-shop-body leading-[1.85] text-shop-ink-2">
            {store.description}
          </p>
        </div>
      )}

      {store && (
        <div className="mt-auto flex flex-wrap items-center gap-[9px] border-t border-shop-line-soft pt-4 text-shop-item font-semibold text-shop-ink">
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

/** The photo set. `grid` is the mosaic; `hero` is one big image over a thumbnail strip. */
function Gallery({
  photos,
  layout,
  idx,
  setIdx,
  verified,
  city,
  t,
}: {
  photos: string[];
  layout: GalleryLayout;
  idx: number;
  setIdx: (i: number) => void;
  verified: boolean;
  city: string | null;
  t: ReturnType<typeof useT>;
}) {
  const overlays = (
    <>
      {verified && (
        <span className="absolute end-2 top-2" title={t.store.verified}>
          <VerifiedDot size={22} />
        </span>
      )}
      {city && <CityTag city={city} />}
    </>
  );

  if (photos.length === 0) {
    return (
      <div className="relative grid min-h-[240px] place-items-center overflow-hidden rounded-shop-card border border-shop-line bg-shop-fill">
        <Icon name="construction" size={48} className="text-shop-ink-4" />
        {overlays}
      </div>
    );
  }

  // The mosaic: one large photo plus up to four small ones. With a single photo it is just the photo,
  // which is the same thing said with less furniture — no empty cells drawn to fill a shape.
  if (layout === "grid" && photos.length > 1) {
    const rest = photos.slice(1, 5);
    return (
      <div className="relative grid h-[340px] grid-cols-2 gap-2 overflow-hidden rounded-shop-card sm:grid-cols-4">
        <button
          type="button"
          onClick={() => setIdx(0)}
          className="col-span-2 row-span-2 h-full w-full overflow-hidden rounded-shop-card border border-shop-line bg-shop-fill bg-cover bg-center"
          style={{ backgroundImage: `url("${photos[0]}")` }}
          aria-label={`${t.store.photos} 1`}
        />
        {rest.map((p, i) => (
          <button
            type="button"
            key={p}
            onClick={() => setIdx(i + 1)}
            className="h-full w-full overflow-hidden rounded-shop-card border border-shop-line bg-shop-fill bg-cover bg-center"
            style={{ backgroundImage: `url("${p}")` }}
            aria-label={`${t.store.photos} ${i + 2}`}
          />
        ))}
        {overlays}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        className="relative h-[300px] overflow-hidden rounded-shop-card border border-shop-line bg-shop-fill bg-cover bg-center"
        style={{ backgroundImage: `url("${photos[Math.min(idx, photos.length - 1)]}")` }}
      >
        {photos.length > 1 && (
          <>
            <button
              onClick={() => setIdx((idx - 1 + photos.length) % photos.length)}
              className="absolute start-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-shop-tag text-white"
              aria-label={t.store.prevPhoto}
            >
              <Icon name="chevron_left" size={20} className="rtl:scale-x-[-1]" />
            </button>
            <button
              onClick={() => setIdx((idx + 1) % photos.length)}
              className="absolute end-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-shop-tag text-white"
              aria-label={t.store.nextPhoto}
            >
              <Icon name="chevron_right" size={20} className="rtl:scale-x-[-1]" />
            </button>
          </>
        )}
        {overlays}
      </div>
      {photos.length > 1 && (
        <div className="flex gap-2 overflow-x-auto">
          {photos.map((p, i) => (
            <button
              type="button"
              key={p}
              onClick={() => setIdx(i)}
              className={`h-[58px] w-[84px] flex-none rounded-shop-chip border bg-shop-fill bg-cover bg-center transition ${
                i === idx ? "border-shop-amber" : "border-shop-line"
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

/** The prototype draws its own camera, at the same 1.7px stroke as the document and the pin. */
function CameraIcon({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 8H7L9 5H15L17 8H20C20.6 8 21 8.4 21 9V18C21 18.6 20.6 19 20 19H4C3.4 19 3 18.6 3 18V9C3 8.4 3.4 8 4 8Z" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="12" cy="13" r="3.5" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function Spec({ style, label, value }: { style: SpecStyle; label: string; value: string | null }) {
  if (!value) return null;
  if (style === "list") {
    return (
      <div className="flex items-baseline justify-between gap-3 py-2">
        <span className="text-shop-meta text-shop-ink-3">{label}</span>
        <span className="text-shop-item font-semibold text-shop-ink">{value}</span>
      </div>
    );
  }
  return (
    <div className="rounded-shop-chip border border-shop-line px-3 py-2">
      <div className="text-shop-label font-shop-bold uppercase tracking-[0.3px] text-shop-ink-4">{label}</div>
      <div className="mt-0.5 text-shop-item font-semibold text-shop-ink">{value}</div>
    </div>
  );
}
