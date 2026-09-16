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

/**
 * Cards per page. ~~60, appended by «Show more».~~ **20, with a `‹ ›` pager** (owner, 2026-09-16:
 * *"show 20 per page then second page will be by <>"*).
 *
 * 🔴 This REVERSES the 2026-09-03 ruling that the next page must APPEND (*"a renter who has
 * scrolled to the bottom of sixty cards is not asking to be sent back to the top"*). At sixty that was
 * right; at twenty the argument goes the other way — the grid is one screen, so a page is a page, and
 * the renter can walk back to the one he was on. The dedup branch went with the append.
 */
const PAGE_SIZE = 20;

interface CityOpt {
  value: string;
  label: string;
}

/**
 * The search field and the city share ONE skin, so they cannot drift apart in height again (owner,
 * 2026-09-16: *"make the search bar and filter with same size and height"*). `py-3` on a
 * `text-shop-control` line box is what sets the height; both controls state it from here.
 */
const CONTROL_SKIN =
  "rounded-shop-control border border-shop-line bg-shop-field py-3 px-4 text-shop-control text-shop-ink outline-none transition focus:border-shop-amber hover:border-shop-amber";


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
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
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

  /**
   * The directory is PAGED, and the page after the first was unreachable.
   *
   * `limit=60` with no way forward showed 60 of the 89 suppliers on staging as though that were the
   * market (owner, 2026-09-03: *"only the first page"*). The backend has always answered with a
   * `meta.totalPages`; this screen simply never asked for page two, and the BFF was dropping the
   * count on the floor. The first page still reloads on every change of filter; the `‹ ›` pager now
   * REPLACES the grid rather than appending to it.
   */
  useEffect(() => {
    setError(false);
    setStores(null);
    setPage(1);
    setMore(false);
  }, [debounced, city, categoryId, reloadKey]);

  useEffect(() => {
    const qs = new URLSearchParams();
    if (debounced) qs.set("search", debounced);
    if (city) qs.set("city", city);
    if (categoryId) qs.set("category", categoryId);
    qs.set("limit", String(PAGE_SIZE));
    qs.set("page", String(page));
    const ctrl = new AbortController();
    // Still «a page other than the first is in flight» — it disables the pager rather than the old
    // «Show more», so a double press cannot skip a page.
    setLoadingMore(page > 1);
    fetch(`/api/stores?${qs.toString()}`, { cache: "no-store", signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: { stores: StoreCardData[] }) => {
        const rows = d.stores ?? [];
        // ~~A page beyond the first ADDS, deduplicated by id.~~ One page at a time now, so a row that
        // appears on both pages (page 1 merges the featured suppliers in) is simply a row on each.
        setStores(rows);
        /* A FULL page means there is probably another; a short one is the end.
         *
         * The backend's own `meta.totalPages` would say so exactly, and cannot reach us: both call
         * helpers unwrap the envelope to `.data` before the BFF sees it (see the note there). The
         * heuristic costs one empty fetch when the total is an exact multiple of the page, and that
         * fetch corrects the button on arrival — `>=` rather than `===` because page one merges the
         * featured suppliers in and can come back longer than it asked for. */
        setMore(rows.length >= PAGE_SIZE);
      })
      .catch((e) => {
        if (e?.name !== "AbortError") setError(true);
      })
      .finally(() => setLoadingMore(false));
    return () => ctrl.abort();
  }, [debounced, city, categoryId, reloadKey, page]);

  const all = stores ?? [];
  const canToggle = previewCount != null && all.length > previewCount;
  const shown = previewCount != null && !expanded ? all.slice(0, previewCount) : all;

  return (
    <div {...pin("browse-surface")} className="flex flex-col">
      {/* ── ONE row: the heading, then the two controls ──────────────────────────────────────────
          Owner, 2026-09-16: *"the search bar and all cities as sections in the same row"*. It was two
          bands — a title row, then a control row under it — which spent a third of the page above the
          first card saying «Most popular suppliers» on a line of its own.

          ⚠️ **`flex-wrap`, never a bare row.** Below `sm` a heading at `text-shop-h1` plus a search
          field plus a city cannot share a line, and forcing it would push the DOCUMENT wider than the
          phone — the fault audited out of three surfaces on 2026-09-08. One row where there is room.

          🔴 The count beside the title is GONE (owner, 2026-09-16). It read `stores.length`, which
          with a pager is the PAGE's count — «20 stores across Saudi Arabia» on every page, a false
          statement about the market rather than a stale one. The true total cannot reach this screen:
          both call helpers unwrap the envelope to `.data` before the BFF sees `meta.totalPages`, which
          is the same reason `more` below is a heuristic. */}
      <div {...pin("browse-controls")} className="mb-[22px] flex flex-wrap items-center gap-3">
        {title && <h1 className="m-0 me-auto text-shop-h1 font-shop-bold text-shop-ink">{title}</h1>}
        {canToggle && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-0.5 text-shop-meta font-semibold text-shop-ink-3 hover:text-shop-amber"
          >
            {expanded ? t.home.showLess : t.home.viewAll}
            <Icon name={expanded ? "expand_less" : "chevron_right"} size={16} className={expanded ? "" : "rtl:scale-x-[-1]"} />
          </button>
        )}
        <div className="relative min-w-[200px] flex-1">
          <span className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-shop-ink-4">
            <SearchIcon />
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.browse.search}
            className={`w-full ps-10 pe-4 ${CONTROL_SKIN} placeholder:text-shop-ink-4`}
          />
        </div>
        {/* ⚠️ **The city wears the search field's own skin**, which is what «same size and height»
            means here (owner, 2026-09-16). It used to fall through to `Dropdown`'s `field` tone — house
            tokens, `py-2` — so it stood 8px shorter than the input beside it and in a different grey.
            `triggerClass` is a per-call override and reaches no other dropdown in the product.
            The wrapper carries the width because `Dropdown`'s root takes no `className`. */}
        <div className="w-[190px] flex-none">
          <Dropdown
            label={t.browse.anyCity}
            placeholder={t.browse.anyCity}
            prefix={<PinIcon size={15} strokeWidth={1.8} />}
            value={city || null}
            onChange={setCity}
            options={cities.map((c) => ({ value: c.value, label: c.label }))}
            triggerClass={`w-full ${CONTROL_SKIN}`}
          />
        </div>
      </div>

      {/* The categories. «All» first, then the tree's top level — the pill that is on is the house
          navy, filled, and every other is an outline. */}
      {taxonomy.length > 0 && (
        /* ⚠️ **`shop-rail` is the scrollbar, and it is a LOCAL rule in `globals.css`** — the browser's
           default bar is ~15px of chrome under a 34px row, which is what read as thick (owner,
           2026-09-16: *"make it thinner and nicer"*). 6px, the row's own line colour, on a
           transparent track, and it keeps `overflow-x: auto` so it still scrolls where it must. */
        <div {...pin("browse-categories")} className="shop-rail -mx-1 mb-[26px] flex gap-2 overflow-x-auto px-1 pb-1.5">
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
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {shown.map((s) => (
              <StoreCard key={s.id} store={s} />
            ))}
          </div>
          {/* The `‹ ›` pager. Never inside a preview — the dashboard's strip has its own View-all and
              this would be a second answer to the same question — and never when page one is the whole
              directory, where two dead arrows say only that there is nothing to press.

              ⚠️ **`more` is a HEURISTIC, not a total**: a full page probably has another behind it, a
              short one is the end. `meta.totalPages` cannot reach this screen (see the fetch above), so
              «Next» can be live on the last page and correct itself on arrival. That is also why the
              pager states no «of N» — it would be a number we do not have.

              ⚠️ Both chevrons mirror under `dir="rtl"`: previous is the way the reader came from. */}
          {previewCount == null && (page > 1 || more) && (
            <div {...pin("browse-pager")} className="mt-6 flex items-center justify-center gap-2">
              <PageArrow
                dir="prev"
                label={t.browse.prevPage}
                disabled={page === 1 || loadingMore}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              />
              <span className="min-w-8 text-center text-shop-item font-semibold text-shop-ink">{page}</span>
              <PageArrow dir="next" label={t.browse.nextPage} disabled={!more || loadingMore} onClick={() => setPage((p) => p + 1)} />
            </div>
          )}
        </>
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
      /* Thinner: ~34px tall to ~28px (owner, 2026-09-16). `whitespace-nowrap` and `flex-none` both
         stay — without them the row shrinks a pill to squeeze another in, which is a wrap by another
         route and clips the category name rather than the row. */
      className={`flex-none whitespace-nowrap rounded-shop-tab border px-3.5 py-1.5 text-shop-item transition ${
        active ? "border-shop-ink bg-shop-ink font-semibold text-white" : "border-shop-line bg-white font-normal text-shop-ink-3 hover:border-shop-amber"
      }`}
    >
      {label}
    </button>
  );
}

/**
 * One arrow of the pager. A 32px square rather than a labelled button: the row holds two of them and
 * the page number between, and a word on each would be wider than the grid it pages.
 *
 * ⚠️ The label is on `aria-label` AND `title`, so the reason a disabled arrow is disabled is one
 * hover away and a screen reader hears a name rather than a chevron.
 */
function PageArrow({ dir, label, disabled, onClick }: { dir: "prev" | "next"; label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="grid h-8 w-8 place-items-center rounded-shop-control border border-shop-line bg-white text-shop-ink-3 transition hover:border-shop-amber hover:text-shop-ink disabled:cursor-not-allowed disabled:border-shop-line disabled:bg-shop-field disabled:text-shop-ink-4 disabled:hover:border-shop-line"
    >
      <Icon name={dir === "prev" ? "chevron_left" : "chevron_right"} size={18} className="rtl:scale-x-[-1]" />
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
