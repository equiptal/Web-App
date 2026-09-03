"use client";

import { use, useState } from "react";
import { AppShell, PageBack } from "@/components/AppShell";
import { StoreDetailSurface } from "@/components/stores/StoreDetailSurface";
import { useT } from "@/lib/i18n";

/**
 * /stores/[id] — read-only store detail (web-app/004 Flow 3, AC-18/19/20/24).
 *
 * `fullBleed`, and the surface brings its own column. The shell's one gutter and 1440 cap are the
 * rule for an ordinary page (owner, 2026-08-30); the storefront prototype is drawn at 1360 with a
 * 24px gutter and 80px of foot, and "match the prototype exactly" (owner, 2026-09-01) is the later
 * instruction. Taking the shell's padding AND the prototype's would have been neither. The scroller
 * below is what `fullBleed` asks of a page that is not a set of pinned bands.
 */
export default function StorePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useT();
  const [name, setName] = useState("");
  return (
    <AppShell title={name || t.store.equipment} fullBleed>
      <PageBack fallback="/browse" />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <StoreDetailSurface id={id} onTitle={setName} />
      </div>
    </AppShell>
  );
}
