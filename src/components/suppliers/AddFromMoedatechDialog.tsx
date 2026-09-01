"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog } from "@/components/Dialog";
import { Icon } from "@/components/ui";
import { btn } from "@/lib/ds";
import { fmt, useT } from "@/lib/i18n";
import { isAlreadyLinked, linkRenterSuppliers, searchSupplierDirectory, type DirectorySupplier } from "@/lib/api/client";

/**
 * SUP-T14 — adding a supplier who already has a Moedatech account.
 *
 * ── Its own door, as the prototype has it (owner, 2026-09-01) ───────────────────────────────────
 *
 * `prototypes/renter-suppliers-v1.html` puts TWO buttons in the header — *Add from Moedatech* and
 * *Add my own suppliers* — because the two make different kinds of row: one linked to an account,
 * one the renter's own. This was briefly built as a third tab inside the other dialog, which buried
 * it: a renter looking for a firm on Moedatech had to open a dialog named after the other route
 * before he could see this one existed.
 *
 * ── The directory, not the shopfronts ───────────────────────────────────────────────────────────
 *
 * This read `GET /api/stores` while `GET /agents/suppliers` was thought not to exist. It does, and it
 * lists every account with `is_supplier` set — so a firm with no shopfront is now listed like any
 * other. That matters more than it sounds: the renter who could not find a supplier here typed him in
 * by hand, which made a SECOND row for a company that already had an account, and every match after
 * that ran against the wrong record.
 *
 * ── The city and the mark are back (2026-09-02) ─────────────────────────────────────────────────
 *
 * This was built showing neither, on the reading that the directory did not carry them. It does:
 * the deployed route answers `city`, `is_verified` and `has_store`. A renter searching "Al" was
 * being handed nine identical-looking rows while the data to tell them apart was already in the
 * response.
 *
 * ── Registered, always (owner, 2026-09-01) ──────────────────────────────────────────────────────
 *
 * A renter does not add a firm from the platform unless he works with it — that was the whole of the
 * owner's objection to this screen. So there is no per-row tick here: everyone added is a registered
 * vendor, which is also what unlocks their contact details, and the dialog says so rather than
 * leaving it to be discovered.
 *
 * ── The supplier is not told ────────────────────────────────────────────────────────────────────
 *
 * Stated on the panel, because a renter about to put another company in a list of his own has a fair
 * question about what that company will see, and the honest answer is nothing.
 */
export function AddFromMoedatechDialog({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const t = useT();
  const c = t.suppliers;

  const [q, setQ] = useState("");
  const [rows, setRows] = useState<DirectorySupplier[] | null>(null);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* One search in flight at a time, and the last one wins: typing "zah" fires three requests and the
     shortest is not always the slowest to come back. */
  const seq = useRef(0);

  useEffect(() => {
    const needle = q.trim();
    if (needle.length < 2) {
      setRows(null);
      return;
    }
    const mine = ++seq.current;
    const id = setTimeout(async () => {
      const found = await searchSupplierDirectory(needle);
      if (mine === seq.current) setRows(found);
    }, 300);
    return () => clearTimeout(id);
  }, [q]);

  const chosen = (rows ?? []).filter((s) => picked[s.supplierId]);

  const save = async () => {
    if (!chosen.length || saving) return;
    setSaving(true);
    setError(null);
    try {
      const result = await linkRenterSuppliers(
        chosen.map((s) => ({ supplierId: s.supplierId, vendorRegistered: true })),
      );
      const created = result?.created?.length ?? chosen.length;
      const skipped = result?.skipped?.length ?? 0;
      onDone(skipped ? fmt(c.appAddedSome, { n: created, skipped }) : fmt(c.appAdded, { n: created }));
    } catch (err) {
      // Already linked is not a failure — it is the answer to "is this firm in my list", and the
      // renter gets told rather than shown a broken save.
      if (isAlreadyLinked(err)) {
        onDone(fmt(c.appAddedSome, { n: 0, skipped: chosen.length }));
        return;
      }
      setError(c.appFailed);
      setSaving(false);
    }
  };

  const body = (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <span className="flex h-[34px] items-center gap-2 rounded-md border border-border-strong bg-surface px-2.5">
          <Icon name="search" size={15} className="text-muted" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={c.appSearch}
            className="w-full bg-transparent text-meta font-semibold text-navy outline-none placeholder:text-muted"
          />
        </span>
        {/* Every account with `is_supplier`, shopfront or not — so the only firms missing here are the
            ones with no Moedatech account at all, which is what the other button is for. */}
        <span className="text-meta text-muted">{c.dirEveryone}</span>
      </div>

      <div className="max-h-[300px] overflow-auto rounded-md border border-border">
        {rows === null ? (
          <p className="p-6 text-center text-meta text-muted">{c.appSearchFirst}</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-center text-meta text-muted">{c.appNoResults}</p>
        ) : (
          <ul>
            {rows.map((s) => (
              <li key={s.supplierId} className="border-b border-border last:border-b-0">
                <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2.5 hover:bg-surface2">
                  <input
                    type="checkbox"
                    checked={!!picked[s.supplierId]}
                    onChange={(e) => setPicked((p) => ({ ...p, [s.supplierId]: e.target.checked }))}
                    className="h-3.5 w-3.5 flex-none accent-ok"
                  />
                  <span className="min-w-0 flex-1">
                    <b className="flex items-center gap-1.5 text-meta font-extrabold text-navy">
                      <span className="truncate">{s.name}</span>
                      {s.verified && (
                        <Icon name="verified_user" size={12} className="flex-none text-ok" aria-label={c.verifiedByMoedatech} />
                      )}
                    </b>
                    {/* The city and the person — what tells two firms with similar names apart. Only
                        what is there: a row with neither draws no second line rather than an empty one. */}
                    <span className="block truncate text-label text-muted">
                      {[s.city, s.contactName].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="flex gap-2 rounded-md bg-surface2 px-3 py-2.5 text-meta text-muted-dark">
        <Icon name="shield" size={15} className="flex-none" />
        <span>
          {c.appPrivate}
          <br />
          {c.appRegisteredRule}
        </span>
      </p>
    </div>
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="xl"
      icon={<Icon name="verified" size={18} />}
      title={c.dirTitle}
      subtitle={c.dirSubtitle}
      footer={
        <div className="flex w-full items-center gap-2">
          {error && <span className="text-meta font-extrabold text-danger-deep">{error}</span>}
          <span className="ms-auto flex items-center gap-2">
            <button type="button" onClick={onClose} className={btn("ghost", "md")}>
              {t.common.cancel}
            </button>
            <button type="button" onClick={save} disabled={!chosen.length || saving} className={btn("primary", "md")}>
              {chosen.length ? fmt(c.dirAddN, { n: chosen.length }) : c.dirAdd}
            </button>
          </span>
        </div>
      }
    >
      {body}
    </Dialog>
  );
}
