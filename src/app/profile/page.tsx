"use client";

import { AppShell } from "@/components/AppShell";
import { useT, useLocale } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { SignInPrompt } from "@/components/common/SignInPrompt";
import { ProfileView } from "@/components/profile/ProfileView";

/**
 * /profile — the renter's profile tab, matching the app (profile_page.dart): navy header + tier,
 * editable profile, company/verification, and a settings section (language, change phone, legal/support,
 * delete account, logout). Anonymous visitors get a sign-in prompt. All actions are web-only proxies of
 * existing backend endpoints (`/api/me/*`).
 */
export default function ProfilePage() {
  const t = useT();
  const { locale } = useLocale();
  const ar = locale === "ar";
  const L = (e: string, a: string) => (ar ? a : e);
  const { status } = useSession();

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
      <ProfileView />
    </AppShell>
  );
}
