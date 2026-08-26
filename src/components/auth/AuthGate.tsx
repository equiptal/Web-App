"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useSession } from "@/lib/session";
import { useT } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import { AccountModal } from "@/components/onboarding/AccountModal";
import { btn } from "@/lib/ds";

/**
 * App-wide auth gate (public-web-auth-gate). There is NO `/login` page and NO route gate — the whole
 * web is public. Authentication is a MODAL fired by an action:
 *   - `requireAuth(action)` runs `action` immediately if the user is already a complete account
 *     (basic/verified); otherwise it opens the modal and runs `action` only after they finish.
 *   - `openAuth()` just opens the modal (e.g. the header "Sign in" button) with no follow-up action.
 * Modal 1 gets a code with phone OR email; Modal 2 creates the account. An EMAIL-first NEW user who
 * abandons Modal 2 has no DB account yet — only a client-side `onboardingToken` — so we persist it here
 * (sessionStorage, ~15-min TTL) and show a "Finish your signup" banner to resume. Mounted once in the AppShell.
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

// Email-first onboarding held between Modal 1 and Modal 2 (no DB account until the phone is added).
type Pending = { token: string; email: string | null; expiresAt: number };
const ONBOARDING_KEY = "mt_onboarding";
const ONBOARDING_TTL_MS = 15 * 60 * 1000; // matches the backend token lifetime

function loadPending(): Pending | null {
  try {
    const raw = sessionStorage.getItem(ONBOARDING_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Pending;
    if (!p?.token || Date.now() > p.expiresAt) {
      sessionStorage.removeItem(ONBOARDING_KEY);
      return null;
    }
    return p;
  } catch {
    return null;
  }
}

export function AuthGateProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const { status, user } = useSession();
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<OpenOpts>({});
  const [pending, setPending] = useState<Pending | null>(null);
  // Whether THIS open should resume an abandoned email-first signup at Modal 2 (the profile step). Only
  // the "Finish your signup" banner sets it — a plain "Sign in" always starts at Modal 1 (the OTP step),
  // so the two steps stay tied and re-clicking Sign in never jumps mid-flow.
  const [resume, setResume] = useState(false);
  const action = useRef<(() => void) | null>(null);
  const isComplete = status === "authed" && (user?.tier === "basic" || user?.tier === "verified");

  // Hydrate any in-flight email-first onboarding on mount (client-only → no SSR mismatch).
  useEffect(() => {
    setPending(loadPending());
  }, []);

  const clearPending = useCallback(() => {
    setPending(null);
    try {
      sessionStorage.removeItem(ONBOARDING_KEY);
    } catch {
      /* storage unavailable */
    }
  }, []);

  // Modal reports the onboarding token (email-first, needsSignup) → persist it so a close can resume.
  const persistOnboarding = useCallback((token: string, email: string | null) => {
    const p: Pending = { token, email, expiresAt: Date.now() + ONBOARDING_TTL_MS };
    setPending(p);
    try {
      sessionStorage.setItem(ONBOARDING_KEY, JSON.stringify(p));
    } catch {
      /* storage unavailable — resume just won't survive a reload */
    }
  }, []);

  const requireAuth = useCallback(
    (act?: () => void, o?: OpenOpts) => {
      if (isComplete) { act?.(); return; } // already a full account → no gate
      action.current = act ?? null;
      setOpts(o ?? {});
      setResume(false); // Sign in / any gated action opens at Modal 1 (OTP), never mid-flow
      setOpen(true);
    },
    [isComplete],
  );
  const openAuth = useCallback((o?: OpenOpts) => requireAuth(undefined, o), [requireAuth]);

  // Auth (+ register for a new account) finished → close, clear onboarding, then run the pending action.
  const onCreated = useCallback(() => {
    setOpen(false);
    clearPending();
    const a = action.current;
    action.current = null;
    a?.();
  }, [clearPending]);
  // Close keeps the onboarding token (so the banner can resume); only the follow-up action is dropped.
  const onClose = useCallback(() => { setOpen(false); action.current = null; }, []);

  const showBanner = !!pending && !open;

  return (
    <Ctx.Provider value={{ requireAuth, openAuth }}>
      {children}
      <AccountModal
        open={open}
        onClose={onClose}
        onCreated={onCreated}
        title={opts.title}
        subtitle={opts.subtitle}
        resumeToken={resume ? pending?.token : undefined}
        onNeedsSignup={persistOnboarding}
      />
      {showBanner && (
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
          <div className="flex w-full max-w-md items-center gap-3 rounded-sm border border-border bg-surface p-3">
            <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-brand-soft text-brand"><Icon name="person_add" size={18} /></span>
            <div className="min-w-0 flex-1">
              <p className="text-body font-extrabold text-navy">{t.auth.finishTitle}</p>
              <p className="truncate text-meta text-muted">{t.auth.finishBody}</p>
            </div>
            <button onClick={() => { setResume(true); setOpen(true); }} className={btn("primary", "md", { className: "flex-none transition" })}>
              {t.auth.finishCta}
            </button>
            <button onClick={clearPending} aria-label={t.common.close} className="flex-none rounded-full p-1 text-muted hover:text-navy">
              <Icon name="close" size={18} />
            </button>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
