"use client";

import { useEffect, useState } from "react";
import { useLocale, useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { OnboardingForm } from "@/components/onboarding/OnboardingForm";
import { PhoneEntry } from "@/components/auth/PhoneEntry";
import { CodeEntry } from "@/components/auth/CodeEntry";
import type { OtpChannel } from "@/components/auth/authClient";
import { normalizeTier, type RenterUser } from "@/lib/contract/auth";

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
export function AccountModal({ open, onClose, onCreated, title, subtitle, postHeadline, postSubhead }: { open: boolean; onClose: () => void; onCreated: () => void; title?: string; subtitle?: string; postHeadline?: string; postSubhead?: string }) {
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
        <AccountFlow onCreated={onCreated} title={title} subtitle={subtitle} postHeadline={postHeadline} postSubhead={postSubhead} />
      </div>
    </div>
  );
}

type Phase = "phone" | "code" | "profile";

/** The three-step flow. Mounted only while the modal is open, so its phase resets on each open. */
function AccountFlow({ onCreated, title, subtitle, postHeadline, postSubhead }: { onCreated: () => void; title?: string; subtitle?: string; postHeadline?: string; postSubhead?: string }) {
  const t = useT();
  const { status, user, signIn } = useSession();
  // An existing (guest-tier) session with a phone skips OTP and goes straight to the profile step. A
  // session that's ALREADY basic/verified has a complete profile — nothing to fill — so it proceeds
  // straight to posting (handled by the effect below); it should never linger on the profile step.
  const hasGuestSession = status === "authed" && !!user?.phone && user?.tier === "guest";
  const alreadyComplete = status === "authed" && (user?.tier === "basic" || user?.tier === "verified");
  const [phase, setPhase] = useState<Phase>(hasGuestSession ? "profile" : "phone");
  // Did we start at the profile step (mobile-handoff guest who skipped phone→OTP)? Captured once at
  // mount. The normal flow collects + persists email at the phone step, so the register step omits it;
  // the skip-to-profile path never collected an email, so it must ask for it (required) there.
  const [skippedToProfile] = useState(hasGuestSession);
  const [phone, setPhone] = useState<string | null>(user?.phone ?? null);
  const [channel, setChannel] = useState<OtpChannel>({ method: "SMS" });

  // If we somehow open for an already-complete account, don't show the form — just continue.
  useEffect(() => {
    if (alreadyComplete) onCreated();
  }, [alreadyComplete, onCreated]);

  if (phase === "phone") {
    return (
      <div className="p-[22px]">
        <PhoneEntry
          title={title ?? t.guest.gateTitle}
          subtitle={subtitle ?? t.guest.gateSub}
          onCodeSent={(p, ch) => {
            setPhone(p);
            setChannel(ch);
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
          channel={channel}
          onVerified={async (u: RenterUser) => {
            signIn(u); // start the session from the verified identity
            // The verify-otp tier can come back thin/guest for a RETURNING account — which would wrongly
            // push an already-registered renter through the profile step (registering them as a fresh
            // guest that createRequest then rejects). Confirm the AUTHORITATIVE tier from /api/me
            // (reads /users/me) before deciding: already basic/verified → skip registration and post.
            let tier = u.tier;
            try {
              const r = await fetch("/api/me", { cache: "no-store" });
              if (r.ok) { const d = (await r.json()) as { user?: { tier?: unknown } }; tier = normalizeTier(d.user?.tier); }
            } catch { /* keep the verify tier on a network hiccup */ }
            if (tier === "basic" || tier === "verified") onCreated();
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
      // Normal flow: email was collected + persisted at the phone step → don't ask again. Handoff guest
      // (skipped that step): ask for it here, required.
      showEmail={skippedToProfile}
      requireEmail={skippedToProfile}
      onDone={onCreated}
      headline={postHeadline ?? t.guest.postTitle}
      subhead={postSubhead ?? t.guest.postBody}
    />
  );
}
