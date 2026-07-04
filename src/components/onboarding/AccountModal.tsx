"use client";

import { useEffect, useState } from "react";
import { useLocale, useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { OnboardingForm } from "@/components/onboarding/OnboardingForm";
import { PhoneEntry } from "@/components/auth/PhoneEntry";
import { CodeEntry } from "@/components/auth/CodeEntry";
import type { RenterUser } from "@/lib/contract/auth";

/**
 * Combined auth + account-registration popup shown when a guest submits an RFQ. Now that the web is
 * public (no login gate to browse), a submitter may be fully signed out — so this runs the whole gate
 * in ONE step: phone → OTP → profile, ending as a `basic` user, then the caller posts the request.
 *
 * - Signed out → phone → OTP (creates the guest session) → profile (guest→basic).
 * - Existing guest session (e.g. mobile handoff) → skips straight to the profile step (no re-OTP).
 * Email is required here (see `requireEmail`). Verification is NOT required — becoming basic is enough
 * to post.
 */
export function AccountModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { locale } = useLocale();
  if (!open) return null;
  return (
    <div
      dir={locale === "ar" ? "rtl" : "ltr"}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/45 p-4 sm:items-center"
      onClick={onClose}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-surface shadow-xl" onClick={(e) => e.stopPropagation()}>
        {/* Fresh mount each open → the flow always starts at the right step for the current session. */}
        <AccountFlow onCreated={onCreated} />
      </div>
    </div>
  );
}

type Phase = "phone" | "code" | "profile";

/** The three-step flow. Mounted only while the modal is open, so its phase resets on each open. */
function AccountFlow({ onCreated }: { onCreated: () => void }) {
  const t = useT();
  const { status, user, signIn } = useSession();
  // An existing (guest-tier) session with a phone skips OTP and goes straight to the profile step. A
  // session that's ALREADY basic/verified has a complete profile — nothing to fill — so it proceeds
  // straight to posting (handled by the effect below); it should never linger on the profile step.
  const hasGuestSession = status === "authed" && !!user?.phone && user?.tier === "guest";
  const alreadyComplete = status === "authed" && (user?.tier === "basic" || user?.tier === "verified");
  const [phase, setPhase] = useState<Phase>(hasGuestSession ? "profile" : "phone");
  const [phone, setPhone] = useState<string | null>(user?.phone ?? null);

  // If we somehow open for an already-complete account, don't show the form — just continue.
  useEffect(() => {
    if (alreadyComplete) onCreated();
  }, [alreadyComplete, onCreated]);

  if (phase === "phone") {
    return (
      <div className="p-[22px]">
        <PhoneEntry
          onCodeSent={(p) => {
            setPhone(p);
            setPhase("code");
          }}
        />
      </div>
    );
  }

  if (phase === "code" && phone) {
    return (
      <div className="p-[22px]">
        <CodeEntry
          phone={phone}
          onVerified={(u: RenterUser) => {
            signIn(u); // start the session from the verified identity (carries the real tier)
            // Returning account that's already complete → skip the profile form and post the request.
            // Only a new/incomplete (guest-tier) number needs to fill in the profile (guest→basic).
            if (u.tier === "basic" || u.tier === "verified") onCreated();
            else setPhase("profile");
          }}
          onEditNumber={() => setPhase("phone")}
        />
      </div>
    );
  }

  return (
    <OnboardingForm
      next="/create"
      requireEmail
      onDone={onCreated}
      headline={t.guest.postTitle}
      subhead={t.guest.postBody}
    />
  );
}
