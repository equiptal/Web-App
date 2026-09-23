"use client";

import { Dialog } from "@/components/Dialog";
import { useLocale } from "@/lib/i18n";
import { VerificationFlow } from "./VerificationFlow";

/**
 * Company verification, in a dialog rather than on a page of its own.
 *
 * ── Why it moved (owner, 2026-09-12) ────────────────────────────────────────────────────────────
 *
 * *"Make the verification form the same UI as the create-account form, like a modal not a page."*
 *
 * 🔴 **It is the same ERRAND as creating an account**, and it was the only one of the two drawn as a
 * route. Pressing «Verify» left the page the renter was on — his profile, or whatever he was reading
 * when the header nudge caught his eye — and to come back he had to navigate. A dialog keeps the
 * screen underneath, so abandoning the form costs him nothing and finishing it puts him back exactly
 * where he was.
 *
 * ⚠️ **`/verify` is NOT retired**, and that is deliberate. The route is the target of
 * `notificationHref`'s `verification.*` rows, of the app's deep links, and of anything a renter has
 * bookmarked. This is a second door onto the same flow, not a replacement for the first — which is
 * why `VerificationFlow` is rendered here unchanged rather than being moved into the dialog.
 *
 * ⚠️ `size="xl"` and `padded={false}`, exactly as `AccountModal` does it, because the ask was for
 * the two to look like one thing. The flow draws its own headings and its own padding; a padded
 * shell would put a second frame round a form that already has one.
 */
export function VerifyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { locale } = useLocale();
  if (!open) return null;

  return (
    <Dialog open onClose={onClose} size="xl" padded={false}>
      {/* ⚠️ `dir` is set here, like the account gate does: the dialog is portalled out of the page,
          so it does not inherit the direction from whatever opened it.

          ⚠️ No `pin` on this one. The overlay's names are a closed union in `uiPins.ts`, and adding
          one means regenerating two committed docs — not worth it for a wrapper whose whole content
          is a component that is already pinned. */}
      <div dir={locale === "ar" ? "rtl" : "ltr"}>
        {/* ⚠️ **It does not close itself, and it must not.** Submitting flips the account to
            PENDING and the flow redraws as the waiting panel in place — «we have your papers» is the
            one thing the renter came here to be told, and a dialog that vanished on submit would
            take it with it. He closes it when he has read it.

            Fresh mount on each open, so a renter who left half-way starts at the step his account is
            actually on rather than the one he walked away from. */}
        <VerificationFlow />
      </div>
    </Dialog>
  );
}
