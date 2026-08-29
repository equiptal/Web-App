"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui";
import { fetchAllMyRequests, fetchReceivedBids, fetchRequestSubmissions, fetchRequestDetail } from "@/lib/api/client";
import { groupRequests, type RequestGroup } from "@/lib/contract/requests";
import type { InboxBid } from "@/lib/contract/inbox";
import { requestExpiry, expiryState, type ExpiryState } from "@/lib/contract/request-expiry";
import { btn, CARD, cx } from "@/lib/ds";
import { fmt, useLocale, useT } from "@/lib/i18n";
import { pin } from "@/lib/uiPins";

/** The dashboard shows the newest few and hands the rest to the workspace. */
const SHOWN = 3;
/** The rail is the same height as the table beside it; more than this scrolls inside it. */
const BIDS_SHOWN = 6;

/**
 * **The renter's requests, and the bids that arrived against them** — the dashboard's first block.
 *
 * Two things on one row: the requests as a dense table, and the newest bids as a rail beside it.
 * They answer the two halves of one question — what did I ask for, and what came back — and a
 * dashboard that made the second a separate destination made the renter go and look for it.
 *
 * ── The expiry column ────────────────────────────────────────────────────────────────────────────
 * NOT the request's status. `REQUEST_STATUS` says what the backend calls the row; what a renter
 * standing here needs is how long suppliers can still answer it. That date has two sources and one
 * order, both held in `request-expiry.ts`:
 *
 *   1. the deadline the renter set himself on the shared bid link (`bidDeadline`), which is also the
 *      date the SUPPLIER's form closes on, so both sides read one date;
 *   2. failing that, the bid window chosen at creation (`offerDuration`) counted from `createdAt`.
 *
 * Neither is on the list payload, so each shown row is resolved with one call — and only for the
 * three rows actually drawn. The window fallback costs a second call, taken only when the renter set
 * no deadline. A row whose lookups fail simply shows no date rather than a wrong one.
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

  /** Resolve the deadline for the rows on screen, link first and the window only if it is unset. */
  useEffect(() => {
    if (!groups) return;
    let live = true;
    for (const g of groups.slice(0, SHOWN)) {
      const first = g.items[0];
      if (!first) continue;
      void (async () => {
        let bidDeadline: string | null = null;
        try {
          bidDeadline = (await fetchRequestSubmissions(first.id)).bidDeadline;
        } catch {
          /* the link tracker is optional — fall through to the window */
        }
        let offerDuration: string | null = null;
        if (!bidDeadline) {
          try {
            const detail = await fetchRequestDetail(first.id);
            offerDuration = typeof detail.offerDuration === "string" ? detail.offerDuration : null;
          } catch {
            /* no window either — the row simply shows no date */
          }
        }
        if (!live) return;
        const state = expiryState(requestExpiry({ bidDeadline, createdAt: g.createdAt, offerDuration }));
        setExpiry((prev) => ({ ...prev, [g.id]: state }));
      })();
    }
    return () => {
      live = false;
    };
  }, [groups]);

  if (groups && !groups.length) return null;

  const rows = (groups ?? []).slice(0, SHOWN);
  const fresh = bids.reduce((n, b) => n + (b.unreadCount || 0), 0);
  const newest = bids.slice(0, BIDS_SHOWN);

  const money = (n: number | null): string => (n == null ? "—" : Math.round(n).toLocaleString("en-US"));

  /** «3 days left» / «Today» / «Expired» — and nothing at all when the request has no deadline. */
  const expiryWords = (s: ExpiryState | undefined) => {
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
                      className="whitespace-nowrap border-b border-border px-3.5 py-2 text-start text-label font-extrabold uppercase tracking-wide text-muted-dark"
                    >
                      {h}
                    </th>
                  ))}
                  <th className="border-b border-border px-3.5 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((g) => {
                  const item = g.items[0]?.item;
                  const name = item ? (ar ? item.nameAr || item.name : item.name) : g.groupRef || g.id;
                  const words = expiryWords(expiry[g.id]);
                  return (
                    <tr key={g.id} className="border-b border-border transition last:border-b-0 hover:bg-surface2">
                      <td className="px-3.5 py-2.5">
                        <span className="flex items-center gap-1.5 text-body font-extrabold text-navy">
                          <Icon name="location_on" size={16} className="flex-none text-muted" />
                          {g.locationLabel}
                        </span>
                      </td>
                      <td className="px-3.5 py-2.5">
                        <span className="text-body font-semibold text-navy">{name}</span>
                        {g.items.length > 1 && (
                          <span className="text-meta text-muted">
                            {" "}
                            {fmt(t.home.reqMoreItems, { n: String(g.items.length - 1) })}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-2.5">
                        <span className={cx("text-subhead font-semibold tabular", g.totalBids ? "text-navy" : "text-danger")}>
                          {g.totalBids}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-2.5">
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
                      <td className="whitespace-nowrap px-3.5 py-2.5 text-end">
                        <button
                          type="button"
                          onClick={() => router.push("/requests")}
                          disabled={!g.totalBids}
                          className={btn("primary", "sm")}
                        >
                          {t.home.compareBids}
                        </button>
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
        </div>

        {/* The bids rail — supplier, price, machine, site. One line of each, newest first. */}
        <aside className={cx(CARD, "flex min-h-0 flex-col overflow-hidden")}>
          <div className="flex flex-none items-center gap-2 border-b border-brand-pale bg-brand-soft px-3 py-2">
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
                className="flex w-full items-start gap-2.5 border-b border-border px-3 py-2 text-start transition last:border-b-0 hover:bg-surface2"
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
        </aside>
      </div>
    </section>
  );
}
