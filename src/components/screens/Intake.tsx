"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { useRfq } from "@/lib/store/rfq-store";
import { ProjectChips } from "@/components/create/ProjectChips";
import { ProjectPills } from "@/components/create/ProjectPills";
import { warmAgentCache } from "@/lib/api/client";
import { useSession } from "@/lib/session";
import { Button, Icon } from "@/components/ui";
import { AccountModal } from "@/components/onboarding/AccountModal";
import { bumpAgentUse, guestLimitReached } from "@/lib/access/agent-quota";
import { pin } from "@/lib/uiPins";

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
 * RFQ intake (web-app/002, AC-01/05/07/08) — the Intake prototype (owner, 2026-08-30).
 *
 * ── ONE box, centred, and nothing beside it ─────────────────────────────────────────────────────
 *
 * It was a two-pane card: DESCRIBE on the left, a dashed dropzone on the right, an «OR» on the rule
 * between them. That laid out a choice the renter does not have to make — attaching is what you do
 * when you already have a document, and until you do, half the card was an advert for a path you are
 * not on. So the dropzone collapses to *Upload RFQ*, a quiet button on the floor of the box, and the
 * box gets the whole width. Dropping a file anywhere on the card still works and the file list still
 * appears inside it: the capability did not shrink, only its footprint.
 *
 * ── What sits under the box ─────────────────────────────────────────────────────────────────────
 *
 * The renter's own SITES, and nothing else (owner, 2026-08-31). ~~A row of example sentences that
 * wrote themselves in.~~ Withdrawn: the placeholder already types itself through those examples —
 * this screen's whole difficulty is that a renter does not know how much to write, and a real
 * sentence answers that faster than any instruction — so the chips repeated the lesson for one press
 * a renter makes on their first visit and never again. A site fills in half the request, every visit
 * after the first.
 *
 * Files can be DROPPED, not only browsed — a card that rejects a dragged file is a worse lie than
 * no target at all.
 */
export function Intake() {
  const t = useT();

  const { state, actions } = useRfq();

  /**
   * Hand over to the processing screen only if the parse is still running after 8 seconds (W-T23).
   *
   * Taking the whole page for something that finishes in 400 ms is a flash of a screen nobody had
   * time to read; leaving a spinner in a corner for eleven seconds is a page that looks broken.
   * Eight is past the fast paths and short of a renter deciding it has hung.
   */
  useEffect(() => {
    if (!state.busy) return;
    const id = setTimeout(() => actions.escalateProcessing(), 8000);
    return () => clearTimeout(id);
  }, [state.busy, actions]);

  /**
   * Warm the prompt cache when the screen opens with a site selected.
   *
   * Best-effort in the strict sense: never awaited, never blocking, never surfaced, and a failure is
   * invisible. It buys a cache read instead of a write on the call the renter is about to make, and
   * if it does not land they simply pay what they pay today.
   */
  useEffect(() => {
    if (state.project) warmAgentCache();
  }, [state.project]);
  const { status } = useSession();
  const [rejected, setRejected] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // ── The typing placeholder ──
  const examples = t.intake.examples;
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
    <div {...pin("create-intake")} className="mx-auto w-full max-w-[880px]">
      {/* Centred, because the box below it is the only thing on this screen and a left-aligned
          heading over a full-width card points at nothing. */}
      <h1 className="text-center text-display font-extrabold leading-tight tracking-[-.02em] text-navy">{t.intake.heading}</h1>
      <p className="mx-auto mb-6 mt-2 max-w-[640px] text-center text-subhead leading-relaxed text-muted">{t.intake.subheading}</p>

      {/* ── The box ──
          The whole card is the drop target, not a rectangle inside it: a renter dragging a file at
          this screen is aiming at the thing they were typing into. */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={(e) => { e.preventDefault(); setDragging(false); }}
        onDrop={(e) => { e.preventDefault(); setDragging(false); onFiles(e.dataTransfer.files); }}
        /* The BOX takes the focus, not the field inside it. The global `:focus-visible` rule draws a
           2px brand outline on everything focusable, and on a textarea filling a card with
           `overflow-hidden` that outline was clipped to a single orange bar across the card's floor
           (owner, 2026-08-31: remove it). Moved to the card's own border, which is one line in the
           place a border belongs — and a keyboard user still sees where they are. */
        className={`flex flex-col overflow-hidden rounded-lg border bg-surface transition focus-within:border-brand ${
          dragging ? "border-brand ring-2 ring-brand/25" : "border-border"
        }`}
      >
        <textarea
          value={state.text}
          onChange={(e) => actions.setText(e.target.value)}
          placeholder={typed}
          aria-label={t.intake.pasteLabel}
          className="min-h-[188px] w-full flex-1 resize-none border-0 bg-transparent px-5 pb-2 pt-5 text-subhead leading-relaxed text-navy outline-none placeholder:text-muted/70 focus-visible:outline-none"
        />

        {/* ── The floor: the one control the dropzone became ──
            The button alone. «Add as many files as you like — we'll read them all» stood beside it
            until 2026-08-31 (owner: remove it): no limit is stated anywhere, so a line promising
            there is none was answering a question nobody had asked, and the button already says
            what it does. */}
        <div className="flex flex-wrap items-center gap-2.5 px-5 pb-4 pt-1">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="flex items-center gap-1.5 rounded-sm border border-border bg-surface px-3 py-1.5 text-body font-semibold text-navy-mid transition hover:border-brand hover:text-brand"
          >
            <Icon name="upload" size={15} className="flex-none" />
            {t.intake.uploadRfq}
          </button>
        </div>

        <input ref={fileInput} type="file" multiple accept={ACCEPT_ATTR} className="hidden" onChange={(e) => onFiles(e.target.files)} />

        {rejected && <p className="px-5 pb-3.5 text-meta font-semibold text-danger">{t.intake.fileRejected}</p>}

        {state.files.length > 0 && (
          <div className="flex flex-col gap-2 px-5 pb-4">
            {state.files.map((file, i) => (
              <div key={`${file.name}-${i}`} className="flex items-center gap-2.5 rounded-sm border border-border bg-surface2/50 px-3.5 py-2.5">
                <Icon name="description" size={16} className="flex-none text-muted" />
                <span className="min-w-0 flex-1 truncate text-body font-semibold text-navy">{file.name}</span>
                <span className="flex-none text-meta text-muted">{sizeOf(file.data)}</span>
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

      {/* ── PROJ · the renter's own sites, under the box (owner, 2026-08-31) ─────────────────────
          *"Projects will be in the place of these suggestions."*

          ~~The strip lived inside the card, on the floor of the field.~~ ~~And under the card sat a
          row of example sentences that wrote themselves in.~~ Both are answered by one move: the
          sites take the row the examples had.

          It is the right trade. The examples taught a renter what to write, and the typing
          placeholder in the box already does that — the chips only repeated it, for the one press a
          renter makes on their first visit and never again. The sites are the opposite: they are the
          renter's own, they matter on every visit after the first, and they are the one thing here
          that fills in half the request. And a strip of the renter's OWN data reads better as a row
          of things to pick from under the box than as furniture bolted inside it.

          `ProjectChips` renders until one is picked, `ProjectPills` after — the same strip, so
          choosing a site swaps its contents and moves nothing. Both render nothing at all when there
          is no site to show, so a renter who has never made one sees a plain box. */}
      <ProjectChips />
      <ProjectPills />

      {/* ── The way on ── */}
      <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
        {hasDraft ? (
          <Button variant="secondary" onClick={() => actions.resumeWizard()} className="me-auto">
            <Icon name="arrow_back" size={16} className="rtl:scale-x-[-1]" /> {t.intake.backToReview}
          </Button>
        ) : (
          /* A disabled Continue with nothing beside it is indistinguishable from a broken one, so
             the only thing that can hold it says so. */
          !canStart && <span className="text-meta text-muted">{t.intake.addSomething}</span>
        )}
        <Button disabled={!canStart || state.busy} onClick={runAgent} className="px-6 py-3 text-body">
          {state.busy ? t.intake.reading : hasDraft ? t.intake.reAnalyze : t.intake.continueLabel}{" "}
          <Icon name={state.busy ? "hourglass_empty" : "arrow_forward"} size={17} className={state.busy ? "" : "rtl:scale-x-[-1]"} />
        </Button>
      </div>

      {/* Guest hit the free agent-run limit → create an account, then continue processing. */}
      <AccountModal open={showAccount} onClose={() => setShowAccount(false)} onCreated={() => { setShowAccount(false); void actions.process(); }} title={t.guest.trialTitle} subtitle={t.guest.trialSub} />
    </div>
  );
}
