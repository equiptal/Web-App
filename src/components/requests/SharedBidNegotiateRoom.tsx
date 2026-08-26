"use client";

import { useEffect, useRef, useState } from "react";
import type { BidCard } from "@/lib/contract/bids";
import type { LinkBidSubmission } from "@/lib/contract/link-bids";
import { postSubmissionMessage, fetchRequestSubmissions } from "@/lib/api/client";
import "@/components/deal-room/deal-room-proto.css";

const nf = (n: number) => Math.round(n).toLocaleString("en-US");
type NegMsg = { text: string; at: string; pending?: boolean; failed?: boolean };

const SBNR_CSS = `
.sbnr-page{position:fixed;inset:0;z-index:1000;background:var(--surface2);overflow-y:auto;-webkit-overflow-scrolling:touch}
.sbnr-topnav{position:sticky;top:0;z-index:12;display:flex;align-items:center;gap:12px;height:56px;padding:0 16px;background:var(--surface);border-bottom:1px solid var(--border)}
.sbnr-topnav .bk{width:38px;height:38px;border-radius:10px;border:1px solid var(--border);background:var(--surface);color:var(--navy);display:grid;place-items:center;cursor:pointer;flex:0 0 auto}
.sbnr-topnav .bk .material-icons-outlined{font-size:20px}
.sbnr-topnav .tt{font-size:15px;font-weight:800;color:var(--navy);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sbnr-inner{padding:16px 16px 0}
.sbnr-inner .dlproto{min-height:calc(100vh - 76px)}
.sbnr-inner .ib.send.dis{opacity:.4;cursor:not-allowed}
.sbnr-err{background:var(--danger-bg);color:var(--danger);font-size:12.5px;font-weight:700;padding:8px 14px;border-radius:10px;margin:0 0 8px;display:flex;align-items:center;gap:6px}
.sbnr-err .material-icons-outlined{font-size:15px}
[dir=rtl] .sbnr-topnav .bk .material-icons-outlined{transform:scaleX(-1)}
`;

/**
 * web-app/006 — deal-room-style negotiate view for an OFF-PLATFORM shared-link bid. The supplier isn't
 * on the app yet, so this isn't a live deal room: it reuses the deal-room shell (.dlproto) but the price
 * bar is read-only (their quoted offer) and the thread is a one-way relay. Messages the renter sends are
 * stored on the submission (`rentee_messages`) and replayed into the supplier's real in-app deal room —
 * as the renter, room opened NEGOTIATING — the moment ops onboard them and convert the bid.
 */
export function SharedBidNegotiateRoom({
  bid,
  submission,
  itemLabel,
  ar,
  L,
  onClose,
  onViewSubmission,
}: {
  bid: BidCard;
  submission: LinkBidSubmission | null;
  itemLabel?: string | null;
  ar: boolean;
  L: (en: string, arr: string) => string;
  onClose: () => void;
  /** Optional jump to the read-only submission viewer (the documents icon in the top bar). */
  onViewSubmission?: () => void;
}) {
  const [messages, setMessages] = useState<NegMsg[]>(() => (submission?.renteeMessages ?? []).slice());
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  // The `submission` prop is a page-load snapshot the parent never refreshes, so it can be stale (missing
  // messages sent since). Once the user sends here, `dirty` guards against the on-open fetch clobbering
  // their optimistic/confirmed messages.
  const dirty = useRef(false);

  // Load the CURRENT persisted messages from the server when the room opens (fixes "messages don't
  // persist" — the prop snapshot lags behind what's actually saved). Skipped once the user has sent.
  useEffect(() => {
    if (!submission?.requestId || !submission?.id) return;
    let alive = true;
    fetchRequestSubmissions(submission.requestId)
      .then((res) => {
        if (!alive || dirty.current) return;
        const fresh = res.submissions.find((s) => s.id === submission.id);
        if (fresh) setMessages((fresh.renteeMessages ?? []).slice());
      })
      .catch(() => { /* keep the snapshot we already have */ });
    return () => { alive = false; };
  }, [submission?.id, submission?.requestId]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);

  // Keep the app's sidebar visible: the panel is fixed, so offset its inline-start by the live width of
  // the AppShell <aside> (232px expanded / 68px collapsed / 0 on mobile where it's hidden). Re-measure on
  // resize + sidebar collapse so it stays aligned.
  const [sbStart, setSbStart] = useState(0);
  useEffect(() => {
    const aside = document.querySelector("aside");
    const measure = () => setSbStart(aside && getComputedStyle(aside).display !== "none" ? Math.round(aside.getBoundingClientRect().width) : 0);
    measure();
    const ro = typeof ResizeObserver !== "undefined" && aside ? new ResizeObserver(measure) : null;
    ro?.observe(aside as Element);
    window.addEventListener("resize", measure);
    return () => { window.removeEventListener("resize", measure); ro?.disconnect(); };
  }, []);

  const rate = bid.price ?? 0;
  const offered = bid.unitsOffered || 1;
  const periodLabel = (() => {
    switch ((bid.priceUnit ?? "PER_DAY").toUpperCase()) {
      case "PER_WEEK": return L("week", "أسبوع");
      case "PER_MONTH": return L("month", "شهر");
      case "PER_JOB": return L("job", "مهمة");
      default: return L("day", "يوم");
    }
  })();
  const companyName = submission?.companyName || bid.supplierName || L("Supplier", "المؤجّر");
  const code = submission?.groupRef || submission?.rfqRef || null;
  const title = itemLabel || L("Equipment", "المعدة");
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(ar ? "ar-SA-u-ca-gregory" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
  const fmtTime = (iso: string) => { try { return new Date(iso).toLocaleTimeString(ar ? "ar-SA-u-ca-gregory" : "en-GB", { hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };

  const canSend = !!submission && !!text.trim() && !sending;

  async function send() {
    const body = text.trim();
    if (!submission || !body || sending) return;
    dirty.current = true; // don't let the on-open fetch overwrite what we're sending
    setSending(true);
    setError(null);
    const optimistic: NegMsg = { text: body, at: new Date().toISOString(), pending: true };
    setMessages((m) => [...m, optimistic]);
    setText("");
    try {
      await postSubmissionMessage(submission.requestId, submission.id, body);
      setMessages((m) => m.map((x) => (x === optimistic ? { text: body, at: optimistic.at } : x)));
    } catch (e) {
      setMessages((m) => m.map((x) => (x === optimistic ? { ...x, pending: false, failed: true } : x)));
      setError(e instanceof Error && e.message ? e.message : L("Couldn't send your message. Please try again.", "تعذّر إرسال رسالتك. حاول مرة أخرى."));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="sbnr-page" dir={ar ? "rtl" : "ltr"} style={{ insetInlineStart: sbStart }}>
      <style>{SBNR_CSS}</style>
      <link rel="stylesheet" href="https://fonts.googleapis.com/icon?family=Material+Icons+Outlined" />
      <div className="sbnr-topnav">
        <button className="bk" onClick={onClose} aria-label={L("Back", "رجوع")}><span className="material-icons-outlined">arrow_back</span></button>
        <span className="tt">{companyName} · {L("Negotiate", "تفاوض")}</span>
      </div>
      <div className="sbnr-inner">
        <div className="dlproto" dir={ar ? "rtl" : "ltr"}>

          {/* top bar — supplier chip · equipment/RFQ block · off-platform phase pill · view-submission icon */}
          <div className="topbar">
            <div className="tb-sup" style={{ cursor: "default" }}>
              <span className="av" style={{ background: "var(--warn)" }}>{companyName.charAt(0).toUpperCase()}</span>
              <span className="nm">
                <span className="n" style={{ color: "var(--navy)" }}>{companyName}{bid.verified && <span className="material-icons-outlined">verified</span>}</span>
                <span className="sub">{L("Supplier · off-platform", "مؤجّر · خارج المنصة")}</span>
              </span>
            </div>
            <span className="tb-div" />
            <div className="tb-eq">
              <span className="ic"><span className="material-icons-outlined">construction</span></span>
              <span className="meta">
                <span className="t">{code && <span className="tb-code">{code}</span>}{title}{offered > 1 ? ` · ${offered} ${L("units", "وحدة")}` : ""}</span>
                <span className="sub">{submission?.validUntil ? L(`Valid until ${fmtDate(submission.validUntil)}`, `صالح حتى ${fmtDate(submission.validUntil)}`) : L("Submitted via your shared link", "مُقدَّم عبر رابطك المشترك")}</span>
              </span>
            </div>
            <span className="tb-phase" style={{ color: "var(--warn)", borderColor: "color-mix(in srgb, var(--brand) 40%, transparent)", background: "var(--brand-soft)" }}><span className="dot" />{L("Off-platform", "خارج المنصة")}</span>
            <span className="tb-spacer" />
            {onViewSubmission && (
              <div className="tb-icons">
                <span className="tb-ic" role="button" tabIndex={0} title={L("View submission", "عرض العرض")} onClick={onViewSubmission} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onViewSubmission()}>
                  <span className="material-icons-outlined">description</span>
                </span>
              </div>
            )}
          </div>

          {/* price bar — their quoted offer, READ-ONLY (no accept/counter: the supplier isn't on the app) */}
          <div className="price-bar">
            <div className="pb-center">
              <div className="pb-src"><span className="dot" />{L("Supplier's quote", "عرض المؤجّر")}{offered > 1 ? ` · ${L("per unit", "للوحدة")}` : ""}</div>
              <div className="pb-hero"><span className="n">{nf(rate)}</span><span className="u">{L("SAR", "ر.س")}/{periodLabel}</span></div>
              {submission?.grandTotal ? (
                <div className="pb-tools"><span style={{ fontSize: 12, color: "rgba(255,255,255,.72)", fontWeight: 700 }}>{L("Quoted total", "الإجمالي المُسعّر")}: {nf(submission.grandTotal)} {L("SAR", "ر.س")} · {L("incl. VAT", "شامل الضريبة")}</span></div>
              ) : null}
            </div>
          </div>

          {/* thread */}
          <div className="thread">
            <div className="sysev">
              <span className="material-icons-outlined">bolt</span>
              <span>{L("Off-platform negotiation — messages are delivered when the supplier joins the app.", "تفاوض خارج المنصة — تُسلَّم الرسائل عند انضمام المؤجّر إلى التطبيق.")}</span>
            </div>
            {!submission ? (
              <div className="sysev">{L("Submission details aren't available.", "تفاصيل العرض غير متاحة.")}</div>
            ) : messages.length === 0 ? (
              <div className="sysev">{L("No messages yet — send the first one to open negotiations 👋", "لا رسائل بعد — أرسل أول رسالة لبدء التفاوض 👋")}</div>
            ) : (
              messages.map((m, i) => (
                <div className="msg mine" key={`${m.at}-${i}`}>
                  {m.text}
                  <div className="meta">{m.pending ? L("Sending…", "جارٍ الإرسال…") : m.failed ? L("Not sent", "لم تُرسل") : fmtTime(m.at)}</div>
                </div>
              ))
            )}
            <div ref={bottomRef} />
          </div>

          {/* composer */}
          {error && <div className="sbnr-err"><span className="material-icons-outlined">error_outline</span>{error}</div>}
          <div className="composer">
            <input
              value={text}
              disabled={!submission || sending}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder={L("Write a message to the supplier…", "اكتب رسالة إلى المؤجّر…")}
            />
            <span className={`ib send${canSend ? "" : " dis"}`} onClick={() => canSend && send()} role="button" aria-label={L("Send", "إرسال")}>
              <span className="material-icons-outlined">send</span>
            </span>
          </div>

        </div>
      </div>
    </div>
  );
}
