"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useT } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import type { EquipmentCard, StoreDetail, TaxonomyNode } from "@/lib/contract/stores";
import { btn } from "@/lib/ds";
import { pin } from "@/lib/uiPins";

/**
 * A supplier's profile: one card that says who they are, then their equipment.
 *
 * Two stacked rows, not two columns. The description is the widest thing on the page (it is Arabic
 * prose in most stores, and prose set in a half-width column beside a document panel was the reason
 * this screen read as a form), and the documents sit under it as chips rather than behind a modal —
 * three labels and a status is not a dialog's worth of content.
 *
 * AC-18 (info + verified badge only when verified + operators coming-soon), AC-19 (CR / VAT /
 * National Address, status only — never contents), AC-20 (equipment fields, price-on-request,
 * verification tick). Loading + error-with-retry (AC-23).
 *
 * Equipment cards LINK to `/equipment/[id]`; the sheet they used to open as a modal is a page now.
 */
export function StoreDetailSurface({ id, onTitle }: { id: string; onTitle?: (name: string) => void }) {
  const t = useT();
  const router = useRouter();
  const [detail, setDetail] = useState<StoreDetail | null>(null);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [icons, setIcons] = useState<Record<string, string>>({});

  // Taxonomy icons (shared bucket) → map node id → iconUrl, for equipment with no photo. The BFF
  // answers a guest from the app's public taxonomy, so a signed-out visitor gets the same artwork
  // rather than a grid of generic silhouettes.
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
      <div className="rounded-lg border border-border bg-surface p-8 text-center text-body text-muted">
        <Icon name="error_outline" size={22} className="mx-auto mb-2 text-muted" />
        <p>{t.store.error}</p>
        <button onClick={() => setReloadKey((k) => k + 1)} className={btn("secondary", "sm", { className: "mt-3" })}>
          {t.store.retry}
        </button>
      </div>
    );
  }
  if (!detail) return <div className="p-8 text-center text-body text-muted">{t.store.loading}</div>;

  const docStatus = detail.isVerified ? t.store.statusVerified : t.store.statusPending;

  return (
    <div {...pin("store-detail")} className="flex flex-col gap-4">
      <button onClick={() => router.back()} className="inline-flex w-fit items-center gap-1.5 text-meta font-semibold text-muted hover:text-navy">
        <Icon name="arrow_back" size={16} className="rtl:scale-x-[-1]" /> {t.store.back}
      </button>

      {/* Who they are — one full-width card (AC-18/19). */}
      <section className="rounded-sm border border-border bg-surface p-5">
        <div className="flex items-start gap-3.5">
          <div
            className="grid h-[56px] w-[56px] flex-none place-items-center overflow-hidden rounded-sm border border-border bg-surface2 text-display font-extrabold text-navy"
            style={detail.logoUrl ? { backgroundImage: `url("${detail.logoUrl}")`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
          >
            {!detail.logoUrl && (detail.name.trim()[0]?.toUpperCase() ?? "?")}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="m-0 flex flex-wrap items-center gap-2 text-display font-extrabold tracking-[-.3px] text-navy">
              {detail.name}
              {detail.isVerified && (
                <span className="inline-flex items-center gap-1 rounded-full bg-ok-soft px-2 py-0.5 text-label font-extrabold text-ok">
                  <Icon name="verified" size={13} /> {t.store.verified}
                </span>
              )}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-meta font-semibold text-muted">
              {detail.city && (
                <span className="inline-flex items-center gap-1.5">
                  <Icon name="location_on" size={14} /> {detail.city}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <Icon name="construction" size={14} /> {detail.activeEquipmentCount} {t.store.equipment}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Icon name="visibility" size={14} /> {detail.viewCount.toLocaleString()} {t.store.views}
              </span>
            </div>
          </div>
        </div>

        {/* About — the full width of the card. `dir="auto"` because most of these are Arabic. */}
        {detail.description && (
          <p className="mt-4 whitespace-pre-line text-body leading-relaxed text-navy-mid" dir="auto">
            {detail.description}
          </p>
        )}

        {/* Documents (AC-19) — the three labels and their status. No contents, here or anywhere. */}
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <span className="text-label font-semibold uppercase tracking-wide text-muted">{t.store.documents}</span>
          {[t.store.docCR, t.store.docVAT, t.store.docNationalAddress].map((d) => (
            <span
              key={d}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-label font-semibold ${
                detail.isVerified ? "bg-ok-soft text-ok" : "bg-surface2 text-muted"
              }`}
            >
              <Icon name={detail.isVerified ? "check_circle" : "schedule"} size={12} /> {d}
            </span>
          ))}
          <span className="text-label font-semibold text-muted">· {docStatus}</span>
          {/* AC-18: operators are a stated absence, not a hidden one. */}
          <span className="ms-auto inline-flex items-center gap-1 rounded-full bg-surface2 px-2.5 py-1 text-label font-semibold text-muted">
            <Icon name="engineering" size={12} /> {t.store.operators} · {t.store.comingSoon}
          </span>
        </div>
      </section>

      {/* What they have (AC-20). */}
      <div className="flex items-center gap-2.5">
        <h3 className="m-0 text-title font-extrabold tracking-[-.3px] text-navy">{t.store.equipment}</h3>
        <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-meta font-extrabold text-brand-deep">{detail.activeEquipmentCount}</span>
      </div>
      {detail.equipment.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-8 text-center text-body text-muted">{t.store.noEquipment}</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {detail.equipment.map((e) => (
            <EquipmentTile
              key={e.id}
              eq={e}
              storeId={id}
              storeCity={detail.city}
              iconUrl={(e.subcategoryId && icons[e.subcategoryId]) || (e.measurementId && icons[e.measurementId]) || null}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * One machine on the profile — the same face a category card wears on Browse: verified tick and city
 * tag on the image, the category above the name, size and year as chips.
 */
function EquipmentTile({
  eq,
  storeId,
  storeCity,
  iconUrl,
}: {
  eq: EquipmentCard;
  storeId: string;
  storeCity: string | null;
  iconUrl: string | null;
}) {
  const t = useT();
  const { locale } = useLocale();
  const ar = locale === "ar";
  const category = ar ? eq.categoryAr : eq.category;
  const subcategory = ar ? eq.subcategoryAr : eq.subcategory;
  const measurement = ar ? eq.measurementAr : eq.measurement;
  const title = [eq.make, eq.model].filter(Boolean).join(" ") || subcategory || category || measurement || "—";
  const city = eq.city ?? storeCity;
  const unit =
    eq.priceUnit === "PER_WEEK" ? t.store.perWeek : eq.priceUnit === "PER_MONTH" ? t.store.perMonth : eq.priceUnit === "PER_JOB" ? t.store.perJob : t.store.perDay;

  return (
    <Link
      {...pin("store-equipment-card")}
      href={`/equipment/${encodeURIComponent(eq.id)}?storeId=${encodeURIComponent(storeId)}`}
      className="block overflow-hidden rounded-sm border border-border bg-surface transition hover:border-brand/50"
    >
      <div
        className="relative grid h-[132px] place-items-center bg-gradient-to-br from-surface2 to-surface3"
        style={eq.photoUrl ? { backgroundImage: `url("${eq.photoUrl}")`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
      >
        {!eq.photoUrl &&
          (iconUrl ? (
            <div className="h-full w-full bg-center bg-no-repeat" style={{ backgroundImage: `url("${iconUrl}")`, backgroundSize: "44px" }} />
          ) : (
            <Icon name="construction" size={40} className="text-muted" />
          ))}
        {eq.isVerified && (
          <span className="absolute end-2.5 top-2.5 grid h-[22px] w-[22px] place-items-center rounded-full bg-ok text-white" title={t.store.verified}>
            <Icon name="check" size={13} />
          </span>
        )}
        {city && (
          <span className="absolute bottom-2.5 start-2.5 inline-flex items-center gap-1 rounded-full bg-navy/85 px-2 py-0.5 text-label font-semibold text-white">
            <Icon name="location_on" size={11} /> {city}
          </span>
        )}
      </div>
      <div className="px-3.5 pb-4 pt-3">
        {category && <div className="text-label font-semibold uppercase tracking-wide text-muted">{category}</div>}
        <div className="mt-0.5 truncate text-body font-extrabold text-navy">{title}</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {measurement && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-label font-extrabold text-brand-deep">{measurement}</span>}
          {eq.year != null && <span className="rounded-full bg-surface2 px-2 py-0.5 text-label font-semibold text-navy-mid">{eq.year}</span>}
        </div>
        {eq.price != null ? (
          <div className="mt-2.5 text-body font-extrabold tabular-nums text-brand">
            {eq.price.toLocaleString()} <span className="text-label font-semibold">SAR {unit}</span>
          </div>
        ) : (
          <div className="mt-2.5 text-meta font-semibold italic text-muted">{t.store.priceOnRequest}</div>
        )}
      </div>
    </Link>
  );
}
