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
import { fmt, useT } from "@/lib/i18n";
import { useRfq } from "@/lib/store/rfq-store";
import { Icon, Modal } from "@/components/ui";
import { MachineCard } from "@/components/create/MachineCard";
import { OperatorRail } from "@/components/create/OperatorRail";
import { WherePanel } from "@/components/create/WherePanel";
import { WhenPanel } from "@/components/create/WhenPanel";
import { CarryForwardModal } from "@/components/create/CarryForwardModal";
import { gateWhen, gateWhere, itemGaps, panelGaps, postableItems, requiredGaps, transportGaps } from "@/lib/contract";

const SHAKE_MS = 450;

export function Canvas() {
  const t = useT();
  const { state, actions } = useRfq();
  const [shaking, setShaking] = useState(false);
  const [shakingWhere, setShakingWhere] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [carryTo, setCarryTo] = useState<number | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  /** The equipment block, so a refused move can bring its shake into view. */
  const equipmentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t0 = timers.current;
    return () => t0.forEach(clearTimeout);
  }, []);

  const draft = state.draft;
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

  // MREQ-AC-05 — and accepting the charged-day figure returns to the equipment panel.
  const wasUnderstood = useRef(state.chargedDaysUnderstood);
  useEffect(() => {
    if (state.chargedDaysUnderstood && !wasUnderstood.current && state.activeSection === "when") actions.openSection("equipment");
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
    if (which === "fields") equipmentRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    set(true);
    timers.current.push(setTimeout(() => set(false), SHAKE_MS));
  };

  /**
   * Panel-to-panel movement. The equipment panel must be complete before either of the others opens,
   * and the location must be confirmed before the schedule does — collapsing an open panel is always
   * free, since closing something is not advancing past it.
   */
  const openSection = (section: "equipment" | "where" | "when") => {
    if (state.activeSection === section) {
      actions.openSection(null);
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

  const advance = () => {
    if (gaps.length > 0) {
      // Point at whichever panel actually holds the blocker rather than shaking the one on screen.
      const first = gaps[0];
      if (first.panel !== "equipment" && state.activeSection !== first.panel && equipmentGaps.length === 0) {
        actions.openSection(first.panel);
      }
      shakeNow(!whereOk && equipmentGaps.length === 0 ? "where" : "fields");
      return;
    }
    if (!isLastItem) {
      setCarryTo(index + 1);
      return;
    }
    actions.setReadyToSend(true);
  };

  const needsYou =
    gaps.length === 1 ? t.create.needsYouOne : fmt(t.create.needsYou, { n: gaps.length });

  return (
    <div>
      {/* ---------------- The renter's own words, and what's left ---------------- */}
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-warn/45 bg-warn/[0.07] px-5 py-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-[30px] w-[30px] flex-none place-items-center rounded-[9px] bg-warn/15 text-warn">
            <Icon name="chat_bubble" size={15} />
          </span>
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.05em] text-warn">{t.create.youWrote}</div>
            <p className="mt-0.5 truncate text-[13px] italic text-navy-mid">{state.text ? `"${state.text}"` : "—"}</p>
          </div>
        </div>
        <div className="flex flex-none items-center gap-3.5">
          <button
            onClick={() => window.history.back()}
            className="text-[13px] font-bold text-warn underline decoration-warn/40 underline-offset-2 hover:decoration-warn"
          >
            {t.common.edit}
          </button>
          <button
            onClick={() => setConfirmReset(true)}
            className="inline-flex items-center gap-1.5 text-[13px] font-bold text-navy-mid hover:text-navy"
          >
            <Icon name="restart_alt" size={16} />
            <span className="hidden sm:inline">{t.create.startOver}</span>
          </button>
          {gaps.length > 0 && (
            <span className="flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-[12px] font-bold text-warn">
              <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden />
              {needsYou}
            </span>
          )}
        </div>
      </div>

      {/* Which machine, when there is more than one. */}
      {live.length > 1 && (
        <p className="mb-2.5 text-[12px] font-bold uppercase tracking-[0.05em] text-muted">
          {fmt(t.create.itemOfCount, { n: index + 1, total: live.length })}
        </p>
      )}

      {/* ---------------- Equipment ---------------- */}
      {item && (
        <div ref={equipmentRef} className="mb-3.5 flex flex-col gap-4 lg:flex-row lg:items-stretch">
          <MachineCard
            item={item}
            gaps={equipmentGaps}
            shaking={shaking}
            onCollapse={() => actions.openSection(state.activeSection === "equipment" ? null : "equipment")}
          />
          <OperatorRail item={item} />
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
          />
          <WhenPanel
            open={state.activeSection === "when"}
            complete={whenOk}
            onToggle={() => openSection("when")}
            shakeConfirm={shaking && panelGaps(gaps, "when").length > 0}
          />
        </>
      ) : (
        <div className="mb-3.5 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-[14px] border border-ok/40 bg-ok/[0.06] px-5 py-3.5">
          <span className="flex items-center gap-2 text-[13px] text-ok">
            <Icon name="lock" size={14} />
            <span className="font-bold">{t.create.where}</span> — {draft.project.location.label ?? "—"}
          </span>
          <span className="flex items-center gap-2 text-[13px] text-ok">
            <Icon name="lock" size={14} />
            <span className="font-bold">{t.create.when}</span> —{" "}
            {draft.project.timing.rentalBasis ? t.options.rentalBasis[draft.project.timing.rentalBasis] : "—"}
          </span>
          <span className="ms-auto text-[11px] text-ok/80">{t.create.lockedForRequest}</span>
        </div>
      )}

      {/* ---------------- Move on ---------------- */}
      <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
        {!isFirstItem ? (
          <button
            onClick={() => actions.goItem(index - 1)}
            className="inline-flex items-center gap-1.5 text-[13px] font-bold text-navy-mid hover:text-navy"
          >
            <Icon name="arrow_back" size={16} className="rtl:rotate-180" /> {t.create.previousEquipment}
          </button>
        ) : (
          <span />
        )}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => {
              actions.addItem();
              actions.goItem(live.length);
            }}
            className="rounded-[10px] bg-warn/15 px-5 py-2.5 text-[13px] font-bold text-warn transition hover:bg-warn/25"
          >
            + {t.create.addAnother}
          </button>
          <button
            onClick={advance}
            className="inline-flex items-center gap-1.5 rounded-[10px] bg-brand px-5 py-2.5 text-[13px] font-bold text-brand-fg transition hover:brightness-[1.04]"
          >
            {isLastItem ? t.create.reviewAndSend : t.create.nextEquipment}
            <Icon name="arrow_forward" size={16} className="rtl:rotate-180" />
          </button>
        </div>
      </div>

      <CarryForwardModal
        open={carryTo != null}
        itemNumber={(carryTo ?? 0) + 1}
        onClose={() => setCarryTo(null)}
        onContinue={() => {
          if (carryTo != null) actions.goItem(carryTo);
          setCarryTo(null);
        }}
      />

      {/* Start over clears the saved draft, so it asks first. */}
      <Modal open={confirmReset} onClose={() => setConfirmReset(false)} title={t.draftPrompt.restartTitle}>
        <p className="mb-5 text-[13.5px] leading-relaxed text-muted">{t.draftPrompt.restartConfirm}</p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            onClick={() => setConfirmReset(false)}
            className="rounded-[10px] border border-border bg-surface px-4 py-2.5 text-[13.5px] font-bold text-navy-mid transition hover:bg-surface2"
          >
            {t.common.cancel}
          </button>
          <button
            onClick={() => {
              setConfirmReset(false);
              actions.reset();
            }}
            className="rounded-[10px] bg-brand px-4 py-2.5 text-[13.5px] font-bold text-brand-fg transition hover:brightness-[1.04]"
          >
            {t.create.startOver}
          </button>
        </div>
      </Modal>
    </div>
  );
}
