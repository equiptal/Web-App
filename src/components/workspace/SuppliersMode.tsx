"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchBids } from "@/lib/api/client";
import { fmt, useLocale, useT } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import { btn, cx, PAGE_MAX, PAGE_X } from "@/lib/ds";
import { pin } from "@/lib/uiPins";
import { BidCards, type BidCardGroup, type BidContext, type BidSubject } from "@/components/workspace/BidCards";
import type { RailMachine, WorkspaceBid } from "@/lib/contract/workspace";
import type { RequestGroup } from "@/lib/contract/requests";
import { supplierRuns, type SupplierEntry } from "@/lib/contract/suppliers-view";
import { buildBidQuotationDoc, quotationSupplierInitials } from "@/lib/quotation/bid-quotation";
import { renderQuotationSection, wrapQuotationPage } from "@/lib/quotation/render";
import { fetchMeUser, openQuotationPage, quotationRentee } from "@/lib/quotation/open";
import { quotationDownloadName } from "@/lib/compare/quotation-token";
import { bidValidityPassed } from "@/lib/contract/bids";

/**
 * **Suppliers mode** (owner, 2026-10-11, multi-item decisions 4 and 5; `docs/multi-item-decisions.md`).
 *
 * The request rail's «Suppliers» tile, at its END, turns the top row into supplier circles and the
 * page under it into ONE supplier's bids across every request. The cards are the workspace's own,
 * same style and size, in the same horizontal row; only the card's top line names the MACHINE
 * instead of the supplier, since the supplier is the page. Bids on one submission sit in a
 * light-blue panel headed by that request.
 *
 * ⚠️ Platform bids only: a shared-link (offline) bid has no supplier account to group by.
 */

/** The 52px circle the rail's tiles draw, with the selected-circle ring (owner, 2026-10-11, V1). */
function Ring({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "pointer-events-none absolute inset-0 rounded-full",
        active ? "border-[2.5px] border-navy" : "border-[1.5px] border-border",
      )}
    />
  );
}

function initial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "?";
}

/** Where the three small circles of an action tile sit: two on top, one centred below. */
const FACE_SPOT = ["start-1 top-2", "end-1 top-2", "start-[14px] bottom-1"];

/** The orange ring of the rail's action tiles, «New», «Suppliers» and «Requests» (owner, 2026-10-12). */
function ActionRing() {
  return <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-full border-[1.5px] border-brand" />;
}

/** The «Suppliers» tile at the END of the request rail: the newest bidders' marks, stacked. */
export function SuppliersTile({ suppliers, onPress }: { suppliers: SupplierEntry[]; onPress: () => void }) {
  const t = useT();
  const faces = suppliers.slice(0, 3);
  return (
    <button {...pin("rail-suppliers-tile")} type="button" onClick={onPress} className="group flex flex-none flex-col items-center gap-1">
      {/* 52px, the request circles' own size. */}
      <span className="relative h-[52px] w-[52px] rounded-full bg-surface">
        {faces.map((s, i) => (
          <span
            key={s.key}
            className={cx(
              "absolute grid h-6 w-6 place-items-center overflow-hidden rounded-full border border-surface bg-surface2 text-label font-semibold text-navy",
              FACE_SPOT[i],
            )}
          >
            {s.logoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={s.logoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              initial(s.name)
            )}
          </span>
        ))}
        <ActionRing />
      </span>
      <span className="flex h-[22px] flex-col items-center text-label font-semibold leading-[13px] text-navy-mid group-hover:text-navy">
        {t.workspace.viewSuppliers}
      </span>
    </button>
  );
}

/** The top row in suppliers mode: one circle per supplier, newest first, and «Requests» at the end. */
export function SupplierRail({
  suppliers,
  activeKey,
  onPick,
  onRequests,
  requestMachines,
}: {
  suppliers: SupplierEntry[];
  activeKey: string | null;
  onPick: (key: string) => void;
  onRequests: () => void;
  /** Machines from the newest requests, drawn on the «Requests» tile as the Suppliers tile draws faces. */
  requestMachines: RailMachine[];
}) {
  const t = useT();
  return (
    /* The request rail's own band, so switching modes does not move a pixel of the page. */
    <div {...pin("supplier-rail")} className="flex-none">
      <div className={`flex h-[96px] select-none items-center gap-4 overflow-hidden border-b border-border bg-surface3/60 ${PAGE_X}`}>
        <div className="flex min-w-0 flex-1 items-center gap-4 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {suppliers.map((s) => {
            const active = s.key === activeKey;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => onPick(s.key)}
                aria-current={active ? "true" : undefined}
                title={s.name}
                className={cx("flex max-w-[104px] flex-none flex-col items-center gap-1 text-center transition", active ? "" : "opacity-80")}
              >
                <span className="relative grid h-14 w-14 flex-none place-items-center rounded-full">
                  <span className="grid h-[52px] w-[52px] place-items-center overflow-hidden rounded-full bg-surface text-body font-extrabold text-navy">
                    {s.logoUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={s.logoUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      initial(s.name)
                    )}
                  </span>
                  <Ring active={active} />
                  <span
                    className={cx(
                      "tabular absolute -end-px -top-px min-w-[19px] rounded-full border border-surface px-1 text-label font-semibold leading-[15px] text-white",
                      active ? "bg-navy" : "bg-muted",
                    )}
                  >
                    {s.bids.length}
                  </span>
                </span>
                <span className="flex h-[22px] flex-col items-center">
                  <span className={cx("max-w-[104px] truncate text-label font-semibold leading-[13px]", active ? "text-navy" : "text-navy-mid")}>
                    {s.name}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <button {...pin("rail-requests-tile")} type="button" onClick={onRequests} className="group flex flex-none flex-col items-center gap-1">
          {/* One fixed picture (owner, 2026-10-12): three machines in small circles, stacked the way
              the «Suppliers» tile stacks faces. ~~The request on screen before the switch~~, which
              changed with every pick and read as one more request rather than the way back. */}
          <span className="relative h-[52px] w-[52px] rounded-full bg-surface">
            {requestMachines.slice(0, 3).map((m, i) => (
              <span
                key={`${m.id}-${i}`}
                className={cx(
                  "absolute grid h-6 w-6 place-items-center overflow-hidden rounded-full border border-surface bg-photo-ground",
                  FACE_SPOT[i],
                )}
              >
                {m.url && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={m.url} alt="" className={cx("h-full w-full", m.isPhoto ? "object-cover" : "scale-[1.34] object-contain")} />
                )}
              </span>
            ))}
            <ActionRing />
          </span>
          <span className="flex h-[22px] flex-col items-center text-label font-semibold leading-[13px] text-navy-mid group-hover:text-navy">
            {t.workspace.viewRequests}
          </span>
        </button>
      </div>
    </div>
  );
}

/** One supplier's bids across every request, grouped per submission. */
export function SuppliersView({
  supplier,
  groups,
  verified,
  unreadByBid,
  onOpenRequest,
}: {
  supplier: SupplierEntry;
  groups: RequestGroup[];
  /** The renter's tier is `verified`, for the quotation's letterhead. */
  verified: boolean;
  unreadByBid: Record<string, number>;
  onOpenRequest: (groupId: string) => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const ar = locale === "ar";
  const runs = useMemo(() => supplierRuns(supplier, groups), [supplier, groups]);

  /* His cards, the workspace's own `BidCard`s: one read per machine he bid on, filtered to his bids.
     `true` asks for larger-size bids too, so none of his is left out by the size filter. */
  const [cards, setCards] = useState<WorkspaceBid[] | null>(null);
  useEffect(() => {
    let live = true;
    setCards(null);
    const mine = new Set(supplier.bids.map((b) => b.bidId));
    const itemIds = [...new Set(supplier.bids.map((b) => b.request.id))];
    Promise.all(itemIds.map((id) => fetchBids(id, true).then((r) => r.bids).catch(() => [])))
      .then((lists) => {
        if (!live) return;
        // Past its validity date: not shown, as in requests mode and the app (`bidValidityPassed`).
        setCards(lists.flat().filter((c) => mine.has(c.id) && !bidValidityPassed(c)).map((card) => ({ card, source: "app" as const })));
      });
    return () => { live = false; };
  }, [supplier]);

  /* Ticks, as in requests mode: the download covers the ticked bids, else all of his. A new
     supplier starts with none. */
  const [checked, setChecked] = useState<Set<string>>(new Set());
  useEffect(() => setChecked(new Set()), [supplier]);
  const toggle = useCallback((bidId: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (!next.delete(bidId)) next.add(bidId);
      return next;
    });
  }, []);

  const subjectByBid: Record<string, BidSubject> = {};
  const contextByBid: Record<string, BidContext> = {};
  for (const r of runs) {
    for (const { bidId, item } of r.bids) {
      const name = item?.item ? (ar ? item.item.nameAr || item.item.name : item.item.name) : item?.displayId ?? "—";
      subjectByBid[bidId] = {
        name,
        imageUrl: item?.item?.imageUrl ?? null,
        imageIsPhoto: item?.item?.imageIsPhoto ?? false,
      };
      if (item) {
        contextByBid[bidId] = {
          durationDays: item.durationDays ?? null,
          startDate: item.startDate ?? null,
          mobByRentee: item.mobByRentee ?? null,
          demobByRentee: item.demobByRentee ?? null,
        };
      }
    }
  }
  const have = new Set((cards ?? []).map((c) => c.card.id));
  const cardGroups: BidCardGroup[] = runs
    .map((r) => ({
      key: r.key,
      header: r.bids.length > 1 && r.group ? <RunHeader count={r.bids.length} onOpen={() => onOpenRequest(r.group!.id)} /> : null,
      bidIds: r.bids.map((b) => b.bidId).filter((id) => have.has(id)),
    }))
    .filter((g) => g.bidIds.length > 0);

  /**
   * **His quotation, one section per REQUEST** (owner, 2026-10-12: the download stays in suppliers
   * mode). The paper and its builders are requests mode's own (`downloadQuotation`); what differs is
   * the cut. There it is one section per supplier on one request; here the supplier is fixed and the
   * bids span requests, so each request gets its own section with its own reference and site.
   * ⚠️ Transport legs come off the request list (`mobByRentee`), not the detail record requests mode
   * re-reads, to avoid one detail call per machine.
   */
  const downloadQuotation = useCallback(async () => {
    if (!cards) return;
    const byId = new Map(cards.map((c) => [c.card.id, c.card]));
    const u = await fetchMeUser();
    const rentee = quotationRentee(u, verified, ar);
    const codes: string[] = [];
    const sections = runs
      .map((r) => {
        const entries = r.bids
          .filter((b) => byId.has(b.bidId) && (checked.size === 0 || checked.has(b.bidId)))
          .map(({ bidId, item }) => {
            const code = item?.code ?? item?.displayId ?? "";
            codes.push(code);
            return {
              bid: byId.get(bidId)!,
              itemLabel: item?.item ? (ar ? item.item.nameAr || item.item.name : item.item.name) : code,
              requestCode: code,
              startDate: item?.startDate ?? null,
              endDate: item?.endDate ?? null,
              durationDays: item?.durationDays ?? null,
              rentalType: item?.rentalType ?? null,
              mobByRentee: item?.mobByRentee ?? null,
              demobByRentee: item?.demobByRentee ?? null,
            };
          });
        return { r, entries };
      })
      .filter((s) => s.entries.length > 0)
      .map(({ r, entries }, si) => {
        const reference = entries[0].requestCode;
        return renderQuotationSection(
          buildBidQuotationDoc({
            lang: ar ? "ar" : "en",
            quotationNumber: `Q-${reference.replace(/[^A-Za-z0-9-]/g, "")}-${quotationSupplierInitials(supplier.name)}${si + 1}`,
            reference,
            workSite: r.group?.locationLabel ?? null,
            sealUrl: `${window.location.origin}/moedatech-logomark.svg`,
            supplierLogoUrl: supplier.logoUrl,
            entries,
            rentee,
          }),
        );
      });
    if (sections.length === 0) return;
    const dlName = quotationDownloadName(codes[0], codes);
    const html = wrapQuotationPage(sections.join(""), {
      lang: ar ? "ar" : "en",
      title: dlName,
      autoPrint: false,
      tools: { download: ar ? "تنزيل PDF" : "Download PDF", share: ar ? "مشاركة" : "Share", fileName: dlName },
    });
    openQuotationPage(html, dlName);
  }, [cards, runs, checked, supplier, verified, ar]);

  const across = supplier.bids.length === 1
    ? t.workspace.supplierOneBid
    : fmt(t.workspace.supplierBidsAcross, { b: String(supplier.bids.length), r: String(supplier.requestCount) });

  return (
    /* The same column as requests mode, so the cards start and end on the same lines. */
    <div className={`mx-auto w-full ${PAGE_MAX} ${PAGE_X} mt-2 flex flex-col gap-2 pb-8`}>
      {/* ── The supplier card, where the request card stands; the download and «All chats» on
          the trailing end, where requests mode keeps its download ─────────────────────────────── */}
      <div className="flex items-center gap-2">
        <div {...pin("supplier-card")} className="control-lg flex min-w-0 max-w-[35rem] items-center gap-2 rounded-md border border-navy bg-navy !px-3 text-white">
          <span className="grid h-8 w-8 flex-none place-items-center overflow-hidden rounded-full bg-surface text-label font-extrabold text-navy">
            {supplier.logoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={supplier.logoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              initial(supplier.name)
            )}
          </span>
          <span className="flex min-w-0 flex-col gap-1">
            <span className="truncate text-meta font-semibold leading-[15px]">{supplier.name}</span>
            <span className="truncate text-label font-semibold leading-[13px] text-white/60">{across}</span>
          </span>
        </div>
        <span className="flex-1" aria-hidden />
        <button
          type="button"
          disabled={!cards || cards.length === 0}
          onClick={() => void downloadQuotation()}
          className={btn("secondary", "md", { className: "whitespace-nowrap transition" })}
        >
          {t.workspace.downloadQuotation}
          {checked.size > 0 && (
            <span className="rounded-full bg-navy px-1.5 text-label font-semibold leading-[18px] text-white">{checked.size}</span>
          )}{" "}
          <Icon name="download" size={14} />
        </button>
        {supplier.linkId && (
          <Link
            href={`/inbox?supplier=${encodeURIComponent(supplier.linkId)}`}
            className={btn("secondary", "md", { className: "whitespace-nowrap transition" })}
          >
            <Icon name="chat_bubble_outline" size={16} />
            {t.workspace.supplierChat}
          </Link>
        )}
      </div>

      {cards == null ? (
        <div className="grid min-h-[220px] place-items-center">
          <Icon name="progress_activity" size={28} className="animate-spin text-muted" />
        </div>
      ) : cardGroups.length === 0 ? (
        <p className="py-12 text-center text-body font-semibold text-muted">{t.workspace.supplierNoBids}</p>
      ) : (
        <div className="rounded-sm border border-border bg-surface">
          <BidCards
            bids={cards}
            checked={checked}
            unreadByBid={unreadByBid}
            submissionsByBid={{}}
            durationDays={null}
            startDate={null}
            subjectByBid={subjectByBid}
            contextByBid={contextByBid}
            groups={cardGroups}
            onToggle={toggle}
          />
        </div>
      )}
    </div>
  );
}

/**
 * A panel's header, ONE line (owner, 2026-10-12): «One request · N bids ›», pressing it opens the
 * request. ~~A small request card with its site, its machines and «Open the request ›»~~: it pushed
 * every card in the row down and named again what the cards under it already say.
 */
function RunHeader({ count, onOpen }: { count: number; onOpen: () => void }) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onOpen}
      className="inline-flex items-center gap-0.5 whitespace-nowrap text-label font-semibold text-navy hover:text-navy-mid"
    >
      {fmt(t.workspace.oneRequestBids, { n: String(count) })}
      <Icon name="chevron_right" size={14} className="rtl:rotate-180" />
    </button>
  );
}
