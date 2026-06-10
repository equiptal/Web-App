"use client";

import { useT } from "@/lib/i18n";
import { useRfq } from "@/lib/store/rfq-store";
import { Button, Card } from "@/components/ui";

/** AC-42: web confirmation; renter stays on web (no bid-tracking surface). */
export function Confirmation() {
  const t = useT();
  const { state, actions } = useRfq();
  return (
    <div className="mx-auto max-w-md py-12">
      <Card tone="ok">
        <div className="text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-ok-soft text-2xl text-ok">✓</div>
          <h2 className="mt-3 text-lg font-semibold">{t.confirmation.title}</h2>
          <p className="mt-2 text-sm text-muted">{t.confirmation.message}</p>
          {state.requestId && <p className="mt-2 text-xs text-muted">{state.requestId}</p>}
          <div className="mt-5">
            <Button variant="secondary" onClick={() => actions.reset()}>
              {t.confirmation.backHome}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
