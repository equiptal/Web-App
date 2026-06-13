"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useT } from "@/lib/i18n";
import { useRfq } from "@/lib/store/rfq-store";
import { Icon, Pchips } from "@/components/ui";
import { PARTIES, type Party } from "@/lib/contract";
import { ItemDetails } from "@/components/wizard/ItemDetails";
import type { TaxonomyNode } from "@/lib/contract/stores";

function partyOpts(dict: Record<string, string>) {
  return PARTIES.map((v) => ({ value: v, label: dict[v] ?? v }));
}

/**
 * Manual Step 2 — equipment from the APP taxonomy with category/type icons, mirroring the app
 * (web-app/005, AC-05/06/07/08/13). One shared search + browse picker adds items; each added item
 * carries the full 002 per-item controls. Items hold app-taxonomy ids (posted to /rentees/me/requests).
 */
export function ManualEquipmentStep() {
  const t = useT();
  const m = t.manual;
  const { locale } = useLocale();
  const ar = locale === "ar";
  const { state, actions } = useRfq();
  const [tax, setTax] = useState<TaxonomyNode[]>([]);
  const [query, setQuery] = useState("");
  const [browseCat, setBrowseCat] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const proj = state.draft?.project;

  useEffect(() => {
    fetch("/api/stores/taxonomy", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: { taxonomy: TaxonomyNode[] }) => setTax(d.taxonomy ?? []))
      .catch(() => setTax([]));
  }, []);

  const label = (n: TaxonomyNode) => (ar ? n.nameAr : n.name) || n.name;
  const allSubs = useMemo(() => tax.flatMap((c) => c.children.map((s) => ({ cat: c, sub: s }))), [tax]);
  const allItems = (state.draft?.items ?? []).filter((i) => !i.removed);
  const items = allItems.filter((i) => i.ref.subcategoryId); // shown once a type is chosen

  // Shared picker (AC-05/06): fill the first untyped item, else append a new one.
  function pickType(categoryId: string, subcategoryId: string) {
    const blank = allItems.find((i) => !i.ref.subcategoryId);
    if (blank) {
      actions.setItemCategory(blank.id, categoryId);
      actions.setItemSubcategory(blank.id, subcategoryId);
    } else {
      const newId = `m${state.seq}`;
      actions.addItem();
      actions.setItemCategory(newId, categoryId);
      actions.setItemSubcategory(newId, subcategoryId);
    }
    setQuery("");
    setBrowseCat(null);
  }

  const browseNode = tax.find((c) => c.id === browseCat);

  return (
    <div className="w-full">
      <h2 className="text-[20px] font-extrabold tracking-tight text-navy">{m.step2Title}</h2>
      <p className="mt-1 text-[13.5px] text-muted">{m.step2Sub}</p>
      {state.channel === "direct" && state.supplier && (
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-info-soft px-3 py-1 text-[12.5px] font-semibold text-info">
          <Icon name="storefront" size={14} /> {m.directSupplier} {state.supplier.name}
        </div>
      )}

      {/* Request-wide logistics (002 structure) */}
      {proj && (
        <div className="mt-4 rounded-[12px] border border-border bg-surface2/50 p-3.5">
          <div className="mb-2.5 text-[11px] font-bold uppercase tracking-wide text-muted">{m.sharedSettings}</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <span className="mb-1.5 block text-[11.5px] font-bold text-navy-mid">{t.step1.requestWide.delivery}</span>
              <Pchips<Party> value={proj.deliveryToSite} onChange={(v) => actions.patchRequestWide({ deliveryToSite: v })} options={partyOpts(t.options.party)} />
            </div>
            <div>
              <span className="mb-1.5 block text-[11.5px] font-bold text-navy-mid">{t.step1.requestWide.return}</span>
              <Pchips<Party> value={proj.returnFromSite} onChange={(v) => actions.patchRequestWide({ returnFromSite: v })} options={partyOpts(t.options.party)} />
            </div>
            <div>
              <span className="mb-1.5 block text-[11.5px] font-bold text-navy-mid">{t.step1.requestWide.fuelResponsibility}</span>
              <Pchips<Party> value={proj.fuelResponsibility} onChange={(v) => actions.patchRequestWide({ fuelResponsibility: v })} options={partyOpts(t.options.party)} />
            </div>
          </div>
        </div>
      )}

      {/* Shared search + browse picker (one for all items, AC-05) */}
      <div className="mt-5 rounded-[14px] border border-border bg-surface p-4">
        <div className="relative">
          <Icon name="search" size={18} className="absolute start-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={m.search}
            className="h-[42px] w-full rounded-[10px] border border-border bg-surface2 ps-9 pe-3 text-[13.5px] outline-0 focus:border-brand"
          />
        </div>
        {query.trim() ? (
          <SearchResults q={query} subs={allSubs} labelOf={label} noResults={m.noResults} onPick={pickType} />
        ) : (
          <>
            <div className="mt-2 text-[11px] font-bold uppercase tracking-wide text-muted">{browseNode ? m.subcategory : m.orBrowse}</div>
            {browseNode ? (
              <div>
                <button onClick={() => setBrowseCat(null)} className="mb-2 inline-flex items-center gap-1 text-[12px] font-bold text-info">
                  <Icon name="arrow_back" size={14} className="rtl:scale-x-[-1]" /> {label(browseNode)}
                </button>
                <IconGrid nodes={browseNode.children} labelOf={label} onPick={(subId) => pickType(browseNode.id, subId)} />
              </div>
            ) : (
              <IconGrid nodes={tax} labelOf={label} onPick={(catId) => setBrowseCat(catId)} />
            )}
          </>
        )}
      </div>

      {/* Added items */}
      {items.length > 0 && <div className="mb-2 mt-6 text-[11px] font-bold uppercase tracking-wide text-muted">{m.addedItems}</div>}
      <div className="flex flex-col gap-4">
        {items.length === 0 ? (
          <p className="rounded-[12px] border border-dashed border-border bg-surface2/40 p-6 text-center text-[13px] text-muted">{m.empty}</p>
        ) : (
          items.map((item) => {
            const cat = tax.find((c) => c.id === item.ref.categoryId);
            const sub = cat?.children.find((s) => s.id === item.ref.subcategoryId);
            const measurements = sub?.children ?? [];
            const confirming = confirmId === item.id;
            const iconUrl = sub?.iconUrl || cat?.iconUrl || null;
            return (
              <div key={item.id} className="rounded-[14px] border border-border bg-surface p-4">
                <div className="flex items-start gap-3">
                  <span className="grid h-11 w-11 flex-none place-items-center overflow-hidden rounded-[10px] bg-surface2">
                    {iconUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={iconUrl} alt="" className="h-7 w-7 object-contain" />
                    ) : (
                      <Icon name="construction" size={20} className="text-muted" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-bold text-navy">{[cat && label(cat), sub && label(sub)].filter(Boolean).join(" · ")}</div>
                  </div>
                  {confirming ? (
                    <span className="inline-flex items-center gap-2 text-[12px]">
                      <button onClick={() => { actions.removeItem(item.id); setConfirmId(null); }} className="rounded-md bg-danger px-2 py-0.5 font-bold text-white">{m.confirmRemove}</button>
                      <button onClick={() => setConfirmId(null)} className="rounded-md border border-border px-2 py-0.5 font-semibold text-muted">{m.cancel}</button>
                    </span>
                  ) : (
                    <button onClick={() => setConfirmId(item.id)} className="text-muted hover:text-danger" aria-label={m.remove}>
                      <Icon name="close" size={18} />
                    </button>
                  )}
                </div>

                {/* Size (AC-05) */}
                <div className="mt-3">
                  <div className="mb-1.5 text-[12px] font-bold text-navy-mid">{m.measurement}</div>
                  <div className="flex flex-wrap gap-2">
                    {measurements.map((mn) => (
                      <button
                        key={mn.id}
                        onClick={() => actions.setItemMeasurement(item.id, mn.id)}
                        className={`rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition ${
                          item.ref.measurementId === mn.id ? "border-brand bg-brand-soft text-brand" : "border-border bg-surface text-navy-mid hover:border-navy-mid"
                        }`}
                      >
                        {label(mn)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-3">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-muted">{m.quantity}</span>
                  <input
                    type="number"
                    min={1}
                    value={item.quantity}
                    onChange={(e) => actions.patchItem(item.id, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                    className="h-[38px] w-[90px] rounded-[10px] border border-border bg-surface2 px-3 text-[13px] outline-0 focus:border-brand"
                  />
                  <button
                    onClick={() =>
                      setExpanded((prev) => {
                        const next = new Set(prev);
                        if (next.has(item.id)) next.delete(item.id);
                        else next.add(item.id);
                        return next;
                      })
                    }
                    className="ms-auto inline-flex items-center gap-1 text-[12.5px] font-bold text-info"
                  >
                    <Icon name="tune" size={15} /> {m.options}
                  </button>
                </div>
                {expanded.has(item.id) && proj && (
                  <div className="mt-3">
                    <ItemDetails item={item} sharedFuelResp={proj.fuelResponsibility} sharedDelivery={proj.deliveryToSite} sharedReturn={proj.returnFromSite} />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function SearchResults({
  q,
  subs,
  labelOf,
  onPick,
  noResults,
}: {
  q: string;
  subs: { cat: TaxonomyNode; sub: TaxonomyNode }[];
  labelOf: (n: TaxonomyNode) => string;
  onPick: (categoryId: string, subcategoryId: string) => void;
  noResults: string;
}) {
  const query = q.trim().toLowerCase();
  const matches = subs
    .filter(({ cat, sub }) => sub.name.toLowerCase().includes(query) || sub.nameAr.includes(q.trim()) || cat.name.toLowerCase().includes(query) || cat.nameAr.includes(q.trim()))
    .slice(0, 40);
  if (!matches.length) return <p className="mt-3 text-[13px] text-muted">{noResults}</p>;
  return (
    <div className="mt-3 flex flex-col gap-2">
      {matches.map(({ cat, sub }) => {
        const iconUrl = sub.iconUrl || cat.iconUrl;
        return (
          <button key={sub.id} onClick={() => onPick(cat.id, sub.id)} className="flex items-center gap-3 rounded-[12px] border border-border bg-surface p-3 text-start transition hover:border-brand">
            <span className="grid h-10 w-10 flex-none place-items-center overflow-hidden rounded-[8px] bg-surface2">
              {iconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={iconUrl} alt="" className="h-6 w-6 object-contain" />
              ) : (
                <Icon name="construction" size={18} className="text-muted" />
              )}
            </span>
            <span className="min-w-0">
              <span className="inline-block rounded-full bg-surface2 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-muted">{labelOf(cat)}</span>
              <span className="mt-0.5 block truncate text-[14px] font-bold text-navy">{labelOf(sub)}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function IconGrid({ nodes, labelOf, onPick }: { nodes: TaxonomyNode[]; labelOf: (n: TaxonomyNode) => string; onPick: (id: string) => void }) {
  return (
    <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
      {nodes.map((n) => (
        <button key={n.id} onClick={() => onPick(n.id)} className="flex flex-col items-center gap-1.5 rounded-[12px] border border-border bg-surface p-2.5 text-center transition hover:border-brand">
          <span className="grid h-12 w-12 place-items-center overflow-hidden rounded-[10px] bg-surface2">
            {n.iconUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={n.iconUrl} alt="" className="h-8 w-8 object-contain" />
            ) : (
              <Icon name="construction" size={20} className="text-muted" />
            )}
          </span>
          <span className="line-clamp-2 text-[11.5px] font-semibold text-navy-mid">{labelOf(n)}</span>
        </button>
      ))}
    </div>
  );
}
