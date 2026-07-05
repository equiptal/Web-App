"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { useSession } from "@/lib/session";
import { AccountModal } from "@/components/onboarding/AccountModal";

/**
 * App-wide auth gate (public-web-auth-gate). There is NO `/login` page and NO route gate — the whole
 * web is public. Authentication is a MODAL fired by an action:
 *   - `requireAuth(action)` runs `action` immediately if the user is already a complete account
 *     (basic/verified); otherwise it opens the modal and runs `action` only after they finish.
 *   - `openAuth()` just opens the modal (e.g. the header "Sign in" button) with no follow-up action.
 * The modal itself branches: an EXISTING account signs in directly; a NEW number goes through the
 * one-step register (phone → OTP → profile → basic). Mounted once in the AppShell.
 */
type OpenOpts = { title?: string; subtitle?: string };
type AuthGateCtx = {
  /** Run `action` once the user is a complete account; open the modal first if they aren't. */
  requireAuth: (action?: () => void, opts?: OpenOpts) => void;
  /** Just open the auth modal (sign-in / register) with no follow-up action. */
  openAuth: (opts?: OpenOpts) => void;
};

const Ctx = createContext<AuthGateCtx>({ requireAuth: () => {}, openAuth: () => {} });
export const useAuthGate = () => useContext(Ctx);

export function AuthGateProvider({ children }: { children: ReactNode }) {
  const { status, user } = useSession();
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<OpenOpts>({});
  const action = useRef<(() => void) | null>(null);
  const isComplete = status === "authed" && (user?.tier === "basic" || user?.tier === "verified");

  const requireAuth = useCallback(
    (act?: () => void, o?: OpenOpts) => {
      if (isComplete) { act?.(); return; } // already a full account → no gate
      action.current = act ?? null;
      setOpts(o ?? {});
      setOpen(true);
    },
    [isComplete],
  );
  const openAuth = useCallback((o?: OpenOpts) => requireAuth(undefined, o), [requireAuth]);

  // Auth (+ register for a new account) finished → close, then run the pending action.
  const onCreated = useCallback(() => {
    setOpen(false);
    const a = action.current;
    action.current = null;
    a?.();
  }, []);
  const onClose = useCallback(() => { setOpen(false); action.current = null; }, []);

  return (
    <Ctx.Provider value={{ requireAuth, openAuth }}>
      {children}
      <AccountModal open={open} onClose={onClose} onCreated={onCreated} title={opts.title} subtitle={opts.subtitle} />
    </Ctx.Provider>
  );
}
