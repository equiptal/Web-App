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
 * Supplier credentials on the card face — what the supplier actually has on file: identity documents
 * (Commercial registration / VAT / National address) plus the safety certificates they hold
 * (TÜV / SASO / SPSP / Local content). Certs already shown as required-vs-held pills are excluded to
 * avoid duplication. Renders nothing when there's nothing on file (so a sparse supplier shows no
 * false credentials). The identity docs depend on the backend exposing the doc keys.
 */
export function SupplierDocs({
  compliance,
  heldCerts,
  requiredCerts,
  ar,
}: {
  compliance: BidCard["compliance"];
  heldCerts: CertCode[];
  requiredCerts: CertCode[];
  ar: boolean;
}) {
  const L: LFn = (en, arr) => (ar ? arr : en);
  const reqSet = new Set(requiredCerts);
  const docs: string[] = [
    compliance.activityLicense && L("CR", "السجل التجاري"),
    compliance.taxNumber && L("VAT", "الرقم الضريبي"),
    compliance.nationalAddress && L("National address", "العنوان الوطني"),
    ...heldCerts.filter((c) => !reqSet.has(c)).map((c) => (ar ? CERT_LABEL[c].ar : CERT_LABEL[c].en)),
  ].filter(Boolean) as string[];
  if (docs.length === 0) return null;
  return (
    <div className="sup-docs">
      <span className="sd-lab">{L("On file", "موثّق")}</span>
      {docs.map((d) => (
        <span key={d} className="sd-chip">
          <span className="material-icons-outlined">check</span>
          {d}
        </span>
      ))}
    </div>
  );
}
