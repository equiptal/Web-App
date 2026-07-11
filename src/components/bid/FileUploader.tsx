"use client";

import { useRef, useState } from "react";
import { uploadBidFiles, validateBidFile, type BidUploadedFile } from "@/lib/api/client";

export interface UploaderKind { value: string; label: string }
export interface UploaderAccent { c: string; bg: string; bd: string }

/**
 * Bid-form file uploader with two shapes, driven by `kinds`:
 *  - **picker** (kinds.length > 1) — a "choose the type" dropdown + Upload button. Used where the
 *    supplier decides what a file is (equipment photos, proof of ownership).
 *  - **slot** (kinds.length === 1) — a single labeled drop-slot; the type is fixed (request-required
 *    equipment/operator cert, or a company-verification doc).
 * Either way it uploads straight to S3 (`uploadBidFiles`) and emits `{key,type,filename}[]`.
 */
export function FileUploader({
  token, folder, kinds, value, onChange, disabled, L, thumbs = false, accent,
}: {
  token: string;
  folder: "photos" | "documents";
  kinds: UploaderKind[];
  value: BidUploadedFile[];
  onChange: (next: BidUploadedFile[]) => void;
  disabled?: boolean;
  L: (e: string, a: string) => string;
  thumbs?: boolean;
  accent?: UploaderAccent;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingType = useRef<string>(kinds[0]?.value ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [sel, setSel] = useState(kinds[0]?.value ?? "");
  const [open, setOpen] = useState(false);

  const isPicker = kinds.length > 1;
  const kindLabel = (v: string) => kinds.find((k) => k.value === v)?.label ?? v;
  const style = accent
    ? ({ ["--ac"]: accent.c, ["--ac-bg"]: accent.bg, ["--ac-bd"]: accent.bd } as React.CSSProperties)
    : undefined;

  const errMsg = (code: string) =>
    code === "too_large" ? L("File exceeds 10 MB", "الملف يتجاوز ١٠ ميجابايت")
      : code === "unsupported_type" ? L("Only images or PDF are allowed", "الصور أو ملفات PDF فقط")
        : L("Upload failed — please try again", "فشل الرفع — حاول مرة أخرى");

  function trigger(type: string) {
    pendingType.current = type;
    inputRef.current?.click();
  }

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (inputRef.current) inputRef.current.value = "";
    if (!files.length) return;
    setErr(null);
    for (const f of files) { const bad = validateBidFile(f); if (bad) { setErr(errMsg(bad)); return; } }
    setBusy(true);
    try {
      const type = pendingType.current || kinds[0].value;
      const uploaded = await uploadBidFiles(token, files.map((f) => ({ file: f, folder, type })));
      const pv: Record<string, string> = {};
      uploaded.forEach((u, k) => { const f = files[k]; if (f.type.startsWith("image/")) pv[u.key] = URL.createObjectURL(f); });
      setPreviews((p) => ({ ...p, ...pv }));
      onChange([...value, ...uploaded]);
    } catch (e2) {
      setErr(errMsg((e2 as Error).message));
    } finally {
      setBusy(false);
    }
  }

  const remove = (key: string) => onChange(value.filter((v) => v.key !== key));

  return (
    <div className="uploader" style={style}>
      {isPicker ? (
        <div className="u-pick">
          <div className="u-sel">
            <button type="button" className="u-sel-btn" disabled={disabled} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
              <span>{kindLabel(sel)}</span>
              <span className="material-icons-outlined u-sel-car">{open ? "expand_less" : "expand_more"}</span>
            </button>
            {open && (
              <>
                <div className="u-sel-back" onClick={() => setOpen(false)} />
                <div className="u-sel-menu" role="listbox">
                  {kinds.map((k) => (
                    <button
                      type="button" key={k.value} role="option" aria-selected={k.value === sel}
                      className={`u-sel-mi${k.value === sel ? " on" : ""}`}
                      onClick={() => { setSel(k.value); setOpen(false); }}
                    >
                      <span className="material-icons-outlined u-sel-dot">description</span>
                      <span>{k.label}</span>
                      {k.value === sel && <span className="material-icons-outlined u-sel-tick">check</span>}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <button type="button" className="u-up" disabled={disabled || busy} onClick={() => trigger(sel)}>
            <span className="material-icons-outlined">{busy ? "hourglass_top" : "upload"}</span>
            {busy ? L("Uploading…", "جارٍ الرفع…") : L("Upload", "رفع")}
          </button>
        </div>
      ) : value.length === 0 ? (
        <button type="button" className="u-slot" disabled={disabled || busy} onClick={() => trigger(kinds[0]?.value ?? "")}>
          <span className="u-slot-ic material-icons-outlined">description</span>
          <span className="u-slot-tx">
            <span className="u-slot-nm">{kinds[0]?.label}</span>
            <span className="u-slot-hint">{busy ? L("Uploading…", "جارٍ الرفع…") : L("Drag & drop or tap · PDF or image · max 10 MB", "اسحب وأفلت أو انقر · PDF أو صورة · بحد أقصى ١٠ ميجابايت")}</span>
          </span>
          <span className="u-slot-plus material-icons-outlined">add</span>
        </button>
      ) : null}

      {value.length > 0 && (
        <div className="u-files">
          {value.map((v) => (
            <div className="u-frow" key={v.key}>
              {thumbs && previews[v.key] ? (
                <span className="u-fic thumb">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previews[v.key]} alt="" />
                </span>
              ) : (
                <span className="u-fic material-icons-outlined">description</span>
              )}
              <div className="u-fmeta">
                <span className="u-fkind">{kindLabel(v.type)}</span>
                <span className="u-ffn" title={v.filename ?? undefined}>{v.filename}</span>
              </div>
              <span className="u-fdone material-icons-outlined" title={L("Uploaded", "تم الرفع")}>check_circle</span>
              <button type="button" className="u-frm" aria-label={L("Remove", "إزالة")} disabled={disabled} onClick={() => remove(v.key)}>
                <span className="material-icons-outlined">close</span>
              </button>
            </div>
          ))}
          {!isPicker && (
            <button type="button" className="u-slot-more" disabled={disabled || busy} onClick={() => trigger(kinds[0]?.value ?? "")}>
              <span className="material-icons-outlined">add</span>
              {busy ? L("Uploading…", "جارٍ الرفع…") : `${L("Add another", "إضافة أخرى")} ${kinds[0]?.label ?? ""}`}
            </button>
          )}
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*,application/pdf" multiple hidden onChange={onFiles} />
      {err && <div className="u-err">{err}</div>}
    </div>
  );
}
