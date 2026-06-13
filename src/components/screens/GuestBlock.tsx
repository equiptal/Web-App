"use client";

import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n";
import { Card, Button } from "@/components/ui";

/**
 * Guest-tier renter is blocked at the RFQ entry and prompted to create an account (002 AC-02/03).
 * web-app/003: the CTA opens the account-creation flow with a `next` back here, so once they become
 * basic they return and the create flow is unblocked (AC-01/05/06).
 */
export function GuestBlock() {
  const t = useT();
  const router = useRouter();
  return (
    <div className="mx-auto max-w-md py-10">
      <Card>
        <div className="text-center">
          <h2 className="text-lg font-semibold">{t.guest.blockTitle}</h2>
          <p className="mt-2 text-sm text-muted">{t.guest.blockBody}</p>
          <div className="mt-5">
            <Button onClick={() => router.push("/onboarding?next=/create")}>{t.guest.createAccount}</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
