"use client";

import { useLocale, useT } from "@/lib/i18n";
import { OnboardingForm } from "@/components/onboarding/OnboardingForm";

/**
 * Account-creation popup shown when a guest posts an RFQ (no entry GuestBlock, no "verify later"
 * stepline). Reuses the onboarding form; on success the caller closes it and the request is posted.
 * Verification is NOT required here — creating the account (guest→basic) is enough to post.
 */
export function AccountModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const t = useT();
  const { locale } = useLocale();
  if (!open) return null;
  return (
    <div
      dir={locale === "ar" ? "rtl" : "ltr"}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/45 p-4 sm:items-center"
      onClick={onClose}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-surface shadow-xl" onClick={(e) => e.stopPropagation()}>
        <OnboardingForm next="/create" onDone={onCreated} headline={t.guest.postTitle} subhead={t.guest.postBody} />
      </div>
    </div>
  );
}
