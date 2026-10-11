"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchBids } from "@/lib/api/client";
import { fmt, useLocale, useT } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import { cx, PAGE_X } from "@/lib/ds";
import { pin } from "@/lib/uiPins";
import { CircleArt } from "@/components/workspace/CircleArt";
import { BidCards, type BidCardGroup, type BidContext, type BidSubject } from "@/components/workspace/BidCards";
import { railMachines, type RailMachine, type WorkspaceBid } from "@/lib/contract/workspace";
import type { RequestGroup } from "@/lib/contract/requests";
import { supplierRuns, type SupplierEntry } from "@/lib/contract/suppliers-view";

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

/** The «Suppliers» tile at the END of the request rail: the newest bidders' marks, stacked. */
export function SuppliersTile({ suppliers, onPress }: { suppliers: SupplierEntry[]; onPress: () => void }) {
  const t = useT();
  const faces = suppliers.slice(0, 3);
  return (
    <button {...pin("rail-suppliers-tile")} type="button" onClick={onPress} className="group flex flex-none flex-col items-center gap-1">
      <span className="relative h-14 w-14 rounded-full bg-surface">
        {faces.map((s, i) => (
          <span
            key={s.key}
            className={cx(
              "absolute grid h-6 w-6 place-items-center overflow-hidden rounded-full border border-surface bg-surface2 text-label font-semibold text-navy",
              i === 0 ? "start-1.5 top-2" : i === 1 ? "end-1.5 top-2" : "start-4 bottom-1.5",
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
        <Ring active={false} />
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
  /** The request on screen before the switch, drawn on the «Requests» tile. */
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
                className={cx("flex max-w-[104px] flex-none flex-col items-center gap-1 text-center transition", active ? "" : "opacity-[.55]")}
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
          <span className="relative grid h-14 w-14 place-items-center rounded-full">
            <span className="grid h-[52px] w-[52px] place-items-center overflow-hidden rounded-full bg-photo-ground">
              <CircleArt
                machines={requestMachines}
                fallback={requestMachines.find((m) => m.url)?.url ?? null}
                fallbackIsPhoto={requestMachines.find((m) => m.url)?.isPhoto ?? false}
                onBroken={() => {}}
              />
            </span>
            <Ring active={false} />
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
  unreadByBid,
  onOpenRequest,
}: {
  supplier: SupplierEntry;
  groups: RequestGroup[];
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
        setCards(lists.flat().filter((c) => mine.has(c.id)).map((card) => ({ card, source: "app" as const })));
      });
    return () => { live = false; };
  }, [supplier]);

  const subjectByBid: Record<string, BidSubject> = {};
  const contextByBid: Record<string, BidContext> = {};
  for (const r of runs) {
    for (const { bidId, item } of r.bids) {
      const name = item?.item ? (ar ? item.item.nameAr || item.item.name : item.item.name) : item?.displayId ?? "—";
      subjectByBid[bidId] = {
        name,
        imageUrl: item?.item?.imageUrl ?? null,
        imageIsPhoto: item?.item?.imageIsPhoto ?? false,
        // A lone bid names its request on its second line; inside a panel the header does.
        line: r.bids.length === 1 ? r.group?.locationLabel ?? null : null,
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
      header: r.bids.length > 1 && r.group ? <RunHeader group={r.group} count={r.bids.length} onOpen={() => onOpenRequest(r.group!.id)} /> : null,
      bidIds: r.bids.map((b) => b.bidId).filter((id) => have.has(id)),
    }))
    .filter((g) => g.bidIds.length > 0);

  const across = supplier.bids.length === 1
    ? t.workspace.supplierOneBid
    : fmt(t.workspace.supplierBidsAcross, { b: String(supplier.bids.length), r: String(supplier.requestCount) });

  return (
    <div className={`mx-auto w-full ${PAGE_X} mt-2 flex flex-col gap-3 pb-8`}>
      {/* ── The supplier card, where the request card stands in requests mode ─────────────────── */}
      <div className="flex items-center gap-3">
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
        {supplier.linkId && (
          <Link
            href={`/inbox?supplier=${encodeURIComponent(supplier.linkId)}`}
            className="control-lg inline-flex flex-none items-center gap-1.5 rounded-md border border-border bg-surface !px-3 text-meta font-semibold text-navy hover:border-navy-mid"
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
        <div className="rounded-md border border-border bg-surface">
          <BidCards
            bids={cards}
            checked={new Set()}
            unreadByBid={unreadByBid}
            submissionsByBid={{}}
            durationDays={null}
            startDate={null}
            subjectByBid={subjectByBid}
            contextByBid={contextByBid}
            groups={cardGroups}
            selectable={false}
            onToggle={() => {}}
          />
        </div>
      )}
    </div>
  );
}

/** A panel's header: a small request card, «One request · N bids», and the way to that request. */
function RunHeader({ group, count, onOpen }: { group: RequestGroup; count: number; onOpen: () => void }) {
  const t = useT();
  const { locale } = useLocale();
  const ar = locale === "ar";
  const machines = railMachines(group, ar);
  const shown = machines.slice(0, 3);
  const rest = machines.length - shown.length;
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2.5">
      <span className="grid h-8 w-8 flex-none place-items-center overflow-hidden rounded-full bg-photo-ground">
        <CircleArt
          machines={machines}
          fallback={machines.find((m) => m.url)?.url ?? null}
          fallbackIsPhoto={machines.find((m) => m.url)?.isPhoto ?? false}
          onBroken={() => {}}
          size={32}
        />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-meta font-extrabold text-navy">{group.locationLabel}</span>
          <span className="flex-none rounded-full bg-surface px-2 text-label font-semibold text-navy">
            {fmt(t.workspace.oneRequestBids, { n: String(count) })}
          </span>
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-label font-semibold text-muted">
          {shown.map((m, i) => (
            <Fragment key={m.id}>
              {i > 0 && <span className="flex-none text-muted-light" aria-hidden="true">·</span>}
              <span className="min-w-0 max-w-[150px] truncate">
                {m.typeName}
                {m.qty > 1 && <span className="tabular text-muted-light"> ×{m.qty}</span>}
              </span>
            </Fragment>
          ))}
          {rest > 0 && (
            <span className="tabular flex-none whitespace-nowrap font-extrabold text-brand-deep">
              {t.workspace.chipMore.replace("{n}", String(rest))}
            </span>
          )}
        </span>
      </span>
      <button type="button" onClick={onOpen} className="ms-auto flex-none whitespace-nowrap text-label font-semibold text-navy-mid underline underline-offset-2 hover:text-navy">
        {t.workspace.openRequest} ›
      </button>
    </div>
  );
}
