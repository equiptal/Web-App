"use client";

import { useEffect } from "react";
import type { BidCard } from "@/lib/contract/bids";

/**
 * web-app/006 demo — read-only viewer of an off-platform bid submitted through the renter's shared
 * link. Embeds the public supplier bid form (supplier-bid-v2.html) in preview/read-only mode, framed
 * as "exactly what the supplier submitted". No deal room — the supplier has no account.
 *
 * Staging-only: the iframe target (public/supplier-bid-v2.html) ships on staging but not prod, and
 * this modal only ever opens from a viaSharedLink mock bid (see lib/mock/shared-link-bids).
 */
export function SharedBidSubmissionModal({
  bid,
  ar,
  L,
  onClose,
  onAddToCompare,
}: {
  bid: BidCard;
  ar: boolean;
  L: (en: string, arr: string) => string;
  onClose: () => void;
  onAddToCompare?: () => void;
}) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const src = `/supplier-bid-v2.html?preview=1&supplier=${encodeURIComponent(bid.submissionKey ?? "alnajm")}&lang=${ar ? "ar" : "en"}`;

  return (
    <div className="slb-overlay" dir={ar ? "rtl" : "ltr"} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="slb-modal" role="dialog" aria-modal="true">
        <div className="slb-head">
          <span className="slb-head-ic"><span className="material-icons-outlined">link</span></span>
          <div className="slb-head-tx">
            <h3>{bid.supplierName}</h3>
            <p>{L("Off-platform · submitted via your shared link · read-only", "خارج المنصة · مُقدَّم عبر رابطك المشترك · للقراءة فقط")}</p>
          </div>
          <button className="slb-head-x" onClick={onClose} aria-label={L("Close", "إغلاق")}>
            <span className="material-icons-outlined">close</span>
          </button>
        </div>
        <div className="slb-banner">
          <span className="material-icons-outlined">visibility</span>
          {L("Submitted bid — exactly what the supplier submitted", "العرض المُقدَّم — تمامًا كما أرسله المؤجّر")}
        </div>
        <iframe className="slb-frame" src={src} title={L("Submitted bid", "العرض المُقدَّم")} />
        <div className="slb-foot">
          <button className="btn sm" onClick={onClose}>{L("Close", "إغلاق")}</button>
          <span className="slb-foot-sp" />
          {onAddToCompare && (
            <button className="slb-add" onClick={() => { onAddToCompare(); onClose(); }}>
              <span className="material-icons-outlined">balance</span>
              {L("Add to comparison", "أضف للمقارنة")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
