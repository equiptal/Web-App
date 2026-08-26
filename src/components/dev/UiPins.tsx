"use client";

/* ══════════════════════════════════════════════════════════════════════════════════════════════════
   STAGING BRANCH ONLY — DO NOT MERGE TO main.

   This is a developer instrument, not part of the product. It lives on `staging` so the UI can be
   read off by number while it is being restyled, and it is meant to stay there: keep it out of any
   PR that targets main, and drop it from a release branch if it ever rides along.

   The host allowlist in `uiPinsAllowed()` is the belt to this brace — if the file does reach
   production by accident, the overlay still renders nothing on the production host. Neither
   protection replaces the other.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */

/* eslint-disable no-restricted-syntax -- The overlay is the instrument, not the product: it has to stay
   legible while the tokens it measures are being changed, and it must never be mistaken for part of
   the design. Hence its own off-palette values. See the note on the component below. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PIN_BY_NUMBER, pinDepth, pinOrder, uiPinsAllowed } from "@/lib/uiPins";

/**
 * The developer pin overlay: switch it on and every registered surface wears its number.
 *
 * It exists so a restyle can be asked for by number — "tighten the gutters on #26, and #29.3 should
 * use the tinted button" — instead of by description, which is ambiguous on a screen holding five
 * cards that all look alike. The numbers are fixed in `lib/uiPins.ts`, not counted from the DOM, so
 * the number in a note written today still points at the same thing next month.
 *
 * ── Three levels, and a filter ──────────────────────────────────────────────────────────────────
 * `17` is the machine card and `17.1` its head row — both written down in the registry, both fixed.
 * `17.1.4` is the fourth ELEMENT inside that head row, and those are not written down anywhere: the
 * overlay finds them by walking the selected surface, so every button, field, heading and box has a
 * number without a single hand edit.
 *
 * The panel filters: **surfaces**, **parts**, **all**. Level three is scoped to the SELECTED pin,
 * because numbering a whole page at that grain draws hundreds of badges over each other and answers
 * no question. Select the surface you are working on, press all, and its insides are numbered.
 *
 * An element number is stable for as long as the surface keeps its shape, and no longer — it is a
 * position, not a name. That is the right trade for "which of these four buttons": say it while it
 * is on screen. A number you want to keep belongs in the registry, where the fixed ones live.
 *
 * ── One number, several elements ────────────────────────────────────────────────────────────────
 * A nav tab and a bid card are ONE component drawn many times, so their number appears many times on
 * screen. Each occurrence gets its own badge and its own row, marked `2/4`; the number still names
 * the component, which is what a restyle acts on.
 *
 * ── What the detail card is for ─────────────────────────────────────────────────────────────────
 * Selecting a pin shows its file, the classes ACTUALLY on that element right now, and its measured
 * box. The class string is the useful one: it is what you would edit, read off the live element
 * rather than out of the source, so classes applied by state show in the state you are looking at.
 *
 * ── Where it may run ────────────────────────────────────────────────────────────────────────────
 * Decided by HOST, not by an environment variable — see `uiPinsAllowed` — so there is nothing to set
 * on a branch and nothing that can be set wrong. On staging, localhost and Amplify previews the
 * toggle is there; on production the component renders nothing at all, on every render.
 *
 * ── Why the styling is hard-coded ───────────────────────────────────────────────────────────────
 * Everything else in this app takes its colours from `lib/ds.ts` and its tokens from `globals.css`,
 * and that rule is right — for the product. This is the instrument you measure the product WITH: it
 * has to stay legible while you are changing those very tokens, and it must not appear in a
 * screenshot as if it were part of the design. So it is deliberately off-palette (magenta, mono
 * type) and owns its own values. Do not "fix" this by moving it into the design system.
 */

/** How often to re-measure while the overlay is on, as a safety net for transitions and animations. */
const RESYNC_MS = 400;
const STORAGE_KEY = "moeda:ui-pins";
const DEPTH_KEY = "moeda:ui-pins-depth";

/** A surface's colour and a part's colour — two levels, told apart at a glance. */
const MAGENTA = "#e6007a";
const MAGENTA_SOFT = "rgba(230,0,122,.45)";
const CYAN = "#00b3c8";
const CYAN_SOFT = "rgba(0,179,200,.45)";
const SLATE = "#7c8794";
const SLATE_SOFT = "rgba(124,135,148,.4)";

/**
 * What counts as an element worth numbering at level 3.
 *
 * Everything a hand can press, everything that says something, and everything drawn as a box. The
 * box test is done on computed style rather than by class name, because a class name is exactly what
 * is being changed while this is open — an element that has a ground or an edge of its own is a
 * thing on the screen, whatever it is called this week.
 */
const CONTROL_SELECTOR =
  'button, a[href], input, select, textarea, summary, [role="button"], [role="tab"], [role="switch"], [role="menuitem"], [role="checkbox"], [role="radio"]';
const SAYS_SOMETHING = "h1, h2, h3, h4, h5, h6, label, img, svg";
/** Below this, a badge is bigger than the thing it points at. */
const MIN_ELEMENT_PX = 12;
/** A ceiling, so one careless click on the app frame cannot draw a thousand badges. */
const MAX_ELEMENTS = 240;

type Measured = {
  n: string;
  /** Unique per drawn badge. A repeated component — a nav tab, a bid card — shares ONE number, so the
   *  number alone is not a key: React would collide and draw one of them. */
  key: string;
  /** 1-based position among the elements sharing this number, and how many there are in total. */
  index: number;
  count: number;
  el: HTMLElement;
  depth: number;
  /** A registry pin, or an element numbered underneath one at level 3. */
  kind: "pin" | "element";
  /** Elements are not in the registry, so they carry their own description. */
  label: string;
  /** For an element: the file of the registered surface it was found inside. */
  file: string;
  top: number;
  left: number;
  width: number;
  height: number;
};

/**
 * A one-line name for an element that has no registry entry: what it is, and enough of what it says
 * to find it again on the screen. `button "Create request"` beats `div.flex.items-center`.
 */
function describe(el: HTMLElement): string {
  const tag = el.tagName.toLowerCase();
  const said =
    el.getAttribute("aria-label") ??
    (el.tagName === "IMG" ? el.getAttribute("alt") : null) ??
    (el.childElementCount === 0 || tag === "button" || tag === "a" ? (el.textContent ?? "").trim() : "");
  const trimmed = said.replace(/\s+/g, " ").slice(0, 40);
  return trimmed ? tag + ' "' + trimmed + '"' : tag;
}

export function UiPins() {
  const [on, setOn] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [ready, setReady] = useState(false);

  // Both the host check and the remembered state are read after mount, never during render: the
  // server has neither a location nor a localStorage, and an overlay that differed between the two
  // renders would be a hydration mismatch.
  useEffect(() => {
    setAllowed(uiPinsAllowed());
    try {
      setOn(window.localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      /* private mode, storage disabled — start off */
    }
    setReady(true);
  }, []);

  const toggle = useCallback(() => {
    setOn((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* not remembering it is survivable */
      }
      return next;
    });
  }, []);

  // Ctrl/Cmd + Shift + U. Chosen because it collides with nothing in Chrome, Firefox or Safari.
  useEffect(() => {
    if (!allowed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.shiftKey && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "u") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [allowed, toggle]);

  if (!ready || !allowed) return null;

  return (
    <div data-ui-pins="root" dir="ltr" style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
      {on && <PinLayer />}
      <button
        type="button"
        onClick={toggle}
        title="UI pins (Ctrl+Shift+U)"
        style={{
          position: "fixed",
          bottom: 12,
          left: 12,
          zIndex: 2147483647,
          width: 28,
          height: 28,
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,.6)",
          background: on ? MAGENTA : "rgba(20,20,25,.55)",
          color: "#fff",
          fontSize: 13,
          lineHeight: "26px",
          cursor: "pointer",
          opacity: on ? 1 : 0.45,
          padding: 0,
        }}
      >
        #
      </button>
    </div>
  );
}

/** The measuring half — mounted only while the overlay is on, so nothing runs when it is off. */
function PinLayer() {
  const [pins, setPins] = useState<Measured[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(true);
  /** 1 = whole surfaces; 2 = and their parts; 3 = and every element inside the selected one. */
  const [maxDepth, setMaxDepth] = useState(2);
  const frame = useRef<number | null>(null);
  /** Signature of the last measurement, so an identical one does not set state for nothing. */
  const signature = useRef("");
  // The measurement reads the selection and the depth, but must not be REBUILT when either changes —
  // it is the identity that every listener below is registered with. Refs, then, not dependencies.
  const selectedRef = useRef<string | null>(null);
  const depthRef = useRef(2);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(DEPTH_KEY);
      if (stored === "1" || stored === "2" || stored === "3") {
        setMaxDepth(Number(stored));
        depthRef.current = Number(stored);
      }
    } catch {
      /* fall back to parts */
    }
  }, []);

  const setDepth = useCallback((d: number) => {
    setMaxDepth(d);
    depthRef.current = d;
    try {
      window.localStorage.setItem(DEPTH_KEY, String(d));
    } catch {
      /* not remembering it is survivable */
    }
  }, []);

  /** Measure now. Callers go through {@link measure}, which decides when "now" is. */
  const runMeasure = useCallback(() => {
    const next: Measured[] = [];
    const seen = new Map<string, number>();
    document.querySelectorAll<HTMLElement>("[data-pin]").forEach((el) => {
      const n = el.dataset.pin;
      if (!n) return;
      const r = el.getBoundingClientRect();
      // Skip what is not on screen: a hidden panel would otherwise stack its badge in the top-left
      // corner with every other hidden one.
      if (r.width < 4 || r.height < 4) return;
      if (r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) return;
      const index = (seen.get(n) ?? 0) + 1;
      seen.set(n, index);
      next.push({
        n,
        key: n + `::` + index,
        index,
        count: 0, // filled in below, once the total for this number is known
        el,
        depth: pinDepth(n),
        kind: "pin",
        label: PIN_BY_NUMBER.get(n)?.label ?? "(not in registry)",
        file: PIN_BY_NUMBER.get(n)?.file ?? "",
        top: r.top,
        left: r.left,
        width: r.width,
        height: r.height,
      });
    });
    for (const m of next) m.count = seen.get(m.n) ?? 1;
    next.sort((a, b) => pinOrder(a.n, b.n) || a.index - b.index);

    // ── Level 3: every element inside the SELECTED surface ────────────────────────────────────
    // Scoped to a selection on purpose. Numbering the whole page at this grain draws hundreds of
    // badges over each other and answers no question; numbering one surface answers "which button".
    const host = selectedRef.current ? (next.find((m) => m.key === selectedRef.current) ?? null) : null;
    if (host && depthRef.current >= 3) {
      const seenEl = new Set<Element>();
      const candidates: HTMLElement[] = [];
      for (const el of host.el.querySelectorAll<HTMLElement>(CONTROL_SELECTOR + ", " + SAYS_SOMETHING)) {
        if (!seenEl.has(el)) {
          seenEl.add(el);
          candidates.push(el);
        }
      }
      // Boxes: anything with a ground or an edge of its own. Computed style is the honest test, and
      // it is affordable here because the walk is one surface deep, not the document.
      for (const el of host.el.querySelectorAll<HTMLElement>("*")) {
        if (seenEl.has(el)) continue;
        const cs = window.getComputedStyle(el);
        const hasGround = cs.backgroundColor !== "rgba(0, 0, 0, 0)" && cs.backgroundColor !== "transparent";
        const hasEdge = parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderBottomWidth) > 0;
        if (!hasGround && !hasEdge) continue;
        seenEl.add(el);
        candidates.push(el);
      }

      // Back into document order, so the numbers run the way the eye reads the surface.
      candidates.sort((a, b) =>
        a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
      );

      // A registered part already owns some numbers under this host — 10.1, 10.2 — so the element
      // counter steps over them. Two different things answering to one number is the single thing
      // this whole file exists to prevent.
      const taken = new Set<string>();
      for (const entry of PIN_BY_NUMBER.keys()) {
        if (entry.startsWith(host.n + ".")) taken.add(entry);
      }

      let i = 0;
      for (const el of candidates) {
        if (i >= MAX_ELEMENTS) break;
        if (el.closest("[data-ui-pins]")) continue; // never number the instrument
        if (el.hasAttribute("data-pin")) continue; // it already has a number of its own
        const r = el.getBoundingClientRect();
        if (r.width < MIN_ELEMENT_PX || r.height < MIN_ELEMENT_PX) continue;
        if (r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) continue;
        i += 1;
        while (taken.has(host.n + "." + i)) i += 1;
        const n = host.n + "." + i;
        next.push({
          n,
          key: host.key + "/" + i,
          index: 1,
          count: 1,
          el,
          depth: 3,
          kind: "element",
          label: describe(el),
          file: host.file,
          top: r.top,
          left: r.left,
          width: r.width,
          height: r.height,
        });
      }
    }

    // Nothing moved? Then do not set state. Every render of this overlay mutates the DOM, and the
    // MutationObserver below is watching the DOM — without this, a measurement that changed nothing
    // would still feed the observer that triggers the next measurement.
    const sig = next.map((m) => m.key + ":" + m.top + "," + m.left + "," + m.width + "," + m.height).join("|");
    if (sig === signature.current) return;
    signature.current = sig;
    setPins(next);
  }, []);

  /**
   * Coalesce the storm of scroll/mutation/resize events into one measurement per frame.
   *
   * With a fallback for a HIDDEN tab, which is not a corner case: a browser does not run
   * `requestAnimationFrame` on a background tab, so the callback that clears `frame` never runs, and
   * every later call returns at the guard. The overlay then stays empty until the tab is looked at
   * again. Measuring straight through when the document is hidden costs nothing — nothing is
   * animating there to coalesce.
   */
  const measure = useCallback(() => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      runMeasure();
      return;
    }
    if (frame.current !== null) return; // one measurement per frame, however many events fired
    frame.current = window.requestAnimationFrame(() => {
      frame.current = null;
      runMeasure();
    });
  }, [runMeasure]);

  // Selecting a surface (or changing the depth) is what decides which elements get numbered, so a
  // fresh measurement has to follow. The signature guard would otherwise hold the old set.
  useEffect(() => {
    selectedRef.current = selected;
    depthRef.current = maxDepth;
    signature.current = "";
    measure();
  }, [selected, maxDepth, measure]);

  useEffect(() => {
    measure();
    window.addEventListener("scroll", measure, { capture: true, passive: true });
    window.addEventListener("resize", measure);
    // Ignore what the overlay itself changes. Its markers live in <body> like everything else, so an
    // observer watching <body> sees every badge this component draws: measure → render → mutate →
    // measure, forever, which locks the tab rather than merely wasting a frame.
    const ours = (node: Node): boolean => {
      const el = node instanceof Element ? node : node.parentElement;
      return el?.closest("[data-ui-pins]") != null;
    };
    const observer = new MutationObserver((records) => {
      if (records.every((r) => ours(r.target))) return;
      measure();
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "data-pin"] });
    const timer = window.setInterval(measure, RESYNC_MS);
    return () => {
      window.removeEventListener("scroll", measure, { capture: true } as EventListenerOptions);
      window.removeEventListener("resize", measure);
      observer.disconnect();
      window.clearInterval(timer);
      if (frame.current !== null) window.cancelAnimationFrame(frame.current);
    };
  }, [measure]);

  const copy = useCallback((text: string) => {
    void navigator.clipboard?.writeText(text);
  }, []);

  const visible = useMemo(() => pins.filter((p) => p.depth <= maxDepth), [pins, maxDepth]);

  /** What is on screen right now, as lines you can paste into a message. */
  const asLines = useMemo(
    () =>
      visible.map((p) => `#${p.n} ${p.label} — ${p.file}`).join("\n"),
    [visible],
  );

  const selectedPin = selected === null ? null : (visible.find((p) => p.key === selected) ?? null);
  // Read off the LIVE element, so a class applied by state shows in the state you are looking at.
  const selectedClasses = selectedPin?.el.getAttribute("class") ?? "";

  return (
    <>
      {/* The markers. The layer ignores the pointer so the app underneath stays usable; only the
          badges themselves take clicks. */}
      <div data-ui-pins="markers" style={{ position: "fixed", inset: 0, zIndex: 2147483646, pointerEvents: "none" }}>
        {visible.map((p) => {
          const isSelected = p.key === selected;
          const isElement = p.kind === "element";
          const isPart = p.depth > 1 && !isElement;
          const hue = isElement ? SLATE : isPart ? CYAN : MAGENTA;
          const hueSoft = isElement ? SLATE_SOFT : isPart ? CYAN_SOFT : MAGENTA_SOFT;
          return (
            <div key={p.key} style={{ position: "absolute", top: p.top, left: p.left, width: p.width, height: p.height }}>
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  border: `1px ${isSelected ? "solid" : "dashed"} ${isSelected ? hue : hueSoft}`,
                  background: isSelected ? `${hue}12` : "transparent",
                }}
              />
              <button
                type="button"
                onClick={() => setSelected(isSelected ? null : p.key)}
                title={p.label}
                style={{
                  position: "absolute",
                  // Three levels, three corners — so a part that starts at its surface's own origin,
                  // and an element that fills its part, do not stack their badges on one spot.
                  ...(isElement ? { bottom: 0, left: 0 } : { top: 0 }),
                  ...(isPart ? { right: 0 } : { left: 0 }),
                  pointerEvents: "auto",
                  minWidth: 20,
                  height: 16,
                  padding: "0 4px",
                  border: "none",
                  borderRadius: isPart ? "0 0 0 4px" : "0 0 4px 0",
                  background: hue,
                  color: "#fff",
                  font: "600 11px/16px ui-monospace, Menlo, monospace",
                  cursor: "pointer",
                }}
              >
                {p.n}
              </button>
            </div>
          );
        })}
      </div>

      {/* The index. Numbers are only useful if you can read off which one is which without hunting
          for a badge that a dense screen has hidden under another. */}
      <div
        data-ui-pins="panel"
        style={{
          position: "fixed",
          bottom: 12,
          right: 12,
          zIndex: 2147483647,
          width: 330,
          maxHeight: "70vh",
          overflow: "auto",
          background: "rgba(18,18,22,.94)",
          color: "#fff",
          borderRadius: 8,
          border: "1px solid rgba(255,255,255,.15)",
          font: "12px/1.45 ui-monospace, Menlo, monospace",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", borderBottom: "1px solid rgba(255,255,255,.12)" }}>
          <strong style={{ color: "#ff5fb8" }}>pins</strong>
          <span style={{ opacity: 0.6 }}>{visible.length}</span>
          <button type="button" onClick={() => setDepth(1)} style={{ ...panelBtn, marginLeft: "auto", ...(maxDepth === 1 ? panelBtnOn : null) }}>
            surfaces
          </button>
          <button type="button" onClick={() => setDepth(2)} style={{ ...panelBtn, ...(maxDepth === 2 ? panelBtnOn : null) }}>parts</button>
          <button
            type="button"
            onClick={() => setDepth(3)}
            title="Number every element inside the selected surface"
            style={{ ...panelBtn, ...(maxDepth === 3 ? panelBtnOn : null) }}
          >
            all
          </button>
          <button type="button" onClick={() => copy(asLines)} style={panelBtn}>copy</button>
          <button type="button" onClick={() => setListOpen((v) => !v)} style={panelBtn}>{listOpen ? "–" : "+"}</button>
        </div>

        {listOpen && (
          <div style={{ padding: "6px 0" }}>
            {visible.length === 0 && <div style={{ padding: "6px 10px", opacity: 0.6 }}>Nothing pinned on this screen yet.</div>}
            {visible.map((p) => {
              const isPart = p.depth > 1;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setSelected(p.key === selected ? null : p.key)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: p.depth === 3 ? "2px 10px 2px 42px" : isPart ? "3px 10px 3px 26px" : "4px 10px",
                    border: "none",
                    background: p.key === selected ? "rgba(230,0,122,.25)" : "transparent",
                    color: "#fff",
                    font: "inherit",
                    opacity: isPart ? 0.85 : 1,
                    cursor: "pointer",
                  }}
                >
                  <span style={{ color: p.kind === "element" ? "#b9c0c8" : isPart ? "#5fd8e6" : "#ff5fb8" }}>#{p.n}</span>
                  {p.count > 1 && <span style={{ opacity: 0.5 }}> {p.index}/{p.count}</span>} {p.label}
                </button>
              );
            })}
          </div>
        )}

        {selectedPin && (
          <div style={{ padding: "8px 10px", borderTop: "1px solid rgba(255,255,255,.12)", display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ opacity: 0.75, wordBreak: "break-all" }}>
              {selectedPin.kind === "element" ? "inside " : ""}
              {selectedPin.file || "(no file)"}
            </div>
            {selectedPin && (
              <div style={{ opacity: 0.55 }}>
                {Math.round(selectedPin.width)} × {Math.round(selectedPin.height)} px
                {selectedPin.count > 1 && ` · instance ${selectedPin.index} of ${selectedPin.count}`}
              </div>
            )}
            {selectedClasses && (
              <div
                style={{
                  maxHeight: 90,
                  overflow: "auto",
                  padding: "5px 6px",
                  borderRadius: 4,
                  background: "rgba(255,255,255,.07)",
                  wordBreak: "break-word",
                }}
              >
                {selectedClasses}
              </div>
            )}
            <div style={{ display: "flex", gap: 4 }}>
              <button type="button" onClick={() => copy(selectedPin.file)} style={panelBtn}>path</button>
              {selectedClasses && (
                <button type="button" onClick={() => copy(selectedClasses)} style={panelBtn}>classes</button>
              )}
              <button
                type="button"
                onClick={() => copy(`#${selectedPin.n} ${selectedPin.label} — ${selectedPin.file}`)}
                style={panelBtn}
              >
                line
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

const panelBtn: React.CSSProperties = {
  padding: "2px 6px",
  border: "1px solid rgba(255,255,255,.25)",
  borderRadius: 4,
  background: "transparent",
  color: "#fff",
  font: "inherit",
  cursor: "pointer",
};

const panelBtnOn: React.CSSProperties = {
  background: MAGENTA,
  borderColor: MAGENTA,
};
