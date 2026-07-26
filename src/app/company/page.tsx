"use client";

import { AppShell } from "@/components/AppShell";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { SignInPrompt } from "@/components/common/SignInPrompt";
import { CompanyHub } from "@/components/company/CompanyHub";

/**
 * /company — the multi-company hub (docs/plans/company-shared-visibility.md), web twin of the app's
 * `company_page.dart`. Join a firm by invite code, or manage the roster you belong to.
 *
 * Signed-out visitors get the sign-in prompt: a company membership is account-bound (it decides which
 * requests, bids and equipment you can see), so there is nothing meaningful to show anonymously.
 */
export default function CompanyPage() {
  const t = useT();
  const { status } = useSession();

  return (
    <AppShell title={t.shell.company}>
      {status === "anon" ? (
        <div className="mx-auto max-w-xl">
          <SignInPrompt icon="business_center" title={t.company.signInTitle} body={t.company.signInBody} />
        </div>
      ) : (
        <CompanyHub />
      )}
    </AppShell>
  );
}
