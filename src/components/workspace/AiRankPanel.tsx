"use client";

import { useRef, useState } from "react";
import { Icon } from "@/components/ui";
import { btn } from "@/lib/ds";
import { useT } from "@/lib/i18n";
import { askBids, recommendBids } from "@/lib/api/client";
/* `presetToAgent` maps our OWN preset words (`best`, `lowest`…) to the agent's enum. This panel is
   keyed on the agent's enum directly, so there is nothing to translate. */
import { bidColumnToComputed, type PreferencePreset, type RankedBid } from "@/lib/contract/agent-bids";
import { buildItemComparison } from "@/lib/contract/comparison";
import type { WorkspaceBid } from "@/lib/contract/workspace";
import { pin } from "@/lib/uiPins";

/**
 * ── The assistant, under the comparison (owner, 2026-09-07) ──────────────────────────────────────
 * *"Make the AI ranking use the same agent capabilities as prod, where the user can choose what to
 * rank on and can even chat with it. Keep the rank in the last section, remove it from the supplier
 * column, and make it interactive like prod."*
 *
 * ~~One «Rank with AI» button in the terms band that ranked once and printed a single sentence.~~ It
 * used a tenth of what the agent answers: `/bids/recommend` takes a PREFERENCE — a preset or the
 * renter's own words — and `/bids/ask` holds a conversation that RE-RANKS as it goes and comes back
 * with its own reading, its changes and its suggested what-ifs.
 *
 * So this is the whole surface, in the place the ranking's note already occupied:
 *
 *  · **Four presets** — the agent's own enum (`best_overall`, `lowest_cost`, `newest_machine`,
 *    `most_trusted`), so pressing one is the renter saying what "best" means to him today.
 *  · **A question box** — his own words, answered in the agent's, with the table re-ordered behind
 *    the answer. The exchange stays on screen, because a ranking whose reason has scrolled away is
 *    a number nobody can check.
 *  · **The pick and its reason**, which is what the ★ on the supplier column comes from.
 *
 * **Every figure it sends is the web's own.** `buildItemComparison` computes the deterministic layer
 * — all-in totals, conflicts, percent versus lowest — and only that goes up. The agent orders and
 * explains; it is never asked for an amount, and nothing it returns is treated as one.
 */
const PRESETS: { key: PreferencePreset; short: string; icon: string }[] = [
  { key: "best_overall", short: "best", icon: "auto_awesome" },
  { key: "lowest_cost", short: "lowest", icon: "payments" },
  { key: "newest_machine", short: "newest", icon: "schedule" },
  { key: "most_trusted", short: "trusted", icon: "verified_user" },
];

type Turn = { me: string; reply: string; reading: string | null };

export function AiRankPanel({
  bids,
  durationDays,
  ranking,
  onRanking,
}: {
  /** What is on the table right now — the assistant ranks exactly what the renter can see. */
  bids: WorkspaceBid[];
  durationDays: number | null;
  ranking: { bidId: string | null; note: string | null } | null;
  onRanking: (next: { bidId: string | null; note: string | null } | null) => void;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [preset, setPreset] = useState<PreferencePreset | null>(null);
  const [order, setOrder] = useState<RankedBid[] | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [failed, setFailed] = useState(false);
  const box = useRef<HTMLInputElement | null>(null);

  /** The deterministic layer, computed here and sent as-is. */
  const computed = () => {
    const { columns } = buildItemComparison(
      bids.map((b) => b.card),
      { requestDurationDays: durationDays ?? undefined },
    );
    return columns.map(bidColumnToComputed);
  };

  const runPreset = async (p: PreferencePreset) => {
    if (busy || bids.length === 0) return;
    setBusy(true);
    setFailed(false);
    setPreset(p);
    try {
      const res = await recommendBids({ bids: computed(), preference: { preset: p } });
      if (!res.agent || !res.result) {
        setFailed(true);
        return;
      }
      setOrder(res.result.ranking ?? null);
      const rec = res.result.recommendation ?? null;
      onRanking({
        bidId: rec?.pick_bid_id ?? res.result.ranking?.[0]?.bid_id ?? null,
        note: rec?.reasons?.[0]?.text ?? res.result.interpretation ?? null,
      });
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const ask = async () => {
    const message = text.trim();
    if (busy || !message || bids.length === 0) return;
    setBusy(true);
    setFailed(false);
    setText("");
    try {
      const res = await askBids({ message, bids: computed(), current_ranking: order });
      if (!res.agent || !res.result) {
        setFailed(true);
        return;
      }
      const r = res.result;
      setOrder(r.ranking ?? null);
      setTurns((prev) => [...prev, { me: message, reply: r.reply, reading: r.interpretation }]);
      onRanking({ bidId: r.pick_bid_id, note: r.reply });
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
      box.current?.focus();
    }
  };

  if (bids.length === 0) return null;

  return (
    <div {...pin("ai-rank-panel")} className="flex flex-col gap-3 rounded-md border border-border bg-surface p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="grid size-6 flex-none place-items-center rounded-full bg-surface2 text-label font-semibold text-muted">✦</span>
        <span className="flex-none text-label font-extrabold uppercase tracking-wide text-navy-mid">{t.workspace.aiSuggestion}</span>
        {/* What «best» means today. The agent's own four, in its own vocabulary. */}
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            disabled={busy}
            onClick={() => void runPreset(p.key)}
            className={`inline-flex flex-none items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-label font-semibold transition disabled:bg-disabled-bg disabled:text-disabled-fg ${
              preset === p.key ? "border-brand/40 bg-brand-soft text-brand-deep" : "border-border bg-surface text-navy-mid hover:bg-surface2"
            }`}
          >
            <Icon name={p.icon} size={13} />
            {(t.workspace.rankPresets as Record<string, string>)[p.short]}
          </button>
        ))}
        {busy && <span className="text-label font-semibold text-muted">{t.workspace.rankThinking}</span>}
      </div>

      {/* The pick, and the agent's own words for it — never a paraphrase of ours. */}
      {ranking?.note && (
        <p className="text-meta font-semibold leading-[1.6] text-navy-mid">{ranking.note}</p>
      )}

      {/* The conversation, oldest first: a re-ranking whose reason has scrolled away is a number
          nobody can check. */}
      {turns.map((turn, i) => (
        <div key={i} className="flex flex-col gap-1.5 border-t border-border pt-2.5">
          <span className="text-label font-semibold text-muted">{turn.me}</span>
          <span className="text-meta font-semibold leading-[1.6] text-navy">{turn.reply}</span>
          {turn.reading && <span className="text-label font-semibold text-muted/80">{turn.reading}</span>}
        </div>
      ))}

      <div className="flex items-center gap-2">
        <input
          ref={box}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void ask();
          }}
          placeholder={t.workspace.rankAskPlaceholder}
          className="min-w-0 flex-1 rounded-sm border border-border px-2.5 py-1.5 text-meta outline-none focus:border-brand"
        />
        <button type="button" disabled={busy || !text.trim()} onClick={() => void ask()} className={btn("secondary", "sm", { className: "flex-none" })}>
          {t.workspace.rankAsk}
        </button>
      </div>

      {/* A failure says so and nothing more: an assistant that cannot answer must not leave the
          renter reading a stale ranking as though it were an answer to what he just asked. */}
      {failed && <span className="text-label font-semibold text-danger">{t.workspace.rankFailed}</span>}
    </div>
  );
}
