"use client";

/**
 * **V5 — the equipment list**, plus **V6's card half** of the landing pre-selection
 * (spec 004 §6.4; RM3-AC-09→13, AC-15, AC-32, AC-33, AC-34, AC-35).
 *
 * **Flat, nearest first, the whole matching fleet** (AC-10, superseded 2026-08-13 — machines he did
 * not offer are listed in red, not withheld). The filter and the sort are not here — they are
 * `listedMachines()` in `lib/contract/equipment-list.ts`, because the map draws the same set and two
 * filters kept equal by hand is exactly how a card and its marker start disagreeing (AC-15).
 *
 * Each card: photo · model · year · **one availability chip that also carries commitment** · distance
 * from the project, **with the card's two controls («اطلب التأكيد» when unconfirmed, then «التفاصيل ›»)
 * clustered against that row's trailing edge** · certificate chips or an explicit «لا شهادات على
 * المعدّة».
 *
 * Three rules the card's shape enforces:
 *  - **No serial number and no load capacity** (AC-12). The serial identifies the machine to the
 *    system, not to a renter; the type and size are already stated once, in the count pills.
 *  - **One chip, never a chip plus a band** (AC-32) — and **four rows that always occupy their line**,
 *    empty or not, so a machine with fewer papers is a shorter LINE and not a shorter CARD. Every card
 *    in the list is the same height, which is what makes it scannable down a column.
 *  - **Colour comes from `availabilityView()` only** (AC-19) — never from the `yardConfirmed` boolean,
 *    which supplier-side is just `yardId != null` and would turn every chip green.
 *
 * **All three are decided in `equipment-card-model.ts`, not here.** They are negative rules — *no
 * serial, no capacity, no second band, never navy* — and a negative is not provable against a render.
 * This file receives an `EquipmentCardModel` and paints it; what a card is allowed to KNOW is swept
 * with `Object.keys` over that model instead.
 *
 * **The card body FINDS the machine on the map; «التفاصيل ›» and the photo OPEN it** (app parity,
 * owner 2026-08-15: *"take him zoomed in to the equipment on the map with an animation so he sees
 * which one he clicked"*).
 *
 * ~~The whole card opens the machine (owner, 2026-08-11), because the largest target on the card did
 * the least.~~ Withdrawn. That reasoning was about the card in isolation; beside a map it inverted —
 * the largest target covered the surface the renter was asking a question about. A list beside a map
 * answers *which of these is where*, so the body now flies the camera and never toggles: press the
 * same card again and it flies again, which is what comparing two machines actually looks like.
 *
 * The panel did not get further away. «التفاصيل ›» is the app's one way in, and the photo is a second
 * this surface keeps — it is already the part of the card about looking at the machine closely.
 *
 * **Both ACs still hold, which is why this was the owner's to change.** AC-15 asks that ONE selection
 * value reach the map and the list; opening routes through `nextSelection(…, "open")`, so it still
 * does — and "open" never toggles the selection off, so opening the already-selected card cannot
 * clear the panel it is filling. AC-13 asks that an unconfirmed machine be askable **without** opening
 * the detail; «اطلب التأكيد» is a real button ABOVE the stretched layer, so it still is.
 *
 * The card remains a stretched button UNDER the content rather than one wrapping it: a button inside a
 * button is invalid, and the two inner controls have to stay real buttons to stay reachable.
 *
 * **V17 · the filter bar.** Which chips exist, what each of them keeps, and both figures of the count
 * are `equipmentListView()`'s answers, arriving here as one `view` prop. This file only paints them —
 * which is what lets the workspace derive the marker set from the SAME `view.machines` the cards come
 * from (AC-15), and what makes rules 2, 3 and 4 testable without a DOM.
 *
 * **The filter opens its OWN panel, over the existing one, dismissed by an X** (owner, 2026-08-11).
 * ~~An expanding block that pushes the list down.~~ Withdrawn: it did push the list down, which on a
 * 392 px column meant the machines the chips are about left the screen at the moment the renter was
 * choosing between them. It is now `.bm-eqfp` — the same idiom `.mp-over` gives the company
 * documents: absolutely placed against `.bm-panel` (the panel is the positioned ancestor, so this
 * escapes `.bm-body`'s scroll and covers the column edge to edge), a head carrying its title and the
 * X, its own scroller for the groups, and a foot restating the count so «٣ من ٨» keeps answering
 * while the chips move. Escape still closes it — a panel only its own button can dismiss is a panel
 * the renter has to aim at twice.
 *
 * **None of the filter's RULES moved.** Which chips exist (only criteria the request asked for), what
 * each keeps (a machine HAS the thing, never lacks it), whether a control that would split nothing
 * renders at all, and both figures of the count are still `equipmentListView()`'s — this file gained
 * a surface, not a decision.
 */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
// Two numeral formatters, and the split is deliberate: `arabicIndicDigits` truncates, which is what a
// COUNT wants, and `distanceDigits` keeps one decimal, which is what a measured distance wants.
import { arabicIndicDigits, distanceDigits } from "@/lib/contract/bid-map";
import { listEmptyState, type EquipmentListView } from "@/lib/contract/equipment-list";
import type { FleetMachine } from "@/lib/contract/fleet";
import { equipmentCardModel, type EquipmentCardReadiness } from "@/components/map/equipment-card-model";
import type { MatchRequest } from "@/components/map/panel/machine-panel-model";
import { fmt, useLocale, useT } from "@/lib/i18n";
import { Photo } from "@/components/Photo";

/**
 * **Has this renter had the red-distance explained to him yet?**
 *
 * Per browser, and deliberately unimportant: losing it costs one extra explanation on a control that
 * explains itself, so a throw — a private window, storage blocked, a browser that refuses the
 * accessor outright — reads as "not seen" and the layer opens again. Nothing about the ask depends
 * on it, and nothing is stored but the flag.
 */
const YARD_EXPLAINED_KEY = "moeda.bidmap.yardExplained";

function explainedBefore(): boolean {
  try {
    return window.localStorage.getItem(YARD_EXPLAINED_KEY) === "1";
  } catch {
    return false;
  }
}

function markExplained(): void {
  try {
    window.localStorage.setItem(YARD_EXPLAINED_KEY, "1");
  } catch {
    // A renter who cannot store the flag reads the explanation again next time. That is the whole
    // cost, and it is smaller than any handling this could do.
  }
}

export interface EquipmentListProps {
  /**
   * `equipmentListView(listedMachines(fleet), bid, filterIds)` — the chips, the machines that survive
   * them, and the two figures. Never a bare machine array: the count has to state the whole offer, and
   * a component holding only the filtered half cannot.
   */
  view: EquipmentListView;
  /**
   * The request every card is read against — the source of WHICH certificates a card names (owner,
   * 2026-08-11). It is the request, not the machine, that decides: a card lists what was ASKED FOR,
   * marked held or missing, and never a certificate the machine happens to carry that nobody wanted.
   */
  request?: MatchRequest;
  /** The chip ids currently pressed. Owned by the workspace, because the map filters on them too. */
  filterIds: readonly string[];
  /** Toggle one chip. OR within a group, AND across groups — the model does the combining. */
  onToggleFilter: (id: string) => void;
  /** «امسح التصفية» — one press back to the whole offer. A filter the renter cannot find his way out
   *  of is worse than no filter. */
  onClearFilters: () => void;
  selectedId: string | null;
  /**
   * The one card carrying V6's finite attention cue, or null once it has rested. Separate from
   * `selectedId` on purpose: the accent is a state that persists, the cue is an event that ends
   * (AC-35), and the renter can re-select the landing card later without the pulse coming back.
   */
  cueId: string | null;
  /** Opening IS the card's action now (owner, 2026-08-11) — the whole card opens the machine, and
   *  `nextSelection(…, "open")` focuses it on the way in. There is deliberately no select-only
   *  handler: a second route to the same state that no control calls is a trap for the next reader.
   *  The map's own pins still select without opening; that path does not come through here. */
  onOpenDetail: (equipmentId: string) => void;
  /** Fly the map to this machine without opening its panel (app parity, 2026-08-15). */
  onFocusMachine: (equipmentId: string) => void;
  /** «اطلب التأكيد» — V11 owns the composer and the send; this only says which machine was asked
   *  about. Absent → the control renders disabled rather than claiming an ask was sent. */
  onAskAvailability?: (machine: FleetMachine) => void;
  /**
   * Whether this machine's availability ask is already with the lessor and unanswered — the owner's
   * "one ask, one card" rule (2026-08-10), asked of the workspace because only it can see the
   * conversation. The control then states that it was asked instead of offering to ask again.
   *
   * A predicate rather than a set of ids, for the same reason `onAskAvailability` is a callback: the
   * question "is this ask outstanding" is composed by V11 out of the same draft it would have sent,
   * and a list that assembled its own key would be the rule spelled a second time.
   */
  askPending?: (machine: FleetMachine) => boolean;
  /** Show the supplier's other matching machines, or put them away again (owner, 2026-08-19). The
   *  workspace owns the flag because the MAP reads it too — the pins are derived from the same
   *  `view.machines` these cards come from, so one press moves both surfaces. */
  onToggleShowAll?: () => void;
  /** The panel's scroller, so a selection made ON THE MAP brings its card into view. Deliberately the
   *  container's `scrollTop` rather than `scrollIntoView`, which scrolls every ancestor and moves the
   *  whole page. */
  scrollRef?: RefObject<HTMLElement | null>;
}

export function EquipmentList({
  view,
  request,
  filterIds,
  onToggleFilter,
  onClearFilters,
  selectedId,
  cueId,
  onOpenDetail,
  onFocusMachine,
  onAskAvailability,
  askPending,
  onToggleShowAll,
  scrollRef,
}: EquipmentListProps) {
  const t = useT();
  const { locale } = useLocale();
  const ar = locale === "ar";
  const listRef = useRef<HTMLUListElement | null>(null);
  const machines = view.machines;
  const num = (n: number) => (ar ? arabicIndicDigits(n) : String(n));

  /** The filter groups are behind a control now, so the bar is one line until asked. Escape closes
   *  it — a panel that only its own button can dismiss is a panel the renter has to aim at twice.
   *  (The `filterRef` that used to sit here was written and never read: a ref nothing measures is a
   *  handle for a behaviour that does not exist.) */
  const [filtersOpen, setFiltersOpen] = useState(false);
  useEffect(() => {
    if (!filtersOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFiltersOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filtersOpen]);

  /* ── The distance chip's explanation, and the ask behind it (owner, 2026-08-28) ──────────────
     A red distance says a thing the renter has no way to guess: this is where the machine stands
     TODAY, and nobody has promised it will come from there or that it is free at all. The first
     press explains that before it asks anything; every press after it asks straight away, because a
     renter who has read the explanation is being taught something he has already learnt.

     `asked` is the third state and it is not a tutorial: the question is already with the supplier,
     so the layer shows what he asked and says it is waiting, rather than offering a second card that
     the room's own guard would refuse anyway.

     The seen-flag is per browser and deliberately unimportant: losing it costs one extra explanation
     on a control that explains itself, so every read and write is wrapped and a throw means "not
     seen". Nothing about the ask depends on it. */
  const [yardExplain, setYardExplain] = useState<{ machine: FleetMachine; asked: boolean } | null>(null);
  useEffect(() => {
    if (!yardExplain) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setYardExplain(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [yardExplain]);

  const onYardPress = useCallback(
    (machine: FleetMachine, asked: boolean) => {
      if (asked) { setYardExplain({ machine, asked: true }); return; }
      if (!explainedBefore()) { setYardExplain({ machine, asked: false }); return; }
      onAskAvailability?.(machine);
    },
    [onAskAvailability],
  );

  // Bring the selected card into view when it is off-screen — which is the case when the selection was
  // made on the MAP (AC-15). Already-visible cards are left exactly where they are: scrolling a card
  // the renter just pressed is motion he did not ask for.
  useEffect(() => {
    if (!selectedId) return;
    const box = scrollRef?.current;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-eq="${CSS.escape(selectedId)}"]`);
    if (!box || !el) return;
    const top = el.offsetTop - box.offsetTop;
    const bottom = top + el.offsetHeight;
    if (top >= box.scrollTop && bottom <= box.scrollTop + box.clientHeight) return;
    box.scrollTo({ top: Math.max(0, top - 6), behavior: "smooth" });
  }, [selectedId, scrollRef]);

  // Which of the two explanatory states the list is in — decided by `listEmptyState`, never by two
  // independent conditions here that could both be true at once.
  const empty = listEmptyState(view);

  // RM3-AC-26 — a price and a count were given, and that is the whole statement. No empty card
  // furniture: no <ul>, no card outline, no chip and no photo cell — a greyed-out card would suggest
  // a machine that failed to load. Keyed off `view.total`, never off what is on screen: this state is
  // a fact about the LESSOR, and a filter that happened to hide everything must not be able to reach
  // it (RM3-AC-28e).
  if (empty === "no-machines") {
    return (
      <div className="bm-eqnone">
        <div className="bm-eqnone-t">{t.bidMap.eqNoneRegistered}</div>
        <div className="bm-eqnone-s">{t.bidMap.eqNoneRegisteredWhy}</div>
      </div>
    );
  }

  // The count is the numerals themselves, so each one carries `dir="ltr"` — an Arabic-Indic figure
  // inside an RTL run still reads left to right. The template is split rather than interpolated so
  // the two locales keep ONE key and the word order stays the dictionary's.
  //
  // A FUNCTION, because rule 3's count is now stated in two places: above the list, and again in the
  // filter panel's foot, where the chips being pressed are what move it. One builder, so the two can
  // never say the offer is two different sizes.
  const countLine = (): ReactNode[] =>
    t.bidMap.eqShownOfTotal.split(/(\{n\}|\{total\})/).map((part, i) =>
      part === "{n}" ? (
        <span key={i} dir="ltr">{num(view.shown)}</span>
      ) : part === "{total}" ? (
        <span key={i} dir="ltr">{num(view.total)}</span>
      ) : (
        <span key={i}>{part}</span>
      ),
    );

  return (
    <>
      {/* ── V17 · the filter bar ─────────────────────────────────────────────────────────────────
          Absent entirely when the model offers no group — an empty control row is worse than none.
          The count renders whether or not anything is filtered, because «٨ من ٨» is the sentence that
          makes «٣ من ٨» readable later. */}
      {(view.groups.length > 0 || view.active.length > 0) && (
        <div className="bm-eqf" role="group" aria-label={t.bidMap.eqFilterLabel}>
          <div className="bm-eqf-top">
            <span className="bm-eqf-count">{countLine()}</span>
            {view.active.length > 0 && (
              <button type="button" className="bm-eqf-clear" onClick={onClearFilters}>
                {t.bidMap.eqFilterClear}
              </button>
            )}
            {/* The groups live BEHIND this control (owner, 2026-08-11). Laid out flat, they were two
                labelled rows of chips above every list — furniture the renter reads past on the way
                to the machines, on a panel whose whole width is 392px. One icon states that filtering
                exists and how much of it is on; the panel states the rest, when asked. */}
            {view.groups.length > 0 && (
              <button
                type="button"
                className={`bm-eqf-btn${filtersOpen ? " on" : ""}`}
                /* `aria-haspopup`, not `aria-expanded`: this no longer grows a region below itself,
                   it opens a panel over the column. A reader told the control is "expanded" would go
                   looking underneath it for content that is somewhere else entirely. */
                aria-haspopup="dialog"
                aria-label={t.bidMap.eqFilterLabel}
                title={t.bidMap.eqFilterLabel}
                onClick={() => setFiltersOpen((v) => !v)}
              >
                <span className="material-icons-outlined">tune</span>
                {/* The count of ACTIVE filters, not of groups — the number that tells the renter the
                    list in front of them is not the whole offer. */}
                {view.active.length > 0 && (
                  <span className="bm-eqf-btn-n" dir="ltr">{num(view.active.length)}</span>
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── The filter's OWN panel, over the existing one (owner, 2026-08-11) ─────────────────────
          `.mp-over`'s idiom, and deliberately so: the company documents already open this way, and a
          surface that has two ways of saying "a second layer" teaches the renter neither. Absolutely
          placed, so its containing block is `.bm-panel` (the only positioned ancestor) rather than
          `.bm-body` — which is what lets it escape the list's scroll and cover the column whole,
          counts and header included, instead of scrolling away with the cards it is filtering.

          It renders only while there is something to filter WITH: `view.groups` empty and the panel
          has no content, and the control that opens it does not exist either.

          `role="dialog"` with a name, and deliberately **no `aria-modal`**: nothing here traps focus,
          and `aria-modal` tells a screen reader to hide everything else — which would be a claim the
          keyboard can immediately disprove by tabbing straight out into the list behind it. The
          company panel makes no ARIA claim at all; this one names itself because, unlike that panel,
          it has no heading of its own in the reading order above it. */}
      {filtersOpen && view.groups.length > 0 && (
        <div className="bm-eqfp" role="dialog" aria-label={t.bidMap.eqFilterLabel}>
          <div className="bm-eqfp-head">
            <span className="bm-eqfp-t">{t.bidMap.eqFilterLabel}</span>
            {/* An X, not a back chevron. The company panel goes BACK to what it covered; this one is
                dismissed — the renter is not travelling anywhere, he is putting a tool away. */}
            <button
              type="button"
              className="bm-eqfp-x"
              aria-label={t.common.close}
              title={t.common.close}
              onClick={() => setFiltersOpen(false)}
            >
              <span className="material-icons-outlined">close</span>
            </button>
          </div>

          <div className="bm-eqfp-body">
            {view.groups.map((g) => (
              <div className="bm-eqf-row" key={g.kind}>
                <span className="bm-eqf-label">{ar ? g.label.ar : g.label.en}</span>
                <div className="bm-eqf-chips">
                  {g.options.map((o) => {
                    const on = filterIds.includes(o.id);
                    return (
                      <button
                        key={o.id}
                        type="button"
                        className={`bm-eqf-chip${on ? " on" : ""}`}
                        aria-pressed={on}
                        onClick={() => onToggleFilter(o.id)}
                      >
                        {ar ? o.label.ar : o.label.en}
                        <span className="bm-eqf-n" dir="ltr">{num(o.matches)}</span>
                      </button>
                    );
                  })}
                </div>
                {/* The note that used to sit here — «machines with an unknown distance are still
                    shown» — is gone by decision (owner, 2026-08-08): a yard is required to register a
                    machine, so a null distance needs a yard DELETED after the fact, or one the
                    ownership gate refuses. Rare enough that a permanent line explaining it is clutter.

                    **The BEHAVIOUR it described is unchanged** — such a machine is still kept by every
                    band. Filtering it out would delete a real offered machine on the strength of a fact
                    nobody has, and «غير معروفة» is not «بعيدة». Only the explanation is withdrawn, not
                    the rule.

                    The `keepsUnknownDistance` flag that fed this note, and the `.bm-eqf-note` style and
                    `eqFilterUnknownDistance` string that rendered it, are gone with it — a reporting
                    channel with no reader. `equipment-list.test.ts` now pins the rule against
                    `filterMachines` directly, which is where it actually lives. */}
              </div>
            ))}
          </div>

          {/* The foot carries rule 3 a second time, and that is the point of covering the list: with
              the cards hidden, «٣ من ٨» is the only thing telling the renter what a chip just cost
              him — and it still names the WHOLE offer as the denominator. «امسح التصفية» is here as
              well as in the bar because the bar is behind this panel: a renter three chips deep with
              no way out would have to close the panel to find the control that undoes it. */}
          <div className="bm-eqfp-foot">
            <span className="bm-eqf-count">{countLine()}</span>
            {view.active.length > 0 && (
              <button type="button" className="bm-eqf-clear" onClick={onClearFilters}>
                {t.bidMap.eqFilterClear}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── What a red distance means, and the ask behind it (owner, 2026-08-28) ──────────────────
          ~~`.bm-eqfp`'s idiom: a layer filling the equipment column.~~ Withdrawn by the owner on
          2026-09-04 — «i want this to open as modal and very clear and simple just few lines and will
          open over the chat panel on the left in the background so he can send the request directly».

          So it is a MODAL over the whole surface now, not a panel inside one column. Two reasons, and
          both are about the press it leads to: covering the column hid the very card the renter was
          reading, and the ask it offers lands in the CHAT, which the column layer could not show him.
          Centred on the veil, the chat sits behind it dimmed but legible, and «Ask the supplier» is a
          thing he watches arrive where it goes.

          `position: fixed`, so the panel it is rendered inside does not clip it.

          Two states, one layer. The FIRST press on an unconfirmed distance explains what the colour
          means and then offers the ask — because "not confirmed" is the one fact on this card a
          renter cannot get from the card. Once he has read it, later presses go straight to the ask
          and never come back here.

          On a machine already asked about it says so and shows nothing to press: the question is in
          the room, and a second «Ask» would post a duplicate card the backend's own guard refuses.

          `role="dialog"` with a name, and `aria-modal` is now TRUE where it was false: a veil covers
          the surface, so "everything else is hidden" is the claim the screen actually makes. */}
      {yardExplain && (() => {
        /* One model call for the whole layer: the machine's name, and the number the two specimens
           below are drawn with. The specimen shows THIS machine's distance in both colours — an
           invented figure would be a screenshot of a different machine. */
        const explainCard = equipmentCardModel(yardExplain.machine, request);
        const sampleKm = explainCard.km != null ? distanceDigits(explainCard.km, ar) : "—";
        /* ── Out of the panel, into the document (owner, 2026-09-04) ────────────────────────────
           The chat is `z-index: 31` and this column is `z-index: 24`, so ANY layer rendered inside
           the panel paints under the conversation — including one that says «over the chat». A
           portal to `<body>` is what puts the veil above both. That is also why the modal's rules in
           `map-proto.css` carry no `.bidmap` ancestor: outside the surface's own subtree, they would
           never match. */
        return createPortal(
        <div
          className="bm-eqyx-veil"
          onClick={(e) => {
            // The veil closes; the card on it does not. Without the target check every press inside
            // the dialog would bubble out here and shut it.
            if (e.target === e.currentTarget) setYardExplain(null);
          }}
        >
        <div className="bm-eqyx" role="dialog" aria-modal="true" aria-label={yardExplain.asked ? t.bidMap.eqYardAskedTitle : t.bidMap.eqYardExplainTitle}>
          <div className="bm-eqyx-head">
            <span className="bm-eqyx-t">{yardExplain.asked ? t.bidMap.eqYardAskedTitle : t.bidMap.eqYardExplainTitle}</span>
            <button
              type="button"
              // Its own class, not `.bm-eqfp-x`: that rule is scoped to `.bidmap`, and this dialog
              // is portalled out of it.
              className="bm-eqyx-x"
              aria-label={t.common.close}
              title={t.common.close}
              onClick={() => setYardExplain(null)}
            >
              <span className="material-icons-outlined">close</span>
            </button>
          </div>

          <div className="bm-eqyx-body">
            {/* The machine this is about, so a layer covering the surface still says which card it
                came off. */}
            <div className="bm-eqyx-eq">
              <span className="bm-eqyx-name">{ar ? explainCard.title.ar : explainCard.title.en}</span>
              {explainCard.km != null && (
                <span className="bm-eqyx-km">
                  <span dir="ltr">{distanceDigits(explainCard.km, ar)}</span> {t.bidMap.eqDistanceUnit}
                </span>
              )}
            </div>

            {yardExplain.asked ? (
              <>
                <p className="bm-eqyx-p">{t.bidMap.eqYardAskedBody}</p>
                <div className="bm-eqyx-q">
                  <span className="bm-eqyx-qh">{t.bidMap.eqYardAskedWhat}</span>
                  {/* His own question, in the words the card put in the room — not a paraphrase of
                      it. `eqAskConfirmWhy` is the ask's own sentence, which is what the request card
                      carries. */}
                  <span className="bm-eqyx-qt">{t.bidMap.eqAskConfirmWhy}</span>
                </div>
              </>
            ) : (
              <>
                {/* ── The colour, shown rather than described ────────────────────────────────────
                    Two specimens of the same distance, before and after he answers. The renter has
                    the red one in front of him; putting the green one beside it is what makes
                    «turns green» a thing he has seen rather than a promise in a paragraph. */}
                <div className="bm-eqyx-demo" aria-hidden="true">
                  {/* The specimens carry the mark where the CARD carries it — trailing — or the demo
                      stops being a picture of the thing the renter is looking at. */}
                  <span className="bm-eqyx-spec no">
                    <span className="bm-eqyx-specn" dir="ltr">{sampleKm}</span>
                    <span className="bm-eqyx-specu">{t.bidMap.eqDistanceUnit}</span>
                    <span className="material-icons-outlined">help_outline</span>
                  </span>
                  <span className="bm-eqyx-arrow material-icons-outlined">arrow_forward</span>
                  <span className="bm-eqyx-spec ok">
                    <span className="bm-eqyx-specn" dir="ltr">{sampleKm}</span>
                    <span className="bm-eqyx-specu">{t.bidMap.eqDistanceUnit}</span>
                    <span className="material-icons-outlined">check_circle</span>
                  </span>
                </div>

                {/* ── Three lines, not three paragraphs (owner, 2026-09-04) ──────────────────────
                    ~~A numbered tutorial with a heading and a body per step.~~ Withdrawn. It was
                    right about the ORDER and wrong about the length: this layer stands between the
                    renter and the one press he came for, so it earns its place in the seconds it
                    takes to read. One sentence each — what the number is, why it is red, what the
                    press does — and the button is already under his eye. */}
                <ul className="bm-eqyx-lines">
                  {[t.bidMap.eqYardLine1, t.bidMap.eqYardLine2, t.bidMap.eqYardLine3].map((line) => (
                    <li key={line} className="bm-eqyx-line">
                      <span className="bm-eqyx-dot" aria-hidden="true" />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          {/* The way on. Only the explanation has one: an asked machine's layer is a statement, and a
              statement with a primary button under it invites the press it exists to prevent. */}
          {!yardExplain.asked && (
            <div className="bm-eqyx-foot">
              <button type="button" className="bm-eqyx-later" onClick={() => setYardExplain(null)}>
                {t.bidMap.eqYardExplainLater}
              </button>
              <button
                type="button"
                className="bm-eqyx-cta"
                disabled={!onAskAvailability}
                onClick={() => {
                  // Marked BEFORE the ask, not after: the renter has read it either way, and a
                  // failed send that also reset the flag would explain the same thing twice.
                  markExplained();
                  const m = yardExplain.machine;
                  setYardExplain(null);
                  onAskAvailability?.(m);
                }}
              >
                {t.bidMap.eqYardExplainCta}
              </button>
            </div>
          )}
        </div>
        </div>,
        document.body,
        );
      })()}

      {/* The filtered empty state NAMES what emptied it and offers the way out. Plain «لا توجد نتائج»
          would read as "this lessor has nothing" — a claim about him rather than about the chips, and
          the exact confusion RM3-AC-26's state exists to avoid. The two are deliberately unalike in
          wording, in colour and in the fact that only this one carries an action. */}
      {empty === "filtered" ? (
        <div className="bm-eqfnone" role="status">
          <div className="bm-eqfnone-t">{t.bidMap.eqFilterEmpty}</div>
          <div className="bm-eqfnone-s">
            {fmt(t.bidMap.eqFilterEmptyWhy, {
              filters: view.active.map((o) => (ar ? o.label.ar : o.label.en)).join(" · "),
              total: num(view.total),
            })}
          </div>
          <button type="button" className="bm-eqfnone-act" onClick={onClearFilters}>
            {t.bidMap.eqFilterClear}
          </button>
        </div>
      ) : (
        <ul className="bm-eqlist" ref={listRef}>
          {machines.map((m, i) => (
            <Fragment key={m.equipmentId}>
              {/* ~~«Also in his fleet — not in this offer», drawn once before the first machine that
                  is not in the offer.~~ Removed by the owner (2026-08-31). It restated on the LIST a
                  distinction the renter had already told us he does not act on — the same reasoning
                  that took the «in this offer» badge off the card on 2026-08-19: what he is choosing
                  between is machines that can be confirmed for him, and the sentence sorted them by
                  a fact about paperwork instead.

                  The ORDER is untouched — `listedMachines` still puts the offer first — and the map
                  still tags membership on the pin, so nothing became unknowable. */}
            <EquipmentCard
              machine={m}
              index={i}
              // The request reaches the CARD, which is what decides which certificates it names.
              // Threaded but not forwarded, `equipmentCardModel(machine, undefined)` names none —
              // and since the fallback is deliberately "no chips" rather than the machine's papers,
              // the omission was silent on the surface and visible only as an unused prop.
              request={request}
              selected={selectedId === m.equipmentId}
              cue={cueId === m.equipmentId}
              ar={ar}
              t={t}
              num={num}
              onOpenDetail={onOpenDetail}
              onFocusMachine={onFocusMachine}
              onYardPress={onYardPress}
              askPending={askPending}
            />
            </Fragment>
          ))}
        </ul>
      )}

      {/* ── The expander (owner, 2026-08-19) ─────────────────────────────────────────────────────
          «+3 أخرى في أسطوله» — the machines this supplier has that this offer does not name. It
          closes the list because that is where the question arises: a renter reaches the end of what
          he is being sold and asks whether that is everything the supplier has.

          It states the COUNT, not just "show all". A control that will add three cards and three
          pins should say so before it is pressed — the panel is 392px wide and the map is already
          drawn, and both change under the renter at once.

          Absent when `beyondOffer` is 0, which covers both the supplier who offered his whole
          matching fleet and the filters that left none of the others standing. */}
      {view.beyondOffer > 0 && (
        <button
          type="button"
          className={`bm-eqmore${view.showingAll ? " on" : ""}`}
          aria-expanded={view.showingAll}
          onClick={onToggleShowAll}
        >
          <span className="material-icons-outlined">{view.showingAll ? "expand_less" : "expand_more"}</span>
          {view.showingAll
            ? t.bidMap.eqShowOfferOnly
            : fmt(t.bidMap.eqShowAll, { n: num(view.beyondOffer) })}
        </button>
      )}
    </>
  );
}

function EquipmentCard({
  machine,
  index,
  selected,
  cue,
  ar,
  t,
  num,
  onOpenDetail,
  onFocusMachine,
  onYardPress,
  askPending,
  request,
}: {
  machine: FleetMachine;
  index: number;
  selected: boolean;
  cue: boolean;
  ar: boolean;
  t: ReturnType<typeof useT>;
  /** The list's own numeral formatter — threaded rather than re-derived, so the dots' fraction is
   *  written in the same digits as the count above the list. */
  num: (n: number) => string;
  /** No `onSelect`: the card FINDS on the map, and the file icon opens the detail. A select-only
   *  handler here would be a second way to change the same state that nothing calls. */
  onOpenDetail: (id: string) => void;
  onFocusMachine: (id: string) => void;
  /**
   * The distance chip was pressed on an unconfirmed machine — `asked` says whether his question is
   * already with the supplier. The LIST decides what happens next, because what happens next is a
   * layer over the whole column: an explanation the first time, the ask itself after that, and on an
   * asked machine the question he already put.
   */
  onYardPress: (machine: FleetMachine, asked: boolean) => void;
  askPending?: (machine: FleetMachine) => boolean;
  /** The request this machine is read against — the source of WHICH certificates the readiness
   *  fraction scores (owner, 2026-08-11). Absent → the photos and the ownership paper alone, which
   *  is a real reading rather than a fallback. */
  request?: MatchRequest;
}) {
  // Everything this card states — and everything it is allowed to know — is one model call. The chip
  // is `availabilityView`'s, which is the SAME call `machineMarkers` makes for this machine's pin
  // (AC-19), and the model carries no serial and no capacity for the card to reach for even by
  // accident (AC-12).
  const card = useMemo(() => equipmentCardModel(machine, request), [machine, request]);
  const { chip, photo, readiness } = card;
  /** Asked, and not yet answered. The workspace decides it — only it can see the conversation — and
   *  the card paints the answer. */
  const pending = askPending?.(machine) ?? false;
  const confirmed = chip.availability === "confirmed";
  const title = ar ? card.title.ar : card.title.en;
  const km = card.km;
  /* The chip's own state as ONE word rather than two booleans read in four places: a fourth state
     would be a type error here instead of a silent fall-through into "not confirmed". */
  const yard: "ok" | "asked" | "no" = confirmed ? "ok" : pending ? "asked" : "no";

  return (
    <li
      className={`bm-eq${selected ? " on" : ""}${cue ? " cue" : ""}`}
      data-eq={machine.equipmentId}
      // The staggered arrival is the prototype's `0.05 + index·0.07s` — the list reads as being
      // assembled in distance order rather than dumped. Inline because it is per-card data.
      style={{ animationDelay: `${(0.05 + index * 0.07).toFixed(2)}s` }}
    >
      {/* The selected card's own edge — see `.bm-eq.on` for why the navy border alone did not read
          as chosen. */}
      {selected && <span className="bm-eq-acc" aria-hidden="true" />}

      {/* The WHOLE CARD finds the machine on the map; the file icon opens its detail (app parity,
          owner 2026-08-15). A stretched button UNDER the content rather than one wrapping it — a
          button inside a button is invalid, and the two real controls above it have to stay
          reachable. Never a toggle: pressing the same card again flies again, which is what
          comparing two machines actually looks like. */}
      <button
        type="button"
        className="bm-eq-select"
        aria-label={`${t.bidMap.eqFind} — ${title}`}
        /* `aria-current`, not `aria-pressed`: this navigates, it does not toggle, and "the current
           machine in this list" is what the accent means. */
        aria-current={selected || undefined}
        onClick={() => onFocusMachine(machine.equipmentId)}
      />

      <div className="bm-eq-in">
        {/* ── The machine's own picture, back where it was (owner, 2026-08-29) ─────────────────────
            *"I want the images of the front image of equipment back."* It was cut on 08-28 as
            furniture and it is not: a column of machines is a fleet, and a renter comparing three
            excavators recognises them by sight before he reads a word of either title.

            ~~Brought back as a banner across the card's top.~~ Withdrawn the same day, on seeing it:
            *"make the photo back in same place and design of previous card ui which was on the
            side."* A full-width banner gave a 104px cell's worth of subject a 366px stage, so a
            machine with no photo was a third of the card saying «No photo» — the exact "empty card
            furniture" the surface's own empty state was written to avoid.

            So: the 104px side cell, stretched to the card's height, exactly as it was. The corner
            controls go back inside the text column with it.

            The cell shimmers while a photo decodes; `is-empty` stops it for a machine that has none,
            because nothing is arriving and a placeholder travelling forever says otherwise.

            It OPENS the detail, above the stretched find-on-map layer (owner, 2026-08-18): the
            picture is the part of the card already about looking at the machine closely, so pressing
            it to see it closely is not a rule the renter has to learn. */}
        <span
          role="button"
          tabIndex={0}
          aria-label={`${t.bidMap.eqOpenFile} — ${title}`}
          className={`bm-eq-photo${photo ? "" : " is-empty"}`}
          onClick={() => onOpenDetail(machine.equipmentId)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onOpenDetail(machine.equipmentId);
            }
          }}
        >
          {/* The app's one placeholder, not a sentence (owner, 2026-09-02). «No photo» set in 9.5px was
              a paragraph standing where a picture goes, and it read as an error rather than as an
              absence. `Photo` also covers the case the old branch could not see: a machine that NAMES
              a photograph the bucket does not hold, which drew the browser's broken glyph. */}
          <Photo src={photo} alt="" className="bm-eq-art" />
        </span>

        <div className="bm-eq-tx">
          {/* ── The corner: how complete the file is, and the way into it (owner, 2026-08-28) ─────
              Both are facts about the machine's PAPERS, which is a different subject from the
              distance below and from the supplier's promise that colours it. They sit together,
              small, in the corner the reader's eye leaves the card by.

              «Details ›» is gone as a word. The icon is the file under a magnifier, which is what the
              control has always done — look inside this machine's file. */}
          <div className="bm-eq-hd">
            {/* How complete the file is, on the LEADING edge (owner, 2026-08-31) — the first thing
                read on the card's first line, and it sits beside the control that opens the papers
                it counts. */}
            <ReadinessBar
              readiness={readiness}
              label={`${num(readiness.done)}/${num(readiness.total)}`}
              title={fmt(t.bidMap.eqReadinessOnFile, { done: num(readiness.done), total: num(readiness.total) })}
            />
            <button
              type="button"
              className="bm-eq-open"
              aria-label={`${t.bidMap.eqOpenFile} — ${title}`}
              title={t.bidMap.eqOpenFile}
              onClick={() => onOpenDetail(machine.equipmentId)}
            >
              {/* The owner's own glyph (2026-08-31) — a document with its lines, read under a
                  magnifier, the document's edge broken where the lens crosses it. Drawn rather than
                  fetched: the material set's `find_in_page` puts the lens INSIDE the page, which
                  reads as a search box on a form; this reads as reviewing the papers. */}
              <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" focusable="false">
                <path
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M17.8 11.1V1.2H1.3v21.7h16.5v-3M4.7 5.2h9.3M4.7 9.6h6.2M4.7 14h3.7M4.7 18.4h3.7"
                />
                <circle cx="15.2" cy="15.2" r="4" fill="none" stroke="currentColor" strokeWidth="1.7" />
                <path fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" d="m18.2 18.2 3.5 3.5" />
              </svg>
            </button>
          </div>

          {/* ── The distance, and it IS the card (owner, 2026-08-28) ────────────────────────────────
              The dominant object, painted with the one thing that qualifies it: whether the supplier
              has promised this machine for this offer.

              A red distance is not a bad distance. It is a distance nobody has promised — the machine
              stands there today, and the supplier has not said it would come from there, or that it is
              free at all. That sentence is what a renter could not get from a chip reading «Not
              confirmed» beside a black number, and it is why pressing this opens an explanation before
              it opens an ask: the first press teaches, every press after it asks.

              Green with a tick is the settled case, and it is not a control — there is nothing left to
              ask. Red with a «?» is the question. Red with a clock is the question already put: it
              still opens, and shows him what he asked rather than offering to ask again.

              AC-13 holds and is now stronger: an unconfirmed machine is askable without opening the
              detail, and the ask is the largest object on the card rather than a 10px link beside a
              chip. AC-33 too — the ask's ink is still `askAvailability.colour`, carried on the rule
              under the prompt below. */}
          {yard === "ok" ? (
            <span className="bm-eq-yard ok" title={t.bidMap.eqYardConfirmedWhy}>
              <span className="material-icons-outlined" aria-hidden="true">check_circle</span>
              <Distance km={km} ar={ar} t={t} />
            </span>
          ) : (
            <button
              type="button"
              className={`bm-eq-yard ${yard}`}
              title={yard === "asked" ? t.bidMap.askPendingWhy : t.bidMap.eqYardUnconfirmedWhy}
              /* No inline ink. `askAvailability.colour` is the ASK's colour — `var(--info)`, blue —
                 and it was right while it painted a separate «Ask him to confirm» prompt. With that
                 prompt gone it would have painted the FIGURE blue, and the figure is availability's
                 (owner, 2026-08-31: *"keep the font of distance red"*). RM3-AC-33 is satisfied on
                 the surfaces that still render an ask CONTROL of their own; this one renders a
                 distance whose colour is the availability, and one fact may only have one ink. */
              onClick={() => onYardPress(machine, yard === "asked")}
            >
              {/* The mark sits AFTER the distance (owner, 2026-09-04). Leading, it was the first thing
                  the eye met on a row whose whole point is the number — a question mark introducing a
                  figure reads as doubt about the row, not as a control. Trailing, the number leads and
                  the mark is what it is: the way to ask about it. */}
              <Distance km={km} ar={ar} t={t} />
              <span className="material-icons-outlined" aria-hidden="true">
                {yard === "asked" ? "schedule" : "help_outline"}
              </span>
            </button>
          )}

          {/* The machine itself — model and year, under the number they belong to. It is the caption on
              the distance, not the headline: the renter is choosing between machines by where they are
              and how sure that is, and the name is what he confirms once he has chosen.

              No serial and no capacity (AC-12): the serial identifies the machine to the system, not to
              a renter, and the size is already stated once in the count pills above the list. */}
          <div className="bm-eq-model" title={title}>{title}</div>

          {/* The yard is outside the request city's own radius — the fact that turns a delivery into a
              mobilisation. It qualifies the distance, so it follows it. */}
          {card.outOfCity && <div className="bm-eq-far">{t.bidMap.eqOutOfCity}</div>}
        </div>
      </div>
    </li>
  );
}

/** The distance itself, in both states of knowing it. `distanceDigits`, never `arabicIndicDigits` —
 *  that one truncates, which is right for a count and would silently turn 7.5 km into «٧». */
function Distance({ km, ar, t }: { km: number | null; ar: boolean; t: ReturnType<typeof useT> }) {
  if (km == null) return <span className="bm-eq-kmu">{t.bidMap.eqNoDistance}</span>;
  return (
    <span className="bm-eq-dist">
      <span className="bm-eq-km" dir="ltr">{distanceDigits(km, ar)}</span>
      <span className="bm-eq-kmu">{t.bidMap.eqDistanceUnit}</span>
    </span>
  );
}

/**
 * **How complete this machine's file is** — a bar and its fraction (owner, 2026-08-31: the dots were
 * *"clearer than dots"* territory). The figures are the app's: `computeUnitReadiness`'s
 * `done`/`total` with ownership scored, which is exactly what the app's own map panel reads
 * (`bid_map.dart:470-473`).
 *
 * ~~One dot per scored requirement.~~ Withdrawn. Dots kept the denominator honest — «75%» hides both
 * how many requirements there are and how close three is — but they made the reader COUNT, twice,
 * to learn a fraction. The bar shows how far along at a glance and «3/4» keeps the two numbers, so
 * nothing the dots protected is lost and the counting is gone.
 *
 * The colour is the readiness band's and never the availability colour: the papers are a fact about
 * the FILE, the distance is a promise from the SUPPLIER, and reading one off the other is the whole
 * mistake this card is arranged to prevent.
 */
function ReadinessBar({ readiness, label, title }: { readiness: EquipmentCardReadiness; label: string; title: string }) {
  const { done, total, band } = readiness;
  if (total <= 0) return null;
  return (
    <span className={`bm-eq-rd ${band}`} title={title} aria-label={title} role="img">
      <span className="bm-eq-rdbar">
        <span className="bm-eq-rdfill" style={{ width: `${Math.round((done / total) * 100)}%` }} />
      </span>
      <span className="bm-eq-rdn" dir="ltr">{label}</span>
    </span>
  );
}
