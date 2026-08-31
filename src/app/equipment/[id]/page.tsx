"use client";

import { Suspense, use, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { EquipmentDetailSurface } from "@/components/stores/EquipmentDetailSurface";
import { useT } from "@/lib/i18n";

/**
 * /equipment/[id] — one machine, with the supplier behind it.
 *
 * A page rather than the modal it replaced, because this is the thing renters send each other. The
 * optional `?storeId=` is how a signed-out visitor is answered at all: the backend has no public
 * equipment-detail route, so the BFF resolves the listing out of that store's public projection.
 * Signed-in renters do not need it, and the page works without it either way.
 */
export default function EquipmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useT();
  const [title, setTitle] = useState("");
  return (
    <AppShell title={title || t.store.equipment} fullBleed>
      {/* The storefront's own column, as on the store profile — the shell's gutter would sit on top
          of the prototype's 24px otherwise. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Suspense fallback={<div className="p-8 text-center text-shop-body text-shop-ink-3">{t.store.loading}</div>}>
          <EquipmentBody id={id} onTitle={setTitle} />
        </Suspense>
      </div>
    </AppShell>
  );
}

/** `useSearchParams` needs its own Suspense boundary — the surface itself takes a plain prop. */
function EquipmentBody({ id, onTitle }: { id: string; onTitle: (t: string) => void }) {
  const storeId = useSearchParams().get("storeId");
  return <EquipmentDetailSurface id={id} storeId={storeId} onTitle={onTitle} />;
}
