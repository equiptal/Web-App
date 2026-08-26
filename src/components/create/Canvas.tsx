"use client";

/**
 * The request canvas (MREQ-AC-01–15, 38–41).
 *
 * One page, three panels, no step numbers. The renter's own sentence stays at the top, and a single
 * pill states how much is genuinely left to decide.
 *
 * **The panels are locked in order and a refused move shakes rather than explains.** That is the
 * product decision, and it is worth being clear about what it costs: the header promise of a form
 * with "no steps, no order" is not what the code does. Someone who clicks *Where it goes* too early
 * gets movement and no sentence. The dots and the counter are what carry the reason, so they have to
 * be legible — a shake with nothing marked would be a refusal with no explanation anywhere.
 */

import { useEffect, useRef, useState } from "react";
import { fmt, useLocale, useT } from "@/lib/i18n";
import { useRfq } from "@/lib/store/rfq-store";
import { Icon, Modal } from "@/components/ui";
import { MachineCard } from "@/components/create/MachineCard";
import { OperatorRail } from "@/components/create/OperatorRail";
import { WherePanel } from "@/components/create/WherePanel";
import { WhenPanel } from "@/components/create/WhenPanel";
import { CarryForwardModal } from "@/components/create/CarryForwardModal";
import { PanelDot } from "@/components/create/Provenance";
import { gateWhen, gateWhere, itemGaps, panelGaps, postableItems, requiredGaps, resolveRef, taxName, transportGaps } from "@/lib/contract";
import type { RequiredGap } from "@/lib/contract";

/**
 * A gap's reason, in the renter's words.
 *
 * `RequiredGap.reason` is an i18n KEY ("gate.chooseRentalBasis") — the panels have always shown gaps
 * as dots and a counter, so nothing had needed to spell one out until the move-on button had to say
 * what it is waiting for. An unknown key returns nothing rather than printing itself.
 */
function gateReason(t: ReturnType<typeof useT>, key: string): string | undefined {
  const name = key.startsWith("gate.") ? key.slice(5) : key;
  return (t.gate as Record<string, string | undefined>)[name];
}

const SHAKE_MS = 450;

export function Canvas() {
  const t = useT();
  const { locale } = useLocale();
  const { state, actions } = useRfq();
  const [shaking, setShaking] = useState(false);
  const [shakingWhere, setShakingWhere] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [carryTo, setCarryTo] = useState<{ index: number; isNew: boolean } | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  /** The equipment block — expanded card or collapsed strip — so a refusal can bring it into view. */
  const equipmentRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const t0 = timers.current;
    return () => t0.forEach(clearTimeout);
  }, []);

  const draft = state.draft;
  /** The live gaps, readable from the effects above — which run before the derivation below. */
  const gapsRef = useRef<RequiredGap[]>([]);
  // Everything below is derived defensively so the hooks that follow run on every render. `draft` is
  // null only before the agent has produced one, which the early return at the end handles.
  const whereOk = draft ? gateWhere(draft.project).ok : false;

  // MREQ-AC-04 — confirming the location opens the schedule, so the renter is carried forward rather
  // than left looking at a collapsed panel wondering what they just did.
  const wasConfirmed = useRef(whereOk);
  useEffect(() => {
    if (whereOk && !wasConfirmed.current && state.activeSection === "where") actions.openSection("when");
    wasConfirmed.current = whereOk;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [whereOk]);

  /**
   * MREQ-AC-05 — accepting the charged-day figure finishes the schedule, so the schedule closes.
   *
   * It used to re-open EQUIPMENT, which is what made the flow feel locked: the renter ticked «I
   * understand», landed back on the machine, pressed «Review & send», and — with another machine
   * still unanswered — was sent to the machine panel again. Two of the three moves went backwards.
   *
   * A finished panel collapses. Where the request still has a gap the panel that OWNS it opens
   * instead, so the next thing to answer is what the renter is looking at.
   */
  const wasUnderstood = useRef(state.chargedDaysUnderstood);
  useEffect(() => {
    if (!state.chargedDaysUnderstood || wasUnderstood.current || state.activeSection !== "when") {
      wasUnderstood.current = state.chargedDaysUnderstood;
      return;
    }
    const blocker = gapsRef.current[0];
    actions.openSection(blocker ? blocker.panel : null);
    wasUnderstood.current = state.chargedDaysUnderstood;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.chargedDaysUnderstood]);

  if (!draft) return null;

  const live = postableItems(draft.items);
  const index = Math.min(state.itemIndex, Math.max(0, live.length - 1));
  const item = live[index];
  const isFirstItem = index === 0;
  const isLastItem = index >= live.length - 1;

  const gaps = requiredGaps(draft, state.chargedDaysUnderstood);
  gapsRef.current = gaps;
  const equipmentGaps = item ? [...itemGaps(item, draft), ...transportGaps([item], draft.project)] : [];
  const whenOk = gateWhen(draft.project, state.chargedDaysUnderstood).ok;

  /**
   * Refuse a move, visibly.
   *
   * The shake IS the explanation — the canvas says nothing else about why a panel would not open. So
   * it has to be on screen when it fires: a renter who has scrolled down to the panel headers is
   * looking hundreds of pixels below the fields that are blocking them, and a shake up there is a
   * click that appears to do nothing at all. Scroll first, then shake.
   */
  const shakeNow = (which: "fields" | "where") => {
    const set = which === "where" ? setShakingWhere : setShaking;
    if (which === "fields") {
      // The blocking fields must be on screen to shake at all — and now that equipment collapses,
      // they may not even be rendered. Open it first, then bring it into view.
      if (state.activeSection !== "equipment") actions.openSection("equipment");
      equipmentRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    set(true);
    timers.current.push(setTimeout(() => set(false), SHAKE_MS));
  };

  /**
   * Panel-to-panel movement, under one rule (owner, 2026-08-26): **a panel cannot be left until what
   * it requires is answered.**
   *
   * Collapsing used to be free — «closing something is not advancing past it» — and that is how a
   * renter ended up with three collapsed panels, an unanswered machine among them, and a button that
   * refused with a shake. Now the only way out of a panel is to finish it, which is also the only
   * state in which the next one is worth opening.
   */
  const openSection = (section: "equipment" | "where" | "when") => {
    if (state.activeSection === section) {
      collapse(section);
      return;
    }
    if (section !== "equipment" && equipmentGaps.length > 0) {
      shakeNow("fields");
      return;
    }
    if (section === "when" && !whereOk) {
      actions.openSection("where");
      shakeNow("where");
      return;
    }
    actions.openSection(section);
  };

  /**
   * Close the open panel — refused, visibly, while it still owes an answer.
   *
   * The refusal has to be legible: the equipment panel shakes its own fields, and the other two shake
   * the block that holds them. Nothing collapses silently.
   */
  const collapse = (section: "equipment" | "where" | "when") => {
    const owed =
      section === "equipment" ? equipmentGaps.length > 0 : section === "where" ? !whereOk : !whenOk;
    if (owed) {
      shakeNow(section === "where" ? "where" : "fields");
      return;
    }
    actions.openSection(null);
  };

  /**
   * Move on.
   *
   * The two destinations have different bars, and conflating them deadlocked the flow: it required
   * the WHOLE draft to be complete even to reach the next machine, while only one machine is
   * editable at a time. With five parsed items, item 1 could be finished and the button would still
   * refuse — forever, because the only way to answer items 2-5 was to get past item 1.
   *
   *   next machine → this machine must be finished
   *   review       → the whole request must be
   */
  const advance = () => {
    if (equipmentGaps.length > 0) {
      shakeNow("fields");
      return;
    }
    if (!isLastItem) {
      setCarryTo({ index: index + 1, isNew: false });
      return;
    }
    if (gaps.length > 0) {
      /**
       * The blocker is somewhere else, and «somewhere else» is usually ANOTHER MACHINE — only one is
       * editable at a time, so opening the equipment panel on the machine already in front of the
       * renter showed them a finished card and looked like the button had done nothing. Go to the
       * machine that owes the answer; fall back to the panel when the gap is request-wide.
       */
      const first = gaps[0];
      const owing = first.itemId ? live.findIndex((i) => i.id === first.itemId) : -1;
      if (owing >= 0 && owing !== index) actions.goItem(owing);
      if (state.activeSection !== first.panel) actions.openSection(first.panel);
      shakeNow(first.panel === "where" ? "where" : "fields");
      return;
    }
    actions.setReadyToSend(true);
  };

  /**
   * What the move-on button is waiting for — null when it is free to fire.
   *
   * «Review & send» is DISABLED until the whole request is answered (owner, 2026-08-26) rather than
   * refusing on press: a button that looks live and then shakes teaches the renter that the page is
   * broken. «Next machine» only ever owed this machine, so it keeps that narrower bar.
   */
  const blockedBy = isLastItem ? gaps[0] ?? null : equipmentGaps[0] ?? null;

  /**
   * Add a machine by hand.
   *
   * Same modal as moving between parsed items, because the same thing is true of both — the site and
   * schedule already apply — and the renter should be told that before landing on a new blank card.
   * It finishes the current machine first, so adding is not a way to leave one half-answered.
   */
  const addMachine = () => {
    if (equipmentGaps.length > 0) {
      shakeNow("fields");
      return;
    }
    setCarryTo({ index: live.length, isNew: true });
  };

  const needsYou =
    gaps.length === 1 ? t.create.needsYouOne : fmt(t.create.needsYou, { n: gaps.length });

  /**
   * What the collapsed equipment strip says it holds.
   *
   * Enough to recognise the machine without opening it — what it is, how many, and whether an
   * operator comes with it. A strip that only said "The machine & operator" would make the renter
   * open it to find out whether they had already dealt with it.
   */
  const equipmentSummary = (() => {
    if (!item) return "";
    const { subcategory, measurement } = resolveRef(state.taxonomy, item.ref);
    return [
      taxName(subcategory, locale) || null,
      taxName(measurement, locale) || null,
      item.quantity > 1 ? `×${item.quantity}` : null,
      item.operatorNeeded === "yes" ? t.create.operatorCard.withOperator : t.create.operatorCard.noOperator,
    ]
      .filter(Boolean)
      .join(" · ");
  })();

  return (
    <div>
      {/* ---------------- The renter's own words, and what's left ---------------- */}
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3 rounded-sm border border-warn/45 bg-warn/[0.07] px-5 py-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-[30px] w-[30px] flex-none place-items-center rounded-sm bg-warn/15 text-warn">
            <Icon name="chat_bubble" size={15} />
          </span>
          <div className="min-w-0">
            <div className="text-label font-semibold uppercase tracking-[0.05em] text-warn">{t.create.youWrote}</div>
            <p className="mt-0.5 truncate text-body italic text-navy-mid">{state.text ? `"${state.text}"` : "—"}</p>
          </div>
        </div>
        <div className="flex flex-none items-center gap-3.5">
          <button
            onClick={() => window.history.back()}
            className="text-body font-semibold text-warn underline decoration-warn/40 underline-offset-2 hover:decoration-warn"
          >
            {t.common.edit}
          </button>
          <button
            onClick={() => setConfirmReset(true)}
            className="inline-flex items-center gap-1.5 text-body font-semibold text-navy-mid hover:text-navy"
          >
            <Icon name="restart_alt" size={16} />
            <span className="hidden sm:inline">{t.create.startOver}</span>
          </button>
          {gaps.length > 0 && (
            <span className="flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-meta font-semibold text-warn">
              <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden />
              {needsYou}
            </span>
          )}
        </div>
      </div>

      {/* Which machine, when there is more than one. */}
      {live.length > 1 && (
        <p className="mb-2.5 text-meta font-semibold uppercase tracking-[0.05em] text-muted">
          {fmt(t.create.itemOfCount, { n: index + 1, total: live.length })}
        </p>
      )}

      {/* ---------------- Equipment ---------------- */}
      {/* ---------------- Equipment ----------------
          One panel at a time. `activeSection` already made Where and When mutually exclusive, but
          the equipment block used to render unconditionally, so opening either of the others left
          two things expanded and the page twice as long as it needed to be. Collapsed, it states
          what it holds — the prototype's own closed state. */}
      {item &&
        (state.activeSection === "equipment" ? (
          <div ref={equipmentRef as React.Ref<HTMLDivElement>} className="mb-3.5 flex flex-col gap-4 lg:flex-row lg:items-stretch">
            <MachineCard item={item} gaps={equipmentGaps} shaking={shaking} onCollapse={() => collapse("equipment")} />
            <OperatorRail item={item} />
          </div>
        ) : (
          <button
            ref={equipmentRef as React.Ref<HTMLButtonElement>}
            type="button"
            onClick={() => actions.openSection("equipment")}
            className={`mb-3.5 flex w-full items-center justify-between gap-3 rounded-sm border px-5 py-4 text-start transition ${
              equipmentGaps.length === 0 ? "border-ok/40 bg-ok/[0.06]" : "border-border bg-surface"
            }`}
            aria-expanded={false}
          >
            <span className="flex min-w-0 items-center gap-2">
              <PanelDot complete={equipmentGaps.length === 0} />
              <Icon name="construction" size={16} className="flex-none text-navy" />
              <span className="flex-none text-subhead font-extrabold text-navy">{t.create.ready.machineAndOperator}</span>
              <span className="truncate text-body text-muted">{equipmentSummary}</span>
            </span>
            <Icon name="expand_more" size={18} className="flex-none text-muted" />
          </button>
        ))}

      {/* ---------------- Site and schedule ----------------
          Request-wide, so from the second machine onwards they are shown as settled rather than
          re-offered: editing them here would silently change the first machine's terms too. */}
      {isFirstItem ? (
        <>
          <WherePanel
            open={state.activeSection === "where"}
            complete={whereOk}
            onToggle={() => openSection("where")}
            shakeConfirm={shakingWhere}
          />
          <WhenPanel
            open={state.activeSection === "when"}
            complete={whenOk}
            onToggle={() => openSection("when")}
            shakeConfirm={shaking && panelGaps(gaps, "when").length > 0}
          />
        </>
      ) : (
        <div className="mb-3.5 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-sm border border-ok/40 bg-ok/[0.06] px-5 py-3.5">
          <span className="flex items-center gap-2 text-body text-ok">
            <Icon name="lock" size={14} />
            <span className="font-semibold">{t.create.where}</span> — {draft.project.location.label ?? "—"}
          </span>
          <span className="flex items-center gap-2 text-body text-ok">
            <Icon name="lock" size={14} />
            <span className="font-semibold">{t.create.when}</span> —{" "}
            {draft.project.timing.rentalBasis ? t.options.rentalBasis[draft.project.timing.rentalBasis] : "—"}
          </span>
          <span className="ms-auto text-label text-ok/80">{t.create.lockedForRequest}</span>
        </div>
      )}

      {/* ---------------- Move on ---------------- */}
      <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
        {!isFirstItem ? (
          <button
            onClick={() => actions.goItem(index - 1)}
            className="inline-flex items-center gap-1.5 text-body font-semibold text-navy-mid hover:text-navy"
          >
            <Icon name="arrow_back" size={16} className="rtl:rotate-180" /> {t.create.previousEquipment}
          </button>
        ) : (
          <span />
        )}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={addMachine}
            className="rounded-sm bg-warn/15 px-5 py-2.5 text-body font-semibold text-warn transition hover:bg-warn/25"
          >
            + {t.create.addAnother}
          </button>
          <button
            onClick={advance}
            disabled={blockedBy != null}
            title={blockedBy ? gateReason(t, blockedBy.reason) : undefined}
            className="inline-flex items-center gap-1.5 rounded-sm bg-brand px-5 py-2.5 text-body font-semibold text-brand-fg transition disabled:cursor-not-allowed disabled:bg-surface3 disabled:text-muted"
          >
            {isLastItem ? t.create.reviewAndSend : t.create.nextEquipment}
            <Icon name="arrow_forward" size={16} className="rtl:rotate-180" />
          </button>
        </div>
      </div>

      <CarryForwardModal
        open={carryTo != null}
        itemNumber={(carryTo?.index ?? 0) + 1}
        // A hand-added machine starts blank, so "its other details already match this one" would be
        // untrue for it. Only a parsed item inherits.
        copied={carryTo?.isNew === false}
        onClose={() => setCarryTo(null)}
        onContinue={() => {
          if (!carryTo) return;
          if (carryTo.isNew) actions.addItem();
          actions.goItem(carryTo.index);
          setCarryTo(null);
        }}
      />

      {/* Start over clears the saved draft, so it asks first. */}
      <Modal open={confirmReset} onClose={() => setConfirmReset(false)} title={t.draftPrompt.restartTitle}>
        <p className="mb-5 text-body leading-relaxed text-muted">{t.draftPrompt.restartConfirm}</p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            onClick={() => setConfirmReset(false)}
            className="rounded-sm border border-border bg-surface px-4 py-2.5 text-body font-semibold text-navy-mid transition hover:bg-surface2"
          >
            {t.common.cancel}
          </button>
          <button
            onClick={() => {
              setConfirmReset(false);
              actions.reset();
            }}
            className="rounded-sm bg-brand px-4 py-2.5 text-body font-semibold text-brand-fg transition"
          >
            {t.create.startOver}
          </button>
        </div>
      </Modal>
    </div>
  );
}
