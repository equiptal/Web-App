"use client";

import { Suspense, use, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { useLocale } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { useAuthGate } from "@/components/auth/AuthGate";
import { DealRoom } from "@/components/deal-room/DealRoom";
import { Icon } from "@/components/ui";

/** /deal-room/[id] — the deal room (web-app/request-details-bids): price card + live chat. */
export default function DealRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { locale } = useLocale();
  const [title, setTitle] = useState("");
  return (
    <AppShell title={title || (locale === "ar" ? "غرفة الصفقة" : "Deal Room")}>
      {/* Suspense boundary: the gate reads `useSearchParams`, which needs one. */}
      <Suspense fallback={null}>
        <DealRoomGate id={id} onTitle={setTitle} />
      </Suspense>
    </AppShell>
  );
}

/**
 * `?act=counter` / `?act=accept` — **the act the renter already chose**, arriving with him.
 *
 * The rentee map's price footer (004a §4a.1) can show a bid's figures but cannot host the three-step
 * flow that settles them (004a §4a.2), so its two buttons navigate here. Carrying the act in the URL
 * is what stops that hand-off from costing a second press on a room the renter never asked to read.
 *
 * Anything else in `act` is simply not a mode — `DealRoom` opens nothing and the room behaves as it
 * always has, which is the right answer for a hand-edited or stale URL.
 */
function initialFlowOf(act: string | null): "counter" | "accept" | undefined {
  return act === "counter" || act === "accept" ? act : undefined;
}

/** Public web has no route gate, but a deal room needs a session — so a signed-out visitor gets the
 *  auth modal opened in place (per the design), with a sign-in prompt behind it. */
function DealRoomGate({ id, onTitle }: { id: string; onTitle: (t: string) => void }) {
  const initialFlow = initialFlowOf(useSearchParams().get("act"));
  const { status } = useSession();
  const { openAuth } = useAuthGate();
  const { locale } = useLocale();
  const L = (en: string, ar: string) => (locale === "ar" ? ar : en);

  useEffect(() => {
    if (status === "anon") openAuth();
  }, [status, openAuth]);

  if (status === "anon") {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-20 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-surface2 text-navy-mid"><Icon name="lock" size={26} /></span>
        <div>
          <h2 className="text-title font-extrabold text-navy">{L("Sign in to view this deal room", "سجّل الدخول لعرض غرفة الصفقة")}</h2>
          <p className="mt-1 text-body text-muted">{L("Deal rooms are tied to your account.", "غرف الصفقات مرتبطة بحسابك.")}</p>
        </div>
        <button onClick={() => openAuth()} className="rounded-full bg-brand px-5 py-2 text-body font-semibold text-white">{L("Sign in", "تسجيل الدخول")}</button>
      </div>
    );
  }
  if (status !== "authed") return null; // resolving session — avoid flashing the gate
  return <DealRoom id={id} onTitle={onTitle} initialFlow={initialFlow} />;
}
