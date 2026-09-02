"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog } from "@/components/Dialog";
import { Icon } from "@/components/ui";
import { btn, cx } from "@/lib/ds";
import { fmt, useT } from "@/lib/i18n";
import { isAlreadyLinked, linkRenterSuppliers, searchSupplierDirectory, type DirectoryPage } from "@/lib/api/client";

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
 * ── It BROWSES; searching is the shortcut, not the toll gate (owner, 2026-09-02) ────────────────
 *
 * It opened on "type a name to search", which asks the renter to name a firm before he has been
 * shown that any exist. There are 1,492 supplier accounts; page one of them is the answer to "who is
 * on Moedatech?", and the search box is for the renter who already knows. Twenty at a time, verified
 * first, with a pager.
 *
 * ── The city and the mark are back (2026-09-02) ─────────────────────────────────────────────────
 *
 * This was built showing neither, on the reading that the directory did not carry them. It does:
 * the deployed route answers `city`, `is_verified` and `has_store`. A renter searching "Al" was
 * being handed nine identical-looking rows while the data to tell them apart was already in the
 * response.
 *
 * ── The vendor flag is a choice here, like everywhere else (owner, 2026-09-02) ──────────────────
 *
 * It was forced on, on the reading that a renter does not add a platform firm unless he works with
 * it — and because the flag was the proposed gate for revealing the supplier's contact details. Both
 * halves are gone: **adding from Moedatech now behaves exactly like adding a firm by hand**, the tick
 * is per row with a master above it, and the contact appears once the row exists either way.
 *
 * Which leaves the flag meaning the one thing it says: *this is a firm I have registered as a
 * vendor.* A renter can add a supplier he is only trying out without claiming otherwise.
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
  const [page, setPage] = useState<DirectoryPage | null>(null);
  const [pageNo, setPageNo] = useState(1);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  /* Per row, because a batch always has an exception — the firm being tried out, the one inherited
     from a previous site. On by default: someone picking a firm off the directory is usually picking
     one he works with. */
  const [vendor, setVendor] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* One search in flight at a time, and the last one wins: typing "zah" fires three requests and the
     shortest is not always the slowest to come back. */
  const seq = useRef(0);

  useEffect(() => {
    if (!open) return;
    const mine = ++seq.current;
    // Debounced for typing; a page press is the same path and 250ms is imperceptible on a click.
    const id = setTimeout(async () => {
      const found = await searchSupplierDirectory(q.trim(), pageNo);
      if (mine === seq.current) setPage(found);
    }, 250);
    return () => clearTimeout(id);
  }, [open, q, pageNo]);

  // A new search starts at the beginning; staying on page 7 of the old query shows nothing.
  useEffect(() => {
    setPageNo(1);
  }, [q]);

  const rows = page?.rows ?? null;

  const chosen = (rows ?? []).filter((s) => picked[s.supplierId]);

  const save = async () => {
    if (!chosen.length || saving) return;
    setSaving(true);
    setError(null);
    try {
      const result = await linkRenterSuppliers(
        chosen.map((s) => ({ supplierId: s.supplierId, vendorRegistered: vendor[s.supplierId] !== false })),
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

      </div>

      <div className="max-h-[300px] overflow-auto rounded-md border border-border">
        {rows === null ? (
          <p className="p-6 text-center text-meta text-muted">{c.loading}</p>
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

                  {/* On EVERY row, not only the picked ones (owner, 2026-09-02: *"I must be able to
                      deselect the vendor registered for a specific one"*). It was revealed on
                      selection, which is the moment it matters — and a control that appears only
                      after another one is pressed is a control a renter does not know he has. */}
                  {(
                    <span
                      className={cx(
                        "inline-flex h-[22px] flex-none items-center gap-1 rounded-full border px-2 text-label font-extrabold",
                        vendor[s.supplierId] !== false
                          ? "border-ok bg-ok-soft text-ok-deep"
                          : "border-dashed border-border-strong bg-surface text-muted",
                      )}
                      onClick={(e) => e.preventDefault()}
                    >
                      <input
                        type="checkbox"
                        checked={vendor[s.supplierId] !== false}
                        onChange={(e) => setVendor((v) => ({ ...v, [s.supplierId]: e.target.checked }))}
                        className="h-3 w-3 accent-ok"
                      />
                      {c.registered}
                    </span>
                  )}
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── The pager ────────────────────────────────────────────────────────────────────────────
          1,492 accounts is not a list to scroll. Twenty a page, and the count is stated so a renter
          searching a common word knows whether to narrow it rather than paging through ninety. */}
      {page && page.totalPages > 1 && (
        <div className="flex items-center gap-2 text-meta text-muted">
          <span>{fmt(c.dirCount, { shown: rows?.length ?? 0, total: page.total })}</span>
          <span className="ms-auto flex items-center gap-1.5">
            <button
              type="button"
              disabled={pageNo <= 1}
              onClick={() => setPageNo((n) => Math.max(1, n - 1))}
              className="rounded-sm border border-border px-2.5 py-1 font-semibold text-navy transition hover:border-brand disabled:bg-disabled-bg disabled:text-disabled-fg"
            >
              {c.prev}
            </button>
            <span className="tabular-nums">{fmt(c.dirPage, { page: page.page, of: page.totalPages })}</span>
            <button
              type="button"
              disabled={pageNo >= page.totalPages}
              onClick={() => setPageNo((n) => n + 1)}
              className="rounded-sm border border-border px-2.5 py-1 font-semibold text-navy transition hover:border-brand disabled:bg-disabled-bg disabled:text-disabled-fg"
            >
              {c.next}
            </button>
          </span>
        </div>
      )}

      {/* The master. It only sets them all at once; the row's own tick is what decides. */}
      <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-ok/40 bg-ok-soft px-3 py-2.5 text-meta text-ok-deep">
        <input
          type="checkbox"
          checked={chosen.every((s) => vendor[s.supplierId] !== false)}
          onChange={(e) =>
            setVendor(Object.fromEntries((rows ?? []).map((s) => [s.supplierId, e.target.checked])))
          }
          className="mt-0.5 h-4 w-4 flex-none accent-ok"
        />
        <span>
          <b className="block font-extrabold">{c.markAll}</b>
          <span className="block text-muted-dark">{c.markAllHint}</span>
        </span>
      </label>

      <p className="flex gap-2 rounded-md bg-surface2 px-3 py-2.5 text-meta text-muted-dark">
        <Icon name="shield" size={15} className="flex-none" />
        <span>{c.appPrivate}</span>
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
