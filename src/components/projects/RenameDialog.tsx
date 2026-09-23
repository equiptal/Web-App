"use client";

/**
 * Give a row on the chart a name a person recognises.
 *
 * *"I want a pen for any work order or request shown on the gantt so a user can rename them — like
 * he can edit a request name instead of its id"* (owner, 2026-08-31).
 *
 * A work order already had a title; a request has only its reference, which is why the chart printed
 * `ATC310894` and the renter had to remember which of their sites that was.
 *
 * ── The reference is not replaced ────────────────────────────────────────────────────────────────
 *
 * The name sits in front of it, never instead of it. `ATC310894` is what a supplier quotes back, what
 * the deal room is keyed on, and what a renter searches for when someone phones. A rename that hid it
 * would make the board readable and every conversation about it harder.
 *
 * Clearing the box removes the name rather than saving an empty one, and the row goes back to being
 * called by its reference — which is a real answer, not a failure to type.
 */

import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui";
import { Dialog } from "@/components/Dialog";
import type { ChartGroup } from "@/lib/contract/award";

export function RenameDialog({
  open,
  group,
  onClose,
  onSave,
  busy,
}: {
  open: boolean;
  group: ChartGroup | null;
  onClose: () => void;
  /** `null` clears the name. */
  onSave: (title: string | null) => void;
  busy?: boolean;
}) {
  const t = useT();
  const r = t.projects.rename;
  const [value, setValue] = useState("");
  const box = useRef<HTMLInputElement>(null);

  /* Seeded when the dialog opens, not on every render — re-seeding from the prop while someone is
     typing is the fault that made the project title lose focus after one letter. */
  useEffect(() => {
    if (!open) return;
    setValue(group?.title?.trim() ?? "");
    // A rename dialog with the cursor somewhere else is a dialog you have to click before using.
    const id = window.setTimeout(() => box.current?.select(), 30);
    return () => window.clearTimeout(id);
  }, [open, group?.id, group?.title]);

  if (!group) return null;

  const trimmed = value.trim();

  return (
    <Dialog open={open} onClose={onClose} title={r.title} subtitle={group.ref ?? undefined}>
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-label font-semibold uppercase tracking-[.03em] text-muted">{r.label}</span>
          <input
            ref={box}
            className="w-full rounded-sm border border-border bg-surface px-3 py-2 text-body text-navy outline-none transition focus:border-brand"
            value={value}
            placeholder={group.ref ?? r.placeholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !busy) onSave(trimmed || null);
            }}
          />
        </label>

        <p className="text-meta text-muted">{r.hint.replace("{ref}", group.ref ?? "")}</p>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
          {/* Only when there is a name to remove. An always-present Clear on a row that has never
              been renamed is a control that does nothing, which teaches people to ignore controls. */}
          {!!group.title?.trim() && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onSave(null)}
              className="me-auto text-meta font-semibold text-muted underline underline-offset-2 hover:text-danger"
            >
              {r.clear}
            </button>
          )}
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t.common.cancel}
          </Button>
          <Button onClick={() => onSave(trimmed || null)} disabled={busy}>
            {t.common.save}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
