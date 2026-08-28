"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog } from "@/components/Dialog";
import { useT, useLocale, fmt } from "@/lib/i18n";
import { useRfq } from "@/lib/store/rfq-store";
import { Button, Icon } from "@/components/ui";
import type { EquipmentItem } from "@/lib/contract/draft";
import { pin } from "@/lib/uiPins";

/**
 * The agent at work (owner, 2026-08-26 — the Processing prototype).
 *
 * ── What is real here, and what cannot be ───────────────────────────────────────────────────────
 * `processRfq` is ONE request. The server answers once, with everything; there is no stream, so
 * there is no progress to report while it is in flight. Pretending otherwise — a bar that creeps to
 * 90% on a timer — is the thing this screen used to do, and it lies in the renter's favour right up
 * until it stalls.
 *
 * So the four stages are split honestly:
 *
 *   SCAN, EXTRACT   paced, and they say what was SENT — the document is being read, the details are
 *                   being pulled. Neither claims a finding, because none has arrived.
 *   MATCH           begins the moment the draft lands, and every line after it is REAL: each item's
 *                   own label and quantity, then the canonical name the agent matched it to. This is
 *                   the equipment the renter is about to see on the canvas, named the same way.
 *   ANALYZE         the last beat before the canvas opens.
 *
 * The reveal is also what the wait is FOR. The old screen sat on a flat 1,400ms pause after the
 * response so the counts could be read; that time now shows what was actually found, item by item.
 *
 * `agentNames` is the source for «matched to» — the contract marks it display-only for exactly this,
 * and it carries Arabic. Ids are never shown; they are not what a renter recognises.
 */

type Feed = { id: number; text: string };

/** How long each revealed item holds the feed. Fast enough not to delay the canvas, slow enough to read. */
const CHECK_MS = 320;
const MATCH_MS = 560;

export function Processing() {
  const t = useT();
  const { locale } = useLocale();
  const ar = locale === "ar";
  const { state, actions } = useRfq();
  const { busy, error, draft, errorDetail } = state;

  const stages = [
    { label: t.processing.stageScan, title: t.processing.stage1, icon: "radio_button_checked" },
    { label: t.processing.stageExtract, title: t.processing.stage2, icon: "edit_note" },
    { label: t.processing.stageMatch, title: t.processing.stage3, icon: "swap_horiz" },
    { label: t.processing.stageAnalyze, title: t.processing.stage4, icon: "target" },
  ];

  const [step, setStep] = useState(0);
  const [revealed, setRevealed] = useState(0);
  const [matched, setMatched] = useState(0);
  const [feed, setFeed] = useState<Feed[]>([]);
  const feedId = useRef(0);
  const push = (text: string) => setFeed((f) => [...f, { id: ++feedId.current, text }].slice(-4));

  /** The items the agent actually returned, in the order the canvas will list them. */
  const items: EquipmentItem[] = useMemo(
    () => (draft ? draft.items.filter((i) => !i.removed) : []),
    [draft],
  );

  /** One item, named as the renter will see it named. */
  const itemLabel = (it: EquipmentItem) => {
    const name =
      it.rawLabel ||
      (ar ? it.agentNames?.subtypeAr || it.agentNames?.subtype : it.agentNames?.subtype) ||
      (ar ? it.agentNames?.categoryAr || it.agentNames?.category : it.agentNames?.category) ||
      "—";
    const size = it.rawSize ? ` · ${it.rawSize}` : "";
    const qty = it.quantity > 1 ? ` × ${it.quantity}` : "";
    return `${name}${size}${qty}`;
  };

  /** What the agent resolved it to. Falls back to the item's own name rather than inventing one. */
  const matchLabel = (it: EquipmentItem) => {
    const a = it.agentNames;
    if (!a) return itemLabel(it);
    const sub = ar ? a.subtypeAr || a.subtype : a.subtype;
    const cap = ar ? a.capacityAr || a.capacity : a.capacity;
    return [sub, cap].filter(Boolean).join(" ") || itemLabel(it);
  };

  // ── Stages 0 and 1: paced, while the one request is in flight. ──
  useEffect(() => {
    if (!busy) return;
    setStep(0);
    setRevealed(0);
    setMatched(0);
    setFeed([]);
    push(t.processing.feedReading);
    const a = setTimeout(() => {
      push(fmt(t.processing.feedRead, { n: "1" }));
      setStep(1);
    }, 1100);
    const b = setTimeout(() => {
      push(t.processing.feedExtracted);
      setStep(2);
    }, 2300);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);

  const done = !busy && !!draft && !error;

  // ── Stage 2: the real items, one at a time. ──
  useEffect(() => {
    if (!done) return;
    if (step < 2) setStep(2);
    if (revealed < items.length && matched === revealed) {
      const id = setTimeout(() => {
        push(fmt(t.processing.feedChecking, { item: itemLabel(items[revealed]) }));
        setRevealed((n) => n + 1);
      }, CHECK_MS);
      return () => clearTimeout(id);
    }
    if (matched < revealed) {
      const id = setTimeout(() => {
        const it = items[matched];
        push(fmt(t.processing.feedMatched, { item: itemLabel(it), match: matchLabel(it) }));
        setMatched((n) => n + 1);
      }, MATCH_MS);
      return () => clearTimeout(id);
    }
    // Everything named — one last beat, then the canvas.
    const id = setTimeout(() => {
      push(t.processing.feedAllMatched);
      setStep(3);
      setTimeout(() => actions.enterWizard(), 700);
    }, 400);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, revealed, matched, items.length]);

  /* ----------------------------- Error (AC-09 / AC-10) — clear modal ----------------------------- */
  if (error) {
    const isEmpty = error === "empty";
    // Distinguish the agent's real failure (forwarded from Mansour) from a plain connection drop, so the
    // reason is clear: 429 = busy/rate-limited, 402/403 = unavailable (usage/credits/auth).
    const bs = errorDetail?.backendStatus;
    const agentBusy = bs === 429;
    const agentDown = bs === 402 || bs === 403;
    const title = isEmpty ? t.errors.emptyTitle : agentBusy ? t.errors.busyTitle : agentDown ? t.errors.unavailableTitle : t.errors.networkTitle;
    const body = isEmpty ? t.errors.emptyBody : agentBusy ? t.errors.busyBody : agentDown ? t.errors.unavailableBody : t.errors.networkBody;
    const icon = isEmpty ? "search_off" : agentBusy ? "hourglass_empty" : agentDown ? "cloud_off" : "wifi_off";
    return (
      /* ── The shared dialog, keeping its own shape (owner, 2026-08-28: one design for every modal)
         ─────────────────────────────────────────────────────────────────────────────────────────
         It drew its own scrim, panel, and close — and its own focus handling, which is to say none.
         `Dialog` supplies all four.

         It passes NO title, deliberately. A failure is read from the middle out: the glyph, then
         what went wrong, then the way back. Putting that title into a header bar at the leading edge
         would make this look like every panel and read like none of them. A title-less dialog floats
         its close in the corner, which is exactly the control this was hand-rolling. */
      <Dialog open onClose={() => actions.goIntake()} size="sm">
        <div className="text-center">
          <div className={`mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full ${isEmpty || agentBusy ? "bg-warn-soft text-warn" : "bg-danger-soft text-danger"}`}>
            <Icon name={icon} size={34} />
          </div>
          <h2 id="proc-err-title" className="text-title font-extrabold tracking-tight text-navy">{title}</h2>
          <p className="mx-auto mt-2 max-w-[300px] text-body leading-relaxed text-muted">{body}</p>
          {errorDetail?.detail && (
            <p className="mx-auto mt-3 max-w-[320px] break-words rounded-sm bg-surface3 px-3 py-2 text-start font-mono text-label leading-snug text-muted">{errorDetail.detail}</p>
          )}
          <Button className="mt-6 w-full py-3 text-subhead" onClick={() => actions.process()}>
            <Icon name="refresh" size={19} /> {t.common.retry}
          </Button>
        </div>
      </Dialog>
    );
  }

  /**
   * The bar is anchored to what has actually happened, not to a clock: 12% on send, 30% once the
   * request has been described, then 45→80% across the real items as they are named, and 92% while
   * the canvas is built. It never reaches 100 before the canvas does.
   */
  const pct =
    step === 0 ? 12 : step === 1 ? 30 : step === 2 ? Math.round(45 + (items.length ? (revealed + matched) / (items.length * 2) : 0) * 35) : 92;

  return (
    <div {...pin("create-processing")} className="flex min-h-[70vh] items-center justify-center">
      <div className="w-full max-w-[520px] rounded-lg border border-border bg-surface p-7 text-center">
        {/* ── The agent's mark, and the fact that it is live (owner's reference, 2026-08-26) ───────
            A 64px amber tile ABOVE its own label rather than a 30px chip beside it. This is the one
            moment in the flow where the renter is waiting on something he cannot see, so the thing
            he is waiting on is drawn at a size that admits it.

            The live dot moves from beside the label onto the tile's own corner, where it reads as
            "this is running" rather than as a bullet before a word. It is still the only thing on the
            card that moves without a reason — it is the reason — and the white ring is what keeps it
            legible against the amber it overlaps. */}
        <div className="mb-4 flex justify-center">
          <span className="relative grid h-16 w-16 place-items-center rounded-lg bg-gradient-to-br from-brand-light to-brand text-white">
            <Icon name="auto_awesome" size={30} />
            <span className="absolute -bottom-1 -end-1 h-4 w-4 rounded-full border-2 border-surface bg-ok motion-safe:animate-pulse" />
          </span>
        </div>
        <div className="mb-2 text-label font-extrabold uppercase tracking-[.06em] text-ok">{t.processing.agentWorking}</div>

        <h2 className="text-display font-extrabold tracking-tight text-navy">
          {stages[Math.min(step, 3)].title}
          <span className="motion-safe:animate-pulse">…</span>
        </h2>
        <p className="mb-5 mt-1 text-body text-muted">{t.processing.sub}</p>

        {/* The four stages, with the rule between them filling as each is passed. */}
        <div className="mx-auto mb-5 flex max-w-[400px] items-start">
          {stages.map((s, i) => {
            const isDone = i < step;
            const active = i === step;
            return (
              <div key={s.label} className="flex flex-1 items-center">
                <div className="flex flex-col items-center gap-2">
                  <span
                    className={`grid h-9 w-9 flex-none place-items-center rounded-full ${
                      isDone
                        ? "bg-ok text-white"
                        : active
                          ? "bg-brand text-white motion-safe:animate-pulse"
                          : "bg-surface2 text-muted"
                    }`}
                  >
                    <Icon name={isDone ? "check" : s.icon} size={17} />
                  </span>
                  {/* The step in hand is the only one in navy: green is behind you, grey is ahead. */}
                  <span
                    className={`whitespace-nowrap text-meta ${
                      isDone ? "font-semibold text-ok" : active ? "font-extrabold text-navy" : "font-semibold text-muted"
                    }`}
                  >
                    {s.label}
                  </span>
                </div>
                {i < stages.length - 1 && (
                  <span className={`mt-[-18px] h-0.5 flex-1 ${i < step ? "bg-ok" : "bg-border"}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* ── What the agent has said so far (owner's reference, 2026-08-26) ──────────────────────
            Four lines: enough to follow, short enough not to scroll.

            Each line carries a BADGE rather than a 6px dot — a green tick for a line that finished,
            a filled amber disc for the one still running. A dot that small could only be read by its
            colour, which asked a renter to know that amber means "working" before he had been told
            it once; a tick says finished in any palette. */}
        <div className="min-h-[110px] rounded-md border border-border bg-surface2/40 px-4 py-3.5">
          <div className="mb-2.5 text-label font-extrabold uppercase tracking-[.03em] text-muted">{t.processing.liveActivity}</div>
          <div className="flex flex-col items-stretch gap-2">
            {feed.map((entry, i) => {
              const running = i === feed.length - 1;
              return (
                <div key={entry.id} className="flex items-center gap-2.5 text-start">
                  <span
                    className={`grid h-5 w-5 flex-none place-items-center rounded-full ${
                      running ? "bg-brand motion-safe:animate-pulse" : "bg-ok text-white"
                    }`}
                  >
                    {!running && <Icon name="check" size={13} />}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-body text-navy-mid">{entry.text}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Thicker, and the figure in a pill of its own — the reference's, and it earns the weight:
            this is the only number on the screen and it was set in the same grey as the caption. */}
        <div className="mt-5 flex items-center gap-3">
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface3">
            <div className="h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${pct}%` }} />
          </div>
          <span className="flex-none rounded-full bg-brand-soft px-2 py-0.5 text-meta font-extrabold text-brand">{pct}%</span>
        </div>

        {/* The counts the canvas will open on, once there are any. */}
        {done && draft && (
          <p className="mt-3 text-meta font-semibold text-muted">
            {fmt(t.processing.summaryItems, { count: draft.summary.totalItems })}
            {draft.summary.needsValidation > 0 && ` · ${fmt(t.processing.summaryNeedCheck, { count: draft.summary.needsValidation })}`}
            {draft.summary.notAvailable > 0 && ` · ${fmt(t.processing.summaryNotAvailable, { count: draft.summary.notAvailable })}`}
          </p>
        )}
      </div>
    </div>
  );
}
