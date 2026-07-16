"use client";

import type { BidQuality } from "@/lib/contract/bid-quality";

/** Band → colour, shared with the renter-side bid cards so the ring and the card score agree. */
export const BAND_COLOR: Record<string, string> = { high: "#12b76a", mid: "#f79009", low: "#f04438" };

/**
 * Circular bid-quality indicator (0–100). Shows how well a bid matches the renter's request + how
 * complete its docs are. Used live on the supplier form and read-only on the renter's viewer.
 */
export function QualityRing({ quality, L, size = 72 }: { quality: BidQuality; L: (e: string, a: string) => string; size?: number }) {
  const { score, band, parts } = quality;
  const stroke = Math.max(6, Math.round(size * 0.1));
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - score / 100);
  const color = BAND_COLOR[band];
  const label = band === "high" ? L("High match", "مطابقة عالية") : band === "mid" ? L("Partial match", "مطابقة جزئية") : L("Low match", "مطابقة منخفضة");
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const title = `${L("Bid quality", "جودة العرض")}: ${score}% · ${L("Terms", "الشروط")} ${pct(parts.terms)} · ${L("Equipment docs", "مستندات المعدة")} ${pct(parts.equipment)} · ${L("Company", "الشركة")} ${pct(parts.company)}`;

  return (
    <div className="qring" title={title}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-label={title} role="img">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef2f6" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset} transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset .4s ease, stroke .3s ease" }}
        />
        <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" style={{ fontWeight: 900, fontSize: size * 0.27, fill: "#1c3550" }}>{score}%</text>
      </svg>
      <div className="qring-lb" style={{ color }}>{label}</div>
    </div>
  );
}
