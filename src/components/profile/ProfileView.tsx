"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useT, useLocale, type Locale } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { Icon } from "@/components/ui";
import type { RenterProfile, VerificationStatus } from "@/lib/contract/onboarding";
import { updateLanguage } from "@/lib/api/profile-client";
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

  const [profile, setProfile] = useState<RenterProfile | null>(null);
  const [verification, setVerification] = useState<VerificationStatus>("none");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showChangePhone, setShowChangePhone] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const [langBusy, setLangBusy] = useState(false);
  const [company, setCompany] = useState<CompanyInfo | null>(null);

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
    // Company details for the company card (fields are under `submission`; the /me payload lacks the
    // presigned logo URL). Merge with the doc-URLs fetch below.
    fetch("/api/verification", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { submission?: { companyLogoUrl?: string | null; companyName?: string | null; authorityRole?: string | null; nationalId?: string | null; companyCity?: string | null; companyAddress?: string | null } } | null) => {
        if (!active || !d?.submission) return;
        const s = d.submission;
        setCompany((c) => ({
          logoUrl: s.companyLogoUrl ?? null,
          legalName: s.companyName ?? null,
          authorityRole: s.authorityRole ?? null,
          nationalId: s.nationalId ?? null,
          companyCity: s.companyCity ?? null,
          companyAddress: s.companyAddress ?? null,
          docs: c?.docs ?? null,
        }));
      })
      .catch(() => {});
    // Presigned document URLs (verified-only; a non-verified caller 403s → we just skip the View links).
    fetch("/api/verification/docs", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { crDocUrl?: string | null; vatDocUrl?: string | null; nationalAddressDocUrl?: string | null } | null) => {
        if (!active || !d) return;
        setCompany((c) => ({
          logoUrl: c?.logoUrl ?? null, legalName: c?.legalName ?? null, authorityRole: c?.authorityRole ?? null,
          nationalId: c?.nationalId ?? null, companyCity: c?.companyCity ?? null, companyAddress: c?.companyAddress ?? null,
          docs: { crDocUrl: d.crDocUrl ?? null, vatDocUrl: d.vatDocUrl ?? null, nationalAddressDocUrl: d.nationalAddressDocUrl ?? null },
        }));
      })
      .catch(() => {});
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
    void signOut();
    router.replace("/login");
  };

  const fullName = [profile?.firstName, profile?.lastName].filter(Boolean).join(" ").trim();
  const tierLabel = tier === "verified" ? t.shell.tierVerified : tier === "basic" ? t.shell.tierBasic : t.shell.tierGuest;

  const card = "rounded-[14px] border border-border bg-surface";
  const rowCls = "flex w-full items-center gap-3 px-4 py-3.5 text-start transition hover:bg-surface2";

  return (
    <div className="pb-10" dir={ar ? "rtl" : "ltr"}>
      {/* Navy header */}
      <div className="flex items-center gap-4 rounded-[16px] bg-navy p-5 text-white">
        <span className="grid h-16 w-16 flex-none place-items-center rounded-full bg-white/12 text-white">
          <Icon name="account_circle" size={38} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-extrabold">
            {p.greeting.replace("{name}", fullName ? (ar ? `، ${fullName}` : `, ${fullName}`) : "")}
          </p>
          <p className="mt-0.5 truncate text-[13px] text-white/70" dir="ltr">{user?.phone ?? profile?.phone ?? "—"}</p>
          <span className="mt-2 inline-flex items-center gap-1 rounded-md bg-white/12 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide">
            {tier === "verified" && <Icon name="verified" size={13} />}
            {tierLabel}
          </span>
        </div>
      </div>

      {loading && <p className="mt-6 text-center text-[13px] text-muted">…</p>}
      {loadError && !loading && (
        <p className="mt-6 rounded-[12px] border border-danger/30 bg-danger-soft px-4 py-3 text-center text-[13px] font-semibold text-danger">
          {p.loadError}
        </p>
      )}

      {/* Tier banner — basic renter → verify (verified shows the company card verified state below). */}
      {!loading && tier === "basic" && verification !== "pending" && verification !== "verified" && (
        <button
          onClick={() => router.push("/verify")}
          className="mt-4 flex w-full items-center justify-between rounded-[12px] border border-brand/30 bg-brand-soft px-4 py-3 text-start transition hover:border-brand"
        >
          <div>
            <p className="text-[13.5px] font-bold text-navy">{t.shell.tierBasic} · {t.home.nudgeBasicTitle}</p>
            <p className="text-[12.5px] text-muted">{t.home.nudgeBasicBody}</p>
          </div>
          <Icon name="arrow_forward" size={18} className="flex-none text-brand rtl:scale-x-[-1]" />
        </button>
      )}

      {/* Profile card — read-only summary + edit toggle. */}
      {!loading && profile && (
        <div className={`mt-4 ${card} p-5`}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[14px] font-extrabold text-navy">{p.editProfile}</h2>
            {!editing && (
              <button
                onClick={() => setEditing(true)}
                className="inline-flex items-center gap-1.5 rounded-[9px] border border-border bg-surface px-3 py-1.5 text-[12.5px] font-bold text-navy-mid hover:bg-surface2"
              >
                <Icon name="edit" size={15} /> {p.editProfile}
              </button>
            )}
          </div>

          {savedToast && (
            <p className="mb-3 flex items-center gap-1.5 rounded-[10px] border border-ok/30 bg-ok-soft px-3 py-2 text-[12.5px] font-semibold text-ok">
              <Icon name="check_circle" size={15} /> {p.saved}
            </p>
          )}

          {editing ? (
            <EditProfileForm profile={profile} onSaved={onSaved} onCancel={() => setEditing(false)} />
          ) : (
            <dl className="grid grid-cols-1 gap-y-3 sm:grid-cols-2 sm:gap-x-5">
              <Field label={`${p.firstName} / ${p.lastName}`} value={fullName || "—"} />
              <Field label={p.city} value={profile.city || "—"} />
              <Field label={p.jobTitle} value={profile.jobTitle || "—"} />
              <Field label={p.companyName} value={profile.companyName || "—"} />
              <Field label={p.email} value={profile.email || "—"} ltr />
              <Field label={p.whatsapp} value={profile.whatsapp || "—"} ltr />
            </dl>
          )}
        </div>
      )}

      {/* Company / verification card. */}
      {!loading && profile && <CompanyCard status={verification} profile={profile} company={company} onGo={() => router.push("/verify")} />}

      {/* Rewards — coming soon (grayed, app parity). */}
      {!loading && (
        <div className={`mt-4 ${card} flex items-center gap-3 p-4 opacity-70`}>
          <span className="grid h-10 w-10 flex-none place-items-center rounded-[10px] bg-surface2 text-muted">
            <Icon name="star" size={20} />
          </span>
          <div className="flex-1">
            <p className="text-[13.5px] font-bold text-navy">{p.rewards}</p>
            <p className="text-[12px] text-muted">{p.comingSoon}</p>
          </div>
        </div>
      )}

      {/* Settings section. */}
      {!loading && (
        <div className="mt-6">
          <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wide text-muted">{p.settings}</p>
          <div className={`${card} divide-y divide-border overflow-hidden`}>
            {/* Language */}
            <div className="flex items-center gap-3 px-4 py-3.5">
              <Icon name="language" size={20} className="flex-none text-navy-mid" />
              <div className="flex-1">
                <p className="text-[13.5px] font-bold text-navy">{p.language}</p>
                <p className="text-[12px] text-muted">{ar ? p.arabic : p.english}</p>
              </div>
              <div className="flex flex-none overflow-hidden rounded-[9px] border border-border">
                <LangBtn active={!ar} disabled={langBusy} onClick={() => switchLang("en")}>EN</LangBtn>
                <LangBtn active={ar} disabled={langBusy} onClick={() => switchLang("ar")}>عر</LangBtn>
              </div>
            </div>

            {/* Change phone */}
            <button className={rowCls} onClick={() => setShowChangePhone(true)}>
              <Icon name="smartphone" size={20} className="flex-none text-navy-mid" />
              <div className="flex-1">
                <p className="text-[13.5px] font-bold text-navy">{p.changePhone}</p>
                <p className="text-[12px] text-muted">{p.changePhoneSub}</p>
              </div>
              <Icon name="chevron_right" size={18} className="flex-none text-muted rtl:scale-x-[-1]" />
            </button>

            <LinkRow icon="shield" label={p.privacy} href={PRIVACY_URL} />
            <LinkRow icon="description" label={p.terms} href={TERMS_URL} />
            <LinkRow icon="support_agent" label={p.support} href={SUPPORT_URL} />

            {/* Logout */}
            <button className={rowCls} onClick={doLogout}>
              <Icon name="logout" size={20} className="flex-none text-navy-mid rtl:scale-x-[-1]" />
              <p className="flex-1 text-[13.5px] font-bold text-navy">{p.logout}</p>
            </button>
          </div>

          {/* Delete account — destructive, set apart. */}
          <button
            onClick={() => setShowDelete(true)}
            className="mt-4 flex w-full items-center gap-3 rounded-[14px] border border-danger/30 bg-surface px-4 py-3.5 text-start transition hover:bg-danger-soft"
          >
            <Icon name="delete" size={20} className="flex-none text-danger" />
            <div className="flex-1">
              <p className="text-[13.5px] font-bold text-danger">{p.deleteAccount}</p>
              <p className="text-[12px] text-muted">{p.deleteAccountSub}</p>
            </div>
          </button>
        </div>
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

function Field({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div>
      <dt className="text-[11.5px] font-bold text-navy-mid">{label}</dt>
      <dd className="mt-0.5 truncate text-[13.5px] text-navy" dir={ltr ? "ltr" : undefined}>{value}</dd>
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

function LinkRow({ icon, label, href }: { icon: string; label: string; href: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="flex w-full items-center gap-3 px-4 py-3.5 transition hover:bg-surface2">
      <Icon name={icon} size={20} className="flex-none text-navy-mid" />
      <p className="flex-1 text-[13.5px] font-bold text-navy">{label}</p>
      <Icon name="open_in_new" size={16} className="flex-none text-muted" />
    </a>
  );
}

type CompanyInfo = {
  logoUrl: string | null;
  legalName: string | null;
  authorityRole: string | null;
  nationalId: string | null;
  companyCity: string | null;
  companyAddress: string | null;
  docs: { crDocUrl: string | null; vatDocUrl: string | null; nationalAddressDocUrl: string | null } | null;
};

function CompanyCard({ status, profile, company, onGo }: { status: VerificationStatus; profile: RenterProfile; company: CompanyInfo | null; onGo: () => void }) {
  const t = useT();
  const { locale } = useLocale();
  const ar = locale === "ar";
  const L = (e: string, a: string) => (ar ? a : e);
  const p = t.profile;
  const base = "mt-4 rounded-[14px] border p-4";

  if (status === "verified") {
    const name = company?.legalName || profile.companyName || L("Your company", "شركتك");
    const roleLabel = (r: string | null | undefined) => { const u = (r ?? "").toLowerCase(); return u === "owner" ? L("Owner", "المالك") : u === "manager" ? L("Manager", "مدير") : u === "employee" ? L("Employee", "موظف") : (r || null); };
    const docs = company?.docs;
    // Real text values (app parity: authority role, national ID, city, full national address).
    const valRows: { label: string; value: string | null }[] = [
      { label: L("Authority role", "الصفة"), value: roleLabel(company?.authorityRole) },
      { label: L("National ID", "رقم الهوية"), value: company?.nationalId ?? null },
      { label: L("City", "المدينة"), value: company?.companyCity ?? null },
      { label: L("National Address", "العنوان الوطني"), value: company?.companyAddress ?? profile.nationalAddress ?? null },
    ];
    // CR / VAT / National-Address are DOCUMENTS (no number) — show a "View" link to the presigned file
    // (app's doc-preview tiles); fall back to the green "Verified" pill when the URL isn't available.
    const docRows: { label: string; url: string | null }[] = [
      { label: L("CR document", "وثيقة السجل التجاري"), url: docs?.crDocUrl ?? null },
      { label: L("VAT document", "وثيقة الرقم الضريبي"), url: docs?.vatDocUrl ?? null },
      { label: L("National Address certificate", "شهادة العنوان الوطني"), url: docs?.nationalAddressDocUrl ?? null },
    ];
    const verifiedPill = <span className="inline-flex items-center gap-1 text-ok"><Icon name="verified" size={13} />{L("Verified", "موثَّق")}</span>;
    return (
      <div className={`${base} border-ok/30 bg-ok-soft`}>
        <div className="flex items-center gap-3">
          {company?.logoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={company.logoUrl} alt="" className="h-12 w-12 flex-none rounded-[10px] border border-ok/25 bg-white object-contain p-1" />
          ) : (
            <span className="grid h-12 w-12 flex-none place-items-center rounded-[10px] border border-ok/25 bg-white text-ok"><Icon name="verified" size={24} /></span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-extrabold text-navy">{name}</p>
            <p className="mt-0.5 inline-flex items-center gap-1 text-[12px] font-bold text-ok"><Icon name="verified" size={14} />{p.companyVerifiedTitle}</p>
          </div>
        </div>
        <dl className="mt-3 grid grid-cols-1 gap-y-2.5 border-t border-ok/20 pt-3 sm:grid-cols-2 sm:gap-x-5">
          {valRows.filter((r) => r.value).map((r) => (
            <div key={r.label} className="min-w-0">
              <dt className="text-[11px] font-bold uppercase tracking-wide text-muted">{r.label}</dt>
              <dd className="mt-0.5 text-[13px] font-semibold text-navy">{r.value}</dd>
            </div>
          ))}
          {docRows.map((r) => (
            <div key={r.label} className="min-w-0">
              <dt className="text-[11px] font-bold uppercase tracking-wide text-muted">{r.label}</dt>
              <dd className="mt-0.5 text-[13px] font-semibold text-navy">
                {r.url ? <a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand hover:underline"><Icon name="visibility" size={14} />{L("View", "عرض")}</a> : verifiedPill}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    );
  }
  if (status === "pending") {
    return (
      <div className={`${base} flex items-center gap-3 border-warn/30 bg-warn-soft`}>
        <Icon name="schedule" size={22} className="flex-none text-warn" />
        <div>
          <p className="text-[13.5px] font-bold text-navy">{p.companyPendingTitle}</p>
          <p className="text-[12.5px] text-muted">{p.companyPendingBody}</p>
        </div>
      </div>
    );
  }
  const rejected = status === "rejected";
  return (
    <button onClick={onGo} className={`${base} flex w-full items-center justify-between gap-3 text-start ${rejected ? "border-danger/30 bg-danger-soft hover:border-danger" : "border-brand/30 bg-brand-soft hover:border-brand"}`}>
      <div>
        <p className="text-[13.5px] font-bold text-navy">{rejected ? p.companyRejectedTitle : p.companyNoneTitle}</p>
        <p className="text-[12.5px] text-muted">{rejected ? p.companyRejectedBody : p.companyNoneBody}</p>
      </div>
      <span className={`inline-flex flex-none items-center gap-1 rounded-[9px] px-3 py-2 text-[12px] font-bold ${rejected ? "bg-danger text-white" : "bg-brand text-brand-fg"}`}>
        {rejected ? p.companyResubmit : p.companyCta}
        <Icon name="arrow_forward" size={15} className="rtl:scale-x-[-1]" />
      </span>
    </button>
  );
}
