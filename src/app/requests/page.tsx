"use client";

import { AppShell } from "@/components/AppShell";
import { useLocale } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { RequestsList } from "@/components/requests/RequestsList";
import { SignInPrompt } from "@/components/common/SignInPrompt";

/** /requests — the renter's own requests (web-app/request-details-bids). Public tab: guests see an
 *  empty state that nudges them to create their first request (the account gate fires at submit). */
export default function RequestsPage() {
  const { locale } = useLocale();
  const { status } = useSession();
  const ar = locale === "ar";
  return (
    <AppShell title={ar ? "طلباتي" : "My Requests"} wide>
      {status === "anon" ? (
        <SignInPrompt
          icon="assignment"
          title={ar ? "لا توجد طلبات بعد" : "No requests yet"}
          body={ar ? "أنشئ أول طلب للحصول على عروض من المؤجرين — تنشئ حسابك عند الإرسال." : "Create your first request to start getting supplier bids — you'll set up your account when you submit."}
          ctaLabel={ar ? "إنشاء طلب" : "Create request"}
          ctaHref="/create"
        />
      ) : (
        <RequestsList />
      )}
    </AppShell>
  );
}
