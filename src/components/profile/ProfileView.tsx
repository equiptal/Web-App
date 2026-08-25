"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useT, useLocale, type Locale } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { useAuthGate } from "@/components/auth/AuthGate";
import { PUBLIC_WEB_ENABLED } from "@/lib/flags";
import { Icon } from "@/components/ui";
import type { RenterProfile, VerificationStatus } from "@/lib/contract/onboarding";
import { updateLanguage } from "@/lib/api/profile-client";
import { Field, FieldGrid, MastheadPill, PageMasthead, Row, RowList, Section } from "@/components/PageSection";
import { EditProfileForm } from "./EditProfileForm";
import { ChangePhoneModal } from "./ChangePhoneModal";
import { DeleteAccountModal } from "./DeleteAccountModal";

const SUPPORT_URL = "https://moedatech.net/contact";
const PRIVACY_URL = "https://moedatech.net/privacy";
const TERMS_URL = "https://moedatech.net/terms";

/**
 * Profile tab (app parity: profile_page.dart + settings_page.dart) — navy header, tier banner, an
 * editable profile card, company/verification state, and a settings section (language, change phone,
 * legal/support, delete account, logout). All web-only; every action proxies an existing backend
 * endpoint via the /api/me/* BFF routes.
 */
export function ProfileView() {
  const t = useT();
  const p = t.profile;
  const { locale, setLocale } = useLocale();
  const ar = locale === "ar";
  const router = useRouter();
  const { user, tier, signOut } = useSession();
  const { openAuth } = useAuthGate();

  const [profile, setProfile] = useState<RenterProfile | null>(null);
  const [verification, setVerification] = useState<VerificationStatus>("none");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showChangePhone, setShowChangePhone] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const [langBusy, setLangBusy] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { user?: RenterProfile; verification?: { status?: VerificationStatus } }) => {
        if (!active) return;
        if (d.user) setProfile(d.user);
        if (d.verification?.status) setVerification(d.verification.status);
      })
      .catch(() => active && setLoadError(true))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const onSaved = (next: RenterProfile) => {
    setProfile(next);
    setEditing(false);
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 2200);
  };

  const switchLang = async (l: Locale) => {
    if (l === locale || langBusy) return;
    setLocale(l); // instant UI locale (i18n)
    setLangBusy(true);
    await updateLanguage(l); // best-effort server persist (push-notification language)
    setLangBusy(false);
  };

  const doLogout = async () => {
    await signOut();
    router.replace("/");
  };

  const onReLogin = () => {
    // Phone (identity) changed — cookies were cleared by the BFF; drop client state + re-authenticate.
    // Public web: re-auth via the modal form in place (no /login page). Legacy/prod: the /login gate.
    void signOut();
    if (PUBLIC_WEB_ENABLED) openAuth();
    else router.replace("/login");
  };

  const fullName = [profile?.firstName, profile?.lastName].filter(Boolean).join(" ").trim();
  const tierLabel = tier === "verified" ? t.shell.tierVerified : tier === "basic" ? t.shell.tierBasic : t.shell.tierGuest;


  return (
    <div className="pb-10" dir={ar ? "rtl" : "ltr"}>
      {/* One masthead shape across the account pages — see `PageMasthead`. */}
      <PageMasthead
        icon={<Icon name="account_circle" size={34} className="text-white" />}
        title={p.greeting.replace("{name}", fullName ? (ar ? `، ${fullName}` : `, ${fullName}`) : "")}
        subtitle={<span dir="ltr">{user?.phone ?? profile?.phone ?? "—"}</span>}
        badge={
          <MastheadPill tone={tier === "verified" ? "ok" : "neutral"}>
            {tier === "verified" && <Icon name="verified" size={13} />}
            {tierLabel}
          </MastheadPill>
        }
      />

      {loading && <p className="mt-6 text-center text-[13px] text-muted">…</p>}
      {loadError && !loading && (
        <p className="mt-6 rounded-[12px] border border-danger/30 bg-danger-soft px-4 py-3 text-center text-[13px] font-semibold text-danger">
          {p.loadError}
        </p>
      )}

      {/* Tier banner — basic renter → verify (verified shows the company card verified state below). */}
      {!loading && tier === "basic" && verification !== "pending" && verification !== "verified" && (
        <button
          // → /company, matching the sidebar "Get verified" and the "Start verification" card below.
          // This banner renders alongside that card, so pointing them at different destinations would
          // give the same page two verification nudges that disagree.
          onClick={() => router.push("/company")}
          className="mt-4 flex w-full items-center justify-between rounded-[12px] border border-brand/30 bg-brand-soft px-4 py-3 text-start transition hover:border-brand"
        >
          <div>
            <p className="text-[13.5px] font-bold text-navy">{t.shell.tierBasic} · {t.home.nudgeBasicTitle}</p>
            <p className="text-[12.5px] text-muted">{t.home.nudgeBasicBody}</p>
          </div>
          <Icon name="arrow_forward" size={18} className="flex-none text-brand rtl:scale-x-[-1]" />
        </button>
      )}

      {!loading && profile && (
        <Section
          title={p.editProfile}
          action={
            !editing && (
              <button
                onClick={() => setEditing(true)}
                className="inline-flex h-8 items-center gap-1.5 rounded-[9px] border border-border bg-surface px-3 text-[12.5px] font-bold text-navy-mid hover:bg-surface2"
              >
                <Icon name="edit" size={15} /> {p.editProfile}
              </button>
            )
          }
        >
          {savedToast && (
            <p className="mx-4 mt-4 flex items-center gap-1.5 rounded-[10px] border border-ok/30 bg-ok-soft px-3 py-2 text-[12.5px] font-semibold text-ok">
              <Icon name="check_circle" size={15} /> {p.saved}
            </p>
          )}
          {editing ? (
            <div className="p-4">
              <EditProfileForm profile={profile} onSaved={onSaved} onCancel={() => setEditing(false)} />
            </div>
          ) : (
            <FieldGrid>
              <Field label={`${p.firstName} / ${p.lastName}`} value={fullName || "—"} />
              <Field label={p.city} value={profile.city || "—"} />
              <Field label={p.jobTitle} value={profile.jobTitle || "—"} />
              <Field label={p.companyName} value={profile.companyName || "—"} />
              <Field label={p.email} value={profile.email || "—"} ltr />
              <Field label={p.whatsapp} value={profile.whatsapp || "—"} ltr />
            </FieldGrid>
          )}
        </Section>
      )}

      {/* ── The company lives on ITS OWN PAGE now (owner, 2026-08-26) ─────────────────────────────
          Two cards used to sit here — one for verification state, one for the firm this account
          belongs to — while /company carried the same facts a third time. A reader had to know which
          of two pages held which half of one subject. This is a DOOR, not a summary: the state in a
          line, and the page that owns it one tap away. */}
      {!loading && profile && (
        <Section title={t.shell.company}>
          <Row
            icon={verification === "verified" ? "verified" : "business_center"}
            label={profile.companyName ?? p.companyNoneTitle}
            hint={
              verification === "verified"
                ? p.companyVerifiedTitle
                : verification === "pending"
                  ? p.companyPendingTitle
                  : verification === "rejected"
                    ? p.companyRejectedTitle
                    : p.companyNoneBody
            }
            onClick={() => router.push(verification === "rejected" ? "/verify" : "/company")}
          />
        </Section>
      )}

      {/* Rewards — coming soon (grayed, app parity). */}
      {!loading && (
        <Section>
          <div className="opacity-70">
            <Row icon="star" label={p.rewards} hint={p.comingSoon} chevron={false} />
          </div>
        </Section>
      )}

      {/* SETTINGS is what the account menu calls this page, so it is a titled section OF it rather
          than a separate destination (owner, 2026-08-26). */}
      {!loading && (
        <>
          <Section title={p.settings}>
            <RowList>
              <Row icon="language" label={p.language} hint={ar ? p.arabic : p.english} chevron={false}>
                <span className="flex flex-none overflow-hidden rounded-[9px] border border-border">
                  <LangBtn active={!ar} disabled={langBusy} onClick={() => switchLang("en")}>EN</LangBtn>
                  <LangBtn active={ar} disabled={langBusy} onClick={() => switchLang("ar")}>عر</LangBtn>
                </span>
              </Row>
              <Row icon="smartphone" label={p.changePhone} hint={p.changePhoneSub} onClick={() => setShowChangePhone(true)} />
              <Row icon="shield" label={p.privacy} href={PRIVACY_URL} />
              <Row icon="description" label={p.terms} href={TERMS_URL} />
              <Row icon="support_agent" label={p.support} href={SUPPORT_URL} />
            </RowList>
          </Section>

          {/* Leaving and deleting, together and last. Sign out sat among the links to privacy and
              support, where it read as another page to visit rather than the end of a session. */}
          <Section title={p.logout}>
            <RowList>
              <Row icon="logout" label={p.logout} onClick={doLogout} chevron={false} />
              <Row icon="delete" label={p.deleteAccount} hint={p.deleteAccountSub} danger onClick={() => setShowDelete(true)} chevron={false} />
            </RowList>
          </Section>
        </>
      )}

      {showChangePhone && <ChangePhoneModal onClose={() => setShowChangePhone(false)} onReLogin={onReLogin} />}
      {showDelete && (
        <DeleteAccountModal
          onClose={() => setShowDelete(false)}
          onDeleted={() => {
            void signOut();
            router.replace("/");
          }}
        />
      )}
    </div>
  );
}

function LangBtn({ active, disabled, onClick, children }: { active: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`px-3 py-1.5 text-[12.5px] font-bold transition disabled:opacity-60 ${active ? "bg-brand text-brand-fg" : "bg-surface text-navy-mid hover:bg-surface2"}`}
    >
      {children}
    </button>
  );
}

