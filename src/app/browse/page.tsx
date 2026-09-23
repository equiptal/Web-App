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
 * `/` sends a guest here; see the redirect in `HomeHub`. The return leg is in `BrowsePage`: the
 * moment the session becomes authed, this page hands him to `/`. It fires on that TRANSITION only —
 * Browse stays a nav tab for a signed-in renter, so arriving here deliberately keeps him here.
 */
export default function Browse() {
  return (
    <AppShell fullBleed>
      {/* `fullBleed` + an inner scroller, so the storefront's own 1360 column is the only gutter on
          the page rather than the shell's on top of it. See the note in `/stores/[id]`. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <BrowsePage />
      </div>
    </AppShell>
  );
}
