"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { Icon } from "@/components/ui";
import { StoreCard } from "@/components/stores/StoreCard";
import type { StoreCard as StoreCardData, TaxonomyNode } from "@/lib/contract/stores";
import { btn } from "@/lib/ds";

interface CityOpt {
  value: string;
  label: string;
}

// Filter pill — equal width so all filters are the same size.
const selectCls =
  "h-[40px] flex-1 min-w-[150px] rounded-sm border border-border bg-surface2 px-3 text-body font-semibold text-navy-mid outline-0 hover:border-navy-mid focus:border-brand";

/**
 * Suggested-suppliers surface (web-app/004, AC-10–17, AC-23). The filter bar (search + city +
 * dependent category → subcategory → measurement + verified-only, all on one row) is ALWAYS shown.
 * When `previewCount` is set, only that many cards render with a View-all / Show-less toggle that
 * just changes how many cards are shown — it never affects the filters. The backend enforces
 * visibility + featured ordering.
 */
export function BrowseSurface({ title, previewCount }: { title?: string; previewCount?: number }) {
  const t = useT();
  const { locale } = useLocale();
  const { status } = useSession();
  const ar = locale === "ar";
  // Guests browse the PUBLIC store directory (real data), but the City + Category filters source
  // authed-only reference data (`/api/master-data/cities`, `/api/stores/taxonomy`). Rather than a
  // public reference endpoint, we simply hide those two filters for guests (deferred, non-priority) —
  // they still get Search + Verified. The filters return once signed in.
  const anon = status === "anon";

  const [cities, setCities] = useState<CityOpt[]>([]);
  const [taxonomy, setTaxonomy] = useState<TaxonomyNode[]>([]);

  const [city, setCity] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [measurementId, setMeasurementId] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  const [stores, setStores] = useState<StoreCardData[] | null>(null);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [expanded, setExpanded] = useState(false);

  // Master data for the filters (cities + taxonomy tree) — authed-only; skip for guests (their
  // City/Category filters are hidden, so don't fire the calls that would 401).
  useEffect(() => {
    if (anon) {
      setCities([]);
      setTaxonomy([]);
      return;
    }
    fetch("/api/master-data/cities", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((raw: unknown) => {
        const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
        const arr = Array.isArray(raw) ? raw : ((Object.values(obj).find((v) => Array.isArray(v)) as unknown[]) ?? []);
        setCities(
          arr
            .map((c): CityOpt | null => {
              if (typeof c === "string") return { value: c, label: c };
              if (c && typeof c === "object") {
                const o = c as Record<string, unknown>;
                const value = String(o.name ?? o.nameEn ?? o.value ?? o.id ?? "");
                const label = String((ar ? o.nameAr : o.name) ?? o.name ?? value);
                return value ? { value, label } : null;
              }
              return null;
            })
            .filter((x): x is CityOpt => !!x),
        );
      })
      .catch(() => setCities([]));
    fetch("/api/stores/taxonomy", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: { taxonomy: TaxonomyNode[] }) => setTaxonomy(d.taxonomy ?? []))
      .catch(() => setTaxonomy([]));
  }, [ar, anon]);

  const subcategories = useMemo(() => taxonomy.find((c) => c.id === categoryId)?.children ?? [], [taxonomy, categoryId]);
  const measurements = useMemo(() => subcategories.find((s) => s.id === subcategoryId)?.children ?? [], [subcategories, subcategoryId]);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => {
    setError(false);
    setStores(null);
    const qs = new URLSearchParams();
    if (debounced) qs.set("search", debounced);
    if (city) qs.set("city", city);
    const cat = subcategoryId || categoryId;
    if (cat) qs.set("category", cat);
    if (measurementId) qs.set("measurement", measurementId);
    if (verifiedOnly) qs.set("verified", "true");
    qs.set("limit", "60");
    const ctrl = new AbortController();
    fetch(`/api/stores?${qs.toString()}`, { cache: "no-store", signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: { stores: StoreCardData[] }) => setStores(d.stores ?? []))
      .catch((e) => {
        if (e?.name !== "AbortError") setError(true);
      });
    return () => ctrl.abort();
  }, [debounced, city, categoryId, subcategoryId, measurementId, verifiedOnly, reloadKey]);

  const onCategory = (v: string) => {
    setCategoryId(v);
    setSubcategoryId("");
    setMeasurementId("");
  };
  const onSubcategory = (v: string) => {
    setSubcategoryId(v);
    setMeasurementId("");
  };

  const all = stores ?? [];
  const canToggle = previewCount != null && all.length > previewCount;
  const shown = previewCount != null && !expanded ? all.slice(0, previewCount) : all;

  return (
    <div className="flex flex-col gap-4">
      {/* Section header + View-all / Show-less (count only — never touches the filters) */}
      {title && (
        <div className="flex items-center justify-between">
          <h3 className="text-title font-extrabold tracking-[-.3px] text-navy">{title}</h3>
          {canToggle && (
            <button onClick={() => setExpanded((v) => !v)} className="inline-flex items-center gap-0.5 text-meta font-semibold text-info hover:underline">
              {expanded ? t.home.showLess : t.home.viewAll}
              <Icon name={expanded ? "expand_less" : "chevron_right"} size={16} className={expanded ? "" : "rtl:scale-x-[-1]"} />
            </button>
          )}
        </div>
      )}

      {/* Filter bar — always shown, in a card. Search row, then filters + verified toggle on one row. */}
      <div className="flex flex-col gap-2.5 rounded-sm border border-border bg-surface p-4">
        <div className="relative">
          <Icon name="search" size={18} className="absolute start-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.browse.search}
            className="h-[40px] w-full rounded-sm border border-border bg-surface2 ps-9 pe-3 text-body outline-0 focus:border-brand"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* City + Category cascade need authed reference data → shown to signed-in users only. */}
          {!anon && (
            <>
              <select className={selectCls} value={city} onChange={(e) => setCity(e.target.value)}>
                <option value="">{t.browse.anyCity}</option>
                {cities.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
              <select className={selectCls} value={categoryId} onChange={(e) => onCategory(e.target.value)}>
                <option value="">{t.browse.anyCategory}</option>
                {taxonomy.map((c) => (
                  <option key={c.id} value={c.id}>{tabel(c, ar)}</option>
                ))}
              </select>
              <select className={selectCls} value={subcategoryId} onChange={(e) => onSubcategory(e.target.value)}>
                {categoryId ? (
                  <>
                    <option value="">{t.browse.anySubcategory}</option>
                    {subcategories.map((s) => (
                      <option key={s.id} value={s.id}>{tabel(s, ar)}</option>
                    ))}
                  </>
                ) : (
                  <option value="">{t.browse.pickCategoryFirst}</option>
                )}
              </select>
              <select className={selectCls} value={measurementId} onChange={(e) => setMeasurementId(e.target.value)}>
                {subcategoryId ? (
                  <>
                    <option value="">{t.browse.anyMeasurement}</option>
                    {measurements.map((m) => (
                      <option key={m.id} value={m.id}>{tabel(m, ar)}</option>
                    ))}
                  </>
                ) : (
                  <option value="">{t.browse.pickSubcategoryFirst}</option>
                )}
              </select>
            </>
          )}
          <button
            type="button"
            onClick={() => setVerifiedOnly((v) => !v)}
            className="ms-1 inline-flex select-none items-center gap-2 text-body font-semibold text-navy-mid"
            aria-pressed={verifiedOnly}
          >
            <span className={`relative h-[23px] w-[40px] flex-none rounded-full border transition ${verifiedOnly ? "border-ok bg-ok" : "border-border bg-surface3"}`}>
              <span className={`absolute top-[2px] h-[17px] w-[17px] rounded-full bg-white transition-all ${verifiedOnly ? "start-[19px]" : "start-[2px]"}`} />
            </span>
            {t.browse.verifiedOnly}
          </button>
        </div>
      </div>

      {/* Results (AC-16/17/23) */}
      {error ? (
        <div className="rounded-sm border border-border bg-surface p-8 text-center text-body text-muted">
          <Icon name="error_outline" size={22} className="mx-auto mb-2 text-muted" />
          <p>{t.browse.error}</p>
          <button onClick={() => setReloadKey((k) => k + 1)} className={btn("secondary", "sm", { className: "mt-3" })}>
            {t.browse.retry}
          </button>
        </div>
      ) : stores === null ? (
        <div className="p-8 text-center text-body text-muted">{t.browse.loading}</div>
      ) : shown.length === 0 ? (
        <div className="rounded-sm border border-border bg-surface p-8 text-center text-body text-muted">
          <Icon name="storefront" size={22} className="mx-auto mb-2 text-muted" />
          {t.browse.empty}
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
          {shown.map((s) => (
            <StoreCard key={s.id} store={s} />
          ))}
        </div>
      )}
    </div>
  );
}

function tabel(n: TaxonomyNode, ar: boolean) {
  return ar ? n.nameAr : n.name;
}
