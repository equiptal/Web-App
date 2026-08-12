"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { Icon } from "@/components/ui";
import { SignInPrompt } from "@/components/common/SignInPrompt";
import { fetchAllMyRequests, fetchBids, fetchReceivedBids, fetchRequestSubmissions } from "@/lib/api/client";
import { groupRequests, type RequestGroup } from "@/lib/contract/requests";
import { submissionToBidCard, type LinkBidSubmission } from "@/lib/contract/link-bids";
import {
  EMPTY_SELECTION,
  filterBySource,
  railTiles,
  resolveSelection,
  selectedGroup,
  selectedItem,
  sourceCounts,
  type SourceFilter,
  type WorkspaceBid,
  type WorkspaceSelection,
} from "@/lib/contract/workspace";
import { RequestRail } from "@/components/workspace/RequestRail";
import { RequestStrip } from "@/components/workspace/RequestStrip";
import { BidCards } from "@/components/workspace/BidCards";
import { CompareMatrix } from "@/components/workspace/CompareMatrix";

type Tab = "cards" | "compare";

/**
 * The requests workspace — one page for every request, its items and its bids, replacing the old
 * list / detail / comparison trio (docs/implementation-plans/requests-workspace/plan.md).
 *
 * This is phase 1: the rail, the strip, the tabs and the selection that drives them. The two panes
 * arrive with phases 2 (cards) and 3 (compare).
 *
 * **Selection is never trusted, only resolved.** The three choices are held as ids, and
 * `resolveSelection` re-reads them against the data on every render — so a request that closed, an
 * item that belongs to another group, or a bid from the item you just left can never be what the
 * page is showing. Nothing here has to remember to clean up after a change.
 */
export function RequestsWorkspace() {
  const t = useT();
  const { status } = useSession();

  const [groups, setGroups] = useState<RequestGroup[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [bids, setBids] = useState<WorkspaceBid[]>([]);
  // The submission behind each off-platform card, kept so its viewer has the original to show.
  const [submissionsByBid, setSubmissionsByBid] = useState<Record<string, LinkBidSubmission>>({});
  // Unread chat per bid. `fetchDealRoomUnread` is one global total for the Inbox badge; the per-bid
  // number lives on received-bids, which reads it out of Stream's own per-channel counts.
  const [unreadByBid, setUnreadByBid] = useState<Record<string, number>>({});
  const [wanted, setWanted] = useState<WorkspaceSelection>(EMPTY_SELECTION);
  const [tab, setTab] = useState<Tab>("cards");
  const [source, setSource] = useState<SourceFilter>("all");
  const [reloads, setReloads] = useState(0);

  // ── The renter's requests ──
  useEffect(() => {
    if (status !== "authed") return;
    let live = true;
    setFailed(false);
    fetchAllMyRequests()
      .then((r) => live && setGroups(groupRequests(r.requests)))
      .catch(() => {
        if (!live) return;
        setGroups([]);
        setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [status, reloads]);

  const resolved = useMemo(() => resolveSelection(groups ?? [], bids, wanted), [groups, bids, wanted]);
  const group = useMemo(() => selectedGroup(groups ?? [], resolved), [groups, resolved]);
  const item = useMemo(() => selectedItem(groups ?? [], resolved), [groups, resolved]);

  // ── The selected item's bids: those placed through the app, then those that arrived off it ──
  // Keyed on the item, so switching item drops the previous item's bids rather than showing them
  // against the wrong machine while the new ones load.
  const itemId = resolved.itemId;
  useEffect(() => {
    if (status !== "authed" || !itemId) {
      setBids([]);
      setSubmissionsByBid({});
      return;
    }
    let live = true;
    setBids([]);
    setSubmissionsByBid({});
    Promise.all([
      fetchBids(itemId).catch(() => ({ bids: [] })),
      fetchRequestSubmissions(itemId).catch(() => ({ submissions: [] as Awaited<ReturnType<typeof fetchRequestSubmissions>>["submissions"] })),
    ]).then(([app, link]) => {
      if (!live) return;
      // One card per item of a submission — an off-platform supplier can answer several lines of the
      // same RFQ in one go, and each line is its own offer to compare.
      const offline = link.submissions.flatMap((sub) =>
        (sub.items.length ? sub.items : [undefined]).map((it) => ({ bid: { card: submissionToBidCard(sub, it), source: "offline" } as WorkspaceBid, sub })),
      );
      setBids([...app.bids.map((card): WorkspaceBid => ({ card, source: "app" })), ...offline.map((o) => o.bid)]);
      setSubmissionsByBid(Object.fromEntries(offline.map((o) => [o.bid.card.id, o.sub])));
    });
    return () => {
      live = false;
    };
  }, [status, itemId]);

  // Unread is per bid across every request, so it is fetched once for the session rather than per
  // item — switching item does not change anyone's unread count.
  useEffect(() => {
    if (status !== "authed") return;
    let live = true;
    fetchReceivedBids()
      .then((r) => live && setUnreadByBid(Object.fromEntries(r.bids.map((b) => [b.bidId, b.unreadCount]))))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [status]);

  const pickGroup = useCallback((groupId: string) => setWanted({ groupId, itemId: null, bidId: null }), []);
  const pickItem = useCallback((id: string) => setWanted((w) => ({ groupId: w.groupId, itemId: id, bidId: null })), []);
  const pickBid = useCallback((bidId: string) => setWanted((w) => ({ groupId: w.groupId, itemId: w.itemId, bidId })), []);

  const tiles = useMemo(() => railTiles(groups ?? []), [groups]);
  const shown = useMemo(() => filterBySource(bids, source), [bids, source]);
  const counts = useMemo(() => sourceCounts(bids), [bids]);
  const bid = useMemo(() => bids.find((b) => b.card.id === resolved.bidId)?.card ?? null, [bids, resolved.bidId]);

  // ── The states before there is a workspace to show ──
  if (status === "anon") {
    return (
      <SignInPrompt
        icon="assignment"
        title={t.workspace.signedOutTitle}
        body={t.workspace.signedOutBody}
        ctaLabel={t.workspace.signedOutCta}
      />
    );
  }
  if (groups === null) {
    return <div className="p-10 text-center text-[13px] font-semibold text-muted">{t.workspace.loading}</div>;
  }
  if (failed) {
    return (
      <div className="p-10 text-center">
        <p className="text-[13px] font-semibold text-muted">{t.workspace.loadFailed}</p>
        <button
          type="button"
          onClick={() => {
            setGroups(null);
            setReloads((n) => n + 1);
          }}
          className="mt-3 rounded-full bg-brand px-4 py-2 text-[12.5px] font-bold text-white"
        >
          {t.workspace.retry}
        </button>
      </div>
    );
  }
  if (groups.length === 0 || !group) {
    return (
      <SignInPrompt
        icon="assignment"
        title={t.workspace.emptyTitle}
        body={t.workspace.emptyBody}
        ctaLabel={t.workspace.emptyCta}
        ctaHref="/create"
      />
    );
  }

  return (
    <div className="-mx-6 -my-6 flex min-h-0 flex-col sm:-mx-12 sm:-mt-7 lg:-mx-20 xl:-mx-28">
      <RequestRail tiles={tiles} activeKey={resolved.groupId} onPick={pickGroup} />

      <RequestStrip
        group={group}
        item={item}
        items={group.items}
        bid={bid}
        bidCount={bids.length}
        onPickItem={pickItem}
        // Phase 4 builds the drawer; until then the site and the id are drawn as links and do nothing.
        onOpenRequest={null}
      />

      <div className="mx-3 mt-4 sm:mx-5">
        {/* Tabs, and the export beside them. */}
        <div className="flex items-end justify-between gap-3">
          <div className="flex gap-1">
            {(["cards", "compare"] as Tab[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                aria-current={tab === k ? "page" : undefined}
                className={`rounded-t-[10px] border border-b-0 px-5 py-2 text-[13px] font-extrabold transition ${
                  tab === k ? "border-border bg-surface text-navy" : "border-transparent bg-surface2 text-muted hover:text-navy-mid"
                }`}
              >
                {k === "cards" ? t.workspace.tabCards : t.workspace.tabCompare}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled
            title={t.workspace.tabPending}
            className="mb-1 inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 py-1.5 text-[12.5px] font-bold text-navy-mid disabled:opacity-40"
          >
            {t.workspace.download} <Icon name="download" size={15} />
          </button>
        </div>

        <div className="rounded-b-[14px] rounded-tr-[14px] border border-border bg-surface">
          {/* The source filter sits inside the panel, above whichever pane is showing — it narrows
              both of them, so it belongs to neither. */}
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
            <span className="inline-flex items-center gap-1 text-[10.5px] font-extrabold uppercase tracking-wide text-muted">
              <Icon name="filter_list" size={14} /> {t.workspace.source}
            </span>
            {(
              [
                ["all", t.workspace.sourceAll],
                ["app", t.workspace.sourceApp],
                ["offline", t.workspace.sourceOffline],
              ] as [SourceFilter, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setSource(key)}
                aria-current={source === key ? "true" : undefined}
                className={`rounded-full px-2.5 py-1 text-[12px] font-bold transition ${
                  source === key ? "bg-navy text-white" : "text-navy-mid hover:bg-surface2"
                }`}
              >
                {label}
                <span className={source === key ? "text-white/60" : "text-muted"}> {counts[key]}</span>
              </button>
            ))}
          </div>

          {tab === "cards" ? (
            <BidCards
              bids={shown}
              selectedId={resolved.bidId}
              unreadByBid={unreadByBid}
              submissionsByBid={submissionsByBid}
              durationDays={item?.durationDays ?? null}
              startDate={item?.startDate ?? null}
              onSelect={pickBid}
            />
          ) : (
            <CompareMatrix
              bids={shown}
              selectedId={resolved.bidId}
              durationDays={item?.durationDays ?? null}
              startDate={item?.startDate ?? null}
              onSelect={pickBid}
            />
          )}
        </div>
      </div>
    </div>
  );
}
