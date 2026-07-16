"use client";

import { useEffect } from "react";
import type { BidReadiness, ReadinessBand, ReadinessCert, UnitReadiness } from "@/lib/contract/bid-readiness";

/**
 * Bid-readiness renter surface (read-only auditor). A compact badge for the bid card + a full eligibility
 * view listing each offered unit's photos and requested equipment/operator certs (present = green, tappable
 * to open the presigned doc; missing = red), plus a below-min-year callout. Nothing mutates — the renter
 * cannot upload or act; that's supplier-only in the app. Bilingual EN/AR + RTL.
 */

type LFn = (en: string, ar: string) => string;

const BAND: Record<ReadinessBand, { c: string; bg: string; bd: string }> = {
  green: { c: "#1daf58", bg: "#e7f7ee", bd: "rgba(29,175,88,.32)" },
  yellow: { c: "#d4780a", bg: "#fff3e0", bd: "rgba(212,120,10,.32)" },
  red: { c: "#d9362a", bg: "#fcebea", bd: "rgba(217,54,42,.32)" },
};

const allReady = (r: BidReadiness) => r.band === "green" && r.readyCount >= r.committed && r.units.every((u) => !u.yearConflict);

/** Compact readiness pill for the bid card. Click opens the eligibility view. */
export function BidReadinessBadge({ r, L, onClick }: { r: BidReadiness; L: LFn; onClick?: () => void }) {
  const ready = allReady(r);
  const c = BAND[ready ? "green" : r.band];
  const label = ready
    ? L(`Ready ${r.committed}/${r.committed}`, `جاهز ${r.committed}/${r.committed}`)
    : L(`${r.percent}% ready · ${r.readyCount}/${r.committed}`, `${r.percent}% جاهز · ${r.readyCount}/${r.committed}`);
  return (
    <button
      type="button"
      onClick={onClick}
      title={L("View equipment eligibility", "عرض جاهزية المعدات")}
      style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 20, border: `1px solid ${c.bd}`, background: c.bg, color: c.c, fontSize: 11.5, fontWeight: 800, cursor: onClick ? "pointer" : "default", fontFamily: "inherit", whiteSpace: "nowrap" }}
    >
      <span className="material-icons-outlined" style={{ fontSize: 14 }}>{ready ? "verified" : "fact_check"}</span>
      {label}
    </button>
  );
}

function Bar({ percent, band }: { percent: number; band: ReadinessBand }) {
  return (
    <div style={{ height: 7, borderRadius: 6, background: "#eef2f6", overflow: "hidden", flex: 1, minWidth: 80 }}>
      <div style={{ height: "100%", width: `${Math.max(4, percent)}%`, background: BAND[band].c, borderRadius: 6 }} />
    </div>
  );
}

function CertChip({ cert, L }: { cert: ReadinessCert; ar?: boolean; L: LFn }) {
  const label = L(cert.labelEn, cert.labelAr);
  const tone = cert.present ? BAND.green : BAND.red;
  const inner = (
    <>
      <span className="material-icons-outlined" style={{ fontSize: 14 }}>{cert.present ? "check_circle" : "cancel"}</span>
      {label}
      {cert.present && cert.url && <span className="material-icons-outlined" style={{ fontSize: 13, opacity: 0.8 }}>open_in_new</span>}
    </>
  );
  const style = { display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 9px", borderRadius: 8, border: `1px solid ${tone.bd}`, background: tone.bg, color: tone.c, fontSize: 11.5, fontWeight: 700, textDecoration: "none" } as const;
  return cert.present && cert.url
    ? <a href={cert.url} target="_blank" rel="noopener noreferrer" style={style} title={L("Open document", "فتح المستند")}>{inner}</a>
    : <span style={style}>{inner}</span>;
}

function UnitCard({ u, ar, L }: { u: UnitReadiness; ar: boolean; L: LFn }) {
  const tone = BAND[u.band];
  return (
    <div style={{ border: `1px solid ${tone.bd}`, borderRadius: 14, overflow: "hidden", background: "#fff" }}>
      <div style={{ height: 4, background: tone.c }} />
      <div style={{ padding: "12px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 900, color: "#1c3550", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ar ? u.titleAr : u.titleEn}</span>
          <span style={{ fontSize: 11.5, fontWeight: 800, color: tone.c, fontVariantNumeric: "tabular-nums" }}>{u.done}/{u.total}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <Bar percent={u.percent} band={u.band} />
          <span style={{ fontSize: 11, fontWeight: 800, color: tone.c }}>{u.percent}%</span>
        </div>

        {/* Year + conflict */}
        {u.year != null && (
          <div style={{ fontSize: 12, fontWeight: 700, color: u.yearConflict ? "#d9362a" : "#6b8fa8", marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
            <span className="material-icons-outlined" style={{ fontSize: 14 }}>{u.yearConflict ? "error_outline" : "event"}</span>
            {u.yearConflict
              ? L(`Year ${u.year} — below the requested ${u.reqMinYear}+`, `الصنع ${u.year} — أقل من المطلوب ${u.reqMinYear}+`)
              : L(`Year ${u.year}`, `سنة الصنع ${u.year}`)}
          </div>
        )}

        {/* Photos */}
        <Row label={L("Photos", "الصور")} L={L}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 9px", borderRadius: 8, border: `1px solid ${(u.photosPresent ? BAND.green : BAND.red).bd}`, background: (u.photosPresent ? BAND.green : BAND.red).bg, color: (u.photosPresent ? BAND.green : BAND.red).c, fontSize: 11.5, fontWeight: 700 }}>
            <span className="material-icons-outlined" style={{ fontSize: 14 }}>{u.photosPresent ? "check_circle" : "cancel"}</span>
            {u.photosPresent ? L("Front + serial", "أمامية + رقم") : L("Missing photos", "صور ناقصة")}
          </span>
          {u.photos.filter((p) => p.url).slice(0, 4).map((p, i) => (
            <a key={i} href={p.url!} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, fontWeight: 700, color: "#1a7ec8", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 3 }}>
              <span className="material-icons-outlined" style={{ fontSize: 13 }}>image</span>{p.slot.replace(/_/g, " ")}
            </a>
          ))}
        </Row>

        {u.equipmentCerts.length > 0 && (
          <Row label={L("Equipment certs", "شهادات المعدة")} L={L}>
            {u.equipmentCerts.map((c) => <CertChip key={`e-${c.code}`} cert={c} L={L} />)}
          </Row>
        )}
        {u.operatorCerts.length > 0 && (
          <Row label={L("Operator certs", "شهادات المشغّل")} L={L}>
            {u.operatorCerts.map((c) => <CertChip key={`o-${c.code}`} cert={c} L={L} />)}
          </Row>
        )}
      </div>
    </div>
  );
}

function Row({ label, children, L }: { label: string; children: React.ReactNode; L: LFn }) {
  void L;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", padding: "6px 0", borderTop: "1px solid #f2f5f8" }}>
      <span style={{ fontSize: 11, fontWeight: 800, color: "#6b8fa8", minWidth: 96 }}>{label}</span>
      {children}
    </div>
  );
}

/** Full read-only eligibility view for a bid's offered units. */
export function BidEligibilityModal({ r, supplierName, ar, L, onClose }: { r: BidReadiness; supplierName: string; ar: boolean; L: LFn; onClose: () => void }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [onClose]);

  const ready = allReady(r);
  return (
    <div dir={ar ? "rtl" : "ltr"} onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(9,20,34,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/icon?family=Material+Icons+Outlined" />
      <div role="dialog" aria-modal="true" style={{ width: "min(680px,96vw)", maxHeight: "88vh", background: "#eff4f9", borderRadius: 18, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 24px 70px rgba(9,20,34,.42)", fontFamily: "Inter, system-ui, sans-serif" }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", background: "#fff", borderBottom: "1px solid #d4e0ec" }}>
          <span style={{ width: 34, height: 34, borderRadius: 9, background: BAND[ready ? "green" : r.band].bg, color: BAND[ready ? "green" : r.band].c, display: "grid", placeItems: "center", flexShrink: 0 }}>
            <span className="material-icons-outlined" style={{ fontSize: 20 }}>{ready ? "verified" : "fact_check"}</span>
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 900, color: "#1c3550" }}>{L("Equipment eligibility", "جاهزية المعدات")}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#6b8fa8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {supplierName} · {ready ? L("all units ready", "كل الوحدات جاهزة") : L(`${r.readyCount} of ${r.committed} units ready`, `${r.readyCount} من ${r.committed} وحدة جاهزة`)}
            </div>
          </div>
          <button onClick={onClose} aria-label={L("Close", "إغلاق")} style={{ width: 34, height: 34, borderRadius: "50%", border: "none", background: "#eff4f9", color: "#1c3550", display: "grid", placeItems: "center", cursor: "pointer" }}>
            <span className="material-icons-outlined" style={{ fontSize: 20 }}>close</span>
          </button>
        </div>

        <div style={{ padding: "14px 16px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#6b8fa8", lineHeight: 1.5 }}>
            {L("What each offered unit holds for your request — photos and the certificates you asked for. Proof-of-ownership isn't shown here.",
               "ما توفّره كل وحدة معروضة لطلبك — الصور والشهادات التي طلبتها. لا تُعرض إثباتات الملكية هنا.")}
          </div>
          {r.units.map((u) => <UnitCard key={u.equipmentId} u={u} ar={ar} L={L} />)}
        </div>
      </div>
    </div>
  );
}
