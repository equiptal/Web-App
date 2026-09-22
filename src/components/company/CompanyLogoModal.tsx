"use client";

import { useState } from "react";
import { Dialog, DialogButton } from "@/components/Dialog";
import { Icon } from "@/components/ui";
import { useLocale, useT } from "@/lib/i18n";
import { uploadCompanyLogo } from "@/lib/company-logo";
import type { RenterProfile } from "@/lib/contract/onboarding";
import { pin } from "@/lib/uiPins";

/**
 * **Add, change or remove the company logo** (owner, 2026-09-23: *"yes add"*, then *"match it"*
 * against the app). The app keeps all three on one control, the tappable mark in the My Company
 * header (`company_logo_editor.dart`); the web keeps the mark on the company card and this dialog
 * behind it, because a card of plain facts gives a silent tap target nowhere to announce itself.
 *
 * Pick to `uploadCompanyLogo` (downscale, presigned PUT) to `PUT /api/me/profile` with the KEY.
 * Remove is the SAME call with an EMPTY key, which is the backend own clear
 * (`input.companyLogoKey || null`) and what the app sends from `_save(kind, key: \'\')`.
 *
 * ⚠️ **The four names ride every call**, because `updateProfileSchema` extends
 * `completeProfileSchema` and makes all four `min(2)`. There is no logo-only PUT. So a renter whose
 * profile is half filled would get a 422 on a tap that looks ordinary, and `blocked` below is the
 * app own `_blockedReason`: it says what to fill in rather than letting the server refuse.
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
  /** One box, two ends: what it did, never a second dialog saying it. */
  const [done, setDone] = useState<"saved" | "removed" | null>(null);
  const [confirming, setConfirming] = useState(false);

  if (!open) return null;
  const shown = preview ?? profile?.companyLogoUrl ?? null;
  const onFile = !!(profile?.companyLogoUrl ?? "").trim();

  /** `_atLeastTwo`, the app own name for the schema `min(2)`. */
  const two = (v: string | null | undefined) => (v ?? "").trim().length >= 2;
  const blocked =
    !profile || !two(profile.firstName) || !two(profile.lastName) || !two(profile.city) || !two(profile.jobTitle);

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

  /** An empty `logoKey` clears it. The names go unchanged: this dialog edits the mark and nothing else. */
  const write = async (logoKey: string) => {
    if (!profile) return;
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
          companyLogoKey: logoKey,
        }),
      });
      if (!r.ok) throw new Error("save");
      setPreview(null);
      setKey(null);
      setConfirming(false);
      setDone(logoKey ? "saved" : "removed");
      onSaved();
    } catch {
      setErr(t.verify.errors.submit);
    } finally {
      setBusy(false);
    }
  };

  const footer = done ? (
    <DialogButton full tone="primary" onClick={onClose}>{t.common.close}</DialogButton>
  ) : confirming ? (
    <>
      <DialogButton full onClick={() => setConfirming(false)}>{t.common.cancel}</DialogButton>
      <DialogButton full tone="danger" disabled={busy} onClick={() => void write("")}>{p.logoRemove}</DialogButton>
    </>
  ) : (
    <>
      <DialogButton full onClick={onClose}>{t.verify.back}</DialogButton>
      <DialogButton full tone="primary" disabled={!key || busy || blocked} onClick={() => void write(key ?? "")}>
        {p.logoSave}
      </DialogButton>
    </>
  );

  return (
    <Dialog open onClose={onClose} size="sm" title={confirming ? p.logoRemove : p.logoLabel} footer={footer}>
      <div {...pin("company-logo-modal")} dir={locale === "ar" ? "rtl" : "ltr"} className="flex flex-col gap-3">
        {confirming ? (
          <p className="text-body leading-relaxed text-muted">{p.logoRemoveConfirm}</p>
        ) : (
          <>
            <div className="flex items-center gap-3 rounded-sm border border-border bg-surface px-4 py-3">
              <span className="grid h-14 w-14 flex-none place-items-center overflow-hidden rounded-sm border border-border bg-surface2">
                {busy ? (
                  <Icon name="hourglass_empty" size={20} className="text-muted" />
                ) : shown && done !== "removed" ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={shown} alt="" className="h-full w-full object-contain" />
                ) : (
                  <Icon name="image" size={20} className="text-muted" />
                )}
              </span>
              <span className="flex-1 text-meta text-muted">
                {done === "saved" ? p.logoSaved : done === "removed" ? p.logoRemoved : p.logoNote}
              </span>
              {!done && !blocked && (
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

            {/* ⚠️ The same guard as the picker, because clearing is still a full `PUT /profile/me`
                and still 422s on a half-filled profile. */}
            {blocked && <p className="text-meta font-semibold text-navy-mid">{p.logoNeedsProfile}</p>}

            {/* Removing is not undoing a pick: it takes the stored mark off the quotation, the shared
                link and the bid form, so it asks first. Quiet until there is one to take off. */}
            {!done && !blocked && onFile && (
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirming(true)}
                className="self-start text-meta font-semibold text-danger transition hover:underline"
              >
                {p.logoRemove}
              </button>
            )}
          </>
        )}
        {err && <p className="text-meta font-semibold text-danger">{err}</p>}
      </div>
    </Dialog>
  );
}
