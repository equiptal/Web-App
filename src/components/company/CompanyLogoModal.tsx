"use client";

import { useState } from "react";
import { Dialog, DialogButton } from "@/components/Dialog";
import { Icon } from "@/components/ui";
import { useLocale, useT } from "@/lib/i18n";
import { uploadCompanyLogo } from "@/lib/company-logo";
import type { RenterProfile } from "@/lib/contract/onboarding";
import { pin } from "@/lib/uiPins";

/**
 * **Add or change the company logo, in place** (owner, 2026-09-23: *"yes add"*, to the quotation's
 * «Add a logo» having nowhere to upload). The app uploads straight from its quotation
 * (`renter_record_cta.dart`, `pickAndUploadCompanyLogo`); the web's quotation is a separate page with
 * no session of its own, so its ask links to `/profile?logo=1` and this dialog opens there.
 *
 * Pick → `uploadCompanyLogo` (downscale, presigned PUT) → `PUT /api/me/profile` with the KEY. The
 * backend's schema requires the four names on that call, so the renter's own current values go with
 * it unchanged: this dialog changes the mark and nothing else.
 *
 * Opened only for a VERIFIED renter. Unverified, the app sends him to verification instead (the
 * logo is collected there), and so does the quotation's link.
 */
export function CompanyLogoModal({
  open,
  profile,
  onClose,
  onSaved,
}: {
  open: boolean;
  profile: RenterProfile | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const p = t.verify.pile;
  const [key, setKey] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!open) return null;
  const shown = preview ?? profile?.companyLogoUrl ?? null;

  const pick = async (file: File) => {
    setErr(null);
    setBusy(true);
    try {
      const r = await uploadCompanyLogo(file);
      setKey(r.key);
      setPreview(r.preview);
    } catch {
      setErr(t.verify.errors.submit);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!key || !profile) return;
    setErr(null);
    setBusy(true);
    try {
      const r = await fetch("/api/me/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: profile.firstName ?? "",
          lastName: profile.lastName ?? "",
          city: profile.city ?? "",
          jobTitle: profile.jobTitle ?? "",
          companyLogoKey: key,
        }),
      });
      if (!r.ok) throw new Error("save");
      setDone(true);
      onSaved();
    } catch {
      setErr(t.verify.errors.submit);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title={p.logoLabel}
      footer={
        done ? (
          <DialogButton full tone="primary" onClick={onClose}>{t.common.close}</DialogButton>
        ) : (
          <>
            <DialogButton full onClick={onClose}>{t.verify.back}</DialogButton>
            <DialogButton full tone="primary" disabled={!key || busy} onClick={() => void save()}>{p.logoSave}</DialogButton>
          </>
        )
      }
    >
      <div {...pin("company-logo-modal")} dir={locale === "ar" ? "rtl" : "ltr"} className="flex flex-col gap-3">
        <div className="flex items-center gap-3 rounded-sm border border-border bg-surface px-4 py-3">
          <span className="grid h-14 w-14 flex-none place-items-center overflow-hidden rounded-sm border border-border bg-surface2">
            {busy ? (
              <Icon name="hourglass_empty" size={20} className="text-muted" />
            ) : shown ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={shown} alt="" className="h-full w-full object-contain" />
            ) : (
              <Icon name="image" size={20} className="text-muted" />
            )}
          </span>
          <span className="flex-1 text-meta text-muted">{done ? p.logoSaved : p.logoNote}</span>
          {!done && (
            <label className="flex-none cursor-pointer rounded-sm border border-brand bg-surface px-3 py-1.5 text-meta font-semibold text-brand">
              {busy ? t.verify.uploading : shown ? p.logoChange : p.logoUpload}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void pick(f);
                  e.target.value = "";
                }}
              />
            </label>
          )}
        </div>
        {err && <p className="text-meta font-semibold text-danger">{err}</p>}
      </div>
    </Dialog>
  );
}
