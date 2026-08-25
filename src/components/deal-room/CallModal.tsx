"use client";

/**
 * **The call sheet — one behaviour for one icon** (owner, 2026-08-19).
 *
 * Extracted from `DealRoom.tsx`, unchanged, so the map's chat dock can mount the same component. It
 * was a private function in a 1,700-line file, which is why the dock grew its own answer instead: a
 * bare `<a href="tel:…">`. Same glyph, same place in the header, two behaviours — and the dock's is
 * the weaker one, because a `tel:` link on a laptop opens nothing and the renter never sees the number
 * he was reaching for.
 *
 * This sheet shows the number, dials it where dialling is possible, and copies it where it is not.
 *
 * **`canCall` is the platform, not the permission.** Whether the renter is ALLOWED the number is the
 * server's call and is already answered by the time a phone reaches this component — a null phone
 * means no control at all, which is the caller's business. `canCall` only says whether this device can
 * place a call, so the «اتصال» button is absent on a desktop where it would be inert while «نسخ الرقم»
 * still works.
 */

import { useState } from "react";
import { Dialog } from "@/components/Dialog";

export function CallModal({
  ar,
  L,
  phone,
  name,
  canCall,
  onClose,
}: {
  ar: boolean;
  L: (en: string, arr: string) => string;
  phone: string;
  name: string;
  canCall: boolean;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(phone); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* clipboard blocked */ }
  };
  return (
    <Dialog open onClose={onClose} size="sm" padded={false}>
      <div dir={ar ? "rtl" : "ltr"} style={{ padding: "26px 22px 22px", textAlign: "center" }}>
        <span style={{ display: "inline-flex", width: 56, height: 56, borderRadius: "50%", background: "#e7f7ee", color: "#1daf58", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
          <span className="material-icons-outlined" style={{ fontSize: 28 }}>call</span>
        </span>
        <h3 style={{ fontSize: 16, fontWeight: 900, color: "#1c3550", margin: 0 }}>{L("Call supplier", "الاتصال بالمؤجّر")}</h3>
        <p style={{ fontSize: 13, fontWeight: 600, color: "#6b8fa8", margin: "4px 0 16px" }}>{name}</p>
        <div style={{ direction: "ltr", unicodeBidi: "plaintext", fontSize: 22, fontWeight: 900, color: "#1c3550", letterSpacing: 0.5, userSelect: "all", marginBottom: 18 }}>{phone}</div>
        <div style={{ display: "flex", gap: 10 }}>
          {canCall && (
            <a href={`tel:${phone}`} style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "13px", borderRadius: 13, border: "none", background: "#1daf58", color: "#fff", fontWeight: 800, fontSize: 14, textDecoration: "none" }}>
              <span className="material-icons-outlined" style={{ fontSize: 18 }}>call</span>{L("Call", "اتصال")}
            </a>
          )}
          <button onClick={copy} style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "13px", borderRadius: 13, border: "1.5px solid #d4e0ec", background: "#fff", color: "#1c3550", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
            <span className="material-icons-outlined" style={{ fontSize: 18 }}>{copied ? "check" : "content_copy"}</span>{copied ? L("Copied", "تم النسخ") : L("Copy number", "نسخ الرقم")}
          </button>
        </div>
        <button onClick={onClose} style={{ marginTop: 12, width: "100%", padding: "11px", borderRadius: 13, border: "none", background: "#eff4f9", color: "#6b8fa8", fontWeight: 800, fontSize: 13.5, cursor: "pointer", fontFamily: "inherit" }}>{L("Close", "إغلاق")}</button>
      </div>
    </Dialog>
  );
}
