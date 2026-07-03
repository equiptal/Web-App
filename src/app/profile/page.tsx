"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { useT, useLocale } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { Icon } from "@/components/ui";
import { SignInPrompt } from "@/components/common/SignInPrompt";

interface MeProfile {
  firstName: string | null;
  lastName: string | null;
  city: string | null;
  jobTitle: string | null;
  companyName: string | null;
}

/**
 * /profile — the renter's identity + tier, plus an editable Company Name (web-app/004 + the company-
 * name profile field). Company Name persists via PUT /users/me/profile (the profile schema accepts it);
 * verification holds the separate legal company name.
 */
export default function ProfilePage() {
  const t = useT();
  const { locale } = useLocale();
  const ar = locale === "ar";
  const L = (e: string, a: string) => (ar ? a : e);
  const router = useRouter();
  const { user, tier, status } = useSession();

  const [profile, setProfile] = useState<MeProfile | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { user?: MeProfile } | null) => {
        if (active && d?.user) {
          setProfile(d.user);
          setCompanyName(d.user.companyName ?? "");
        }
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const dirty = profile != null && companyName.trim() !== (profile.companyName ?? "").trim();

  async function saveCompany() {
    if (!profile || saving) return;
    setSaving(true);
    setSaved(false);
    setError(false);
    try {
      const res = await fetch("/api/profile/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: profile.firstName ?? "",
          lastName: profile.lastName ?? "",
          city: profile.city ?? "",
          jobTitle: profile.jobTitle ?? "",
          companyName: companyName.trim(),
        }),
      });
      if (!res.ok) throw new Error();
      setProfile({ ...profile, companyName: companyName.trim() });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  if (status === "anon") {
    return (
      <AppShell title={t.shell.profile}>
        <div className="mx-auto max-w-xl">
          <SignInPrompt
            icon="person"
            title={L("Sign in to view your profile", "سجّل الدخول لعرض ملفك")}
            body={L("Your account details and verification live here once you sign in.", "تظهر تفاصيل حسابك وتوثيقك هنا بعد تسجيل الدخول.")}
          />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title={t.shell.profile}>
      <div className="mx-auto max-w-xl" dir={ar ? "rtl" : "ltr"}>
        <div className="flex items-center gap-4 rounded-[14px] border border-border bg-surface p-5">
          <span className="grid h-14 w-14 flex-none place-items-center rounded-full bg-surface2 text-navy-mid">
            <Icon name="account_circle" size={32} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[16px] font-extrabold text-navy" dir="ltr">{user?.phone ?? "—"}</p>
            <span className="mt-1 inline-block rounded-md border border-border bg-surface2 px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted">
              {tier}
            </span>
          </div>
        </div>

        {/* Company Name — editable profile field (basic/verified renters). */}
        {tier !== "guest" && (
          <div className="mt-4 rounded-[14px] border border-border bg-surface p-5">
            <label className="block text-[12.5px] font-bold text-navy-mid">{L("Company Name", "اسم الشركة")}</label>
            <p className="mt-0.5 text-[11.5px] text-muted">{L("Shown on quotations you issue once your account is verified.", "يظهر في عروض الأسعار التي تصدرها بعد توثيق حسابك.")}</p>
            <div className="mt-2.5 flex gap-2">
              <input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                maxLength={200}
                placeholder={L("Enter your company name", "أدخل اسم الشركة")}
                className="h-11 min-w-0 flex-1 rounded-[10px] border border-border bg-surface2 px-3 text-[14px] outline-0"
              />
              <button
                onClick={saveCompany}
                disabled={!dirty || saving}
                className={`inline-flex h-11 flex-none items-center gap-1.5 rounded-[10px] px-4 text-[13px] font-bold text-white disabled:opacity-50 ${saved ? "bg-ok" : "bg-brand"}`}
              >
                <Icon name={saved ? "check" : "save"} size={16} />
                {saving ? L("Saving…", "جارٍ الحفظ…") : saved ? L("Saved", "تم الحفظ") : L("Save", "حفظ")}
              </button>
            </div>
            {error && <p className="mt-1.5 text-[12px] text-danger">{L("Couldn’t save — please try again.", "تعذّر الحفظ — حاول مرة أخرى.")}</p>}
          </div>
        )}

        {tier === "verified" ? (
          <div className="mt-4 flex items-center gap-3 rounded-[12px] border border-ok/30 bg-ok-soft px-4 py-3">
            <Icon name="verified" size={20} className="text-ok" />
            <div>
              <p className="text-[13.5px] font-bold text-navy">{t.home.verifiedTitle}</p>
              <p className="text-[12.5px] text-muted">{t.home.verifiedBody}</p>
            </div>
          </div>
        ) : (
          <button
            onClick={() => router.push(tier === "guest" ? "/onboarding" : "/verify")}
            className="mt-4 flex w-full items-center justify-between rounded-[12px] border border-brand/30 bg-brand-soft px-4 py-3 text-start transition hover:border-brand"
          >
            <div>
              <p className="text-[13.5px] font-bold text-navy">{tier === "guest" ? t.home.nudgeGuestTitle : t.home.nudgeBasicTitle}</p>
              <p className="text-[12.5px] text-muted">{tier === "guest" ? t.home.nudgeGuestBody : t.home.nudgeBasicBody}</p>
            </div>
            <Icon name="arrow_forward" size={18} className="flex-none text-brand rtl:scale-x-[-1]" />
          </button>
        )}
      </div>
    </AppShell>
  );
}
