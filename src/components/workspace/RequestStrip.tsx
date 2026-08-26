"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { fmt, useLocale, useT } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import { PAGE_MX_BLEED } from "@/components/AppShell";
import { publicTaxonomyUrl, type RequestGroup, type RequestListItem } from "@/lib/contract/requests";
import { CERT_LABEL, offeredFrontPhotoUrl, type BidCard } from "@/lib/contract/bids";
import { unitAvailability } from "@/lib/contract/bid-map";

/**
 * The dark strip under the rail. Two halves, and they answer different questions.
 *
 * The left half names the **request**: where the work is, its id, how many bids arrived, when it was
 * raised. Both the site and the id open the request drawer.
 *
 * The middle is a white card carrying the **item**, and — once a bid is picked — that supplier's
 * answer to it: the machine offered, and whether a yard has been confirmed for it. With nothing
 * picked the card states what the REQUEST asks instead, so it is never blank and never mixes an ask
 * with an answer.
 *
 * The two controls stand on the NAVY at the trailing edge, outside the card: they act on the picked
 * bid rather than describing it, and out there they hold the same place whatever the card is saying.
 */
export function RequestStrip({
  group,
  item,
  items,
  bid,
  bidCount,
  onPickItem,
  onOpenRequest,
  fetchedCode,
}: {
  group: RequestGroup;
  item: RequestListItem | null;
  items: RequestListItem[];
  /** The bid the page is focused on — null while none has arrived or none is chosen. */
  bid: BidCard | null;
  bidCount: number;
  onPickItem: (itemId: string) => void;
  /** Opens the request drawer. */
  onOpenRequest: (() => void) | null;
  /** The request's own code, fetched from its detail record when the list row arrived without one. */
  fetchedCode?: string | null;
}) {
  const t = useT();
  const { locale } = useLocale();
  const ar = locale === "ar";
  const router = useRouter();

  /**
   * What the renter calls this request: the submission's RFQ code, else the request's own REQ code —
   * and NOTHING at all where neither exists.
   *
   * It used to fall through to the internal id and print «CEXG7K2P», the head of a cuid: a string
   * every request begins the same way and nobody can quote down the phone. Silence is the honest
   * state, and the workspace goes and asks the detail record for the real code first (`fetchedCode`),
   * because `GET /marketplace/my-requests` does not carry it while creation does.
   */
  const requestRef = group.groupRef ?? item?.code ?? fetchedCode ?? null;
  const raised = group.createdAt
    ? new Date(group.createdAt).toLocaleDateString(ar ? "ar" : "en-GB", { day: "numeric", month: "short", year: "numeric" })
    : null;
  const itemLabel = item?.item ? (ar ? item.item.nameAr || item.item.name : item.item.name) : "—";
  /**
   * The supplier's own photograph of the machine, not a drawing of its category (owner, 2026-08-26).
   *
   * Four sources in falling order of how much they actually say about THIS machine: the front shot
   * the supplier uploaded against the offered unit, the equipment record's primary photo, the
   * taxonomy artwork for the item's type, and — inside the tile — an icon. A renter reading a bid is
   * asking what he is being sent, and a stock excavator cannot answer that; a stock excavator under
   * a «CONFIRMED» ribbon comes close to claiming it has.
   */
  const photo =
    offeredFrontPhotoUrl(bid?.offeredUnitsDetail) ??
    bid?.equipment?.imageUrl ??
    publicTaxonomyUrl(item?.item?.imageUrl ?? null);

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


  /**
   * The submission's OTHER machines. A multi-item RFQ fans out into one request per machine and this
   * page shows one at a time, so the rest are a row of chips beside the one on screen — never the one
   * already named there, which would be a chip that changes nothing.
   */
  const siblings = items.filter((it) => it.id !== item?.id);
  const hidden = siblings.slice(SIBLINGS_SHOWN);
  const [moreOpen, setMoreOpen] = useState(false);

  const goEquipment = (panel?: "documents") => {
    if (!bid) return;
    router.push(`/bids/${encodeURIComponent(bid.id)}/equipment${panel ? "?panel=documents" : ""}`);
  };

  return (
    <div className={`${PAGE_MX_BLEED} mt-2 flex-none`}>
      {/* ── The request header, as the owner's reference draws it (2026-08-26) ────────────────────
          ONE white card, with the request itself as a navy block inset at its leading edge. It was
          the other way round — a navy strip with a white card floating in it — which spent the
          brightest surface on the chrome and left the machine, the offer and the controls sharing a
          panel inside it. The card is the subject now; the navy names what it belongs to. */}
      <div className="flex items-stretch gap-3 rounded-[14px] bg-surface p-1.5 shadow-[0_2px_10px_rgba(19,44,74,.07)]">
        {/* ── The request ── */}
        <div className="flex flex-none flex-col justify-center gap-1 rounded-[11px] bg-navy px-4 py-2.5 text-white">
          <button
            type="button"
            onClick={onOpenRequest ?? undefined}
            disabled={!onOpenRequest}
            className="flex items-center gap-1.5 text-start text-[15px] font-extrabold leading-tight tracking-[-.01em] underline-offset-4 hover:underline disabled:no-underline"
            title={group.address ?? group.locationLabel}
          >
            {group.locationLabel}
            <Icon name="north_east" size={14} className="flex-none text-white/50 rtl:scale-x-[-1]" />
          </button>
          <div className="flex flex-wrap items-baseline gap-1.5">
            {requestRef && (
              <button
                type="button"
                onClick={onOpenRequest ?? undefined}
                disabled={!onOpenRequest}
                className="text-[11.5px] font-semibold text-white/60 underline decoration-white/30 underline-offset-4 hover:decoration-white disabled:no-underline"
              >
                {requestRef}
              </button>
            )}
            <span className="text-[11.5px] font-semibold text-white/35">·</span>
            <span className="text-[12px] font-extrabold text-brand">
              {bidCount} {bidCount === 1 ? t.workspace.bidWord : t.workspace.bidsWord}
            </span>
            {raised && (
              <>
                <span className="text-[11.5px] font-semibold text-white/35">·</span>
                <span className="text-[11px] font-medium text-white/45">{raised}</span>
              </>
            )}
          </div>
        </div>

        {/* ── The thumbnail says two different things at once ──────────────────────────────────────
            The RIBBON is availability — has the supplier named a yard for this machine — and the TICK
            is the papers (`eqVerified`, whether the listing was checked). Separate facts, drawn
            separately, which is why a machine can carry a green tick under an UNCONFIRMED ribbon. The
            ribbon reads in full: half a word is worse than none on the one state a renter must not
            misread.

            It was set at 6.5px to make «UNCONFIRMED» fit, which is not a size — it is roughly a 4px
            cap height, and this is a fact the renter is being asked to act on. 8px is the app's own
            floor and the word still fits: eleven uppercase characters at ~5.3px of advance is 58px
            inside a 70px tile. The rule was «read in full»; the way to keep it was to measure, not
            to shrink until it happened to go in. */}
        <span className="relative my-1 grid h-12 w-[70px] flex-none place-items-center overflow-hidden rounded-[8px] border border-border bg-surface2">
          {photo ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={photo} alt="" className="h-full w-full object-cover" />
          ) : (
            <Icon name="precision_manufacturing" size={20} className="text-muted" />
          )}
          {bid && (
            <>
              <span
                className={`absolute inset-x-0 bottom-0 whitespace-nowrap px-0.5 py-[2px] text-center text-[8px] font-extrabold uppercase tracking-[.03em] text-white ${
                  confirmed ? "bg-ok/90" : "bg-navy/85"
                }`}
              >
                {confirmed ? t.workspace.ribbonConfirmed : t.workspace.ribbonUnconfirmed}
              </span>
              {bid.eqVerified && (
                <span
                  className="absolute -end-1 -top-1 grid h-[15px] w-[15px] place-items-center rounded-full bg-ok text-white ring-2 ring-surface"
                  title={t.bidMap.eqVerifiedMachine}
                >
                  <Icon name="check" size={10} />
                </span>
              )}
            </>
          )}
        </span>

        {/* ── The item, and the offer against it ── */}
        <div className="flex min-w-0 flex-1 flex-col justify-center">
          <div className="truncate text-[15px] font-extrabold leading-tight text-navy">{itemLabel}</div>

          {bid ? (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="flex-none text-[12px] font-semibold text-muted">
                {t.workspace.offers.replace("{supplier}", bid.supplierName)}
              </span>
              <span className="flex-none text-[12.5px] font-extrabold text-navy">
                {offered ?? "—"}
                {offeredYear ? ` · ${offeredYear}` : ""}
              </span>
              {/* `unitAvailability`'s rule and no other — the map's pins and the equipment list's chips
                  read the same function. An off-platform submission registers no machines at all, so
                  it says nothing: nobody was ever asked. */}
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
            /* What the REQUEST asks for, while no bid is picked. Nothing here is derived — a chip is a
               requirement, and one invented from `rentalType` would be a claim it never made. */
            (startsOn || item?.durationDays || certs.length > 0 || unitCount > 1 || withOperator) && (
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {startsOn && <Chip>{fmt(t.workspace.chipStarts, { date: startsOn })}</Chip>}
                {item?.durationDays ? (
                  <Chip tone="duration" lead={t.workspace.factDuration}>
                    {fmt(t.workspace.chipDuration, { n: String(item.durationDays) })}
                  </Chip>
                ) : null}
                {unitCount > 1 && <Chip>{fmt(t.workspace.unitsCount, { n: String(unitCount) })}</Chip>}
                {withOperator && <Chip>{t.workspace.chipOperator}</Chip>}
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

        {/* ── The rest of the submission, beside the machine it is not (owner, 2026-08-26) ──────────
            A multi-item RFQ fans out into one request per machine, and this page shows ONE of them at
            a time. The siblings used to sit under the request as pills on the navy, which read as
            facts about the request rather than as the other machines in it. Beside the name they read
            as what they are: the rest of the submission, one press away.

            Three at most, then «+n» opens the remainder — a row that grows with the RFQ pushes the
            controls off the end of the card, and a chip nobody can reach is not a chip. */}
        {siblings.length > 0 && (
          <div className="relative flex flex-none items-center gap-1.5 self-center">
            {siblings.slice(0, SIBLINGS_SHOWN).map((it) => (
              <SiblingChip key={it.id} item={it} ar={ar} onPick={() => onPickItem(it.id)} />
            ))}
            {hidden.length > 0 && (
              <button
                type="button"
                onClick={() => setMoreOpen((o) => !o)}
                aria-expanded={moreOpen}
                aria-label={fmt(t.workspace.chipMore, { n: String(hidden.length) })}
                className="flex-none rounded-full border border-brand/25 bg-brand-soft px-2.5 py-1.5 text-[11.5px] font-extrabold text-brand transition hover:brightness-95"
              >
                +{hidden.length}
              </button>
            )}
            {moreOpen && hidden.length > 0 && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMoreOpen(false)} />
                <div className="absolute end-0 top-[calc(100%+8px)] z-50 flex min-w-[190px] flex-col gap-1.5 rounded-[14px] border border-border bg-surface p-2.5 shadow-[0_14px_34px_rgba(19,44,74,.18)]">
                  {hidden.map((it) => (
                    <SiblingChip
                      key={it.id}
                      item={it}
                      ar={ar}
                      block
                      onPick={() => {
                        setMoreOpen(false);
                        onPickItem(it.id);
                      }}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── The two ways into the picked bid ─────────────────────────────────────────────────────
            «Review equipment» opens the machines on the map, where availability is answered in full;
            «View documents» opens that same surface on the papers. Both need a bid to point at, so
            they read as inert until one is picked. */}
        <div className="flex w-[152px] flex-none flex-col justify-center gap-1.5 pe-1">
          <button
            type="button"
            disabled={!bid}
            onClick={() => goEquipment()}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] font-bold transition ${
              bid ? "bg-navy text-white hover:bg-navy-mid" : "cursor-default bg-navy/25 text-white/70"
            }`}
          >
            {t.workspace.reviewEquipment}
          </button>
          <button
            type="button"
            disabled={!bid}
            onClick={() => goEquipment("documents")}
            className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-[11px] font-bold transition ${
              bid ? "border-border bg-surface text-navy hover:bg-surface2" : "cursor-default border-border/60 bg-surface text-navy/35"
            }`}
          >
            <Icon name="visibility" size={13} /> {t.workspace.viewDocuments}
          </button>
        </div>
      </div>
    </div>
  );
}

/** How many of the submission's other machines stand on the card before «+n» takes the rest. */
const SIBLINGS_SHOWN = 3;

/**
 * One of the submission's OTHER machines. Pressing it makes it the one the page is showing.
 *
 * It carries the machine's full name and its count — «Flatbed Truck ×3» — because that is what tells
 * two lines of one RFQ apart; an abbreviated chip would need opening to identify.
 */
function SiblingChip({
  item,
  ar,
  block,
  onPick,
}: {
  item: RequestListItem;
  ar: boolean;
  /** In the «+n» panel the chips stack, so each takes the full width rather than shrinking to fit. */
  block?: boolean;
  onPick: () => void;
}) {
  const label = item.item ? (ar ? item.item.nameAr || item.item.name : item.item.name) : item.displayId;
  const qty = item.item?.qty ?? 1;
  return (
    <button
      type="button"
      onClick={onPick}
      title={label}
      className={`truncate rounded-full border border-border bg-surface2 px-3 py-1.5 text-[11.5px] font-bold text-navy-mid transition hover:border-navy-mid hover:bg-surface3 ${
        block ? "w-full text-center" : "max-w-[150px] flex-none"
      }`}
    >
      {label}
      {qty > 1 && <span className="text-muted"> ×{qty}</span>}
    </button>
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
