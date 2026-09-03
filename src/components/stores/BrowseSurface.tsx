"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
 * Most popular suppliers (web-app/004, AC-10–17, AC-23) — the prototype's Stores Page, value for
 * value. ~~«Suggested Suppliers».~~ Renamed by the owner (2026-09-01): nothing here is a suggestion
 * — the list is not ranked to this renter, it is the directory — and calling it one promised a
 * personalisation the page does not do.
 *
 * A title with the count beside it, one row carrying a search field and the city, a row of category
 * pills, then five cards to a row. The card is where the category lands: no pill and it shows the
 * shop; a pill and it shows that shop's matching machine (see `StoreCard`).
 *
 * ⚠️ **The subtype, size and verified-only filters are gone** (owner, 2026-09-01: follow the
 * prototype). The reference draws two controls, and a filter row that grows to five is a different
 * screen — the pills carry the narrowing now. `/api/stores` still accepts `subcategory`,
 * `measurement` and `verified`, so the controls can come back as a second row without a contract
 * change; nothing about the request path was removed.
 *
 * `previewCount` renders only that many cards with a View-all / Show-less toggle, which changes how
 * many are shown and never what is asked for. The backend enforces visibility + featured ordering.
 */
export function BrowseSurface({ title, previewCount }: { title?: string; previewCount?: number }) {
  const t = useT();
  const { locale } = useLocale();
  const ar = locale === "ar";
  const router = useRouter();

  const [cities, setCities] = useState<CityOpt[]>([]);
  const [taxonomy, setTaxonomy] = useState<TaxonomyNode[]>([]);

  /**
   * The narrowing lives in the URL (owner, 2026-09-03).
   *
   * *"I clicked an equipment from the stores, I clicked back … I want browsing all stores."* Back
   * lands here, and it used to land on an UNFILTERED directory: the pill was component state, so
   * returning threw away the category, the city and the words the renter had typed, and put him at
   * the top of 60 cards to find his place again. A filter nobody can link to is also a filter nobody
   * can share or reload.
   *
   * Read off `window.location` rather than `useSearchParams`, which would oblige this page to carry
   * a Suspense boundary for a convenience — the same call `ProjectChips` makes, for the same reason.
   * The first render is the server's and holds none of it; the effect below fills it in.
   *
   * ⚠️ **Coming BACK here restores the view but not the address.** Next hands back the client state
   * for that entry — the pill is still lit and the machine cards are still there, which is what the
   * renter asked for — while restoring the entry's original `/browse`. Re-asserting the query from a
   * `popstate` handler was tried and does not stick (the router rewrites the address during the same
   * event), so the screen is right and the address bar is one filter behind until the next press.
   * Reloading at that moment lands on the unfiltered directory. Worth solving with `useSearchParams`
   * as the single source if this ever bites.
   */
  const [city, setCity] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setCity(q.get("city") ?? "");
    setCategoryId(q.get("category") ?? "");
    const s = q.get("search") ?? "";
    setSearch(s);
    setDebounced(s);
  }, []);
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

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  /**
   * Write the narrowing back into the address bar.
   *
   * `replaceState`, never `push`: a category is a view of this page, not a page of its own, so Back
   * must leave the directory rather than walk backwards through six pills the renter pressed on the
   * way to the one he wanted. It is also why the debounced search is what rides here — one entry per
   * search, not one per keystroke.
   */
  useEffect(() => {
    // The ROUTER's replace, not `history.replaceState`. The latter rewrites the address bar while
    // leaving the router's own entry saying `/browse`, so the address and the entry drift apart.
    // `scroll: false` keeps the renter's place in the grid.
    const sync = () => {
      const q = new URLSearchParams(window.location.search);
      const set = (k: string, v: string) => (v ? q.set(k, v) : q.delete(k));
      set("category", categoryId);
      set("city", city);
      set("search", debounced);
      const next = `${window.location.pathname}${q.toString() ? `?${q}` : ""}`;
      if (next !== `${window.location.pathname}${window.location.search}`) router.replace(next, { scroll: false });
    };
    sync();
  }, [categoryId, city, debounced, router]);

  useEffect(() => {
    setError(false);
    setStores(null);
    const qs = new URLSearchParams();
    if (debounced) qs.set("search", debounced);
    if (city) qs.set("city", city);
    if (categoryId) qs.set("category", categoryId);
    qs.set("limit", "60");
    const ctrl = new AbortController();
    fetch(`/api/stores?${qs.toString()}`, { cache: "no-store", signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: { stores: StoreCardData[] }) => setStores(d.stores ?? []))
      .catch((e) => {
        if (e?.name !== "AbortError") setError(true);
      });
    return () => ctrl.abort();
  }, [debounced, city, categoryId, reloadKey]);

  const all = stores ?? [];
  const canToggle = previewCount != null && all.length > previewCount;
  const shown = previewCount != null && !expanded ? all.slice(0, previewCount) : all;

  return (
    <div {...pin("browse-surface")} className="flex flex-col">
      {/* The title, with the count beside it — «Most popular suppliers · 13 stores across Saudi Arabia».
          The View-all toggle is the preview's, and only a preview ever draws it. */}
      {title && (
        <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2.5">
          <div className="flex flex-wrap items-baseline gap-2.5">
            <h1 className="m-0 text-shop-h1 font-shop-bold text-shop-ink">{title}</h1>
            {stores !== null && (
              <span className="text-shop-item text-shop-ink-4">
                {stores.length} {t.browse.storesAcross}
              </span>
            )}
          </div>
          {canToggle && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="inline-flex items-center gap-0.5 text-shop-meta font-semibold text-shop-ink-3 hover:text-shop-amber"
            >
              {expanded ? t.home.showLess : t.home.viewAll}
              <Icon name={expanded ? "expand_less" : "chevron_right"} size={16} className={expanded ? "" : "rtl:scale-x-[-1]"} />
            </button>
          )}
        </div>
      )}

      {/* Search and the city. Two controls, as the prototype draws them — the search takes the row
          and the city sits at its end. */}
      <div className="mb-[22px] flex items-center gap-3">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-shop-ink-4">
            <SearchIcon />
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.browse.search}
            className="w-full rounded-shop-control border border-shop-line bg-shop-field py-3 ps-10 pe-4 text-shop-control text-shop-ink outline-none placeholder:text-shop-ink-4 focus:border-shop-amber"
          />
        </div>
        <Dropdown
          label={t.browse.anyCity}
          placeholder={t.browse.anyCity}
          prefix={<PinIcon size={15} strokeWidth={1.8} />}
          value={city || null}
          onChange={setCity}
          options={cities.map((c) => ({ value: c.value, label: c.label }))}
        />
      </div>

      {/* The categories. «All» first, then the tree's top level — the pill that is on is the house
          navy, filled, and every other is an outline. */}
      {taxonomy.length > 0 && (
        <div className="-mx-1 mb-[26px] flex gap-2.5 overflow-x-auto px-1 pb-2">
          <Pill label={t.browse.allCategories} active={!categoryId} onClick={() => setCategoryId("")} />
          {taxonomy.map((c) => (
            <Pill key={c.id} label={tabel(c, ar)} active={categoryId === c.id} onClick={() => setCategoryId(c.id)} />
          ))}
        </div>
      )}

      {/* Results (AC-16/17/23) */}
      {error ? (
        <div className="rounded-shop-card border border-shop-line bg-white p-8 text-center text-shop-body text-shop-ink-3">
          <Icon name="error_outline" size={22} className="mx-auto mb-2" />
          <p>{t.browse.error}</p>
          <button onClick={() => setReloadKey((k) => k + 1)} className={btn("secondary", "sm", { className: "mt-3" })}>
            {t.browse.retry}
          </button>
        </div>
      ) : stores === null ? (
        <div className="p-8 text-center text-shop-body text-shop-ink-3">{t.browse.loading}</div>
      ) : shown.length === 0 ? (
        <div className="rounded-shop-card border border-shop-line bg-white p-8 text-center text-shop-body text-shop-ink-3">
          <Icon name="storefront" size={22} className="mx-auto mb-2" />
          {t.browse.empty}
        </div>
      ) : (
        /* Five to a row at the prototype's 1360, stepping down rather than shrinking a card below the
           width its chips need. */
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
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
      className={`flex-none whitespace-nowrap rounded-shop-tab border px-[18px] py-[9px] text-shop-item transition ${
        active ? "border-shop-ink bg-shop-ink font-semibold text-white" : "border-shop-line bg-white font-normal text-shop-ink-3 hover:border-shop-amber"
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
