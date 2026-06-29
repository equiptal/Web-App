"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session";
import { fetchPendingSurvey, respondSurvey } from "@/lib/api/client";
import { isRenterSurvey, type PendingUnit } from "@/lib/contract/survey";
import { SurveyModal, type SurveyResponse } from "./SurveyModal";

interface SurveyCtx {
  pending: PendingUnit | null;
  hasPending: boolean;
  /** Open the modal for the current pending unit (no-op if none). */
  openSurvey: () => void;
  /** Re-poll the backend for the next pending unit. */
  refresh: () => void;
}

const Ctx = createContext<SurveyCtx | null>(null);

/** Once-per-browser-session guard so navigating doesn't re-pop the auto-open modal. */
const SESSION_FLAG = "survey-autoshown";

/**
 * Outcome Survey gate (renter). Mounted once in the root layout (inside SessionProvider). Polls the
 * next pending survey when the renter is authed, auto-opens the modal once per session, exposes the
 * pending state + an opener for the sidebar item / topbar icon, and drains to the next unit on each
 * resolve (closing when none). RENTEE_NO_BIDS "edit" navigates to the request detail after posting.
 */
export function SurveyProvider({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const router = useRouter();
  const [pending, setPending] = useState<PendingUnit | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async (): Promise<PendingUnit | null> => {
    try {
      const { pending: p } = await fetchPendingSurvey();
      // The web only renders renter flows; ignore a SUPPLIER_CONFIRM unit (mobile owns it).
      const next = p && isRenterSurvey(p.type) ? p : null;
      setPending(next);
      return next;
    } catch {
      setPending(null);
      return null;
    }
  }, []);

  useEffect(() => {
    if (status !== "authed") return;
    let active = true;
    refresh().then((next) => {
      if (!active || !next) return;
      let shown = false;
      try { shown = sessionStorage.getItem(SESSION_FLAG) === "1"; } catch {}
      if (!shown) {
        try { sessionStorage.setItem(SESSION_FLAG, "1"); } catch {}
        setOpen(true);
      }
    });
    return () => { active = false; };
  }, [status, refresh]);

  const openSurvey = useCallback(() => setOpen((o) => o || pending != null), [pending]);

  const submit = useCallback(
    async (responses: SurveyResponse[]) => {
      setBusy(true);
      let editTo: string | null = null;
      try {
        for (const r of responses) {
          const res = await respondSurvey(r.surveyId, r.body);
          if (r.body.action === "edit") editTo = res.deepLinkEditRequestId ?? r.surveyId;
        }
      } catch {
        setBusy(false); // soft-fail: keep the modal open so the renter can retry
        return;
      }
      setBusy(false);
      if (editTo) {
        setOpen(false);
        router.push(`/requests/${encodeURIComponent(editTo)}`);
        return;
      }
      const next = await refresh(); // drain to the next unit; close when none
      if (!next) setOpen(false);
    },
    [refresh, router],
  );

  return (
    <Ctx.Provider value={{ pending, hasPending: pending != null, openSurvey, refresh: () => void refresh() }}>
      {children}
      {open && pending && <SurveyModal unit={pending} busy={busy} onSubmit={submit} onClose={() => setOpen(false)} />}
    </Ctx.Provider>
  );
}

/** Read the survey gate. Returns an inert value if used outside the provider (safe for SSR). */
export function useSurvey(): SurveyCtx {
  return useContext(Ctx) ?? { pending: null, hasPending: false, openSurvey: () => {}, refresh: () => {} };
}
