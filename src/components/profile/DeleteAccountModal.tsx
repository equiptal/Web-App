"use client";

import { useState } from "react";
import { Dialog } from "@/components/Dialog";
import { useT, useLocale, fmt } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import { deleteAccount } from "@/lib/api/profile-client";

/**
 * Delete-account confirmation (app parity: delete_account_page.dart). Guarded by a typed confirmation —
 * the renter must type the locale's confirm word before the destructive `DELETE /users/me` fires. On
 * success the parent clears the session and returns home.
 */
export function DeleteAccountModal({
  onClose,
  onDeleted,
}: {
  onClose: () => void;
  onDeleted: () => void;
}) {
  const t = useT();
  const p = t.profile;
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const confirmed = typed.trim().toUpperCase() === p.deleteConfirmWord.toUpperCase();

  const run = async () => {
    if (!confirmed || busy) return;
    setBusy(true);
    setErr(null);
    const r = await deleteAccount();
    if (r.ok) {
      onDeleted();
      return;
    }
    setBusy(false);
    setErr(r.code === "offline" ? p.offline : p.deleteError);
  };

  return (
    <Dialog open onClose={onClose} size="md" padded={false}>
      <div
        className="p-6"
        dir={ar ? "rtl" : "ltr"}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center gap-3">
          <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-danger-soft text-danger">
            <Icon name="warning" size={22} />
          </span>
          <h2 className="text-title font-extrabold text-navy">{p.deleteTitle}</h2>
        </div>
        <p className="text-body leading-[1.55] text-muted">{p.deleteBody}</p>

        <label className="mt-4 block text-meta font-semibold text-navy-mid">
          {fmt(p.deleteConfirmLabel, { word: p.deleteConfirmWord })}
        </label>
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          className="mt-1.5 h-11 w-full rounded-sm border border-border bg-surface2 px-3 text-body font-semibold text-navy outline-0 focus:border-danger"
          autoFocus
        />
        {err && <p className="mt-2 text-meta font-semibold text-danger">{err}</p>}

        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            className="h-11 flex-1 rounded-sm border border-border bg-surface text-body font-semibold text-navy-mid hover:bg-surface2"
          >
            {p.cancel}
          </button>
          <button
            onClick={run}
            disabled={!confirmed || busy}
            className="h-11 flex-1 rounded-sm bg-danger text-body font-semibold text-white transition disabled:bg-disabled-bg disabled:text-disabled-fg"
          >
            {busy ? p.deleting : p.deleteAccount}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
