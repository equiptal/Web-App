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
  /**
   * **A key that changes whenever the identity behind the page does** (owner, 2026-08-30).
   *
   * *"When I was in guest mode then logged in, I want to see the changes in the dashboard instantly
   * without me clicking refresh."*
   *
   * The dashboard's blocks fetch on mount with `[]` deps, so signing in through the modal changed
   * the session and nothing else: the page kept the guest's answers — no requests, no bids — until
   * something forced a remount. Putting this in a block's dependency array re-runs its load the
   * moment the account changes, which is what a reload was standing in for.
   *
   * It carries the TIER as well as the id, because a guest finishing their profile becomes `basic`
   * without the id moving, and that is exactly a moment when the dashboard's answers change. And it
   * carries `status`, so `loading → anon` re-runs too rather than leaving a block that fetched
   * before the session resolved showing whatever it got.
   */
  sessionKey: string;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({
  children,
  initialUser,
}: {
  children: ReactNode;
  /**
   * **The session, read on the server** (owner, 2026-08-30: *"why is the dashboard slow to show the
   * content — at first it shows empty data"*).
   *
   * The page could not draw anything until `GET /api/auth/session` came back, and only then did the
   * dashboard's blocks start asking for their data — two strictly serial round trips before a single
   * row appeared, with the empty state filling the gap. The first of them was avoidable: in the
   * ordinary case that endpoint reads a cookie and returns it, and the layout is a Server Component
   * that can read the same cookie with no request at all.
   *
   * So the provider starts `authed`/`anon` on the FIRST render, the dashboard draws immediately, and
   * its fetches start at hydration instead of one round trip later.
   *
   * `undefined` (not `null`) means "the server did not say" — a caller that has not been converted
   * still starts at `loading` and hydrates over the wire exactly as before. `null` means the server
   * looked and there is no session, which is a different fact and is trusted as one.
   *
   * The revalidation below still runs: this cookie is the identity the BFF wrote, but the access
   * token behind it can have lapsed, and only `/api/auth/session` can refresh it.
   */
  initialUser?: RenterUser | null;
}) {
  const [status, setStatus] = useState<SessionStatus>(initialUser === undefined ? "loading" : initialUser ? "authed" : "anon");
  const [user, setUser] = useState<RenterUser | null>(initialUser ?? null);

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
      // A string rather than an incrementing count: it is derived from the state it describes, so it
      // cannot drift out of step with it, and two renders of the same identity produce the same key.
      sessionKey: `${status}:${user?.id ?? ""}:${tier}`,
    };
  }, [status, user, signIn, signOut, refresh]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within <SessionProvider>");
  return ctx;
}
