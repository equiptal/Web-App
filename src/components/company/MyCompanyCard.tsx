"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import { fetchMyCompany } from "@/lib/api/company-client";
import type { MyCompany } from "@/lib/contract/company";
import { btn } from "@/lib/ds";
import { pin } from "@/lib/uiPins";

/**
 * "My Company" entry on the profile tab — web twin of the app's `company_profile_card.dart`
 * (docs/plans/company-shared-visibility.md T12).
 *
 * State-aware summary that hands off to `/company` for anything actionable. Deliberately NOT a second
 * place to join or leave: the join flow needs the consent step and the exit flow needs the roster to
 * decide leave-vs-dissolve, and duplicating either invites the two copies drifting apart. The card
 * says where the renter stands and links to the hub.
 *
 * Distinct from the verification "company" card above it: that one is the CR/VAT submission, this one
 * is the multi-user firm the account belongs to.
 */
export function MyCompanyCard() {
  const t = useT();
  const c = t.company;
  const router = useRouter();
  const [company, setCompany] = useState<MyCompany | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    void fetchMyCompany().then((result) => {
      if (!active) return;
      // `undefined` (failed read) is treated the same as "no company" here — the card falls back to
      // its neutral subtitle rather than claiming the renter is solo.
      if (result) setCompany(result);
      setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const subtitle = !loaded
    ? c.myCompanySubtitle
    : !company
      ? c.noCompany
      : !company.isActive
        ? c.pendingApproval
        : company.name;

  return (
    <button {...pin("my-company-card")}
      onClick={() => router.push("/company")}
      className={btn("secondary", "md", { full: true, className: "mt-4 flex text-start transition" })}
    >
      <span className="grid h-10 w-10 flex-none place-items-center rounded-sm bg-surface2 text-navy-mid">
        <Icon name="business_center" size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-body font-semibold text-navy">{c.myCompany}</p>
        <p className="mt-0.5 line-clamp-2 text-meta leading-relaxed text-muted">{subtitle}</p>
      </div>
      {/* Roster size is the one thing worth surfacing without a tap — it's how a member notices a
          colleague joined. Pending join requests are the owner's cue and live in the hub. */}
      {loaded && company?.isActive && (
        <span className="inline-flex flex-none items-center gap-1 rounded-full bg-surface2 px-2.5 py-1 text-label font-semibold text-navy-mid">
          <Icon name="group" size={13} /> {company.activeMembers.length}
        </span>
      )}
      <Icon name="chevron_right" size={18} className="flex-none text-muted rtl:scale-x-[-1]" />
    </button>
  );
}
