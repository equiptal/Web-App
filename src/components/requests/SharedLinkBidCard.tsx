"use client";

import { useState } from "react";
import { bucketBidTerms, type BidCard } from "@/lib/contract/bids";
import { BidTermsModal } from "@/components/requests/BidTermsModal";
import { BidEquipmentModal } from "@/components/requests/BidEquipmentModal";
import { EquipImg } from "@/components/requests/EquipImg";

const nf = (n: number) => Math.round(n).toLocaleString("en-US");

/**
 * web-app/006 — an off-platform bid submitted through the renter's shared link (no account). Same
 * prototype card shell as an on-platform bid, but the status pill is replaced by an "off-platform"
 * link chip, the footer CTA opens the read-only submission viewer (no deal room to negotiate), and a
 * "submitted N days ago" line sits above it. Selection works in the parent's select mode.
 */
export function SharedLinkBidCard({
  bid,
  ar,
  L,
  isSel,
  selectMode,
  cardFlex,
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
  /** Grouped My-Bids select flow: true = picking (whole-card select), false = resting. Omit for the
   *  legacy single-request view, which keeps an always-visible checkbox + the full card. */
  selectMode?: boolean;
  /** Card flex (count-dynamic width) from the parent; defaults to the fixed peek width. */
  cardFlex?: string;
  onToggleSelect: () => void;
  onViewSubmission: () => void;
  itemLabel?: string | null;
  itemImage?: string | null;
  categoryId?: string | null;
}) {
  const [priceOpen, setPriceOpen] = useState(false);
  const [perUnit, setPerUnit] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [equipOpen, setEquipOpen] = useState(false); // equipment-detail modal (year/cert + self-declared note)
  const picking = selectMode === true; // grouped select flow: whole-card select, hide actions
  const legacy = selectMode === undefined; // single-request view: always-on checkbox + full card

  const periodOf = (u: string | null) => {
    switch ((u ?? "PER_DAY").toUpperCase()) {
      case "PER_WEEK": return L("week", "أسبوع");
      case "PER_MONTH": return L("month", "شهر");
      case "PER_JOB": return L("job", "مهمة");
      default: return L("day", "يوم");
    }
  };

  const offered = bid.unitsOffered || 1;
  const needed = bid.numberOfUnits || offered;
  const cover = needed ? Math.min(100, Math.round((offered / needed) * 100)) : 0;
  const u = priceOpen && perUnit ? 1 : offered;
  const rental = (bid.price ?? 0) * u;
  // Mob/demob are priced PER UNIT in the shared-link form (× qty), so the total scales with the unit
  // count shown — × offered for the "all units" view, × 1 for "per unit" (mirrors the rental line + form).
  const deliv = bid.mobPrice ? bid.mobPrice * u : 0;
  const ret = bid.demobPrice ? bid.demobPrice * u : 0;
  const sub = rental + deliv + ret;
  const vat = Math.round(sub * 0.15);
  const grand = bid.quotedTotal && !perUnit ? bid.quotedTotal : sub + vat;

  const eq = bid.equipment;
  const eqLine = eq ? [eq.make, eq.model, eq.year].filter(Boolean).join(" · ") : null;
  const title = itemLabel || eqLine || L("Equipment", "المعدة");
  const agoShort = bid.agoDays === 1 ? L("1 day ago", "قبل يوم") : `${bid.agoDays ?? 2} ${L("days ago", "أيام مضت")}`;
  // Supplier's quote expiry ("Valid until") — surfaced as a chip so the renter sees how long the price holds.
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(ar ? "ar-SA" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
  const validUntil = bid.validUntil ?? null;
  const daysLeft = validUntil ? Math.ceil((new Date(validUntil).getTime() - Date.now()) / 86400000) : null;
  const expired = daysLeft != null && daysLeft < 0;
  const soon = daysLeft != null && daysLeft >= 0 && daysLeft <= 3;
  const validTone = expired ? { c: "#d9362a", bg: "#fcebea" } : soon ? { c: "#d4780a", bg: "#fff3e0" } : { c: "#1a7ec8", bg: "#e6f2fb" };

  // App parity: the SAME shared tally the on-platform card + the Terms modal use (bucketBidTerms), so the
  // off-platform card count always equals the modal. Off-platform has no deal room → no "Pending review"
  // chip on the card (mirrors the terms modal's hidePending); Conflict / Matched only.
  const termTally = bucketBidTerms(bid.terms, bid.negotiableTerms).counts;
  const termChips = [
    { label: L("Conflict", "تعارض"), n: termTally.conflict, c: "#d9362a" },
    { label: L("Matched", "مطابق"), n: termTally.matched, c: "#1daf58" },
  ];

  const rowSep = { borderTop: "1px solid #EFF2F6" } as const;
  const iconBox = { width: 40, height: 40, borderRadius: 11, background: "#eff4f9", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 } as const;
  const blueLink = { background: "none", border: "none", color: "#1a7ec8", fontWeight: 800, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit" } as const;

  return (
    <div
      onClick={picking ? onToggleSelect : undefined}
      style={{ flex: cardFlex ?? "0 0 calc(44% - 8px)", minWidth: 320, scrollSnapAlign: "start", alignSelf: "flex-start", display: "flex", flexDirection: "column", position: "relative", background: "#fff", border: `1px solid ${isSel ? "#f79009" : "#d4e0ec"}`, borderRadius: 18, overflow: "hidden", boxShadow: "0 1px 2px rgba(20,40,70,.04)", outline: isSel ? "2px solid #f79009" : "none", outlineOffset: 2, cursor: picking ? "pointer" : "default" }}
    >
      <div style={{ height: 4, background: "#d4780a" }} />
      {/* off-platform banner — replaces a status pill + the old "submitted" footer line */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 14px", background: "#fff4e5", borderBottom: "1px solid #f7e4c6" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 11.5, fontWeight: 800, color: "#d4780a", minWidth: 0 }}>
          <span className="material-icons-outlined" style={{ fontSize: 15, flexShrink: 0 }}>link</span>
          <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{L("Off-platform · via your request link", "خارج المنصة · عبر رابط طلبك")}</span>
        </span>
        {/* Valid-until sits UP here next to "N days ago" so it doesn't add a line to the card body. */}
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexShrink: 0, whiteSpace: "nowrap" }}>
          {validUntil && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 800, color: validTone.c, background: validTone.bg, padding: "2px 8px", borderRadius: 20 }}>
              <span className="material-icons-outlined" style={{ fontSize: 12 }}>{expired ? "event_busy" : "schedule"}</span>
              {expired ? L("Expired", "منتهٍ") : L(`Valid until ${fmtDate(validUntil)}`, `صالح حتى ${fmtDate(validUntil)}`)}
            </span>
          )}
          <span style={{ fontSize: 12, fontWeight: 700, color: "#b07a3a" }}>{agoShort}</span>
        </span>
      </div>
      {(picking || legacy) && (
        <div
          onClick={legacy ? (e) => { e.stopPropagation(); onToggleSelect(); } : undefined}
          title={legacy ? L("Select for quotation", "حدّد لعرض السعر") : undefined}
          style={{ position: "absolute", top: 12, insetInlineEnd: 12, width: 26, height: 26, borderRadius: "50%", background: isSel ? "#f79009" : "#fff", border: `2px solid ${isSel ? "#f79009" : "#d4e0ec"}`, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 4px rgba(20,40,70,.18)", zIndex: 5, cursor: legacy ? "pointer" : "default", pointerEvents: legacy ? "auto" : "none" }}
        >
          {isSel && <span className="material-icons-outlined" style={{ fontSize: 16 }}>check</span>}
        </div>
      )}

      {/* header */}
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "16px 16px 12px" }}>
        <div style={{ width: 56, height: 56, borderRadius: 14, background: "#eff4f9", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <EquipImg src={itemImage ?? null} categoryId={categoryId ?? null} name={title} box="" img="h-10 w-10 object-contain" iconSize={36} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, minWidth: 0 }}>
            <span style={{ flex: "0 1 auto", minWidth: 0, fontSize: 13.5, fontWeight: 900, color: "#1c3550", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", lineHeight: 1.25 }} title={title}>{title}</span>
            <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 800, color: "#d4780a", background: "#fff3e0", padding: "1px 8px", borderRadius: 20 }}>×{offered}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 6 }}>
            <span style={{ width: 22, height: 22, borderRadius: "50%", background: "#1c3550", color: "#fff", fontSize: 11, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{(bid.supplierName || "S").charAt(0).toUpperCase()}</span>
            <span style={{ fontSize: 12.5, fontWeight: 800, color: "#1c3550" }}>{bid.supplierName}</span>
            {bid.verified && <span className="material-icons-outlined" style={{ fontSize: 16, color: "#1daf58" }}>verified</span>}
          </div>
        </div>
      </div>

      {/* fulfillment band */}
      <div style={{ margin: "0 16px 14px", padding: "10px 14px", borderRadius: 12, background: "#fff4e5", display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: "#1c3550", whiteSpace: "nowrap" }}>{L(`Covers ${offered} of ${needed} units`, `يغطّي ${offered} من ${needed} وحدات`)}</span>
        <div style={{ flex: 1, height: 8, borderRadius: 6, background: "rgba(247,144,9,.18)", overflow: "hidden" }}>
          <div style={{ height: "100%", borderRadius: 6, background: "#f79009", width: `${cover}%` }} />
        </div>
        {bid.distanceKm != null && <span style={{ fontSize: 12, color: "#6b8fa8", fontWeight: 700, whiteSpace: "nowrap" }}>{Math.round(bid.distanceKm)} km</span>}
      </div>

      {/* Equipment row */}
      <div style={{ ...rowSep, display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", position: "relative" }}>
        <div style={iconBox}>
          <EquipImg src={itemImage ?? null} categoryId={categoryId ?? null} name={title} box="" img="h-5 w-5 object-contain" iconSize={20} />
        </div>
        <span style={{ fontSize: 13, fontWeight: 800, color: "#1c3550" }}>{L("Equipment", "المعدة")}</span>
        {/* No cert/term chips on the card — all equipment detail lives in the Details modal only. */}
        <div style={{ flex: 1 }} />
        {!picking && <button onClick={() => setEquipOpen(true)} style={blueLink}>{L("Details", "التفاصيل")} ›</button>}
      </div>

      {/* Terms row */}
      <div style={{ ...rowSep, display: "flex", alignItems: "center", gap: 12, padding: "13px 16px" }}>
        <div style={iconBox}><span className="material-icons-outlined" style={{ fontSize: 20, color: "#6b8fa8" }}>description</span></div>
        <span style={{ fontSize: 13, fontWeight: 800, color: "#1c3550" }}>{L("Terms", "الشروط")}</span>
        <div style={{ display: "flex", gap: 4, flexWrap: "nowrap", flex: 1, minWidth: 0, overflowX: "auto" }} className="no-sb">
          {termChips.map((t) => (
            <span key={t.label} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 800, color: t.n > 0 ? t.c : "#9AA7B8", whiteSpace: "nowrap" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: t.n > 0 ? t.c : "#c3d2e0" }} />{t.label} {t.n}
            </span>
          ))}
        </div>
        {!picking && <button onClick={() => setTermsOpen(true)} style={blueLink}>{L("View", "عرض")} ›</button>}
      </div>

      {/* Rate row */}
      <div style={{ ...rowSep, padding: "13px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ ...iconBox, background: "#fff4e5" }}><span className="material-icons-outlined" style={{ fontSize: 20, color: "#f79009" }}>payments</span></div>
          <span style={{ fontSize: 13, fontWeight: 800, color: "#1c3550" }}>{L("Rate", "السعر")}</span>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 17, fontWeight: 900, color: "#f79009" }}>{nf(bid.price ?? 0)} {L("SAR", "ر.س")}</span>
          <span style={{ fontSize: 13, color: "#6b8fa8", fontWeight: 700 }}>/ {periodOf(bid.priceUnit)}</span>
          {!picking && (
            <button onClick={() => { setPriceOpen((o) => !o); setPerUnit(false); }} style={{ width: 32, height: 32, borderRadius: "50%", border: "1px solid #d4e0ec", background: "#F7FAFC", color: "#6b8fa8", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span className="material-icons-outlined" style={{ fontSize: 18 }}>{priceOpen ? "expand_less" : "expand_more"}</span>
            </button>
          )}
        </div>
        {priceOpen && !picking && (
          <div style={{ marginTop: 12 }}>
            {offered > 1 && (
              <div style={{ display: "inline-flex", background: "#eff4f9", borderRadius: 10, padding: 3, marginBottom: 12 }}>
                {([[false, L(`All ${offered} units`, `كل ${offered} وحدات`)], [true, L("Per unit", "لكل وحدة")]] as [boolean, string][]).map(([v, lab]) => (
                  <button key={String(v)} onClick={() => setPerUnit(v)} style={{ padding: "6px 13px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 800, fontSize: 12.5, fontFamily: "inherit", background: perUnit === v ? "#1c3550" : "transparent", color: perUnit === v ? "#fff" : "#6b8fa8" }}>{lab}</button>
                ))}
              </div>
            )}
            {([
              [L(`Rental (${nf(bid.price ?? 0)}/${periodOf(bid.priceUnit)} × ${u} unit${u > 1 ? "s" : ""})`, `الإيجار (${nf(bid.price ?? 0)}/${periodOf(bid.priceUnit)} × ${u})`), rental],
              ...(deliv ? [[L(`Delivery to site (${nf(bid.mobPrice ?? 0)} × ${u} unit${u > 1 ? "s" : ""})`, `النقل إلى الموقع (${nf(bid.mobPrice ?? 0)} × ${u})`), deliv]] as [string, number][] : []),
              ...(ret ? [[L(`Return from site (${nf(bid.demobPrice ?? 0)} × ${u} unit${u > 1 ? "s" : ""})`, `الإرجاع من الموقع (${nf(bid.demobPrice ?? 0)} × ${u})`), ret]] as [string, number][] : []),
              [L("Subtotal before VAT", "المجموع قبل الضريبة"), sub],
              [L("VAT (15%)", "ضريبة القيمة المضافة (١٥٪)"), vat],
            ] as [string, number][]).map(([lab, val], i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 0", borderBottom: "1px solid #F2F5F8" }}>
                <span style={{ fontSize: 13.5, color: "#2a4f72", fontWeight: 600 }}>{lab}</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: "#1c3550", fontVariantNumeric: "tabular-nums" }}>{nf(val)}</span>
              </div>
            ))}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12, padding: "12px 14px", borderRadius: 12, background: "#fff4e5" }}>
              <span style={{ fontSize: 12.5, fontWeight: 800, color: "#1c3550" }}>{L("Quoted total", "الإجمالي المُسعّر")}</span>
              <span style={{ fontSize: 16, fontWeight: 900, color: "#f79009" }}>{nf(grand)} {L("SAR", "ر.س")}</span>
            </div>
          </div>
        )}
      </div>

      {/* CTA — read-only submission viewer (no deal room for an off-platform supplier) */}
      {!picking && (
        <div style={{ marginTop: "auto", padding: "12px 16px 16px" }}>
          <button onClick={onViewSubmission} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 9, padding: "14px", borderRadius: 14, border: "none", background: "#1c3550", color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>
            <span className="material-icons-outlined" style={{ fontSize: 18 }}>visibility</span>{L("View bid submission", "عرض العرض المُقدَّم")}
          </button>
          <p style={{ fontSize: 11.5, color: "#9AA7B8", fontWeight: 600, textAlign: "center", margin: "9px 0 0" }}>
            {L("Off-platform supplier — no deal room. View their submitted bid.", "مؤجّر خارج المنصة — لا توجد غرفة صفقة. اعرض عرضه المُقدَّم.")}
          </p>
        </div>
      )}

      {termsOpen && (
        <BidTermsModal
          supplier={bid.supplierName}
          terms={bid.terms}
          negotiable={bid.negotiableTerms}
          ar={ar}
          L={L}
          busy={false}
          hidePending  /* off-platform: no deal room → no "Pending review" state */
          negotiateLabel={L("View bid submission", "عرض العرض المُقدَّم")}
          onNegotiate={() => { setTermsOpen(false); onViewSubmission(); }}
          onClose={() => setTermsOpen(false)}
        />
      )}
      {equipOpen && (
        <BidEquipmentModal
          bid={bid}
          busy={false}
          itemLabel={title}
          onRequestDetails={() => { setEquipOpen(false); onViewSubmission(); }}
          onClose={() => setEquipOpen(false)}
        />
      )}
    </div>
  );
}
