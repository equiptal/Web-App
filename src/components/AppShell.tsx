"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { Icon } from "@/components/ui";
import type { Locale } from "@/lib/i18n/config";

export function AppShell({ children }: { children: ReactNode }) {
  const { locale, setLocale } = useLocale();
  const t = useT();
  const { tier, status, signOut } = useSession();
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut(); // AC-19: end the session…
    router.push("/login"); // …and return to the sign-in screen
  };

  return (
    <div className="min-h-screen">
      {/* App bar */}
      <header className="sticky top-0 z-30 flex h-[60px] items-center justify-between border-b border-border bg-surface px-7">
        <div className="flex items-center gap-3 text-[17px] font-extrabold tracking-tight">
          <span className="grid h-[34px] w-[34px] place-items-center rounded-[9px] bg-navy">
            <Icon name="precision_manufacturing" className="text-white" size={19} />
          </span>
          <span>
            MOEDA<span className="text-brand">TECH</span>
          </span>
        </div>

        <div className="flex items-center gap-2 text-[13px] font-semibold text-navy-mid">
          <span className="inline-flex overflow-hidden rounded-md border border-border">
            {(["en", "ar"] as Locale[]).map((l) => (
              <button
                key={l}
                onClick={() => setLocale(l)}
                className={`px-2.5 py-1 text-xs font-bold ${locale === l ? "bg-navy text-white" : "bg-surface text-muted"}`}
              >
                {l === "en" ? "EN" : "ع"}
              </button>
            ))}
          </span>
          <span className="rounded-md border border-border bg-surface2 px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted">{tier}</span>
          {status === "authed" && (
            <button
              onClick={handleSignOut}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-xs font-semibold text-muted hover:text-navy"
              aria-label="Sign out"
            >
              <Icon name="logout" size={15} />
              {t.auth.signOut}
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-7 py-7 pb-24">{children}</main>
    </div>
  );
}
