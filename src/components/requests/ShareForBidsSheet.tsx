"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui";

// Flip to true once the `logo_url` migration is applied + the agents backend redeployed.
const LOGO_ENABLED = false;

/**
 * web-app/006 — the single, shared "share for bids" sheet used by BOTH the post-submit confirmation
 * screen and the request-header strip, so sharing the link + setting the bid deadline look and behave
 * identically wherever the renter opens them. Link + copy + channels (RFQ invitation from the renter)
 * + optional deadline (set / adjust / clear). Refined type: one bold heading, regular body, medium labels.
 */
export function ShareForBidsSheet({
  open,
  onClose,
  shareUrl,
  formUrl,
  renterName,
  deadline,
  onSaveDeadline,
  logoUrl,
  onSaveLogo,
  ar,
  L,
}: {
  open: boolean;
  onClose: () => void;
  shareUrl: string;
  /** Optional read-only preview of the supplier bid form. */
  formUrl?: string;
  renterName?: string | null;
  /** Current deadline ISO (or null = none). */
  deadline: string | null;
  /** Persist a new deadline (ISO) or clear it (null). */
  onSaveDeadline: (iso: string | null) => void;
  /** Current company logo (data URL or null). */
  logoUrl?: string | null;
  /** Persist a new logo (data URL) or clear it (null). */
  onSaveLogo?: (url: string | null) => void;
  ar: boolean;
  L: (en: string, arr: string) => string;
}) {
  const [copied, setCopied] = useState(false);
  const [dlInput, setDlInput] = useState("");
  const [dlEdit, setDlEdit] = useState(false);
  const [logo, setLogo] = useState<string | null>(logoUrl ?? null);
  useEffect(() => { setLogo(logoUrl ?? null); }, [logoUrl]);

  // Resize the picked image to a small PNG thumbnail (≤200px) and store it as a data URL — no S3 needed.
  const onPickLogo = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 200;
        let { width, height } = img;
        if (width >= height && width > max) { height = Math.round((height * max) / width); width = max; }
        else if (height > width && height > max) { width = Math.round((width * max) / height); height = max; }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, width, height);
        const url = canvas.toDataURL("image/png");
        setLogo(url);
        onSaveLogo?.(url);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);
  if (!open) return null;

  const toLocalInput = (iso: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const renter = renterName?.trim();
  const message = renter
    ? L(`${renter} invites you to submit a bid (RFQ) for their equipment request: ${shareUrl}`, `يدعوك ${renter} لتقديم عرض سعر (طلب عروض أسعار) على طلب معداته: ${shareUrl}`)
    : L(`You're invited to submit a bid (RFQ) for an equipment request: ${shareUrl}`, `أنت مدعوٌّ لتقديم عرض سعر (طلب عروض أسعار) على طلب معدات: ${shareUrl}`);

  const copyLink = () => {
    if (!shareUrl) return;
    navigator.clipboard?.writeText(shareUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }).catch(() => {});
  };
  const shareVia = (kind: "WhatsApp" | "Email" | "SMS" | "More") => {
    const enc = encodeURIComponent(message);
    if (kind === "WhatsApp") window.open(`https://wa.me/?text=${enc}`, "_blank", "noopener");
    else if (kind === "Email") window.location.href = `mailto:?subject=${encodeURIComponent(renter ? L(`${renter} — invitation to bid (RFQ)`, `${renter} — دعوة لتقديم عرض سعر`) : L("Invitation to bid (RFQ)", "دعوة لتقديم عرض سعر"))}&body=${enc}`;
    else if (kind === "SMS") window.location.href = `sms:?&body=${enc}`;
    else if (typeof navigator !== "undefined" && navigator.share) navigator.share({ url: shareUrl, text: message }).catch(() => {});
    else copyLink();
  };

  const openDl = () => { setDlInput(toLocalInput(deadline)); setDlEdit(true); };
  const saveDl = (clear?: boolean) => {
    onSaveDeadline(clear || !dlInput ? null : new Date(dlInput).toISOString());
    setDlEdit(false);
  };

  const channels = [
    ["WhatsApp", "chat", L("WhatsApp", "واتساب")],
    ["Email", "mail", L("Email", "إيميل")],
    ["SMS", "sms", L("SMS", "رسالة")],
    ["More", "ios_share", L("More", "المزيد")],
  ] as const;

  const lbl = "mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4" dir={ar ? "rtl" : "ltr"} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex max-h-[92vh] w-full max-w-[460px] flex-col overflow-hidden rounded-t-2xl bg-surface text-start shadow-xl sm:rounded-2xl">
        {/* header */}
        <div className="flex items-start gap-3 border-b border-border px-5 py-4">
          <span className="grid h-10 w-10 flex-none place-items-center rounded-[10px] bg-brand text-white"><Icon name="ios_share" size={20} /></span>
          <div className="flex-1">
            <h3 className="text-[16px] font-bold text-navy">{L("Share for bids", "مشاركة لتلقّي العروض")}</h3>
            <p className="mt-0.5 text-[12.5px] font-normal text-muted">{L("Send this link to suppliers — they bid without an account, even off-platform.", "أرسل هذا الرابط للمؤجّرين — يقدّمون عرضهم دون حساب، حتى خارج المنصة.")}</p>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 flex-none place-items-center rounded-full text-muted hover:bg-surface2"><Icon name="close" size={18} /></button>
        </div>

        <div className="flex flex-col gap-5 overflow-y-auto px-5 py-4">
          {/* link + copy */}
          <div>
            <div className={lbl}>{L("Your bid link", "رابط تقديم العرض")}</div>
            <div className="flex gap-2">
              <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-[10px] border border-border bg-surface2 px-3 text-[12.5px] text-navy">
                <Icon name="link" size={15} className="flex-none text-muted" />
                <span className="truncate" dir="ltr">{shareUrl || "…"}</span>
              </div>
              <button onClick={copyLink} className={`inline-flex h-11 flex-none items-center gap-1.5 rounded-[10px] px-4 text-[13px] font-semibold text-white ${copied ? "bg-ok" : "bg-brand"}`}>
                <Icon name={copied ? "check" : "content_copy"} size={16} />{copied ? L("Copied", "تم النسخ") : L("Copy", "نسخ")}
              </button>
            </div>
          </div>

          {/* channels */}
          <div>
            <div className={lbl}>{L("Or share directly", "أو شارك مباشرة")}</div>
            <div className="grid grid-cols-4 gap-2">
              {channels.map(([kind, icon, label]) => (
                <button key={kind} onClick={() => shareVia(kind)} className="flex flex-col items-center gap-1.5 rounded-[11px] border border-border bg-surface px-2 py-3 text-[11.5px] font-medium text-navy hover:bg-surface2">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-surface2 text-navy-mid"><Icon name={icon} size={18} /></span>{label}
                </button>
              ))}
            </div>
          </div>

          {/* deadline */}
          <div>
            <div className={lbl}>{L("Bid deadline", "موعد نهائي للعروض")} · <span className="lowercase text-muted">{L("optional", "اختياري")}</span></div>
            {!dlEdit ? (
              <div className="flex items-center gap-3 rounded-[11px] border border-border bg-surface px-3.5 py-3">
                <Icon name="schedule" size={18} className="flex-none text-brand" />
                <div className="flex-1">
                  <b className="block text-[13px] font-semibold text-navy">{deadline ? new Date(deadline).toLocaleString(ar ? "ar-SA" : "en-GB", { dateStyle: "medium", timeStyle: "short" }) : L("No deadline set", "لا يوجد موعد نهائي")}</b>
                  <span className="text-[11.5px] font-normal text-muted">{deadline ? L("Suppliers see a countdown; the link closes then.", "يرى المؤجّرون عدّاً تنازلياً؛ يُغلق الرابط حينها.") : L("The link stays open until you close the request.", "يبقى الرابط مفتوحاً حتى تُغلق الطلب.")}</span>
                </div>
                <button onClick={openDl} className="flex-none rounded-lg px-4 py-1.5 text-[12.5px] font-bold text-brand" style={{ background: "#FFE0B3", border: "1px solid #F7A83D" }}>
                  {deadline ? L("Edit", "تعديل") : L("Set", "تحديد")}
                </button>
              </div>
            ) : (
              <div className="rounded-[11px] border border-border bg-surface p-3.5">
                <input type="datetime-local" value={dlInput} onChange={(e) => setDlInput(e.target.value)} className="h-11 w-full rounded-[10px] border border-border bg-surface2 px-3 text-[14px] text-navy outline-0" />
                <div className="mt-2.5 flex justify-end gap-2">
                  {deadline && <button onClick={() => saveDl(true)} className="rounded-lg border border-border px-3 py-1.5 text-[12.5px] font-semibold text-danger">{L("Clear", "مسح")}</button>}
                  <button onClick={() => setDlEdit(false)} className="rounded-lg border border-border px-3 py-1.5 text-[12.5px] font-semibold text-navy-mid">{L("Cancel", "إلغاء")}</button>
                  <button onClick={() => saveDl(false)} className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-1.5 text-[12.5px] font-semibold text-white"><Icon name="check" size={15} />{L("Save", "حفظ")}</button>
                </div>
              </div>
            )}
          </div>

          {/* company logo — gated off until the logo_url migration is applied + agents redeployed. */}
          {LOGO_ENABLED && (
          <div>
            <div className={lbl}>{L("Company logo", "شعار الشركة")} · <span className="lowercase text-muted">{L("optional", "اختياري")}</span></div>
            <div className="flex items-center gap-3 rounded-[11px] border border-border bg-surface px-3.5 py-3">
              <span className="grid h-12 w-12 flex-none place-items-center overflow-hidden rounded-[10px] border border-border bg-surface2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {logo ? <img src={logo} alt="" className="h-full w-full object-contain" /> : <Icon name="image" size={20} className="text-muted" />}
              </span>
              <div className="flex-1 text-[12px] font-normal text-muted">{L("Shown at the top of the bid form suppliers see.", "يظهر أعلى نموذج العرض الذي يراه المؤجّرون.")}</div>
              <label className="flex-none cursor-pointer rounded-lg border border-brand bg-white px-3 py-1.5 text-[12.5px] font-semibold text-brand">
                {logo ? L("Change", "تغيير") : L("Upload", "رفع")}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickLogo(f); }} />
              </label>
              {logo && <button onClick={() => { setLogo(null); onSaveLogo?.(null); }} className="flex-none rounded-lg border border-border px-3 py-1.5 text-[12.5px] font-semibold text-danger">{L("Remove", "إزالة")}</button>}
            </div>
          </div>
          )}

          {/* optional preview */}
          {formUrl && (
            <a href={formUrl} target="_blank" rel="noopener" className="flex items-center gap-3 rounded-[11px] border border-border bg-surface px-3.5 py-3 hover:bg-surface2">
              <Icon name="visibility" size={18} className="flex-none text-navy-mid" />
              <span className="flex-1">
                <b className="block text-[13px] font-semibold text-navy">{L("View the bid form", "عرض نموذج تقديم العرض")}</b>
                <span className="text-[11.5px] font-normal text-muted">{L("See exactly what suppliers fill in — read-only.", "شاهد ما سيعبّيه المؤجّرون — للعرض فقط.")}</span>
              </span>
              <Icon name="open_in_new" size={16} className="flex-none text-muted" />
            </a>
          )}
        </div>

        <div className="flex justify-end border-t border-border px-5 py-3">
          <button onClick={onClose} className="rounded-[10px] border border-border bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-navy-mid hover:bg-surface2">{L("Done", "تم")}</button>
        </div>
      </div>
    </div>
  );
}
