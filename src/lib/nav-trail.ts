/**
 * **Where the renter was a moment ago** (owner, 2026-09-04: *"all back buttons whether from the web
 * itself or browser must be wired to the page where he was actually on"*).
 *
 * `back-nav.ts` decides what a Back control POINTS AT given the previous route. This holds that
 * route. They were one thing, and it did not work: the shell kept the trail in a `useRef`, and
 * `AppShell` is rendered by each page rather than by the layout — so every navigation unmounted the
 * shell and took the trail with it. The ref was `null` on arrival at every page, so every Back
 * control in the app fell through to its `fallback` and none of them named where the renter had
 * actually been.
 *
 * ── Module scope FIRST, storage as the backstop ─────────────────────────────────────────────────
 * A module-level variable survives a component remount, which is the case that was broken.
 * `sessionStorage` survives a RELOAD as well, and is scoped to the tab, so two tabs do not teach
 * each other where the renter came from. Both are written together; the read prefers the variable
 * because it is always current and never throws.
 *
 * ── Recorded during RENDER, not in an effect ────────────────────────────────────────────────────
 * Child effects run before the parent's, so a shell recording the trail in `useEffect` would still
 * be one page behind for anything a page asks during its own mount — and the guest dashboard asks
 * exactly that ("did he arrive here cold, or press the tab?"). Recording while the shell renders
 * puts the answer in place before any child runs. It is idempotent: the same path twice is a no-op,
 * so a re-render (or Strict Mode's double render) changes nothing.
 */

const KEY = "moedatech.nav-trail";

let currentPath: string | null = null;
let prevPath: string | null = null;
let restored = false;

/** Pull the tab's trail back after a reload. Runs once, and only in a browser. */
function restore(): void {
  if (restored || typeof window === "undefined") return;
  restored = true;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as { current?: unknown; prev?: unknown };
    if (typeof saved.current === "string") currentPath = saved.current;
    if (typeof saved.prev === "string") prevPath = saved.prev;
  } catch {
    /* blocked or corrupt storage → the trail is simply empty, which `fallback` covers */
  }
}

/**
 * Note that the renter is now on `path`.
 *
 * Arriving where he already is changes nothing: a reload, a query-string change or a re-render must
 * not push the current page onto the trail and make Back point at the page it is drawn on.
 */
export function recordTrail(path: string): void {
  restore();
  if (currentPath === path) return;
  prevPath = currentPath;
  currentPath = path;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify({ current: currentPath, prev: prevPath }));
  } catch {
    /* ignore quota/availability errors — the in-memory trail still works for this navigation */
  }
}

/** The page the renter was on before this one, or `null` on a cold entry into the tab. */
export function previousPath(): string | null {
  restore();
  return prevPath;
}

/** The page the trail believes he is on. Exported for tests. */
export function currentTrailPath(): string | null {
  restore();
  return currentPath;
}

/** Tests only: forget everything, including what storage remembers. */
export function resetTrail(): void {
  currentPath = null;
  prevPath = null;
  restored = true;
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
