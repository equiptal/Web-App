"use client";

/**
 * `/dev/preview` — **one surface at a time, on invented data, with no session** (owner, 2026-09-08).
 *
 * ── Why it exists ───────────────────────────────────────────────────────────────────────────────
 * Almost every renter surface sits behind auth AND behind a backend: the bid map needs a bid, a
 * fleet and a project pin before it draws a single card. So a UI change to the yard card or the
 * request card could not be LOOKED AT while it was being made — each batch ended "not verified
 * visually" and the owner had to open the browser himself and send another screenshot. This page is
 * the way out: the real components, fixed data (`specimens.tsx`), no fetch and no login.
 *
 *     /dev/preview                       the index — every specimen, linked
 *     /dev/preview?s=yard-explain        one specimen
 *     /dev/preview?s=…&lang=ar           the same one mirrored (the app's own provider does the rest)
 *     /dev/preview?s=…&w=392             at a phone's layout width
 *
 * `tests/e2e/ui-shots.spec.ts` walks these and writes PNGs into `.artifacts/ui/`.
 *
 * ── STAGING AND LOCAL ONLY ──────────────────────────────────────────────────────────────────────
 * The same host allowlist the pin overlay uses (`uiPinsAllowed`). On production or beta this renders
 * nothing at all — not a redirect, not an empty shell: a developer instrument on a renter-facing host
 * is exactly the mistake `uiPins.ts` records at the top of itself, and one guard for both keeps them
 * from drifting apart.
 */

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { uiPinsAllowed } from "@/lib/uiPins";
import { SPECIMENS, specimenById } from "./specimens";

export default function DevPreviewPage() {
  return (
    <Suspense fallback={null}>
      <Preview />
    </Suspense>
  );
}

function Preview() {
  const params = useSearchParams();
  /* Client-side, because the guard reads the HOST and the server does not know which host served
     this build (one Amplify artifact answers on several). `null` while it is being decided, so a
     production visitor never sees a frame of the instrument. */
  const [allowed, setAllowed] = useState<boolean | null>(null);
  useEffect(() => setAllowed(uiPinsAllowed()), []);

  const id = params.get("s");
  const width = Number(params.get("w") ?? 0) || null;
  const one = specimenById(id);

  if (allowed !== true) return null;

  if (!one) {
    return (
      <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 720 }}>
        <h1 style={{ fontSize: 18, fontWeight: 800 }}>UI preview</h1>
        <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.7 }}>
          One surface at a time, on invented data. Add a specimen in <code>specimens.tsx</code> when you
          change a surface that has none.
        </p>
        <ul style={{ fontSize: 13, lineHeight: 2, paddingInlineStart: 18 }}>
          {SPECIMENS.map((s) => (
            <li key={s.id}>
              <Link href={`/dev/preview?s=${s.id}`}>{s.label}</Link>{" "}
              <span style={{ color: "var(--muted-light)" }}>#{s.pin}</span>
            </li>
          ))}
        </ul>
      </main>
    );
  }

  return (
    /* `data-shot` is what the screenshot spec clips to, so a picture is the SURFACE and not a page
       with a surface somewhere on it. The ground follows the specimen: a navy slab photographed on
       white reads as a floating rectangle, and on the dark ground it reads as the footer it is. */
    <main
      style={{
        minHeight: "100vh",
        padding: 24,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "flex-start",
        // Tokens, like everywhere else: `palette-drift`/eslint refuse a raw hex, and this page
        // must show the same ground the surface really sits on.
        background: one.ground === "dark" ? "var(--navy-deep)" : "var(--surface2)",
      }}
    >
      <div data-shot="1" style={width ? { width } : undefined}>
        {one.render()}
      </div>
    </main>
  );
}
