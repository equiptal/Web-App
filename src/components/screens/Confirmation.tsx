"use client";

import { useEffect, useState } from "react";
import { useT, fmt, useLocale } from "@/lib/i18n";
import { useRfq } from "@/lib/store/rfq-store";
import { Button, Icon } from "@/components/ui";
import { postableItems } from "@/lib/contract";

/** AC-42: web confirmation; renter stays on web (no bid-tracking surface). Matches the prototype.
 *  web-app/006 (frontend prototype): "share for bids" — invite off-platform suppliers via a link that
 *  opens the supplier bid form carrying this request id. Aligned to rentee-share-for-bids.html. */
export function Confirmation() {
  const t = useT();
  const { locale } = useLocale();
  const ar = locale === "ar";
  const L = (e: string, a: string) => (ar ? a : e);
  const { state, actions } = useRfq();
  const draft = state.draft;
  const count = draft ? postableItems(draft.items).length : 0;
  const loc = draft?.project.location.label;
  const start = draft?.project.timing.startDate;
  const summary = [fmt(t.confirmation.itemsSummary, { count }), loc, start].filter(Boolean).join(" · ");

  const reqId = state.requestIds[0] ?? "";
  const [origin, setOrigin] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [deadlineOn, setDeadlineOn] = useState(false);
  const [deadline, setDeadline] = useState("");
  useEffect(() => { if (typeof window !== "undefined") setOrigin(window.location.origin); }, []);

  const shareUrl = `${origin}/supplier-bid-v2.html${reqId ? `?req=${encodeURIComponent(reqId)}` : ""}`;
  const formUrl = `${origin}/supplier-bid-v2.html?preview=1`;
  const message = L(`Submit your bid on Moedatech: ${shareUrl}`, `قدّم عرضك على مؤيداتك: ${shareUrl}`);

  function copyLink() {
    if (shareUrl) navigator.clipboard?.writeText(shareUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }
  function shareVia(kind: "WhatsApp" | "Email" | "SMS" | "More") {
    const enc = encodeURIComponent(message);
    if (kind === "WhatsApp") window.open(`https://wa.me/?text=${enc}`, "_blank", "noopener");
    else if (kind === "Email") window.location.href = `mailto:?subject=${encodeURIComponent(L("Request for bids", "طلب عروض"))}&body=${enc}`;
    else if (kind === "SMS") window.location.href = `sms:?&body=${enc}`;
    else if (navigator.share) navigator.share({ url: shareUrl, text: message }).catch(() => {});
    else copyLink();
  }

  return (
    <div className="mx-auto max-w-xl px-5 pb-2 pt-10 text-center">
      <div className="mb-[18px] inline-flex h-[72px] w-[72px] items-center justify-center rounded-full bg-ok-soft">
        <Icon name="check" size={40} className="text-ok" />
      </div>
      <h2 className="text-[24px] font-extrabold tracking-tight">{t.confirmation.title}</h2>
      <p className="mx-auto mb-5 mt-2 max-w-[440px] text-sm text-muted">{t.confirmation.message}</p>

      <div className="inline-flex items-center gap-2.5 rounded-[10px] border border-border bg-surface px-[18px] py-[11px] text-[13.5px] font-bold">
        <Icon name="inventory_2" size={19} className="text-navy-mid" />
        {summary}
        {state.requestIds.length > 0 && <span className="text-muted">· {state.requestIds.join(", ")}</span>}
      </div>

      {/* web-app/006 — invite to bid (navy card), aligned to rentee-share-for-bids.html */}
      <div className="mx-auto mt-7 max-w-[520px] overflow-hidden rounded-2xl bg-navy p-6 text-start text-white">
        <h3 className="text-[17px] font-extrabold">{L("Want bids from suppliers you already know?", "تبي عروضاً من مؤجرين تعرفهم؟")}</h3>
        <p className="mt-2 text-[13px] leading-relaxed" style={{ color: "rgba(255,255,255,.72)" }}>
          {L("Share a bid link with any supplier — even off-platform. Their bids land with this request, so you can view and compare them side by side in Moedatech's bid-comparison tool.", "شارك رابط تقديم عرض مع أي مؤجر — حتى خارج المنصة. تصلك عروضهم مع هذا الطلب، فتقدر تعرضها وتقارنها جنباً إلى جنب في أداة مقارنة العروض على مؤيداتك.")}
        </p>
        <div className="mt-4 flex flex-wrap gap-2.5">
          <a href={formUrl} target="_blank" rel="noopener" className="inline-flex items-center justify-center gap-2 rounded-[10px] px-4 py-3 text-[13.5px] font-bold text-white" style={{ background: "rgba(255,255,255,.12)", border: "1px solid rgba(255,255,255,.25)" }}>
            <Icon name="visibility" size={18} />{L("View the bid form", "عرض نموذج العرض")}
          </a>
          <button onClick={() => setShareOpen(true)} className="inline-flex flex-1 items-center justify-center gap-2 rounded-[10px] bg-brand px-4 py-3 text-[13.5px] font-bold text-white">
            <Icon name="ios_share" size={18} />{L("Share your request for bids", "شارك طلبك لتلقّي العروض")}
          </button>
        </div>
        <div className="mt-4 flex items-start gap-2 text-[12px]" style={{ color: "rgba(255,255,255,.6)" }}>
          <span className="mt-px flex-none" style={{ color: "#FFC97A" }}><Icon name="history" size={16} /></span>
          {L("You can come back to this request anytime to share the same link again or set a deadline.", "تقدر ترجع لهذا الطلب في أي وقت تشارك نفس الرابط أو تضيف موعداً نهائياً.")}
        </div>
      </div>

      <div className="mt-[26px] flex justify-center gap-2.5">
        <Button onClick={() => actions.reset()}>
          <Icon name="add" size={18} /> {t.confirmation.newRequest}
        </Button>
        <Button variant="secondary" onClick={() => actions.reset()}>
          {t.confirmation.done}
        </Button>
      </div>

      {/* Share-for-bids modal */}
      {shareOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4" dir={ar ? "rtl" : "ltr"} onClick={(e) => e.target === e.currentTarget && setShareOpen(false)}>
          <div className="flex max-h-[92vh] w-full max-w-[460px] flex-col overflow-hidden rounded-t-2xl bg-surface text-start shadow-xl sm:rounded-2xl">
            <div className="flex items-start gap-3 border-b border-border px-5 py-4">
              <span className="grid h-10 w-10 flex-none place-items-center rounded-[10px] bg-brand text-white"><Icon name="ios_share" size={20} /></span>
              <div className="flex-1">
                <h3 className="text-[16px] font-extrabold text-navy">{L("Share for bids", "مشاركة لتلقّي العروض")}</h3>
                <p className="mt-0.5 text-[12px] text-muted">{L("Send this link to suppliers — they submit a bid without signing up.", "أرسل هذا الرابط للمؤجرين — يقدّمون عرضهم بدون تسجيل.")}</p>
              </div>
              <button onClick={() => setShareOpen(false)} className="grid h-8 w-8 flex-none place-items-center rounded-full text-muted hover:bg-surface2"><Icon name="close" size={18} /></button>
            </div>

            <div className="flex flex-col gap-5 overflow-y-auto px-5 py-4">
              {/* bid link + copy */}
              <div>
                <div className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-muted">{L("Bid link", "رابط تقديم العرض")}</div>
                <div className="flex gap-2">
                  <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-[10px] border border-border bg-surface2 px-3 text-[12px] text-navy">
                    <Icon name="link" size={15} className="flex-none text-muted" />
                    <span className="truncate">{shareUrl || "…"}</span>
                  </div>
                  <button onClick={copyLink} className={`inline-flex h-11 flex-none items-center gap-1.5 rounded-[10px] px-4 text-[13px] font-bold text-white ${copied ? "bg-ok" : "bg-brand"}`}>
                    <Icon name={copied ? "check" : "content_copy"} size={16} />{copied ? L("Copied", "تم النسخ") : L("Copy", "نسخ")}
                  </button>
                </div>
              </div>

              {/* share via channels */}
              <div>
                <div className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-muted">{L("Share via", "المشاركة عبر")}</div>
                <div className="grid grid-cols-4 gap-2">
                  {([
                    ["WhatsApp", "chat", L("WhatsApp", "واتساب")],
                    ["Email", "mail", L("Email", "إيميل")],
                    ["SMS", "sms", L("SMS", "رسالة")],
                    ["More", "more_horiz", L("More", "المزيد")],
                  ] as const).map(([kind, icon, label]) => (
                    <button key={kind} onClick={() => shareVia(kind)} className="flex flex-col items-center gap-1.5 rounded-[10px] border border-border bg-surface px-2 py-3 text-[11.5px] font-bold text-navy hover:bg-surface2">
                      <span className="grid h-9 w-9 place-items-center rounded-full bg-surface2 text-navy-mid"><Icon name={icon} size={18} /></span>{label}
                    </button>
                  ))}
                </div>
              </div>

              {/* optional deadline */}
              <div>
                <div className="mb-2 flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wide text-muted">
                  {L("Bid-submission deadline", "موعد نهائي لتقديم العروض")}<span className="rounded-full bg-surface2 px-2 py-0.5 text-[10px] normal-case text-muted">{L("Optional", "اختياري")}</span>
                </div>
                <div className="flex items-center justify-between rounded-[10px] border border-border bg-surface px-3.5 py-3">
                  <div>
                    <b className="block text-[13px] text-navy">{L("Set a deadline", "حدّد موعداً نهائياً")}</b>
                    <span className="text-[11.5px] text-muted">{L("When the link stops accepting bids", "متى يتوقف الرابط عن استقبال العروض")}</span>
                  </div>
                  <button onClick={() => setDeadlineOn((v) => !v)} className="relative h-6 w-11 flex-none rounded-full transition" style={{ background: deadlineOn ? "var(--brand, #F79009)" : "#cbd5e1" }} aria-pressed={deadlineOn}>
                    <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all" style={{ insetInlineStart: deadlineOn ? "1.5rem" : "0.125rem" }} />
                  </button>
                </div>
                {deadlineOn ? (
                  <div className="mt-2">
                    <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="h-11 w-full rounded-[10px] border border-border bg-surface2 px-3 text-[14px] text-navy outline-0" />
                    <div className="mt-2 flex items-start gap-1.5 text-[11.5px] text-muted"><Icon name="schedule" size={15} className="mt-px flex-none" />{L("The link expires at the deadline; suppliers see a countdown.", "ينتهي الرابط عند الموعد النهائي؛ يرى المؤجرون عدّاً تنازلياً.")}</div>
                  </div>
                ) : (
                  <div className="mt-2 text-[11.5px] text-muted">{L("No deadline set — the link stays open until you close the request.", "لا يوجد موعد نهائي — يبقى الرابط مفتوحاً حتى تُغلق الطلب.")}</div>
                )}
              </div>

              {/* preview */}
              <div>
                <div className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-muted">{L("Preview", "معاينة")}</div>
                <a href={formUrl} target="_blank" rel="noopener" className="flex items-center gap-3 rounded-[10px] border border-border bg-surface px-3.5 py-3 hover:bg-surface2">
                  <Icon name="visibility" size={18} className="flex-none text-navy-mid" />
                  <span className="flex-1">
                    <b className="block text-[13px] text-navy">{L("View the bid form", "عرض نموذج تقديم العرض")}</b>
                    <span className="text-[11.5px] text-muted">{L("See exactly what suppliers fill in — read-only.", "شاهد ما سيعبّيه المؤجرون — للعرض فقط.")}</span>
                  </span>
                  <Icon name="open_in_new" size={16} className="flex-none text-muted" />
                </a>
              </div>
            </div>

            <div className="flex justify-end border-t border-border px-5 py-3">
              <Button variant="secondary" onClick={() => setShareOpen(false)}>{L("Done", "تم")}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
