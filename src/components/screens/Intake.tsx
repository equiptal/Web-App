"use client";

import { useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { useRfq } from "@/lib/store/rfq-store";
import { Button, Card, TextArea, Badge } from "@/components/ui";

/** Accepted file types (AC-05/07): PDF, image, Word, Excel. No size/count/length limit (AC-08). */
const ACCEPT_ATTR = ".pdf,image/*,.doc,.docx,.xls,.xlsx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function isAccepted(file: File): boolean {
  const type = file.type;
  if (type === "application/pdf") return true;
  if (type.startsWith("image/")) return true;
  if (type === "application/msword" || type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return true;
  if (type === "application/vnd.ms-excel" || type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") return true;
  // Fallback to extension when the browser doesn't set a MIME type.
  return /\.(pdf|png|jpe?g|gif|webp|bmp|tiff?|doc|docx|xls|xlsx)$/i.test(file.name);
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
        // Read as base64 so real uploads can be forwarded to the agent.
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
    <div className="mx-auto max-w-2xl">
      <h1 className="text-xl font-semibold">{t.intake.heading}</h1>
      <p className="mt-1 text-sm text-muted">{t.intake.subheading}</p>

      {/* AC-01: two tabs, RFQ and Manual. */}
      <div className="mt-5 flex gap-1 rounded-lg border border-border bg-surface p-1 text-sm">
        <button
          onClick={() => setTab("rfq")}
          className={`flex-1 rounded-md px-3 py-1.5 font-medium ${tab === "rfq" ? "bg-brand text-brand-fg" : "text-muted"}`}
        >
          {t.intake.tabRfq}
        </button>
        <button
          onClick={() => setTab("manual")}
          className={`flex-1 rounded-md px-3 py-1.5 font-medium ${tab === "manual" ? "bg-brand text-brand-fg" : "text-muted"}`}
        >
          {t.intake.tabManual}
        </button>
      </div>

      {tab === "manual" ? (
        <Card className="mt-4">
          <p className="text-sm text-muted">{t.intake.manualNote}</p>
        </Card>
      ) : (
        <Card className="mt-4">
          {/* AC-01: paste-text field + file-upload control. */}
          <label className="mb-1 block text-xs font-medium text-muted">{t.intake.pasteLabel}</label>
          <TextArea rows={6} value={state.text} placeholder={t.intake.pastePlaceholder} onChange={(e) => actions.setText(e.target.value)} />

          <div className="mt-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted">{t.intake.uploadLabel}</span>
              <span className="text-xs text-muted">{t.intake.uploadHint}</span>
            </div>
            <button
              onClick={() => fileInput.current?.click()}
              className="mt-2 flex w-full items-center justify-center rounded-lg border border-dashed border-border bg-background py-6 text-sm text-muted hover:border-brand"
            >
              + {t.intake.uploadLabel}
            </button>
            <input ref={fileInput} type="file" multiple accept={ACCEPT_ATTR} className="hidden" onChange={(e) => onFiles(e.target.files)} />

            {rejected && <p className="mt-2 text-xs text-danger">{t.intake.fileRejected}</p>}

            {state.files.length > 0 && (
              <ul className="mt-3 space-y-1">
                {state.files.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center justify-between rounded-md bg-background px-3 py-1.5 text-sm">
                    <span className="truncate">{f.name}</span>
                    <button onClick={() => actions.removeFile(i)} className="text-xs text-muted hover:text-danger">
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-muted">{t.intake.acceptedTypes}</p>
          </div>

          <div className="mt-5 flex items-center justify-between gap-3">
            {/* Dev affordance to exercise AC-10 (network failure). */}
            <label className="flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" checked={state.simulateError} onChange={(e) => actions.setSimulateError(e.target.checked)} />
              simulate failure
            </label>
            <div className="flex items-center gap-3">
              {!canStart && <Badge>{t.intake.emptyHint}</Badge>}
              <Button disabled={!canStart} onClick={() => actions.process()}>
                {t.intake.startProcessing}
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
