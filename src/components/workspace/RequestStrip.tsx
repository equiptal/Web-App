"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { fmt, useLocale, useT } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import { publicTaxonomyUrl, type RequestGroup, type RequestListItem } from "@/lib/contract/requests";
import { CERT_LABEL, type BidCard } from "@/lib/contract/bids";
import { unitAvailability } from "@/lib/contract/bid-map";

/**
 * The dark strip under the rail. Two halves, and they answer different questions.
 *
 * The left half names the **request**: where the work is, its id, how many bids arrived, when it was
 * raised. Both the site and the id open the request drawer.
 *
 * The right half is a white card carrying the **item and the terms the request sets on it** — the
 * machine asked for, when it starts, how long, how many, and the certificates a supplier must hold.
 * It is the REQUEST throughout and does not move with the selection (owner, 2026-08-25): what a
 * supplier offered against it is an answer, and answers live on the cards, in the comparison and on
 * the map behind «Check availability».
 *
 * The controls beside it are the exception — they act on the picked bid, which is why they read as
 * inert until there is one.
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
  /** Opens the request drawer, which is also where sharing lives. */
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
  const photo = publicTaxonomyUrl(item?.item?.imageUrl ?? null);

  // What the supplier put against this item: make and model, as the renter would name it.
  const offered = bid?.equipment ? [bid.equipment.make, bid.equipment.model].filter(Boolean).join(" ") || null : null;
  const offeredYear = bid?.equipment?.year ?? null;
  /**
   * Has this bid's equipment been placed in a yard the lessor confirmed?
   *
   * `unitAvailability`'s rule and no other — the map's pins and the equipment list's chips read the
   * same function, so a machine cannot be confirmed on one surface and unconfirmed on another.
   */
  const units = bid?.offeredUnitsDetail ?? [];
  const confirmed = units.length > 0 && units.every((u) => unitAvailability(u) === "confirmed");


  /** The request's own terms, for the chip row below the item name. */
  const startsOn = item?.startDate
    ? new Date(item.startDate).toLocaleDateString(ar ? "ar" : "en-GB", { day: "numeric", month: "short" })
    : null;
  const certs = item?.requiredCerts ?? [];
  const unitCount = item?.item?.qty ?? 1;
  /**
   * Did the request ask for an operator?
   *
   * Read off the BID's `requestTerms`, which every bid carries a copy of: `RequestListItem` has no
   * operator field, but the bid does, and the strip always has a bid in hand when there is one to
   * read. Absent rather than «no operator» when nothing is selected or the request never said — a
   * request that did not ask is not a request that refused.
   */
  const withOperator = (bid?.requestTerms?.operatorIncluded ?? "").toUpperCase() === "YES";


  const goEquipment = (panel?: "documents") => {
    if (!bid) return;
    router.push(`/bids/${encodeURIComponent(bid.id)}/equipment${panel ? "?panel=documents" : ""}`);
  };

  return (
    <div className="mx-3 mt-3.5 flex items-stretch gap-4 sm:mx-5">
      <div className="flex min-w-0 flex-1 flex-col gap-4 rounded-[16px] bg-navy px-4 py-3 text-white lg:flex-row lg:items-center lg:gap-5 lg:px-[18px]">
        {/* ── The request ── */}
        <div className="flex flex-none flex-col gap-1.5">
          <button
            type="button"
            onClick={onOpenRequest ?? undefined}
            disabled={!onOpenRequest}
            className="flex items-center gap-1.5 text-start text-[18px] font-extrabold leading-[1.15] tracking-[-.01em] underline-offset-4 hover:underline disabled:no-underline"
            title={group.address ?? group.locationLabel}
          >
            {group.locationLabel}
            <Icon name="north_east" size={15} className="text-white/50 rtl:scale-x-[-1]" />
          </button>
          <div className="flex flex-wrap items-baseline gap-2">
            <button
              type="button"
              onClick={onOpenRequest ?? undefined}
              disabled={!onOpenRequest}
              className="text-[12.5px] font-semibold text-white/60 underline decoration-white/30 underline-offset-4 hover:decoration-white disabled:no-underline"
            >
              {requestRef} ·
            </button>
            <span className="text-[14px] font-extrabold text-brand">{bidCount}</span>
            <span className="text-[12.5px] font-semibold text-white/60">
              {bidCount === 1 ? t.workspace.bidWord : t.workspace.bidsWord}
            </span>
            {raised && <span className="ms-2.5 text-[10.5px] font-medium text-white/40">{raised}</span>}
          </div>

          {/* Item chips — only when the request holds more than one, since a single item is already
              named in full on the white card. */}
          {items.length > 1 && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {items.map((it) => {
                const on = it.id === item?.id;
                const label = it.item ? (ar ? it.item.nameAr || it.item.name : it.item.name) : it.displayId;
                return (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => onPickItem(it.id)}
                    aria-current={on ? "true" : undefined}
                    className={`max-w-[190px] truncate rounded-full px-2.5 py-1 text-[11px] font-bold transition ${
                      on ? "bg-white text-navy" : "bg-white/10 text-white/70 hover:bg-white/20"
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

        {/* ── The item, and what the REQUEST asks of it ─────────────────────────────────────────
            This half is the request, and only the request (owner, 2026-08-25): the machine asked
            for, when it starts, how long, how many, and the certificates it requires. It does NOT
            change with the picked bid — what a supplier offered, and whether his papers or his yard
            have been checked, are answers, and they belong on the cards, in the comparison and on
            the map that «Check availability» opens. Reading a supplier’s verification here made the
            request line say something about the request that the request never said. */}
        <div className="flex min-w-0 flex-1 flex-col gap-3 rounded-[10px] bg-surface p-2 sm:flex-row sm:items-center sm:gap-3 sm:pe-3">
          {/* The thumbnail carries the state of the picked machine: a ribbon naming it, and a tick
              once the supplier has put it in a yard he confirmed. Nothing picked, nothing claimed. */}
          <span className="relative grid h-[46px] w-16 flex-none place-items-center overflow-hidden rounded-[7px] border border-border bg-surface2">
            {photo ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={photo} alt="" className="h-full w-full object-cover" />
            ) : (
              <Icon name="precision_manufacturing" size={20} className="text-muted" />
            )}
            {bid && (
              <>
                <span
                  className={`absolute inset-x-0 bottom-0 truncate px-1 py-[2px] text-center text-[8px] font-extrabold uppercase tracking-wide text-white ${
                    confirmed ? "bg-ok/90" : "bg-navy/80"
                  }`}
                >
                  {confirmed ? t.workspace.ribbonConfirmed : t.workspace.ribbonUnconfirmed}
                </span>
                {confirmed && (
                  <span className="absolute -end-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-ok text-white ring-2 ring-surface">
                    <Icon name="check" size={10} />
                  </span>
                )}
              </>
            )}
          </span>

          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-bold leading-snug text-navy">{itemLabel}</div>

            {bid ? (
              /* What the picked supplier put against it, and whether the machine behind it has been
                 checked. Both are HIS answers — the request's own chips take this line back the
                 moment nothing is picked. */
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <span className="flex-none text-[11px] font-semibold text-muted">
                  {t.workspace.offers.replace("{supplier}", bid.supplierName)}
                </span>
                <span className="flex-none text-[12px] font-extrabold text-navy">
                  {offered ?? "—"}
                  {offeredYear ? ` · ${offeredYear}` : ""}
                </span>
                {/* `unitAvailability`'s rule and no other — the map's pins and the equipment list's
                    chips read the same function. An off-platform submission registers no machines at
                    all, so it says nothing: nobody was ever asked. */}
                {units.length > 0 && (
                  <span
                    className={`rounded-md border px-2 py-[3px] text-[11px] font-semibold ${
                      confirmed ? "border-ok/25 bg-ok-soft text-ok" : "border-border bg-surface2 text-navy-mid"
                    }`}
                  >
                    {confirmed ? t.workspace.availabilityConfirmed : t.workspace.availabilityNotChecked}
                  </span>
                )}
              </div>
            ) : (
              /* What the REQUEST asks for. Drawer-only until now, which made the renter open a panel
                 to recall what he had asked for. Nothing here is derived — a chip is a requirement,
                 and one invented from `rentalType` would be a claim the request never made. */
              (startsOn || item?.durationDays || certs.length > 0 || unitCount > 1 || withOperator) && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {startsOn && <Chip>{fmt(t.workspace.chipStarts, { date: startsOn })}</Chip>}
                  {item?.durationDays ? (
                    <Chip tone="duration" lead={t.workspace.factDuration}>
                      {fmt(t.workspace.chipDuration, { n: String(item.durationDays) })}
                    </Chip>
                  ) : null}
                  {unitCount > 1 && <Chip>{fmt(t.workspace.unitsCount, { n: String(unitCount) })}</Chip>}
                  {withOperator && <Chip>{t.workspace.chipOperator}</Chip>}
                  {/* The certificates the request REQUIRES — the papers a supplier must hold to
                      answer it. Two, then a count; the drawer lists them in full. */}
                  {certs.slice(0, 2).map((c) => (
                    <Chip key={c} tone="cert">
                      {ar ? CERT_LABEL[c].ar : CERT_LABEL[c].en}
                    </Chip>
                  ))}
                  {certs.length > 2 && (
                    <span className="text-[11px] font-semibold text-muted">
                      {fmt(t.workspace.chipMore, { n: String(certs.length - 2) })}
                    </span>
                  )}
                </div>
              )
            )}
          </div>

          {/* ── The two ways into the picked bid (owner's reference, 2026-08-25) ─────────────────
              «Review equipment» opens the machines on the map, where availability is answered in
              full; «View documents» opens the same surface on the papers. Both need a bid to point
              at, so they read as inert until one is picked. */}
          <div className="flex flex-none flex-col gap-1.5">
            <button
              type="button"
              disabled={!bid}
              onClick={() => goEquipment()}
              className={`whitespace-nowrap rounded-[7px] px-3 py-2 text-[12px] font-bold transition ${
                bid ? "bg-navy text-white hover:brightness-110" : "cursor-default bg-surface2 text-muted"
              }`}
            >
              {t.workspace.reviewEquipment}
            </button>
            <button
              type="button"
              disabled={!bid}
              onClick={() => goEquipment("documents")}
              className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[7px] border px-3 py-2 text-[12px] font-bold transition ${
                bid ? "border-border bg-surface text-navy hover:bg-surface2" : "cursor-default border-border/60 bg-surface2 text-muted"
              }`}
            >
              <Icon name="visibility" size={14} /> {t.workspace.viewDocuments}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * One fact about the request, on the white card.
 *
 * Three tones and no more: the neutral one for a plain fact — when it starts, how many — `duration`
 * for the window, which is the fact every figure below is measured over and so carries its own
 * label, and `cert` for a certificate, the only chip here naming something a supplier can FAIL to
 * hold. Colouring the others would make a start date look like a requirement to meet.
 */
function Chip({ children, tone = "plain", lead }: { children: ReactNode; tone?: "plain" | "cert" | "duration"; lead?: string }) {
  const skin =
    tone === "cert"
      ? "border-brand/25 bg-brand-soft text-brand font-bold"
      : tone === "duration"
        ? "border-info/25 bg-info-soft text-info font-extrabold"
        : "border-border bg-surface2 text-navy-mid font-semibold";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-[5px] text-[10.5px] ${skin}`}>
      {lead && <span className="text-[8px] font-bold uppercase tracking-[.08em] opacity-70">{lead}</span>}
      {children}
    </span>
  );
}
