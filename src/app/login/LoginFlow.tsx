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

  return phone === null ? (
    <PhoneEntry onCodeSent={onCodeSent} />
  ) : (
    <CodeEntry phone={phone} onVerified={onVerified} onEditNumber={onEditNumber} />
  );
}
