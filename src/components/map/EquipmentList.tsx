"use client";

/**
 * **V5 — the equipment list**, plus **V6's card half** of the landing pre-selection
 * (spec 004 §6.4; RM3-AC-09→13, AC-15, AC-32, AC-33, AC-34, AC-35).
 *
 * **Flat, nearest first, offered machines only.** The filter and the sort are not here — they are
 * `offeredMachines()` in `lib/contract/equipment-list.ts`, because the map draws the same set and two
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
 * **The whole card OPENS the machine** (owner, 2026-08-11). ~~The card body selects; «التفاصيل»
 * opens.~~ Withdrawn: the largest target on the card did the least, and a renter who had already
 * pressed the machine had to find a 10 px pill to get what they had asked for. «التفاصيل» stays as
 * the visible affordance — it names what the press does — but it is no longer the only way in.
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

import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
// Two numeral formatters, and the split is deliberate: `arabicIndicDigits` truncates, which is what a
// COUNT wants, and `distanceDigits` keeps one decimal, which is what a measured distance wants.
import { arabicIndicDigits, distanceDigits } from "@/lib/contract/bid-map";
import { listEmptyState, type EquipmentListView } from "@/lib/contract/equipment-list";
import type { FleetMachine } from "@/lib/contract/fleet";
import { equipmentCardModel } from "@/components/map/equipment-card-model";
import type { MatchRequest } from "@/components/map/panel/machine-panel-model";
import { fmt, useLocale, useT } from "@/lib/i18n";

export interface EquipmentListProps {
  /**
   * `equipmentListView(offeredMachines(fleet), bid, filterIds)` — the chips, the machines that survive
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
  onAskAvailability,
  askPending,
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
            <EquipmentCard
              key={m.equipmentId}
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
              onOpenDetail={onOpenDetail}
              onAskAvailability={onAskAvailability}
              askPending={askPending}
            />
          ))}
        </ul>
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
  onOpenDetail,
  onAskAvailability,
  askPending,
  request,
}: {
  machine: FleetMachine;
  index: number;
  selected: boolean;
  cue: boolean;
  ar: boolean;
  t: ReturnType<typeof useT>;
  /** No `onSelect`: the card OPENS now, and opening selects on its way in. A select-only handler
   *  here would be a second way to change the same state that nothing calls. */
  onOpenDetail: (id: string) => void;
  onAskAvailability?: (machine: FleetMachine) => void;
  askPending?: (machine: FleetMachine) => boolean;
  /** The request this machine is read against — the source of WHICH certificates the card names
   *  (owner, 2026-08-11). Absent → no certificate chips, which reads as "nothing was asked for"
   *  rather than as an inventory of what the machine happens to carry. */
  request?: MatchRequest;
}) {
  // Everything this card states — and everything it is allowed to know — is one model call. The chip
  // is `availabilityView`'s, which is the SAME call `machineMarkers` makes for this machine's pin
  // (AC-19), and the model carries no serial, no capacity and no second band for the card to reach
  // for even by accident (AC-12, AC-32).
  const card = useMemo(() => equipmentCardModel(machine, request), [machine, request]);
  const { chip, certs, photo, askAvailability, verified } = card;
  /* ~~`const confirmed = chip.availability === "confirmed"`~~ — a boolean cannot carry three states,
     and every reader of it had to be revisited when the third arrived (owner, 2026-08-13). The chip's
     own value is read directly now, so a fourth state would be a type error here rather than a silent
     fall-through into "not confirmed". */
  /** Asked, and not yet answered. The workspace decides it — only it can see the conversation — and
   *  the card paints the answer, the same division the chip above already follows. */
  const pending = askPending?.(machine) ?? false;
  const colour = chip.colour;
  const title = ar ? card.title.ar : card.title.en;
  const km = card.km;

  return (
    <li
      className={`bm-eq${selected ? " on" : ""}${cue ? " cue" : ""}`}
      data-eq={machine.equipmentId}
      // The staggered arrival is the prototype's `0.05 + index·0.07s` — the list reads as being
      // assembled in distance order rather than dumped. Inline because it is per-card data.
      style={{ animationDelay: `${(0.05 + index * 0.07).toFixed(2)}s` }}
    >
      {/* Selection is achromatic slate, not blue: on a card whose only other colour is its availability
          chip, a saturated accent read as a third state. Selection is UI, so it stays neutral. */}
      {selected && <span className="bm-eq-acc" aria-hidden="true" />}

      {/* The WHOLE CARD opens the machine (owner, 2026-08-11), not just the «Details» control beside
          it. A card that only highlighted a pin made the one obvious target on it do the least, and
          left the renter hunting a 10px pill for the thing they had already asked for by clicking.
          `onOpenDetail` focuses the machine on its way in — `nextSelection(…, "open")`, which never
          toggles the selection off — so opening still leaves the map where the card points.
          Not `aria-pressed`: this no longer toggles a state, it navigates. */}
      <button
        type="button"
        className="bm-eq-select"
        aria-label={`${t.bidMap.eqDetails} — ${title}`}
        /* `aria-current`, not `aria-pressed`. AC-15 still needs the selected id to reach the card as
           a state a reader can perceive, but this control no longer TOGGLES anything — it navigates,
           and `aria-pressed` on a non-toggle announces a button that can be un-pressed. "The current
           machine in this list" is what the accent means and what this now says. */
        aria-current={selected || undefined}
        onClick={() => onOpenDetail(machine.equipmentId)}
      />

      <div className="bm-eq-in">
        {/* The cell shimmers while a photo decodes. `is-empty` stops it for a machine that has none:
            nothing is arriving, and a placeholder travelling forever says otherwise. */}
        <span className={`bm-eq-photo${photo ? "" : " is-empty"}`}>
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="" className="bm-eq-art" />
          ) : (
            <span className="bm-eq-nophoto">{t.bidMap.eqNoPhoto}</span>
          )}
          {/* A 3px hairline of the machine's own state down the photo's inner edge — the card's
              quietest signal, and the same derivation as the chip and the pin. */}
          <span className="bm-eq-hair" style={{ background: colour }} aria-hidden="true" />
        </span>

        <div className="bm-eq-tx">
          {/* 1 · title — model · year, with the verified mark against the end of the NAME rather than
              the far edge of the row. No serial, no capacity (AC-12).

              **«التفاصيل» is no longer here** (owner, 2026-08-11: *"check how buttons float"*). A white
              pill on a white card, hung at the end of the title row, had no ground under it and read
              as floating over the name rather than belonging to the card — and it was the FIRST thing
              in the reading order after the machine's own name, which is the one place a secondary
              control should not be. It moved to row 3's cluster, beside the other one. */}
          <div className="bm-eq-r1">
            <span className="bm-eq-name">
              <span className="bm-eq-title" title={title}>{title}</span>
              {/* The PLATFORM verified this machine — a fact about its papers, not about whether it
                  is available, which is why it is a mark on the title and not a third colour in the
                  state row.

                  ~~`certs.length > 0`.~~ Withdrawn (owner, 2026-08-11: *"for equipment verification
                  ticked make sure it is read the equipment status is it verified really or not"*).
                  `certs` holds one entry per certificate the REQUEST named, held or not — so that
                  condition was a fact about the request, the same for every card in the list, and it
                  ticked machines an admin had rejected while leaving genuinely verified ones bare.
                  `card.verified` is `verificationStatus === "VERIFIED"` and nothing else; the model's
                  field comment carries the full ruling and the staging numbers.

                  Row 4's chips are NOT the same source and never were — they answer the request, this
                  answers the platform's file. */}
              {verified && (
                <span className="bm-eq-vd" title={t.bidMap.eqVerifiedMachine} aria-label={t.bidMap.eqVerifiedMachine}>
                  ✓
                </span>
              )}
            </span>
          </div>

          {/* 2 · state — ONE chip (AC-32) and the out-of-city qualifier. The row holds its height
              whether or not the qualifier is there. The ask left this row with «التفاصيل»: a
              borderless blue link between a red chip and a brown qualifier was the second control on
              the card with nothing under it, and three unlike things on one line is what made the
              controls read as floating rather than as the card's own. */}
          <div className="bm-eq-r2">
            <span
              className={`bm-eq-chip${
                chip.availability === "confirmed" ? " ok" : chip.availability === "in_offer" ? " mid" : " no"
              }`}
            >
              {/* THREE states, and the shape still carries the meaning, not the colour alone: the
                  confirmed chip is a small squared label with a ✓; the other two are capsules with a
                  dot that breathes, because both are live questions. Anyone reading this list with a
                  red-green deficiency has the ✓ and the words — and orange against red is a distinction
                  the words carry too («في هذا العرض» against «لم يؤكد توفرها بعد»).

                  Third state added 2026-08-13 with the whole-fleet list: a machine he offered but has
                  not placed, which used to wear the same red as one he never offered at all. */}
              {chip.availability === "confirmed" ? (
                <span aria-hidden="true">✓</span>
              ) : (
                <span className="bm-eq-dot" aria-hidden="true" />
              )}
              {chip.availability === "confirmed"
                ? t.bidMap.eqChipConfirmed
                : chip.availability === "in_offer"
                  ? t.bidMap.pinInOffer
                  : t.bidMap.eqChipUnconfirmed}
            </span>
            {/* The yard is outside the request city's own radius — the fact that turns a delivery into
                a mobilisation. It qualifies the offer, so it sits with the state and not with the
                number it is derived from. */}
            {card.outOfCity && <span className="bm-eq-far">{t.bidMap.eqOutOfCity}</span>}

            {/* ── The ask sits BESIDE the state, not with the controls (owner, 2026-08-11) ─────────
                ~~Both controls clustered on row 3's trailing edge.~~ Withdrawn by the owner on
                seeing it: *"for the asked make it beside not confirmed"*, and *"the details button
                make it as before"*.

                It was not only a preference. Row 3 is `nowrap`, so on a card that had been asked the
                ask and «التفاصيل» together took enough of the row to clip the distance — the screenshot
                shows «7.5 km from your |», the label cut mid-word. The distance is the reason this
                list is sorted the way it is; a control must not eat it.

                And it reads better here on its merits: «تم الطلب» is the ANSWER to «لم يؤكد توفرها
                بعد» — the chip states the question, the pill states that it has been put. Two facts
                about the same thing, on one line. «التفاصيل» goes back to being alone at row 3's
                trailing edge, which is where it sits on a confirmed card, so every card in the column
                now has its Details in the same place whether or not an ask is out.

                AC-13 is untouched: the ask is still a real button on the card, above the stretched
                open layer, so an unconfirmed machine is still askable without opening the detail.
                AC-33 too — it is still `askAvailability.colour`. Only the row moved. */}
            {askAvailability && (
              <button
                type="button"
                className="bm-eq-ask"
                style={{ color: askAvailability.colour }}
                // ── One ask, one card (owner, 2026-08-10) ──────────────────────────────────────
                // The control STAYS on the card once the ask is out, disabled and relabelled. It is
                // not removed: a control that vanished would read as «there is nothing to ask»,
                // when the truth is that the question was asked and is waiting — and it is not left
                // live either, because a second press would flood the lessor's conversation with a
                // duplicate card (or, since the backend's own guard landed, meet a 409 the renter
                // can do nothing with).
                title={pending ? t.bidMap.askPendingWhy : t.bidMap.eqAskConfirmWhy}
                onClick={() => onAskAvailability?.(machine)}
                disabled={!onAskAvailability || pending}
              >
                {/* «تم الطلب» / «Asked» — the list-foot ask's own sent label, borrowed rather than
                    duplicated (owner, 2026-08-11: *"use shorter wordings, even on the equipment
                    card"*). The earlier draft read «Asked — awaiting reply», a sentence inside a
                    22px control beside a second control; the same fact fits in one word, and the
                    REASON the button is inert is already on its `title` in full. */}
                {pending ? t.bidMap.eqAskAnotherSent : t.bidMap.eqAskConfirm}
              </button>
            )}
          </div>

          {/* 3 · distance from the project, and «التفاصيل» alone at the row's trailing edge. Numerals
              are `dir="ltr"` — an Arabic-Indic figure inside an RTL run still reads left to right.

              The ask used to share this row. It moved up beside the availability chip (see row 2):
              the row is `nowrap`, and two controls on it clipped the distance on any card that had
              been asked. Details alone also means it lands in the same place on every card in the
              column, asked or not, which is what makes a list scannable down its trailing edge.
              Every card is still exactly four rows tall (AC-32's second half). */}
          <div className="bm-eq-r3">
            <span className="bm-eq-dist">
              {km != null ? (
                <>
                  {/* `distanceDigits`, never `arabicIndicDigits` — that one truncates, which is right
                      for a count and would silently turn 7.5 km into «٧». One decimal always, trailing
                      `.0` and all, so a column of distances is one shape to scan down. */}
                  <span className="bm-eq-km" dir="ltr">{distanceDigits(km, ar)}</span>
                  <span className="bm-eq-kmu">{t.bidMap.eqDistanceUnit}</span>
                </>
              ) : (
                <span className="bm-eq-kmu">{t.bidMap.eqNoDistance}</span>
              )}
            </span>

            <span className="bm-eq-acts">
              <button type="button" className="bm-eq-details" onClick={() => onOpenDetail(machine.equipmentId)}>
                {t.bidMap.eqDetails}
                {/* The prototype hard-codes «‹», which is correct in Arabic and backwards in English —
                    it is an RTL-forward chevron in an RTL-only file. Kept locale-flipped by decision
                    (owner, 2026-08-09; `design-v3.md` §9 records it): the chevron points the way the
                    reader travels, and a control reading "Details ‹" in English points back at the text
                    it is meant to lead away from. */}
                <span aria-hidden="true">{ar ? "‹" : "›"}</span>
              </button>
            </span>
          </div>

          {/* 4 · the REQUESTED certificates, held or not (owner, 2026-08-11). Always occupies its
              line. A certificate the machine holds but nobody asked for is not here — it is on the
              documents tab, where the renter goes to see everything the machine carries. */}
          <div className="bm-eq-r4">
            {certs.length > 0 ? (
              // The mark is not decoration. At this size the two fills are close enough that colour
              // would be the only carrier, and a renter who cannot separate them reads a missing
              // certificate as a present one — the exact misreading this line exists to prevent.
              certs.map((c) => (
                <span key={c.code} className={`bm-eq-cert ${c.held ? "held" : "missing"}`}>
                  <span aria-hidden="true">{c.held ? "✓" : "!"}</span>
                  {ar ? c.label.ar : c.label.en}
                </span>
              ))
            ) : (
              <span className="bm-eq-nocert">{t.bidMap.eqNoCerts}</span>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}
