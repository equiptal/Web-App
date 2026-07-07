"use client";

import { useEffect, useState } from "react";
import { useLocale, useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { OnboardingForm } from "@/components/onboarding/OnboardingForm";
import { PhoneEntry } from "@/components/auth/PhoneEntry";
import { CodeEntry } from "@/components/auth/CodeEntry";
import type { OtpChannel } from "@/components/auth/authClient";
import { normalizeTier, type RenterUser } from "@/lib/contract/auth";
import { updateProfile, type ProfileUpdatePayload } from "@/lib/api/profile-client";
import { Icon } from "@/components/ui";

/** Mask a stored email for display: `mahmoud@gmail.com` → `m•••@gmail.com`. */
function maskEmail(e: string): string {
  const at = e.indexOf("@");
  return at > 0 ? `${e[0]}•••${e.slice(at)}` : e;
}

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

type Phase = "phone" | "code" | "emailChoice" | "profile";

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
  // W-1 keep/switch prompt state: the email typed this login (Y), the stored account email (X), the
  // full profile (needed to resend on switch — the backend has no partial email update), busy/error.
  const [typedEmail, setTypedEmail] = useState("");
  const [storedEmail, setStoredEmail] = useState("");
  const [savedProfile, setSavedProfile] = useState<Record<string, unknown> | null>(null);
  const [switching, setSwitching] = useState(false);
  const [switchErr, setSwitchErr] = useState(false);

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
          onCodeSent={(p, ch, typed) => {
            setPhone(p);
            setChannel(ch);
            setTypedEmail(typed);
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
          onVerified={async (u: RenterUser, xEmail: string | null) => {
            signIn(u); // start the session from the verified identity
            // The verify-otp tier can come back thin/guest for a RETURNING account — which would wrongly
            // push an already-registered renter through the profile step (registering them as a fresh
            // guest that createRequest then rejects). Confirm the AUTHORITATIVE tier from /api/me
            // (reads /users/me) before deciding: already basic/verified → skip registration and post.
            let tier = u.tier;
            let me: Record<string, unknown> | null = null;
            try {
              const r = await fetch("/api/me", { cache: "no-store" });
              if (r.ok) { const d = (await r.json()) as { user?: Record<string, unknown> }; me = d.user ?? null; tier = normalizeTier(me?.tier); }
            } catch { /* keep the verify tier on a network hiccup */ }
            const complete = tier === "basic" || tier === "verified";
            // W-1: a COMPLETE account already has an email (X) that differs from the one typed this login
            // (Y). The backend did NOT overwrite it — so ask the user to keep X or switch to Y. Gated on
            // `complete` because "switch" resends the FULL profile (the backend has no partial email
            // update), which only a complete account has. Incomplete accounts keep X and go to register.
            const x = (xEmail ?? "").trim();
            const y = typedEmail.trim();
            if (complete && me && x && y && x.toLowerCase() !== y.toLowerCase()) {
              setStoredEmail(x);
              setSavedProfile(me);
              setPhase("emailChoice");
              return;
            }
            if (complete) onCreated();
            else setPhase("profile");
          }}
          onEditNumber={() => setPhase("phone")}
        />
      </div>
    );
  }

  if (phase === "emailChoice") {
    // Prompt is gated on a complete account, so proceeding always posts (no register step needed).
    const useNew = async () => {
      const s = (v: unknown) => (typeof v === "string" ? v : "");
      // Resend the FULL profile (loaded from /api/me) with the new email — the backend has no partial
      // email update; completeProfileSchema requires name/city/job, which a complete account has.
      const payload: ProfileUpdatePayload = {
        firstName: s(savedProfile?.firstName),
        lastName: s(savedProfile?.lastName),
        city: s(savedProfile?.city),
        jobTitle: s(savedProfile?.jobTitle),
        companyName: s(savedProfile?.companyName) || undefined,
        whatsapp: s(savedProfile?.whatsapp) || undefined,
        email: typedEmail.trim(),
      };
      setSwitching(true);
      setSwitchErr(false);
      const r = await updateProfile(payload);
      setSwitching(false);
      if (!r.ok) { setSwitchErr(true); return; } // keep the current one; let them retry or keep
      onCreated();
    };
    const body = t.auth.emailChoiceBody.replace("{stored}", maskEmail(storedEmail)).replace("{new}", typedEmail.trim());
    return (
      <div className="p-[22px]">
        <span className="mb-3 grid h-11 w-11 place-items-center rounded-full bg-brand-soft text-brand"><Icon name="mail" size={22} /></span>
        <h2 className="mb-[6px] text-[22px] font-extrabold tracking-[-.4px] text-navy">{t.auth.emailChoiceTitle}</h2>
        <p className="mb-[20px] text-[14px] leading-[1.55] text-muted">{body}</p>
        {switchErr && <p className="mb-3 text-[13px] font-semibold text-danger">{t.auth.emailSwitchError}</p>}
        <div className="flex gap-3">
          <button type="button" onClick={() => onCreated()} disabled={switching} className="flex-1 rounded-[10px] border border-border bg-surface px-4 py-3 text-[14px] font-bold text-navy-mid transition hover:border-navy-mid disabled:opacity-50">
            {t.auth.emailKeep}
          </button>
          <button type="button" onClick={useNew} disabled={switching} className="flex-1 rounded-[10px] border border-brand bg-brand px-4 py-3 text-[14px] font-bold text-white transition hover:brightness-[1.04] disabled:opacity-50">
            {switching ? t.auth.emailSwitching : t.auth.emailUseNew}
          </button>
        </div>
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
