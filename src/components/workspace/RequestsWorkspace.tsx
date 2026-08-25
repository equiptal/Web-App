"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fmt, useLocale, useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { Icon } from "@/components/ui";
import { PAGE_MX_BLEED } from "@/components/AppShell";
import { SignInPrompt } from "@/components/common/SignInPrompt";
import { fetchAllMyRequests, fetchBids, fetchReceivedBids, fetchRequestSubmissions, fetchRequestDetail, recommendBids } from "@/lib/api/client";
import { groupRequests, requestCodeOf, type RequestGroup } from "@/lib/contract/requests";
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
import { RequestDrawer, type ShareLinkMeta } from "@/components/workspace/RequestDrawer";
import { ExportTemplateDialog } from "@/components/compare/ExportTemplateDialog";
import { buildExportPayload, type ExportPayload } from "@/lib/contract/export-templates";
import { buildItemComparison } from "@/lib/contract/comparison";
import { bidColumnToComputed } from "@/lib/contract/agent-bids";
import { orderColumnsForExport, workspaceExportTotals } from "@/lib/contract/workspace-export";
import { formatSar } from "@/lib/pricing/rental";

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
  const { locale } = useLocale();
  const ar = locale === "ar";
  const L = (en: string, arr: string) => (ar ? arr : en);
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
  const [drawerOpen, setDrawerOpen] = useState(false);
  // «Share» on the strip is the same drawer, entered at its share sheet.
  const [drawerShare, setDrawerShare] = useState(false);
  // The public bid link's own settings, which the share sheet edits.
  const [link, setLink] = useState<ShareLinkMeta | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  /**
   * The agent's read of the comparison, held HERE rather than inside the matrix (owner, 2026-08-25).
   *
   * Two surfaces show it — the ★ beside the supplier's name in the table, and the suggestion bar
   * under the card — and the bar sits outside the matrix's own border, so one of them would have been
   * reading the other's local state.
   */
  const [ranking, setRanking] = useState<{ bidId: string | null; note: string | null } | null>(null);
  const [rankBusy, setRankBusy] = useState(false);
  const [tipOpen, setTipOpen] = useState(false);
  /**
   * The selected request's own code, when the LIST row arrived without one.
   *
   * `GET /marketplace/my-requests` returns neither `displayId` nor `shortCode`, though creation
   * mints the code and answers with it — so the strip had nothing human to name the request by and was
   * printing the head of a cuid. The detail record is the next place to ask, and the drawer already
   * fetches it for Edit; this asks for the code alone, once per item, and only when it is missing.
   */
  const [fetchedCode, setFetchedCode] = useState<string | null>(null);

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
      // The same call already carries the public bid link's settings; the drawer's share sheet edits
      // them, so keep them rather than throwing them away with the rest of the envelope.
      setLink(
        "renterName" in link
          ? { renterName: link.renterName, bidDeadline: link.bidDeadline, logoUrl: link.logoUrl }
          : null,
      );
    });
    return () => {
      live = false;
    };
  }, [status, itemId]);

  // The code the list row lacked. One call, keyed on the item, dropped the moment the item changes so
  // a stale code can never sit over the wrong request.
  useEffect(() => {
    setFetchedCode(null);
    if (status !== "authed" || !itemId) return;
    const row = (groups ?? []).flatMap((g) => g.items).find((i) => i.id === itemId);
    if (!row || row.code) return; // the list already carried it
    let live = true;
    fetchRequestDetail(itemId)
      .then((rec) => live && setFetchedCode(requestCodeOf(rec as unknown as Record<string, unknown>)))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [status, itemId, groups]);

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

  /**
   * Bids the renter has taken off the comparison. Owned here rather than inside the matrix so the
   * EXPORT can read it (owner, 2026-08-25): a sheet that printed a bid he had just removed from the
   * table in front of him is a sheet that disagrees with its own screen.
   *
   * Cleared whenever the item changes — a bench is about the comparison being read, and the next
   * item is a different comparison.
   */
  const [benched, setBenched] = useState<Set<string>>(new Set());
  const benchBid = useCallback((bidId: string, off: boolean) => {
    setBenched((s) => {
      const next = new Set(s);
      if (off) next.add(bidId);
      else next.delete(bidId);
      return next;
    });
  }, []);
  // A bench is about the comparison being read, and the next item is a different comparison.
  useEffect(() => { setBenched(new Set()); }, [itemId]);
  // So is a ranking: it ranked THIS item's bids, and the next item's are other bids entirely.
  useEffect(() => { setRanking(null); setTipOpen(false); }, [itemId]);

  /** Ask the agent to rank what is on the comparison. The web owns every figure it sends. */
  const rank = useCallback(async (list: WorkspaceBid[]) => {
    if (rankBusy || list.length === 0) return;
    setRankBusy(true);
    try {
      const { columns } = buildItemComparison(list.map((r) => r.card), { requestDurationDays: item?.durationDays ?? undefined });
      const res = await recommendBids({ bids: columns.map(bidColumnToComputed) });
      const rec = res.result?.recommendation ?? null;
      // The agent's own pick, and its first reason in its own words — not a paraphrase.
      setRanking({
        bidId: rec?.pick_bid_id ?? res.result?.ranking?.[0]?.bid_id ?? null,
        note: rec?.reasons?.[0]?.text ?? res.result?.interpretation ?? null,
      });
    } catch {
      setRanking(null);
    } finally {
      setRankBusy(false);
    }
  }, [rankBusy, item]);

  /** What the source filter allows, minus what the renter benched. Both panes and the export read it. */
  const shown = useMemo(
    () => filterBySource(bids, source).filter((b) => !benched.has(b.card.id)),
    [bids, source, benched],
  );
  /** Everything the filter allows, benched or not — what the matrix needs to draw the bench itself. */
  const shownAll = useMemo(() => filterBySource(bids, source), [bids, source]);
  const counts = useMemo(() => sourceCounts(bids), [bids]);
  const bid = useMemo(() => bids.find((b) => b.card.id === resolved.bidId)?.card ?? null, [bids, resolved.bidId]);

  /**
   * The export payload, built from what the Compare tab is showing.
   *
   * `buildItemComparison` supplies the columns — the same engine the matrix and `Rank with AI` use —
   * and the totals come from `workspaceExportTotals`, which reads the matrix's own figures rather
   * than recomputing them. A sheet that recomputes independently is how the old export came to print
   * "no data" under rows the renter could see filled in.
   */
  const buildExport = useCallback((): ExportPayload | null => {
    if (!item || shown.length === 0) return null;
    const { columns } = buildItemComparison(
      shown.map((b) => b.card),
      { requestDurationDays: item.durationDays ?? undefined },
    );
    if (columns.length === 0) return null;
    return buildExportPayload({
      requestId: item.id,
      itemId: item.id,
      columns: orderColumnsForExport(columns, shown.map((b) => b.card.id)),
      totals: workspaceExportTotals({ bids: shown, durationDays: item.durationDays, startDate: item.startDate }),
      header: {
        requestDisplayId: group?.groupRef ?? item.displayId,
        itemName: item.item ? (ar ? item.item.nameAr || item.item.name : item.item.name) : null,
        location: group?.locationLabel ?? null,
        durationDays: item.durationDays,
        units: item.item?.qty ?? null,
      },
      // The sheet carries the order on screen, which the matrix builds from the figures it shows.
      // `RankingSource` has no "manual" member, and claiming "agent" would credit a ranking nobody
      // ran — so it reports the preset whose ordering this actually is.
      rankingSource: "preset:lowest",
      agentLive: false,
      lang: ar ? "ar" : "en",
    });
  }, [ar, group, item, shown]);

  /** The fallback the dialog falls back TO: the browser's own print dialog over a plain sheet. */
  const printComparison = useCallback(() => {
    if (typeof window === "undefined" || !item || shown.length === 0) return;
    const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch] as string);
    const totals = workspaceExportTotals({ bids: shown, durationDays: item.durationDays, startDate: item.startDate });
    const title = item.item ? (ar ? item.item.nameAr || item.item.name : item.item.name) : item.displayId;
    const rows = shown
      .map((b) => {
        const tot = totals[b.card.id];
        const cell = (m: { value: number; stated: boolean } | undefined) =>
          m?.stated ? formatSar(m.value) : `<span class="q">${esc(t.workspace.didntSay)}</span>`;
        return `<tr><td>${esc(b.card.supplierName)}</td><td>${cell(tot?.rental)}</td><td>${cell(tot?.mobDemob)}</td><td><b>${cell(tot?.grandTotal)}</b></td></tr>`;
      })
      .join("");
    const w = window.open("", "_blank");
    if (!w) {
      setToast(t.workspace.exportPopupBlocked);
      return;
    }
    w.document.write(
      `<!doctype html><html dir="${ar ? "rtl" : "ltr"}"><head><meta charset="utf-8"><title>${esc(title)}</title>` +
        `<style>body{font:14px system-ui,sans-serif;padding:28px;color:#1c3550}h1{font-size:18px;margin:0 0 2px}` +
        `p{margin:0 0 18px;color:#6b8fa8;font-size:12px}table{border-collapse:collapse;width:100%}` +
        `th,td{border:1px solid #d4e0ec;padding:8px 10px;text-align:${ar ? "right" : "left"};font-size:12.5px}` +
        `th{background:#f2f7fb;font-size:10.5px;text-transform:uppercase;letter-spacing:.4px}.q{color:#9AA7B8}</style></head><body>` +
        `<h1>${esc(title)}</h1><p>${esc(group?.locationLabel ?? "")} · ${esc(group?.groupRef ?? item.displayId)}` +
        (item.durationDays ? ` · ${esc(t.workspace.overDays.replace("{n}", String(item.durationDays)))}` : "") +
        `</p><table><thead><tr><th>${esc(t.workspace.supplierPickOne)}</th><th>${esc(t.workspace.colRate)}</th>` +
        `<th>${esc(t.workspace.transportOnce)}</th><th>${esc(t.workspace.grandTotalInclVat)}</th></tr></thead>` +
        `<tbody>${rows}</tbody></table></body></html>`,
    );
    w.document.close();
    w.focus();
    w.print();
  }, [ar, group, item, shown, t]);

  /**
   * ── The states before there is a workspace to show ──
   *
   * These used to inherit the page padding `wide` supplied. `fullBleed` supplies none — the surface
   * owns its own edges now — so each one is centred in the viewport it was handed instead of sitting
   * flush against the top-start corner.
   */
  const Standalone = ({ children }: { children: React.ReactNode }) => (
    <div className="mx-auto flex h-full w-full max-w-[560px] flex-col justify-center px-6 py-8">{children}</div>
  );
  if (status === "anon") {
    return (
      <Standalone>
        <SignInPrompt
          icon="assignment"
          title={t.workspace.signedOutTitle}
          body={t.workspace.signedOutBody}
          ctaLabel={t.workspace.signedOutCta}
        />
      </Standalone>
    );
  }
  if (groups === null) {
    return (
      <Standalone>
        <div className="text-center text-[13px] font-semibold text-muted">{t.workspace.loading}</div>
      </Standalone>
    );
  }
  if (failed) {
    return (
      <Standalone>
        <div className="text-center">
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
      </Standalone>
    );
  }
  if (groups.length === 0 || !group) {
    return (
      <Standalone>
        <SignInPrompt
          icon="assignment"
          title={t.workspace.emptyTitle}
          body={t.workspace.emptyBody}
          ctaLabel={t.workspace.emptyCta}
          ctaHref="/create"
        />
      </Standalone>
    );
  }

  return (
    // ── The page ends at the fold (owner, 2026-08-25) ──────────────────────────────────────────
    // The negative margins are gone with them: they existed to cancel the padding `wide` put around
    // this surface, and `fullBleed` gives it none to cancel. Every band below is `flex-none`; the one
    // that grows is the tab panel, and the only thing that scrolls is the list inside it — so the
    // rail and the strip cannot be pushed off the top by a long column of bids.
    <div className="flex h-full min-h-0 flex-col">
      <RequestRail
        tiles={tiles}
        activeKey={resolved.groupId}
        onPick={pickGroup}
        onShare={() => { setDrawerShare(true); setDrawerOpen(true); }}
      />

      <RequestStrip
        group={group}
        item={item}
        items={group.items}
        bid={bid}
        bidCount={bids.length}
        onPickItem={pickItem}
        onOpenRequest={() => { setDrawerShare(false); setDrawerOpen(true); }}
        fetchedCode={fetchedCode}
      />

      <div className={`${PAGE_MX_BLEED} mt-2 flex min-h-0 flex-1 flex-col pb-2`}>
        {/* Tabs, and the export beside them. The open tab is part of the panel below it — it carries
            the panel's own border and covers the hairline between them, which is why the panel's
            top-start corner is square. */}
        <div className="flex flex-none items-end gap-3 ps-3.5">
          <div className="flex items-end gap-0.5">
            {(["cards", "compare"] as Tab[]).map((k) => {
              const on = tab === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setTab(k)}
                  aria-current={on ? "page" : undefined}
                  className={`relative -mb-px rounded-t-[10px] border border-border text-[12px] font-bold transition ${
                    on
                      ? "z-[2] border-b-surface bg-surface px-4 pb-2 pt-2 text-navy shadow-[0_-2px_6px_rgba(19,44,74,.05)]"
                      : "z-[1] bg-surface3/70 px-3.5 pb-2 pt-1.5 text-muted hover:text-navy-mid"
                  }`}
                >
                  {k === "cards" ? t.workspace.tabCards : t.workspace.tabCompare}
                </button>
              );
            })}
          </div>
          <span className="flex-1" />
          {/* The same export the comparison workspace had: the renter's own templates, with the
              built-in sheet as the fallback whenever a template cannot be used. Nothing is rebuilt —
              `buildExportPayload` and the dialog are the originals. */}
          <div className="mb-[7px] flex items-center gap-2">
            {/* ── «Select all» puts the whole comparison back (owner, 2026-08-25) ─────────────────
                The export covers what the comparison covers, so putting a bid back on the table is
                the same act as putting it back in the sheet — one concept, not two. It appears only
                when something is actually off, because a control that clears nothing is furniture,
                and it names the count so the renter knows what he is about to bring back. */}
            {benched.size > 0 && (
              <button
                type="button"
                onClick={() => setBenched(new Set())}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-[7px] text-[10.5px] font-bold text-navy-mid transition hover:border-navy-mid"
              >
                <Icon name="done_all" size={14} /> {fmt(t.workspace.selectAll, { n: String(benched.size) })}
              </button>
            )}
            <button
              type="button"
              disabled={shown.length === 0}
              onClick={() => setExportOpen(true)}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-border bg-surface px-3 py-[7px] text-[10.5px] font-bold text-navy-mid transition hover:border-navy-mid hover:bg-surface2/60 disabled:opacity-40"
            >
              {t.workspace.download} <Icon name="download" size={14} />
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-b-[14px] rounded-tr-[14px] border border-border bg-surface shadow-[0_2px_10px_rgba(19,44,74,.07)]">
          {/* ── Source, above whichever pane is showing (owner's reference, 2026-08-25) ───────────
              It narrows both panes, so it belongs to neither — and it reads as a quiet row of words
              rather than a row of pills, because it is a filter over the table, not an action on it.
              It appears only when there is a mix to narrow: with every bid from one source, three
              choices that change nothing are furniture. */}
          <div className="flex flex-none flex-wrap items-center gap-4 border-b border-border px-3.5 py-1.5">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-muted">
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
                  className={`border-b-2 pb-0.5 text-[12.5px] font-bold transition ${
                    source === key ? "border-brand text-navy" : "border-transparent text-muted hover:text-navy-mid"
                  }`}
                >
                  {label}
                  <span className={source === key ? "text-muted" : "text-muted/70"}> {counts[key]}</span>
                </button>
            ))}
          </div>

          {/* ── Nothing on this page scrolls DOWNWARDS (owner, 2026-08-25: "i dont want scroll
              inside the cards even") ──────────────────────────────────────────────────────────────
              This was `overflow-y-auto`, which put a second scrollbar inside the white card the
              moment a bid ran tall. The reference has no such thing: the bids are a ROW that runs
              sideways, each card the full height of the pane, and the way to the fifth bid is to
              travel right.

              So the pane is `overflow-hidden` and hands its height to whichever tab is open. The
              cards stretch to it; the comparison table keeps its own horizontal scroll, which is a
              table's business and not a page's. */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
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
              // Everything the source filter allows, benched or not — the matrix draws the bench
              // itself, so it needs the bids it is not currently comparing.
              bids={shownAll}
              selectedId={resolved.bidId}
              durationDays={item?.durationDays ?? null}
              startDate={item?.startDate ?? null}
              onSelect={pickBid}
              benched={benched}
              onBench={benchBid}
              ranking={ranking}
              rankBusy={rankBusy}
              onRank={rank}
            />
          )}
          </div>
        </div>

        {/* ── The suggestion bar (owner, 2026-08-25) ────────────────────────────────────────────────
            Under the card, not in it: it is the agent's reading OF the comparison, and a panel inside
            the table's border would read as another one of its rows. Collapsed it is a single line —
            the agent's own words, unpadded — and it opens into the full note. Nothing appears until
            the renter has asked for a ranking, because an empty assistant is furniture. */}
        {tab === "compare" && shown.length > 0 && (
          <div className="mt-3.5 flex-none">
            {ranking?.note && !tipOpen ? (
              <button
                type="button"
                onClick={() => setTipOpen(true)}
                className="inline-flex max-w-full items-center gap-2.5 rounded-full border border-border bg-surface py-2 pe-4 ps-[9px] shadow-[0_2px_8px_rgba(19,44,74,.06)] transition hover:border-navy-mid/40"
              >
                <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-surface2 text-[11px] font-bold text-muted">✦</span>
                <span className="flex-none text-[11.5px] font-bold text-navy-mid">{t.workspace.aiSuggestion}</span>
                <span className="min-w-0 truncate text-[11.5px] font-medium text-muted">{ranking.note}</span>
                <span className="flex-none text-[10px] font-semibold text-muted/70">⌄</span>
              </button>
            ) : ranking?.note && tipOpen ? (
              <div className="flex items-start gap-3 rounded-[14px] border border-border bg-surface px-4 py-3.5 shadow-[0_2px_10px_rgba(19,44,74,.06)]">
                <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-surface2 text-[11px] font-bold text-muted">✦</span>
                <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                  <div className="flex items-baseline gap-2.5">
                    <span className="text-[11px] font-bold text-muted">{t.workspace.aiWhatIdDo}</span>
                    <span className="font-mono text-[7.5px] font-bold tracking-[.09em] text-muted/70">{t.workspace.aiBrand}</span>
                  </div>
                  <p className="text-[12px] font-medium leading-[1.5] text-navy-mid">{ranking.note}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setTipOpen(false)}
                  aria-label={t.common.cancel}
                  className="flex-none self-start rounded-md px-[7px] py-[5px] text-[11px] font-semibold text-muted/70 transition hover:bg-surface2 hover:text-navy-mid"
                >
                  ⌃
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void rank(shown)}
                disabled={rankBusy}
                className="inline-flex items-center gap-2.5 rounded-full border border-border bg-surface py-2 pe-4 ps-[9px] shadow-[0_2px_8px_rgba(19,44,74,.06)] transition hover:border-navy-mid/40 disabled:opacity-60"
              >
                <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-surface2 text-[11px] font-bold text-muted">✦</span>
                <span className="text-[11.5px] font-bold text-navy-mid">{t.workspace.aiSuggestion}</span>
                <span className="text-[11.5px] font-medium text-muted">
                  {rankBusy ? t.workspace.aiRanking : t.workspace.aiRankPrompt}
                </span>
              </button>
            )}
          </div>
        )}
      </div>

      <ExportTemplateDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        ar={ar}
        L={L}
        buildPayload={buildExport}
        onBuiltinExport={printComparison}
        toast={(m) => setToast(m)}
      />
      {toast && (
        <div className="fixed inset-x-0 bottom-28 z-[70] mx-auto w-fit rounded-full bg-navy px-4 py-2 text-[12.5px] font-bold text-white shadow-lg">
          {toast}
        </div>
      )}

      {drawerOpen && (
        <RequestDrawer
          group={group}
          item={item}
          bids={bids}
          link={link}
          openShare={drawerShare}
          onClose={() => setDrawerOpen(false)}
          // An edit or a cancellation changes the rail and the bids under it, so both are re-read
          // rather than patched in place — the page has one source for its data and keeps it.
          onChanged={() => {
            setGroups(null);
            setReloads((n) => n + 1);
          }}
        />
      )}
    </div>
  );
}
