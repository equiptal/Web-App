"use client";

/**
 * `/bids/[bidId]/equipment` — the deal-room equipment-verification surface (spec 004, V1).
 *
 * **Keyed on `bidId`, never `dealRoomId`.** Most bids have no room, and creating one to open a
 * READ-ONLY view would freeze the supplier's offered count (`BID_OFFER_LOCKED`). §4 assumption 3 says
 * the two are interchangeable *once a room exists*; `bidId` is the one that always does.
 *
 * **Why a route rather than a view inside the bids list.** The all-bids view is being redesigned with
 * several entry points, so the surface must not be coupled to one caller. As a route, every entry
 * point — today's bids list, the redesigned all-bids view, the inbox, a notification, a deep link from
 * a supplier's reply — is a link, and none of them needs to know how the surface is built.
 *
 * Chosen over `/deal-room/[bidId]/equipment` deliberately: `/deal-room/[id]` already exists and its
 * `[id]` is a **deal-room** id. Two sibling routes whose first segment means two different ids is the
 * kind of thing that eventually gets a `dealRoomId` passed where a `bidId` belongs — which is exactly
 * the mistake this ticket exists to prevent.
 *
 * **Opening it creates nothing.** Both reads (`GET /api/me/bids/:id` and its fleet) are reads.
 */

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { useAuthGate } from "@/components/auth/AuthGate";
import { BidMapWorkspace } from "@/components/map/BidMapWorkspace";
import { Icon } from "@/components/ui";
import { fetchBidDetail } from "@/lib/api/client";
import { isOffPlatformBid, isOffPlatformBidId } from "@/lib/contract/bid-equipment-access";
import type { BidCard } from "@/lib/contract/bids";
import type { RequestRecord } from "@/lib/contract/requests";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";

export default function BidEquipmentPage({ params }: { params: Promise<{ bidId: string }> }) {
  const { bidId } = use(params);
  const t = useT();
  return (
    <AppShell title={t.bidMap.surfaceTitle}>
      <BidEquipmentGate bidId={decodeURIComponent(bidId)} />
    </AppShell>
  );
}

/** Public web has no route gate, but one bid's equipment needs a session — so a signed-out visitor
 *  gets the auth modal opened in place, with a sign-in prompt behind it (the deal room's pattern). */
function BidEquipmentGate({ bidId }: { bidId: string }) {
  const { status } = useSession();
  const { openAuth } = useAuthGate();
  const t = useT();

  useEffect(() => {
    if (status === "anon") openAuth();
  }, [status, openAuth]);

  if (status === "anon") {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-20 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-surface2 text-navy-mid"><Icon name="lock" size={26} /></span>
        <div>
          <h2 className="text-[17px] font-extrabold text-navy">{t.bidMap.signInTitle}</h2>
          <p className="mt-1 text-[13px] text-muted">{t.bidMap.signInBody}</p>
        </div>
        <button onClick={() => openAuth()} className="rounded-full bg-brand px-5 py-2 text-[13px] font-bold text-white">{t.bidMap.signIn}</button>
      </div>
    );
  }
  if (status !== "authed") return null; // resolving session — avoid flashing the gate

  // RM3-AC-25 — an off-platform bid does not open this surface, and the refusal happens BEFORE the
  // fetch, not after it. `link-…` is a `LinkBidSubmission` id, not a `Bid` id: `GET /marketplace/
  // bids/link-…` cannot resolve one, so fetching first would land in `bidFailed` — "this offer
  // couldn't be loaded… it may have been withdrawn" — which claims the bid does not exist. It does
  // exist; it simply lives somewhere else. Refusing on the id says so, and issues no request at all.
  if (isOffPlatformBidId(bidId)) return <OffPlatformState />;

  return <BidEquipment bidId={bidId} />;
}

/**
 * The one fetch owner on this screen (decision A4, carried over from `GroupBids`): the workspace never
 * fetches the bid, so the freshness rules of §7.5.1 have exactly one implementation.
 *
 * **Freshness is refetch, not push** (§7.5 withdrawn): on mount, on window focus, and manually — with
 * a 15s staleness window so a burst of focus events (alt-tab, devtools, a modal closing) does not fire
 * a request each. Nothing here claims recency, and no copy on the surface implies live updating.
 */
function BidEquipment({ bidId }: { bidId: string }) {
  const t = useT();
  const [bid, setBid] = useState<BidCard | null>(null);
  const [request, setRequest] = useState<RequestRecord | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const lastFetchRef = useRef(0);
  const refreshingRef = useRef(false);

  const STALE_MS = 15_000;

  const load = useCallback(
    async (force: boolean) => {
      if (refreshingRef.current) return;
      if (!force && Date.now() - lastFetchRef.current < STALE_MS) return;
      refreshingRef.current = true;
      setRefreshing(true);
      try {
        const r = await fetchBidDetail(bidId);
        lastFetchRef.current = Date.now();
        setBid(r.bid);
        setRequest(r.request);
        setFailed(false);
      } catch {
        // A failed refetch must never empty what the renter is already reading — only a failure with
        // nothing on screen is a failure worth stating.
        setFailed((prev) => prev || bid == null);
      } finally {
        setRefreshing(false);
        refreshingRef.current = false;
      }
    },
    [bidId, bid],
  );

  // Mount.
  useEffect(() => {
    void load(true);
    // `load` changes identity with `bid`; re-running on that would refetch after every arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bidId]);

  // Focus — the renter comes back from the supplier's reply and expects to see it.
  useEffect(() => {
    const onFocus = () => { void load(false); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  if (failed) {
    return (
      <StatePanel title={t.bidMap.bidFailed} body={t.bidMap.bidFailedWhy} back={t.bidMap.backToBids} />
    );
  }
  if (!bid) {
    return <div className="py-20 text-center text-[13px] font-bold text-muted">{t.bidMap.loadingBid}</div>;
  }
  // RM3-AC-25, second line of defence. The id check above is the one that fires today; this catches a
  // bid that arrives flagged off-platform from a mapper that does not exist yet. Both read the same
  // predicate, so the two can never disagree about what "off-platform" means.
  if (isOffPlatformBid(bid)) return <OffPlatformState />;

  return (
    <BidMapWorkspace
      bid={bid}
      request={request}
      refreshing={refreshing}
      // The surface owns its own writes now (V11/V12): the four requests, the chat dock's first
      // message and the footer's hand-off each create the deal room themselves, and none of them
      // needs a handler from here. V9's company panel still lands with the ticket that owns it, so
      // its entry stays visible and inert rather than pretending a panel opened.
    />
  );
}

/**
 * What an off-platform `bidId` renders (RM3-AC-25, §6.11).
 *
 * **A stated refusal, not a redirect** — decided because there is nothing to redirect *to*. The
 * off-platform flow is `SharedBidSubmissionModal` / `SharedBidNegotiateRoom`, and both are modals
 * opened from a bids list by local state (`setSubmissionBid(b)`); neither has a URL. Sending the
 * renter to a URL that reopens his submission would mean inventing a deep-link contract for a flow
 * §6.11 says this spec "adds nothing to" — so the surface names the offer's origin, says why there is
 * nothing here to verify, and points at the list the viewer actually opens from. Reversible: if a
 * deep link is ever added, this component is the single place that becomes a redirect.
 *
 * It renders no half-surface: no panel, no map, no counts — none of which has a referent when the
 * offer carries items rather than registered machines.
 */
function OffPlatformState() {
  const t = useT();
  return (
    <StatePanel title={t.bidMap.offPlatformNotHere} body={t.bidMap.offPlatformNotHereWhy} back={t.bidMap.backToBids} />
  );
}

/** A stated outcome with a way back — never an empty screen, and never card furniture for a bid that
 *  is not being shown (§6.13 / RM3-AC-26's rule, applied to the route's own states). */
function StatePanel({ title, body, back }: { title: string; body: string; back: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-20 text-center">
      <h2 className="text-[17px] font-extrabold text-navy">{title}</h2>
      <p className="text-[13px] leading-relaxed text-muted">{body}</p>
      <Link href="/requests" className="rounded-full border border-border px-5 py-2 text-[13px] font-bold text-navy">{back}</Link>
    </div>
  );
}
