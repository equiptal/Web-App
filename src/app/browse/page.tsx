import { AppShell } from "@/components/AppShell";
import { BrowsePage } from "@/components/stores/BrowsePage";

/**
 * /browse — the supplier directory, under the same CTA banner the dashboard carries.
 *
 * ── The page a guest lands on (owner, 2026-08-30) ───────────────────────────────────────────────
 * The dashboard answers "what is mine and where does it stand". A visitor who has never signed in
 * has no answer to that, so landing him there showed him a hero and four empty states. Browse
 * answers "who is out there", which is the only question he actually has — and it is the question
 * the supplier directory was already answering, three blocks down a page he had no reason to scroll.
 *
 * `/` sends a guest here; see the redirect in `HomeHub`'s page. Signing in lands on `/` as before.
 */
export default function Browse() {
  return (
    <AppShell>
      <BrowsePage />
    </AppShell>
  );
}
