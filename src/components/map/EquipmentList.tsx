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
 * from the project · certificate chips or an explicit «لا شهادات على المعدّة» · **التفاصيل ›** ·
 * **اطلب التأكيد** when unconfirmed.
 *
 * Three rules the card's shape enforces:
 *  - **No serial number and no load capacity** (AC-12). The serial identifies the machine to the
 *    system, not to a renter; the type and size are already stated once, in the count pills.
 *  - **One chip, never a chip plus a band** (AC-32) — and **four rows that always occupy their line**,
 *    empty or not, so a machine with fewer papers is a shorter LINE and not a shorter CARD. Every card
 *    in the list is the same height, which is what makes it scannable down a column.
 *  - **Colour comes from `unitAvailability()` only** (AC-19) — never from the `yardConfirmed` boolean,
 *    which supplier-side is just `yardId != null` and would turn every chip green.
 *
 * **The card body selects; «التفاصيل» opens.** Pressing a card focuses its marker and nothing else
 * (AC-15) — the renter is orienting himself on the map, and a press that navigated away from the map
 * would defeat the point. The detail is its own control, and «اطلب التأكيد» is a third, so an
 * unconfirmed machine can be asked about **without opening the detail** (AC-13). The card is therefore
 * a stretched select button UNDER the content rather than a button wrapping it: a button inside a
 * button is invalid, and the two inner controls have to stay real buttons to stay reachable.
 *
 * **V17 · the filter bar.** Which chips exist, what each of them keeps, and both figures of the count
 * are `equipmentListView()`'s answers, arriving here as one `view` prop. This file only paints them —
 * which is what lets the workspace derive the marker set from the SAME `view.machines` the cards come
 * from (AC-15), and what makes rules 2, 3 and 4 testable without a DOM.
 */

import { useEffect, useMemo, useRef, type ReactNode, type RefObject } from "react";
import { AVAILABILITY_COLOUR, arabicIndicDigits, isOutOfCity, unitAvailability } from "@/lib/contract/bid-map";
import type { EquipmentListView } from "@/lib/contract/equipment-list";
import type { FleetMachine } from "@/lib/contract/fleet";
import { certificateChips, heroPhotoUrl } from "@/components/map/panel";
import { fmt, useLocale, useT } from "@/lib/i18n";

export interface EquipmentListProps {
  /**
   * `equipmentListView(offeredMachines(fleet), bid, filterIds)` — the chips, the machines that survive
   * them, and the two figures. Never a bare machine array: the count has to state the whole offer, and
   * a component holding only the filtered half cannot.
   */
  view: EquipmentListView;
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
  onSelect: (equipmentId: string) => void;
  onOpenDetail: (equipmentId: string) => void;
  /** «اطلب التأكيد» — V11 owns the composer and the send; this only says which machine was asked
   *  about. Absent → the control renders disabled rather than claiming an ask was sent. */
  onAskAvailability?: (machine: FleetMachine) => void;
  /** The panel's scroller, so a selection made ON THE MAP brings its card into view. Deliberately the
   *  container's `scrollTop` rather than `scrollIntoView`, which scrolls every ancestor and moves the
   *  whole page. */
  scrollRef?: RefObject<HTMLElement | null>;
}

export function EquipmentList({
  view,
  filterIds,
  onToggleFilter,
  onClearFilters,
  selectedId,
  cueId,
  onSelect,
  onOpenDetail,
  onAskAvailability,
  scrollRef,
}: EquipmentListProps) {
  const t = useT();
  const { locale } = useLocale();
  const ar = locale === "ar";
  const listRef = useRef<HTMLUListElement | null>(null);
  const machines = view.machines;
  const num = (n: number) => (ar ? arabicIndicDigits(n) : String(n));

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

  // RM3-AC-26 — a price and a count were given, and that is the whole statement. No empty card
  // furniture: a greyed-out card outline would suggest a machine that failed to load. Keyed off
  // `view.total`, never off what is on screen: this state is a fact about the LESSOR, and a filter
  // that happened to hide everything must not be able to reach it (RM3-AC-28e).
  if (view.total === 0) {
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
  const countParts: ReactNode[] = t.bidMap.eqShownOfTotal.split(/(\{n\}|\{total\})/).map((part, i) =>
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
            <span className="bm-eqf-count">{countParts}</span>
            {view.active.length > 0 && (
              <button type="button" className="bm-eqf-clear" onClick={onClearFilters}>
                {t.bidMap.eqFilterClear}
              </button>
            )}
          </div>

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

                  **The BEHAVIOUR it described is unchanged** — `keepsUnknownDistance` still reports
                  it and such a machine is still kept by every band. Filtering it out would delete a
                  real offered machine on the strength of a fact nobody has, and «غير معروفة» is not
                  «بعيدة». Only the explanation is withdrawn, not the rule. */}
            </div>
          ))}
        </div>
      )}

      {/* The filtered empty state NAMES what emptied it and offers the way out. Plain «لا توجد نتائج»
          would read as "this lessor has nothing" — a claim about him rather than about the chips, and
          the exact confusion RM3-AC-26's state exists to avoid. The two are deliberately unalike in
          wording, in colour and in the fact that only this one carries an action. */}
      {view.machines.length === 0 ? (
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
              selected={selectedId === m.equipmentId}
              cue={cueId === m.equipmentId}
              ar={ar}
              t={t}
              onSelect={onSelect}
              onOpenDetail={onOpenDetail}
              onAskAvailability={onAskAvailability}
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
  onSelect,
  onOpenDetail,
  onAskAvailability,
}: {
  machine: FleetMachine;
  index: number;
  selected: boolean;
  cue: boolean;
  ar: boolean;
  t: ReturnType<typeof useT>;
  onSelect: (id: string) => void;
  onOpenDetail: (id: string) => void;
  onAskAvailability?: (machine: FleetMachine) => void;
}) {
  const availability = unitAvailability(machine);
  const confirmed = availability === "confirmed";
  // `absent` never reaches here — `offeredMachines` drops it — but the colour map has only two keys, so
  // the fall-through resolves to the one that claims less.
  const colour = AVAILABILITY_COLOUR[confirmed ? "confirmed" : "unconfirmed"];
  const photo = heroPhotoUrl(machine);
  const certs = useMemo(() => certificateChips(machine), [machine]);

  const name = [machine.manufacturer, machine.modelName].filter(Boolean).join(" ").trim();
  const kind = (ar ? machine.subcategoryNameAr ?? machine.subcategoryName : machine.subcategoryName ?? machine.subcategoryNameAr) ?? "";
  const title = [name || kind, machine.year != null ? (ar ? arabicIndicDigits(machine.year) : String(machine.year)) : null]
    .filter(Boolean)
    .join(" · ");

  const km = typeof machine.distanceKm === "number" && Number.isFinite(machine.distanceKm) ? Math.round(machine.distanceKm) : null;

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

      <button
        type="button"
        className="bm-eq-select"
        aria-label={`${t.bidMap.eqSelect} — ${title}`}
        aria-pressed={selected}
        onClick={() => onSelect(machine.equipmentId)}
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
              the far edge of the row. No serial, no capacity (AC-12). */}
          <div className="bm-eq-r1">
            <span className="bm-eq-name">
              <span className="bm-eq-title" title={title}>{title}</span>
              {/* The platform holds this machine's papers — a fact about its DOCUMENTS, not about
                  whether it is available, which is why it is a mark on the title and not a third
                  colour in the state row. Same source as row 4's chips, stated once as a glance and
                  once in full (the prototype drives both off one flag too). */}
              {certs.length > 0 && (
                <span className="bm-eq-vd" title={t.bidMap.eqVerifiedMachine} aria-label={t.bidMap.eqVerifiedMachine}>
                  ✓
                </span>
              )}
            </span>
            <button type="button" className="bm-eq-details" onClick={() => onOpenDetail(machine.equipmentId)}>
              {t.bidMap.eqDetails}
              {/* The prototype hard-codes «‹», which is correct in Arabic and backwards in English —
                  it is an RTL-forward chevron in an RTL-only file. Kept locale-flipped by decision
                  (owner, 2026-08-09; `design-v3.md` §9 records it): the chevron points the way the
                  reader travels, and a control reading "Details ‹" in English points back at the text
                  it is meant to lead away from. */}
              <span aria-hidden="true">{ar ? "‹" : "›"}</span>
            </button>
          </div>

          {/* 2 · state — ONE chip (AC-32), the ask beside it (AC-13), and the out-of-city qualifier.
              The row holds its height whether or not either is there. */}
          <div className="bm-eq-r2">
            <span className={`bm-eq-chip${confirmed ? " ok" : " no"}`}>
              {/* Two states, two SHAPES, not one shape in two colours: the confirmed chip is a small
                  squared label carrying a ✓, the unconfirmed one a capsule carrying a dot that
                  breathes — an unanswered question is live, a settled fact is not. Anyone reading this
                  list with a red-green deficiency has only the shape to go on. */}
              {confirmed ? <span aria-hidden="true">✓</span> : <span className="bm-eq-dot" aria-hidden="true" />}
              {confirmed ? t.bidMap.eqChipConfirmed : t.bidMap.eqChipUnconfirmed}
            </span>
            {!confirmed && (
              <button
                type="button"
                className="bm-eq-ask"
                title={t.bidMap.eqAskConfirmWhy}
                onClick={() => onAskAvailability?.(machine)}
                disabled={!onAskAvailability}
              >
                {t.bidMap.eqAskConfirm}
              </button>
            )}
            {/* The yard is outside the request city's own radius — the fact that turns a delivery into
                a mobilisation. It qualifies the offer, so it sits with the state and not with the
                number it is derived from. */}
            {isOutOfCity(machine.distanceKm) && <span className="bm-eq-far">{t.bidMap.eqOutOfCity}</span>}
          </div>

          {/* 3 · distance from the project. Numerals are `dir="ltr"` — an Arabic-Indic figure inside an
              RTL run still reads left to right. */}
          <div className="bm-eq-r3">
            {km != null ? (
              <>
                <span className="bm-eq-km" dir="ltr">{ar ? arabicIndicDigits(km) : String(km)}</span>
                <span className="bm-eq-kmu">{t.bidMap.eqDistanceUnit}</span>
              </>
            ) : (
              <span className="bm-eq-kmu">{t.bidMap.eqNoDistance}</span>
            )}
          </div>

          {/* 4 · certificates, or the explicit absence (AC-11). Always occupies its line. */}
          <div className="bm-eq-r4">
            {certs.length > 0 ? (
              certs.map((c) => (
                <span key={c.en} className="bm-eq-cert">{ar ? c.ar : c.en}</span>
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
