"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useT, useLocale } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import {
  fetchNotifications,
  fetchNotificationsUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/lib/api/client";
import { notificationHref, type NotificationItem, type NotificationFilter } from "@/lib/contract/notifications";

/**
 * Top-bar notifications bell (app parity). Distinct from the inbox icon (deal-room unread). The badge
 * polls the unread count every 30s (the backend has no count endpoint, so it reads `meta.total` from an
 * unread-filtered list). The dropdown lists notifications grouped by day with an All/Unread filter;
 * clicking an item marks it read (optimistic) and deep-links via `notificationHref`.
 */
const POLL_MS = 30_000;

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

function relativeTime(iso: string, locale: string, justNow: string): string {
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
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative grid h-9 w-9 place-items-center rounded-full text-navy-mid transition hover:bg-surface2"
        aria-label={t.notifications.title}
        aria-haspopup="menu"
        aria-expanded={open}
        title={t.notifications.title}
      >
        <Icon name="notifications" size={20} />
        {unread > 0 && (
          <span className="absolute -end-0.5 -top-0.5 grid h-[17px] min-w-[17px] place-items-center rounded-full bg-brand px-1 text-[10px] font-extrabold text-white ring-2 ring-surface">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div
            role="menu"
            className="absolute end-0 z-40 mt-1 flex max-h-[70vh] w-[340px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-[12px] border border-border bg-surface shadow-lg"
          >
            <div className="flex items-center justify-between gap-2 border-b border-border px-3.5 py-2.5">
              <b className="text-[14px] font-extrabold text-navy">{t.notifications.title}</b>
              {unread > 0 && (
                <button
                  onClick={onMarkAll}
                  className="text-[12px] font-bold text-brand transition hover:brightness-110"
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
                  className={`rounded-full px-3 py-1 text-[12px] font-bold transition ${
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
                <p className="px-4 py-10 text-center text-[13px] font-semibold text-muted">{t.notifications.loadError}</p>
              )}
              {isEmpty && (
                <p className="px-4 py-10 text-center text-[13px] font-semibold text-muted">
                  {filter === "unread" ? t.notifications.emptyUnread : t.notifications.empty}
                </p>
              )}
              {!loading &&
                !error &&
                order.map((key) =>
                  groups[key].length ? (
                    <div key={key}>
                      <div className="bg-surface2/60 px-3.5 py-1.5 text-[11px] font-extrabold uppercase tracking-wide text-muted">
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
                              <b className={`truncate text-[13px] ${n.isRead ? "font-semibold text-navy-mid" : "font-extrabold text-navy"}`}>
                                {n.title}
                              </b>
                              <small className="flex-none text-[11px] font-semibold text-muted">
                                {relativeTime(n.createdAt, locale, t.notifications.justNow)}
                              </small>
                            </span>
                            {n.body && <span className="mt-0.5 block text-[12px] leading-snug text-muted">{n.body}</span>}
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
