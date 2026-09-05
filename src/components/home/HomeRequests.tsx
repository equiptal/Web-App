"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui";
import { useSession } from "@/lib/session";
import { cancelRequest, fetchAllMyRequests, fetchBids, fetchReceivedBids, fetchRequestSubmissions, fetchRequestDetail } from "@/lib/api/client";
import { cancellableItems, groupBiddingClosed, groupRequests, type RequestGroup } from "@/lib/contract/requests";
import type { InboxBid } from "@/lib/contract/inbox";
import { requestExpiry, expiryState, type ExpiryState } from "@/lib/contract/request-expiry";
import { submissionToBidCard } from "@/lib/contract/link-bids";
import type { WorkspaceBid } from "@/lib/contract/workspace";
import type { BidCard } from "@/lib/contract/bids";
import { hiddenRequests, hideRequest, unhideRequest } from "@/lib/access/hidden-requests";
import { RequestDetailsModal, type ShareLinkMeta } from "@/components/workspace/RequestDetailsModal";
import { ConfirmCancelModal } from "@/components/requests/RequestEditModals";
import { Dialog } from "@/components/Dialog";
import { btn, CARD, cx } from "@/lib/ds";
import { fmt, useLocale, useT } from "@/lib/i18n";
import { pin } from "@/lib/uiPins";

/**
 * **Five and five** (owner, 2026-08-29).
 *
 * *"I want to show the bids latest 5 only with indication for more if exist to scroll, and then show
 * the number of appropriate request that match and fit the bids card length."*
 *
 * So the two counts are not independent numbers to tune: the rail shows the newest five bids, and
 * the table shows as many requests as stand level with them. Both rows are pinned to `ROW_H` and
 * both headers to the same height, which is what makes "as many as fit" a fact the layout enforces
 * rather than a guess two constants have to keep agreeing on. Change `BIDS_SHOWN` and the table
 * follows.
 *
 * ~~Three requests, six bids.~~ Withdrawn with the same ruling: the header said «20 open» over a
 * table showing three, which reads as a broken list rather than as a summary of one.
 */
const BIDS_SHOWN = 5;
/** How many of the renter's request groups the rail reads shared-link bids for — see the effect. */
const LINK_FANOUT_MAX = 20;

/** «Excavator · 20 ton» — and just «Excavator» when the request named no size. */
const machineWords = (subtype: string | null, size: string | null): string =>
  [subtype, size].filter(Boolean).join(" · ");

/** One off-platform bid, as the rail needs it: the card the workspace builds, plus the two facts the
 *  submission cannot know about itself — which request it answers, and where that job is. */
interface LinkRailBid {
  card: BidCard;
  requestId: string;
  machine: string;
  location: string | null;
}

/** A row of the rail, from EITHER source. Four facts and a destination — see the merge below. */
interface RailBid {
  key: string;
  name: string;
  price: number | null;
  priceUnit: string | null;
  machine: string | null;
  location: string | null;
  /** Arrived through the renter's shared link rather than through an account. */
  offPlatform: boolean;
  at: string | null;
  href: string;
}
const SHOWN = BIDS_SHOWN;
/** One height for a bid row and a request row alike — see {@link BIDS_SHOWN}. */
const ROW_H = "h-[52px]";

/**
 * **The renter's requests, and the bids that arrived against them** — the dashboard's first block.
 *
 * Two things on one row: the requests as a dense table, and the newest bids as a rail beside it.
 * They answer the two halves of one question — what did I ask for, and what came back — and a
 * dashboard that made the second a separate destination made the renter go and look for it.
 *
 * ── The row's actions live in the WORKSPACE, and are linked to (owner, 2026-08-29) ───────────────
 * *"Where is the actions on the request that was in the prototype?"* — share, edit, cancel. Every
 * one of them ends in machinery the details drawer already owns: the edit gate that reads
 * `renteeEditUsed` and refuses before the form rather than at save, the share sheet that owns the
 * bid link and its deadline, the cancel confirm. Rebuilding any of it here would be a second surface
 * for one request, and the two would drift.
 *
 * So each icon deep-links `/requests?g=<groupId>` with the door it wants — `share`, `cancel`, or
 * `details` — and the row itself opens the details. One implementation, four ways in.
 *
 * ── The expiry column ────────────────────────────────────────────────────────────────────────────
 * NOT the request's status — except when the status is the whole answer. Three sources, in order:
 *
 *   0. **the status**, when bidding is already shut (`groupBiddingClosed`). A deadline says when
 *      bidding WOULD stop; the status says whether it already has, and they disagree often — a
 *      request awarded on day one keeps a deadline three days out. «Closed», in red, outranks both
 *      dates, because a countdown beside a shut request tells the renter to wait for offers that can
 *      never arrive;
 *   1. the deadline the renter set himself on the shared bid link (`bidDeadline`), which is also the
 *      date the SUPPLIER's form closes on, so both sides read one date;
 *   2. failing that, the bid window chosen at creation (`offerDuration`) counted from `createdAt`.
 *
 * Neither date is on the list payload, so each shown row is resolved with one call — and only for
 * the rows actually drawn, and only while they are still open, since a closed row has its answer
 * already. The window fallback costs a second call, taken only when the renter set no deadline. A
 * row whose lookups fail shows no date rather than a wrong one.
 */
export function HomeRequests() {
  const t = useT();
  const { locale } = useLocale();
  const ar = locale === "ar";
  const L = (en: string, arr: string) => (ar ? arr : en);
  const router = useRouter();
  const { sessionKey, status } = useSession();

  const [groups, setGroups] = useState<RequestGroup[] | null>(null);
  /** `null` until the read lands — an empty array is an ANSWER ("no bids"), and the rail must not
   *  give that answer before it has one. See the rail's own note below. */
  const [bids, setBids] = useState<InboxBid[] | null>(null);
  /** Keyed by group id — resolved after the rows are known, so the table paints before the dates do. */
  const [expiry, setExpiry] = useState<Record<string, ExpiryState>>({});
  /**
   * ── The bids that arrived OFF the platform (owner, 2026-09-05) ────────────────────────────────
   *
   * *"I want these bids to even show the off-platform bids."*
   *
   * The rail read `fetchReceivedBids`, which is the app's own projection: it knows nothing about a
   * supplier who answered the renter's shared link, so a request whose only offers came that way said
   * «no bids yet» on the dashboard while the workspace listed three. One rail, both sources now.
   *
   * They arrive per REQUEST — there is no "all my submissions" endpoint on the agents service — so
   * they are fanned out over the renter's own groups. One call per group, shared with the deadline
   * lookup below through `loadSubs`, so adding this source costs no extra round trip for a row the
   * table was already dating.
   */
  const [linkBids, setLinkBids] = useState<LinkRailBid[]>([]);

  /**
   * One read of a request's shared-link envelope, however many callers want it.
   *
   * Two do: the deadline resolver below wants its `bidDeadline`, and the rail wants its
   * `submissions`. Before this they would have been two calls for one payload on every row the table
   * dates. Memoised by request id for the life of the mount, and never cleared on error — a failed
   * read answers `null` to both callers, which is what each of them already handles.
   */
  const subsOnce = useRef(new Map<string, Promise<Awaited<ReturnType<typeof fetchRequestSubmissions>> | null>>());
  const loadSubs = useCallback((requestId: string) => {
    const cached = subsOnce.current.get(requestId);
    if (cached) return cached;
    const p = fetchRequestSubmissions(requestId).catch(() => null);
    subsOnce.current.set(requestId, p);
    return p;
  }, []);
  // A new account (or a sign-in) must not read the previous renter's envelopes back out of the cache.
  useEffect(() => {
    subsOnce.current = new Map();
    setLinkBids([]);
  }, [sessionKey]);

  /** Both cards open in place rather than navigating away (owner, 2026-08-30). They grow to fit every
   *  row: nothing is hidden behind an inner scrollbar, at the cost of the two cards no longer ending
   *  level once one is open. That was the explicit choice — a list the renter has to scroll inside a
   *  box he already scrolled to reach is two scrollbars for one list. */
  const [allRequests, setAllRequests] = useState(false);
  const [allBids, setAllBids] = useState(false);

  /* ══ Everything below happens HERE, on the dashboard (owner, 2026-08-30) ═══════════════════════
     *"why cancel or edit or share always show the details panel behind it"* — because every one of
     them called `router.push('/requests?g=…&door=1')`. That navigated to the workspace and opened
     the door there, so what sat behind the modal was the requests page the renter had just been
     sent to, mid-load. He asked for a request, not for another page.

     `RequestDetailsModal` is a component, so it is mounted here and the dashboard stays put. */

  /** The group whose details are open, and whether it opened straight onto the share sheet. */
  const [open, setOpen] = useState<{ group: RequestGroup; share: boolean } | null>(null);
  /** The bids and the share-link settings the modal needs — fetched only once one is opened. */
  const [openBids, setOpenBids] = useState<WorkspaceBid[]>([]);
  const [openLink, setOpenLink] = useState<ShareLinkMeta | null>(null);

  /** The group the ✕ is asking to cancel. Cancelling ALWAYS confirms — see the note on dismissal. */
  const [cancelling, setCancelling] = useState<RequestGroup | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  /** Groups this device has taken off the feed. Local, and reversible. */
  const [hidden, setHidden] = useState<string[]>([]);
  useEffect(() => setHidden(hiddenRequests()), []);
  /** The group waiting on the one-time explainer before it is dismissed. */
  const [explaining, setExplaining] = useState<RequestGroup | null>(null);
  /** The last dismissal, offered back. Null once taken or once it times out. */
  const [undo, setUndo] = useState<{ id: string; label: string } | null>(null);

  useEffect(() => {
    if (!open) {
      setOpenBids([]);
      setOpenLink(null);
      return;
    }
    const first = open.group.items[0];
    if (!first) return;
    let live = true;
    void Promise.all([
      fetchBids(first.id).catch(() => ({ bids: [] })),
      loadSubs(first.id),
    ]).then(([app, link]) => {
      if (!live) return;
      // One card per item of a submission, as the workspace cuts them: an off-platform supplier can
      // answer several lines of one RFQ, and each line is its own offer.
      const offline = (link?.submissions ?? []).flatMap((sub) =>
        (sub.items.length ? sub.items : [undefined]).map(
          (it): WorkspaceBid => ({ card: submissionToBidCard(sub, it), source: "offline" }),
        ),
      );
      setOpenBids([...app.bids.map((card): WorkspaceBid => ({ card, source: "app" })), ...offline]);
      setOpenLink(link ? { renterName: link.renterName, bidDeadline: link.bidDeadline, logoUrl: link.logoUrl } : null);
    });
    return () => {
      live = false;
    };
  }, [open, loadSubs]);

  /** Re-read the requests after something changed them — an edit saved, a cancellation taken. */
  const reload = useCallback(() => {
    void fetchAllMyRequests()
      .then((r) => setGroups(groupRequests(r.requests)))
      .catch(() => {});
  }, []);

  /* Keyed on the ACCOUNT, not on mount (owner, 2026-08-30). Signing in through the modal does not
     remount this page, so with `[]` a renter who arrived as a guest kept the guest's answers — no
     requests, no bids — until they reloaded. `sessionKey` moves the moment the account does; its
     note in `lib/session` says why it carries the tier and the status too.

     `setGroups(null)` on the way in, so the table shows its loading state rather than the previous
     account's rows while the new ones are on the wire. */
  useEffect(() => {
    if (status === "loading") return;
    let live = true;
    setGroups(null);
    setBids(null);
    void fetchAllMyRequests()
      .then((r) => live && setGroups(groupRequests(r.requests)))
      .catch(() => live && setGroups([]));
    void fetchReceivedBids()
      .then((r) => live && setBids(r.bids))
      .catch(() => live && setBids([]));
    return () => {
      live = false;
    };
  }, [sessionKey, status]);


  /**
   * The off-platform bids for the renter's own requests, fanned out over his groups.
   *
   * One call per GROUP, not per item: the agents endpoint resolves the whole fan-out from any of its
   * request ids and returns every submission on it, so asking for the first item covers the rest.
   *
   * Capped at `LINK_FANOUT_MAX` groups, newest first. A renter with sixty live requests would
   * otherwise open his dashboard on sixty parallel reads to state a count in a card five rows tall;
   * the workspace remains the place that shows every bid on a request, and it reads that request
   * directly.
   */
  useEffect(() => {
    // Skipped only while the session is still resolving — the same guard the received-bids read
    // above uses. Stricter than that (`=== "authed"`) and a dashboard whose session is revalidating
    // shows the app's bids and silently drops the shared-link ones for the same renter.
    if (!groups?.length || status === "loading") return;
    let live = true;
    void Promise.all(
      groups.slice(0, LINK_FANOUT_MAX).map(async (g) => {
        const first = g.items[0];
        if (!first) return [] as LinkRailBid[];
        const envelope = await loadSubs(first.id);
        // One rail row per ITEM of a submission, the same cut the workspace makes: an off-platform
        // supplier can answer several lines of one RFQ, and each line is its own offer with its own
        // price.
        return (envelope?.submissions ?? []).flatMap((sub) =>
          (sub.items.length ? sub.items : [undefined]).map((it) => {
            const requestId = it?.requestId ?? first.id;
            // The machine as the REQUEST names it — subtype · size — read off the group's own item
            // rather than off the submission, which carries only the label the form showed.
            const row = g.items.find((x) => x.id === requestId) ?? first;
            return {
              card: submissionToBidCard(sub, it),
              requestId,
              machine: (ar ? row.item?.nameAr || row.item?.name : row.item?.name) ?? it?.label ?? "",
              location: g.locationLabel,
            };
          }),
        );
      }),
    ).then((rows) => live && setLinkBids(rows.flat()));
    return () => {
      live = false;
    };
  }, [groups, status, loadSubs, ar]);

  /** Resolve the deadline for the rows on screen, link first and the window only if it is unset.
   *  A row the status has already answered is skipped — there is nothing a date could add to it. */
  useEffect(() => {
    if (!groups) return;
    let live = true;
    // Seed every row from `expiresAt`, which the list payload already carries — no call, no wait, and
    // no dash on a request that has a perfectly good deadline. The lookups below can only refine this.
    setExpiry((prev) => {
      const seeded = { ...prev };
      for (const g of groups) {
        if (seeded[g.id] || !g.expiresAt) continue;
        seeded[g.id] = expiryState(requestExpiry({ expiresAt: g.expiresAt, createdAt: g.createdAt }));
      }
      return seeded;
    });
    for (const g of (allRequests ? groups : groups.slice(0, SHOWN))) {
      const first = g.items[0];
      if (!first || groupBiddingClosed(g.items)) continue;
      void (async () => {
        let bidDeadline: string | null = null;
        try {
          bidDeadline = (await loadSubs(first.id))?.bidDeadline ?? null;
        } catch {
          /* the link tracker is optional — fall through to the window */
        }
        let offerDuration: string | null = null;
        /**
         * The detail's OWN `expiresAt`, which is where this date actually lives (owner, 2026-08-30:
         * *"why closes in request table still doesn't show anything"*).
         *
         * This call was already being made and only `offerDuration` was read off it — while
         * `expiresAt`, the one field that answers the question, was taken from the LIST row instead
         * and was null there. The mobile app reads it from exactly this response
         * (`supplier_request_detail_page.dart:427`, `detail['expiresAt']`) and from no list, which
         * is the tell: the list payload does not carry it.
         *
         * So all three sources came up empty and the column drew nothing on every row. Most renters
         * never set a link deadline; `offerDuration` is null on every request in staging, as
         * `request-expiry.ts` records in its own note. The seeding above still stands — it costs no
         * call, and it will start answering the day the list payload does carry the field.
         */
        let detailExpiresAt: string | null = null;
        if (!bidDeadline) {
          try {
            const detail = await fetchRequestDetail(first.id);
            offerDuration = typeof detail.offerDuration === "string" ? detail.offerDuration : null;
            detailExpiresAt = typeof detail.expiresAt === "string" ? detail.expiresAt : null;
          } catch {
            /* no window either — the row simply shows no date */
          }
        }
        if (!live) return;
        const state = expiryState(
          requestExpiry({
            bidDeadline,
            // The detail's value first: the list's is a roll-up of a field the list may not carry.
            expiresAt: detailExpiresAt ?? g.expiresAt,
            createdAt: g.createdAt,
            offerDuration,
          }),
        );
        setExpiry((prev) => ({ ...prev, [g.id]: state }));
      })();
    }
    return () => {
      live = false;
    };
  }, [groups, allRequests, loadSubs]);

  if (groups && !groups.length) return null;

  /* Dismissed groups leave the feed here, at the last moment — so «+N more» and the summary above
     both count what is actually on screen. */
  const visible = (groups ?? []).filter((g) => !hidden.includes(g.id));
  const rows = allRequests ? visible : visible.slice(0, SHOWN);
  const appBids = bids ?? [];
  const fresh = appBids.reduce((n, b) => n + (b.unreadCount || 0), 0);

  /* ── One rail, two sources (owner, 2026-09-05) ────────────────────────────────────────────────
     App bids and shared-link submissions are different records with different fields, and the rail
     is one list of one thing: somebody offered a price on a machine. So both are flattened to the
     four facts the card states — who, how much, which machine, where — and merged newest first.

     `at` sorts them: an off-platform bid submitted this morning belongs above an app bid from
     Tuesday. A row with no date sorts last rather than first, so a missing timestamp cannot push a
     bid to the top of the renter's attention. */
  const railRow = (b: InboxBid): RailBid => ({
    key: `app:${b.bidId}`,
    name: b.supplierName,
    price: b.currentPrice,
    priceUnit: b.priceUnit,
    // The machine the REQUEST names, not the model the supplier listed (owner, 2026-09-05).
    machine: machineWords(
      ar ? b.equipment.subtypeAr ?? b.equipment.subtype : b.equipment.subtype,
      ar ? b.equipment.sizeAr ?? b.equipment.size : b.equipment.size,
    ) || b.request.equipmentSummary || b.equipmentName,
    location: b.request.location,
    offPlatform: false,
    at: b.createdAt,
    // Every app bid opens the workspace; `r` names the request so it lands on the right one.
    href: b.request.id ? `/requests?r=${encodeURIComponent(b.request.id)}` : "/requests",
  });
  const linkRow = (b: LinkRailBid): RailBid => ({
    key: `link:${b.card.id}`,
    name: b.card.supplierName,
    price: b.card.price,
    priceUnit: b.card.priceUnit,
    machine: b.machine,
    location: b.location,
    offPlatform: true,
    at: b.card.submittedAt,
    href: `/requests?r=${encodeURIComponent(b.requestId)}`,
  });
  const bidList: RailBid[] = [...appBids.map(railRow), ...linkBids.map(linkRow)].sort(
    (x, y) => (y.at ?? "").localeCompare(x.at ?? ""),
  );
  const newest = allBids ? bidList : bidList.slice(0, BIDS_SHOWN);
  const restBids = Math.max(0, bidList.length - BIDS_SHOWN);

  const money = (n: number | null): string => (n == null ? "—" : Math.round(n).toLocaleString("en-US"));
  /** «/ month», «/ day» — the same four words the store's own prices carry, so one rental basis is
   *  written one way across the product (owner, 2026-09-05). Nothing for a basis nobody sent. */
  const priceUnitWord = (unit: string | null): string | null =>
    unit === "PER_MONTH" ? t.store.perMonth
    : unit === "PER_WEEK" ? t.store.perWeek
    : unit === "PER_JOB" ? t.store.perJob
    : unit === "PER_DAY" ? t.store.perDay
    : null;

  /**
   * The dismissal explainer, shown ONCE per device.
   *
   * Taking a closed request off the feed looks like deleting it, and it is not — the request stays
   * in the account and on every other device. That is worth saying, and worth saying only the first
   * time: a renter clearing six finished requests should not answer the same dialog six times.
   *
   * Cancellation is the opposite and always confirms, because it is a `DELETE` the backend has no
   * inverse for. See `doCancel`.
   */
  const EXPLAINED_KEY = "mt-dismiss-explained";
  const wasExplained = () => {
    try {
      return localStorage.getItem(EXPLAINED_KEY) === "1";
    } catch {
      return false; // storage refused — explain again rather than dismiss silently
    }
  };

  /** Take a closed group off this device's feed, and offer it straight back. */
  const dismiss = (g: RequestGroup) => {
    setHidden(hideRequest(g.id));
    setUndo({ id: g.id, label: g.locationLabel });
    setExplaining(null);
  };

  /** The ✕ on a CLOSED row: explain the first time, dismiss every time after. */
  const askDismiss = (g: RequestGroup) => {
    if (wasExplained()) {
      dismiss(g);
      return;
    }
    setExplaining(g);
  };

  const confirmExplainer = (g: RequestGroup) => {
    try {
      localStorage.setItem(EXPLAINED_KEY, "1");
    } catch {
      /* storage refused — he will be told again, which is the safe direction */
    }
    dismiss(g);
  };

  const doCancel = async () => {
    const g = cancelling;
    if (!g || cancelBusy) return;
    setCancelBusy(true);
    setCancelError(null);
    try {
      // Every cancellable item of the group — the backend refuses the rest, and a partial group is
      // a real state: one item accepted, the others still open.
      await Promise.all(cancellableItems(g.items).map((i) => cancelRequest(i.id)));
      setCancelling(null);
      reload();
    } catch {
      setCancelError(L("That didn’t go through. Try again.", "لم يتمّ الإجراء. حاول مجددًا."));
    } finally {
      setCancelBusy(false);
    }
  };

  /** «Closed» / «3 days left» / «Today» / «Expired» — and nothing at all when there is no deadline
   *  and no status to speak for it. `closed` is checked first; see the block comment above. */
  const closesWords = (g: RequestGroup) => {
    if (groupBiddingClosed(g.items)) return { label: t.home.reqClosed, tone: "danger" as const };
    const s = expiry[g.id];
    if (!s || s.kind === "none") return null;
    if (s.kind === "expired") return { label: t.home.reqExpired, tone: "danger" as const };
    if (s.kind === "today") return { label: t.home.reqToday, tone: "warn" as const };
    return {
      label: s.days === 1 ? t.home.reqOneDayLeft : fmt(t.home.reqDaysLeft, { n: String(s.days) }),
      tone: s.days <= 2 ? ("warn" as const) : ("ok" as const),
    };
  };

  /** The same sentence for ONE item of a multi-item group.
   *
   *  Each fanned-out item is its own request with its own `expiresAt` and its own status, so a group
   *  whose crane is still taking bids and whose loader has been awarded must not be described by one
   *  date. Read straight off the item — no lookup, because `expiresAt` rides on the list payload. */
  const itemClosesWords = (it: RequestGroup["items"][number]) => {
    if (groupBiddingClosed([it])) return { label: t.home.reqClosed, tone: "danger" as const };
    const st = expiryState(requestExpiry({ expiresAt: it.expiresAt, createdAt: it.createdAt }));
    if (st.kind === "none") return null;
    if (st.kind === "expired") return { label: t.home.reqExpired, tone: "danger" as const };
    if (st.kind === "today") return { label: t.home.reqToday, tone: "warn" as const };
    return {
      label: st.days === 1 ? t.home.reqOneDayLeft : fmt(t.home.reqDaysLeft, { n: String(st.days) }),
      tone: st.days <= 2 ? ("warn" as const) : ("ok" as const),
    };
  };

  return (
    <section {...pin("home-requests")} className="flex flex-col gap-3">
      {/* Section header — the owner's option G (2026-08-29): a navy plate carrying the section's
          glyph, the title over its summary, the action on the trailing edge. No band and no box —
          the page already has enough bordered rectangles, and the plate is what the eye finds. */}
      <div className="flex items-center gap-3">
        <span className="grid size-[38px] flex-none place-items-center rounded-sm bg-navy text-surface">
          <Icon name="assignment" size={22} />
        </span>
        <span className="min-w-0">
          <h2 className="text-title font-extrabold text-navy">{t.home.yourRequests}</h2>
          <span className="mt-0.5 block text-meta text-muted">
            {fmt(t.home.reqSummary, { n: String(groups?.length ?? 0), bids: String(fresh) })}
          </span>
        </span>
        <span className="flex-1" />
        <button type="button" onClick={() => router.push("/requests")} className={btn("link", "sm")}>
          {t.home.viewAll}
        </button>
      </div>

      {/* The table and the rail are ONE row: the bids are what these requests came back with, and a
          rail underneath would have read as a second, unrelated list. */}
      <div className="grid items-stretch gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className={cx(CARD, "flex min-w-0 flex-col overflow-hidden")}>
          <div className="flex-1 overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-surface2">
                  {[t.home.colSite, t.home.colEquipment, t.home.colBids, t.home.colCloses].map((h) => (
                    <th
                      key={h}
                      className="h-[34px] whitespace-nowrap border-b border-border px-3.5 text-start text-label font-extrabold uppercase tracking-wide text-muted-dark"
                    >
                      {h}
                    </th>
                  ))}
                  <th className="h-[34px] border-b border-border px-3.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map((g) => {
                  /* ── A multi-item request is a row per item (owner, 2026-08-30) ────────────────
                     *"For a multi-item request show each item in a row inside the one request, and
                     each row item has its bids and actions — so 2 subrows from the 1 location."*

                     It used to be one row per GROUP: the first machine's name, `+1 more` beside it,
                     and a single bid count that was the sum. A renter with a crane and a loader on
                     one site could not see which of them had the two bids, and «Compare bids» took
                     him to the group rather than to the machine he was reading.

                     So the location spans, and each item states its own machine, its own count, its
                     own deadline and its own controls. A single-item request is the same markup with
                     a span of one, which is why there is no second branch here. */
                  const canCancel = cancellableItems(g.items).length > 0;
                  return g.items.map((it, i) => {
                  const name = it.item ? (ar ? it.item.nameAr || it.item.name : it.item.name) : it.code || it.displayId;
                  // One item still reads as one request: the group's own line, not an item footnote.
                  const words = g.items.length > 1 ? itemClosesWords(it) : closesWords(g);
                  return (
                    /* ── The row IS the way in (owner, 2026-08-29) ────────────────────────────────
                       *"Clicking on a request row will open the request details."* The largest
                       target on the row now does the most, and the icons beside it are shortcuts
                       past the drawer's front page rather than the only way through it. Each of them
                       stops the press from reaching the row, so a share never lands on details. */
                    <tr
                      key={it.id}
                      onClick={() => setOpen({ group: g, share: false })}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setOpen({ group: g, share: false });
                        }
                      }}
                      title={t.home.reqOpenDetails}
                      className={cx(ROW_H, "cursor-pointer border-b border-border transition last:border-b-0 hover:bg-surface2")}
                    >
                      {/* ── Nothing in a table row is bold (owner, 2026-08-30) ──────────────────
                          Every column was carrying weight — extrabold sites, semibold machines,
                          semibold counts, extrabold dates — and a row where everything is
                          emphasised has nothing emphasised. Weight is now spent once, on the site,
                          which is the column a renter scans down. The rest is regular, and colour
                          alone carries urgency in CLOSES. */}
                      {/* Drawn once and spanned down the group's items — the site is the one thing
                          they genuinely share, and repeating it would read as several requests to the
                          same place rather than one request for several machines. */}
                      {i === 0 && (
                        <td className="px-3.5 align-top" rowSpan={g.items.length}>
                          <span className="flex items-center gap-1.5 pt-[18px] text-body font-semibold text-navy">
                            <Icon name="location_on" size={16} className="flex-none text-muted" />
                            {g.locationLabel}
                          </span>
                        </td>
                      )}
                      <td className="px-3.5">
                        {/* `+N more` is gone: the others are on the rows below, named. */}
                        <span className="text-body text-navy">{name}</span>
                        {(it.item?.qty ?? 1) > 1 && (
                          <span className="text-meta text-muted"> ×{it.item?.qty}</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3.5">
                        <span className={cx("text-subhead tabular", it.bidCount ? "text-navy" : "text-danger")}>
                          {it.bidCount}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3.5">
                        {words ? (
                          <span
                            className={cx(
                              "text-meta font-semibold",
                              words.tone === "danger" ? "text-danger" : words.tone === "warn" ? "text-warn-deep" : "text-navy-mid",
                            )}
                          >
                            {words.label}
                          </span>
                        ) : (
                          <span className="text-meta text-muted-light">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3.5 text-end">
                        {/* ── Two on the row, not three (owner, 2026-09-02) ─────────────────────
                            Share invites bids and ✕ ends it. Icons rather than words: labelled
                            buttons would be wider than the request they act on, and each carries its
                            sentence on `title`.

                            ~~A pen between them.~~ Removed: it opened the request's own dialog,
                            which is where the row already goes when you press it — so the row had a
                            control that did what the row does, and a renter deciding whether to edit
                            had to tell a 28px pen apart from a 28px share and a 28px cross. Editing
                            lives on the dialog it belongs to, beside Share and Cancel.

                            ✕ renders only where the backend will actually take it
                            (`cancellableItems`) — a control that exists and then refuses is worse
                            than one that was never offered. «Compare bids» is the row's one filled
                            button, and now its first: it is the thing the renter came to do. */}
                        <span className="inline-flex items-center gap-1">
                          {/* ── Compare bids first, the icons last (owner, 2026-09-02) ─────────
                              *"Show the icons without box and keep them at the end of the row, the
                              compare bids before."*

                              It reads in the order of intent: the thing the renter came to do, then
                              the two things they might do instead. With the boxes gone the filled
                              button is the only drawn control in the cell, so the eye lands on it
                              first and the icons sit quietly after it. */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              // The one action that IS another page: comparing bids is the
                              // workspace's whole job, not a dialog's.
                              // `i` lands the workspace on THIS machine rather than the group's
                              // first — the row the renter pressed is the one he wants open.
                              router.push(
                                g.items.length > 1
                                  ? `/requests?g=${encodeURIComponent(g.id)}&i=${encodeURIComponent(it.id)}`
                                  : `/requests?g=${encodeURIComponent(g.id)}`,
                              );
                            }}
                            disabled={!it.bidCount}
                            className={btn("primary", "sm")}
                          >
                            {t.home.compareBids}
                          </button>

                          <RowAction icon="ios_share" label={t.home.reqShare} onPress={() => setOpen({ group: g, share: true })} />
                          {/* ── One ✕, two meanings, and the row's state decides which ─────────
                              While the request can still be cancelled, ✕ cancels it. Once it is
                              closed it can't be, and the ✕ takes it off the feed instead — which
                              is the control that was missing: a finished request had no way off
                              the dashboard at all. Both are destructive-looking, so both are
                              labelled for what they actually do. */}
                          {canCancel && cancellableItems([it]).length > 0 ? (
                            <RowAction icon="close" label={t.home.reqCancel} tone="danger" onPress={() => setCancelling(g)} />
                          ) : (
                            <RowAction icon="close" label={L("Remove from this list", "إزالة من هذه القائمة")} onPress={() => askDismiss(g)} />
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                  });
                })}
                {/* ── Loading looks like loading, not like nothing (owner, 2026-08-30) ────────────
                    ~~One cell with an ellipsis in it.~~ *"At first it shows empty data."* It did: a
                    single centred «…» in a table of five empty rows is indistinguishable from a
                    renter who has no requests, so the first thing the dashboard said was the wrong
                    answer, and then it changed its mind.

                    Rows of the real height, with the shape of the real content pulsing in them. The
                    table does not resize when the data lands, and nobody reads it as an answer. */}
                {!groups &&
                  Array.from({ length: SHOWN }, (_, i) => (
                    <tr key={`sk-${i}`} className={cx(ROW_H, "border-b border-border last:border-b-0")}>
                      <td className="px-3.5"><span className="block h-3 w-40 animate-pulse rounded-sm bg-surface2" /></td>
                      <td className="px-3.5"><span className="block h-3 w-32 animate-pulse rounded-sm bg-surface2" /></td>
                      <td className="px-3.5"><span className="block h-3 w-6 animate-pulse rounded-sm bg-surface2" /></td>
                      <td className="px-3.5"><span className="block h-3 w-16 animate-pulse rounded-sm bg-surface2" /></td>
                      <td className="px-3.5"><span className="ms-auto block h-3 w-24 animate-pulse rounded-sm bg-surface2" /></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {/* ── The rest, said rather than implied (owner, 2026-08-29) ────────────────────────
              *"Why it only shows 3 request while there is 20 mentioned?"* — because the header
              summarises the renter's whole account and the table shows the newest few, and nothing on
              the block said so. The rail already had this problem and this is its answer, mirrored:
              the remainder, on the card's own foot, as the way to the rest. */}
          {visible.length > SHOWN && (
            <button
              type="button"
              onClick={() => setAllRequests((v) => !v)}
              aria-expanded={allRequests}
              className="flex flex-none items-center justify-center gap-1 border-t border-border bg-surface2 py-1.5 text-label font-extrabold text-muted-dark transition hover:bg-surface3 hover:text-navy"
            >
              <Icon name={allRequests ? "keyboard_arrow_up" : "keyboard_arrow_down"} size={14} />
              {allRequests ? t.home.showFewer : fmt(t.home.moreRequests, { n: String(visible.length - SHOWN) })}
            </button>
          )}
        </div>

        {/* The bids rail — supplier, price, machine, site. One line of each, newest first. */}
        <aside className={cx(CARD, "@container/bidrail flex min-h-0 flex-col overflow-hidden")}>
          {/* ── One orange on the page (owner, 2026-08-30) ────────────────────────────────────────
              ~~`text-brand-deep` on both.~~ #b45309 was a SECOND orange sitting beside the #f79009
              buttons, and it existed for a good reason: the brand orange on this peach strip is
              2.18:1, which is not readable at 13px. So the fix is not to force the brand orange onto
              the text — that trades a colour clash for an unreadable heading.

              The text goes navy instead: 13.1:1, and the strip keeps its ground. The GLYPH keeps the
              orange, where a 2.18:1 contrast does not matter because nothing is being read — it is a
              mark, and it is what ties the strip to the brand. One orange left on the page. */}
          <div className="flex h-[34px] flex-none items-center gap-2 border-b border-brand-pale bg-brand-soft px-3">
            <Icon name="gavel" size={16} className="text-brand" />
            <h3 className="text-body font-extrabold text-navy">
              {fmt(t.home.newBidsCount, { n: String(bidList.length) })}
            </h3>
          </div>
          {/* ── The rail scrolls DOWN and never sideways (owner, 2026-09-04) ────────────────────
              *"Make sure all these fit in one notification card and doesn't require to scroll
              horizontal, it looks weird."* It did, and not because of the content: `overflow-y-auto`
              alone leaves overflow-x at `visible`, and CSS computes `visible` to `auto` when the
              other axis scrolls. So the column had a horizontal scrollbar the moment a supplier's
              name, a price and a site were wider than 300px — which is most of them. Stated on both
              axes, the row is clipped and truncated instead, which is what the truncation below is
              for. */}
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
            {newest.map((b) => (
              <button
                key={b.key}
                type="button"
                onClick={() => router.push(b.href)}
                className={cx(ROW_H, "flex w-full items-center gap-2.5 border-b border-border px-3 text-start transition last:border-b-0 hover:bg-surface2")}
              >
                <span className="grid size-7 flex-none place-items-center rounded-full border border-border bg-surface3 text-label font-extrabold text-navy">
                  {b.name.trim().charAt(0) || "?"}
                </span>
                {/* Four facts, two lines, one card (owner, 2026-09-04): who bid and for how much,
                    then the machine he bid on and where the job is. The price is the only thing that
                    never yields — a number cut in half is a wrong number, so it keeps its width and
                    the NAME truncates beside it.

                    The MACHINE is the request's own words — subtype · size, «Excavator · 20 ton» —
                    not the supplier's listing (owner, 2026-09-05: *"show equipment subtype and size,
                    not model and year"*). «Caterpillar 320» answers which machine he is offering; on
                    a rail of incoming bids the renter is scanning for which machine was ASKED for,
                    and two firms offering the same 20-tonner under different model numbers read as
                    two unrelated machines.

                    The price carries its UNIT for the same reason (owner, same day): 500 a day and
                    500 a month are not comparable numbers, and the rail sits next to a table of
                    requests whose rental basis varies row by row.

                    The site is the one that goes when the card is tight: it is the least of the four
                    (the renter usually knows where his own job is), so below 260px of rail it is
                    dropped rather than shortened to two letters. `@container` measures the RAIL, not
                    the viewport — this card is 300px beside the table on a desktop and full width on
                    a phone, so a viewport breakpoint would hide it in exactly the wrong one. */}
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="min-w-0 truncate text-body font-extrabold text-navy">{b.name}</span>
                    <span className="ms-auto flex-none whitespace-nowrap text-body font-semibold tabular text-navy">
                      {money(b.price)}
                      {b.price != null && priceUnitWord(b.priceUnit) && (
                        <span className="text-label font-semibold text-muted"> {priceUnitWord(b.priceUnit)}</span>
                      )}
                    </span>
                  </span>
                  <span className="mt-0.5 flex items-baseline gap-1.5 text-meta text-muted">
                    {/* A bid that came through the shared link has no account and no chat behind it,
                        so the row says where it came from rather than leaving the renter to find out
                        by pressing it. It takes the BID CARD's words («Via your link»), not the
                        filter tab's — a rail row is one bid, and the filter is a question about all
                        of them (owner, 2026-09-06). */}
                    {b.offPlatform && (
                      <span className="flex-none rounded-sm bg-surface2 px-1.5 text-label font-semibold text-muted-dark">
                        {t.workspace.sourceOfflineLong}
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate">{b.machine || "—"}</span>
                    {b.location && (
                      <span className="hidden min-w-0 max-w-[45%] shrink-0 truncate @[260px]/bidrail:block">
                        · {b.location}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            ))}
            {/* ── Loading looks like loading here too ────────────────────────────────────────── */}
            {bids === null &&
              Array.from({ length: BIDS_SHOWN }, (_, i) => (
                <div key={`skb-${i}`} className={cx(ROW_H, "flex items-center gap-2.5 border-b border-border px-3 last:border-b-0")}>
                  <span className="size-7 flex-none animate-pulse rounded-full bg-surface2" />
                  <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span className="block h-3 w-28 animate-pulse rounded-sm bg-surface2" />
                    <span className="block h-2.5 w-40 animate-pulse rounded-sm bg-surface2" />
                  </span>
                </div>
              ))}
            {bids !== null && !newest.length && (
              <p className="px-3 py-6 text-center text-meta text-muted">{t.home.noBidsYet}</p>
            )}
          </div>
          {/* ── There are more, and the rail says so (owner, 2026-08-29) ─────────────────────────
              A list cut off at five looks the same as a list of five. The strip is pinned under the
              scroller rather than being its last row, so it does not scroll away at the moment it
              becomes true — and it states the REMAINDER, since «5 shown» is a fact about the box and
              «13 more» is a fact about the renter's bids. */}
          {restBids > 0 && (
            <button
              type="button"
              onClick={() => setAllBids((v) => !v)}
              aria-expanded={allBids}
              className="flex flex-none items-center justify-center gap-1 border-t border-border bg-surface2 py-1.5 text-label font-extrabold text-muted-dark transition hover:bg-surface3 hover:text-navy"
            >
              <Icon name={allBids ? "keyboard_arrow_up" : "keyboard_arrow_down"} size={14} />
              {allBids ? t.home.showFewer : fmt(t.home.moreBidsBelow, { n: String(restBids) })}
            </button>
          )}
        </aside>
      </div>
      {/* ══ The dialogs, mounted HERE so the dashboard is what sits behind them ══════════════════ */}

      {open && (
        <RequestDetailsModal
          group={open.group}
          item={open.group.items[0] ?? null}
          bids={openBids}
          link={openLink}
          openShare={open.share}
          onClose={() => setOpen(null)}
          onChanged={reload}
        />
      )}

      {/* Cancelling ALWAYS asks, and asks in full. It is a `DELETE` the backend has no inverse for,
          so this dialog is the only place it can still be stopped. */}
      {cancelling && (
        <ConfirmCancelModal
          ar={ar}
          L={L}
          busy={cancelBusy}
          error={cancelError}
          scope={{
            kind: "all",
            idLabel: cancelling.groupRef ?? cancelling.items[0]?.displayId ?? cancelling.id,
            total: cancellableItems(cancelling.items).length,
          }}
          onClose={() => {
            setCancelling(null);
            setCancelError(null);
          }}
          onConfirm={() => void doCancel()}
        />
      )}

      {/* The one-time explainer. It says what dismissal is NOT, because ✕ on a row that a moment ago
          meant «cancel» now means «hide», and the two are nothing alike. */}
      {explaining && (
        <Dialog
          open
          onClose={() => setExplaining(null)}
          size="sm"
          icon={
            <span className="grid h-[34px] w-[34px] flex-none place-items-center rounded-sm bg-surface3 text-navy-mid">
              <Icon name="visibility_off" size={19} />
            </span>
          }
          title={L("Remove it from this list?", "إزالة من هذه القائمة؟")}
          footer={
            <>
              <button onClick={() => setExplaining(null)} className={btn("secondary", "md", { className: "transition" })}>
                {t.common.cancel}
              </button>
              <button onClick={() => confirmExplainer(explaining)} className={btn("primary", "md", { className: "transition" })}>
                {L("Remove it", "إزالة")}
              </button>
            </>
          }
        >
          <p className="text-body leading-relaxed text-muted">
            {L(
              "This only hides the request from your dashboard on this device. It is not cancelled, nothing is deleted, and it stays in your account and on your other devices. You can put it back straight after.",
              "هذا يخفي الطلب من لوحتك على هذا الجهاز فقط. لم يُلغَ ولم يُحذف شيء، ويبقى في حسابك وعلى أجهزتك الأخرى. ويمكنك إعادته فورًا.",
            )}
          </p>
          <p className="mt-2 text-meta text-muted-light">
            {L("You won’t be asked this again.", "لن يُطرح عليك هذا السؤال مرة أخرى.")}
          </p>
        </Dialog>
      )}

      {/* The way back. It sits on the page rather than inside a dialog, because an undo the renter
          has to dismiss a dialog to reach is not an undo. It stays until he takes it or closes it —
          no timer, since a bar that disappears while he is reading it is the same as no bar. */}
      {undo && (
        <div
          role="status"
          className="fixed bottom-6 start-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-md border border-border bg-surface px-3.5 py-2.5 rtl:translate-x-1/2"
        >
          <span className="text-body text-navy">
            {L(`“${undo.label}” removed from your list`, `تمت إزالة “${undo.label}” من قائمتك`)}
          </span>
          <button
            type="button"
            onClick={() => {
              setHidden(unhideRequest(undo.id));
              setUndo(null);
            }}
            className={btn("link", "sm")}
          >
            {L("Undo", "تراجع")}
          </button>
          <button
            type="button"
            onClick={() => setUndo(null)}
            aria-label={t.common.close}
            className="grid size-6 flex-none place-items-center rounded-sm text-muted transition hover:bg-surface2 hover:text-navy"
          >
            <Icon name="close" size={15} />
          </button>
        </div>
      )}
    </section>
  );
}

/**
 * One icon action on a request row.
 *
 * `stopPropagation` is the whole point of it existing as a component: every one of these sits inside
 * a row that is itself a button into the details, and an action that let the press through would do
 * two things at once.
 */
function RowAction({
  icon,
  label,
  onPress,
  tone,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  tone?: "danger";
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onPress();
      }}
      aria-label={label}
      title={label}
      /* ── No box (owner, 2026-09-02) ──────────────────────────────────────────────────────────
         ~~A bordered 28px tile each.~~ Two outlined boxes beside a filled button made the row end in
         three competing buttons, and the two that matter least were the ones drawn most like the
         one that matters: same size, same border, same ground. An icon on its own reads as a
         secondary action, which is what these are.
         The 28px target stays — only the paint goes, so nothing gets harder to hit. The hover is
         the ground rather than the border, which is how the app's other bare icon controls behave. */
      className={cx(
        "grid size-7 flex-none place-items-center rounded-sm transition hover:bg-surface2",
        tone === "danger" ? "text-danger hover:text-danger" : "text-muted hover:text-navy",
      )}
    >
      <Icon name={icon} size={15} />
    </button>
  );
}
