"use client";

import { useState } from "react";
import { useT, useLocale } from "@/lib/i18n";
import { Dropdown } from "@/components/Dropdown";
import { Icon } from "@/components/ui";
import { Dialog, DialogButton } from "@/components/Dialog";
import { btn } from "@/lib/ds";

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

  const labelCls = "mb-2 block text-meta font-semibold text-navy-mid";
  const inputCls =
    "h-[46px] w-full rounded-md border border-border bg-surface px-4 text-body outline-0 focus:border-brand";

  return (
    <Dialog
      open
      onClose={onCancel}
      size="md"
      title={p.identityTitle}
      footer={
        <>
          <DialogButton full onClick={onCancel}>{t.verify.back}</DialogButton>
          <DialogButton full tone="primary" disabled={!role} onClick={submit}>{p.continue}</DialogButton>
        </>
      }
    >
      <div dir={locale === "ar" ? "rtl" : "ltr"}>
        <div className="flex flex-col gap-4">
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
                  className={`min-h-[52px] rounded-sm border-[1.5px] px-2 py-2 text-meta font-semibold leading-tight transition ${
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
              <span className="text-label font-semibold text-muted">— {t.verify.optional}</span>
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
              {p.cityLabel} <span className="text-label font-semibold text-muted">— {t.verify.optional}</span>
            </label>
            <Dropdown
              label={t.verify.cityPlaceholder}
              placeholder={t.verify.cityPlaceholder}
              value={city || null}
              onChange={setCity}
              options={cities.map((c) => ({ value: c.value, label: locale === "ar" ? c.ar : c.en }))}
            />
          </div>

          <div>
            <label className={labelCls}>
              {p.logoLabel} <span className="text-label font-semibold text-muted">— {t.verify.optional}</span>
            </label>
            <div className="flex items-center gap-3 rounded-sm border border-border bg-surface px-4 py-3">
              <span className="grid h-12 w-12 flex-none place-items-center overflow-hidden rounded-sm border border-border bg-surface2">
                {logoBusy ? (
                  <Icon name="hourglass_empty" size={20} className="text-muted" />
                ) : logoPreview ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={logoPreview} alt="" className="h-full w-full object-contain" />
                ) : (
                  <Icon name="image" size={20} className="text-muted" />
                )}
              </span>
              <span className="flex-1 text-meta text-muted">{p.logoNote}</span>
              <label className="flex-none cursor-pointer rounded-sm border border-brand bg-surface px-3 py-1.5 text-meta font-semibold text-brand">
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
                  className={btn("secondary", "sm", { className: "flex-none" })}
                >
                  {p.logoRemove}
                </button>
              )}
            </div>
            {logoErr && <p className="mt-1 text-meta text-danger">{logoErr}</p>}
          </div>
        </div>

      </div>
    </Dialog>
  );
}
