"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/Dialog";
import { Icon } from "@/components/ui";
import { copyBidLink } from "@/lib/bidCardHtml";
import { bidCardText } from "@/lib/bidCardText";
import { useBidCard } from "@/lib/useBidCard";
import { ShareToSuppliers } from "./ShareToSuppliers";
import { ACTIONS, btn, cx } from "@/lib/ds";
import { pin } from "@/lib/uiPins";

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
  requestCode,
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
  /** `EXC-170845` — carried into the e-mail subject so an operator can file the reply. */
  requestCode?: string | null;
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
  /* Above the `if (!open) return null` below, with the other hooks: the card is fetched, and a hook
     after an early return runs in a different order on the render that closes the sheet. */
  const card = useBidCard(shareUrl, ar ? "ar" : "en");
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

  /**
   * **One template, wherever the link goes** (owner, 2026-09-01).
   *
   * WhatsApp, SMS and the share sheet used to send a one-liner that named nobody's machine, no site
   * and no deadline — while *Send to my suppliers* sent a laid-out note and *Copy* sent a bare URL.
   * Three messages for one request, and which one a supplier got depended on which button was
   * pressed. They all render the same model now.
   *
   * The fallback is the old one-liner, and it stays: the card is fetched, so a slow or unreachable
   * preview must cost the detail and never the share.
   */
  const message = card
    ? bidCardText(card.model, shareUrl, { renterName: renter, lang: ar ? "ar" : "en" })
    : renter
      ? L(`${renter} invites you to submit a bid (RFQ) for their equipment request: ${shareUrl}`, `يدعوك ${renter} لتقديم عرض سعر (طلب عروض أسعار) على طلب معداته: ${shareUrl}`)
      : L(`You're invited to submit a bid (RFQ) for an equipment request: ${shareUrl}`, `أنت مدعوٌّ لتقديم عرض سعر (طلب عروض أسعار) على طلب معدات: ${shareUrl}`);

  /**
   * Copies the link as BOTH the rich card and the plain URL — one clipboard write, two flavours.
   *
   * Gmail never builds a preview for a pasted URL (it refuses to fetch the page), so the only way a
   * renter's emailed link shows a card is to put the card itself on the clipboard. Gmail's composer
   * keeps pasted HTML, so it renders. WhatsApp and SMS take the plain flavour instead and unfurl the
   * URL themselves, so nothing that works today changes.
   *
   * Degrades to the plain URL on its own if anything fails — see `copyBidLink`.
   */
  const copyLink = () => {
    if (!shareUrl) return;
    copyBidLink(shareUrl, ar ? "ar" : "en")
      .catch(() => false)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); });
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

  const lbl = "mb-2 text-label font-semibold uppercase tracking-wide text-muted";

  return (
    /* ── ONE header, and therefore ONE close (owner, 2026-08-31: *"why does the share open like
       this"*) ──────────────────────────────────────────────────────────────────────────────────
       It drew its own header row — mark, title, subtitle, close — inside a `Dialog` that had been
       given no `title`. The shell's rule for a body that brings its own headings is to float a close
       in the corner anyway, so the sheet opened with TWO X's a few pixels apart, one of them lying
       half over the title.

       The header is the shell's now: same title, same subtitle, the same brand mark passed as
       `icon`. `padded={false}` stays — this body brings its own gutters and its own footer rule. */
    <Dialog
      open
      onClose={onClose}
      size="md"
      padded={false}
      icon={<span className="grid h-[34px] w-[34px] place-items-center rounded-sm bg-brand text-white"><Icon name="ios_share" size={18} /></span>}
      title={L("Share for bids", "مشاركة لتلقّي العروض")}
      subtitle={L("Send this link to suppliers. They bid without an account, even off-platform.", "أرسل هذا الرابط للمؤجّرين: يقدّمون عرضهم دون حساب، حتى خارج المنصة.")}
    >
      <div {...pin("share-for-bids")} className="flex min-h-0 flex-1 flex-col text-start" dir={ar ? "rtl" : "ltr"}>

        <div className="flex flex-col gap-5 overflow-y-auto px-5 py-4">
          {/* link + copy */}
          <div>
            <div className={lbl}>{L("Your bid link", "رابط تقديم العرض")}</div>
            <div className="flex gap-2">
              <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-sm border border-border bg-surface2 px-3 text-meta text-navy">
                <Icon name="link" size={15} className="flex-none text-muted" />
                <span className="truncate" dir="ltr">{shareUrl || "…"}</span>
              </div>
              <button onClick={copyLink} className={`inline-flex h-11 flex-none items-center gap-1.5 rounded-sm px-4 text-body font-semibold text-white ${copied ? "bg-ok" : "bg-brand"}`}>
                <Icon name={copied ? "check" : "content_copy"} size={16} />{copied ? L("Copied", "تم النسخ") : L("Copy", "نسخ")}
              </button>
            </div>
          </div>

          {/* SUP-T41 — the recipients he already keeps. Above the raw channels because it is the
              answer to "who do I send this to", and the channel row is the answer to "how", which is
              only worth asking once he knows. */}
          <div>
            <div className={lbl}>{L("Send it to suppliers you keep", "أرسِله إلى مورّديك")}</div>
            <ShareToSuppliers shareUrl={shareUrl} renterName={renterName} requestCode={requestCode} L={L} />
          </div>

          {/* channels */}
          <div>
            <div className={lbl}>{L("Or share directly", "أو شارك مباشرة")}</div>
            <div className="grid grid-cols-4 gap-2">
              {channels.map(([kind, icon, label]) => (
                <button key={kind} onClick={() => shareVia(kind)} className="flex flex-col items-center gap-1.5 rounded-sm border border-border bg-surface px-2 py-3 text-label font-semibold text-navy hover:bg-surface2">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-surface2 text-navy-mid"><Icon name={icon} size={18} /></span>{label}
                </button>
              ))}
            </div>
          </div>

          {/* deadline */}
          <div>
            <div className={lbl}>{L("Bid deadline", "موعد نهائي للعروض")} · <span className="lowercase text-muted">{L("optional", "اختياري")}</span></div>
            {!dlEdit ? (
              <div className="flex items-center gap-3 rounded-sm border border-border bg-surface px-3.5 py-3">
                <Icon name="schedule" size={18} className="flex-none text-brand" />
                <div className="flex-1">
                  <b className="block text-body font-semibold text-navy">{deadline ? new Date(deadline).toLocaleString(ar ? "ar-SA-u-ca-gregory" : "en-GB", { dateStyle: "medium", timeStyle: "short" }) : L("No deadline set", "لا يوجد موعد نهائي")}</b>
                  <span className="text-label font-normal text-muted">{deadline ? L("Suppliers see a countdown; the link closes then.", "يرى المؤجّرون عدّاً تنازلياً؛ يُغلق الرابط حينها.") : L("The link stays open until you close the request.", "يبقى الرابط مفتوحاً حتى تُغلق الطلب.")}</span>
                </div>
                <button onClick={openDl} className="flex-none rounded-sm px-4 py-1.5 text-meta font-semibold text-brand" style={{ background: "var(--brand-pale)", border: "1px solid var(--brand-light)" }}>
                  {deadline ? L("Edit", "تعديل") : L("Set", "تحديد")}
                </button>
              </div>
            ) : (
              <div className="rounded-sm border border-border bg-surface p-3.5">
                <input type="datetime-local" value={dlInput} onChange={(e) => setDlInput(e.target.value)} className="h-11 w-full rounded-sm border border-border bg-surface2 px-3 text-body text-navy outline-0" />
                <div className={cx(ACTIONS, "mt-2.5")}>
                  {deadline && <button onClick={() => saveDl(true)} className={btn("secondary", "sm")}>{L("Clear", "مسح")}</button>}
                  <button onClick={() => setDlEdit(false)} className={btn("secondary", "sm")}>{L("Cancel", "إلغاء")}</button>
                  <button onClick={() => saveDl(false)} className={btn("primary", "sm")}><Icon name="check" size={15} />{L("Save", "حفظ")}</button>
                </div>
              </div>
            )}
          </div>

          {/* company logo — gated off until the logo_url migration is applied + agents redeployed. */}
          {LOGO_ENABLED && (
          <div>
            <div className={lbl}>{L("Company logo", "شعار الشركة")} · <span className="lowercase text-muted">{L("optional", "اختياري")}</span></div>
            <div className="flex items-center gap-3 rounded-sm border border-border bg-surface px-3.5 py-3">
              <span className="grid h-12 w-12 flex-none place-items-center overflow-hidden rounded-sm border border-border bg-surface2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {logo ? <img src={logo} alt="" className="h-full w-full object-contain" /> : <Icon name="image" size={20} className="text-muted" />}
              </span>
              <div className="flex-1 text-meta font-normal text-muted">{L("Shown at the top of the bid form suppliers see.", "يظهر أعلى نموذج العرض الذي يراه المؤجّرون.")}</div>
              <label className="flex-none cursor-pointer rounded-sm border border-brand bg-white px-3 py-1.5 text-meta font-semibold text-brand">
                {logo ? L("Change", "تغيير") : L("Upload", "رفع")}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickLogo(f); }} />
              </label>
              {logo && <button onClick={() => { setLogo(null); onSaveLogo?.(null); }} className={btn("secondary", "sm", { className: "flex-none" })}>{L("Remove", "إزالة")}</button>}
            </div>
          </div>
          )}

          {/* optional preview */}
          {formUrl && (
            <a href={formUrl} target="_blank" rel="noopener" className="flex items-center gap-3 rounded-sm border border-border bg-surface px-3.5 py-3 hover:bg-surface2">
              <Icon name="visibility" size={18} className="flex-none text-navy-mid" />
              <span className="flex-1">
                <b className="block text-body font-semibold text-navy">{L("View the bid form", "عرض نموذج تقديم العرض")}</b>
                <span className="text-label font-normal text-muted">{L("See exactly what suppliers fill in: read-only.", "شاهد ما سيعبّيه المؤجّرون: للعرض فقط.")}</span>
              </span>
              <Icon name="open_in_new" size={16} className="flex-none text-muted" />
            </a>
          )}
        </div>

        <div className="flex justify-end border-t border-border px-5 py-3">
          <button onClick={onClose} className={btn("secondary", "md")}>{L("Done", "تم")}</button>
        </div>
      </div>
    </Dialog>
  );
}
