"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { fmt, useLocale, useT } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import { publicTaxonomyUrl, type RequestGroup, type RequestListItem } from "@/lib/contract/requests";
import { CERT_LABEL, type BidCard } from "@/lib/contract/bids";

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

  /** The request's own terms, for the chip row below the item name. */
  const startsOn = item?.startDate
    ? new Date(item.startDate).toLocaleDateString(ar ? "ar" : "en-GB", { day: "numeric", month: "short" })
    : null;
  const certs = item?.requiredCerts ?? [];
  const unitCount = item?.item?.qty ?? 1;
  /**
   * Did the request ask for an operator?
   *
   * Read off the BID's `requestTerms`, which every bid carries a copy of — the earlier note that this
   * needed a projection change was wrong: `RequestListItem` has no operator field, but the bid does,
   * and the strip always has a bid in hand when there is one to read.
   *
   * Absent rather than «no operator» when nothing is selected or the request never said: a request
   * that did not ask is not a request that refused.
   */
  const withOperator = (bid?.requestTerms?.operatorIncluded ?? "").toUpperCase() === "YES";

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

            {/* ── What the REQUEST asks for, on the strip (owner, 2026-08-25: "match prototype") ────
                These facts were drawer-only, which meant the renter had to open a panel to recall
                what he had asked for while comparing what he was being offered. They belong beside
                the item they qualify.

                «With operator» comes off the BID rather than the item: every bid carries a copy of the
                request's terms, and that is where the flag lives. Nothing on this row is derived — a
                chip here is a requirement, and one invented from `rentalType` would be a claim the
                request never made. */}
            {(startsOn || item?.durationDays || certs.length > 0 || unitCount > 1 || withOperator) && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {startsOn && <Chip>{fmt(t.workspace.chipStarts, { date: startsOn })}</Chip>}
                {item?.durationDays ? (
                  <Chip>{fmt(t.workspace.chipDuration, { n: String(item.durationDays) })}</Chip>
                ) : null}
                {unitCount > 1 && <Chip>{fmt(t.workspace.unitsCount, { n: String(unitCount) })}</Chip>}
                {withOperator && <Chip>{t.workspace.chipOperator}</Chip>}
                {certs.slice(0, 2).map((c) => (
                  <Chip key={c} tone="cert">{ar ? CERT_LABEL[c].ar : CERT_LABEL[c].en}</Chip>
                ))}
                {certs.length > 2 && <Chip>{fmt(t.workspace.chipMore, { n: String(certs.length - 2) })}</Chip>}
              </div>
            )}

            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px]">
              {bid ? (
                <>
                  <span className="text-white/55">{t.workspace.offers.replace("{supplier}", bid.supplierName)}</span>
                  <b className="font-extrabold">
                    {offered ?? "—"}
                    {offeredYear ? ` · ${offeredYear}` : ""}
                  </b>
                </>
              ) : bidCount === 0 ? (
                <span className="text-white/55">{t.workspace.noBidsYet}</span>
              ) : null}
              {/* ── Nothing at all when a bid is simply not picked yet (owner, 2026-08-25) ──────────
                  It said «No bid selected», which is the surface narrating its own state back at the
                  renter: he can see that nothing is picked, because nothing is picked. «No bids yet»
                  stays, because THAT is a fact about the offer he cannot see from here. */}
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
            {/* The same surface as Review equipment, opened on the papers instead of the machine.
                The workspace does not know which unit that is — it has the bid, not its fleet — so
                the map chooses, preferring one whose location the lessor confirmed. */}
            <button
              type="button"
              disabled={!bid}
              onClick={() => bid && router.push(`/bids/${encodeURIComponent(bid.id)}/equipment?panel=documents`)}
              className="inline-flex items-center justify-center gap-1.5 rounded-full border border-white/25 px-4 py-1.5 text-[12.5px] font-bold text-white/85 transition hover:bg-white/10 disabled:opacity-40"
            >
              <Icon name="visibility" size={15} /> {t.workspace.viewDocuments}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * One fact about the request, on the dark strip.
 *
 * Two tones and no more: the neutral one for a plain fact — when it starts, how long, how many — and
 * `cert` for a certificate, which is the only chip on this row naming something a supplier can FAIL
 * to hold. Colouring the others would make a start date look like a requirement to meet.
 */
function Chip({ children, tone = "plain" }: { children: ReactNode; tone?: "plain" | "cert" }) {
  const skin = tone === "cert" ? "bg-brand/20 text-brand" : "bg-white/10 text-white/75";
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${skin}`}>{children}</span>;
}
