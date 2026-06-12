"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { Icon } from "@/components/ui";
import { StoreCard } from "@/components/stores/StoreCard";
import type { StoreCard as StoreCardData } from "@/lib/contract/stores";

/**
 * Renter web home hub (web-app/004, AC-04/05/06/07/08/10/25). A create-request banner, a limited
 * verified-suppliers preview with a View-all into the browse, and a tier-aware onboarding nudge.
 * No bid/deal counts, no Requests/Jobs surfaces (AC-25) — those are deferred to future epics.
 */
export function HomeHub() {
  const t = useT();
  const router = useRouter();
  const { tier } = useSession();

  const [stores, setStores] = useState<StoreCardData[] | null>(null);
  const [error, setError] = useState(false);

  const load = () => {
    setError(false);
    setStores(null);
    fetch("/api/stores?verified=true&limit=6", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load"))))
      .then((d: { stores: StoreCardData[] }) => setStores(d.stores ?? []))
      .catch(() => setError(true));
  };
  useEffect(load, []);

  return (
    <div className="flex flex-col gap-6">
      {/* Create-request banner (AC-04/07) */}
      <div className="flex flex-col gap-4 rounded-[14px] border border-border bg-gradient-to-br from-brand-soft to-surface p-6 sm:flex-row sm:items-center">
        <span className="grid h-12 w-12 flex-none place-items-center rounded-[12px] bg-brand text-brand-fg">
          <Icon name="description" size={24} />
        </span>
        <div className="flex-1">
          <h2 className="text-[18px] font-extrabold text-navy">{t.home.bannerTitle}</h2>
          <p className="mt-1 text-[13.5px] text-muted">{t.home.bannerSubtitle}</p>
        </div>
        <div className="flex flex-none gap-2">
          <button
            onClick={() => router.push("/create")}
            className="inline-flex items-center gap-1.5 rounded-[10px] bg-brand px-4 py-2.5 text-[13.5px] font-bold text-brand-fg transition hover:brightness-[1.04]"
          >
            {t.home.createRequest} <Icon name="arrow_forward" size={16} />
          </button>
          <button
            onClick={() => router.push("/create")}
            className="inline-flex items-center gap-1.5 rounded-[10px] border border-border bg-surface px-4 py-2.5 text-[13.5px] font-bold text-navy-mid transition hover:border-brand"
          >
            <Icon name="upload_file" size={16} /> {t.home.uploadRfq}
          </button>
        </div>
      </div>

      {/* Tier-aware onboarding nudge (AC-06/08) */}
      <TierNudge tier={tier} onGo={(href) => router.push(href)} />

      {/* Verified-suppliers preview (AC-05/10) */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[15px] font-extrabold text-navy">{t.home.suppliersTitle}</h3>
          <button
            onClick={() => router.push("/browse")}
            className="inline-flex items-center gap-0.5 text-[13px] font-bold text-brand hover:underline"
          >
            {t.home.viewAll} <Icon name="chevron_right" size={16} />
          </button>
        </div>

        {error ? (
          <div className="rounded-[12px] border border-border bg-surface p-6 text-center text-[13px] text-muted">
            <p>{t.browse.error}</p>
            <button onClick={load} className="mt-2 rounded-md border border-border px-3 py-1.5 text-[13px] font-bold text-navy-mid hover:border-brand">
              {t.browse.retry}
            </button>
          </div>
        ) : stores === null ? (
          <div className="p-6 text-center text-[13px] text-muted">{t.browse.loading}</div>
        ) : stores.length === 0 ? (
          <div className="rounded-[12px] border border-border bg-surface p-6 text-center text-[13px] text-muted">{t.browse.empty}</div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {stores.map((s) => (
              <StoreCard key={s.id} store={s} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TierNudge({ tier, onGo }: { tier: string; onGo: (href: string) => void }) {
  const t = useT();
  if (tier === "verified") {
    return (
      <div className="flex items-center gap-3 rounded-[12px] border border-ok/30 bg-ok-soft px-4 py-3">
        <Icon name="verified" size={20} className="text-ok" />
        <div>
          <p className="text-[13.5px] font-bold text-navy">{t.home.verifiedTitle}</p>
          <p className="text-[12.5px] text-muted">{t.home.verifiedBody}</p>
        </div>
      </div>
    );
  }
  const isGuest = tier === "guest";
  const cfg = isGuest
    ? { title: t.home.nudgeGuestTitle, body: t.home.nudgeGuestBody, cta: t.home.nudgeGuestCta, href: "/onboarding" }
    : { title: t.home.nudgeBasicTitle, body: t.home.nudgeBasicBody, cta: t.home.nudgeBasicCta, href: "/verify" };
  return (
    <div className="flex flex-col gap-3 rounded-[12px] border border-brand/30 bg-brand-soft px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <Icon name={isGuest ? "account_circle" : "verified_user"} size={20} className="text-brand" />
        <div>
          <p className="text-[13.5px] font-bold text-navy">{cfg.title}</p>
          <p className="text-[12.5px] text-muted">{cfg.body}</p>
        </div>
      </div>
      <button
        onClick={() => onGo(cfg.href)}
        className="inline-flex flex-none items-center gap-1 rounded-[10px] bg-brand px-3.5 py-2 text-[13px] font-bold text-brand-fg transition hover:brightness-[1.04]"
      >
        {cfg.cta} <Icon name="arrow_forward" size={15} />
      </button>
    </div>
  );
}
