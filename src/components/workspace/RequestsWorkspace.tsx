"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
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
import { hiddenRequests, hideRequest } from "@/lib/access/hidden-requests";
import { RequestContextBar } from "@/components/workspace/RequestContextBar";
import { ItemTier } from "@/components/workspace/ItemTier";
import { BidCards } from "@/components/workspace/BidCards";
import { CompareMatrix } from "@/components/workspace/CompareMatrix";
import { RequestDetailsModal, type ShareLinkMeta } from "@/components/workspace/RequestDetailsModal";
import { buildItemComparison } from "@/lib/contract/comparison";
import { bidColumnToComputed } from "@/lib/contract/agent-bids";
import { workspaceExportTotals } from "@/lib/contract/workspace-export";
import { formatSar } from "@/lib/pricing/rental";
import { buildBidQuotationDoc, quotationSupplierInitials, quotationSupplierKey } from "@/lib/quotation/bid-quotation";
import { renderQuotationSection, wrapQuotationPage } from "@/lib/quotation/render";
import { quotationDownloadName } from "@/lib/compare/quotation-token";
import { btn, cx } from "@/lib/ds";
import { pin } from "@/lib/uiPins";

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
  const { status, tier } = useSession();

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
  // …and «Cancel» is the same drawer entered at its confirm step, for the dashboard's row action.
  const [drawerCancel, setDrawerCancel] = useState(false);
  // The public bid link's own settings, which the share sheet edits.
  const [link, setLink] = useState<ShareLinkMeta | null>(null);
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

  /* ── Arriving from somewhere else, on a named request (owner, 2026-08-29) ─────────────────
     The dashboard's request table has row actions — open, share, edit, cancel — and every one of
     them ends in machinery that already lives HERE, in the details drawer: the edit gate that reads
     `renteeEditUsed`, the share sheet that owns the bid link, the cancel confirm. Rebuilding any of
     it on the dashboard would be a second surface for one request, drifting from this one.

     So the dashboard links instead: `?g=<groupId>` chooses the request, and `share` / `cancel` /
     `details` say which door of the drawer to come in by. Read ONCE, on arrival — the params are an
     entry instruction, not state: re-applying them would drag the renter back to that request every
     time he picked another. */
  const params = useSearchParams();
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    if (entered || !groups?.length) return;
    setEntered(true);
    const g = params?.get("g");
    if (g && groups.some((x) => x.id === g)) setWanted({ groupId: g, itemId: null, bidId: null });
    const door = params?.get("share") ? "share" : params?.get("cancel") ? "cancel" : params?.get("details") ? "details" : null;
    if (!door) return;
    setDrawerShare(door === "share");
    setDrawerCancel(door === "cancel");
    setDrawerOpen(true);
  }, [entered, groups, params]);

  const pickGroup = useCallback((groupId: string) => setWanted({ groupId, itemId: null, bidId: null }), []);
  const pickItem = useCallback((id: string) => setWanted((w) => ({ groupId: w.groupId, itemId: id, bidId: null })), []);
  const pickBid = useCallback((bidId: string) => setWanted((w) => ({ groupId: w.groupId, itemId: w.itemId, bidId })), []);

  /**
   * Which bids the quotation download covers — by TICK, not by click (owner, 2026-08-30).
   *
   * It used to read `resolved.bidId`, the single bid a card-click set. That made the card a control
   * whose only effect was invisible: pressing one silently narrowed a download the renter had not
   * asked for yet, and there was no way to pick two. A checkbox says what it does and lets him take
   * three of the five.
   *
   * `resolved.bidId` is untouched — the comparison matrix still uses it to decide which column is
   * the subject, which is a genuinely single-valued question. Only the download changed hands.
   */
  const [checkedBids, setCheckedBids] = useState<Set<string>>(new Set());
  const toggleBid = useCallback((bidId: string) => {
    setCheckedBids((prev) => {
      const next = new Set(prev);
      if (!next.delete(bidId)) next.add(bidId);
      return next;
    });
  }, []);


  /**
   * Requests this device has taken off the rail (owner, 2026-08-27) — closed ones only, and hidden
   * rather than deleted. Read once on mount because `localStorage` is not available while the server
   * renders, and a first paint that differs from the second is a hydration mismatch.
   */
  const [hidden, setHidden] = useState<string[]>([]);
  useEffect(() => setHidden(hiddenRequests()), []);
  const hide = useCallback((key: string) => setHidden(hideRequest(key)), []);

  const tiles = useMemo(
    // A hidden request whose circle is nonetheless the one being READ stays on the rail: taking the
    // page's own subject out from under it would leave the workspace showing a request the renter
    // cannot see the tile for.
    () => railTiles(groups ?? []).filter((tl) => !hidden.includes(tl.key) || tl.key === resolved.groupId),
    [groups, hidden, resolved.groupId],
  );

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

  // A tick on a bid that is no longer on screen — the item changed, the source filter moved — must
  // not silently ride along into the next download.
  const shownIds = shown.map((b) => b.card.id).join(",");
  useEffect(() => {
    const live = new Set(shownIds.split(",").filter(Boolean));
    setCheckedBids((prev) => {
      const next = new Set([...prev].filter((id) => live.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [shownIds]);
  const counts = useMemo(() => sourceCounts(bids), [bids]);
  /* ~~The picked bid's card.~~ The strip drew it above the tabs — the machine offered, its yard
     ribbon, its fact chips — which is the bid card's own job, done twice. With the strip gone
     nothing at this level needs the bid itself; `resolved.bidId` still says which one is picked. */

  /** The export: the browser's own print dialog over the plain Moedatech sheet. */
  /**
   * ── The Cards tab's download: the formal QUOTATION (owner, 2026-08-26) ─────────────────────────
   *
   * One button, two jobs, because the two tabs hold two different things: the comparison exports the
   * TABLE, and the cards export the OFFER — the quotation paper a renter sends on to his own people.
   *
   * It is the app's own document, not a second one: `buildBidQuotationDoc` + `renderQuotationSection`
   * + `wrapQuotationPage`, the same three the deal room and the grouped bid view issue, so the same
   * deal downloaded from any of them is the same paper. One section per SUPPLIER (`quotationSupplierKey`
   * — two colleagues of one firm are one counterparty), for the bid picked, or for every bid on the
   * table when none is.
   *
   * The identity block is best-effort on purpose: `/api/me` for the renter, the request record for the
   * window and the transport assignment. A refused call costs the letterhead, not the quotation.
   */
  const downloadQuotation = useCallback(async () => {
    if (typeof window === "undefined" || !item || shown.length === 0) return;
    // Ticked bids, or every bid on screen when none is ticked. "None ticked" is the renter asking
    // for the lot, not for nothing — the button is «Download quotation», and a download that
    // silently produced an empty file would be the worse reading.
    const chosen = checkedBids.size > 0 ? shown.filter((b) => checkedBids.has(b.card.id)) : shown;
    if (chosen.length === 0) return;

    const [rec, me] = await Promise.all([
      fetchRequestDetail(item.id).catch(() => null),
      fetch("/api/me", { cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<{ user?: Record<string, string | null | undefined> }>) : null))
        .catch(() => null),
    ]);
    const u = me?.user ?? {};
    const reqItem = (rec as unknown as { equipmentItems?: { mobilizationByRentee?: boolean | null; demobilizationByRentee?: boolean | null }[] } | null)?.equipmentItems?.[0] ?? null;
    const code = item.code ?? fetchedCode ?? item.displayId;
    const reqCode = code.replace(/[^A-Za-z0-9-]/g, "");
    const itemName = item.item ? (ar ? item.item.nameAr || item.item.name : item.item.name) : code;

    // One quotation per supplier, cut by the key the grouped download uses.
    const bySupplier = new Map<string, typeof chosen>();
    for (const b of chosen) {
      const key = quotationSupplierKey(b.card);
      const list = bySupplier.get(key);
      if (list) list.push(b);
      else bySupplier.set(key, [b]);
    }

    const sections = [...bySupplier.values()]
      .map((supBids, si) =>
        renderQuotationSection(
          buildBidQuotationDoc({
            lang: ar ? "ar" : "en",
            quotationNumber: `Q-${reqCode}-${quotationSupplierInitials(supBids[0].card.supplierName)}${si + 1}`,
            reference: code,
            entries: supBids.map((b) => ({
              bid: b.card,
              itemLabel: itemName,
              requestCode: code,
              startDate: item.startDate,
              endDate: item.endDate,
              durationDays: item.durationDays,
              rentalType: item.rentalType,
              mobByRentee: reqItem?.mobilizationByRentee ?? item.mobByRentee,
              demobByRentee: reqItem?.demobilizationByRentee ?? item.demobByRentee,
            })),
            rentee: {
              companyName: u.companyName ?? "",
              personName: [u.firstName, u.lastName].filter(Boolean).join(" "),
              crNumber: u.crNumber ?? null,
              vatNumber: u.vatNumber ?? null,
              nationalAddress: u.nationalAddress ?? null,
              phone: u.phone ?? null,
              email: u.email ?? null,
              verified: tier === "verified",
            },
          }),
        ),
      )
      .join("");

    const dlName = quotationDownloadName(code, [code]);
    const html = wrapQuotationPage(sections, { lang: ar ? "ar" : "en", title: dlName });
    // A popup-blocked `window.open` returns null and used to fail silently — a dead click. Fall back
    // to downloading the self-printing file so the quotation is never a no-op.
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(html);
      w.document.close();
      return;
    }
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${dlName.replace(/[^\w.-]+/g, "_")}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }, [ar, item, shown, checkedBids, fetchedCode, tier]);

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
        `<style>body{font:14px system-ui,sans-serif;padding:28px;color:var(--navy)}h1{font-size:18px;margin:0 0 2px}` +
        `p{margin:0 0 18px;color:var(--muted);font-size:12px}table{border-collapse:collapse;width:100%}` +
        `th,td{border:1px solid var(--border);padding:8px 10px;text-align:${ar ? "right" : "left"};font-size:12.5px}` +
        `th{background:var(--background);font-size:10.5px;text-transform:uppercase;letter-spacing:.4px}.q{color:var(--muted-light)}</style></head><body>` +
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
        <div className="text-center text-body font-semibold text-muted">{t.workspace.loading}</div>
      </Standalone>
    );
  }
  if (failed) {
    return (
      <Standalone>
        <div className="text-center">
          <p className="text-body font-semibold text-muted">{t.workspace.loadFailed}</p>
          <button
            type="button"
            onClick={() => {
              setGroups(null);
              setReloads((n) => n + 1);
            }}
            className={btn("primary", "md", { pill: true, className: "mt-3" })}
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
    <div {...pin("requests-workspace")} className="flex h-full min-h-0 flex-col">
      <RequestRail
        tiles={tiles}
        activeKey={resolved.groupId}
        onPick={pickGroup}
        onShare={() => { setDrawerShare(true); setDrawerCancel(false); setDrawerOpen(true); }}
        onHide={hide}
      />


      <div className={`${PAGE_MX_BLEED} mt-2 flex min-h-0 flex-1 flex-col pb-2`}>
        {/* ── The row above the panel (owner, 2026-08-27) ─────────────────────────────────────────
            Three things, and the tabs are the middle one so they sit under the eye rather than off
            at the leading edge.

            ~~The request strip stood above this row~~ — a full-width band carrying the request code,
            the bid count, the date raised, the picked machine as a white card, a yard ribbon, three
            fact chips and two controls. Every one of those already had a home: the drawer states the
            request, the bid cards state the offers, and the map states the machines. What it uniquely
            held was the item switcher, and that moved into the context bar, which is the thing that
            names the current item anyway.

            `items-end` because the open tab has to meet the panel's top edge; the bar and the export
            sit on that same line. */}
        <div className="flex flex-none items-end gap-3">
          {/* The bar and the export take equal shares of what is left, so the tabs land on the row's
              true centre rather than wherever the bar's width happens to leave them. A spacer on one
              side only would centre them against the export alone. */}
          <div className="mb-1 flex flex-1 justify-start">
            <RequestContextBar
              group={group}
              item={item}
              onOpenRequest={() => { setDrawerShare(false); setDrawerCancel(false); setDrawerOpen(true); }}
            />
          </div>
          <div className="flex flex-none items-end gap-0.5">
            {(["cards", "compare"] as Tab[]).map((k) => {
              const on = tab === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setTab(k)}
                  aria-current={on ? "page" : undefined}
                  /* ── One height for the row (owner, 2026-08-27) ──────────────────────────────────
                     34px, the same `control-md` the export button and the context bar carry. The two
                     tabs used to differ from each OTHER as well — `pt-2` against `pt-1.5` — so the
                     open one stood a half-pixel taller than its neighbour and the row had three
                     heights in it. Only the fill and the bottom edge change now; the box does not. */
                  className={cx(
                    // `control-md` sets the height; the button needs a display mode to centre in it.
                    "control-lg relative -mb-px inline-flex items-center justify-center rounded-t-md border border-border text-meta font-semibold transition-colors",
                    on
                      ? "z-[2] border-b-surface bg-surface text-navy"
                      : "z-[1] bg-surface3/70 text-muted hover:text-navy-mid",
                  )}
                >
                  {k === "cards" ? t.workspace.tabCards : t.workspace.tabCompare}
                </button>
              );
            })}
          </div>
          <div className="mb-2 flex flex-1 items-center justify-end gap-2">
            {/* ── «Select all» puts the whole comparison back (owner, 2026-08-25) ─────────────────
                The export covers what the comparison covers, so putting a bid back on the table is
                the same act as putting it back in the sheet — one concept, not two. It appears only
                when something is actually off, because a control that clears nothing is furniture,
                and it names the count so the renter knows what he is about to bring back. */}
            {benched.size > 0 && (
              <button
                type="button"
                onClick={() => setBenched(new Set())}
                className={btn("secondary", "lg", { className: "transition" })}
              >
                <Icon name="done_all" size={14} /> {fmt(t.workspace.selectAll, { n: String(benched.size) })}
              </button>
            )}
            {/* One control, named for what THIS tab exports (owner, 2026-08-26): the cards issue the
                quotation paper, the comparison issues the table. Both are the exports the app already
                had; only which one the button reaches changes with the tab. */}
            <button
              type="button"
              disabled={shown.length === 0}
              onClick={() => (tab === "compare" ? printComparison() : void downloadQuotation())}
              className={btn("secondary", "lg", { className: "whitespace-nowrap transition" })}
            >
              {tab === "compare" ? t.workspace.exportComparison : t.workspace.downloadQuotation}
              {/* The count, only once a tick narrows it. Silent while the button means "all of
                  them", because a number there would read as a limit the renter had set. */}
              {tab === "cards" && checkedBids.size > 0 && (
                <span className="rounded-full bg-navy px-1.5 text-label font-semibold leading-[18px] text-white">
                  {checkedBids.size}
                </span>
              )}{" "}
              <Icon name="download" size={14} />
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-b-sm rounded-tr-sm border border-border bg-surface">
          {/* ── Source, above whichever pane is showing (owner's reference, 2026-08-25) ───────────
              It narrows both panes, so it belongs to neither — and it reads as a quiet row of words
              rather than a row of pills, because it is a filter over the table, not an action on it.
              It appears only when there is a mix to narrow: with every bid from one source, three
              choices that change nothing are furniture. */}
          {/* ── The source keeps the centre, whatever else is on the line (owner, 2026-08-28) ──────
              Three children: the machines, the source, and an empty third of equal weight. The two
              flexible sides cancel out, so the source sits on the row's true centre — under the tabs
              — and stays there whether or not this request has more than one machine. Putting the
              machines beside it and letting the pair centre together would have moved the source
              every time a request had a second item.

              The machines take the leading edge, directly under the context bar, which is the same
              fact one line up: that bar names the machine being read and this row is how it changes. */}
          <div className="flex flex-none items-center gap-x-5 border-b border-border px-3.5 py-1.5">
              <div className="flex min-w-0 flex-1 justify-start">
                {group && group.items.length > 1 && (
                  <ItemTier items={group.items} activeId={resolved.itemId} onPick={pickItem} />
                )}
              </div>
              <div className="flex flex-none flex-wrap items-center justify-center gap-x-5 gap-y-1.5">
              <span className="inline-flex items-center gap-1.5 text-label font-extrabold uppercase tracking-wide text-muted">
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
                  className={`border-b-2 pb-0.5 text-meta font-semibold transition ${
                    source === key ? "border-brand text-navy" : "border-transparent text-muted hover:text-navy-mid"
                  }`}
                >
                  {label}
                  <span className={source === key ? "text-muted" : "text-muted/70"}> {counts[key]}</span>
                </button>
            ))}
              </div>
              {/* The third of the row that carries nothing. It exists so the middle one is the
                  middle: without it the source would centre against the machines alone and shift
                  every time a request had a second item. */}
              <div className="min-w-0 flex-1" aria-hidden />
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
              checked={checkedBids}
              unreadByBid={unreadByBid}
              submissionsByBid={submissionsByBid}
              durationDays={item?.durationDays ?? null}
              startDate={item?.startDate ?? null}
              onToggle={toggleBid}
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
                className={btn("secondary", "md", { pill: true, full: true, className: "max- pe-4 ps-2 transition" })}
              >
                <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-surface2 text-label font-semibold text-muted">✦</span>
                <span className="flex-none text-label font-semibold text-navy-mid">{t.workspace.aiSuggestion}</span>
                <span className="min-w-0 truncate text-label font-semibold text-muted">{ranking.note}</span>
                <span className="flex-none text-label font-semibold text-muted/70">⌄</span>
              </button>
            ) : ranking?.note && tipOpen ? (
              <div className="flex items-start gap-3 rounded-lg border border-border bg-surface px-4 py-3.5">
                <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-surface2 text-label font-semibold text-muted">✦</span>
                <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                  <div className="flex items-baseline gap-2.5">
                    <span className="text-label font-semibold text-muted">{t.workspace.aiWhatIdDo}</span>
                    <span className="font-mono text-label font-semibold tracking-[.09em] text-muted/70">{t.workspace.aiBrand}</span>
                  </div>
                  <p className="text-meta font-semibold leading-[1.5] text-navy-mid">{ranking.note}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setTipOpen(false)}
                  aria-label={t.common.cancel}
                  className="flex-none self-start rounded-sm px-2 py-1 text-label font-semibold text-muted/70 transition hover:bg-surface2 hover:text-navy-mid"
                >
                  ⌃
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void rank(shown)}
                disabled={rankBusy}
                className={btn("secondary", "md", { pill: true, className: "pe-4 ps-2 transition" })}
              >
                <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-surface2 text-label font-semibold text-muted">✦</span>
                <span className="text-label font-semibold text-navy-mid">{t.workspace.aiSuggestion}</span>
                <span className="text-label font-semibold text-muted">
                  {rankBusy ? t.workspace.aiRanking : t.workspace.aiRankPrompt}
                </span>
              </button>
            )}
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed inset-x-0 bottom-28 z-[70] mx-auto w-fit rounded-full bg-navy px-4 py-2 text-meta font-semibold text-white">
          {toast}
        </div>
      )}

      {drawerOpen && (
        <RequestDetailsModal
          group={group}
          item={item}
          bids={bids}
          link={link}
          openShare={drawerShare}
          openCancel={drawerCancel}
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
