"use client";

import { useState } from "react";
import type { BidCard } from "@/lib/contract/bids";
import { TermClassBadges } from "@/components/requests/TermClassBadges";
import { TermsPanel } from "@/components/requests/TermsPanel";
import { EquipImg } from "@/components/requests/EquipImg";

const nf = (n: number) => Math.round(n).toLocaleString("en-US");

/**
 * web-app/006 demo — an off-platform bid submitted through the renter's shared link (no account).
 * Distinct from a normal bid card: an orange "via shared link" strip, a flat quoted total (no
 * rate/period breakdown), and a "View bid submission" footer (read-only viewer) instead of negotiate
 * — there is no deal room for an off-platform supplier. Matches the 007 bids-by-supplier prototype.
 */
export function SharedLinkBidCard({
  bid,
  ar,
  L,
  isSel,
  onToggleSelect,
  onViewSubmission,
  itemLabel,
  itemImage,
  categoryId,
}: {
  bid: BidCard;
  ar: boolean;
  L: (en: string, arr: string) => string;
  isSel: boolean;
  onToggleSelect: () => void;
  onViewSubmission: () => void;
  itemLabel?: string | null;
  itemImage?: string | null;
  categoryId?: string | null;
}) {
  const [termsOpen, setTermsOpen] = useState(false);
  const units = bid.numberOfUnits || 1;
  const eq = bid.equipment;
  const eqLine = eq ? [eq.make, eq.model, eq.year].filter(Boolean).join(" · ") : null;
  const title = itemLabel || eqLine || L("Equipment", "المعدة");
  const ago =
    bid.agoDays === 1
      ? L("submitted 1 day ago", "قُدّم قبل يوم")
      : `${L("submitted", "قُدّم")} ${bid.agoDays ?? 2} ${L("days ago", "أيام مضت")}`;

  return (
    <div className={`bid bid-link${isSel ? " sel" : ""}`}>
      {/* off-platform / shared-link strip */}
      <div className="slb-strip">
        <span className="material-icons-outlined">link</span>
        {L("Submitted via your request shared link", "مُقدّم عبر رابط طلبك المشترك")}
      </div>

      <div className="slb-body">
        {/* header */}
        <div className="bid-head">
          <div className="bid-eq">
            <EquipImg src={itemImage ?? null} categoryId={categoryId ?? null} name={title} box="" img="h-7 w-7 object-contain" iconSize={24} />
          </div>
          <div className="bid-hh">
            <div className="r1">
              <span className="sname">{title}</span>
              {units > 1 && <span className="qty-badge">× {units}</span>}
            </div>
            <div className="bid-by">
              <span className="material-icons-outlined">storefront</span>{bid.supplierName}
              <span className="slb-pill"><span className="material-icons-outlined">link</span>{L("via shared link", "عبر الرابط")}</span>
            </div>
            <div className="slb-badges">
              {eqLine && <span className="slb-badge">{eqLine}</span>}
              {bid.heldCertCodes.includes("TUV") && <span className="slb-badge ok"><span className="material-icons-outlined">check</span>TÜV</span>}
              {bid.compliance.activityLicense && bid.compliance.taxNumber && (
                <span className="slb-badge"><span className="material-icons-outlined">badge</span>{L("CR + VAT captured", "السجل والضريبة مُلتقطان")}</span>
              )}
            </div>
          </div>
          <div className={`bid-check${isSel ? " on" : ""}`} onClick={onToggleSelect} title={L("Select to compare", "حدّد للمقارنة")}>
            <span className="material-icons-outlined">check</span>
          </div>
        </div>

        {/* terms match — tap to expand the per-term breakdown (no deal room to negotiate) */}
        <button
          type="button"
          className={`slb-row slb-terms tappable${termsOpen ? " open" : ""}`}
          aria-expanded={termsOpen}
          onClick={() => setTermsOpen((o) => !o)}
        >
          <span className="slb-lbl">{L("Terms match", "مطابقة الشروط")}</span>
          <TermClassBadges terms={bid.terms} ar={ar} />
          <span className="material-icons-outlined chev">expand_more</span>
        </button>
        {termsOpen && <TermsPanel terms={bid.terms} ar={ar} L={L} />}

        {/* quoted total — flat (incl VAT), not a rate breakdown */}
        <div className="slb-row">
          <div className="slb-left">
            <div className="slb-lbl">{L("Quoted total", "الإجمالي المُسعّر")}</div>
            <div className="slb-sub">{L("incl 15% VAT · per-item", "شامل ١٥٪ ضريبة · لكل صنف")}</div>
          </div>
          <div className="slb-total">{L("SAR", "ر.س")} {nf(bid.quotedTotal ?? 0)}</div>
        </div>

        {/* foot */}
        <div className="slb-foot-meta">
          <span className="slb-chip"><span className="material-icons-outlined">schedule</span>{ago}</span>
          <button type="button" className="slb-link" onClick={onViewSubmission}>
            {L("View bid & company", "عرض العرض والشركة")}<span className="material-icons-outlined">chevron_right</span>
          </button>
        </div>

        {/* view submission (read-only) — replaces the negotiate footer */}
        <button className="slb-view-btn" onClick={onViewSubmission}>
          <span className="material-icons-outlined">visibility</span>
          {L("View bid submission", "عرض العرض المُقدَّم")}
        </button>
        <p className="slb-offnote">{L("Off-platform supplier — no deal room. View their submitted bid.", "مؤجّر خارج المنصة — لا توجد غرفة صفقة. اعرض عرضه المُقدَّم.")}</p>
      </div>
    </div>
  );
}
