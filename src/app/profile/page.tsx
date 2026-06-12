"use client";

import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { Icon } from "@/components/ui";

/**
 * /profile — a minimal read-only profile surface (web-app/004 AC-02 needs the nav item). Profile
 * editing is out of scope (future epic); this shows the renter's identity + tier and links to the
 * tier-appropriate onboarding step (003), reusing the home's tier model.
 */
export default function ProfilePage() {
  const t = useT();
  const router = useRouter();
  const { user, tier } = useSession();

  return (
    <AppShell title={t.shell.profile}>
      <div className="mx-auto max-w-xl">
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
            <Icon name="arrow_forward" size={18} className="flex-none text-brand" />
          </button>
        )}
      </div>
    </AppShell>
  );
}
