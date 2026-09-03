"use client";

import { AppShell, PageBack } from "@/components/AppShell";
import { InboxView } from "@/components/inbox/InboxView";
import { useT, useLocale } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { SignInPrompt } from "@/components/common/SignInPrompt";

/** /inbox — deal-room message threads. Public tab: guests see a sign-in nudge (messages are personal). */
export default function InboxPage() {
  const t = useT();
  const { locale } = useLocale();
  const { status } = useSession();
  const ar = locale === "ar";
  return (
    <AppShell title={t.shell.inbox}>
      <PageBack fallback="/" />
      {status === "anon" ? (
        <SignInPrompt
          icon="inbox"
          title={ar ? "سجّل الدخول لعرض رسائلك" : "Sign in to see your messages"}
          body={ar ? "تظهر هنا محادثات غرف الصفقات مع المؤجرين بعد تسجيل الدخول." : "Your deal-room conversations with suppliers appear here once you sign in."}
        />
      ) : (
        <InboxView />
      )}
    </AppShell>
  );
}
