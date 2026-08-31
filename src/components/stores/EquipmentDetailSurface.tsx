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
      <div className="rounded-lg border border-border bg-surface p-8 text-center text-body text-muted">
        <Icon name="error_outline" size={22} className="mx-auto mb-2 text-muted" />
        <p>{t.store.error}</p>
        <button onClick={() => setReloadKey((k) => k + 1)} className={btn("secondary", "sm", { className: "mt-3" })}>
          {t.store.retry}
        </button>
      </div>
    );
  }
  if (!eq) return <div className="p-8 text-center text-body text-muted">{t.store.loading}</div>;

  return (
    <div {...pin("equipment-sheet")} className="flex flex-col gap-4">
      {/* Back — to the store when we came from one, else the browser's own history. */}
      <div className="flex items-center gap-2">
        {ownerStoreId ? (
          <Link href={`/stores/${ownerStoreId}`} className="inline-flex items-center gap-1.5 text-meta font-semibold text-muted hover:text-navy">
            <Icon name="arrow_back" size={16} className="rtl:scale-x-[-1]" /> {t.store.back}
          </Link>
        ) : (
          <button onClick={() => router.back()} className="inline-flex items-center gap-1.5 text-meta font-semibold text-muted hover:text-navy">
            <Icon name="arrow_back" size={16} className="rtl:scale-x-[-1]" /> {t.store.back}
          </button>
        )}
      </div>

      {/* Gallery (70%) + where it is (30%). Stacked below lg — a 30% map on a phone is a smear. */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[7fr_3fr]">
        <Gallery photos={photos} layout={galleryLayout} idx={idx} setIdx={setIdx} verified={eq.isVerified} city={city} t={t} />
        <div className="relative min-h-[220px] overflow-hidden rounded-sm border border-border bg-surface2">
          {point ? (
            <EquipmentLocationMap lat={point.lat} lng={point.lng} label={city} precise={precise} />
          ) : (
            <div className="grid h-full place-items-center p-4 text-center text-meta text-muted">
              <span>
                <Icon name="location_off" size={20} className="mb-1 block text-muted" />
                {t.store.noLocation}
              </span>
            </div>
          )}
          {point && !precise && (
            <span className="pointer-events-none absolute bottom-2 start-2 z-[500] rounded-full bg-navy/85 px-2.5 py-1 text-label font-semibold text-white">
              {t.store.approxLocation}
            </span>
          )}
        </div>
      </div>

      {/* Supplier | machine — two equal columns, both full-height cards. */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <SupplierCard store={store} storeId={ownerStoreId} fallbackName={eq.storeName} t={t} />

        <section className="rounded-sm border border-border bg-surface p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <h2 className="me-1 text-title font-extrabold tracking-[-.3px] text-navy">{title}</h2>
              {eq.isVerified && <Icon name="verified" size={16} className="text-ok" />}
              {subcategory && subcategory !== title && (
                <span className="rounded-full bg-surface2 px-2.5 py-1 text-label font-semibold text-navy-mid">{subcategory}</span>
              )}
              {measurement && <span className="rounded-full bg-brand-soft px-2.5 py-1 text-label font-extrabold text-brand-deep">{measurement}</span>}
            </div>
            <div className="text-end">
              {eq.price != null ? (
                <div className="text-subhead font-extrabold tabular-nums text-brand">
                  {eq.price.toLocaleString()} <span className="text-label font-semibold">SAR {unit}</span>
                </div>
              ) : (
                <div className="text-meta font-semibold italic text-muted">{t.store.priceOnRequest}</div>
              )}
            </div>
          </div>

          <button onClick={requestThis} className={btn("primary", "md", { className: "mt-3.5 flex" })}>
            <Icon name="send" size={16} /> {t.store.requestThis}
          </button>

          {/* Specs — boxed grid or compact rows, same facts either way. */}
          <div className={specStyle === "boxed" ? "mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3" : "mt-4 flex flex-col divide-y divide-border"}>
            <Spec style={specStyle} label={t.store.specManufacturer} value={eq.manufacturer} />
            <Spec style={specStyle} label={t.store.specModel} value={eq.modelName} />
            <Spec style={specStyle} label={t.store.specYear} value={eq.year != null ? String(eq.year) : null} />
            <Spec style={specStyle} label={t.store.specFuel} value={eq.fuel ? eq.fuel.toUpperCase() : null} />
            <Spec style={specStyle} label={t.store.specHours} value={eq.operatingHours != null ? eq.operatingHours.toLocaleString() : null} />
            <Spec style={specStyle} label={t.store.specLocation} value={[eq.yardName, eq.yardCity].filter(Boolean).join(" · ") || null} />
          </div>

          {/* Photos + documents — counts and TYPES, never contents (AC-19). */}
          {(eq.docTypes.length > 0 || photos.length > 0) && (
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-sm border border-border bg-surface2/40 p-3.5">
              <span className="inline-flex items-center gap-2 text-meta font-semibold text-navy">
                <Icon name="photo_camera" size={16} className="text-muted" /> {t.store.photos}
                <span className="rounded-full bg-surface3 px-2 py-0.5 text-label font-semibold text-muted">{photos.length}</span>
              </span>
              {eq.docTypes.length > 0 && (
                <span className="inline-flex flex-wrap items-center gap-2 text-meta font-semibold text-navy">
                  <Icon name="description" size={16} className="text-muted" /> {t.store.docsShort}
                  {eq.docTypes.map((d) => (
                    <span key={d} className="inline-flex items-center gap-0.5 rounded-full bg-ok-soft px-2 py-0.5 text-label font-semibold text-ok">
                      <Icon name="check" size={12} /> {d.toUpperCase()}
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
    <section className="flex h-full flex-col rounded-sm border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="grid h-[46px] w-[46px] flex-none place-items-center overflow-hidden rounded-sm border border-border bg-surface2 text-subhead font-extrabold text-navy"
            style={store?.logoUrl ? { backgroundImage: `url("${store.logoUrl}")`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
          >
            {!store?.logoUrl && (name.trim()[0]?.toUpperCase() ?? "?")}
          </div>
          <div className="min-w-0">
            <div className="text-label font-semibold uppercase tracking-wide text-muted">{t.store.suppliedBy}</div>
            <div className="flex items-center gap-1.5">
              <span className="truncate text-subhead font-extrabold text-navy">{name || "—"}</span>
              {store?.isVerified && <Icon name="verified" size={15} className="flex-none text-ok" />}
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
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-meta font-semibold text-muted">
          {store.city && (
            <span className="inline-flex items-center gap-1.5">
              <Icon name="location_on" size={14} /> {store.city}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <Icon name="construction" size={14} /> {store.activeEquipmentCount} {t.store.equipment}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Icon name="visibility" size={14} /> {store.viewCount.toLocaleString()} {t.store.views}
          </span>
        </div>
      )}

      {store?.description && (
        <p className="mt-3.5 whitespace-pre-line text-body leading-relaxed text-navy-mid" dir="auto">
          {store.description}
        </p>
      )}

      {store && (
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
          <span className="text-label font-semibold uppercase tracking-wide text-muted">{t.store.documents}</span>
          {[t.store.docCR, t.store.docVAT, t.store.docNationalAddress].map((d) => (
            <span
              key={d}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-label font-semibold ${
                store.isVerified ? "bg-ok-soft text-ok" : "bg-surface2 text-muted"
              }`}
            >
              <Icon name={store.isVerified ? "check_circle" : "schedule"} size={12} /> {d}
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
        <span className="absolute end-2.5 top-2.5 grid h-6 w-6 place-items-center rounded-full bg-ok text-white" title={t.store.verified}>
          <Icon name="check" size={14} />
        </span>
      )}
      {city && (
        <span className="absolute bottom-2.5 start-2.5 inline-flex items-center gap-1 rounded-full bg-navy/85 px-2.5 py-1 text-label font-semibold text-white">
          <Icon name="location_on" size={12} /> {city}
        </span>
      )}
    </>
  );

  if (photos.length === 0) {
    return (
      <div className="relative grid min-h-[220px] place-items-center overflow-hidden rounded-sm border border-border bg-gradient-to-br from-surface2 to-surface3">
        <Icon name="construction" size={48} className="text-muted" />
        {overlays}
      </div>
    );
  }

  // The mosaic: one large photo plus up to four small ones. With a single photo it is just the photo,
  // which is the same thing said with less furniture — no empty cells drawn to fill a shape.
  if (layout === "grid" && photos.length > 1) {
    const rest = photos.slice(1, 5);
    return (
      <div className="relative grid h-[320px] grid-cols-2 gap-2 overflow-hidden rounded-sm sm:grid-cols-4">
        <button
          type="button"
          onClick={() => setIdx(0)}
          className="col-span-2 row-span-2 h-full w-full overflow-hidden rounded-sm border border-border bg-surface2 bg-cover bg-center"
          style={{ backgroundImage: `url("${photos[0]}")` }}
          aria-label={`${t.store.photos} 1`}
        />
        {rest.map((p, i) => (
          <button
            type="button"
            key={p}
            onClick={() => setIdx(i + 1)}
            className="h-full w-full overflow-hidden rounded-sm border border-border bg-surface2 bg-cover bg-center"
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
        className="relative h-[280px] overflow-hidden rounded-sm border border-border bg-surface2 bg-cover bg-center"
        style={{ backgroundImage: `url("${photos[Math.min(idx, photos.length - 1)]}")` }}
      >
        {photos.length > 1 && (
          <>
            <button
              onClick={() => setIdx((idx - 1 + photos.length) % photos.length)}
              className="absolute start-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-navy/50 text-white"
              aria-label={t.store.prevPhoto}
            >
              <Icon name="chevron_left" size={20} className="rtl:scale-x-[-1]" />
            </button>
            <button
              onClick={() => setIdx((idx + 1) % photos.length)}
              className="absolute end-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-navy/50 text-white"
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
              className={`h-[58px] w-[84px] flex-none rounded-sm border bg-surface2 bg-cover bg-center transition ${
                i === idx ? "border-brand" : "border-border"
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

function Spec({ style, label, value }: { style: SpecStyle; label: string; value: string | null }) {
  if (!value) return null;
  if (style === "list") {
    return (
      <div className="flex items-baseline justify-between gap-3 py-2">
        <span className="text-meta text-muted">{label}</span>
        <span className="text-body font-semibold text-navy">{value}</span>
      </div>
    );
  }
  return (
    <div className="rounded-sm border border-border bg-surface px-3 py-2">
      <div className="text-label font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-0.5 text-body font-semibold text-navy">{value}</div>
    </div>
  );
}
