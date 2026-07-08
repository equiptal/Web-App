"use client";

import { useEffect, useState } from "react";
import { useLocale, useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { OnboardingForm } from "@/components/onboarding/OnboardingForm";
import { PhoneEntry } from "@/components/auth/PhoneEntry";
import { EmailEntry } from "@/components/auth/EmailEntry";
import { CodeEntry } from "@/components/auth/CodeEntry";
import { normalizeTier, type RenterUser } from "@/lib/contract/auth";
import { updateProfile, type ProfileUpdatePayload } from "@/lib/api/profile-client";
import { EMAIL_FIRST_AUTH_ENABLED } from "@/lib/flags";
import { Icon } from "@/components/ui";

/** Mask a stored email for display: `mahmoud@gmail.com` → `m•••@gmail.com`. */
function maskEmail(e: string): string {
  const at = e.indexOf("@");
  return at > 0 ? `${e[0]}•••${e.slice(at)}` : e;
}

/**
 * Combined auth + account-registration popup (public-web-auth-gate). Two sequential modals:
 *   Modal 1 — get a code with PHONE **or** EMAIL (segmented toggle).
 *   Modal 2 — create your account (the missing identity + profile).
 * Every account ends with both phone + email; phone stays the identity. Branches after verify:
 *   - existing account → session → done (W-1 keep/switch may fire).
 *   - new via PHONE   → session, no profile → Modal 2 Case 2 (email required in the form, no verify).
 *   - new via EMAIL   → needsSignup + onboardingToken (no session) → Modal 2 Case 1 (the profile form
 *     carries the phone with an INLINE OTP; submitting it verifies the phone → creates the account).
 * New user = 2 modals total; existing user = 1. A phone-first guest who abandons Modal 2 resumes at the
 * profile step (hasGuestSession); an email-first abandon resumes at the same form (via resumeToken).
 */
export function AccountModal({ open, onClose, onCreated, title, subtitle, postHeadline, postSubhead, resumeToken, onNeedsSignup }: { open: boolean; onClose: () => void; onCreated: () => void; title?: string; subtitle?: string; postHeadline?: string; postSubhead?: string; resumeToken?: string; onNeedsSignup?: (token: string, email: string | null) => void }) {
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
        <AccountFlow onCreated={onCreated} title={title} subtitle={subtitle} postHeadline={postHeadline} postSubhead={postSubhead} resumeToken={resumeToken} onNeedsSignup={onNeedsSignup} />
      </div>
    </div>
  );
}

type Phase = "entry" | "code" | "profile" | "emailChoice";

function AccountFlow({ onCreated, title, subtitle, postHeadline, postSubhead, resumeToken, onNeedsSignup }: { onCreated: () => void; title?: string; subtitle?: string; postHeadline?: string; postSubhead?: string; resumeToken?: string; onNeedsSignup?: (token: string, email: string | null) => void }) {
  const t = useT();
  const { status, user, signIn } = useSession();
  // A guest-tier session with a phone is a phone-first user who verified but never finished the profile
  // → resume at Modal 2 (Case 2, email required). Already basic/verified → nothing to fill → continue.
  const hasGuestSession = status === "authed" && !!user?.phone && user?.tier === "guest";
  const alreadyComplete = status === "authed" && (user?.tier === "basic" || user?.tier === "verified");
  // `resumeToken` = an email-first onboarding the user abandoned before finishing → resume at the same
  // profile form (Modal 2, Case 1). Otherwise: guest resume → profile; fresh → Modal 1 entry.
  const [phase, setPhase] = useState<Phase>(resumeToken || hasGuestSession ? "profile" : "entry");
  const [entryMode, setEntryMode] = useState<"phone" | "email">("phone");
  const [codePhone, setCodePhone] = useState<string | null>(user?.phone ?? null);
  const [codeEmail, setCodeEmail] = useState<string | null>(null);
  // Email-first onboarding token (Case 1). When set, Modal 2 is the account form WITH the inline
  // phone-verify (and no email field — email came from the token). Empty = phone-first (Case 2: email
  // required in the form, phone already verified).
  const [onboardingToken, setOnboardingToken] = useState(resumeToken ?? "");
  // W-1 keep/switch state: stored account email (X), the full profile (to resend on switch), busy/error.
  const [storedEmail, setStoredEmail] = useState("");
  const [savedProfile, setSavedProfile] = useState<Record<string, unknown> | null>(null);
  const [switching, setSwitching] = useState(false);
  const [switchErr, setSwitchErr] = useState(false);
  const typedEmail = codeEmail ?? ""; // W-1 compares this (email typed at entry, if any) to storedEmail

  // If we somehow open for an already-complete account, don't show the form — just continue.
  useEffect(() => {
    if (alreadyComplete) onCreated();
  }, [alreadyComplete, onCreated]);

  // Post-verify routing (existing session set): confirm the AUTHORITATIVE tier from /api/me (verify's
  // tier can be thin for a returning account), then continue / keep-switch / register.
  const afterVerified = async (u: RenterUser, xEmail: string | null) => {
    signIn(u);
    let tier = u.tier;
    let me: Record<string, unknown> | null = null;
    try {
      const r = await fetch("/api/me", { cache: "no-store" });
      if (r.ok) { const d = (await r.json()) as { user?: Record<string, unknown> }; me = d.user ?? null; tier = normalizeTier(me?.tier); }
    } catch { /* keep the verify tier on a network hiccup */ }
    const complete = tier === "basic" || tier === "verified";
    // W-1: a COMPLETE account whose stored email (X) differs from the one typed this login (Y) → keep or
    // switch. Rare in the two-modal model (email isn't typed alongside phone), but preserved for aliases.
    const x = (xEmail ?? "").trim();
    const y = typedEmail.trim();
    if (complete && me && x && y && x.toLowerCase() !== y.toLowerCase()) {
      setStoredEmail(x);
      setSavedProfile(me);
      setPhase("emailChoice");
      return;
    }
    if (complete) onCreated();
    else setPhase("profile"); // new PHONE user → Modal 2 Case 2 (email required; onboardingToken empty)
  };

  // ── Modal 1 — get a code with phone OR email ──
  if (phase === "entry") {
    // Email-first not enabled (backend still requires a phone) → phone-only entry, no toggle.
    if (!EMAIL_FIRST_AUTH_ENABLED) {
      return (
        <div className="p-[22px]">
          <PhoneEntry
            title={title ?? t.auth.entryTitle}
            subtitle={subtitle ?? t.auth.entrySub}
            onCodeSent={(p) => { setCodePhone(p); setCodeEmail(null); setPhase("code"); }}
          />
        </div>
      );
    }
    const seg = (mode: "phone" | "email", label: string) => (
      <button
        type="button"
        onClick={() => setEntryMode(mode)}
        aria-pressed={entryMode === mode}
        className={`flex-1 rounded-[8px] py-2 text-[13px] font-bold transition ${entryMode === mode ? "bg-surface text-navy shadow-[0_1px_2px_rgba(28,53,80,.12)]" : "text-navy-mid"}`}
      >
        {label}
      </button>
    );
    return (
      <div className="p-[22px]">
        <div className="mb-[18px] grid grid-cols-2 gap-[6px] rounded-[10px] border border-border bg-surface2 p-[4px]">
          {seg("phone", t.auth.withPhone)}
          {seg("email", t.auth.withEmail)}
        </div>
        {entryMode === "phone" ? (
          <PhoneEntry
            title={title ?? t.auth.entryTitle}
            subtitle={subtitle ?? t.auth.entrySub}
            onUseEmail={() => setEntryMode("email")}
            onCodeSent={(p) => { setCodePhone(p); setCodeEmail(null); setPhase("code"); }}
          />
        ) : (
          <EmailEntry
            title={title ?? t.auth.entryTitle}
            subtitle={subtitle ?? t.auth.entrySub}
            onUsePhone={() => setEntryMode("phone")}
            onCodeSent={(em) => { setCodeEmail(em); setCodePhone(null); setPhase("code"); }}
          />
        )}
      </div>
    );
  }

  // ── Modal 1 — code entry (verify by whichever identity was used) ──
  if (phase === "code" && (codePhone || codeEmail)) {
    const verifyPayload = codePhone ? { phone: codePhone } : { otpEmail: codeEmail };
    const resendPayload = codePhone ? { phone: codePhone, otpMethod: "SMS" } : { otpEmail: codeEmail, otpMethod: "EMAIL" };
    return (
      <div className="p-[22px]">
        <CodeEntry
          dest={codePhone ?? codeEmail ?? ""}
          verifyPayload={verifyPayload}
          resendPayload={resendPayload}
          onVerified={afterVerified}
          onNeedsSignup={(token, email) => { setOnboardingToken(token); onNeedsSignup?.(token, email); setPhase("profile"); }}
          onEditNumber={() => setPhase("entry")}
        />
      </div>
    );
  }

  // ── W-1 keep-vs-switch (complete account, stored email ≠ typed) ──
  if (phase === "emailChoice") {
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

  // ── Modal 2 profile — the single create-account form ──
  // Case 1 (email-first): onboardingToken set → inline phone-verify in the form, no email field
  // (it came from the token). Case 2 (phone-first / guest resume): no token → phone already verified,
  // email required in the form.
  const emailFirst = !!onboardingToken;
  return (
    <OnboardingForm
      next="/create"
      showEmail={!emailFirst}
      requireEmail={!emailFirst}
      phoneVerify={emailFirst ? { onboardingToken } : undefined}
      onSignIn={() => { setOnboardingToken(""); setCodeEmail(null); setCodePhone(null); setEntryMode("phone"); setPhase("entry"); }}
      onDone={onCreated}
      headline={postHeadline ?? t.guest.postTitle}
      subhead={postSubhead ?? t.guest.postBody}
    />
  );
}
