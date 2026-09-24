"use client";

import { usePathname } from "next/navigation";

/**
 * The Intercom messenger, and its floating launcher.
 *
 * The mobile app deliberately HIDES Intercom's own launcher — it has a `ChatBubble` of its own and
 * two launchers on one screen is one too many. The web has no such bubble, so here the launcher IS
 * the feature: it is the only way a renter reaches support from this app (owner, 2026-08-26).
 *
 * Three states, and the messenger is booted in all of them:
 *
 * 1. **Anonymous** — before the session resolves, and for a visitor who never signs in. A launcher
 *    that only appears once you are signed in is no use to the person most likely to need it.
 * 2. **Identified** — on sign-in, `update` attaches the identity. `user_id` is the database id the
 *    app sends, which is what lets the backend's `conversation.admin.replied` webhook route a
 *    support reply back to this person.
 * 3. **Signed out** — `shutdown` then a fresh anonymous boot. Intercom's documented logout: without
 *    the shutdown the next visitor on a shared machine inherits the conversation.
 *
 * Loaded from an effect rather than `next/script` because the boot has to happen after the session
 * has answered, and the queue stub below means calls made before the script lands are not lost.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "@/lib/i18n";
import { MIcon } from "@/components/ui";
import { useSession } from "@/lib/session";
import {
  buildIntercomPayload,
  INTERCOM_API_BASE,
  INTERCOM_APP_ID,
  INTERCOM_PLATFORM,
  recentSupportError,
  type IntercomServerIdentity,
} from "@/lib/support/intercom";

type IntercomFn = ((...args: unknown[]) => void) & { q?: unknown[][]; c?: (args: unknown[]) => void };

declare global {
  interface Window {
    Intercom?: IntercomFn;
    intercomSettings?: Record<string, unknown>;
  }
}

/**
 * **Open the messenger** — the profile's «Support» row (owner, 2026-08-30).
 *
 * That row pointed at `moedatech.net/contact`, which 404s. The app never used a contact page either:
 * every support touchpoint in it routes through `IntercomService` (`app_constants.dart` says so in
 * as many words), and this web app has already booted the same messenger, against the same user id,
 * so the agent's reply reaches the same person. The row simply raises it.
 *
 * `show` rather than `showNewMessage`: an existing conversation should reopen where it was left
 * rather than starting a second thread beside it. Silent when Intercom has not loaded — blocked, or
 * still in flight — rather than throwing at a renter who pressed a support link.
 */
export function openSupportMessenger(): void {
  try {
    window.Intercom?.("update", chatContext(window.location.pathname, window.location.search));
    window.Intercom?.("show");
  } catch {
    /* the messenger is not up; nothing to raise and nothing to report */
  }
}

/**
 * **Where the renter was when he asked for help**, sent right before the messenger opens (Intercom
 * context ticket, 2026-09-24). An agent reads it beside the chat instead of asking «which request?».
 *
 * `last_object_type` keeps to the ticket's vocabulary (`request` | `bid` | `equipment` | `store` |
 * `none`), so the deal room reads as `none` with its route still in `last_screen`. The id is TEXT:
 * every id on these routes is a UUID or a code, not the number the ticket assumed. On a screen with
 * no object the id is sent as null, so the previous chat's id does not stay on the contact.
 */
export function chatContext(pathname: string, search: string): Record<string, string | null> {
  const seg = pathname.split("/").filter(Boolean);
  const r = new URLSearchParams(search).get("r");
  const [type, id] =
    seg[0] === "requests" && r ? ["request", r]
    : seg[0] === "bids" && seg[1] ? ["bid", seg[1]]
    : seg[0] === "equipment" && seg[1] ? ["equipment", seg[1]]
    : seg[0] === "stores" && seg[1] ? ["store", seg[1]]
    : ["none", null];
  return {
    last_screen: pathname || "/",
    last_object_type: type,
    last_object_id: id ? decodeURIComponent(id) : null,
    // Null when nothing was refused in the last minute, so an old refusal does not stay on the contact.
    last_error: recentSupportError(),
  };
}

/**
 * Intercom's published snippet, typed.
 *
 * The stub matters: it queues every call made before the remote script arrives and the real client
 * drains that queue on load. Without it a boot fired while the session was still resolving would be
 * dropped, and the launcher would sit there anonymous until the next navigation.
 */
function loadIntercom(appId: string): void {
  const w = window;
  if (typeof w.Intercom === "function") {
    w.Intercom("reattach_activator");
    w.Intercom("update", w.intercomSettings);
    return;
  }
  const queue: unknown[][] = [];
  const stub = ((...args: unknown[]) => {
    queue.push(args);
  }) as IntercomFn;
  stub.q = queue;
  stub.c = (args: unknown[]) => {
    queue.push(args);
  };
  w.Intercom = stub;

  const inject = () => {
    const s = document.createElement("script");
    s.type = "text/javascript";
    s.async = true;
    s.src = `https://widget.intercom.io/widget/${appId}`;
    document.head.appendChild(s);
  };
  if (document.readyState === "complete") inject();
  else w.addEventListener("load", inject, false);
}

export function IntercomWidget({ appVersion = "web" }: { appVersion?: string }) {
  const { status, user } = useSession();
  const { locale, dir } = useLocale();
  /**
   * The messenger's current state, as one key.
   *
   * It has to name EVERY input to the boot object below — identity, locale AND direction — because
   * this is the only thing standing between a re-render and a re-send. A key that omits an input is
   * a change that never reaches Intercom: the anonymous branch used to key on the bare string
   * "anon", so the locale flip on mount (`LocaleProvider` restores the stored language in an effect,
   * after the first paint) was read, compared, and discarded. The messenger kept the alignment of a
   * language nobody was reading, and an Arabic renter pressed a bubble on the left and got a panel
   * on the right (owner, 2026-08-29).
   */
  const identity = useRef<string | null>(null);
  /** Anonymous or identified, which decides `update` against `shutdown` + `boot`. Null before either. */
  const mode = useRef<"anon" | "user" | null>(null);
  /** Intercom's unread count. Held HERE, not in `Launcher` — see the effect below. */
  const [unread, setUnread] = useState(0);
  /**
   * The signature, the real name and the email — everything only the server can answer.
   *
   * Fetched once per signed-in user, then held. Until it lands the messenger stays ANONYMOUS rather
   * than booting on the session alone — that spares support a «User 42» contact which a second boot
   * then renames, and it is what learns the yardstick `healthy` below is measured against.
   *
   * `userHash` may be null, and the messenger is booted identified anyway. That is the mobile app's
   * own posture — `loginIdentifiedUser` sends no hash either — and one client should not describe a
   * person differently from the other.
   *
   * That costs nothing only while identity verification is switched OFF for web in the Intercom
   * dashboard. Switched on, the workspace answers an unsigned boot with a 403 on
   * `/messenger/web/ping` and the frame reads «Something's gone wrong — content could not be
   * loaded», with no way back but a reload. There is nothing this component can do about that: no
   * callback fires, and the DOM a refused boot leaves — the bridge iframe and the lightweight
   * launcher — is the SAME DOM a healthy unopened messenger leaves, so «did it render» cannot be
   * asked. It is a dashboard setting, and `.env.example` records which way it has to be set.
   */
  const [server, setServer] = useState<IntercomServerIdentity | null>(null);
  /** Which user `server` describes, so a sign-out or an account switch cannot inherit it. */
  const serverFor = useRef<number | null>(null);
  /**
   * The user id whose identity request has FINISHED, answered or failed. Until it matches the
   * signed-in user, the messenger is not booted at all — see the boot effect.
   */
  const [settledFor, setSettledFor] = useState<number | null>(null);

  useEffect(() => {
    if (status !== "authed" || !user) {
      setServer(null);
      setSettledFor(null);
      serverFor.current = null;
      return;
    }
    if (serverFor.current === user.id) return;
    serverFor.current = user.id;
    const askedFor = user.id;
    /**
     * ⚠️ No cleanup flag. `user` is a new OBJECT whenever the session re-stamps the same person, and
     * a cleanup that cancelled this answer left the re-run returning early above (same id, already
     * asked): the answer was dropped and nothing ever asked again. With the first boot waiting on it,
     * that meant no messenger at all (prod, 2026-09-24). `serverFor` is the guard that matters: a
     * sign-out or an account switch changes it, and the answer then belongs to nobody.
     */
    void (async () => {
      try {
        const res = await fetch("/api/support/intercom", { cache: "no-store" });
        if (!res.ok) return; // no identity to add — the anonymous messenger stands
        const data = (await res.json()) as IntercomServerIdentity;
        if (serverFor.current === askedFor) setServer(data);
      } catch {
        /* Support must not be the thing that breaks when a fetch does. The launcher stays, anonymous. */
      } finally {
        if (serverFor.current === askedFor) setSettledFor(askedFor);
      }
    })();
  }, [status, user]);

  useEffect(() => {
    if (!INTERCOM_APP_ID) return;
    loadIntercom(INTERCOM_APP_ID);
    /**
     * The unread subscription, registered HERE rather than in `Launcher`.
     *
     * React runs a child's effects BEFORE its parent's, so `Launcher`'s own mount effect ran before
     * the line above had created the queue stub. It found no `window.Intercom`, returned, and — on
     * an empty dependency array — never tried again. The badge could not count, ever. One line
     * later, in the parent, the stub exists and the queue holds the call until the real client
     * lands (owner, 2026-08-29).
     */
    window.Intercom?.("onUnreadCountChange", (count: unknown) =>
      setUnread(typeof count === "number" ? count : 0),
    );
  }, []);

  useEffect(() => {
    const api = window.Intercom;
    if (!INTERCOM_APP_ID || !api) return;

    /**
     * The launcher follows the writing direction.
     *
     * Bottom-end, not bottom-right: under Arabic every other floating control on this app sits on
     * the left, and a messenger alone on the right reads as something bolted on.
     */
    const base = {
      app_id: INTERCOM_APP_ID,
      api_base: INTERCOM_API_BASE,
      alignment: dir === "rtl" ? "left" : "right",
      language_override: locale,
      // On the anonymous boot too: a visitor who never signs in must still read as the web.
      platform: INTERCOM_PLATFORM,
      // Intercom's blue circle is hidden and `Launcher` below takes its place, so the web reaches
      // support through the same orange bubble the app does. `alignment` still stands: the messenger
      // PANEL reads it, and it has to open on the side the bubble it came from sits on.
      hide_default_launcher: true,
    };

    /**
     * 🔴 **A signed-in renter's FIRST boot waits for his identity** (2026-09-24, verified on prod).
     *
     * It used to boot anonymous at once and swap to the identity when the server answered: `shutdown`
     * then `boot`. On web.moedatech.net the identity landed at 1102 ms and Intercom's script at
     * 1160 ms, so all three calls sat in the snippet's queue and the real client kept the anonymous
     * boot. Every signed-in renter reached support as a nameless lead («Grey Joystick»), with no
     * error anywhere. Waiting costs ~1 s of launcher on a page load and removes the swap entirely.
     *
     * Only while `mode` is null, i.e. nothing is booted yet. A renter who signs in on a page that
     * already has the anonymous messenger running still gets `shutdown` + `boot` below, and by then
     * the real client is loaded, so nothing is queued. A visitor who never signs in (`anon`) is not
     * held at all: support is most useful to the person who cannot get in. `loading` is not held
     * either: the layout hands `SessionProvider` its `initialUser`, so a signed-in renter starts
     * `authed` and never passes through it.
     */
    if (mode.current === null && status === "authed" && user && settledFor !== user.id) return;

    if (status === "loading" || !user || !server) {
      // The locale and the direction are IN the key, not just in the dependency array. `base` reads
      // both, so both have to be able to invalidate it — see the note on `identity`.
      const wanted = `anon:${locale}:${dir}`;
      if (identity.current === wanted) return;
      // A signed-in messenger must be torn down before an anonymous one replaces it, or the previous
      // conversation stays attached to the next person at this browser. `mode`, not the key, decides
      // that: two anonymous keys differing only by language are the same messenger in a new language.
      if (mode.current === "user") api("shutdown");
      api(mode.current === "anon" ? "update" : "boot", base);
      mode.current = "anon";
      identity.current = wanted;
      return;
    }

    const payload = { ...base, ...buildIntercomPayload({ user, locale, appVersion, server }) };
    // The signature is in the key: a workspace that rotates its secret mid-session must re-boot
    // rather than keep a messenger signed under the old one.
    const wanted = `${user.id}:${user.tier}:${locale}:${dir}:${server.userHash ?? "unsigned"}`;
    if (identity.current === wanted) return;

    // `update` for anything that changes WITHIN one identity — a tier that moved, a language
    // toggled. Booting twice over one identity restarts the session and loses the unread count.
    //
    // Coming from the anonymous messenger is the other case, and it needs a SHUTDOWN first. A second
    // `boot` over a live anonymous session does not promote it: the messenger keeps the anonymous
    // session it already opened, the identified one it is handed does not match it, and the frame
    // renders «Something's gone wrong — content could not be loaded» with no way back but a reload.
    // Intercom's documented switch is teardown then boot, and it is what the sign-OUT path
    // already does in the other direction, a few lines up.
    if (mode.current === "anon") api("shutdown");
    api(mode.current === "user" ? "update" : "boot", payload);
    mode.current = "user";
    identity.current = wanted;
  }, [status, user, locale, dir, appVersion, server, settledFor]);

  return <Launcher unread={unread} />;
}

/**
 * The app's chat bubble, on the web.
 *
 * Drawn here rather than left to Intercom because Intercom's launcher is a blue circle with
 * Intercom's own mark on it, and a renter who has used the app knows this control as an orange
 * bubble. Same glyph, same gradient, same 56px circle as `chat_bubble.dart`:
 *
 * | `chat_bubble.dart` | here |
 * |---|---|
 * | 56×56 circle | the same |
 * | `AppColors.orange` → `#D4570A`, top-left to bottom-right | **flat `--brand`** — see below |
 * | `Icons.chat_bubble_outline_rounded`, white, 28 | Material Symbols Rounded `chat_bubble` at FILL 0 — the same glyph from the same family |
 * | unread badge, `AppColors.danger`, white, 11 | the same, on `--danger` |
 * | `AppShadows.float` | NOTHING — this app has no shadows (`globals.css`, owner 2026-08-26) |
 *
 * TWO deliberate differences from the app, both owner calls:
 *
 *  · **No shadow.** The whole `--shadow-*` namespace is cleared here, and a floating control is not
 *    the place to reintroduce it.
 *  · **No gradient** (2026-08-30). The app's bubble runs #f79009 → #D4570A; this one is flat
 *    `--brand`, because the instruction was one orange for every control on the web and this bubble
 *    was the only thing carrying a second. It is a knowing divergence from `chat_bubble.dart`, not
 *    an oversight — if the two are ever reconciled, this is the line to change.
 *
 * Separation from the page comes from the size and the ground beneath it, both of which the app's
 * own bubble also relies on once its shadow is taken away.
 *
 * ~~Not draggable, unlike the app's. The app moves it because a phone screen is small enough for a
 * fixed bubble to sit on top of something that matters; at this width nothing is under it.~~
 * Withdrawn (owner, 2026-08-31) — and it now matches `chat_bubble.dart` on this too. "Nothing is
 * under it" was a claim about a layout that keeps changing, and this app has surfaces that fill
 * their viewport and put their own work in that corner: the bid map's price bar, a card row that
 * scrolls sideways beneath it, a dialog's footer. Letting the renter move it is cheaper than being
 * right about every corner forever. See {@link Launcher}.
 */
/**
 * The destinations the nav bar names, and their subtrees.
 *
 * `/` is exact and the rest own their subtree — the same rule `AppNav.isActive` uses to decide which
 * tab is lit, kept identical on purpose: the bubble is present exactly where a tab is highlighted, so
 * "is support here?" has the same answer as "where am I?".
 *
 * ~~`/company`.~~ Dropped with the tab (owner, 2026-09-04): the bar names three places now, and the
 * firm is a block on `/profile`, which has never been one of them.
 */
const LAUNCHER_ROUTES = ["/", "/browse", "/requests"] as const;

/** Where the renter parked the bubble, in viewport pixels from the top-left of the window. */
type BubbleAt = { x: number; y: number };

/**
 * **The bubble is the renter's to move** (owner, 2026-08-31).
 *
 * ~~"Not draggable, unlike the app's. The app moves it because a phone screen is small enough for a
 * fixed bubble to sit on top of something that matters; at this width nothing is under it."~~
 * Withdrawn. It is not only phones: this app has surfaces that fill their viewport and put their own
 * work in the bottom corner — the bid map's price bar, a card row that scrolls sideways under it, a
 * dialog's footer buttons — and "nothing is under it" is a claim about a layout that keeps changing.
 * Letting the renter move it is cheaper than being right about every corner forever.
 *
 * ── The size, and why it is not `1rem` ──────────────────────────────────────────────────────────
 * `BUBBLE` is the button's own diameter and `EDGE` the gap it keeps from the window. They are
 * constants rather than literals because the clamp below needs both, and a bubble that could be
 * dragged half off the screen is a bubble that cannot be dragged back.
 */
const BUBBLE = 56;
const EDGE = 12;
const BUBBLE_KEY = "moeda.support.bubble";

/** Inside the window, always — read on restore and again on every resize. */
function clampToView(at: BubbleAt): BubbleAt {
  const maxX = Math.max(EDGE, window.innerWidth - BUBBLE - EDGE);
  const maxY = Math.max(EDGE, window.innerHeight - BUBBLE - EDGE);
  return { x: Math.min(Math.max(at.x, EDGE), maxX), y: Math.min(Math.max(at.y, EDGE), maxY) };
}

function readBubble(): BubbleAt | null {
  try {
    const raw = window.localStorage.getItem(BUBBLE_KEY);
    if (!raw) return null;
    const at = JSON.parse(raw) as BubbleAt;
    return typeof at?.x === "number" && typeof at?.y === "number" ? clampToView(at) : null;
  } catch {
    // A blocked or malformed store means the bubble sits where it always did. Nothing else depends
    // on this, so there is nothing to report and nothing to recover.
    return null;
  }
}

function Launcher({ unread }: { unread: number }) {
  const { dir } = useLocale();
  // Null outside a route (and in a bare render): treat that as "not on a tab" rather than throwing.
  const pathname = usePathname() ?? "";

  /**
   * Where it sits. `null` means "wherever the stylesheet puts it" — the bottom-end corner it has
   * always occupied — so a renter who never drags it sees no change at all, and the default keeps
   * following the writing direction without this having to know about RTL.
   */
  const [at, setAt] = useState<BubbleAt | null>(null);
  /** True from the first pixel of a real drag until the click that would follow it is swallowed. */
  const dragging = useRef(false);
  const moved = useRef(false);
  /** Pointer offset inside the button, so it does not jump to centre itself under the finger. */
  const grab = useRef({ dx: 0, dy: 0 });

  // Restore on mount (client only — `localStorage` does not exist while this renders on the server).
  useEffect(() => setAt(readBubble()), []);

  // A window that got smaller must not strand it outside. Only ever pulls it back in.
  useEffect(() => {
    if (!at) return;
    const onResize = () => setAt((prev) => (prev ? clampToView(prev) : prev));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [at]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    // Primary button / touch / pen only: a right-click is a context menu, not a drag.
    if (e.button !== 0) return;
    const box = e.currentTarget.getBoundingClientRect();
    grab.current = { dx: e.clientX - box.left, dy: e.clientY - box.top };
    dragging.current = true;
    moved.current = false;
    // Capture, so the drag survives the pointer leaving the button — which it does immediately,
    // because the button is moving out from under it.
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragging.current) return;
    const next = { x: e.clientX - grab.current.dx, y: e.clientY - grab.current.dy };
    // A few pixels of slop before this counts as a drag. Without it every press registers as a
    // one-pixel move and the click that opens the messenger never fires.
    if (!moved.current) {
      const box = e.currentTarget.getBoundingClientRect();
      if (Math.abs(next.x - box.left) < 4 && Math.abs(next.y - box.top) < 4) return;
      moved.current = true;
    }
    setAt(clampToView(next));
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!moved.current) return; // a press, not a drag — let the click through to `open`
    const box = e.currentTarget.getBoundingClientRect();
    try {
      window.localStorage.setItem(BUBBLE_KEY, JSON.stringify({ x: box.left, y: box.top }));
    } catch {
      /* it stays put for this visit and returns to the corner on the next; nothing else breaks */
    }
  }, []);

  const open = useCallback(() => {
    // The click that ends a drag is not a request for support. `moved` is still true here — the
    // browser fires `click` after `pointerup` — so this is where it is spent.
    if (moved.current) {
      moved.current = false;
      return;
    }
    openSupportMessenger();
  }, []);

  if (!INTERCOM_APP_ID) return null;

  /* ── The bubble lives on the nav's four tabs, and nowhere else (owner, 2026-08-31) ─────────────
     *"Remove the intercom icon from the map view, show it in the main 4 tabs of the nav bar only."*

     It was mounted in the root layout, so it sat on every route the app has — including the
     equipment map (`/bids/[id]/equipment`), which is a full-bleed canvas with its own floating
     controls and a chat dock of its own. A second bubble there competes with the dock for the same
     corner and for the same meaning, which is the exact problem the mobile app solved by hiding
     Intercom's own launcher.

     Gating the render rather than unmounting the widget: the messenger still boots, still identifies
     the renter, and still counts unread on every page. Only the button is withheld, so a conversation
     opened on the dashboard is still there when he comes back to it. */
  const onTab = LAUNCHER_ROUTES.some((r) => (r === "/" ? pathname === "/" : pathname.startsWith(r)));
  if (!onTab) return null;

  return (
    <button
      type="button"
      onClick={open}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      aria-label={dir === "rtl" ? "الدعم" : "Support"}
      title={dir === "rtl" ? "الدعم — اسحب لتحريكه" : "Support — drag to move"}
      className="fixed z-40 grid size-14 place-items-center rounded-full text-white transition-transform hover:scale-105 active:scale-95"
      style={{
        // `touch-action: none` so a drag on a phone moves the bubble instead of scrolling the page
        // under it. `cursor: grab` says the thing can be picked up before anyone tries.
        touchAction: "none",
        cursor: "grab",
        // Parked: absolute viewport coordinates, which is what a drag produces. Unparked: the corner
        // it has always sat in — logical, not `right`, because under Arabic every other floating
        // control on this app sits on the left and a bubble alone on the right reads as bolted on.
        ...(at ? { left: at.x, top: at.y } : { insetInlineEnd: "1.5rem", bottom: "1.5rem" }),
        // ~~`linear-gradient(135deg, var(--brand), var(--brand-press))`.~~ Flat `--brand`, the one
        // orange every other control on this app is painted in (owner, 2026-08-30: *"show one
        // orange for all buttons"*). It was the ONLY orange here that was not #f79009 — the
        // gradient ran down to #cc7207 — and a support bubble is not the place to introduce a
        // second one.
        backgroundColor: "var(--brand)",
      }}
    >
      <MIcon name="chat_bubble" size={28} />
      {unread > 0 && (
        <span
          className="absolute top-1.5 grid min-h-5 min-w-5 place-items-center rounded-full px-1.5 text-label font-semibold leading-none text-white"
          style={{ insetInlineEnd: "0.375rem", background: "var(--danger)" }}
        >
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </button>
  );
}
