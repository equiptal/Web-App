"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session";
import { PhoneEntry } from "@/components/auth/PhoneEntry";
import { CodeEntry } from "@/components/auth/CodeEntry";
import type { RenterUser } from "@/lib/contract/auth";

/**
 * Two-step sign-in container (phone → code). Owns the post-sign-in return (AC-07/08) and the
 * back/edit-number transition (AC-13). The individual screens own the per-step behaviour ACs.
 */
export function LoginFlow({ next }: { next: string }) {
  const router = useRouter();
  const { signIn } = useSession();
  const [phone, setPhone] = useState<string | null>(null);

  const onCodeSent = (p: string) => setPhone(p); // AC-02: advance to code entry
  const onEditNumber = () => setPhone(null); // AC-13: back to phone entry

  const onVerified = (user: RenterUser) => {
    signIn(user);
    const safe = next.startsWith("/") && !next.startsWith("//") ? next : "/";
    router.replace(safe); // AC-07 (next) / AC-08 (home)
  };

  return (
    <div className="w-full max-w-[380px]">
      {/* Brand mark on the form side (desktop only — mobile shows the white mark above the card) */}
      <div className="mb-9 hidden items-center gap-2 lg:flex">
        <span className="h-2.5 w-2.5 flex-none rounded-full bg-brand" />
        <span className="text-[15px] font-bold tracking-tight text-navy">Moedatech</span>
      </div>
      {phone === null ? (
        <PhoneEntry onCodeSent={onCodeSent} />
      ) : (
        <CodeEntry phone={phone} onVerified={onVerified} onEditNumber={onEditNumber} />
      )}
    </div>
  );
}
