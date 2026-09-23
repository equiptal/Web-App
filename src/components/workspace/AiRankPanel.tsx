"use client";

import { useState } from "react";
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
 *  · **«Ask the assistant»**, which opens a CHAT PANEL on the inline-end edge (owner, 2026-09-08:
 *    *"in prod it opened a chat panel, so instead of this small text box just show the ranking
 *    criteria with «ask AI» that opens the panel on the right to chat"*). ~~A one-line input under
 *    the presets.~~ A conversation in a text field the width of a sentence is a conversation nobody
 *    has: prod gives it a column of its own, and so does this. The exchange lives in the panel and
 *    stays there, because a ranking whose reason has scrolled away is a number nobody can check.
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
  const [chatOpen, setChatOpen] = useState(false);

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

      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setChatOpen(true)} className={btn("secondary", "sm", { className: "flex-none" })}>
          <Icon name="forum" size={14} /> {t.workspace.rankAsk}
          {turns.length > 0 && (
            <span className="rounded-full bg-surface2 px-1.5 text-label font-semibold text-muted">{turns.length}</span>
          )}
        </button>
        <span className="text-label font-semibold text-muted">{t.workspace.rankAskHint}</span>
      </div>

      {/* A failure says so and nothing more: an assistant that cannot answer must not leave the
          renter reading a stale ranking as though it were an answer to what he just asked. */}
      {failed && <span className="text-label font-semibold text-danger">{t.workspace.rankFailed}</span>}

      {chatOpen && (
        <AiChatDrawer
          turns={turns}
          busy={busy}
          text={text}
          onText={setText}
          onSend={() => void ask()}
          onClose={() => setChatOpen(false)}
          failed={failed}
        />
      )}
    </div>
  );
}

/**
 * The conversation, in a column on the reading-end edge.
 *
 * `fixed inset-y-0 end-0`, not a modal: the renter is comparing a table and asking about it, so the
 * table must stay visible while he does. That is why there is no scrim either — dimming the thing
 * the question is about would be the one layout mistake this panel exists to avoid.
 *
 * It is the app's own drawer geometry (the map's chat dock): a 380px column, its own header, the
 * exchange scrolling in the middle, the box pinned at the foot.
 */
function AiChatDrawer({
  turns,
  busy,
  text,
  onText,
  onSend,
  onClose,
  failed,
}: {
  turns: Turn[];
  busy: boolean;
  text: string;
  onText: (v: string) => void;
  onSend: () => void;
  onClose: () => void;
  failed: boolean;
}) {
  const t = useT();
  return (
    <aside
      role="dialog"
      aria-label={t.workspace.rankAsk}
      className="fixed inset-y-0 end-0 z-50 flex w-[380px] max-w-[92vw] flex-col border-s border-border bg-surface"
    >
      <div className="flex flex-none items-center gap-2 border-b border-border px-3.5 py-2.5">
        <span className="grid size-6 flex-none place-items-center rounded-full bg-surface2 text-label font-semibold text-muted">✦</span>
        <span className="min-w-0 flex-1 truncate text-body font-extrabold text-navy">{t.workspace.aiSuggestion}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t.common.close}
          className="grid size-7 flex-none place-items-center rounded-full text-muted transition hover:bg-surface2 hover:text-navy"
        >
          <Icon name="close" size={16} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3.5">
        {turns.length === 0 && (
          <p className="text-meta leading-[1.6] text-muted">{t.workspace.rankAskPlaceholder}</p>
        )}
        {turns.map((turn, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            {/* His own words on the trailing edge, the agent's on the leading one — the shape every
                conversation in this product already has. */}
            <span className="self-end rounded-md bg-navy px-2.5 py-1.5 text-meta font-semibold text-white">{turn.me}</span>
            <span className="rounded-md bg-surface2 px-2.5 py-2 text-meta font-semibold leading-[1.6] text-navy">{turn.reply}</span>
            {turn.reading && <span className="text-label font-semibold text-muted">{turn.reading}</span>}
          </div>
        ))}
        {busy && <span className="text-label font-semibold text-muted">{t.workspace.rankThinking}</span>}
        {failed && <span className="text-label font-semibold text-danger">{t.workspace.rankFailed}</span>}
      </div>

      <div className="flex flex-none items-center gap-2 border-t border-border p-3">
        <input
          autoFocus
          value={text}
          onChange={(e) => onText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSend();
          }}
          placeholder={t.workspace.rankAskShort}
          className="min-w-0 flex-1 rounded-sm border border-border px-2.5 py-1.5 text-meta outline-none focus:border-brand"
        />
        <button type="button" disabled={busy || !text.trim()} onClick={onSend} className={btn("primary", "sm", { className: "flex-none" })}>
          <Icon name="send" size={14} />
        </button>
      </div>
    </aside>
  );
}
