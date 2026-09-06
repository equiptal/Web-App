"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useT, useLocale } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import { BellIcon, CountBadge } from "@/components/HeaderIcons";
import {
  fetchNotifications,
  fetchNotificationsUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/lib/api/client";
import { notificationHref, type NotificationItem, type NotificationFilter } from "@/lib/contract/notifications";
import { pin } from "@/lib/uiPins";

/**
 * Top-bar notifications bell (app parity). Distinct from the inbox icon (deal-room unread). The badge
 * polls the unread count every 30s (the backend has no count endpoint, so it reads `meta.total` from an
 * unread-filtered list). The dropdown lists notifications grouped by day with an All/Unread filter;
 * clicking an item marks it read (optimistic) and deep-links via `notificationHref`.
 */
const POLL_MS = 30_000;

/**
 * The bell's own element id, so the home page's bubble can measure where the bell IS and hang itself
 * under it. A measured anchor rather than a guessed offset: the header is 52px today, the gutter is
 * `px-4` on a phone and `px-7` from `sm`, and the bell is not the last control on the row.
 */
export const BELL_ANCHOR_ID = "notifications-bell-anchor";

/** «+2 more» on the bubble opens this dropdown. The bell owns `open`, so the ask travels as an
 *  event rather than as a prop through a shell that does not render the bubble. */
export const OPEN_BELL_EVENT = "moeda:open-notifications";

type DayGroup = "today" | "yesterday" | "earlier";

function dayGroupOf(iso: string): DayGroup {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "earlier";
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86_400_000;
  const t = then.getTime();
  if (t >= startOfToday) return "today";
  if (t >= startOfYesterday) return "yesterday";
  return "earlier";
}

/** Shared with the home bubble, which prints the same age in the same words. */
export function relativeTime(iso: string, locale: string, justNow: string): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const diffMs = Date.now() - then.getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return justNow;
  if (min < 60) return locale === "ar" ? `منذ ${min} د` : `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return locale === "ar" ? `منذ ${hr} س` : `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return locale === "ar" ? `منذ ${day} ي` : `${day}d`;
  try {
    return then.toLocaleDateString(locale === "ar" ? "ar" : "en", { day: "numeric", month: "short" });
  } catch {
    return then.toISOString().slice(0, 10);
  }
}

export function NotificationsBell() {
  const t = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const reqId = useRef(0);

  // Poll the unread count for the badge.
  const refreshCount = useCallback(() => {
    fetchNotificationsUnreadCount()
      .then(setUnread)
      .catch(() => {});
  }, []);
  useEffect(() => {
    refreshCount();
    const id = setInterval(refreshCount, POLL_MS);
    return () => clearInterval(id);
  }, [refreshCount]);

  // Load the list whenever the panel opens or the filter changes.
  const load = useCallback((f: NotificationFilter) => {
    const my = ++reqId.current;
    setLoading(true);
    setError(false);
    fetchNotifications({ page: 1, filter: f })
      .then((list) => {
        if (my !== reqId.current) return;
        setItems(list.data);
      })
      .catch(() => {
        if (my !== reqId.current) return;
        setError(true);
      })
      .finally(() => {
        if (my === reqId.current) setLoading(false);
      });
  }, []);
  useEffect(() => {
    if (open) load(filter);
  }, [open, filter, load]);

  const onItemClick = (n: NotificationItem) => {
    if (!n.isRead) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
      markNotificationRead(n.id).catch(() => {});
    }
    setOpen(false);
    const href = notificationHref(n);
    if (href) router.push(href);
  };

  // «+n more» on the home bubble, and anything else that wants the full list open.
  useEffect(() => {
    const openIt = () => setOpen(true);
    window.addEventListener(OPEN_BELL_EVENT, openIt);
    return () => window.removeEventListener(OPEN_BELL_EVENT, openIt);
  }, []);

  const onMarkAll = () => {
    setItems((prev) => prev.map((x) => ({ ...x, isRead: true })));
    setUnread(0);
    markAllNotificationsRead()
      .catch(() => {})
      .finally(() => {
        // Re-sync from server and re-run the current filter (Unread should empty out).
        refreshCount();
        if (open) load(filter);
      });
  };

  // Group the loaded items by day, preserving server order within each group.
  const groups = useMemo(() => {
    const g: Record<DayGroup, NotificationItem[]> = { today: [], yesterday: [], earlier: [] };
    for (const n of items) g[dayGroupOf(n.createdAt)].push(n);
    return g;
  }, [items]);

  const groupLabel: Record<DayGroup, string> = {
    today: t.notifications.today,
    yesterday: t.notifications.yesterday,
    earlier: t.notifications.earlier,
  };
  const order: DayGroup[] = ["today", "yesterday", "earlier"];
  const isEmpty = !loading && !error && items.length === 0;

  return (
    <div {...pin("notifications-bell")} id={BELL_ANCHOR_ID} className="relative">
      {/* The bell is the header prototype's outline, not Material's glyph, and it inherits the bar's
          `var(--muted-dark)` rather than setting its own colour — it and the inbox are one pair, and the pair
          is coloured by the group that holds them (owner, 2026-08-25). */}
      <button
        onClick={() => setOpen((o) => !o)}
        /* ── The hover was painting it OUT (owner, 2026-09-06) ────────────────────────────────
           `hover:text-navy-deep` on a `bg-navy` bar: the glyph darkened into its own background, so
           pointing at the bell made it vanish and leave a hole where the icon had been. Its
           neighbour in the same group has always used `hover:text-white`, which is the bar's rule —
           these two are one pair and are coloured by the group that holds them. */
        className="grid h-[30px] w-[30px] place-items-center rounded-full transition hover:text-white"
        aria-label={t.notifications.title}
        aria-haspopup="menu"
        aria-expanded={open}
        title={t.notifications.title}
      >
        {/* 34px box, 20px glyph — the bar's one size for a standalone icon control. The badge hangs
            off the glyph rather than the box, or it would float clear of the bell. */}
        <span className="relative inline-flex">
          <BellIcon />
          <CountBadge count={unread} />
        </span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div
            role="menu"
            className="absolute end-0 z-40 mt-1 flex max-h-[70vh] w-[340px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-sm border border-border bg-surface"
          >
            <div className="flex items-center justify-between gap-2 border-b border-border px-3.5 py-2.5">
              <b className="text-body font-extrabold text-navy">{t.notifications.title}</b>
              {unread > 0 && (
                <button
                  onClick={onMarkAll}
                  className="text-meta font-semibold text-brand transition"
                >
                  {t.notifications.markAllRead}
                </button>
              )}
            </div>

            <div className="flex gap-1 border-b border-border px-3 py-2">
              {(["all", "unread"] as NotificationFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`rounded-full px-3 py-1 text-meta font-semibold transition ${
                    filter === f ? "bg-navy text-white" : "bg-surface2 text-muted hover:text-navy-mid"
                  }`}
                >
                  {f === "all" ? t.notifications.all : t.notifications.unread}
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {loading && (
                <div className="grid place-items-center py-10 text-muted">
                  <Icon name="progress_activity" size={24} className="animate-spin" />
                </div>
              )}
              {error && !loading && (
                <p className="px-4 py-10 text-center text-body font-semibold text-muted">{t.notifications.loadError}</p>
              )}
              {isEmpty && (
                <p className="px-4 py-10 text-center text-body font-semibold text-muted">
                  {filter === "unread" ? t.notifications.emptyUnread : t.notifications.empty}
                </p>
              )}
              {!loading &&
                !error &&
                order.map((key) =>
                  groups[key].length ? (
                    <div key={key}>
                      <div className="bg-surface2/60 px-3.5 py-1.5 text-label font-extrabold uppercase tracking-wide text-muted">
                        {groupLabel[key]}
                      </div>
                      {groups[key].map((n) => (
                        <button
                          key={n.id}
                          onClick={() => onItemClick(n)}
                          className="flex w-full items-start gap-2.5 px-3.5 py-2.5 text-start transition hover:bg-surface2"
                        >
                          <span
                            className={`mt-1.5 h-2 w-2 flex-none rounded-full ${n.isRead ? "bg-transparent" : "bg-brand"}`}
                            aria-hidden
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline justify-between gap-2">
                              <b className={`truncate text-body ${n.isRead ? "font-semibold text-navy-mid" : "font-extrabold text-navy"}`}>
                                {n.title}
                              </b>
                              <small className="flex-none text-label font-semibold text-muted">
                                {relativeTime(n.createdAt, locale, t.notifications.justNow)}
                              </small>
                            </span>
                            {n.body && <span className="mt-0.5 block text-meta leading-snug text-muted">{n.body}</span>}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null,
                )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
