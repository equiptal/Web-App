"use client";

import { useState } from "react";
import { useT, useLocale } from "@/lib/i18n";
import { Icon } from "@/components/ui";

export type AuthorityRole = "owner" | "manager" | "employee";

/** What the popup collects. Role is mandatory; nothing else is. */
export interface CompanyIdentity {
  role: AuthorityRole;
  nationalId?: string;
  companyCity?: string;
  /** Already uploaded when the popup returns — the picker PUTs on pick, so submit gets a key. */
  companyLogoKey?: string;
}

export interface IdentityPrefill {
  role?: AuthorityRole | null;
  nationalId?: string | null;
  companyCity?: string | null;
  companyLogoKey?: string | null;
  companyLogoUrl?: string | null;
}

/**
 * The identity popup, asked AFTER the renter presses Send and BEFORE the warning — not up front.
 *
 * The redesign moved these fields off the form deliberately: the screen's job is the pile, and asking
 * for a role before any document exists made it feel like paperwork. Dismissing returns to the
 * populated form and sends nothing.
 *
 * What it does NOT ask for: company name, CR number, address, map pin. The documents answer all four
 * and the classifier reads them. Company email is absent because `companyDetailsSchema` has never had
 * a field for it — the old labelled form collected one and dropped it on the floor.
 *
 * Mirrors `company_docs_identity_sheet.dart`. The app shows the logo picker to rentees only (a
 * supplier already brands itself with its store logo); the web session is renter-only by
 * construction, so it always shows here — the same behaviour for the same user.
 */
export function CompanyIdentityModal({
  open,
  cities,
  prefill,
  onCancel,
  onContinue,
}: {
  open: boolean;
  cities: { value: string; en: string; ar: string }[];
  prefill?: IdentityPrefill;
  onCancel: () => void;
  onContinue: (identity: CompanyIdentity) => void;
}) {
  const t = useT();
  const p = t.verify.pile;
  const { locale } = useLocale();
  const L = (e: string, a: string) => (locale === "ar" ? a : e);

  const [role, setRole] = useState<AuthorityRole | null>(prefill?.role ?? null);
  const [nationalId, setNationalId] = useState(prefill?.nationalId ?? "");
  const [city, setCity] = useState(prefill?.companyCity ?? "");
  const [logoKey, setLogoKey] = useState<string | null>(prefill?.companyLogoKey ?? null);
  const [logoPreview, setLogoPreview] = useState<string | null>(prefill?.companyLogoUrl ?? null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoErr, setLogoErr] = useState<string | null>(null);

  if (!open) return null;

  // Order matches the app: least authority first, owner last.
  const roles: { value: AuthorityRole; label: string }[] = [
    { value: "employee", label: p.roleEmployee },
    { value: "manager", label: p.roleManager },
    { value: "owner", label: p.roleOwner },
  ];

  /**
   * Downscale to 220px, re-encode as PNG, upload on pick, keep the KEY. Same size and format as the
   * app (`downscaleCompanyLogo`) so one firm's logo looks identical wherever it is drawn: an unscaled
   * photo would be embedded at full resolution in the quotation and the bid form, and PNG keeps
   * transparency against those documents' light backgrounds.
   *
   * A logo is branding, never a blocker — a failure here notifies and leaves the pile sendable.
   */
  const onPickLogo = (file: File) => {
    setLogoErr(null);
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 220;
        let { width, height } = img;
        if (width >= height && width > max) {
          height = Math.round((height * max) / width);
          width = max;
        } else if (height > width && height > max) {
          width = Math.round((width * max) / height);
          height = max;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(async (blob) => {
          if (!blob) return;
          setLogoBusy(true);
          try {
            const r = await fetch("/api/profile/doc-upload-url", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ filename: "company-logo.png", contentType: "image/png" }),
            });
            if (!r.ok) throw new Error("upload");
            const { url, key } = (await r.json()) as { url: string; key: string };
            const put = await fetch(url, {
              method: "PUT",
              body: blob,
              headers: { "Content-Type": "image/png" },
            });
            if (!put.ok) throw new Error("upload");
            setLogoKey(key);
            setLogoPreview(canvas.toDataURL("image/png"));
          } catch {
            setLogoErr(t.verify.errors.submit);
          } finally {
            setLogoBusy(false);
          }
        }, "image/png");
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const submit = () => {
    if (!role) return;
    onContinue({
      role,
      nationalId: nationalId.trim() || undefined,
      companyCity: city || undefined,
      companyLogoKey: logoKey || undefined,
    });
  };

  const labelCls = "mb-[6px] block text-[12.5px] font-bold text-navy-mid";
  const inputCls =
    "h-[46px] w-full rounded-[10px] border border-border bg-surface px-[14px] text-[14px] outline-0 focus:border-brand focus:shadow-[0_0_0_3px_rgba(247,144,9,.12)]";

  return (
    <div
      dir={locale === "ar" ? "rtl" : "ltr"}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/45 p-4 sm:items-center"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label={p.identityTitle}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-surface p-5 shadow-xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <h2 className="flex-1 text-[18px] font-extrabold tracking-tight text-navy">{p.identityTitle}</h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label={L("Close", "إغلاق")}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface2"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-[14px]">
          {/* Role — three equal chips, the only required answer. */}
          <div>
            <label className={labelCls}>
              {p.roleLabel} <span className="text-danger">*</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {roles.map((r) => (
                <button
                  type="button"
                  key={r.value}
                  onClick={() => setRole(r.value)}
                  aria-pressed={role === r.value}
                  className={`min-h-[52px] rounded-[10px] border-[1.5px] px-2 py-2 text-[12.5px] font-bold leading-tight transition ${
                    role === r.value
                      ? "border-brand bg-brand-soft text-brand"
                      : "border-border bg-surface text-muted hover:border-brand/60"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={labelCls}>
              {p.nationalIdLabel}{" "}
              <span className="text-[11px] font-medium text-muted">— {t.verify.optional}</span>
            </label>
            <input
              className={inputCls}
              value={nationalId}
              onChange={(e) => setNationalId(e.target.value)}
              maxLength={20}
              dir="ltr"
              inputMode="numeric"
            />
          </div>

          <div>
            <label className={labelCls}>
              {p.cityLabel} <span className="text-[11px] font-medium text-muted">— {t.verify.optional}</span>
            </label>
            <select className={inputCls} value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="">{t.verify.cityPlaceholder}</option>
              {cities.map((c) => (
                <option key={c.value} value={c.value}>
                  {locale === "ar" ? c.ar : c.en}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>
              {p.logoLabel} <span className="text-[11px] font-medium text-muted">— {t.verify.optional}</span>
            </label>
            <div className="flex items-center gap-3 rounded-[10px] border border-border bg-surface px-[14px] py-3">
              <span className="grid h-12 w-12 flex-none place-items-center overflow-hidden rounded-[10px] border border-border bg-surface2">
                {logoBusy ? (
                  <Icon name="hourglass_empty" size={20} className="text-muted" />
                ) : logoPreview ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={logoPreview} alt="" className="h-full w-full object-contain" />
                ) : (
                  <Icon name="image" size={20} className="text-muted" />
                )}
              </span>
              <span className="flex-1 text-[12px] text-muted">{p.logoNote}</span>
              <label className="flex-none cursor-pointer rounded-lg border border-brand bg-surface px-3 py-1.5 text-[12.5px] font-bold text-brand">
                {logoBusy ? t.verify.uploading : logoKey || logoPreview ? p.logoChange : p.logoUpload}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={logoBusy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onPickLogo(f);
                    e.target.value = "";
                  }}
                />
              </label>
              {(logoKey || logoPreview) && !logoBusy && (
                <button
                  type="button"
                  onClick={() => {
                    setLogoKey(null);
                    setLogoPreview(null);
                  }}
                  className="flex-none rounded-lg border border-border px-3 py-1.5 text-[12.5px] font-bold text-danger"
                >
                  {p.logoRemove}
                </button>
              )}
            </div>
            {logoErr && <p className="mt-1 text-[12px] text-danger">{logoErr}</p>}
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-[10px] border border-border bg-surface px-4 py-3 text-[14px] font-bold text-navy-mid"
          >
            {t.verify.back}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!role}
            className="flex-1 rounded-[10px] border border-brand bg-brand px-4 py-3 text-[14px] font-bold text-brand-fg transition hover:brightness-[1.04] disabled:cursor-not-allowed disabled:border-border disabled:bg-surface2 disabled:text-muted"
          >
            {p.continue}
          </button>
        </div>
      </div>
    </div>
  );
}
