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

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fmt, useLocale, useT } from "@/lib/i18n";
import { useRfq } from "@/lib/store/rfq-store";
import { Icon, Modal } from "@/components/ui";
import { MachineCard } from "@/components/create/MachineCard";
import { OperatorRail } from "@/components/create/OperatorRail";
import { WherePanel } from "@/components/create/WherePanel";
import { WhenPanel } from "@/components/create/WhenPanel";
import { EquipmentTabs } from "@/components/create/EquipmentTabs";
import { PanelDot } from "@/components/create/Provenance";
import { customName, gateWhen, gateWhere, isCustomLine, itemGaps, requiredGaps, resolveRef, taxName, transportGaps } from "@/lib/contract";
import type { RequiredGap } from "@/lib/contract";
import { btn } from "@/lib/ds";
import { pin } from "@/lib/uiPins";
import { saveDirectStash, type DirectStashIntent } from "@/lib/agent/direct-stash";

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
  /**
   * The schedule's own shake, which used to be the equipment panel's.
   *
   * ⚠️ `shaking` drove BOTH the machine's fields and the schedule, and `shakeNow` took «fields» or
   * «where» — so every refusal that belonged to the schedule was passed as «fields», and «fields»
   * force-opens the equipment panel and scrolls to it. Press *Review & send* with the schedule's
   * acknowledgement unticked and the canvas opened the MACHINE, complete and with nothing to answer,
   * having just closed the panel that owed the answer (owner, 2026-09-02: *"sometimes when I click
   * review and send, random panels open and there is nothing I can do with them"*). One state per
   * panel, and `shakeNow` now takes the panel's own name.
   */
  const [shakingWhen, setShakingWhen] = useState(false);
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
  /**
   * The panel that the unseen pass just opened, so it can say why it opened.
   *
   * A panel appearing and shaking with nothing missing in it reads as the page misbehaving (owner,
   * 2026-09-02: *"sometimes when I click review and send, random panels open and there is nothing I
   * can do with them"*). The shake is the attention and this is the sentence: *filled in from your
   * project, have a look, then press again*. Cleared the moment the renter opens anything himself.
   */
  const [prefilledNote, setPrefilledNote] = useState<"where" | "when" | null>(null);
  /**
   * ── The operator rail, never opened (owner, 2026-09-09) ────────────────────────────────────────
   * *"If it is not open at all at least once and user try to move to next step the closed pannel
   * will shake too."*
   *
   * The rail is the one panel on this canvas that can be walked past without a mark: it collapses to
   * a 72px strip, nothing in it is required (`operatorNeeded` defaults to «no»), so no gap names it
   * and the renter can finish a machine having never seen what it holds — and an operator is priced.
   *
   * Two pieces of state, and they are separate on purpose. `railOpen` is REPORTED by the rail (its
   * `expanded` is local and opens off the item's own answer, so the canvas cannot derive it), and
   * `railSeen` is the memory of it ever having been true. Per MACHINE, keyed by item id: item 2's
   * rail is a different panel from item 1's, and being shown one is no answer about the other.
   */
  const [railOpen, setRailOpen] = useState(false);
  const [railSeen, setRailSeen] = useState<Set<string>>(() => new Set());
  const [shakingRail, setShakingRail] = useState(false);
  /**
   * ── The site and the schedule, locked once answered (owner, 2026-09-09) ───────────────────────
   * *"20.1 and 19.1 will be locked once they are selected in any of an equipment."*
   *
   * `unlocked` is the «Change» having been pressed. It is NOT persisted and is deliberately per
   * visit: the lock exists so the two request-wide panels are not edited by accident while the
   * renter thinks he is answering one equipment, and a renter who has just pressed «Change» is not
   * doing that. Leaving the canvas and coming back locks them again, answered.
   */
  const [unlocked, setUnlocked] = useState(false);
  /**
   * ── The equipment a tab's ✕ is about to remove (owner, 2026-09-09) ────────────────────────────
   * *"In the equipment tabs must have x button to remove it."*
   *
   * It asks first, and this holds what it is asking about. Removing an equipment takes its answers
   * with it — the machine, its year, its certificate, its operator, its transport — and nothing
   * brings them back: `REMOVE_ITEM` is a one-way flag on the item and the card is gone from the
   * strip the moment it is set. That is the same bar «Start over» and Back-to-intake clear, so it
   * gets the same one-line question rather than a press that costs work on a mis-tap.
   */
  const [removing, setRemoving] = useState<{ id: string; label: string } | null>(null);

  /**
   * ── In a DIRECT request the equipment comes from the store, so changing it is a trip there ─────
   *
   * App parity, Epic 008 AC-02 / AC-04: *"in direct mode the only-tab × redirects to the supplier's
   * store and the new selection becomes the single tab on return"*, and the + does the same with
   * intent `append`. The machine on a direct request came off one supplier's listing; picking a
   * different one HERE would address a request to a firm that may not carry it, which is why the
   * app hides the type and size controls in this mode too.
   *
   * The draft is stashed first, because `/create` deliberately refuses to rehydrate a stored draft
   * into a direct request (the 2026-09-10 fix) — without this, the site, the dates and every other
   * machine would be gone on the way back. `direct-stash.ts` carries the whole slice.
   */
  const router = useRouter();
  const direct = state.direct;
  const storeErrand = direct?.storeId
    ? (intent: DirectStashIntent) => {
        saveDirectStash({
          intent,
          supplierId: direct.supplierId,
          snapshot: {
            phase: state.phase,
            activeSection: state.activeSection,
            readyToSend: state.readyToSend,
            itemIndex: state.itemIndex,
            draft: state.draft,
            text: state.text,
            multiLocationDismissed: state.multiLocationDismissed,
            seq: state.seq,
            agentOrigin: state.agentOrigin,
            isTrial: state.isTrial,
            direct: state.direct,
          },
        });
        router.push(`/stores/${encodeURIComponent(direct.storeId!)}`);
      }
    : null;

  /* Every press that opens a panel records it. Declared with the other hooks, above every
     early return: a hook placed after one runs in a different order on the render that takes
     that return, which is the rule `react-hooks/rules-of-hooks` exists to catch. */
  useEffect(() => {
    const open = state.activeSection;
    if (open) setSeen((prev) => (prev.has(open) ? prev : new Set(prev).add(open)));
  }, [state.activeSection]);
  /* The rail reports its own open state; the canvas remembers that this MACHINE's rail was seen.
     ⚠️ The machine's id is read through a REF, not a dependency: `itemId` is derived below the early
     return that this hook has to sit above (`rules-of-hooks`), so naming it in the dependency array
     would evaluate it before it exists. The ref is written during the render that derives it, which
     is the same idiom `gapsRef` uses two hooks down and for the same reason. A stable identity also
     matters here: this function is an effect dependency inside the rail, so a new one per render
     would re-run that effect on every keystroke on the canvas. */
  const itemIdRef = useRef<string | null>(null);
  const onRailOpenState = useCallback((open: boolean) => {
    setRailOpen(open);
    const id = itemIdRef.current;
    if (open && id) setRailSeen((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  }, []);
  const [confirmReset, setConfirmReset] = useState(false);
  /* ~~`carryTo` — the item the carry-forward modal was about to move to.~~ Gone with the modal
     (owner, 2026-09-09): a move that needs no confirmation needs no staging, so `advance` and
     `addMachine` go straight to the item. */
  /** The last press before review: add another machine, or go on. See `advance`. */
  const [askAddMore, setAskAddMore] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  /** The equipment block — expanded card or collapsed strip — so a refusal can bring it into view. */
  const equipmentRef = useRef<HTMLElement | null>(null);
  /** The other two panels, for the same reason: a shake off screen is a click that did nothing. */
  const whereRef = useRef<HTMLDivElement | null>(null);
  const whenRef = useRef<HTMLDivElement | null>(null);

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

  /**
   * What the canvas DRAWS, which is not what it posts.
   *
   * ~~`postableItems(draft.items)`~~ — that filter drops no-match rows as well as removed ones, and
   * it was the list the panel read, so an item the taxonomy could not place vanished off the screen
   * entirely. Type "floating crane barge" and the machine panel simply was not there; type it alone
   * and the canvas said "add at least one machine" about the machine the renter had just described.
   *
   * The ACs always said otherwise. AC-31's row "STAYS visible in a pending state" (`draft.ts`), and
   * `useItemVerdict` says in as many words that "a no-match item never blocks and never posts, so
   * the canvas shows it without gating on it" — which is exactly right and was exactly not happening.
   * `UnavailableCard`, written for this state, was unreachable: it sits behind a verdict the panel
   * could never receive.
   *
   * Removed rows stay dropped: those the renter dismissed himself.
   *
   * **Nothing here weakens AC-33.** A no-match item the renter has not named still cannot reach a
   * supplier — every gate (`itemAppGaps`, `itemWebGaps`, `transportGaps`) returns early on the
   * verdict, `requiredGaps` counts only postable rows, the review screen lists only postable rows,
   * and submit posts `postableItems`. This list is the screen's, and the screen's alone.
   * (An OFF-CATALOGUE item he HAS named is a different row: `isCustomLine` lets the gates see it,
   * and it posts by name with no taxonomy ids.)
   */
  const live = draft.items.filter((i) => !i.removed);
  const index = Math.min(state.itemIndex, Math.max(0, live.length - 1));
  const item = live[index];
  /** This machine's id, for the per-machine memories below (the rail's «was it ever open»). */
  const itemId = item?.id ?? null;
  itemIdRef.current = itemId;
  const isFirstItem = index === 0;
  const isLastItem = index >= live.length - 1;

  const gaps = requiredGaps(draft, state.chargedDaysUnderstood);
  gapsRef.current = gaps;
  const equipmentGaps = item ? [...itemGaps(item, draft), ...transportGaps([item], draft.project)] : [];
  /**
   * A machine we cannot supply is not an ANSWERED machine — unless the renter has named it.
   *
   * Every gate returns early on a no-match verdict the renter cannot act on, which is right (he
   * cannot be asked to pick a category for a thing the catalogue does not carry), but it leaves
   * `equipmentGaps` empty, and empty is what paints this panel green. A row saying "we couldn't find
   * this in our catalogue" under a green tick is the panel contradicting itself.
   *
   * An OFF-CATALOGUE row is the other case: it is gated on the name he types, so `equipmentGaps`
   * speaks for it and green means green.
   */
  const itemUnavailable = item ? item.verdict === "no-match" && !isCustomLine(item) : false;
  const equipmentDone = equipmentGaps.length === 0 && !itemUnavailable;
  const whenOk = gateWhen(draft.project, state.chargedDaysUnderstood).ok;
  /* Locked when BOTH are answered and the renter has not asked to change them. Both, not either: a
     strip that stated a confirmed site beside an empty schedule would be locking a panel that still
     owes an answer, and the gates would then refuse a press with nothing on screen to fix. */
  const locked = whereOk && whenOk && !unlocked;

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

  /** The rail's own refusal: one pass, then it is seen and the next press goes on. */
  const shakeRail = () => {
    setTried(true);
    if (state.activeSection !== "equipment") actions.openSection("equipment");
    equipmentRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    setShakingRail(true);
    timers.current.push(setTimeout(() => setShakingRail(false), SHAKE_MS));
    if (itemId) setRailSeen((prev) => new Set(prev).add(itemId));
  };

  const shakeNow = (panel: "equipment" | "where" | "when") => {
    // Any refusal about a MISSING answer clears the «just have a look» note: the two would otherwise
    // sit in the same panel saying opposite things.
    setPrefilledNote(null);
    // Every refusal, whichever panel it lands in, turns the standing marks on. See `tried`.
    setTried(true);
    if (panel === "equipment") {
      // The blocking fields must be on screen to shake at all — and now that equipment collapses,
      // they may not even be rendered. Open it first, then bring it into view.
      if (state.activeSection !== "equipment") actions.openSection("equipment");
      equipmentRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    } else {
      // The panel is opened by the caller, which knows whether it is a refusal or a look-at-this.
      (panel === "where" ? whereRef : whenRef).current?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    const set = panel === "where" ? setShakingWhere : panel === "when" ? setShakingWhen : setShaking;
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
    setPrefilledNote(null);
    if (state.activeSection === section) {
      collapse(section);
      return;
    }
    if (section !== "equipment" && equipmentGaps.length > 0) {
      shakeNow("equipment");
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
      shakeNow(section);
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
      shakeNow("equipment");
      shakeNext();
      return;
    }
    /* ── The site, the schedule and the charged days gate «Next equipment» too ────────────────────
       (owner, 2026-09-06: *"in multi item I can click next equipment without filling location or
       date or acknowledge — the rules of shaking when I click review and send must be the same
       behaviour when I click next equipment"*.)

       They are REQUEST-WIDE: one address, one schedule, one acknowledgement for every machine on the
       request. So they are owed before the second machine, not after the last one — a renter who
       answers five machines and only then meets the dates has been asked in the wrong order, and the
       second machine's transport questions are decided by the site he has not named yet.

       ⚠️ **Only the request-wide ones.** The note above this function records what happens when the
       two bars are conflated: requiring the WHOLE draft to reach the next machine deadlocks the
       flow, because items 2-5 can only be answered by getting past item 1. So the filter is on
       `where` / `when` — the panels that belong to no single machine — and never on another
       machine's own gaps. The last item keeps the full bar, unchanged, below. */
    if (!isLastItem) {
      const shared = gaps.filter((g) => g.panel === "where" || g.panel === "when");
      if (shared.length > 0) {
        const first = shared[0];
        if (state.activeSection !== first.panel) actions.openSection(first.panel);
        shakeNow(first.panel);
        shakeNext();
        return;
      }
    }
    if (!isLastItem) {
      /* «Next equipment» leaves THIS equipment, so the rail's own look is owed here too — the
         owner's note is about moving to the next step, and on a multi-item request that is this
         press. */
      if (itemId && !railSeen.has(itemId) && !railOpen) {
        shakeRail();
        return;
      }
      // Straight there, with its panel open. No modal in between (owner, 2026-09-09).
      actions.goItem(index + 1);
      actions.openSection("equipment");
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
        shakeNow(unseen);
        setPrefilledNote(unseen);
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
      shakeNow(first.panel);
      return;
    }
    /*
     * — The rail’s unseen pass used to stand here too —
     *
     * 🔴 **Removed from «Review & send»** (owner, 2026-09-13: *"let the operator open and shake
     * when user try to click next without opening, not from the review and send but from the next
     * of the equipment"*). It stays on «Next equipment», above.
     *
     * The 2026-09-09 ruling put it on BOTH ways out of a machine. What that missed is where the two
     * presses LEAVE the renter: «Next equipment» keeps him on this canvas, so opening the rail puts
     * the panel he skipped in front of him and the next press carries on. «Review & send» is the
     * last press of the whole request, and refusing it in order to open a panel nothing is missing
     * from reads as a fault in the button rather than as an invitation.
     *
     * 🔴 **The cost, stated: on a ONE-equipment request nothing forces the rail open any more.**
     * Such a request has no «Next equipment», so that renter can finish having never seen the
     * panel — the exact hole 2026-09-09 was written to close, re-opened for the single-item case at
     * the owner’s word. The operator’s food, accommodation, nationality and certificate are all
     * priced off it.
     */
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
      shakeNow("equipment");
      return;
    }
    /* Append, then land on it, with its equipment panel open — the modal used to stand between
       those two acts and say what the screen now shows. `addItem` appends at the end, so the index
       to travel to is the length BEFORE the append. */
    const to = live.length;
    actions.addItem();
    actions.goItem(to);
    actions.openSection("equipment");
  };

  /**
   * What the collapsed equipment strip says it holds.
   *
   * Enough to recognise the machine without opening it — what it is, how many, and whether an
   * operator comes with it. A strip that only said "The machine & operator" would make the renter
   * open it to find out whether they had already dealt with it.
   */
  /**
   * ── The request's equipment, for the tab strip (owner, 2026-09-09) ─────────────────────────────
   * `type · size` per item, off the taxonomy — the same resolution `equipmentSummary` makes for the
   * collapsed strip, so a tab and the panel it opens cannot name one equipment two ways. An
   * off-catalogue line has no taxonomy pair and falls back to the renter's own words (`rawLabel`),
   * then to «This equipment» rather than to an empty tab.
   */
  const equipmentTabs = live.map((it) => {
    const { subcategory, measurement } = resolveRef(state.taxonomy, it.ref);
    const label =
      [taxName(subcategory, locale) || null, taxName(measurement, locale) || null].filter(Boolean).join(" · ") ||
      (isCustomLine(it) ? customName(it) : null) ||
      it.rawLabel ||
      t.create.machine;
    /* Per EQUIPMENT, not the request: `requiredGaps` answers for the whole draft, and a tab dotted
       amber because the SITE is unset would mark every equipment as owing something. `itemGaps` plus
       `transportGaps` for this one item is the same pair `equipmentGaps` uses for the panel in front
       of the renter, asked of each item in turn. */
    const own = [...itemGaps(it, draft), ...transportGaps([it], draft.project)];
    return { id: it.id, label, complete: own.length === 0 };
  });

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
      {/* ── The renter's own words, and what's left ────────────────────────────────────
          🔴 **Withheld on a DIRECT request that has no words** (owner, 2026-09-13, on a shot of it
          reading a bare em dash: *"remove the below one when direct request as no input"*).

          A direct request is seeded from the machine he PRESSED in a store, not from anything he
          typed, so `state.text` is empty and this card drew «YOU WROTE» over a dash. The one thing
          it exists for — letting him check what we read against what he wrote — has no content on
          that path, and «Edit», which walks back to the typing box, has nothing to edit.

          ⚠️ **`Start over` goes with it on that path**, and it is the canvas's only one. Not
          replaced: Back still walks the flow out, the ✕ on a direct tab is a trip to the store, and
          `state.direct` is dropped the moment he presses a different machine. Said out loud because
          it is a control disappearing, not just a decoration.

          ⚠️ The test is the WORDS, not the mode: a direct request that did arrive with a prefilled
          sentence still shows it, because then there is something to check.

          ⚠️ **The tone is the direct ribbon's** (owner, same message: *"use the above color in the
          intake card below in case of broadcast"*). It was `--warn`, which this palette serves as a
          MUSTARD (#b98a1d) rather than an orange — the same mismatch the canvas's provenance ring
          was corrected for on 2026-09-08. One orange on this screen now, whatever sits above it. */}
      {!(state.direct && !state.text?.trim()) && (
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3 rounded-sm border border-brand/35 bg-brand-soft px-5 py-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-[30px] w-[30px] flex-none place-items-center rounded-sm bg-brand/15 text-brand-deep">
            <Icon name="chat_bubble" size={15} />
          </span>
          <div className="min-w-0">
            {/* ⚠️ `brand-deep` (#c2570f) and never `brand`: orange TEXT on a light ground has to be
                the dark one to pass AA, and the brand orange is a FILL. The ring and the tile above
                keep `brand`, because those are borders and fills. Same ruling as 2026-09-08. */}
            <div className="text-label font-semibold uppercase tracking-[0.05em] text-brand-deep">{t.create.youWrote}</div>
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
            className="text-body font-semibold text-brand-deep underline decoration-brand/40 underline-offset-2 hover:decoration-brand"
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
      )}

      {/* Which machine, when there is more than one. */}
      {live.length > 1 && (
        <p className="mb-2.5 text-meta font-semibold uppercase tracking-[0.05em] text-muted">
          {fmt(t.create.itemOfCount, { n: index + 1, total: live.length })}
        </p>
      )}

      {/* ── The request's equipment, as tabs (owner, 2026-09-09) ────────────────────────────────
          *"If there is multi itme in the request i will show each equipment type with size here as
          tabs below 16 inside the machine and operator … with + at first card and it adds an
          equipment."*

          It sits directly ON the equipment block, open or collapsed, so the strip and the panel read
          as one object — the tabs' bottom border is the panel's top edge (`-mb-px`, the workspace's
          own recipe). The + is withheld while THIS equipment still owes an answer: `addMachine`
          would refuse the press anyway and shake, and a control that is going to refuse is better
          absent than lying. */}
      {item && (
        <EquipmentTabs
          tabs={equipmentTabs}
          activeId={item.id}
          onPick={(id) => {
            const to = live.findIndex((it) => it.id === id);
            if (to >= 0 && to !== index) actions.goItem(to);
            // Arriving on an equipment means looking at it: open its panel rather than leaving the
            // renter on whichever of the three was last open.
            actions.openSection("equipment");
          }}
          /* In a direct request the + is an errand to the supplier's store, not a blank card here
             (AC-02). It still refuses while THIS equipment owes an answer — leaving for the store
             would strand a half-answered machine in the stash. */
          onAdd={
            equipmentGaps.length > 0
              ? undefined
              : storeErrand
                ? () => storeErrand("append")
                : addMachine
          }
          /* Withheld on a request with ONE equipment: `gate.noItems` refuses a request with none, so
             the press would lead nowhere but a refusal.

             ⚠️ Except in a DIRECT request, where the ✕ on the ONLY tab is the one way to change the
             machine (AC-04) — it swaps rather than removes, so it never leads to an empty request.
             It asks nothing: the errand leaves the draft whole and the new pick replaces the line on
             return, so there is no answer to lose and nothing to confirm. With two or more equipment
             a ✕ is an ordinary remove in either mode, which is what the app does too — the errand is
             the answer to «I want a DIFFERENT machine», not to «I want one fewer». */
          /* Only when the ✕ is the store errand — with two or more equipment it removes, and says so. */
          removeLabel={equipmentTabs.length === 1 && storeErrand ? t.create.changeEquipment : undefined}
          onRemove={
            equipmentTabs.length > 1
              ? (id) => setRemoving({ id, label: equipmentTabs.find((tb) => tb.id === id)?.label ?? "" })
              : storeErrand
                ? () => storeErrand("single")
                : undefined
          }
        />
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
            <OperatorRail item={item} shaking={shakingRail} onOpenState={onRailOpenState} />
          </div>
        ) : (
          <button
            ref={equipmentRef as React.Ref<HTMLButtonElement>}
            type="button"
            onClick={() => actions.openSection("equipment")}
            className={`mb-3.5 flex w-full items-center justify-between gap-3 rounded-sm border px-5 py-4 text-start transition ${
              equipmentDone ? "border-ok/40 bg-ok/[0.06]" : "border-border bg-surface"
            }`}
            aria-expanded={false}
          >
            <span className="flex min-w-0 items-center gap-2">
              <PanelDot complete={equipmentDone} />
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
                shakeNow("equipment");
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
          ── Locked the moment they are answered (owner, 2026-09-09) ─────────────────────────────
          *"20.1 and 19.1 will be locked once they are selected in any of an equipment."*

          ~~Editable on the first equipment, settled from the second onwards.~~ The rule was about
          WHICH equipment the renter happened to be standing on, and these two panels belong to none
          of them: one address and one schedule for the whole request. So they lock on the ANSWER
          instead — the moment the site is confirmed and the basis chosen, the panels become the
          green strip.

          **With a «Change», at the owner's word.** A hard lock would trap a typo: a renter who set
          the wrong end date on a one-equipment request would have no way back except Back to «Your
          request» (which now asks first) and describing it again. The strip says the change reaches
          the whole request, which was always true and used to be said by a modal. */}
      {!locked ? (
        <>
          <div ref={whereRef}>
          <WherePanel
            open={state.activeSection === "where"}
            complete={whereOk}
            onToggle={() => openSection("where")}
            shakeConfirm={shakingWhere}
            tried={tried}
            prefilledNote={prefilledNote === "where"}
          />
          </div>
          <div ref={whenRef}>
          <WhenPanel
            open={state.activeSection === "when"}
            complete={whenOk}
            tried={tried}
            prefilledNote={prefilledNote === "when"}
            onToggle={() => openSection("when")}
            shakeConfirm={shakingWhen}
          />
          </div>
        </>
      ) : (
        <div {...pin("locked-for-request")} className="mb-3.5 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-sm border border-ok/40 bg-ok/[0.06] px-5 py-3.5">
          {/* Each half opens ITS OWN panel, not «the settings»: the renter presses the line he wants
              to change, and the panel he lands on is the one that owns it. */}
          <button
            type="button"
            onClick={() => { setUnlocked(true); openSection("where"); }}
            className="flex items-center gap-2 text-start text-body text-ok hover:text-ok-deep"
          >
            <Icon name="lock" size={14} />
            <span className="font-semibold">{t.create.where}</span> — {draft.project.location.label ?? "—"}
          </button>
          <button
            type="button"
            onClick={() => { setUnlocked(true); openSection("when"); }}
            className="flex items-center gap-2 text-start text-body text-ok hover:text-ok-deep"
          >
            <Icon name="lock" size={14} />
            <span className="font-semibold">{t.create.when}</span> —{" "}
            {draft.project.timing.rentalBasis ? t.options.rentalBasis[draft.project.timing.rentalBasis] : "—"}
          </button>
          <span className="ms-auto flex items-center gap-3">
            <span className="text-label text-ok/80">{t.create.lockedForRequest}</span>
            <button
              type="button"
              onClick={() => { setUnlocked(true); openSection("where"); }}
              className="inline-flex items-center gap-1 text-body font-semibold text-navy-mid underline decoration-ok/40 underline-offset-4 hover:text-navy"
            >
              <Icon name="edit" size={14} /> {t.create.changeForRequest}
            </button>
          </span>
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
      {/* ── «Remove this equipment from the request?» ────────────────────────────────────────────
          One line and two buttons, the shape the leave-the-request confirm already uses: the title IS
          the question, «Remove» is what the ✕ he pressed meant, and «Keep it» is the way out of a
          mis-tap. Which equipment is named in the ✕'s own accessible label, so the dialog does not
          have to repeat it. */}
      <Modal open={removing != null} onClose={() => setRemoving(null)} title={t.create.removeEquipment.title}>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button onClick={() => setRemoving(null)} className={btn("secondary", "md", { className: "transition" })}>
            {t.create.removeEquipment.keep}
          </button>
          <button
            onClick={() => {
              const id = removing?.id;
              setRemoving(null);
              if (!id) return;
              /* Where to land, worked out BEFORE the removal: `live` excludes removed items, so the
                 list shrinks under the index. Removing one BEFORE the open card shifts it down by
                 one; removing the open card itself keeps the index, which lands on the next
                 equipment — or on the new last one when it was the last. */
              const at = live.findIndex((it) => it.id === id);
              const last = live.length - 2;
              const to = at < index ? index - 1 : Math.min(index, last);
              actions.removeItem(id);
              actions.goItem(Math.max(0, to));
              // A removal is a change of subject: open the equipment it lands on rather than leaving
              // the renter on whichever panel happened to be open.
              actions.openSection("equipment");
            }}
            className={btn("danger", "md", { className: "transition" })}
          >
            {t.create.removeEquipment.remove}
          </button>
        </div>
      </Modal>

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

      {/* ~~`<CarryForwardModal>` — «Equipment #2», then two lines saying the site and schedule are
          locked and the other details were copied.~~ **Removed** (owner, 2026-09-09: *"remove this
          modal no need. make the add and the next … smoother without it"*).

          It was written because two things happened at once and only one was reversible. Both halves
          are now said on the SCREEN instead of in front of it: the site and the schedule sit in the
          green locked strip with a «Change» beside them, and the copied details are the card the
          renter lands on — visible, and editable, one press earlier than the modal used to be
          dismissed. */}
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
