"use client";

import { useEffect, useState } from "react";

/**
 * Where Microsoft's consent pop-up lands, and the only thing it has to do is go away.
 *
 * ── Why this page exists ────────────────────────────────────────────────────────────────────────
 *
 * `returnTo` used to be the share panel's own URL, so after consent the little 520×700 window loaded
 * **the whole application** — nav bar, sidebar, the review screen, all of it, squeezed into a
 * pop-up (owner, 2026-09-06: *"when i click connect with the outlook it shows me the web staging
 * after connect"*). It worked, in that the panel behind it noticed the window close, but the renter
 * was shown a second broken copy of the product and left to work out that he should shut it.
 *
 * ⚠️ **It must stay on the same origin as the panel.** The backend checks `returnTo` against a host
 * allow-list, and the pop-up is closed by script from the page itself, which a cross-origin document
 * cannot be trusted to do.
 *
 * ⚠️ **The opener is not told anything from here.** It polls `window.closed` and re-reads the
 * connection status when the window goes, because the consent page is Microsoft's and the callback
 * is the backend's, so there is no moment in the round trip where our code could post a message.
 * Closing IS the signal.
 */
export default function MailConnected() {
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    /**
     * A window opened by script may close itself. A browser can still refuse — a pop-up blocker in a
     * strict mode, or a tab the renter opened by hand — so the fallback below appears rather than
     * leaving him on a blank page wondering what happened.
     */
    const t = window.setTimeout(() => {
      try {
        window.close();
      } catch {
        /* refused; the line below takes over */
      }
      setStuck(true);
    }, 400);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <main className="grid min-h-dvh place-items-center bg-surface2 px-6 text-center">
      <div>
        <p className="text-subhead font-extrabold text-navy">Outlook connected</p>
        <p className="mt-1 text-meta text-muted">
          {stuck ? "You can close this window and go back to your request." : "Returning you to your request…"}
        </p>
      </div>
    </main>
  );
}
