import { CERT_LABEL, type BidCard, type CertCode } from "@/lib/contract/bids";

type LFn = (en: string, ar: string) => string;

/**
 * Deal-room status banner shown at the TOP of a bid card (app parity). Maps the server `uiState`
 * (your-turn / waiting / new / fresh) + lifecycle status to a single colored strip telling the
 * renter where the negotiation stands and whose move it is — e.g. "New offer", "Your response
 * needed", "Awaiting supplier's response". The agreed-terms meter is shown when a room is open.
 */
function banner(b: BidCard, L: LFn): { cls: string; icon: string; text: string } | null {
  if (b.status === "EXPIRED" || b.status === "WITHDRAWN" || b.expired) return null;
  if (b.status === "ACCEPTED") return { cls: "drb-accepted", icon: "verified", text: L("Deal accepted", "تم قبول الصفقة") };
  if (b.uiState === "your-turn" || b.status === "COUNTER_OFFERED")
    return { cls: "drb-action", icon: "priority_high", text: L("Your response needed", "مطلوب ردّك") };
  if (b.uiState === "waiting") return { cls: "drb-wait", icon: "schedule", text: L("Awaiting supplier’s response", "بانتظار ردّ المؤجّر") };
  if (b.uiState === "fresh") return { cls: "drb-fresh", icon: "bolt", text: L("Updated offer", "عرض مُحدَّث") };
  if (b.uiState === "new" || (b.status === "PENDING" && !b.dealRoomId)) return { cls: "drb-new", icon: "fiber_new", text: L("New offer", "عرض جديد") };
  return { cls: "drb-open", icon: "forum", text: L("In negotiation", "قيد التفاوض") };
}

export function DealRoomBanner({ bid, ar }: { bid: BidCard; ar: boolean }) {
  const L: LFn = (en, arr) => (ar ? arr : en);
  const bn = banner(bid, L);
  if (!bn) return null;
  // The agreed-terms meter only makes sense during a live negotiation. Once the deal is accepted the
  // banner says so on its own; showing a raw agreed/total (which seeded/force-accepted data can leave
  // at 0/total) is misleading, so suppress it there.
  const showMeter = bn.cls !== "drb-accepted" && bid.progress.total > 0;
  const meter = showMeter ? `${bid.progress.agreed}/${bid.progress.total} ${L("terms agreed", "شروط متّفق عليها")}` : null;
  return (
    <div className={`dr-banner ${bn.cls}`}>
      <span className="material-icons-outlined">{bn.icon}</span>
      <span className="drb-text">{bn.text}</span>
      {meter && <span className="drb-meter">{meter}</span>}
    </div>
  );
}

/**
 * COMPANY documents on file (Level 1 — supplier verification), shown beside the supplier/company name:
 * Commercial registration / VAT / National address + Local Content + SASO registration. These are
 * company-level docs; equipment certs/ownership are shown separately by `EquipmentDocs`. Renders
 * nothing when the supplier has none on file.
 */
export function SupplierDocs({
  compliance,
  companyCerts,
  ar,
}: {
  compliance: BidCard["compliance"];
  companyCerts: CertCode[];
  ar: boolean;
}) {
  const L: LFn = (en, arr) => (ar ? arr : en);
  const docs: string[] = [
    compliance.activityLicense && L("CR", "السجل التجاري"),
    compliance.taxNumber && L("VAT", "الرقم الضريبي"),
    compliance.nationalAddress && L("National address", "العنوان الوطني"),
    companyCerts.includes("LC") && L("Local content", "المحتوى المحلي"),
    companyCerts.includes("SASO") && L("SASO registration", "تسجيل ساسو"),
  ].filter(Boolean) as string[];
  if (docs.length === 0) return null;
  return (
    <div className="sup-docs">
      <span className="sd-lab">{L("Company docs", "وثائق الشركة")}</span>
      {docs.map((d) => (
        <span key={d} className="sd-chip">
          <span className="material-icons-outlined">check</span>
          {d}
        </span>
      ))}
    </div>
  );
}

/**
 * EQUIPMENT certificates + proof-of-ownership docs (Level 2) the listing carries: safety certs
 * (TÜV / SPSP / SASO) and ownership docs (istimara / customs / sale contract / SASO registration).
 * Shown beside the equipment row on the card and inside the equipment-details modal. Renders nothing
 * when the listing carries none.
 */
export function EquipmentDocs({
  equipmentCerts,
  ownershipDocs,
  ar,
  showLabel = true,
}: {
  equipmentCerts: CertCode[];
  ownershipDocs: BidCard["ownershipDocs"];
  ar: boolean;
  showLabel?: boolean;
}) {
  const L: LFn = (en, arr) => (ar ? arr : en);
  const items: string[] = [
    ...equipmentCerts.map((c) => (ar ? CERT_LABEL[c].ar : CERT_LABEL[c].en)),
    ...(ownershipDocs ?? []).map((o) => (ar ? o.labelAr : o.labelEn)),
  ];
  if (items.length === 0) return null;
  return (
    <div className="sup-docs">
      {showLabel && <span className="sd-lab">{L("On file", "متوفّر")}</span>}
      {items.map((d) => (
        <span key={d} className="sd-chip">
          <span className="material-icons-outlined">check</span>
          {d}
        </span>
      ))}
    </div>
  );
}
