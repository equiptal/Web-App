"use client";

import { useEffect, useState } from "react";
import { useT, fmt, useLocale } from "@/lib/i18n";
import { useRfq } from "@/lib/store/rfq-store";
import { Button, Icon } from "@/components/ui";
import { postableItems } from "@/lib/contract";
import { fetchRequestSubmissions, bidShareUrl, setBidDeadline, setShareLinkLogo } from "@/lib/api/client";
import { ShareForBidsSheet } from "@/components/requests/ShareForBidsSheet";

/** AC-42: web confirmation. web-app/006 — the navy invite card (View form · Share your request for bids)
 *  with a "how it works" 1·2·3 strip; the Share button opens the SAME ShareForBidsSheet used in the
 *  request header, so sharing + the deadline behave identically in both paths. Refined, lighter type. */
export function Confirmation() {
  const t = useT();
  const { locale } = useLocale();
  const ar = locale === "ar";
  const L = (e: string, a: string) => (ar ? a : e);
  const { state, actions } = useRfq();
  const draft = state.draft;
  const count = draft ? postableItems(draft.items).length : 0;

  const reqId = state.requestIds[0] ?? ""; // short code — display only
  const reqUuid = state.requestUuids[0] ?? reqId; // the bid link + deadline resolve by UUID
  const [origin, setOrigin] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [renterName, setRenterName] = useState<string | null>(null);
  const [deadline, setDeadline] = useState<string | null>(null);
  const [logo, setLogo] = useState<string | null>(null);
  useEffect(() => { if (typeof window !== "undefined") setOrigin(window.location.origin); }, []);
  useEffect(() => {
    if (!reqUuid) return;
    let alive = true;
    fetchRequestSubmissions(reqUuid).then((r) => { if (alive) { setRenterName(r.renterName); setDeadline(r.bidDeadline); setLogo(r.logoUrl); } }).catch(() => {});
    return () => { alive = false; };
  }, [reqUuid]);

  const shareUrl = origin && reqUuid ? bidShareUrl(origin, reqUuid, renterName) : "";
  const formUrl = shareUrl || `${origin}/supplier-bid-v2.html?preview=1`;
  const saveDeadline = (iso: string | null) => {
    if (!reqUuid) return;
    setBidDeadline(reqUuid, iso).then(() => setDeadline(iso)).catch(() => {});
  };
  const saveLogo = (url: string | null) => {
    if (!reqUuid) return;
    setShareLinkLogo(reqUuid, url).then(() => setLogo(url)).catch(() => {});
  };

  const steps: [string, string][] = [
    [L("Share the link", "شارِك الرابط"), ""],
    [L("Suppliers send bids", "يقدّم المؤجّرون عروضهم"), ""],
    [L("You view & compare bids here", "تعرض العروض وتقارنها هنا"), "cmp"],
  ];

  return (
    <div className="mx-auto max-w-xl px-5 pb-10 pt-9 text-center">
      {/* success — one calm anchor */}
      <div className="mb-6 inline-flex items-center gap-2.5">
        <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-ok-soft text-ok"><Icon name="check" size={21} /></span>
        <h2 className="text-[21px] font-bold tracking-tight">{t.confirmation.title}</h2>
        {count > 0 && <span className="text-sm font-medium text-muted">· {fmt(t.confirmation.itemsSummary, { count })}</span>}
      </div>

      {/* navy invite card (original shape) + how-it-works */}
      <div className="overflow-hidden rounded-2xl bg-navy p-6 text-start text-white">
        <h3 className="text-[18px] font-bold tracking-tight">{L("Want bids from suppliers you already know?", "تريد عروضاً من مؤجّرين تعرفهم؟")}</h3>
        <p className="mt-2 text-[13.5px] font-normal leading-relaxed" style={{ color: "rgba(255,255,255,.7)" }}>
          {L("Share a bid link with any supplier — even off-platform. Their bids land with this request, so you can view and compare them side by side.", "شارك رابط تقديم عرض مع أي مؤجّر — حتى خارج المنصة. تصلك عروضهم مع هذا الطلب، فتعرضها وتقارنها جنباً إلى جنب.")}
        </p>

        <div className="mt-5 flex flex-wrap gap-2.5">
          <a href={formUrl} target="_blank" rel="noopener" className="inline-flex items-center justify-center gap-2 rounded-[11px] px-4 py-3 text-[14px] font-semibold text-white" style={{ background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.2)" }}>
            <Icon name="visibility" size={18} />{L("View the bid form", "عرض نموذج العرض")}
          </a>
          <button onClick={() => setShareOpen(true)} className="inline-flex flex-1 items-center justify-center gap-2 rounded-[11px] bg-brand px-4 py-3 text-[14px] font-semibold text-white" style={{ minWidth: 210 }}>
            <Icon name="ios_share" size={18} />{L("Share your request for bids", "شارك طلبك لتلقّي العروض")}
          </button>
        </div>

        {/* how it works — quiet label, medium steps, step 3 highlighted */}
        <div className="mt-6 border-t pt-5" style={{ borderColor: "rgba(255,255,255,.12)" }}>
          <div className="mb-3.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "rgba(248,198,107,.9)" }}>{L("How it works", "كيف تعمل")}</div>
          <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-2.5 sm:gap-y-2.5">
            {steps.map(([label, cmp], i) => (
              <span key={i} className="inline-flex items-center gap-2">
                {i > 0 && <span className="hidden flex-none sm:inline-flex" style={{ color: "rgba(255,255,255,.35)", transform: ar ? "scaleX(-1)" : undefined }}><Icon name="arrow_forward" size={15} /></span>}
                <span className="grid h-6 w-6 flex-none place-items-center rounded-full text-[11px]" style={cmp ? { background: "#F8C66B", color: "#13283D", fontWeight: 700 } : { background: "rgba(255,255,255,.1)", border: "1px solid rgba(248,198,107,.55)", color: "#F8C66B", fontWeight: 600 }}>{i + 1}</span>
                <span className="text-[12px] leading-snug" style={cmp ? { color: "#fff", fontWeight: 600 } : { color: "rgba(255,255,255,.9)", fontWeight: 500 }}>{label}</span>
              </span>
            ))}
          </div>
        </div>

        <div className="mt-5 flex items-start gap-2 text-[12.5px] font-normal leading-snug" style={{ color: "rgba(255,255,255,.58)" }}>
          <span className="mt-px flex-none" style={{ color: "#F8C66B" }}><Icon name="schedule" size={15} /></span>
          {L("Come back anytime to share the link again or set a deadline for bids.", "ارجع في أي وقت لمشاركة الرابط مرة أخرى أو تحديد موعد نهائي للعروض.")}
        </div>
      </div>

      {/* secondary actions */}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
        <Button onClick={() => actions.reset()}>
          <Icon name="add" size={18} /> {t.confirmation.newRequest}
        </Button>
        <Button variant="secondary" onClick={() => actions.reset()}>{t.confirmation.done}</Button>
      </div>

      <ShareForBidsSheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        shareUrl={shareUrl}
        formUrl={formUrl}
        renterName={renterName}
        deadline={deadline}
        onSaveDeadline={saveDeadline}
        logoUrl={logo}
        onSaveLogo={saveLogo}
        ar={ar}
        L={L}
      />
    </div>
  );
}
