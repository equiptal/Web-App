"use client";

import { useMemo, useRef, useState } from "react";
import { useLocale } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import { AccountModal } from "@/components/onboarding/AccountModal";
import { parseBid, recommendBids, askBids } from "@/lib/api/client";
import { agentUses, bumpAgentUse, guestLimitReached, GUEST_AGENT_LIMIT } from "@/lib/access/agent-quota";
import { toComputedBids } from "@/lib/contract/quick-compare";
import type { NormalizedBid, RecommendResult, RankedBid } from "@/lib/contract/agent-bids";

/**
 * Guest quick-compare (public-web-auth-gate T9). A signed-out visitor can upload supplier quotes, see
 * them extracted + compared side-by-side, and use the AI agent to rank / ask — with NO request and NO
 * account. The parse/recommend/ask endpoints relay to Mansour without auth, so this needs no backend.
 *
 * - Uploading & comparing is free (that's the whole draw).
 * - The AI *analysis* (rank / ask) is what counts against the per-device guest limit (T10) — once it's
 *   used up, the account modal opens instead of running.
 * - Starting a deal / contacting a supplier requires an account, so it opens the account modal too.
 */
type LocalBid = NormalizedBid & { _uid: string };

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(new Error("read failed"));
    r.readAsDataURL(file);
  });
}

export function GuestQuickCompare() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const L = (en: string, arr: string) => (ar ? arr : en);
  const nf = (n: number) => Math.round(n).toLocaleString(ar ? "ar-EG" : "en-US");

  const idRef = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const [bids, setBids] = useState<LocalBid[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [rec, setRec] = useState<RecommendResult | null>(null);
  const [ranking, setRanking] = useState<RankedBid[] | null>(null);
  const [chat, setChat] = useState<{ role: "user" | "agent"; text: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [showAccount, setShowAccount] = useState(false);

  // Deterministic money layer (all-in + percent-vs-lowest), keyed by each quote's stable id.
  const computed = useMemo(() => toComputedBids(bids.map((b) => ({ ...b, bid_id: b._uid }))), [bids]);

  // The AI analysis (rank/ask) is the metered agent use. Returns false + opens the account gate when
  // the guest's free allowance is spent.
  const spendAnalysis = (): boolean => {
    if (guestLimitReached("compare")) {
      setShowAccount(true);
      return false;
    }
    bumpAgentUse("compare");
    return true;
  };

  async function onUpload(file: File) {
    setNote(L("Reading the quote…", "جارٍ قراءة العرض…"));
    setBusy(true);
    try {
      const data = await fileToBase64(file);
      const r = await parseBid({ attachments: [{ type: file.type || "application/octet-stream", filename: file.name, data }], request_context: { subtype: null } });
      if (!r.agent) {
        setNote(L("The AI assistant isn't reachable right now.", "المساعد الذكي غير متاح حاليًا."));
      } else if (r.result && r.result.ok) {
        const parsed = r.result.bid;
        const uid = `q${idRef.current++}`;
        setBids((p) => [...p, { ...parsed, _uid: uid, source_file: parsed.source_file ?? file.name }]);
        setRec(null); // ranking is stale once the set changes
        setRanking(null);
        setNote(null);
      } else {
        // Surface Mansour's reason so a parse miss is diagnosable (unsupported file, no price found, …).
        const reason = r.result && !r.result.ok ? r.result.reason : null;
        setNote(reason ? L(`Couldn't read that quote — ${reason}`, `تعذّرت قراءة العرض — ${reason}`) : L("Couldn't read that file — nothing was added.", "تعذّرت قراءة الملف — لم يُضف شيء."));
      }
    } catch {
      setNote(L("Couldn't read that file — nothing was added.", "تعذّرت قراءة الملف — لم يُضف شيء."));
    } finally {
      setBusy(false);
    }
  }

  async function rank() {
    if (bids.length < 2 || !spendAnalysis()) return;
    setBusy(true);
    const r = await recommendBids({ request: { hasRequirements: false }, bids: computed, previous_ranking: ranking });
    setBusy(false);
    if (r.agent && r.result) {
      setRec(r.result);
      setRanking(r.result.ranking);
    } else {
      setNote(L("The AI assistant isn't reachable right now.", "المساعد الذكي غير متاح حاليًا."));
    }
  }

  async function ask() {
    const v = chatInput.trim();
    if (!v || !spendAnalysis()) return;
    setChat((c) => [...c, { role: "user", text: v }]);
    setChatInput("");
    setBusy(true);
    const r = await askBids({ message: v, request: { hasRequirements: false }, bids: computed, current_ranking: ranking });
    setBusy(false);
    if (r.agent && r.result) {
      setChat((c) => [...c, { role: "agent", text: r.result!.reply }]);
      setRanking(r.result.ranking);
      if (rec) setRec({ ...rec, ranking: r.result.ranking, recommendation: { ...rec.recommendation, pick_bid_id: r.result.pick_bid_id, confidence: r.result.confidence }, interpretation: r.result.interpretation });
    } else {
      setChat((c) => [...c, { role: "agent", text: L("I couldn't reach the assistant just now — try again.", "تعذّر الوصول للمساعد الآن — حاول مجددًا.") }]);
    }
  }

  const rankOf = (uid: string) => ranking?.find((r) => r.bid_id === uid)?.rank ?? null;
  const pickId = rec?.recommendation.pick_bid_id ?? null;
  const ordered = ranking ? [...bids].sort((a, b) => (rankOf(a._uid) ?? 99) - (rankOf(b._uid) ?? 99)) : bids;
  const remaining = Math.max(0, GUEST_AGENT_LIMIT - agentUses("compare"));

  return (
    <div className="flex flex-col gap-4" dir={ar ? "rtl" : "ltr"}>
      {/* Intro */}
      <div className="rounded-[14px] border border-border bg-surface p-5">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 flex-none place-items-center rounded-[10px] bg-brand-soft text-brand"><Icon name="compare_arrows" size={22} /></span>
          <div>
            <h2 className="text-[18px] font-extrabold text-navy">{L("Compare supplier quotes", "قارن عروض المؤجرين")}</h2>
            <p className="mt-0.5 text-[13px] text-muted">{L("Upload the quotes you received — the AI extracts and lines them up so you can compare, no account needed.", "ارفع العروض التي استلمتها — يستخرجها الذكاء الاصطناعي ويصفّها لتقارنها، دون حساب.")}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-[10px] bg-brand px-4 py-2.5 text-[13.5px] font-bold text-white transition hover:brightness-105 disabled:opacity-50"
          >
            <Icon name="upload_file" size={18} /> {L("Upload a quote", "رفع عرض")}
          </button>
          <input ref={fileRef} type="file" accept=".pdf,.xlsx,.xls,.csv,image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onUpload(f); e.currentTarget.value = ""; }} />
          {bids.length >= 2 && (
            <button onClick={() => void rank()} disabled={busy} className="inline-flex items-center gap-2 rounded-[10px] border border-brand bg-surface px-4 py-2.5 text-[13.5px] font-bold text-brand transition hover:bg-brand-soft disabled:opacity-50">
              <Icon name="auto_awesome" size={18} /> {L("Rank with AI", "رتّب بالذكاء الاصطناعي")}
            </button>
          )}
          {note && <span className="text-[12.5px] font-semibold text-muted">{note}</span>}
        </div>
      </div>

      {/* Comparison table */}
      {bids.length === 0 ? (
        <div className="rounded-[12px] border border-dashed border-border bg-surface2/50 p-10 text-center text-[13px] text-muted">
          <Icon name="description" size={26} className="mx-auto mb-2 text-muted" />
          {L("No quotes yet — upload at least two to compare them.", "لا توجد عروض بعد — ارفع عرضين على الأقل للمقارنة.")}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[14px] border border-border bg-surface">
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="border-b border-border text-start text-[10.5px] uppercase tracking-wide text-muted">
                {[L("Supplier", "المؤجّر"), L("Equipment", "المعدة"), L("Price", "السعر"), L("Mob / Demob", "التعبئة/التفكيك"), L("All-in", "الإجمالي"), L("vs lowest", "مقابل الأقل"), L("Valid until", "صالح حتى")].map((h) => (
                  <th key={h} className="whitespace-nowrap p-3 text-start font-extrabold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ordered.map((b) => {
                const total = (b.price_amount ?? 0) + (b.mobilization_amount ?? 0) + (b.demobilization_amount ?? 0);
                const isPick = pickId === b._uid;
                const rk = rankOf(b._uid);
                return (
                  <tr key={b._uid} className={`border-b border-border/60 ${isPick ? "bg-brand-soft/40" : ""}`}>
                    <td className="whitespace-nowrap p-3 font-bold text-navy">
                      <span className="flex items-center gap-2">
                        {rk != null && <span className={`grid h-5 w-5 flex-none place-items-center rounded-full text-[10px] font-extrabold ${isPick ? "bg-brand text-white" : "bg-surface2 text-navy-mid"}`}>{rk}</span>}
                        {b.supplier_name || L("Uploaded quote", "عرض مرفوع")}
                        {isPick && <span className="rounded-full bg-brand px-1.5 py-0.5 text-[9px] font-extrabold uppercase text-white">{L("Pick", "المُختار")}</span>}
                      </span>
                    </td>
                    <td className="whitespace-nowrap p-3 text-navy-mid">{[b.equipment_subtype, b.equipment_year].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="whitespace-nowrap p-3 text-navy">{b.price_amount != null ? `${nf(b.price_amount)} ${L("SAR", "ر.س")}${b.price_unit ? ` / ${b.price_unit.replace("PER_", "").toLowerCase()}` : ""}` : "—"}</td>
                    <td className="whitespace-nowrap p-3 text-navy-mid">{(b.mobilization_amount ?? b.demobilization_amount) != null ? `${nf(b.mobilization_amount ?? 0)} / ${nf(b.demobilization_amount ?? 0)}` : "—"}</td>
                    <td className="whitespace-nowrap p-3 font-extrabold text-navy">{total > 0 ? `${nf(total)} ${L("SAR", "ر.س")}` : "—"}</td>
                    <td className="whitespace-nowrap p-3 text-navy-mid">{rec && total > 0 ? (computed.find((c) => c.bid_id === b._uid)?.percent_vs_lowest === 0 ? L("lowest", "الأقل") : `+${computed.find((c) => c.bid_id === b._uid)?.percent_vs_lowest}%`) : "—"}</td>
                    <td className="whitespace-nowrap p-3 text-navy-mid">{b.valid_until || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* AI interpretation + ask */}
      {rec?.interpretation && (
        <div className="rounded-[12px] border border-info/30 bg-info-soft/40 px-4 py-3 text-[13px] text-navy">
          <span className="font-bold">{L("Assistant", "المساعد")}: </span>{rec.interpretation}
        </div>
      )}
      {bids.length >= 2 && (
        <div className="rounded-[14px] border border-border bg-surface p-4">
          {chat.length > 0 && (
            <div className="mb-3 flex flex-col gap-2">
              {chat.map((m, i) => (
                <div key={i} className={`max-w-[85%] rounded-[10px] px-3 py-2 text-[13px] ${m.role === "user" ? "self-end bg-brand text-white" : "self-start bg-surface2 text-navy"}`}>{m.text}</div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void ask(); }}
              placeholder={L("Ask the assistant — e.g. which is cheapest all-in?", "اسأل المساعد — مثلاً أيّهما أقل تكلفة إجمالًا؟")}
              className="h-11 min-w-0 flex-1 rounded-[10px] border border-border bg-surface2 px-3 text-[13.5px] outline-0 focus:border-brand"
            />
            <button onClick={() => void ask()} disabled={busy || !chatInput.trim()} className="inline-flex h-11 flex-none items-center gap-1.5 rounded-[10px] bg-brand px-4 text-[13px] font-bold text-white disabled:opacity-50">
              <Icon name="send" size={16} /> {L("Ask", "اسأل")}
            </button>
          </div>
          <p className="mt-2 text-[11.5px] text-muted">{L(`Free AI analyses left: ${remaining}. Create an account to compare and negotiate without limits.`, `تحليلات مجانية متبقية: ${remaining}. أنشئ حسابًا للمقارنة والتفاوض بلا حدود.`)}</p>
        </div>
      )}

      <AccountModal open={showAccount} onClose={() => setShowAccount(false)} onCreated={() => setShowAccount(false)} />
    </div>
  );
}
