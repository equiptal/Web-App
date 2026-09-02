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
import { btn } from "@/lib/ds";
import { pin } from "@/lib/uiPins";

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
  /** The way-on button, shaken when the machine it sits under still owes an answer. */
  const [shakingNext, setShakingNext] = useState(false);
  /**
   * The renter has tried to move on at least once.
   *
   * Until they do, an unanswered field is simply unanswered — this canvas opens with several of them
   * and marking every one «* Required» on arrival would meet a renter with a page of red before they
   * had done anything (owner, 2026-09-02: the mark is for *"when a field is required and not filled
   * and the user is trying to go to next or send"*).
   *
   * After the first refusal it stays on: the mark belongs to the FIELD until that field is answered,
   * and a second shake is not what tells someone which box to fill.
   */
  const [tried, setTried] = useState(false);
  /**
   * Which of the two request-wide panels the renter has OPENED.
   *
   * A site fills Where and When in full, so a renter can reach *Review & send* having never looked
   * at either — and then discover the dates at the supplier's first question (owner, 2026-09-02:
   * *"can we detect if they were never opened, and if so open them for him to see, with shaking"*).
   * Nothing is missing in that case, so no gap can catch it; being unseen is the whole fault.
   *
   * Seeded from the section the canvas opens on, and added to by `openSection` below. One pass only:
   * once shown, the next press sends.
   */
  const [seen, setSeen] = useState<Set<string>>(() => new Set([state.activeSection ?? "equipment"]));

  /* Every press that opens a panel records it. Declared with the other hooks, above every
     early return: a hook placed after one runs in a different order on the render that takes
     that return, which is the rule `react-hooks/rules-of-hooks` exists to catch. */
  useEffect(() => {
    const open = state.activeSection;
    if (open) setSeen((prev) => (prev.has(open) ? prev : new Set(prev).add(open)));
  }, [state.activeSection]);
  const [confirmReset, setConfirmReset] = useState(false);
  const [carryTo, setCarryTo] = useState<{ index: number; isNew: boolean } | null>(null);
  /** The last press before review: add another machine, or go on. See `advance`. */
  const [askAddMore, setAskAddMore] = useState(false);
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
  /** The way-on button, in red for the length of a refusal. */
  const shakeNext = () => {
    setTried(true);
    setShakingNext(true);
    timers.current.push(setTimeout(() => setShakingNext(false), SHAKE_MS));
  };

  const shakeNow = (which: "fields" | "where") => {
    // Every refusal, whichever panel it lands in, turns the standing marks on. See `tried`.
    setTried(true);
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
      shakeNext();
      return;
    }
    if (!isLastItem) {
      setCarryTo({ index: index + 1, isNew: false });
      return;
    }
    /* ── A panel the SITE filled, that the renter never opened ────────────────────────────────
       Nothing is missing, so no gap can catch it: the project supplied the address, the dates and
       the basis, and the renter can reach *Review & send* having never looked at either panel — then
       meet the dates at the supplier's first question (owner, 2026-09-02: *"can we detect if they
       were never opened, and if so open them for him to see, with shaking"*).

       Only when a PROJECT filled them. A renter who typed his own dates has read them by definition,
       and stopping him to look at his own answer is a step for nothing — it would also stand between
       every ordinary request and the «anything else?» ask that follows. One pass: the panel opens,
       it shakes, and the next press goes on. */
    if (gaps.length === 0 && (draft.projectFields?.length ?? 0) > 0) {
      const unseen = (["where", "when"] as const).find((p) => !seen.has(p));
      if (unseen) {
        actions.openSection(unseen);
        shakeNow(unseen === "where" ? "where" : "fields");
        return;
      }
    }
    if (gaps.length > 0) {
      /**
       * The blocker is somewhere else, and «somewhere else» is usually ANOTHER MACHINE — only one is
       * editable at a time, so opening the equipment panel on the machine already in front of the
       * renter showed them a finished card and looked like the button had done nothing. Go to the
       * machine that owes the answer; fall back to the panel when the gap is request-wide.
       *
       * The LIST shakes with it (owner, 2026-09-01: *"shake it and say clearly in red what is
       * blocking"*): the press lands on the button at the bottom of the page, the answer it needs is
       * in a panel somewhere above, and the list is the one thing on screen that names both.
       */
      const first = gaps[0];
      const owing = first.itemId ? live.findIndex((i) => i.id === first.itemId) : -1;
      if (owing >= 0 && owing !== index) actions.goItem(owing);
      if (state.activeSection !== first.panel) actions.openSection(first.panel);
      shakeNow(first.panel === "where" ? "where" : "fields");
      return;
    }
    /* Everything is answered, so the only thing left to decide is whether there is another machine.
       That is the one moment the question is worth asking, and it is where the standing
       «+ Add another machine» button used to live — see the note where it was removed. */
    setAskAddMore(true);
  };

  /**
   * What the move-on button is waiting for — null when it is free to fire.
   *
   * ~~«Review & send» is DISABLED until the whole request is answered (owner, 2026-08-26) rather
   * than refusing on press: a button that looks live and then shakes teaches the renter that the
   * page is broken.~~ **Reversed on 2026-09-01, by the owner, for the reason the ruling missed:** a
   * disabled button cannot tell you why. *"He doesn't know what is blocking him and what is
   * missing"* — and the only channel a disabled control has is a `title`, which needs a hover on
   * something that looks inert.
   *
   * So it presses, and the refusal is the answer: the red list above it shakes, the blocking panel
   * opens on the machine that owes it, and that panel shakes too. `blockedBy` is kept for the
   * `title`, which is still the fastest way to read the FIRST reason without pressing anything.
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
    <div {...pin("create-canvas")}>
      {/* ---------------- The renter's own words, and what's left ---------------- */}
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3 rounded-sm border border-warn/45 bg-warn/[0.07] px-5 py-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-[30px] w-[30px] flex-none place-items-center rounded-sm bg-warn/15 text-warn">
            <Icon name="chat_bubble" size={15} />
          </span>
          <div className="min-w-0">
            <div className="text-label font-semibold uppercase tracking-[0.05em] text-warn">{t.create.youWrote}</div>
            {/* ⚠️ Not `truncate`. This is the renter's OWN sentence, and the whole reason it sits at
                the top of the canvas is so he can check what we read against what he wrote. One line
                with the rest clipped showed him the half he already remembered and hid the half the
                machine may have got wrong (owner, 2026-09-01). */}
            <p className="mt-0.5 whitespace-pre-wrap break-words text-body italic text-navy-mid">
              {state.text ? `"${state.text}"` : "—"}
            </p>
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
          {/* ~~«N things need you».~~ Removed (owner, 2026-09-01). It counted gaps the cards below
              already mark one by one, in the place the renter has to act on them — so it was a number
              he could not do anything with, sitting beside the two controls he could. */}
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
            <MachineCard item={item} gaps={equipmentGaps} shaking={shaking} tried={tried} onCollapse={() => collapse("equipment")} />
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

      {/* ── A way on, from the machine itself (owner, 2026-09-01) ────────────────────────────────
          *"I want a trigger from the machine or operator that opens the next panel for him."*

          The only control that moved between panels was the header of the panel you were moving TO,
          which is below the fold on a filled machine card — so a renter who had answered the machine
          had nothing at the end of it saying where to go next, and the one button in the footer says
          *Review & send*, which is the end of the whole errand rather than the next step.

          It refuses on press rather than sitting disabled, and the refusal is useful: it shakes the
          machine card and the card marks what it still owes. That is the same rule `advance` uses. */}
      {item && state.activeSection === "equipment" && isFirstItem && (
        <div className="mb-3.5 flex justify-end">
          {/* «Next», and nothing else (owner, 2026-09-02). Naming the destination made the button
              about Where, which is not what it is for: it is the way OUT of this machine, and where
              that leads is the next panel's own heading to state.

              It refuses in RED and shakes when the machine still owes an answer — the same press
              also marks the field itself, so the button says «not yet» and the card says which. */}
          <button
            type="button"
            onClick={() => {
              if (equipmentGaps.length > 0) {
                shakeNow("fields");
                shakeNext();
                return;
              }
              openSection("where");
            }}
            className={`inline-flex items-center gap-1.5 rounded-sm border px-4 py-2 text-body font-semibold transition ${
              shakingNext
                ? "shake-error border-danger bg-danger-soft text-danger"
                : "border-brand text-brand hover:bg-brand-soft"
            }`}
          >
            {t.create.nextOnly}
            <Icon name="arrow_forward" size={16} className="rtl:rotate-180" />
          </button>
        </div>
      )}

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
            tried={tried}
          />
          <WhenPanel
            open={state.activeSection === "when"}
            complete={whenOk}
            tried={tried}
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

      {/* ~~A red list of everything missing, above the move-on row.~~ Removed (owner, 2026-09-02).
          It named the gaps in a second place, away from the fields that own them, so a renter read a
          sentence about a field and then had to go and find it. The refusal does that walk for them
          now: it opens the panel, scrolls to the card, shakes the field and marks it «* Required» —
          and the button they pressed goes red for the same beat. */}

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
        {/* ~~«+ Add another machine», standing beside the CTA on every screen of the flow.~~ Removed
            (owner, 2026-09-01). It made two calls to action out of one moment and asked its question
            on every item, including the ones where the renter had not yet finished the machine in
            front of him. The question is asked once now, and where it is actually a question — the
            «add more» modal further down, raised by `advance` on a finished request. */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={advance}
            title={blockedBy ? gateReason(t, blockedBy.reason) : undefined}
            className={btn("primary", "md", { className: "transition" })}
          >
            {isLastItem ? t.create.reviewAndSend : t.create.nextEquipment}
            <Icon name="arrow_forward" size={16} className="rtl:rotate-180" />
          </button>
        </div>
      </div>

      {/* ── The one place the question is asked (owner, 2026-09-01) ─────────────────────────────
          Pressing «Review & send» on a finished request opens this instead of going straight
          through. Adding hands over to `addMachine`, which raises the carry-forward modal below and
          then opens the new blank card — the same path the old button took, minus the standing
          invitation to leave a half-answered machine.

          Dismissing it is neither answer: the renter is returned to the canvas, not sent to review.
          A modal whose X means "yes, continue" is a modal that submits a request by being closed. */}
      <Modal open={askAddMore} onClose={() => setAskAddMore(false)} title={t.create.addMore.title}>
        <p className="mb-5 text-body leading-relaxed text-muted">{t.create.addMore.body}</p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            onClick={() => {
              setAskAddMore(false);
              addMachine();
            }}
            className={btn("secondary", "md", { className: "transition" })}
          >
            + {t.create.addAnother}
          </button>
          <button
            onClick={() => {
              setAskAddMore(false);
              actions.setReadyToSend(true);
            }}
            className={btn("primary", "md", { className: "transition" })}
          >
            {t.create.reviewAndSend}
            <Icon name="arrow_forward" size={16} className="rtl:rotate-180" />
          </button>
        </div>
      </Modal>

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
            className={btn("secondary", "md", { className: "transition" })}
          >
            {t.common.cancel}
          </button>
          <button
            onClick={() => {
              setConfirmReset(false);
              actions.reset();
            }}
            className={btn("primary", "md", { className: "transition" })}
          >
            {t.create.startOver}
          </button>
        </div>
      </Modal>
    </div>
  );
}
