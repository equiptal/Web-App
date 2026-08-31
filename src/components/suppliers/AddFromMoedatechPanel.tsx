"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui";
import { btn, cx } from "@/lib/ds";
import { fmt, useT } from "@/lib/i18n";
import { isAlreadyLinked, linkRenterSuppliers } from "@/lib/api/client";
import type { StoreCard } from "@/lib/contract/stores";

/**
 * SUP-T14 — adding a supplier who already has a Moedatech account.
 *
 * ── It browses stores, and says so ──────────────────────────────────────────────────────────────
 *
 * The right source is a supplier directory: a firm with no shopfront is still a firm, and the renter
 * who cannot find him here types him in by hand — which makes a SECOND row for a company that
 * already has an account, and every match after that is against the wrong record. Until
 * `GET /agents/suppliers` exists (SUP-BE-16b) this reads `GET /api/stores` and states the limit in
 * one line under the search. An absence a renter can see is a limit; an absence he cannot is a bug.
 *
 * ── A store is not a company ────────────────────────────────────────────────────────────────────
 *
 * The link points at the SUPPLIER, never at the shopfront — two stores can belong to one firm. So a
 * row whose payload does not name its company is listed and NOT selectable, with the reason
 * (`supplierIdOf` in `contract/stores.ts` returns null rather than guessing). Linking the store id
 * would attach the renter to something that is not a company and nothing downstream would match.
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
export function AddFromMoedatechPanel({
  onDone,
  onCancel,
  typeTabLabel,
}: {
  onDone: (msg: string) => void;
  onCancel: () => void;
  /** Named so the "add anyone else under …" line points at a tab the renter can actually see. */
  typeTabLabel: string;
}) {
  const t = useT();
  const c = t.suppliers;

  const [q, setQ] = useState("");
  const [rows, setRows] = useState<StoreCard[] | null>(null);
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
      try {
        const res = await fetch(`/api/stores?search=${encodeURIComponent(needle)}&limit=25`);
        const json = (await res.json()) as { stores?: StoreCard[] };
        if (mine === seq.current) setRows(json.stores ?? []);
      } catch {
        if (mine === seq.current) setRows([]);
      }
    }, 300);
    return () => clearTimeout(id);
  }, [q]);

  const selectable = (s: StoreCard) => !!s.supplierId;
  const chosen = (rows ?? []).filter((s) => selectable(s) && picked[s.id]);

  const save = async () => {
    if (!chosen.length || saving) return;
    setSaving(true);
    setError(null);
    try {
      const result = await linkRenterSuppliers(
        // `supplierId` is non-null on every row that reached here — `selectable` is the guard.
        chosen.map((s) => ({ supplierId: s.supplierId as string, vendorRegistered: true })),
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

  return (
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
        {/* The limit, said out loud rather than left to be discovered by a renter who cannot find a
            firm he knows has an account. */}
        <span className="text-meta text-muted">{fmt(c.appOnlyStores, { tab: typeTabLabel })}</span>
      </div>

      <div className="max-h-[300px] overflow-auto rounded-md border border-border">
        {rows === null ? (
          <p className="p-6 text-center text-meta text-muted">{c.appSearchFirst}</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-center text-meta text-muted">{c.appNoResults}</p>
        ) : (
          <ul>
            {rows.map((s) => {
              const ok = selectable(s);
              return (
                <li key={s.id} className="border-b border-border last:border-b-0">
                  <label
                    className={cx(
                      "flex items-center gap-2.5 px-3 py-2.5",
                      ok ? "cursor-pointer hover:bg-surface2" : "cursor-not-allowed bg-surface2",
                    )}
                  >
                    <input
                      type="checkbox"
                      disabled={!ok}
                      checked={!!picked[s.id] && ok}
                      onChange={(e) => setPicked((p) => ({ ...p, [s.id]: e.target.checked }))}
                      className="h-3.5 w-3.5 flex-none accent-ok"
                    />
                    <span className="min-w-0 flex-1">
                      <b className={cx("block truncate text-meta font-extrabold", ok ? "text-navy" : "text-muted")}>
                        {s.name}
                      </b>
                      <span className="block truncate text-label text-muted">
                        {[s.city, s.isVerified ? c.verifiedByMoedatech : null].filter(Boolean).join(" · ")}
                        {/* Listed and refused, with the reason — never quietly dropped from the list. */}
                        {!ok && <> · {c.appNoSupplierId}</>}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
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

      <div className="flex items-center gap-2">
        {error && <span className="text-meta font-extrabold text-danger-deep">{error}</span>}
        <span className="ms-auto flex items-center gap-2">
          <button type="button" onClick={onCancel} className={btn("ghost", "md")}>
            {t.common.cancel}
          </button>
          <button type="button" onClick={save} disabled={!chosen.length || saving} className={btn("primary", "md")}>
            {chosen.length === 1 ? c.appAddOne : chosen.length ? fmt(c.appAddN, { n: chosen.length }) : c.appAddNone}
          </button>
        </span>
      </div>
    </div>
  );
}
