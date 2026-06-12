"use client";

import { use, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { StoreDetailSurface } from "@/components/stores/StoreDetailSurface";
import { useT } from "@/lib/i18n";

/** /stores/[id] — read-only store detail (web-app/004 Flow 3, AC-18/19/20/24). */
export default function StorePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useT();
  const [name, setName] = useState("");
  return (
    <AppShell title={name || t.store.equipment}>
      <StoreDetailSurface id={id} onTitle={setName} />
    </AppShell>
  );
}
