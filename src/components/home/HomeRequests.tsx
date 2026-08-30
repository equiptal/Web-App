"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui";
import { fetchAllMyRequests, fetchReceivedBids, fetchRequestSubmissions, fetchRequestDetail } from "@/lib/api/client";
import { cancellableItems, groupBiddingClosed, groupRequests, type RequestGroup } from "@/lib/contract/requests";
import type { InboxBid } from "@/lib/contract/inbox";
import { requestExpiry, expiryState, type ExpiryState } from "@/lib/contract/request-expiry";
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
  const router = useRouter();

  const [groups, setGroups] = useState<RequestGroup[] | null>(null);
  const [bids, setBids] = useState<InboxBid[]>([]);
  /** Keyed by group id — resolved after the rows are known, so the table paints before the dates do. */
  const [expiry, setExpiry] = useState<Record<string, ExpiryState>>({});

  /** Both cards open in place rather than navigating away (owner, 2026-08-30). They grow to fit every
   *  row: nothing is hidden behind an inner scrollbar, at the cost of the two cards no longer ending
   *  level once one is open. That was the explicit choice — a list the renter has to scroll inside a
   *  box he already scrolled to reach is two scrollbars for one list. */
  const [allRequests, setAllRequests] = useState(false);
  const [allBids, setAllBids] = useState(false);

  useEffect(() => {
    let live = true;
    void fetchAllMyRequests()
      .then((r) => live && setGroups(groupRequests(r.requests)))
      .catch(() => live && setGroups([]));
    void fetchReceivedBids()
      .then((r) => live && setBids(r.bids))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

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
          bidDeadline = (await fetchRequestSubmissions(first.id)).bidDeadline;
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
  }, [groups, allRequests]);

  if (groups && !groups.length) return null;

  const rows = allRequests ? (groups ?? []) : (groups ?? []).slice(0, SHOWN);
  const fresh = bids.reduce((n, b) => n + (b.unreadCount || 0), 0);
  const newest = allBids ? bids : bids.slice(0, BIDS_SHOWN);
  const restBids = Math.max(0, bids.length - BIDS_SHOWN);

  const money = (n: number | null): string => (n == null ? "—" : Math.round(n).toLocaleString("en-US"));

  /** Where a row's action lands: the workspace, on this request, at the door it names. */
  const go = (id: string, door: "details" | "share" | "cancel") =>
    router.push(`/requests?g=${encodeURIComponent(id)}&${door}=1`);

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
                  const item = g.items[0]?.item;
                  const name = item ? (ar ? item.nameAr || item.name : item.name) : g.groupRef || g.id;
                  const words = closesWords(g);
                  const canCancel = cancellableItems(g.items).length > 0;
                  return (
                    /* ── The row IS the way in (owner, 2026-08-29) ────────────────────────────────
                       *"Clicking on a request row will open the request details."* The largest
                       target on the row now does the most, and the icons beside it are shortcuts
                       past the drawer's front page rather than the only way through it. Each of them
                       stops the press from reaching the row, so a share never lands on details. */
                    <tr
                      key={g.id}
                      onClick={() => go(g.id, "details")}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          go(g.id, "details");
                        }
                      }}
                      title={t.home.reqOpenDetails}
                      className={cx(ROW_H, "cursor-pointer border-b border-border transition last:border-b-0 hover:bg-surface2")}
                    >
                      <td className="px-3.5">
                        <span className="flex items-center gap-1.5 text-body font-extrabold text-navy">
                          <Icon name="location_on" size={16} className="flex-none text-muted" />
                          {g.locationLabel}
                        </span>
                      </td>
                      <td className="px-3.5">
                        <span className="text-body font-semibold text-navy">{name}</span>
                        {g.items.length > 1 && (
                          <span className="text-meta text-muted">
                            {" "}
                            {fmt(t.home.reqMoreItems, { n: String(g.items.length - 1) })}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3.5">
                        <span className={cx("text-subhead font-semibold tabular", g.totalBids ? "text-navy" : "text-danger")}>
                          {g.totalBids}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3.5">
                        {words ? (
                          <span
                            className={cx(
                              "text-meta font-extrabold",
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
                        {/* ── The prototype's three, back on the row ────────────────────────────
                            Share invites bids, Edit changes what was asked for, ✕ ends it. Icons
                            rather than words: three labelled buttons would be wider than the request
                            they act on, and each carries its sentence on `title`.

                            ✕ renders only where the backend will actually take it
                            (`cancellableItems`) — a control that exists and then refuses is worse
                            than one that was never offered. «Compare bids» keeps its place as the
                            row's one filled button: it is the thing the renter came to do. */}
                        <span className="inline-flex items-center gap-1">
                          <RowAction icon="ios_share" label={t.home.reqShare} onPress={() => go(g.id, "share")} />
                          <RowAction icon="edit" label={t.home.reqEdit} onPress={() => go(g.id, "details")} />
                          {canCancel && (
                            <RowAction icon="close" label={t.home.reqCancel} tone="danger" onPress={() => go(g.id, "cancel")} />
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/requests?g=${encodeURIComponent(g.id)}`);
                            }}
                            disabled={!g.totalBids}
                            className={cx(btn("primary", "sm"), "ms-1.5")}
                          >
                            {t.home.compareBids}
                          </button>
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {!groups && (
                  <tr>
                    <td colSpan={5} className="px-3.5 py-8 text-center text-body text-muted">
                      …
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {/* ── The rest, said rather than implied (owner, 2026-08-29) ────────────────────────
              *"Why it only shows 3 request while there is 20 mentioned?"* — because the header
              summarises the renter's whole account and the table shows the newest few, and nothing on
              the block said so. The rail already had this problem and this is its answer, mirrored:
              the remainder, on the card's own foot, as the way to the rest. */}
          {groups && groups.length > SHOWN && (
            <button
              type="button"
              onClick={() => setAllRequests((v) => !v)}
              aria-expanded={allRequests}
              className="flex flex-none items-center justify-center gap-1 border-t border-border bg-surface2 py-1.5 text-label font-extrabold text-muted-dark transition hover:bg-surface3 hover:text-navy"
            >
              <Icon name={allRequests ? "keyboard_arrow_up" : "keyboard_arrow_down"} size={14} />
              {allRequests ? t.home.showFewer : fmt(t.home.moreRequests, { n: String(groups.length - SHOWN) })}
            </button>
          )}
        </div>

        {/* The bids rail — supplier, price, machine, site. One line of each, newest first. */}
        <aside className={cx(CARD, "flex min-h-0 flex-col overflow-hidden")}>
          <div className="flex h-[34px] flex-none items-center gap-2 border-b border-brand-pale bg-brand-soft px-3">
            <Icon name="gavel" size={16} className="text-brand-deep" />
            <h3 className="text-body font-extrabold text-brand-deep">
              {fmt(t.home.newBidsCount, { n: String(bids.length) })}
            </h3>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {newest.map((b) => (
              <button
                key={b.bidId}
                type="button"
                onClick={() => router.push("/requests")}
                className={cx(ROW_H, "flex w-full items-center gap-2.5 border-b border-border px-3 text-start transition last:border-b-0 hover:bg-surface2")}
              >
                <span className="grid size-7 flex-none place-items-center rounded-full border border-border bg-surface3 text-label font-extrabold text-navy">
                  {b.supplierName.trim().charAt(0) || "?"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="min-w-0 truncate text-body font-extrabold text-navy">{b.supplierName}</span>
                    <span className="ms-auto flex-none text-body font-semibold tabular text-navy">{money(b.currentPrice)}</span>
                  </span>
                  <span className="mt-0.5 flex items-baseline gap-1.5 text-meta text-muted">
                    <span className="min-w-0 truncate">{b.equipmentName ?? b.request.equipmentSummary ?? "—"}</span>
                    {b.request.location && <span className="flex-none">· {b.request.location}</span>}
                  </span>
                </span>
              </button>
            ))}
            {!newest.length && (
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
      className={cx(
        "grid size-7 flex-none place-items-center rounded-sm border border-border bg-surface transition hover:bg-surface2",
        tone === "danger" ? "text-danger hover:border-danger/40" : "text-navy hover:border-navy-mid/40",
      )}
    >
      <Icon name={icon} size={15} />
    </button>
  );
}
