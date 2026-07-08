"use client";

import { useRef, useState } from "react";
import { uploadBidFiles, validateBidFile, type BidUploadedFile } from "@/lib/api/client";

export interface UploaderKind { value: string; label: string }

/**
 * Classified multi-file uploader for the public bid form. The supplier adds files (image/PDF); each is
 * uploaded straight to S3 (presign → PUT via `uploadBidFiles`) and then CLASSIFIED with a per-file
 * dropdown. Emits the uploaded `{key,type,filename}[]` (the `key`s go into the submit payload). Reused
 * for equipment photos, ownership, equipment/operator certs, and company-verification docs.
 */
export function FileUploader({
  token, folder, kinds, value, onChange, disabled, L, thumbs = false,
}: {
  token: string;
  folder: "photos" | "documents";
  kinds: UploaderKind[];
  value: BidUploadedFile[];
  onChange: (next: BidUploadedFile[]) => void;
  disabled?: boolean;
  L: (e: string, a: string) => string;
  thumbs?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});

  const errMsg = (code: string) =>
    code === "too_large" ? L("File exceeds 10 MB", "الملف يتجاوز ١٠ ميجابايت")
      : code === "unsupported_type" ? L("Only images or PDF are allowed", "الصور أو ملفات PDF فقط")
        : L("Upload failed — please try again", "فشل الرفع — حاول مرة أخرى");

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (inputRef.current) inputRef.current.value = "";
    if (!files.length) return;
    setErr(null);
    for (const f of files) { const bad = validateBidFile(f); if (bad) { setErr(errMsg(bad)); return; } }
    setBusy(true);
    try {
      const uploaded = await uploadBidFiles(token, files.map((f) => ({ file: f, folder, type: kinds[0].value })));
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

  const setType = (key: string, type: string) => onChange(value.map((v) => (v.key === key ? { ...v, type } : v)));
  const remove = (key: string) => onChange(value.filter((v) => v.key !== key));

  return (
    <div className="uploader">
      {value.length > 0 && (
        <div className="up-list">
          {value.map((v) => (
            <div className="up-item" key={v.key}>
              {thumbs && previews[v.key] ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="up-thumb" src={previews[v.key]} alt="" />
                </>
              ) : (
                <span className="material-icons-outlined up-fic">description</span>
              )}
              <div className="up-meta">
                <span className="up-fn" title={v.filename}>{v.filename}</span>
                <select className="up-sel" value={v.type} disabled={disabled} onChange={(e) => setType(v.key, e.target.value)}>
                  {kinds.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                </select>
              </div>
              <button type="button" className="up-rm" aria-label={L("Remove", "إزالة")} disabled={disabled} onClick={() => remove(v.key)}>
                <span className="material-icons-outlined">close</span>
              </button>
            </div>
          ))}
        </div>
      )}
      <button type="button" className="up-add" disabled={disabled || busy} onClick={() => inputRef.current?.click()}>
        <span className="material-icons-outlined">{busy ? "hourglass_top" : "upload_file"}</span>
        {busy ? L("Uploading…", "جارٍ الرفع…") : L("Add file", "إضافة ملف")}
      </button>
      <input ref={inputRef} type="file" accept="image/*,application/pdf" multiple hidden onChange={onPick} />
      {err && <div className="up-err">{err}</div>}
    </div>
  );
}
