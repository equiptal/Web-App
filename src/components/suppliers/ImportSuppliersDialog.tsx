"use client";

import { useMemo, useState } from "react";
import { Dialog } from "@/components/Dialog";
import { Icon } from "@/components/ui";
import { btn, cx } from "@/lib/ds";
import { fmt, useT } from "@/lib/i18n";
import { addRenterSuppliersBulk } from "@/lib/api/client";
import {
  SHEET_MAX_ROWS,
  guessField,
  importable,
  mapRows,
  parseSheet,
  type SheetField,
  type SheetTable,
} from "@/lib/contract/sheet-paste";

/**
 * SUP-T23 — importing a supplier list.
 *
 * Two ways in, and they are the same thing underneath: **paste the rows straight out of Excel**, or
 * choose a CSV. The paste is first because it is faster — the renter has the file open, and copying
 * forty rows is one keystroke against finding, saving and uploading a file.
 *
 * ── The mapping is shown, not assumed ───────────────────────────────────────────────────────────
 *
 * Headers are guessed, and every guess is a dropdown the renter can change before anything is
 * written. Guessing saves five clicks; guessing silently would put a phone number in the CR column of
 * forty suppliers and nobody would find out until a match failed.
 *
 * ── Nothing the renter typed is lost ────────────────────────────────────────────────────────────
 *
 * Five fields are ours. Every other column rides along under `extra` with its own header — payment
 * terms, account manager, whatever the firm keeps. A supplier list is somebody's working document,
 * and an import that quietly drops half of it is not an import.
 */
export function ImportSuppliersDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (msg: string) => void }) {
  const t = useT();
  const c = t.suppliers;

  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [mapping, setMapping] = useState<SheetField[]>([]);
  const [vendor, setVendor] = useState<boolean[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const table: SheetTable | null = useMemo(() => parseSheet(text), [text]);

  /** Re-guess whenever the shape changes; keep the renter's edits while it does not. */
  const take = (raw: string, name: string | null) => {
    const parsed = parseSheet(raw);
    setText(raw);
    setFileName(name);
    setError(parsed ? null : c.importUnreadable);
    setMapping(parsed ? parsed.headers.map(guessField) : []);
    setVendor(parsed ? parsed.rows.map(() => true) : []);
  };

  const rows = table ? mapRows(table, mapping) : [];
  const ready = rows.filter(importable);
  const skipped = rows.length - ready.length;

  const reset = () => {
    setText("");
    setFileName(null);
    setMapping([]);
    setVendor([]);
    setError(null);
    setSaving(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  const onFile = async (file: File) => {
    /**
     * An .xlsx is a ZIP container, not text — reading it as text produces binary noise and the
     * parser would answer "we could not read that", which blames the renter for choosing the file
     * he actually has. So it is named, and answered with the route that works: the rows are in the
     * spreadsheet he has open, and copying them is faster than saving a second copy of the file.
     */
    if (/\.(xlsx|xls|xlsm|numbers|ods)$/i.test(file.name)) {
      setError(c.xlsxNotRead);
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError(c.importTooBig);
      return;
    }
    take(await file.text(), file.name);
  };

  const save = async () => {
    if (!ready.length || saving) return;
    setSaving(true);
    setError(null);
    try {
      const result = await addRenterSuppliersBulk(
        rows
          .map((r, i) => ({ r, v: vendor[i] !== false }))
          .filter(({ r }) => importable(r))
          .map(({ r, v }) => ({
            name: r.name.trim(),
            contactName: r.contactName.trim() || null,
            email: r.email.trim() || null,
            phone: r.phone.trim() || null,
            crNumber: r.crNumber.trim() || null,
            extra: r.extra,
            vendorRegistered: v,
          })),
      );
      // Partial success is the normal outcome, so the message counts all three outcomes rather than
      // claiming everything landed.
      const created = result?.created?.length ?? ready.length;
      const merged = result?.merged?.length ?? 0;
      const rejected = result?.rejected?.length ?? 0;
      onDone(
        rejected || merged
          ? fmt(c.importedMixed, { n: created, merged, rejected })
          : fmt(c.imported, { n: created }),
      );
      close();
    } catch {
      setError(c.importFailed);
      setSaving(false);
    }
  };

  const FIELDS: SheetField[] = ["name", "contactName", "email", "phone", "crNumber", "extra", "skip"];
  const fieldLabel: Record<SheetField, string> = {
    name: c.fName,
    contactName: c.fContact,
    email: c.fEmail,
    phone: c.fPhone,
    crNumber: c.fCr,
    extra: c.keepAsExtra,
    skip: c.ignoreColumn,
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      size="xl"
      icon={<Icon name="table_view" size={18} />}
      title={c.importTitle}
      subtitle={c.importSubtitle}
      footer={
        <div className="flex w-full items-center gap-2">
          {table && (
            <span className="text-meta text-muted">
              {skipped > 0 ? fmt(c.importCountSkipped, { n: ready.length, skipped }) : fmt(c.importCount, { n: ready.length })}
            </span>
          )}
          {error && <span className="text-meta font-extrabold text-danger-deep">{error}</span>}
          <span className="ms-auto flex items-center gap-2">
            {table && (
              <button type="button" onClick={reset} className={btn("ghost", "md")}>
                {c.startOver}
              </button>
            )}
            <button type="button" onClick={close} className={btn("ghost", "md")}>
              {t.common.cancel}
            </button>
            <button type="button" onClick={save} disabled={!ready.length || saving} className={btn("primary", "md")}>
              {ready.length ? fmt(c.importN, { n: ready.length }) : c.importNone}
            </button>
          </span>
        </div>
      }
    >
      {!table ? (
        <div className="grid gap-3">
          <label className="grid gap-1.5">
            <span className="text-label font-extrabold uppercase tracking-wide text-muted">{c.pasteLabel}</span>
            <textarea
              rows={7}
              value={text}
              onChange={(e) => take(e.target.value, null)}
              placeholder={c.pastePlaceholder}
              className="rounded-md border border-border-strong bg-surface p-2.5 font-mono text-meta text-navy outline-none focus:border-brand"
            />
            <span className="text-meta text-muted">{c.pasteHint}</span>
          </label>

          <div className="flex items-center gap-3 text-label font-extrabold uppercase tracking-wide text-muted-light">
            <span className="h-px flex-1 bg-border" />
            {c.or}
            <span className="h-px flex-1 bg-border" />
          </div>

          <label className={cx(btn("secondary", "md"), "w-fit cursor-pointer")}>
            <Icon name="upload_file" size={15} />
            {c.chooseCsv}
            <input
              type="file"
              accept=".csv,text/csv,text/plain"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            />
          </label>
          {error && <p className="text-meta font-extrabold text-danger-deep">{error}</p>}
        </div>
      ) : (
        <div className="grid gap-3">
          <div className="flex items-center gap-2.5 rounded-md border border-border-strong bg-surface2 px-3 py-2.5">
            <span className="grid h-8 w-8 flex-none place-items-center rounded-sm bg-navy text-surface">
              <Icon name="table_view" size={16} />
            </span>
            <span className="min-w-0">
              <b className="block text-body font-extrabold text-navy">{fileName ?? c.pastedRows}</b>
              <span className="block text-meta text-muted">
                {fmt(c.rowsColumns, { rows: table.rows.length, cols: table.headers.length })}
                {table.rows.length === SHEET_MAX_ROWS && <> · {c.cappedAt}</>}
              </span>
            </span>
          </div>

          <div className="grid gap-1.5">
            <span className="text-label font-extrabold uppercase tracking-wide text-muted">{c.matchColumns}</span>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-meta">
                <tbody>
                  {table.headers.map((h, i) => (
                    <tr key={i} className="border-b border-border last:border-b-0">
                      <td className="py-1.5 pe-3 font-extrabold text-navy">{h || fmt(c.columnN, { n: i + 1 })}</td>
                      <td className="py-1.5 pe-3 text-muted">{table.rows[0]?.[i] || "—"}</td>
                      <td className="py-1.5">
                        <select
                          value={mapping[i]}
                          onChange={(e) =>
                            setMapping((m) => m.map((f, n) => (n === i ? (e.target.value as SheetField) : f)))
                          }
                          className="h-[30px] rounded-md border border-border-strong bg-surface px-2 text-meta font-semibold text-navy"
                        >
                          {FIELDS.map((f) => (
                            <option key={f} value={f}>
                              {fieldLabel[f]}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid gap-1.5">
            <span className="text-label font-extrabold uppercase tracking-wide text-muted">{c.preview}</span>
            <div className="max-h-[220px] overflow-auto rounded-md border border-border">
              <table className="w-full border-collapse text-meta">
                <thead>
                  <tr>
                    <th className="border-b border-border bg-surface2 px-2.5 py-1.5 text-start text-label font-extrabold uppercase text-muted">
                      {c.colVendor}
                    </th>
                    {table.headers.map((h, i) => (
                      <th
                        key={i}
                        className="whitespace-nowrap border-b border-border bg-surface2 px-2.5 py-1.5 text-start text-label font-extrabold uppercase text-muted"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((cells, r) => {
                    const ok = importable(rows[r]);
                    return (
                      <tr key={r} className={cx("border-b border-border last:border-b-0", !ok && "bg-surface2")}>
                        <td className="px-2.5 py-1.5">
                          {/* Per row, because a batch always has an exception. */}
                          <input
                            type="checkbox"
                            disabled={!ok}
                            checked={ok && vendor[r] !== false}
                            onChange={(e) => setVendor((v) => v.map((x, n) => (n === r ? e.target.checked : x)))}
                            className="h-3.5 w-3.5 accent-ok"
                          />
                        </td>
                        {cells.map((v, i) => (
                          <td key={i} className={cx("whitespace-nowrap px-2.5 py-1.5", ok ? "text-navy" : "text-muted-light")}>
                            {v || "—"}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {skipped > 0 && (
              <span className="flex items-start gap-2 rounded-md bg-surface2 px-3 py-2 text-meta text-muted-dark">
                <Icon name="info" size={15} className="flex-none" />
                {/* Named, never dropped in silence. */}
                {fmt(c.skippedRows, { n: skipped })}
              </span>
            )}
          </div>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-ok/40 bg-ok-soft px-3 py-2.5 text-meta text-ok-deep">
            <input
              type="checkbox"
              checked={vendor.every((v) => v !== false)}
              onChange={(e) => setVendor((v) => v.map(() => e.target.checked))}
              className="mt-0.5 h-4 w-4 flex-none accent-ok"
            />
            <span>
              <b className="block font-extrabold">{c.markAll}</b>
              <span className="block text-muted-dark">{c.markAllPreviewHint}</span>
            </span>
          </label>
        </div>
      )}
    </Dialog>
  );
}
