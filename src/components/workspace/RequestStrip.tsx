"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useT } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import { publicTaxonomyUrl, type RequestGroup, type RequestListItem } from "@/lib/contract/requests";
import type { BidCard } from "@/lib/contract/bids";
import { BidDocumentsModal } from "@/components/workspace/BidDocumentsModal";

/**
 * The dark strip under the rail. Two halves, and they answer different questions.
 *
 * The left half names the **request**: where the work is, its id, how many bids arrived, when it was
 * raised. Both the site and the id open the request drawer (phase 4) — until it exists they are
 * drawn as the links they will be, and inert.
 *
 * The right half names the **item and the selected supplier's answer to it**, so it re-renders every
 * time the selection moves — same machine asked for, a different machine offered. On a multi-item
 * request a row of item chips sits between them; picking one reloads the tabs below.
 */
export function RequestStrip({
  group,
  item,
  items,
  bid,
  bidCount,
  onPickItem,
  onOpenRequest,
}: {
  group: RequestGroup;
  item: RequestListItem | null;
  items: RequestListItem[];
  /** The bid the page is focused on — null while none has arrived or none is chosen. */
  bid: BidCard | null;
  bidCount: number;
  onPickItem: (itemId: string) => void;
  /** Opens the request drawer. Null until phase 4 builds it. */
  onOpenRequest: (() => void) | null;
}) {
  const t = useT();
  const { locale } = useLocale();
  const ar = locale === "ar";
  const router = useRouter();
  const [docsOpen, setDocsOpen] = useState(false);

  const requestRef = group.groupRef ?? item?.displayId ?? group.id;
  const raised = group.createdAt
    ? new Date(group.createdAt).toLocaleDateString(ar ? "ar" : "en-GB", { day: "numeric", month: "short", year: "numeric" })
    : null;
  const itemLabel = item?.item ? (ar ? item.item.nameAr || item.item.name : item.item.name) : "—";
  const bidsLine = bidCount === 1 ? t.workspace.oneBid : t.workspace.bidsCount.replace("{n}", String(bidCount));

  // What the supplier put against this item: make, model and year, as the renter would name it.
  const offered = bid?.equipment
    ? [bid.equipment.make, bid.equipment.model].filter(Boolean).join(" ") || null
    : null;
  const offeredYear = bid?.equipment?.year ?? null;
  const photo = publicTaxonomyUrl(item?.item?.imageUrl ?? null);

  return (
    <div className="mx-3 mt-3 overflow-hidden rounded-[16px] bg-navy text-white sm:mx-5">
      <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-stretch lg:gap-5">
        {/* ── The request ── */}
        <div className="flex-none lg:w-[300px]">
          <button
            type="button"
            onClick={onOpenRequest ?? undefined}
            disabled={!onOpenRequest}
            className="flex items-center gap-1.5 text-start text-[19px] font-extrabold leading-tight tracking-[-.3px] underline-offset-4 hover:underline disabled:no-underline"
            title={group.address ?? group.locationLabel}
          >
            {group.locationLabel}
            <Icon name="north_east" size={16} className="text-white/60 rtl:scale-x-[-1]" />
          </button>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px] font-bold">
            <button
              type="button"
              onClick={onOpenRequest ?? undefined}
              disabled={!onOpenRequest}
              className="underline decoration-white/40 underline-offset-4 hover:decoration-white disabled:no-underline"
            >
              {requestRef}
            </button>
            <span className="text-brand">{bidsLine}</span>
            {raised && <span className="font-semibold text-white/50">{raised}</span>}
          </div>

          {/* Item chips — only when the request holds more than one, since a single item is already
              named in full on the right. */}
          {items.length > 1 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {items.map((it) => {
                const on = it.id === item?.id;
                const label = it.item ? (ar ? it.item.nameAr || it.item.name : it.item.name) : it.displayId;
                return (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => onPickItem(it.id)}
                    aria-current={on ? "true" : undefined}
                    className={`max-w-[190px] truncate rounded-full px-2.5 py-1 text-[11.5px] font-bold transition ${
                      on ? "bg-white text-navy" : "bg-white/10 text-white/75 hover:bg-white/20"
                    }`}
                  >
                    {label}
                    {(it.item?.qty ?? 1) > 1 && <span className={on ? "text-navy-mid" : "text-white/50"}> ×{it.item?.qty}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── The item, and this supplier's answer to it ── */}
        <div className="flex min-w-0 flex-1 flex-col gap-3 rounded-[12px] bg-white/[.07] p-3 sm:flex-row sm:items-center">
          <span className="relative grid h-[52px] w-[64px] flex-none place-items-center overflow-hidden rounded-[8px] bg-white/10">
            {photo ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={photo} alt="" className="h-full w-full object-cover" />
            ) : (
              <Icon name="precision_manufacturing" size={22} className="text-white/50" />
            )}
          </span>

          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-extrabold">{itemLabel}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px]">
              {bid ? (
                <>
                  <span className="text-white/55">{t.workspace.offers.replace("{supplier}", bid.supplierName)}</span>
                  <b className="font-extrabold">
                    {offered ?? "—"}
                    {offeredYear ? ` · ${offeredYear}` : ""}
                  </b>
                </>
              ) : (
                <span className="text-white/55">{bidCount === 0 ? t.workspace.noBidsYet : t.workspace.noBidSelected}</span>
              )}
            </div>
          </div>

          {/* The two ways deeper into this one offer. Both need a bid to point at. */}
          <div className="flex flex-none flex-col gap-1.5">
            <button
              type="button"
              disabled={!bid}
              onClick={() => bid && router.push(`/bids/${encodeURIComponent(bid.id)}/equipment`)}
              className="rounded-full bg-white px-4 py-1.5 text-[12.5px] font-extrabold text-navy transition hover:brightness-95 disabled:opacity-40"
            >
              {t.workspace.reviewEquipment}
            </button>
            <button
              type="button"
              disabled={!bid}
              onClick={() => bid && setDocsOpen(true)}
              className="inline-flex items-center justify-center gap-1.5 rounded-full border border-white/25 px-4 py-1.5 text-[12.5px] font-bold text-white/85 transition hover:bg-white/10 disabled:opacity-40"
            >
              <Icon name="visibility" size={15} /> {t.workspace.viewDocuments}
            </button>
          </div>
        </div>
      </div>

      {docsOpen && bid && (
        <BidDocumentsModal bidId={bid.id} supplier={bid.supplierName} onClose={() => setDocsOpen(false)} />
      )}
    </div>
  );
}
