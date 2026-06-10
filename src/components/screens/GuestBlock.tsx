"use client";

import { useT } from "@/lib/i18n";
import { Card, Button } from "@/components/ui";

/** Flow 4 / AC-02 / AC-03: guest-tier renter is blocked at entry and prompted to create an account. */
export function GuestBlock() {
  const t = useT();
  return (
    <div className="mx-auto max-w-md py-10">
      <Card>
        <div className="text-center">
          <h2 className="text-lg font-semibold">{t.guest.blockTitle}</h2>
          <p className="mt-2 text-sm text-muted">{t.guest.blockBody}</p>
          {/* The guest→basic account-creation form is a separate epic (out of scope). */}
          <div className="mt-5">
            <Button onClick={() => undefined} title="Account creation is a separate epic">
              {t.guest.createAccount}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
