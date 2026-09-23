"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/Dialog";
import { Icon } from "@/components/ui";
import { bidTokenFromUrl } from "@/lib/bidCardHtml";
import { ShareRequestPanel } from "@/components/share/ShareRequestPanel";
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


  const openDl = () => { setDlInput(toLocalInput(deadline)); setDlEdit(true); };
  const saveDl = (clear?: boolean) => {
    onSaveDeadline(clear || !dlInput ? null : new Date(dlInput).toISOString());
    setDlEdit(false);
  };


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
      /* The panel inside is a two-column layout — a 520px dialog squeezed it into two columns of
         about 200px each, which truncated every supplier name and gave the page four nested
         scrollbars. */
      size="xxl"
      padded={false}
      icon={<span className="grid h-[34px] w-[34px] place-items-center rounded-sm bg-brand text-white"><Icon name="ios_share" size={18} /></span>}
      title={L("Share for bids", "مشاركة لتلقّي العروض")}
      subtitle={L("Send this link to suppliers. They bid without an account, even off-platform.", "أرسل هذا الرابط للمؤجّرين: يقدّمون عرضهم دون حساب، حتى خارج المنصة.")}
    >
      <div {...pin("share-for-bids")} className="flex min-h-0 flex-1 flex-col text-start" dir={ar ? "rtl" : "ltr"}>

        <div className="flex flex-col gap-5 overflow-y-auto px-5 py-4">
          {/* ── The link row belongs to the panel now ────────────────────────────────────────
              This drew its own link + Copy, and that Copy called `copyBidLink`, which renders the
              DEFAULT wording with no renter name. The panel below copies the renter's own template.
              So one dialog held two Copy buttons that put two different messages on the clipboard,
              which is precisely the drift the shared panel exists to prevent.

              `showExpiry={false}` keeps this sheet's deadline editor, which is the better of the
              two: it takes a date AND a time, and it can clear one. */}
          {/* ── ONE share panel, the same one the review carries (owner, 2026-09-02) ───────────
              This used to be two blocks: a supplier picker of its own, and a four-icon channel row
              (WhatsApp / Email / SMS / More). Between them and the review screen there were three
              pickers and three ways of writing the same message, and which one a supplier received
              depended on which button was pressed.

              `showLink={false}` because this sheet already draws the link above and a deadline
              editor below — two link rows a few pixels apart, and two controls writing the same
              deadline, is worse than either.

              What is gone with the icon row: **SMS** and the OS share sheet. Neither is in the
              owner's prototype and neither could name who it went to — `sms:` and `navigator.share`
              open with no recipient, so nothing was recorded and the renter had no list of who he
              had told. */}
          {/* No heading of its own: the panel opens with SEND TO MY SUPPLIERS, and two headings a
              line apart saying the same thing is how the sheet came to look stacked. */}
          <div>
            <ShareRequestPanel
              mode="share"
              requestUuid={bidTokenFromUrl(shareUrl)}
              requestCode={requestCode ?? null}
              renterName={renterName}
              showExpiry={false}
            />
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
