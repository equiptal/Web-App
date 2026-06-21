"use client";

import { useEffect, useState } from "react";
import { useT, fmt, useLocale } from "@/lib/i18n";
import { useRfq } from "@/lib/store/rfq-store";
import { Button, Icon } from "@/components/ui";
import { postableItems } from "@/lib/contract";

/** AC-42: web confirmation; renter stays on web (no bid-tracking surface). Matches the prototype.
 *  web-app/006 (frontend prototype): a "share for bids" link the renter can send to off-platform
 *  suppliers — it opens the supplier bid form (prototype) carrying this request id. */
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
  const [shareUrl, setShareUrl] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setShareUrl(`${window.location.origin}/supplier-bid-v2.html${reqId ? `?req=${encodeURIComponent(reqId)}` : ""}`);
  }, [reqId]);
  function copyLink() {
    if (shareUrl) navigator.clipboard?.writeText(shareUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
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

      {/* web-app/006 — share for bids (frontend): a link suppliers open to bid, even off-platform */}
      <div className="mx-auto mt-7 max-w-[460px] overflow-hidden rounded-2xl bg-navy p-5 text-start text-white">
        <h3 className="text-[15px] font-extrabold">{L("Want bids from suppliers you already know?", "تبي عروضاً من مؤجرين تعرفهم؟")}</h3>
        <p className="mt-1 text-[12.5px]" style={{ color: "rgba(255,255,255,.72)" }}>
          {L("Share this bid link with any supplier — even off-platform. Their bids land with this request, ready to compare.", "شارك رابط العرض مع أي مؤجر — حتى خارج المنصة. تصلك عروضهم مع هذا الطلب جاهزة للمقارنة.")}
        </p>
        <div className="mt-3 flex gap-2">
          <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-lg px-3 font-mono text-[12px]" style={{ background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.2)" }}>
            <Icon name="link" size={15} className="flex-none opacity-70" />
            <span className="truncate">{shareUrl || "…"}</span>
          </div>
          <button onClick={copyLink} className={`inline-flex h-11 flex-none items-center gap-1.5 rounded-lg px-4 text-[13px] font-bold text-white ${copied ? "bg-ok" : "bg-brand"}`}>
            <Icon name={copied ? "check" : "content_copy"} size={16} />
            {copied ? L("Copied", "تم النسخ") : L("Copy", "نسخ")}
          </button>
        </div>
        <a href={shareUrl || "/supplier-bid-v2.html"} target="_blank" rel="noopener" className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-bold" style={{ color: "#FFC97A" }}>
          <Icon name="visibility" size={15} />
          {L("View the bid form suppliers see", "عرض نموذج العرض الذي يراه المؤجرون")}
        </a>
      </div>

      <div className="mt-[26px] flex justify-center gap-2.5">
        <Button onClick={() => actions.reset()}>
          <Icon name="add" size={18} /> {t.confirmation.newRequest}
        </Button>
        <Button variant="secondary" onClick={() => actions.reset()}>
          {t.confirmation.done}
        </Button>
      </div>
    </div>
  );
}
