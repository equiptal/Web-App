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
// Two numeral formatters, and the split is deliberate: `arabicIndicDigits` truncates, which is what a
// COUNT wants, and `distanceDigits` keeps one decimal, which is what a measured distance wants.
import { arabicIndicDigits, distanceDigits, isInOffer } from "@/lib/contract/bid-map";
import { listEmptyState, type EquipmentListView } from "@/lib/contract/equipment-list";
import type { FleetMachine } from "@/lib/contract/fleet";
import { equipmentCardModel, type EquipmentCardReadiness } from "@/components/map/equipment-card-model";
import type { MatchRequest } from "@/components/map/panel/machine-panel-model";
import { fmt, useLocale, useT } from "@/lib/i18n";

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
          `.bm-eqfp`'s idiom, and deliberately so: the filter panel and the company documents already
          open this way, and a surface with two ways of saying "a second layer" teaches the renter
          neither. Absolutely placed against `.bm-panel`, so it escapes the list's scroll and covers
          the column whole rather than scrolling away with the card it is about.

          Two states, one layer. The FIRST press on an unconfirmed distance explains what the colour
          means and then offers the ask — because "not confirmed" is the one fact on this card a
          renter cannot get from the card. Once he has read it, later presses go straight to the ask
          and never come back here.

          On a machine already asked about it says so and shows nothing to press: the question is in
          the room, and a second «Ask» would post a duplicate card the backend's own guard refuses.

          `role="dialog"` with a name and deliberately no `aria-modal`: nothing here traps focus, and
          `aria-modal` would tell a screen reader that everything else is hidden — a claim the
          keyboard disproves by tabbing straight out into the list behind it. */}
      {yardExplain && (
        <div className="bm-eqfp bm-eqyx" role="dialog" aria-label={yardExplain.asked ? t.bidMap.eqYardAskedTitle : t.bidMap.eqYardExplainTitle}>
          <div className="bm-eqfp-head">
            <span className="bm-eqfp-t">{yardExplain.asked ? t.bidMap.eqYardAskedTitle : t.bidMap.eqYardExplainTitle}</span>
            <button
              type="button"
              className="bm-eqfp-x"
              aria-label={t.common.close}
              title={t.common.close}
              onClick={() => setYardExplain(null)}
            >
              <span className="material-icons-outlined">close</span>
            </button>
          </div>

          <div className="bm-eqfp-body bm-eqyx-body">
            {/* The machine this is about, so a layer covering the column still says which card it
                came off. */}
            <div className="bm-eqyx-eq">
              {(() => {
                const c = equipmentCardModel(yardExplain.machine, request);
                return (
                  <>
                    <span className="bm-eqyx-name">{ar ? c.title.ar : c.title.en}</span>
                    {c.km != null && (
                      <span className="bm-eqyx-km">
                        <span dir="ltr">{distanceDigits(c.km, ar)}</span> {t.bidMap.eqDistanceUnit}
                      </span>
                    )}
                  </>
                );
              })()}
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
                <p className="bm-eqyx-p">{t.bidMap.eqYardExplainBody}</p>
                <p className="bm-eqyx-p">{t.bidMap.eqYardExplainHow}</p>
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
      )}

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
              {/* Where the offer ends. Drawn once, before the first machine that is not in it, so the
                  renter knows why the cards below appeared rather than finding them mixed in. The
                  model orders the array offer-first, which is what makes "the first one that isn't"
                  a real boundary rather than a guess. */}
              {!isInOffer(m) && (i === 0 || isInOffer(machines[i - 1])) && (
                <li className="bm-eqsplit" aria-hidden="true">
                  <span>{t.bidMap.eqBeyondOffer}</span>
                </li>
              )}
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
          «+٣ أخرى في أسطوله» — the machines this supplier has that this offer does not name. It
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
  const { chip, photo, askAvailability, readiness } = card;
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
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="" className="bm-eq-art" />
          ) : (
            <span className="bm-eq-nophoto">{t.bidMap.eqNoPhoto}</span>
          )}
        </span>

        <div className="bm-eq-tx">
          {/* ── The corner: how complete the file is, and the way into it (owner, 2026-08-28) ─────
              Both are facts about the machine's PAPERS, which is a different subject from the
              distance below and from the supplier's promise that colours it. They sit together,
              small, in the corner the reader's eye leaves the card by.

              «Details ›» is gone as a word. The icon is the file under a magnifier, which is what the
              control has always done — look inside this machine's file. */}
          <div className="bm-eq-hd">
            <ReadinessDots
              readiness={readiness}
              title={fmt(t.bidMap.eqReadinessOnFile, { done: num(readiness.done), total: num(readiness.total) })}
            />
            <button
              type="button"
              className="bm-eq-open"
              aria-label={`${t.bidMap.eqOpenFile} — ${title}`}
              title={t.bidMap.eqOpenFile}
              onClick={() => onOpenDetail(machine.equipmentId)}
            >
              {/* Drawn rather than fetched: this surface loads no icon set of its own beyond the
                  material font, which has no file-under-a-magnifier, and an inline path cannot go
                  missing at runtime. */}
              <svg viewBox="0 0 512 512" width="17" height="17" aria-hidden="true" focusable="false">
                <path
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="34"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M379 236V25H27v462h352v-63M101 111h198M101 205h132M101 299h79M101 393h79"
                />
                <circle cx="325" cy="325" r="86" fill="none" stroke="currentColor" strokeWidth="34" />
                <path fill="none" stroke="currentColor" strokeWidth="34" strokeLinecap="round" d="m389 389 74 74" />
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
              onClick={() => onYardPress(machine, yard === "asked")}
            >
              <span className="material-icons-outlined" aria-hidden="true">
                {yard === "asked" ? "schedule" : "help_outline"}
              </span>
              <Distance km={km} ar={ar} t={t} />
              {/* The prompt under the number, in the ask's own ink (RM3-AC-33) — the model stays the
                  one authority on this control's colour. On an asked card it states that instead. */}
              <span className="bm-eq-yardq" style={askAvailability ? { color: askAvailability.colour } : undefined}>
                {yard === "asked" ? t.bidMap.eqAskAnotherSent : t.bidMap.eqAskConfirm}
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
 * **How complete this machine's file is** — one dot per scored requirement, filled for what is on
 * file (owner, 2026-08-28). The fraction is the app's: `computeUnitReadiness`'s `done`/`total` with
 * ownership scored, which is exactly what the app's own map panel reads (`bid_map.dart:470-473`).
 *
 * Dots rather than a percentage, and one dot per requirement rather than a fixed five: the renter is
 * looking at a file with four things in it, and «75%» hides both how many there are and how close
 * three is. Past eight the dots stop being countable at a glance, so they become a bar of the same
 * colour — the shape changes, the fraction does not.
 *
 * The colour is the readiness band's and never the availability colour: the papers are a fact about
 * the FILE, the distance is a promise from the SUPPLIER, and reading one off the other is the whole
 * mistake this card is arranged to prevent.
 */
function ReadinessDots({ readiness, title }: { readiness: EquipmentCardReadiness; title: string }) {
  const { done, total, band } = readiness;
  if (total <= 0) return null;
  const cls = `bm-eq-rd ${band}`;
  if (total > 8) {
    return (
      <span className={cls} title={title} aria-label={title} role="img">
        <span className="bm-eq-rdbar">
          <span className="bm-eq-rdfill" style={{ width: `${Math.round((done / total) * 100)}%` }} />
        </span>
      </span>
    );
  }
  return (
    <span className={cls} title={title} aria-label={title} role="img">
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`bm-eq-rdot${i < done ? " on" : ""}`} aria-hidden="true" />
      ))}
    </span>
  );
}
