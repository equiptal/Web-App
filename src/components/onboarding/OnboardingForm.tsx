"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useT, useLocale } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { Icon } from "@/components/ui";
import { postAuth, type AuthKind } from "@/components/auth/authClient";
import { COUNTRY_CODES, SAUDI_DIAL } from "@/components/auth/PhoneEntry";
import type { RenterUser } from "@/lib/contract/auth";
import { btn } from "@/lib/ds";

interface Opt {
  value: string;
  label: string;
}

/** Tolerantly normalise a master-data entry (string or {name,nameAr,id}) to a {value,label}. */
function toOpt(raw: unknown, ar: boolean): Opt | null {
  if (typeof raw === "string") return { value: raw, label: raw };
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const value = String(o.name ?? o.nameEn ?? o.value ?? o.id ?? "");
    const label = String((ar ? o.nameAr : o.name) ?? o.name ?? o.nameEn ?? value);
    return value ? { value, label } : null;
  }
  return null;
}

// Static fallback lists so city/job-title are ALWAYS dropdowns (like the app), even before the live
// master-data list loads or if it's unavailable. Live `/master-data/*` overrides these when fetched.
const FALLBACK_CITIES: Opt[] = [
  "Riyadh", "Jeddah", "Makkah", "Madinah", "Dammam", "Khobar", "Dhahran", "Jubail",
  "Taif", "Tabuk", "Abha", "Hail", "Buraidah", "Yanbu", "Najran", "Khamis Mushait",
].map((c) => ({ value: c, label: c }));
const FALLBACK_JOBS: Opt[] = [
  "Company Owner", "Project Manager", "Procurement", "Site Engineer", "Operations", "Logistics", "Foreman", "Other",
].map((j) => ({ value: j, label: j }));

/**
 * Account-creation form (web-app/003 Flow 1, AC-01/02/03/04/05/06). Prototype design, app/AC fields:
 * first/last name, city + job-title selectors (master-data), email (required unless already collected at
 * the OTP step) + optional WhatsApp; phone read-only.
 * Submit → `/api/profile/complete` → guest becomes basic → refresh session → `onDone` or `next`.
 *
 * Rendered ONLY by AccountModal now. The standalone /onboarding route that also mounted it was removed:
 * it was a second profile-creation surface reachable from the sidebar tier nudge, and the only one that
 * let a phone-first account be completed without an email.
 */
export function OnboardingForm({
  next,
  onDone,
  headline,
  subhead,
  requireEmail = true,
  showEmail = true,
  phoneVerify,
  onSignIn,
}: {
  next: string;
  /** When provided, called after the account is created instead of navigating (e.g. modal flow). */
  onDone?: () => void;
  /** Optional header overrides (e.g. "Create your account to post your request"). */
  headline?: string;
  subhead?: string;
  /** Whether email is a required field. Defaults to REQUIRED: every account is meant to end with both
   *  a phone and an email (AccountModal's invariant), and this form is the only place a phone-first user
   *  supplies one. The default used to be false for the standalone /onboarding route — which made that
   *  route the single way to finish a profile with no email. The route is gone; the default now matches
   *  the invariant so a future caller can't reintroduce the hole by omitting the prop. */
  requireEmail?: boolean;
  /** When false, the email field is omitted entirely — the combined create gate collects (and the
   *  backend persists) email at the phone/OTP step, so the register step must not ask for it again.
   *  Default true keeps email on the phone-first path + the mobile-handoff path. */
  showEmail?: boolean;
  /** Email-first (Modal 2, Case 1): no account/session yet. Render the phone field with an INLINE
   *  Send-code + OTP right in this form; on submit we verify the phone with the onboardingToken (which
   *  creates the account + session) and then save the profile. Absent = phone already verified (Case 2). */
  phoneVerify?: { onboardingToken: string };
  /** Case 1: if the typed phone already has an account, we show "sign in instead" — clicking it calls
   *  this to drop back to Modal 1 (phone sign-in). */
  onSignIn?: () => void;
}) {
  const t = useT();
  const o = t.onboarding;
  const { locale } = useLocale();
  const router = useRouter();
  const { user, refresh, signIn } = useSession();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [city, setCity] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [cities, setCities] = useState<Opt[]>(FALLBACK_CITIES);
  const [jobs, setJobs] = useState<Opt[]>(FALLBACK_JOBS);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fe, setFe] = useState<Record<string, string>>({});
  // Inline phone verification (Case 1 only): the phone becomes an in-form field with Send-code + OTP +
  // a Verify step. Verify ≠ create — the account is made only at "Create account" (complete-signup).
  const [dial, setDial] = useState(SAUDI_DIAL);
  const [phoneDigits, setPhoneDigits] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [phoneErr, setPhoneErr] = useState<AuthKind | null>(null);
  // The onboarding token evolves: email✓ (from Modal 1) → phone✓ (after the inline Verify). The phone✓
  // token is what complete-signup consumes.
  const [activeToken, setActiveToken] = useState(phoneVerify?.onboardingToken ?? "");
  const phoneE164 = `${dial}${phoneDigits.replace(/\D/g, "")}`;
  const [sentPre, sentPost] = t.auth.codeSentTo.split("{phone}");
  const resetPhone = () => { setOtpSent(false); setPhoneVerified(false); setOtpCode(""); setPhoneErr(null); };

  const sendPhoneCode = async () => {
    if (!phoneVerify || !phoneDigits.trim()) return;
    setPhoneErr(null);
    setPhoneBusy(true);
    const r = await postAuth("/api/auth/request-code", { onboardingToken: activeToken, phone: phoneE164, countryCode: dial, otpMethod: "SMS" });
    setPhoneBusy(false);
    if (r.ok) { setOtpSent(true); setPhoneVerified(false); setOtpCode(""); }
    else setPhoneErr(r.kind);
  };

  // Modal 2b: verify the phone against the token → receive the phone✓ token. Creates NOTHING.
  const verifyPhone = async () => {
    if (!phoneVerify || otpCode.replace(/\D/g, "").length < 4) return;
    setPhoneErr(null);
    setPhoneBusy(true);
    const r = await postAuth("/api/auth/verify", { onboardingToken: activeToken, phone: phoneE164, code: otpCode.replace(/\D/g, "") });
    setPhoneBusy(false);
    if (r.ok && r.data.phoneVerified) { setActiveToken(String(r.data.onboardingToken ?? activeToken)); setPhoneVerified(true); }
    else if (!r.ok) setPhoneErr(r.kind);
  };

  useEffect(() => {
    const ar = locale === "ar";
    const load = async (path: string, set: (o: Opt[]) => void) => {
      try {
        const r = await fetch(path);
        if (!r.ok) return;
        const raw: unknown = await r.json();
        // Backend wraps the list under a key (`{ cities: [...] }` / `{ jobTitles: [...] }`),
        // and the BFF unwraps the `data` envelope — so take the first array-valued property.
        const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
        const arr = Array.isArray(raw) ? raw : ((Object.values(obj).find((v) => Array.isArray(v)) as unknown[]) ?? []);
        const opts = arr.map((x) => toOpt(x, ar)).filter((x): x is Opt => !!x);
        if (opts.length) set(opts);
      } catch {
        /* leave the static fallback list (still a dropdown) */
      }
    };
    void load("/api/master-data/cities", setCities);
    void load("/api/master-data/job-titles", setJobs);
  }, [locale]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    const next_fe: Record<string, string> = {};
    if (firstName.trim().length < 2 || firstName.trim().length > 30) next_fe.firstName = o.errors.firstName;
    if (lastName.trim().length < 2 || lastName.trim().length > 50) next_fe.lastName = o.errors.lastName;
    if (!city.trim()) next_fe.city = o.errors.city;
    if (!jobTitle.trim()) next_fe.jobTitle = o.errors.jobTitle;
    // Email is optional by default, required in the combined create gate, and omitted entirely when
    // showEmail is false (already collected + persisted at the phone/OTP step). When shown + present,
    // it must be a valid address.
    const emailVal = email.trim();
    if (showEmail) {
      if (requireEmail && !emailVal) next_fe.email = o.errors.emailRequired;
      else if (emailVal && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailVal)) next_fe.email = o.errors.email;
    }
    if (whatsapp.trim() && !/^(\+?966|0)?5\d{8}$/.test(whatsapp.replace(/\s/g, ""))) next_fe.whatsapp = o.errors.whatsapp;
    // Case 1: the phone must be VERIFIED (inline) before the account can be created.
    if (phoneVerify && !phoneVerified) next_fe.phone = o.errors.phone;
    if (Object.keys(next_fe).length) {
      setFe(next_fe);
      return;
    }
    setFe({});
    setBusy(true);
    // Case 1 (email-first): CREATE the account atomically — phone✓ token + full profile in one call.
    // Nothing was written until now, so an abandoned form leaves no account. No /profile/complete.
    if (phoneVerify) {
      const cr = await postAuth("/api/auth/complete-signup", {
        onboardingToken: activeToken,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        city: city.trim(),
        jobTitle: jobTitle.trim(),
        companyName: companyName.trim() || undefined,
        whatsapp: whatsapp.trim() || undefined,
      });
      setBusy(false);
      if (!cr.ok) {
        // Phone-specific errors show by the phone field (with the sign-in link for phone_taken);
        // phone_not_verified also drops the ✓ so they re-verify. Others surface at the top.
        if (cr.kind === "phone_not_verified") { setPhoneVerified(false); setPhoneErr("phone_not_verified"); }
        else if (cr.kind === "phone_taken") setPhoneErr("phone_taken");
        else setErr(t.auth.errors[cr.kind]);
        return;
      }
      signIn(cr.data.user as RenterUser);
      await refresh();
      if (onDone) { onDone(); return; }
      const dest = next.startsWith("/") && !next.startsWith("//") ? next : "/";
      router.replace(dest);
      return;
    }
    let res: Response;
    try {
      res = await fetch("/api/profile/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          city: city.trim(),
          jobTitle: jobTitle.trim(),
          companyName: companyName.trim() || undefined,
          email: showEmail ? email.trim() || undefined : undefined,
          whatsapp: whatsapp.trim() || undefined,
        }),
      });
    } catch {
      setBusy(false);
      setErr(o.errors.offline); // AC-23
      return;
    }
    setBusy(false);
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as { detail?: string };
      setErr(d.detail || o.errors.submit);
      return;
    }
    await refresh(); // AC-05: session tier guest→basic, unblocks canCreate
    if (onDone) {
      onDone(); // modal flow: caller closes + continues (e.g. auto-submit the RFQ)
      return;
    }
    const dest = next.startsWith("/") && !next.startsWith("//") ? next : "/"; // AC-06
    router.replace(dest);
  };

  const inputCls =
    "h-[46px] w-full rounded-sm border border-border bg-surface px-4 text-body outline-0 focus:border-brand";
  const labelCls = "mb-2 block text-meta font-semibold text-navy-mid";

  return (
    <form onSubmit={submit} noValidate>
      <div className="flex items-start gap-3 border-b border-border p-6">
        {/* Back to step 1 (OTP entry) — keeps the two steps tied so the user can return to the code step. */}
        {onSignIn && (
          <button type="button" onClick={onSignIn} aria-label={t.common.back} className="grid h-10 w-10 flex-none place-items-center rounded-sm border border-border text-navy-mid transition hover:bg-surface2">
            <Icon name="arrow_back" size={20} className="rtl:-scale-x-100" />
          </button>
        )}
        <span className="grid h-10 w-10 flex-none place-items-center rounded-sm bg-brand-soft text-brand">
          <Icon name="person_add" size={22} />
        </span>
        <div>
          <h1 className="text-display font-extrabold text-navy">{headline ?? o.title}</h1>
          <p className="mt-1 text-body text-muted">{subhead ?? o.subtitle}</p>
        </div>
      </div>

      <div className="flex flex-col gap-4 p-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>{o.firstName}</label>
            <input className={inputCls} value={firstName} onChange={(e) => setFirstName(e.target.value)} maxLength={30} />
            {fe.firstName && <p className="mt-1 text-meta text-danger">{fe.firstName}</p>}
          </div>
          <div>
            <label className={labelCls}>{o.lastName}</label>
            <input className={inputCls} value={lastName} onChange={(e) => setLastName(e.target.value)} maxLength={50} />
            {fe.lastName && <p className="mt-1 text-meta text-danger">{fe.lastName}</p>}
          </div>
        </div>

        {phoneVerify ? (
          // Case 1 (email-first): phone is a field here, verified INLINE (Send code → Verify). Verify
          // creates nothing; the account is created on "Create account" (complete-signup), atomically.
          <div>
            <label className={labelCls}>
              {o.phone} <span className="text-danger">*</span>
              {phoneVerified && <span className="ms-2 text-label font-semibold text-ok">✓ {t.auth.phoneVerified}</span>}
            </label>
            <div className="flex gap-3" dir="ltr">
              <select
                aria-label={t.auth.countryLabel}
                value={dial}
                onChange={(e) => { setDial(e.target.value); resetPhone(); }}
                disabled={phoneVerified}
                className="h-[46px] rounded-sm border border-border bg-surface px-3 text-body font-semibold text-navy outline-0 focus:border-brand disabled:bg-disabled-bg disabled:text-disabled-fg"
              >
                {COUNTRY_CODES.map((c) => (
                  <option key={c.dial} value={c.dial}>{c.flag} {c.dial}</option>
                ))}
              </select>
              <input
                className={`${inputCls} flex-1 ${phoneVerified ? "bg-surface2 text-muted" : ""}`}
                type="tel"
                inputMode="numeric"
                maxLength={11}
                value={phoneDigits}
                onChange={(e) => { setPhoneDigits(e.target.value); resetPhone(); }}
                readOnly={phoneVerified}
                placeholder={t.auth.phonePlaceholder}
                dir="ltr"
              />
            </div>
            {phoneVerified ? null : !otpSent ? (
              <button
                type="button"
                onClick={sendPhoneCode}
                disabled={phoneBusy || !phoneDigits.trim()}
                className={btn("secondary", "md", { className: "mt-3 transition" })}
              >
                <Icon name="sms" size={16} /> {phoneBusy ? t.auth.sending : t.auth.sendCode}
              </button>
            ) : (
              <div className="mt-3">
                <p className="mb-2 text-meta text-muted">{sentPre}<b className="text-navy" dir="ltr">{phoneE164}</b>{sentPost}</p>
                <div className="flex gap-3">
                  <input
                    className={`${inputCls} flex-1`}
                    inputMode="numeric"
                    maxLength={4}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    placeholder="1234"
                    dir="ltr"
                    style={{ letterSpacing: "0.35em", fontFamily: "var(--font-plex), monospace" }}
                  />
                  <button
                    type="button"
                    onClick={verifyPhone}
                    disabled={phoneBusy || otpCode.replace(/\D/g, "").length < 4}
                    className={btn("primary", "md", { className: "flex-none transition" })}
                  >
                    {phoneBusy ? t.auth.verifying : t.auth.verifyPhone}
                  </button>
                </div>
                <button type="button" onClick={sendPhoneCode} className="mt-2 text-meta font-semibold text-info">{t.auth.resend}</button>
              </div>
            )}
            {fe.phone && <p className="mt-1 text-meta text-danger">{fe.phone}</p>}
            {phoneErr && (
              <p className="mt-1 text-meta text-danger">
                {t.auth.errors[phoneErr]}
                {phoneErr === "phone_taken" && onSignIn && (
                  <> <button type="button" onClick={onSignIn} className="font-semibold text-info underline">{t.auth.signInInstead}</button></>
                )}
              </p>
            )}
          </div>
        ) : (
          <div>
            <label className={labelCls}>
              {o.phone} <span className="ms-1 text-label font-semibold text-ok">✓ {o.verified}</span>
            </label>
            <input className={`${inputCls} bg-surface2 text-muted`} value={user?.phone ?? ""} readOnly dir="ltr" />
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>{o.city}</label>
            <select className={inputCls} value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="">{o.selectCity}</option>
              {cities.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            {fe.city && <p className="mt-1 text-meta text-danger">{fe.city}</p>}
          </div>
          <div>
            <label className={labelCls}>{o.jobTitle}</label>
            <select className={inputCls} value={jobTitle} onChange={(e) => setJobTitle(e.target.value)}>
              <option value="">{o.selectJobTitle}</option>
              {jobs.map((j) => (
                <option key={j.value} value={j.value}>{j.label}</option>
              ))}
            </select>
            {fe.jobTitle && <p className="mt-1 text-meta text-danger">{fe.jobTitle}</p>}
          </div>
        </div>

        <div>
          <label className={labelCls}>
            {o.companyName} <span className="text-label font-semibold text-muted">— {o.optional}</span>
          </label>
          <input className={inputCls} value={companyName} onChange={(e) => setCompanyName(e.target.value)} maxLength={200} placeholder={o.companyNamePlaceholder} />
        </div>

        <div className={`grid grid-cols-1 gap-3 ${showEmail ? "sm:grid-cols-2" : ""}`}>
          {showEmail && (
            <div>
              <label className={labelCls}>
                {o.email}{" "}
                {requireEmail ? (
                  <span className="text-danger">*</span>
                ) : (
                  <span className="text-label font-semibold text-muted">— {o.optional}</span>
                )}
              </label>
              <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" />
              {fe.email && <p className="mt-1 text-meta text-danger">{fe.email}</p>}
            </div>
          )}
          <div>
            <label className={labelCls}>
              {o.whatsapp} <span className="text-label font-semibold text-muted">— {o.optional}</span>
            </label>
            <input className={inputCls} inputMode="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="+9665XXXXXXXX" dir="ltr" />
            {fe.whatsapp && <p className="mt-1 text-meta text-danger">{fe.whatsapp}</p>}
          </div>
        </div>

        {err && <p className="text-body font-semibold text-danger">{err}</p>}
      </div>

      <div className="border-t border-border p-6">
        <button
          type="submit"
          disabled={busy || (!!phoneVerify && !phoneVerified)}
          className={btn("primary", "lg", { full: true, className: "flex transition" })}
        >
          {busy ? o.submitting : o.submit}
          {!busy && <Icon name="arrow_forward" size={18} className="rtl:scale-x-[-1]" />}
        </button>
      </div>
    </form>
  );
}
