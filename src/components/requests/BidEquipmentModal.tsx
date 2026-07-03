"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale } from "@/lib/i18n";
import { CERT_LABEL, type BidCard, type CertCode } from "@/lib/contract/bids";
import { EquipImg } from "@/components/requests/EquipImg";
import type { EquipmentDetail } from "@/lib/contract/stores";
import type { DealRoomDocument } from "@/lib/contract/deal-room";
import { fetchBidDocuments } from "@/lib/api/client";

const periodOf = (u: string | null, ar: boolean) => {
  switch ((u ?? "PER_DAY").toUpperCase()) {
    case "PER_WEEK": return ar ? "أسبوع" : "week";
    case "PER_MONTH": return ar ? "شهر" : "month";
    case "PER_JOB": return ar ? "مهمة" : "job";
    default: return ar ? "يوم" : "day";
  }
};
const nf = (n: number) => Math.round(n).toLocaleString("en-US");

/**
 * Bid-card equipment modal (prototype "<equipment> details"): hero + facility-verified chip, a
 * supplier-provided-details disclaimer with the available quantity, a spec grid (distance,
 * measurement, units offered, fuel, year, rate), held certs/ownership, and a deal-room CTA.
 */
export function BidEquipmentModal({
  bid,
  busy,
  onRequestDetails,
  onClose,
  itemLabel,
}: {
  bid: BidCard;
  busy: boolean;
  onRequestDetails: () => void;
  onClose: () => void;
  /** Fallback title when the bid has no equipment record (off-platform link bids) — the request item name. */
  itemLabel?: string | null;
}) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const L = (en: string, arr: string) => (ar ? arr : en);
  const equipmentId = bid.equipment?.id ?? null;

  const [eq, setEq] = useState<EquipmentDetail | null>(null);
  // The supplier's equipment documents (presigned) — shown as openable rows, like the app's docs sheet.
  const [docs, setDocs] = useState<DealRoomDocument[]>([]);

  useEffect(() => {
    if (!equipmentId) return;
    const ctrl = new AbortController();
    fetch(`/api/equipment/${encodeURIComponent(equipmentId)}`, { cache: "no-store", signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: EquipmentDetail) => setEq(d))
      .catch(() => {});
    return () => ctrl.abort();
  }, [equipmentId]);

  useEffect(() => {
    // Off-platform (shared-link) bids have no real bid-documents endpoint — skip.
    if (bid.viaSharedLink || !bid.id) return;
    let active = true;
    fetchBidDocuments(bid.id)
      .then((d) => { if (active) setDocs(d.equipmentDocuments ?? []); })
      .catch(() => {});
    return () => { active = false; };
  }, [bid.id, bid.viaSharedLink]);

  const eqCerts: CertCode[] = bid.equipmentCertCodes ?? [];
  const ownership = bid.ownershipDocs ?? [];
  const certChips = [
    ...eqCerts.map((c) => (ar ? CERT_LABEL[c]?.ar : CERT_LABEL[c]?.en) || c),
    ...ownership.map((o) => (ar ? o.labelAr : o.labelEn)),
  ];
  const title = (ar ? eq?.categoryAr : eq?.category) || [bid.equipment?.make, bid.equipment?.model].filter(Boolean).join(" ") || itemLabel || "—";
  const subtitle = eq ? [eq.manufacturer, eq.modelName, eq.year != null ? String(eq.year) : null].filter(Boolean).join(" · ") : "";
  const measurement = eq ? (ar ? eq.measurementAr : eq.measurement) : null;
  const fuel = eq?.fuel ?? null;
  const km = bid.distanceKm != null ? Math.round(bid.distanceKm) : null;
  const offered = bid.unitsOffered || 1;
  const photo = useMemo(() => eq?.photos?.[0] ?? bid.equipment?.imageUrl ?? null, [eq, bid.equipment]);
  const verified = bid.eqVerified || eq?.isVerified;

  const tile = (label: string, value: React.ReactNode, accent = false) => (
    <div style={{ background: accent ? "#fff4e5" : "#F7FAFC", borderRadius: 12, padding: "11px 13px" }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".05em", color: "#6b8fa8" }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 900, color: accent ? "#f79009" : "#1c3550", marginTop: 4 }}>{value}</div>
    </div>
  );

  return (
    <div
      dir={ar ? "rtl" : "ltr"}
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(16,38,63,.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 440, maxHeight: "92vh", display: "flex", flexDirection: "column", background: "#fff", borderRadius: 20, overflow: "hidden", boxShadow: "0 24px 60px rgba(16,38,63,.35)" }}
      >
        {/* header strip */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 16px" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 800, color: "#1c3550" }}>
            {bid.supplierName}
            {bid.verified && <span className="material-icons-outlined" style={{ fontSize: 16, color: "#1daf58" }}>verified</span>}
          </span>
          <button onClick={onClose} aria-label={L("Close", "إغلاق")} style={{ width: 34, height: 34, borderRadius: 10, border: "none", background: "#eff4f9", color: "#6b8fa8", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span className="material-icons-outlined" style={{ fontSize: 19 }}>close</span>
          </button>
        </div>

        <div style={{ overflowY: "auto" }}>
          {/* hero */}
          <div style={{ position: "relative", height: 168, background: "linear-gradient(135deg,#F1F5FA,#E4EBF3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <EquipImg src={photo} categoryId={null} name={title} box="" img="h-20 w-20 object-contain" iconSize={64} />
            {certChips.length > 0 && (
              <div style={{ position: "absolute", bottom: 10, insetInlineStart: 14, display: "flex", gap: 6, flexWrap: "wrap" }}>
                {certChips.slice(0, 3).map((c, i) => (
                  <span key={i} style={{ fontSize: 11.5, fontWeight: 800, color: "#1daf58", background: "#e7f7ee", padding: "3px 9px", borderRadius: 20 }}>✓ {c}</span>
                ))}
              </div>
            )}
          </div>

          <div style={{ padding: "16px 18px 4px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <h2 style={{ fontSize: 20, fontWeight: 900, color: "#1c3550", margin: 0 }}>{title}</h2>
              {verified && <span className="material-icons-outlined" style={{ fontSize: 17, color: "#1daf58" }}>verified</span>}
            </div>
            {subtitle && <p style={{ fontSize: 13, color: "#6b8fa8", fontWeight: 600, margin: "5px 0 0" }}>{subtitle}</p>}
            {verified && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 10, fontSize: 12.5, fontWeight: 800, color: "#1a7ec8", background: "#e6f2fb", padding: "5px 11px", borderRadius: 20 }}>
                <span className="material-icons-outlined" style={{ fontSize: 15 }}>verified_user</span>{L("Facility verified", "منشأة موثّقة")}
              </span>
            )}

            {/* supplier-provided details disclaimer */}
            <div style={{ marginTop: 14, background: "#fff4e5", border: "1px solid #FDE4C4", borderRadius: 13, padding: "13px 14px" }}>
              <div style={{ display: "flex", gap: 9 }}>
                <span style={{ width: 22, height: 22, borderRadius: "50%", background: "#f79009", color: "#fff", fontSize: 13, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>i</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#d4780a" }}>{L("Supplier-provided details", "تفاصيل مُدخلة من المؤجّر")}</div>
                  <div style={{ fontSize: 12.5, color: "#B07A3A", fontWeight: 600, lineHeight: 1.5, marginTop: 3 }}>
                    {bid.viaSharedLink
                      ? L(
                          "The supplier acknowledged these in your shared-link form only — they haven’t been verified. Review the full submission before you rely on them.",
                          "أقرّ المؤجّر بهذه التفاصيل في نموذج الرابط فقط — ولم يتم التحقق منها. راجع العرض المُقدَّم كاملاً قبل الاعتماد عليها.",
                        )
                      : L(
                          "These specs were entered by the supplier and cover one representative unit — the rest of the available quantity may vary. You can confirm condition, certificates and ownership inside the deal room before you approve the bid.",
                          "أُدخلت هذه المواصفات من المؤجّر وتغطّي وحدة واحدة تمثيلية — وقد تختلف بقية الكمية المتاحة. يمكنك تأكيد الحالة والشهادات والملكية داخل غرفة الصفقة قبل اعتماد العرض.",
                        )}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 11, paddingTop: 11, borderTop: "1px solid #FBE0BE" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 700, color: "#d4780a" }}>
                  <span className="material-icons-outlined" style={{ fontSize: 16 }}>inventory_2</span>{L("Available quantity", "الكمية المتاحة")}
                </span>
                <span style={{ fontSize: 13.5, fontWeight: 900, color: "#1c3550" }}>{offered} {L(offered > 1 ? "units" : "unit", offered > 1 ? "وحدات" : "وحدة")}</span>
              </div>
            </div>

            {/* spec grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10, marginTop: 14 }}>
              {tile(L("DISTANCE", "المسافة"), km != null ? <>{km} <span style={{ fontSize: 12, fontWeight: 700, color: "#6b8fa8" }}>{L("km from project", "كم من المشروع")}</span></> : "—")}
              {tile(L("MEASUREMENT", "القياس"), measurement || "—")}
              {tile(L("QUANTITY OFFERED", "الكمية المعروضة"), `×${offered}`)}
              {tile(L("FUEL TYPE", "نوع الوقود"), fuel || "—")}
              {tile(L("YEAR", "السنة"), eq?.year != null ? String(eq.year) : bid.viaSharedLink && bid.reqMinYear != null ? `≥ ${bid.reqMinYear}` : "—")}
              {tile(L("RATE", "السعر"), <>{nf(bid.price ?? 0)} {L("SAR", "ر.س")} <span style={{ fontSize: 12, fontWeight: 700, color: "#C98A4B" }}>/ {periodOf(bid.priceUnit, ar)}</span></>, true)}
            </div>

            {/* Equipment documents (presigned) — openable rows, mirroring the app's documents sheet. */}
            {docs.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".05em", color: "#6b8fa8", marginBottom: 4 }}>{L("EQUIPMENT DOCUMENTS", "مستندات المعدة")}</div>
                {docs.map((d, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid #EFF2F6" }}>
                    <span className="material-icons-outlined" style={{ fontSize: 19, color: "#1daf58" }}>{d.fileType === "pdf" ? "picture_as_pdf" : "image"}</span>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: "#1c3550" }}>{(ar ? d.labelAr : d.label) || d.label}</span>
                    <a href={d.url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12.5, fontWeight: 800, color: "#1a7ec8", textDecoration: "none" }}>
                      <span className="material-icons-outlined" style={{ fontSize: 16 }}>visibility</span>{L("View", "عرض")}
                    </a>
                  </div>
                ))}
              </div>
            )}

            {/* Fallback: cert/ownership summary chips when no document files are on file. */}
            {docs.length === 0 && certChips.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".05em", color: "#6b8fa8", marginBottom: 8 }}>{L("CERTIFICATES & OWNERSHIP ON FILE", "الشهادات والملكية المتوفّرة")}</div>
                <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                  {certChips.map((c, i) => (
                    <span key={i} style={{ fontSize: 12.5, fontWeight: 800, color: "#1daf58", background: "#e7f7ee", padding: "4px 11px", borderRadius: 20 }}>✓ {c}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* footer CTA */}
        <div style={{ padding: "14px 18px", borderTop: "1px solid #EFF2F6" }}>
          <button
            onClick={onRequestDetails}
            disabled={busy}
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 9, padding: "14px", borderRadius: 14, border: "none", background: "#1c3550", color: "#fff", fontWeight: 800, fontSize: 15, cursor: busy ? "default" : "pointer", fontFamily: "inherit", opacity: busy ? 0.7 : 1 }}
          >
            <span className="material-icons-outlined" style={{ fontSize: 18 }}>{busy ? "progress_activity" : bid.viaSharedLink ? "visibility" : "forum"}</span>
            {bid.viaSharedLink ? L("View bid submission", "عرض العرض المُقدَّم") : L("Request more details", "اطلب مزيد من التفاصيل")}
          </button>
        </div>
      </div>
    </div>
  );
}
