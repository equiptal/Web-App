"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { RenterTier, RenterUser } from "@/lib/contract/auth";

/**
 * Renter session (web-app/001). Hydrates from `GET /api/auth/session` (httpOnly token cookies set by
 * the auth BFF). Exposes the signed-in renter and their `tier` — carried over from the mobile identity
 * and never mutated by the web (AC-04/05). `canCreate` gates 002's create flow (guest is blocked).
 */
export type { RenterTier, RenterUser } from "@/lib/contract/auth";

type SessionStatus = "loading" | "authed" | "anon";

interface SessionValue {
  status: SessionStatus;
  user: RenterUser | null;
  /** The signed-in renter's tier, or `guest` when unknown. */
  tier: RenterTier;
  /** AC: only basic & verified may create (002 guest-block). */
  canCreate: boolean;
  /** Adopt the user returned by `/api/auth/verify` (called by the sign-in screen on success). */
  signIn: (user: RenterUser) => void;
  /** End the session: revoke + clear cookies, drop to anon (AC-19). */
  signOut: () => Promise<void>;
  /** Re-read the session from the server. */
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [user, setUser] = useState<RenterUser | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session", { cache: "no-store" });
      const data = (await res.json()) as { user: RenterUser | null };
      setUser(data.user);
      setStatus(data.user ? "authed" : "anon");
    } catch {
      setUser(null);
      setStatus("anon");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signIn = useCallback((u: RenterUser) => {
    setUser(u);
    setStatus("authed");
  }, []);

  const signOut = useCallback(async () => {
    try {
      await fetch("/api/auth/signout", { method: "POST" });
    } catch {
      /* even if the server call fails, drop the local session */
    }
    setUser(null);
    setStatus("anon");
  }, []);

  const value = useMemo<SessionValue>(() => {
    const tier: RenterTier = user?.tier ?? "guest";
    return {
      status,
      user,
      tier,
      canCreate: tier === "basic" || tier === "verified",
      signIn,
      signOut,
      refresh,
    };
  }, [status, user, signIn, signOut, refresh]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within <SessionProvider>");
  return ctx;
}
