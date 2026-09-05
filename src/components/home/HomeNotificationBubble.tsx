"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchNotifications, markNotificationRead } from "@/lib/api/client";
import {
  isBubbleWorthy,
  notificationHref,
  type NotificationItem,
} from "@/lib/contract/notifications";
import { BELL_ANCHOR_ID, OPEN_BELL_EVENT, relativeTime } from "@/components/NotificationsBell";
import { fmt, useLocale, useT } from "@/lib/i18n";
import { pin } from "@/lib/uiPins";

/**
 * ── The home page's notification bubble (owner, 2026-09-05) ──────────────────────────────────────
 * *"I want a small bubble to appear on the home page below the notification bell so the user sees
 * them… but very short… if more than one is new then just show the latest one with +n more."*
 *
 * **One card, never a list.** The bell already holds the list; this exists because a renter who is
 * looking at his dashboard is not looking at the bell, and the badge on it is a number with no
 * subject. So the bubble raises exactly the newest unread row worth raising, and says how many are
 * behind it — a count that is a way IN to the list, not a second copy of it.
 *
 * **Which rows qualify is a contract, not a component decision**: `HOME_BUBBLE_TYPES` in
 * `contract/notifications.ts` names the six, and the reason for the six lives with them.
 *
 * **It is anchored, not placed.** The bubble measures the bell's own box and hangs under it, so it
 * follows the header's gutter (`px-4`, `sm:px-7`), the locale's direction and any later change to
 * either. A hard-coded offset would be right on one screen and wrong on the next.
 *
 * Dismissal lasts the session and is per notification id: a renter who has waved this one away must
 * not meet it again on his next visit to the dashboard, and a NEW offer must still be able to raise
 * one.
 */
const DISMISSED_KEY = "moeda.home-bubble.dismissed";

/** Read the ids this session has waved away. Storage can throw (private mode, blocked site data). */
function dismissedIds(): Set<string> {
  try {
    const raw = sessionStorage.getItem(DISMISSED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function rememberDismissed(id: string) {
  try {
    const next = dismissedIds();
    next.add(id);
    sessionStorage.setItem(DISMISSED_KEY, JSON.stringify([...next]));
  } catch {
    // A renter whose browser refuses storage simply meets the bubble again. That is the mild
    // failure; losing the notification would be the bad one.
  }
}

export function HomeNotificationBubble() {
  const t = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const [latest, setLatest] = useState<NotificationItem | null>(null);
  const [more, setMore] = useState(0);
  const [box, setBox] = useState<{ top: number; left: number } | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  /* ── What to raise ───────────────────────────────────────────────────────────────────────────
     Unread only, page one, once per mount. No polling: the bell already polls every 30s for the
     badge, and a second timer on the dashboard would be two requests asking the same question. A
     failure raises nothing and says nothing — this is an aside, and an aside that reports its own
     plumbing is worse than an aside that stays quiet. */
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const list = await fetchNotifications({ page: 1, filter: "unread" });
        if (!live) return;
        const dismissed = dismissedIds();
        const rows = list.data.filter((n) => isBubbleWorthy(n) && !n.isRead && !dismissed.has(n.id));
        // The list arrives newest first; the first row is the one to show and the rest are the count.
        setLatest(rows[0] ?? null);
        setMore(Math.max(0, rows.length - 1));
      } catch {
        setLatest(null);
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  /* ── Where to sit ────────────────────────────────────────────────────────────────────────────
     Under the bell, measured. `useLayoutEffect` so the card never paints at 0,0 first; re-measured
     on resize because the header's gutter changes at `sm` and the bell moves with it. */
  const place = useCallback(() => {
    const anchor = document.getElementById(BELL_ANCHOR_ID);
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const width = cardRef.current?.offsetWidth ?? 268;
    // Centred on the bell, then pulled back inside the viewport on a narrow screen — a bubble whose
    // tail points at the bell but whose body is off the edge is worse than one slightly off-centre.
    const wanted = r.left + r.width / 2 - width / 2;
    const left = Math.max(8, Math.min(wanted, window.innerWidth - width - 8));
    setBox({ top: r.bottom + 8, left });
  }, []);

  useLayoutEffect(() => {
    if (!latest) return;
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [latest, place]);

  if (!latest) return null;

  const href = notificationHref(latest);
  const dismiss = () => {
    rememberDismissed(latest.id);
    setLatest(null);
  };
  /* Reading it is what marks it read — the same rule the bell's own rows follow, so a row opened
     from here does not come back through the bell. The failure is swallowed: the renter is already
     on his way to the request, and an error toast about a read flag would land on the wrong page. */
  const open = () => {
    markNotificationRead(latest.id).catch(() => {});
    rememberDismissed(latest.id);
    if (href) router.push(href);
    setLatest(null);
  };

  return (
    <div
      {...pin("home-bubble")}
      ref={cardRef}
      /* `fixed`, because the header it hangs from is `sticky` and the dashboard scrolls under it —
         an absolutely placed bubble would slide up behind the bar it points at. */
      className="fixed z-40 w-[268px] max-w-[calc(100vw-16px)] motion-safe:animate-[hbIn_.18s_ease-out]"
      style={box ? { top: box.top, left: box.left } : { top: -9999, left: -9999 }}
      role="status"
    >
      <style>{`@keyframes hbIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }`}</style>

      {/* The tail. A rotated square on the card's own ground with the card's own border, clipped by
          the card sitting over its lower half — the one way to draw a pointer that keeps the border
          on the two sides that show. */}
      <span
        aria-hidden="true"
        className="absolute -top-[5px] start-1/2 h-[10px] w-[10px] -translate-x-1/2 rotate-45 border-s border-t border-border bg-surface rtl:translate-x-1/2"
      />

      {/* No shadow: this app separates a floating layer with a border, and the bell's own dropdown
          two centimetres away is bordered exactly like this. */}
      <div className="relative overflow-hidden rounded-md border border-border bg-surface">
        <button
          type="button"
          onClick={open}
          className="flex w-full flex-col gap-1 px-3 py-2.5 text-start transition hover:bg-surface2/60"
        >
          {/* `pe-5` keeps the age clear of the ✕ that floats over this corner. */}
          <span className="flex w-full items-center gap-1.5 pe-5">
            {/* Unread, in the one colour this product uses for "something of yours moved". */}
            <span aria-hidden="true" className="h-1.5 w-1.5 flex-none rounded-full bg-brand" />
            <span className="min-w-0 flex-1 truncate text-meta font-extrabold text-navy">{latest.title}</span>
            <span className="flex-none text-label font-semibold text-muted">
              {relativeTime(latest.createdAt, locale, t.notifications.justNow)}
            </span>
          </span>
          {/* Two lines at most: the bell holds the whole sentence, and this is the trailer for it. */}
          <span className="line-clamp-2 text-label font-semibold leading-[1.5] text-muted">{latest.body}</span>
        </button>

        {more > 0 && (
          <button
            type="button"
            // The count is a door, not a label: pressing it opens the bell's own list, which is
            // where the other rows already live.
            onClick={() => {
              window.dispatchEvent(new Event(OPEN_BELL_EVENT));
              setLatest(null);
            }}
            className="w-full border-t border-border px-3 py-1.5 text-start text-label font-extrabold text-brand transition hover:bg-brand-soft"
          >
            {fmt(t.notifications.bubbleMore, { n: String(more) })}
          </button>
        )}

        <button
          type="button"
          onClick={dismiss}
          aria-label={t.common.close}
          title={t.common.close}
          className="absolute end-1 top-1 grid h-5 w-5 place-items-center rounded-full text-label font-semibold text-muted/70 transition hover:bg-surface2 hover:text-navy"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
