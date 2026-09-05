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
import { useSession } from "@/lib/session";
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
 * ── ONE LINE, and out of the hero's way (owner, 2026-09-05) ────────────────────────────────────
 * *"I want the notification on the home page to be thin so it doesn't cover the create request
 * button — you can even make it shorter and more horizontal, with less lines."*
 *
 * ~~A 268px card: a title row, two lines of body, and the «+n more» strip under them.~~ Four lines
 * hanging off a sticky header reach the hero's own CTA, so the aside covered the one control the
 * page exists to offer. It is a single row now — dot · title · «+n more» · age · ✕ — and the BODY is
 * gone: the bell holds the sentence, this is the trailer for it, and a trailer that needs two lines
 * is not a trailer.
 *
 * It also hangs from the bell's TRAILING edge rather than centred on it. Centred, a wide strip grows
 * back across the middle of the hero — which is exactly where the Create-request button is.
 *
 * ── Dismissal outlives the session (owner, same day) ───────────────────────────────────────────
 * *"When the user clicks ✕ it will not appear again, even in a new login."*
 *
 * So ✕ marks the notification READ, through the same endpoint the bell's own rows use. That is the
 * only dismissal this product can make stick: the read flag is the renter's, server-side, so it
 * holds on his next login and on his other devices, and the bubble only ever raises UNREAD rows.
 * Nothing is lost — the row stays in the bell's list, read, exactly as if he had opened it there.
 *
 * The local memory below is the belt to that braces: the read call can fail, and the renter must not
 * meet the same strip again while it does. `localStorage`, not `sessionStorage`, and keyed by the
 * ACCOUNT — a shared browser must not hide one renter's notification behind another's dismissal.
 */
const DISMISSED_KEY = "moeda.home-bubble.dismissed";

const dismissKey = (userId: number | string | null | undefined) => `${DISMISSED_KEY}.${userId ?? "anon"}`;

/** The ids this renter has waved away. Storage can throw (private mode, blocked site data). */
function dismissedIds(userId: number | string | null | undefined): Set<string> {
  try {
    const raw = localStorage.getItem(dismissKey(userId));
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function rememberDismissed(userId: number | string | null | undefined, id: string) {
  try {
    const next = dismissedIds(userId);
    next.add(id);
    localStorage.setItem(dismissKey(userId), JSON.stringify([...next]));
  } catch {
    // A renter whose browser refuses storage still has the READ flag, which is the durable half.
  }
}

export function HomeNotificationBubble() {
  const t = useT();
  const { locale } = useLocale();
  const { user } = useSession();
  const userId = user?.id ?? null;
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
        const dismissed = dismissedIds(userId);
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
  }, [userId]);

  /* ── Where to sit ────────────────────────────────────────────────────────────────────────────
     Under the bell, measured. `useLayoutEffect` so the card never paints at 0,0 first; re-measured
     on resize because the header's gutter changes at `sm` and the bell moves with it. */
  const place = useCallback(() => {
    const anchor = document.getElementById(BELL_ANCHOR_ID);
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const width = cardRef.current?.offsetWidth ?? 320;
    /* Hung from the bell's TRAILING edge, not centred on it (owner, 2026-09-05). A one-line strip is
       wide, and centred it would grow back across the middle of the hero — over the Create-request
       button this move exists to clear. Trailing means it grows into the corner it points at.

       In Arabic the trailing edge is the LEFT one, so the strip grows the other way; both branches
       are then clamped inside the viewport, because a strip whose tail points at the bell and whose
       body is off the edge is worse than one a few pixels off its anchor. */
    const rtl = document.documentElement.dir === "rtl";
    const wanted = rtl ? r.left : r.right - width;
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
  /* ✕ marks it READ, which is the only dismissal that survives a new login (owner, 2026-09-05) —
     the flag is the renter's and lives server-side, and this strip only ever raises unread rows. The
     local note is the fallback for a failed call, so the same strip cannot come back a moment later. */
  const dismiss = () => {
    markNotificationRead(latest.id).catch(() => {});
    rememberDismissed(userId, latest.id);
    setLatest(null);
  };
  /* Reading it is what marks it read — the same rule the bell's own rows follow, so a row opened
     from here does not come back through the bell. The failure is swallowed: the renter is already
     on his way to the request, and an error toast about a read flag would land on the wrong page. */
  const open = () => {
    markNotificationRead(latest.id).catch(() => {});
    rememberDismissed(userId, latest.id);
    if (href) router.push(href);
    setLatest(null);
  };

  return (
    <div
      {...pin("home-bubble")}
      ref={cardRef}
      /* `fixed`, because the header it hangs from is `sticky` and the dashboard scrolls under it —
         an absolutely placed bubble would slide up behind the bar it points at.

         `w-max`, capped: the strip is as long as its one line needs and no longer, so a two-word
         title does not draw a 500px bar across the hero. */
      className="fixed z-40 w-max max-w-[min(420px,calc(100vw-16px))] motion-safe:animate-[hbIn_.18s_ease-out]"
      style={box ? { top: box.top, left: box.left } : { top: -9999, left: -9999 }}
      role="status"
    >
      <style>{`@keyframes hbIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }`}</style>

      {/* The tail, under the bell it points at — near the strip's trailing end now that the strip
          hangs from that edge rather than being centred on the bell. A rotated square on the card's
          own ground with the card's own border, clipped by the card over its lower half: the one way
          to draw a pointer that keeps the border on the two sides that show. */}
      <span
        aria-hidden="true"
        className="absolute -top-[5px] end-[18px] h-[10px] w-[10px] rotate-45 border-s border-t border-border bg-surface"
      />

      {/* No shadow: this app separates a floating layer with a border, and the bell's own dropdown
          two centimetres away is bordered exactly like this. */}
      <div className="relative flex h-[34px] items-center overflow-hidden rounded-full border border-border bg-surface ps-3 pe-1">
        <button
          type="button"
          onClick={open}
          className="-mx-1 flex min-w-0 flex-1 items-center gap-1.5 rounded-full px-1 text-start transition hover:bg-surface2"
        >
          {/* Unread, in the one colour this product uses for "something of yours moved". */}
          <span aria-hidden="true" className="h-1.5 w-1.5 flex-none rounded-full bg-brand" />
          {/* ONE line: the title and nothing else. ~~The body, clamped to two lines.~~ The bell holds
              the sentence; a trailer that needs three lines is not a trailer, and those lines were
              what reached the hero's CTA (owner, 2026-09-05). */}
          <span className="min-w-0 flex-1 truncate text-meta font-extrabold text-navy">{latest.title}</span>
          <span className="flex-none whitespace-nowrap text-label font-semibold text-muted">
            {relativeTime(latest.createdAt, locale, t.notifications.justNow)}
          </span>
        </button>

        {more > 0 && (
          <button
            type="button"
            // The count is a door, not a label: pressing it opens the bell's own list, which is
            // where the other rows already live. On the strip it sits inline rather than on a row of
            // its own — a second row is the thing this shape is getting rid of.
            onClick={() => {
              window.dispatchEvent(new Event(OPEN_BELL_EVENT));
              setLatest(null);
            }}
            className="ms-2 flex-none whitespace-nowrap rounded-full bg-brand-soft px-2 py-0.5 text-label font-extrabold text-brand-deep transition hover:bg-brand-pale"
          >
            {fmt(t.notifications.bubbleMore, { n: String(more) })}
          </button>
        )}

        <button
          type="button"
          onClick={dismiss}
          aria-label={t.common.close}
          title={t.common.close}
          className="ms-1 grid h-6 w-6 flex-none place-items-center rounded-full text-label font-semibold text-muted/70 transition hover:bg-surface2 hover:text-navy"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
