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
  green: { c: "var(--ok)", bg: "var(--ok-soft)", bd: "color-mix(in srgb, var(--ok) 32%, transparent)" },
  yellow: { c: "var(--warn)", bg: "var(--warn-soft)", bd: "color-mix(in srgb, var(--warn) 32%, transparent)" },
  red: { c: "var(--danger)", bg: "var(--danger-soft)", bd: "color-mix(in srgb, var(--danger) 32%, transparent)" },
};

const allReady = (r: BidReadiness) => r.band === "green" && r.readyCount >= r.committed && r.units.every((u) => !u.yearConflict);

/** Compact readiness pill for the bid card's Equipment row: `<icon> N/N <eye>`. Click opens the
 *  eligibility view — so it IS the "View eligibility" control, without a separate bulky section. */
export function BidReadinessBadge({ r, L, onClick }: { r: BidReadiness; L: LFn; onClick?: () => void }) {
  const ready = allReady(r);
  const c = BAND[ready ? "green" : r.band];
  return (
    <button
      type="button"
      onClick={onClick}
      title={L("View equipment eligibility", "عرض جاهزية المعدات")}
      style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 20, border: `1px solid ${c.bd}`, background: c.bg, color: c.c, fontSize: 11.5, fontWeight: 800, cursor: onClick ? "pointer" : "default", fontFamily: "inherit", whiteSpace: "nowrap" }}
    >
      <span className="material-icons-outlined" style={{ fontSize: 14 }}>{ready ? "verified" : "fact_check"}</span>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{r.readyCount}/{r.committed}</span>
      {onClick && <>
        <span className="material-icons-outlined" style={{ fontSize: 14, opacity: 0.85 }}>visibility</span>
        {L("View eligibility", "عرض الجاهزية")}
      </>}
    </button>
  );
}

/** Full readiness SECTION for the bid card (app parity: RenteeReadinessSection) — header + pill,
 *  a one-line scope note, and a "View eligibility" button that opens the per-unit modal. */
export function BidReadinessSection({ r, L, onView }: { r: BidReadiness; L: LFn; onView: () => void }) {
  const ready = allReady(r);
  const c = BAND[ready ? "green" : r.band];
  return (
    <div style={{ border: "1px solid var(--surface3)", borderRadius: 12, overflow: "hidden", background: "var(--surface)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px" }}>
        <span className="material-icons-outlined" style={{ fontSize: 18, color: "var(--muted)" }}>fact_check</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: "var(--navy)" }}>{L("Bid readiness", "جاهزية العرض")}</span>
        <span style={{ marginInlineStart: "auto", display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 20, border: `1px solid ${c.bd}`, background: c.bg, color: c.c, fontSize: 11.5, fontWeight: 800, whiteSpace: "nowrap" }}>
          <span className="material-icons-outlined" style={{ fontSize: 14 }}>{ready ? "verified" : "fact_check"}</span>
          {ready ? L("All ready", "الكل جاهز") : `${r.readyCount}/${r.committed}`}
        </span>
      </div>
      <div style={{ padding: "0 12px 10px" }}>
        <p style={{ margin: "0 0 9px", fontSize: 11.5, lineHeight: 1.5, color: "var(--muted)", fontWeight: 600 }}>
          {L("Checks each offered unit's photos and the certificates your request asked for (ownership documents aren't shown here).", "يتحقق من صور كل وحدة معروضة والشهادات التي طلبها طلبك (لا تُعرض مستندات الملكية هنا).")}
        </p>
        <button type="button" onClick={onView} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "10px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--info)", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
          <span className="material-icons-outlined" style={{ fontSize: 17 }}>visibility</span>{L("View eligibility", "عرض الجاهزية")}
        </button>
      </div>
    </div>
  );
}

function Bar({ percent, band }: { percent: number; band: ReadinessBand }) {
  return (
    <div style={{ height: 7, borderRadius: 6, background: "var(--surface2)", overflow: "hidden", flex: 1, minWidth: 80 }}>
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
    <div style={{ border: `1px solid ${tone.bd}`, borderRadius: 14, overflow: "hidden", background: "var(--surface)" }}>
      <div style={{ height: 4, background: tone.c }} />
      <div style={{ padding: "12px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 900, color: "var(--navy)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ar ? u.titleAr : u.titleEn}</span>
          <span style={{ fontSize: 11.5, fontWeight: 800, color: tone.c, fontVariantNumeric: "tabular-nums" }}>{u.done}/{u.total}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <Bar percent={u.percent} band={u.band} />
          <span style={{ fontSize: 11, fontWeight: 800, color: tone.c }}>{u.percent}%</span>
        </div>

        {/* Year + conflict */}
        {u.year != null && (
          <div style={{ fontSize: 12, fontWeight: 700, color: u.yearConflict ? "var(--danger)" : "var(--muted)", marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
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
            <a key={i} href={p.url!} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, fontWeight: 700, color: "var(--info)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 3 }}>
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
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", padding: "6px 0", borderTop: "1px solid var(--background)" }}>
      <span style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)", minWidth: 96 }}>{label}</span>
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
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "color-mix(in srgb, var(--info-deep) 55%, transparent)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/icon?family=Material+Icons+Outlined" />
      <div role="dialog" aria-modal="true" style={{ width: "min(680px,96vw)", maxHeight: "88vh", background: "var(--surface2)", borderRadius: 18, display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: "Inter, system-ui, sans-serif" }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
          <span style={{ width: 34, height: 34, borderRadius: 9, background: BAND[ready ? "green" : r.band].bg, color: BAND[ready ? "green" : r.band].c, display: "grid", placeItems: "center", flexShrink: 0 }}>
            <span className="material-icons-outlined" style={{ fontSize: 20 }}>{ready ? "verified" : "fact_check"}</span>
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 900, color: "var(--navy)" }}>{L("Equipment eligibility", "جاهزية المعدات")}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {supplierName} · {ready ? L("all units ready", "كل الوحدات جاهزة") : L(`${r.readyCount} of ${r.committed} units ready`, `${r.readyCount} من ${r.committed} وحدة جاهزة`)}
            </div>
          </div>
          <button onClick={onClose} aria-label={L("Close", "إغلاق")} style={{ width: 34, height: 34, borderRadius: "50%", border: "none", background: "var(--surface2)", color: "var(--navy)", display: "grid", placeItems: "center", cursor: "pointer" }}>
            <span className="material-icons-outlined" style={{ fontSize: 20 }}>close</span>
          </button>
        </div>

        <div style={{ padding: "14px 16px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", lineHeight: 1.5 }}>
            {L("What each offered unit holds for your request — photos and the certificates you asked for. Proof-of-ownership isn't shown here.",
               "ما توفّره كل وحدة معروضة لطلبك — الصور والشهادات التي طلبتها. لا تُعرض إثباتات الملكية هنا.")}
          </div>
          {r.units.map((u) => <UnitCard key={u.equipmentId} u={u} ar={ar} L={L} />)}
        </div>
      </div>
    </div>
  );
}
