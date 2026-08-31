"use client";

import { useEffect, useMemo, useState } from "react";
import { Dropdown } from "@/components/Dropdown";
import { useLocale, useT } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import { StoreCard } from "@/components/stores/StoreCard";
import type { StoreCard as StoreCardData, TaxonomyNode } from "@/lib/contract/stores";
import { btn } from "@/lib/ds";
import { pin } from "@/lib/uiPins";
import { PinIcon } from "@/components/stores/shop";

interface CityOpt {
  value: string;
  label: string;
}


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
  const ar = locale === "ar";

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

  // Master data for the filters (cities + taxonomy tree). Both BFF routes answer a guest from the
  // app's PUBLIC twins now, so the City filter and the category pills are the same controls signed in
  // or out — the directory is public, and a filter a visitor cannot use makes it less so.
  useEffect(() => {
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
  }, [ar]);

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
    <div {...pin("browse-surface")} className="flex flex-col gap-4">
      {/* Section header + View-all / Show-less (count only — never touches the filters) */}
      {title && (
        <div className="flex items-center justify-between">
          <h3 className="m-0 text-shop-name font-shop-bold text-shop-ink">{title}</h3>
          {canToggle && (
            <button onClick={() => setExpanded((v) => !v)} className="inline-flex items-center gap-0.5 text-shop-meta font-semibold text-shop-ink-3 hover:text-shop-amber">
              {expanded ? t.home.showLess : t.home.viewAll}
              <Icon name={expanded ? "expand_less" : "chevron_right"} size={16} className={expanded ? "" : "rtl:scale-x-[-1]"} />
            </button>
          )}
        </div>
      )}

      {/* Search and the city, on one row — the prototype's own two controls, at its own metrics.
          The subtype, size and verified-only controls beside them are NOT in the prototype, which
          draws a search field and a city menu. They stay because the directory's own acceptance
          asks for them (AC-10–17) and dropping a working filter to match a picture is a loss the
          picture was not making a case for; they wear the storefront's skin so the row still reads
          as one. The menus themselves are the house `Dropdown`, unchanged — one control, one
          behaviour, everywhere in the app. */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[240px] flex-1">
          <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-shop-ink-4">
            <SearchIcon />
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.browse.search}
            className="h-[42px] w-full rounded-shop-pill border border-shop-line bg-white ps-10 pe-3.5 text-shop-body text-shop-ink outline-0 placeholder:text-shop-ink-4 focus:border-shop-amber"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* The house dropdown, not a native menu (owner, 2026-08-31): each system list opened in its
              own style, and an empty option and the placeholder say the same thing here — a filter
              that is not narrowed reads «All cities» on its own trigger. */}
          <Dropdown
            label={t.browse.anyCity}
            placeholder={t.browse.anyCity}
            prefix={<PinIcon size={14} />}
            value={city || null}
            onChange={setCity}
            options={cities.map((c) => ({ value: c.value, label: c.label }))}
          />
          {/* The category level moved OUT of this row and onto the pills above the grid — it is the
              choice that changes what a card even shows, and a choice that important should not be
              one closed menu among four. Subtype and size stay menus, and appear only once a pill has
              been pressed: a disabled dropdown saying «pick a category first» was a control that
              existed to say it was unusable. */}
          {categoryId && (
            <>
              <Dropdown
                label={t.browse.anySubcategory}
                placeholder={t.browse.anySubcategory}
                value={subcategoryId || null}
                onChange={onSubcategory}
                options={subcategories.map((sc) => ({ value: sc.id, label: tabel(sc, ar) }))}
              />
              {subcategoryId && (
                <Dropdown
                  label={t.browse.anyMeasurement}
                  placeholder={t.browse.anyMeasurement}
                  value={measurementId || null}
                  onChange={setMeasurementId}
                  options={measurements.map((m) => ({ value: m.id, label: tabel(m, ar) }))}
                />
              )}
            </>
          )}
          <button
            type="button"
            onClick={() => setVerifiedOnly((v) => !v)}
            className="ms-1 inline-flex select-none items-center gap-2 text-shop-meta font-semibold text-shop-ink-3"
            aria-pressed={verifiedOnly}
          >
            <span className={`relative h-[23px] w-[40px] flex-none rounded-full border transition ${verifiedOnly ? "border-shop-ok bg-shop-ok" : "border-shop-line bg-shop-fill"}`}>
              <span className={`absolute top-[2px] h-[17px] w-[17px] rounded-full bg-white transition-all ${verifiedOnly ? "start-[19px]" : "start-[2px]"}`} />
            </span>
            {t.browse.verifiedOnly}
          </button>
        </div>
      </div>

      {/* The categories, as pills — the same row signed in or out. Drawn only once the tree is in
          hand, so a slow reference call shows nothing rather than a lone «All» that grows. */}
      {taxonomy.length > 0 && (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          <Pill label={t.browse.allCategories} active={!categoryId} onClick={() => onCategory("")} />
          {taxonomy.map((c) => (
            <Pill key={c.id} label={tabel(c, ar)} active={categoryId === c.id} onClick={() => onCategory(c.id)} />
          ))}
        </div>
      )}

      {/* Results (AC-16/17/23) */}
      {error ? (
        <div className="rounded-shop-card border border-shop-line p-8 text-center text-shop-body text-shop-ink-3">
          <Icon name="error_outline" size={22} className="mx-auto mb-2" />
          <p>{t.browse.error}</p>
          <button onClick={() => setReloadKey((k) => k + 1)} className={btn("secondary", "sm", { className: "mt-3" })}>
            {t.browse.retry}
          </button>
        </div>
      ) : stores === null ? (
        <div className="p-8 text-center text-shop-body text-shop-ink-3">{t.browse.loading}</div>
      ) : shown.length === 0 ? (
        <div className="rounded-shop-card border border-shop-line p-8 text-center text-shop-body text-shop-ink-3">
          <Icon name="storefront" size={22} className="mx-auto mb-2" />
          {t.browse.empty}
        </div>
      ) : (
        /* Six to a row at the prototype's 1360 (six 196px cards + five 16px gaps + the gutter),
           stepping down rather than shrinking a card below the width its chips need. */
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {shown.map((s) => (
            <StoreCard key={s.id} store={s} />
          ))}
        </div>
      )}
    </div>
  );
}

function Pill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`h-[34px] flex-none rounded-shop-pill border px-3.5 text-shop-meta font-semibold transition ${
        active ? "border-shop-amber-deep bg-shop-amber-soft text-shop-amber-deep" : "border-shop-line bg-white text-shop-ink-3 hover:border-shop-amber"
      }`}
    >
      {label}
    </button>
  );
}

/** The prototype's magnifier — a font glyph could not carry its 1.8px stroke. */
function SearchIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M16 16L21 21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function tabel(n: TaxonomyNode, ar: boolean) {
  return ar ? n.nameAr : n.name;
}
