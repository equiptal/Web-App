"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, PageBack } from "@/components/AppShell";
import { useLocale } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import {
  canSeeAnyDashboard,
  canSeeGovernanceDashboard,
  canSeeProcurementDashboard,
} from "@/lib/access/dashboard";

/**
 * /dashboard — the demo boards, embedded full-bleed in the app shell.
 *
 * Two tabs now. **Procurement** is the original CCC prototype, which draws a fixture and talks to
 * nothing. **Governance and compliance** is live: it fetches `/api/me/governance` and computes
 * every figure from the signed-in renter's own requests, bids and awards.
 *
 * Both are STAGING-ONLY and gated per account (see `@/lib/access/dashboard`). A reader who can see
 * only one tab gets that one with no tab strip, because a strip with a single tab is furniture.
 */
type Tab = "governance" | "procurement";

export default function DashboardPage() {
  const { locale } = useLocale();
  const { user, status } = useSession();
  const router = useRouter();

  const canGov = canSeeGovernanceDashboard(user);
  const canProc = canSeeProcurementDashboard(user);
  const allowed = canSeeAnyDashboard(user);
  /* Governance first when it is available: it is the live one, and the prototype beside it is
     there for comparison rather than as the default answer. */
  const [tab, setTab] = useState<Tab>("governance");

  useEffect(() => {
    if (status === "authed" && !allowed) router.replace("/");
  }, [status, allowed, router]);

  useEffect(() => {
    if (!canGov && canProc) setTab("procurement");
  }, [canGov, canProc]);

  if (status !== "authed" || !allowed) return null;

  const ar = locale === "ar";
  const both = canGov && canProc;
  const active: Tab = canGov ? tab : "procurement";

  const TABS: Array<{ id: Tab; label: string; show: boolean }> = [
    { id: "governance", label: ar ? "الحوكمة والالتزام" : "Governance and compliance", show: canGov },
    { id: "procurement", label: ar ? "المشتريات" : "Procurement", show: canProc },
  ];

  return (
    <AppShell fullBleed title={ar ? "لوحة التحكم" : "Dashboard"}>
      <PageBack fallback="/" />

      {both && (
        <div className="flex shrink-0 gap-1 border-b border-[var(--border)] bg-[var(--surface)] px-4">
          {TABS.filter((t) => t.show).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-current={active === t.id ? "page" : undefined}
              className={
                "-mb-px border-b-2 px-3 py-2.5 text-body font-semibold transition-colors " +
                (active === t.id
                  ? "border-[var(--brand)] text-[var(--navy)]"
                  : "border-transparent text-[var(--muted)] hover:text-[var(--navy)]")
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/*
        Both frames stay mounted and the inactive one is hidden, rather than being unmounted.
        The governance board fans out across every request to build itself, so switching tabs
        would otherwise re-run that whole fetch — and lose the board the reader had arranged,
        which is held in the page, not in the URL.
      */}
      {canGov && (
        <iframe
          src={`/governance-dashboard.html?embed=1&v=4&lang=${locale}`}
          title={ar ? "الحوكمة والالتزام" : "Governance and compliance"}
          className={"block min-h-0 w-full flex-1 " + (active === "governance" ? "" : "hidden")}
          style={{ border: 0 }}
        />
      )}
      {canProc && (
        <iframe
          src={`/procurement-dashboard.html?embed=1&lang=${locale}`}
          title={ar ? "المشتريات" : "Procurement"}
          className={"block min-h-0 w-full flex-1 " + (active === "procurement" ? "" : "hidden")}
          style={{ border: 0 }}
        />
      )}
    </AppShell>
  );
}
