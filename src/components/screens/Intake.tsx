"use client";

import { useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { useRfq } from "@/lib/store/rfq-store";
import { Button, Card, TextArea, Badge, Icon } from "@/components/ui";

/** Accepted file types (AC-05/07): PDF, image, Word, Excel. No size/count/length limit (AC-08). */
const ACCEPT_ATTR =
  ".pdf,image/*,.doc,.docx,.xls,.xlsx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function isAccepted(file: File): boolean {
  const type = file.type;
  if (type === "application/pdf") return true;
  if (type.startsWith("image/")) return true;
  if (type === "application/msword" || type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return true;
  if (type === "application/vnd.ms-excel" || type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") return true;
  return /\.(pdf|png|jpe?g|gif|webp|bmp|tiff?|doc|docx|xls|xlsx)$/i.test(file.name);
}

function fileGlyph(type: string): string {
  if (type.includes("pdf")) return "picture_as_pdf";
  if (type.startsWith("image/")) return "image";
  if (type.includes("sheet") || type.includes("excel")) return "table_chart";
  return "description";
}

export function Intake() {
  const t = useT();
  const { state, actions } = useRfq();
  const [tab, setTab] = useState<"rfq" | "manual">("rfq");
  const [rejected, setRejected] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const canStart = state.text.trim().length > 0 || state.files.length > 0;

  function onFiles(list: FileList | null) {
    if (!list) return;
    let anyRejected = false;
    const reads = Array.from(list)
      .map((f) => {
        if (!isAccepted(f)) {
          anyRejected = true; // AC-07
          return null;
        }
        return new Promise<{ name: string; type: string; data: string }>((resolve) => {
          const r = new FileReader();
          const type = f.type || "application/octet-stream";
          r.onload = () => resolve({ name: f.name, type, data: String(r.result) });
          r.onerror = () => resolve({ name: f.name, type, data: "" });
          r.readAsDataURL(f);
        });
      })
      .filter(Boolean) as Promise<{ name: string; type: string; data: string }>[];
    setRejected(anyRejected);
    if (reads.length) Promise.all(reads).then((files) => actions.addFiles(files));
    if (fileInput.current) fileInput.current.value = "";
  }

  return (
    <div>
      {/* phead */}
      <h1 className="text-[23px] font-extrabold tracking-tight">{t.intake.heading}</h1>
      <p className="mt-1 max-w-xl text-sm text-muted">{t.intake.subheading}</p>

      {/* modeline — segmented tabs (AC-01) */}
      <div className="mt-5 inline-flex w-max overflow-hidden rounded-[10px] border border-border bg-surface">
        <button
          onClick={() => setTab("rfq")}
          className={`flex items-center gap-2 border-e border-border px-[18px] py-2.5 text-[13.5px] font-bold ${tab === "rfq" ? "bg-surface2 text-navy shadow-[inset_0_-2px_0_var(--brand)]" : "text-muted"}`}
        >
          <Icon name="upload_file" size={18} /> {t.intake.tabRfq}
        </button>
        <button
          onClick={() => setTab("manual")}
          className={`flex items-center gap-2 px-[18px] py-2.5 text-[13.5px] font-bold ${tab === "manual" ? "bg-surface2 text-navy" : "text-muted"}`}
        >
          <Icon name="edit_note" size={18} /> {t.intake.tabManual}
          <span className="rounded bg-surface3 px-1.5 py-0.5 text-[9.5px] font-extrabold text-muted">{t.intake.tabLater}</span>
        </button>
      </div>

      {tab === "manual" ? (
        <Card className="mt-4">
          <p className="text-sm text-muted">{t.intake.manualNote}</p>
        </Card>
      ) : (
        <Card className="mt-4">
          {/* Paste (AC-01) */}
          <label className="mb-2 block text-[12.5px] font-bold text-navy-mid">{t.intake.pasteLabel}</label>
          <TextArea rows={6} value={state.text} placeholder={t.intake.pastePlaceholder} onChange={(e) => actions.setText(e.target.value)} />

          {/* Attach (AC-05/07/08) */}
          <div className="mt-4">
            <label className="mb-2 block text-[12.5px] font-bold text-navy-mid">
              {t.intake.uploadLabel} <span className="font-semibold text-text-disabled text-muted/70">{t.intake.uploadOptional}</span>
            </label>
            <button
              onClick={() => fileInput.current?.click()}
              className="w-full rounded-[10px] border-[1.5px] border-dashed border-border bg-surface2 px-4 py-6 text-center transition-colors hover:border-brand"
            >
              <Icon name="upload" size={28} className="text-navy-mid" />
              <div className="mt-1.5 text-[13.5px] font-bold text-navy-mid">{t.intake.dropTitle}</div>
              <div className="text-xs text-muted">{t.intake.uploadHint}</div>
            </button>
            <input ref={fileInput} type="file" multiple accept={ACCEPT_ATTR} className="hidden" onChange={(e) => onFiles(e.target.files)} />

            {rejected && <p className="mt-2 text-xs text-danger">{t.intake.fileRejected}</p>}

            {state.files.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {state.files.map((f, i) => (
                  <span key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-[10px] border border-border bg-surface px-2.5 py-1.5 text-[12.5px] font-semibold">
                    <Icon name={fileGlyph(f.type)} size={16} className="text-navy-mid" />
                    <span className="max-w-[160px] truncate">{f.name}</span>
                    <button onClick={() => actions.removeFile(i)} className="text-muted hover:text-danger">
                      <Icon name="close" size={15} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* footer */}
          <div className="mt-6 flex items-center justify-between gap-3">
            {/* Dev affordance to exercise AC-10 (not part of the prototype). */}
            <label className="flex items-center gap-1.5 text-[11px] text-muted/70">
              <input type="checkbox" checked={state.simulateError} onChange={(e) => actions.setSimulateError(e.target.checked)} /> simulate failure
            </label>
            <div className="flex items-center gap-3">
              {!canStart && <Badge>{t.intake.emptyHint}</Badge>}
              <Button disabled={!canStart} onClick={() => actions.process()} className="px-6 py-3 text-[14.5px]">
                {t.intake.startProcessing} <Icon name="arrow_forward" size={18} />
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
