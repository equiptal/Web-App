"use client";

import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

/**
 * Renter session — AUTH BYPASSED for this epic (web-app/001 not built here yet; see plan.md).
 *
 * We assume a signed-in renter and expose only their tier, defaulting to `basic`. The tier drives
 * the guest-block flow (AC-02/03): `guest` is blocked at entry. A dev tier toggle in the header
 * lets us exercise the block without a real session. Replace this with the real web-app/001
 * session when it lands — the `RenterTier` contract is what the UI gates on.
 */
export type RenterTier = "guest" | "basic" | "verified";

interface SessionValue {
  tier: RenterTier;
  setTier: (t: RenterTier) => void;
  /** AC-01/02: only basic & verified may create. */
  canCreate: boolean;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [tier, setTier] = useState<RenterTier>("basic");
  const value = useMemo<SessionValue>(
    () => ({ tier, setTier, canCreate: tier === "basic" || tier === "verified" }),
    [tier],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within <SessionProvider>");
  return ctx;
}
