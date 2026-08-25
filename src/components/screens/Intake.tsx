"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { useRfq } from "@/lib/store/rfq-store";
import { useSession } from "@/lib/session";
import { Button, Icon } from "@/components/ui";
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

const FILE_CHIPS = ["PDF", "Word", "Excel", "Image"];

/**
 * A file's size, read back off the data URL the store already holds.
 *
 * The store keeps `{ name, type, data }` and never kept the byte count. Rather than widen that
 * contract for a caption, the size is recovered from the base64 payload: 4 characters carry 3 bytes,
 * less the padding. Exact, and it costs nothing at the call site.
 */
function sizeOf(dataUrl: string | undefined): string {
  // A file whose read failed is stored with no payload — it still lists, it just has no size to state.
  if (!dataUrl) return "";
  const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  if (!b64) return "";
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  const bytes = Math.max(0, (b64.length * 3) / 4 - pad);
  return bytes > 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}

/**
 * RFQ intake (web-app/002, AC-01/05/07/08) — the Intake prototype (owner, 2026-08-26).
 *
 * Two cards and nothing else: DESCRIBE, then OR, then ATTACH. The mode-selection card that used to
 * head the screen is gone — it named one mode and offered no choice, so it was a heading pretending
 * to be a control.
 *
 * The placeholder TYPES ITSELF through four examples. It is the one flourish here and it earns its
 * place: this screen's whole difficulty is that a renter does not know how much to write, and four
 * real sentences answer that faster than any instruction under the box.
 *
 * Files can be DROPPED now, not only browsed — the prototype's dropzone was live, and a dashed
 * rectangle that rejects a dragged file is a worse lie than no dashed rectangle.
 */
export function Intake() {
  const t = useT();
  const { state, actions } = useRfq();
  const { status } = useSession();
  const [rejected, setRejected] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // ── The typing placeholder ──
  const examples = t.intake.placeholderExamples;
  const [typed, setTyped] = useState("");
  const cursor = useRef({ phrase: 0, char: 0, deleting: false });
  useEffect(() => {
    // It stops the moment the renter starts writing: a placeholder that keeps moving under live text
    // is a distraction, and it is not visible anyway.
    if (state.text.length > 0) return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const c = cursor.current;
      const phrase = examples[c.phrase % examples.length];
      let delay = 45;
      if (!c.deleting) {
        c.char++;
        if (c.char > phrase.length) {
          c.deleting = true;
          delay = 1600;
        }
      } else {
        c.char--;
        delay = 22;
        if (c.char <= 0) {
          c.deleting = false;
          c.phrase = (c.phrase + 1) % examples.length;
          delay = 300;
        }
      }
      setTyped(phrase.slice(0, Math.max(0, c.char)));
      timer = setTimeout(tick, delay);
    };
    timer = setTimeout(tick, 400);
    return () => clearTimeout(timer);
  }, [examples, state.text.length]);

  // Server-side guest cap backstop: if localStorage was cleared, the client gate below lets the run
  // through but the BFF blocks it → the store sets guestLimit → open the SAME account modal (no error).
  useEffect(() => {
    if (state.guestLimit) setShowAccount(true);
  }, [state.guestLimit]);

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
    <div className="mx-auto w-full max-w-[920px]">
      <h1 className="text-[26px] font-extrabold leading-tight tracking-[-.02em] text-navy">{t.intake.heading}</h1>
      <p className="mb-7 mt-2 text-[15px] leading-relaxed text-muted">{t.intake.subheading}</p>

      {/* ── Describe ── */}
      <div className="rounded-[16px] border border-border bg-surface shadow-[0_1px_3px_rgba(15,23,31,.06),0_16px_40px_-20px_rgba(31,45,58,.12)]">
        <div className="flex items-center gap-2.5 px-5 pb-1 pt-4">
          <span className="grid h-8 w-8 flex-none place-items-center rounded-[10px] bg-gradient-to-br from-[#f7c675] to-brand text-white">
            <Icon name="auto_awesome" size={16} />
          </span>
          <b className="whitespace-nowrap text-[15px] font-extrabold text-navy">{t.intake.pasteLabel}</b>
          <span className="whitespace-nowrap rounded-full bg-brand-soft px-2.5 py-[3px] text-[11px] font-extrabold uppercase tracking-[.03em] text-warn">
            {t.intake.beta}
          </span>
          <span className="min-w-0 flex-1" />
          <span className="whitespace-nowrap text-[12px] font-semibold text-muted">
            {state.text.length} {t.intake.chars}
          </span>
        </div>
        <textarea
          value={state.text}
          onChange={(e) => actions.setText(e.target.value)}
          placeholder={typed}
          rows={4}
          className="w-full resize-none border-0 bg-transparent px-5 pb-5 pt-2.5 text-[15px] leading-relaxed text-navy outline-none placeholder:text-muted/70"
        />
      </div>

      {/* ── or ── */}
      <div className="my-5 flex items-center gap-3.5">
        <span className="h-px flex-1 bg-border" />
        <span className="text-[12.5px] font-extrabold uppercase tracking-[.04em] text-muted">{t.intake.attachDivider}</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      {/* ── Attach ── */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={(e) => { e.preventDefault(); setDragging(false); }}
        onDrop={(e) => { e.preventDefault(); setDragging(false); onFiles(e.dataTransfer.files); }}
        className={`rounded-[16px] border bg-surface shadow-[0_1px_3px_rgba(15,23,31,.06),0_16px_40px_-20px_rgba(31,45,58,.12)] transition ${
          dragging ? "border-[1.5px] border-brand" : "border-border"
        }`}
      >
        <div className="flex items-center gap-2.5 px-5 pb-3.5 pt-4">
          <span className="grid h-8 w-8 flex-none place-items-center rounded-[10px] bg-navy text-white">
            <Icon name="upload" size={16} />
          </span>
          <b className="whitespace-nowrap text-[15px] font-extrabold text-navy">{t.intake.attachTitle}</b>
        </div>

        <div
          className={`mx-5 mb-4 rounded-[16px] border-[1.5px] border-dashed px-5 py-6 text-center transition ${
            dragging ? "border-brand bg-brand-soft" : "border-brand/40 bg-brand-soft/45"
          }`}
        >
          <span className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-[12px] border border-border bg-surface text-brand shadow-[0_2px_6px_rgba(31,45,58,.06)]">
            <Icon name="upload" size={19} />
          </span>
          <div className="text-[14px] text-navy">
            <b className="font-bold">{t.intake.dropTitleNew}</b>{" "}
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="font-bold text-brand underline underline-offset-2 hover:brightness-110"
            >
              {t.intake.browse}
            </button>
          </div>
          <p className="mb-3.5 mt-1.5 text-[12.5px] text-muted">{t.intake.dropSub}</p>
          <div className="flex flex-wrap justify-center gap-2">
            {FILE_CHIPS.map((c) => (
              <span key={c} className="rounded-lg border border-border bg-surface px-3 py-[5px] text-[11.5px] font-bold text-navy-mid">
                {c}
              </span>
            ))}
          </div>
        </div>

        <input ref={fileInput} type="file" multiple accept={ACCEPT_ATTR} className="hidden" onChange={(e) => onFiles(e.target.files)} />

        {rejected && <p className="px-5 pb-3.5 text-[12.5px] font-semibold text-danger">{t.intake.fileRejected}</p>}

        {state.files.length > 0 && (
          <div className="flex flex-col gap-2 px-5 pb-4">
            {state.files.map((f, i) => (
              <div key={`${f.name}-${i}`} className="flex items-center gap-2.5 rounded-[12px] border border-border bg-surface2/50 px-3.5 py-2.5">
                <Icon name="description" size={16} className="flex-none text-muted" />
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-navy">{f.name}</span>
                <span className="flex-none text-[12px] text-muted">{sizeOf(f.data)}</span>
                <button
                  onClick={() => actions.removeFile(i)}
                  aria-label={t.common.close}
                  className="grid h-6 w-6 flex-none place-items-center rounded-full text-muted transition hover:bg-surface2 hover:text-navy"
                >
                  <Icon name="close" size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── The way on ── */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        {hasDraft ? (
          <Button variant="secondary" onClick={() => actions.resumeWizard()}>
            <Icon name="arrow_back" size={16} className="rtl:scale-x-[-1]" /> {t.intake.backToReview}
          </Button>
        ) : (
          <span className="text-[13px] text-muted">{canStart ? t.intake.readyToReview : t.intake.addSomething}</span>
        )}
        <Button disabled={!canStart} onClick={runAgent} className="px-6 py-3 text-[14px]">
          {hasDraft ? t.intake.reAnalyze : t.intake.continueLabel}{" "}
          <Icon name="arrow_forward" size={17} className="rtl:scale-x-[-1]" />
        </Button>
      </div>

      {/* Guest hit the free agent-run limit → create an account, then continue processing. */}
      <AccountModal open={showAccount} onClose={() => setShowAccount(false)} onCreated={() => { setShowAccount(false); void actions.process(); }} title={t.guest.trialTitle} subtitle={t.guest.trialSub} />
    </div>
  );
}
