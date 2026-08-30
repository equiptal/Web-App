"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import { restoreAccount } from "@/lib/api/profile-client";
import { btn } from "@/lib/ds";

/**
 * Restore-or-sign-out gate, shown when an OTP verify succeeds on a SELF-DELETED account (app parity:
 * otp_verification_page.dart's restore dialog).
 *
 * The tokens are already set at this point — the backend authenticates deleted accounts on purpose,
 * because `POST /users/me/restore` is authed. But the session is NOT adopted until the renter chooses:
 *   Restore → `POST /api/me/restore` clears `deletedAt` → `onRestored()` continues the normal sign-in.
 *   Sign out → `POST /api/auth/signout` clears the cookies → back to the identity step.
 * Without this gate the renter lands in a session that looks healthy while every tier-gated call 403s
 * (which read as "suspended due to policy violations" before the backend split that code out).
 */
export function RestoreAccountPrompt({
  onRestored,
  onDeclined,
}: {
  /** Restore succeeded — the caller adopts the session it was holding. */
  onRestored: () => void;
  /** Renter chose not to restore; cookies are already cleared when this fires. */
  onDeclined: () => void;
}) {
  const t = useT();
  const a = t.auth;
  const [busy, setBusy] = useState<"restore" | "signout" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const restore = async () => {
    if (busy) return;
    setBusy("restore");
    setErr(null);
    const r = await restoreAccount();
    if (r.ok) {
      onRestored();
      return;
    }
    setBusy(null);
    setErr(r.code === "offline" ? a.errors.offline : a.restoreError);
  };

  const declineAndSignOut = async () => {
    if (busy) return;
    setBusy("signout");
    // Best-effort: even if the revoke call fails the route clears the cookies, and the renter must not
    // be stranded on this screen — always hand control back.
    try {
      await fetch("/api/auth/signout", { method: "POST" });
    } catch {
      /* offline — cookies stay until they expire; the gate will re-prompt on the next sign-in */
    }
    setBusy(null);
    onDeclined();
  };

  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-brand-soft text-brand">
          <Icon name="history" size={22} />
        </span>
        {/* The prompt is drawn inside `CodeEntry`, which on the auth modal stands on the navy panel.
            `text-inherit` takes the panel's own ink there and the page's navy everywhere else — one
            rule rather than a tone prop threaded through a screen that has no other dark-specific
            need. `Dialog`'s dark tone sets `text-white` on the panel, which is what it inherits. */}
        <h2 className="text-display font-extrabold tracking-[-.4px] text-inherit">{a.restoreTitle}</h2>
      </div>
      {/* `text-inherit` with an opacity, for the same reason as the heading above: white/70 on the
          auth modal's navy, navy/70 on every other ground. A fixed `text-muted` was unreadable on the
          one and `text-white/60` would be invisible on the other. */}
      <p className="text-body leading-[1.55] text-inherit opacity-70">{a.restoreBody}</p>

      {err && <p className="mt-3 text-body font-semibold text-danger">{err}</p>}

      <button
        type="button"
        onClick={restore}
        disabled={busy !== null}
        className={btn("primary", "lg", { full: true, className: "mt-6 flex transition" })}
      >
        {busy !== "restore" && <Icon name="check" size={18} />}
        <span>{busy === "restore" ? a.restoring : a.restoreConfirm}</span>
      </button>

      <button
        type="button"
        onClick={declineAndSignOut}
        disabled={busy !== null}
        className={btn("secondary", "lg", { full: true, className: "mt-3 transition" })}
      >
        {a.restoreDeny}
      </button>
    </div>
  );
}
