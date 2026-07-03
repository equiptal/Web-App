"use client";

import { useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { useRfq } from "@/lib/store/rfq-store";
import { useSession } from "@/lib/session";
import { Button, Card, TextArea, Icon } from "@/components/ui";
import { AccountModal } from "@/components/onboarding/AccountModal";
import { bumpAgentUse, guestLimitReached } from "@/lib/access/agent-quota";

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

const FILE_CHIPS = ["PDF", "Word", "Excel", "Image"];

/**
 * RFQ intake (web-app/002, AC-01/05/07/08). Two mode cards (Upload/Paste — active; Fill Manually —
 * coming soon), a paste card with a char count, an orange attach dropzone with file-type chips, and
 * a footer Continue. Paste text and/or attach files, then Continue to parse.
 */
export function Intake() {
  const t = useT();
  const { state, actions } = useRfq();
  const { status } = useSession();
  const [rejected, setRejected] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Per-device soft limit (T10): a guest gets a few free agent runs, then we prompt them to create an
  // account instead of running again. Signed-in users are never limited.
  const runAgent = () => {
    if (status === "anon" && guestLimitReached("create")) {
      setShowAccount(true);
      return;
    }
    if (status === "anon") bumpAgentUse("create");
    void actions.process();
  };

  const canStart = state.text.trim().length > 0 || state.files.length > 0;
  // A draft exists when the renter came back here from a wizard step ("Your request") — show
  // Back-to-review + re-analyze instead of the first-run Continue.
  const hasDraft = !!state.draft;

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
    <div className="w-full">
      <h1 className="text-[22px] font-extrabold tracking-tight text-navy">{t.intake.heading}</h1>
      <p className="mt-1 text-[13.5px] text-muted">{t.intake.subheading}</p>

      {/* Mode option cards (AC-01) */}
      <div className="mt-5">
        {/* Upload / Paste — the only mode (manual entry removed) */}
        <div className="flex items-start gap-3 rounded-[14px] border-2 border-brand bg-brand-soft p-4">
          <span className="grid h-11 w-11 flex-none place-items-center rounded-[10px] bg-brand text-white">
            <Icon name="upload" size={22} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <b className="text-[14px] font-bold text-navy">{t.intake.optUploadTitle}</b>
              <span className="inline-flex items-center gap-1 rounded-full bg-warn/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-warn">
                <Icon name="science" size={12} /> {t.intake.beta}
              </span>
            </div>
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{t.intake.optUploadDesc}</p>
          </div>
        </div>

      </div>

      {/* Paste + attach card */}
      <Card className="mt-5 !p-0">
        <div className="flex items-center justify-between px-5 pt-5">
          <b className="text-[14px] font-bold text-navy">{t.intake.pasteLabel}</b>
          <span className="text-[12.5px] text-muted">{t.intake.orUploadBelow}</span>
        </div>

        <div className="relative px-5 pt-3">
          <TextArea rows={6} value={state.text} placeholder={t.intake.pastePlaceholder} onChange={(e) => actions.setText(e.target.value)} />
          <span className="pointer-events-none absolute bottom-2.5 end-7 text-[11px] text-muted">
            {state.text.length} {t.intake.chars}
          </span>
        </div>

        {/* divider */}
        <div className="my-4 flex items-center gap-3 px-5 text-[12px] text-muted">
          <div className="h-px flex-1 bg-border" /> {t.intake.attachDivider} <div className="h-px flex-1 bg-border" />
        </div>

        {/* dropzone */}
        <div className="px-5">
          <button
            onClick={() => fileInput.current?.click()}
            className="w-full rounded-[14px] border-[1.5px] border-dashed border-brand/45 bg-brand-soft/50 px-4 py-7 text-center transition-colors hover:border-brand"
          >
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-[12px] border border-border bg-surface text-navy-mid">
              <Icon name="upload" size={22} />
            </span>
            <div className="mt-2.5 text-[14px] font-bold text-navy">
              {t.intake.dropTitle} <span className="text-brand">{t.intake.browse}</span>
            </div>
            <div className="mt-0.5 text-[12px] text-muted">{t.intake.dropSub}</div>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {FILE_CHIPS.map((c) => (
                <span key={c} className="rounded-md border border-border bg-surface px-2 py-1 text-[11px] font-semibold text-navy-mid">
                  {c}
                </span>
              ))}
            </div>
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
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4">
          {hasDraft ? (
            // Reached from a wizard step ("Your request") — return without re-parsing.
            <Button variant="secondary" onClick={() => actions.resumeWizard()}>
              <Icon name="arrow_back" size={16} className="rtl:scale-x-[-1]" /> {t.intake.backToReview}
            </Button>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[12.5px] text-muted">
              <Icon name="info" size={15} /> {t.intake.emptyHint}
            </span>
          )}
          <div className="flex items-center gap-3">
            {hasDraft && <span className="hidden text-[12px] text-muted sm:inline">{t.intake.editReparseNote}</span>}
            <Button disabled={!canStart} onClick={runAgent} className="px-6 py-3 text-[14px]">
              {hasDraft ? t.intake.reAnalyze : t.intake.startProcessing}{" "}
              <Icon name="arrow_forward" size={18} className="rtl:scale-x-[-1]" />
            </Button>
          </div>
        </div>
      </Card>

      {/* Guest hit the free agent-run limit → create an account, then continue processing. */}
      <AccountModal open={showAccount} onClose={() => setShowAccount(false)} onCreated={() => { setShowAccount(false); void actions.process(); }} />
    </div>
  );
}
