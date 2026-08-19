"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  TemplateNotReadyError,
  applyResolutions,
  deleteTemplate,
  downloadExport,
  exportWithTemplate,
  getTemplate,
  getTemplateSheet,
  listTemplates,
  uploadTemplate,
  waitForMapping,
} from "@/lib/api/export-templates";
import type {
  ExportPayload,
  ExportResult,
  ExportTemplateSummaryRow,
  MappedCorrection,
  ReconciliationView,
  SheetView,
  UnfilledResolution,
} from "@/lib/contract/export-templates";
import { TemplateSheetGrid } from "./TemplateSheetGrid";

/**
 * Export a bid comparison into the company's OWN spreadsheet template.
 *
 * ── Why this is one shared component ─────────────────────────────────────────────────
 * Three surfaces export a comparison — `BidComparisonWorkspace`, `CompareBids` and
 * `GroupBids`. Shipping a picker to only one of them is the known failure mode in this
 * codebase (the same trap as the two bid-card components), so the whole flow lives here and
 * each surface supplies just two things: how to build its payload, and how to run its own
 * built-in export. Parity is then structural rather than something to remember.
 *
 * The flow: pick a template → see what will be blank → download. Uploading a new one goes
 * through a review step where the user resolves the differences the mapper could not.
 */

type LFn = (en: string, ar: string) => string;

const C = {
  navy: "#1C3550", navyMid: "#2A4F72", action: "#F79009", actionDim: "#FFF4E5",
  success: "#1DAF58", successBg: "#E7F7EE", warning: "#D4780A", warningBg: "#FFF3E0",
  danger: "#D9362A", dangerBg: "#FCEBEA", muted: "#6B8FA8",
  surface2: "#EFF4F9", border: "#D4E0EC", disabled: "#9BB3C8",
};

type Stage = "picker" | "naming" | "mapping" | "review" | "preflight";

export interface ExportTemplateDialogProps {
  open: boolean;
  onClose: () => void;
  ar: boolean;
  L: LFn;
  /** Build the export payload from the caller's current comparison state. */
  buildPayload: () => ExportPayload | null;
  /** The surface's existing export — the fallback whenever a template can't be used. */
  onBuiltinExport: () => void;
  toast: (msg: string) => void;
}

export function ExportTemplateDialog(props: ExportTemplateDialogProps) {
  const { open, onClose, ar, L, buildPayload, onBuiltinExport, toast } = props;

  const [stage, setStage] = useState<Stage>("picker");
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<ExportTemplateSummaryRow[] | null>(null);
  const [scope, setScope] = useState<"company" | "personal">("personal");
  const [review, setReview] = useState<ReconciliationView | null>(null);
  const [sheet, setSheet] = useState<SheetView | null>(null);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [promptValues, setPromptValues] = useState<Record<string, string>>({});
  const fileInput = useRef<HTMLInputElement>(null);
  /** Cancels an in-flight mapping poll when the dialog closes or another upload starts. */
  const pollAbort = useRef<AbortController | null>(null);
  /** Which stage of the mapping the user is watching. -1 once it has finished. */
  const [mapStep, setMapStep] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const list = await listTemplates();
      setRows(list.templates);
      setScope(list.scope);
    } catch {
      setRows([]); // never block the dialog — the built-in export is always offered
    }
  }, []);

  /**
   * Open the review for a template: its reconciliation AND its annotated sheet.
   *
   * The grid IS the review, so both are fetched together. A sheet that fails to load is not
   * fatal — the card list still answers every question, and losing the drawing beats losing
   * the ability to review at all.
   */
  const loadReview = useCallback(
    async (templateId: string) => {
      /* The comparison goes WITH the sheet request, so the grid comes back already filled
       * with the figures this export would write. One call: describing the cells and filling
       * them are the same question. */
      const payload = buildPayload() ?? undefined;
      const [view, grid] = await Promise.all([
        getTemplate(templateId),
        getTemplateSheet(templateId, payload).catch(() => null),
      ]);
      setReview(view);
      setSheet(grid);
    },
    [buildPayload]
  );

  useEffect(() => {
    if (!open) {
      // Closed — stop any mapping poll still running. The job itself carries on server-side
      // and the row keeps its status, so the result is waiting on the next open.
      pollAbort.current?.abort();
      pollAbort.current = null;
      return;
    }
    setStage("picker");
    setResult(null);
    setReview(null);
    setSheet(null);
    void refresh();
  }, [open, refresh]);

  // Unmount is the same story as close, minus the chance to re-render.
  useEffect(() => () => pollAbort.current?.abort(), []);

  if (!open) return null;

  const errText = (e: unknown): string => {
    const anyErr = e as { message?: string; messageAr?: string };
    return (ar && anyErr?.messageAr) || anyErr?.message || L("Something went wrong.", "حدث خطأ ما.");
  };

  /* ── upload ─────────────────────────────────────────────────────────────────────── */

  function pickFile(f: File) {
    setPendingFile(f);
    setNameDraft(f.name.replace(/\.(xlsx|csv)$/i, ""));
    setStage("naming");
  }

  async function confirmUpload() {
    if (!pendingFile || !nameDraft.trim()) return;
    setBusy(true);
    setStage("mapping");

    // Closing the dialog must stop the poll — otherwise it keeps running against a dialog
    // nobody is looking at and can drag the user back into a stage they left.
    pollAbort.current?.abort();
    const abort = new AbortController();
    pollAbort.current = abort;

    /* The agent does not report sub-progress, so the stages are PACED rather than measured —
     * same approach as the RFQ processing screen. They are honest about the order of work and
     * deliberately stop at the last one instead of pretending to finish: a bar that fills and
     * then waits is worse than one that admits it is still going. */
    setMapStep(0);
    const paced = setInterval(() => setMapStep((n) => Math.min(n + 1, MAPPING_STAGES - 1)), 6000);

    try {
      let created = await uploadTemplate(pendingFile, nameDraft.trim());

      /* Registering only STARTS the mapping — a real template takes 20-60s, longer than the
       * SSR gateway allows, so it runs as a job and we poll. The `mapping` stage above is what
       * the user sees meanwhile. */
      if (created.status === "mapping" && created.jobId) {
        created = await waitForMapping(created.id, created.jobId, { signal: abort.signal });
      }
      await refresh();

      if (created.status === "failed" || created.status === "mapping") {
        /* Keep the row so the user can see why in the picker, but send them back rather than
         * into an empty review screen. The reason is appended verbatim: a wrong environment
         * and an unreadable sheet used to read identically here, and only one is about their
         * file. `mapping` still showing means we stopped waiting, not that it failed. */
        const detail = created.mappingError;
        toast(
          detail
            ? `${L("Mapping didn't finish.", "لم يكتمل التخصيص.")} ${detail}`
            : L("Mapping failed.", "فشل التخصيص.")
        );
        setStage("picker");
        return;
      }
      await loadReview(created.id);
      setStage("review");
    } catch (e) {
      if ((e as { name?: string })?.name === "AbortError") return; // dialog closed; not an error
      toast(errText(e));
      setStage("picker");
    } finally {
      clearInterval(paced);
      setBusy(false);
      setPendingFile(null);
    }
  }

  /* ── review ─────────────────────────────────────────────────────────────────────── */

  /** Save a decision, then re-read both halves so the grid reflects it immediately. */
  async function saveResolution(body: Parameters<typeof applyResolutions>[1]) {
    if (!review) return;
    setBusy(true);
    try {
      const view = await applyResolutions(review.templateId, body);
      setReview(view);
      // The sheet's annotations come from the spec this just changed, so it must be re-read —
      // otherwise a corrected cell keeps showing the old field until the dialog is reopened.
      setSheet(await getTemplateSheet(review.templateId).catch(() => null));
    } catch (e) {
      toast(errText(e));
    } finally {
      setBusy(false);
    }
  }

  const resolve = (cell: string, resolution: UnfilledResolution) =>
    saveResolution({ theirsUnfilled: { [cell]: resolution } });

  const correctMapped = (cell: string, change: MappedCorrection) =>
    saveResolution({ mapped: { [cell]: change } });

  const dropField = (field: string) => saveResolution({ oursNoHome: { [field]: { kind: "drop" } } });

  /**
   * Finish the review, then export.
   *
   * A template only becomes `ready` when resolutions are saved, so exporting straight from the
   * review screen would leave it stuck at `needs_review` and fall back to the built-in export.
   * That bit hardest in the BEST case: a mapping with no differences at all gives the user
   * nothing to resolve, so nothing would ever mark it ready. Saving first — even with no
   * changes — is the explicit "I have reviewed this".
   */
  async function confirmReviewThenExport(templateId: string) {
    setBusy(true);
    try {
      await applyResolutions(templateId, {});
    } catch (e) {
      toast(errText(e));
      setBusy(false);
      return;
    }
    setBusy(false);
    await runExport(templateId);
  }

  /* ── export ─────────────────────────────────────────────────────────────────────── */

  async function runExport(templateId: string) {
    const payload = buildPayload();
    if (!payload) {
      toast(L("Nothing to export yet.", "لا شيء للتصدير بعد."));
      return;
    }
    setBusy(true);
    try {
      const res = await exportWithTemplate(templateId, { ...payload, promptValues });
      setResult(res);
      setStage("preflight");
    } catch (e) {
      if (e instanceof TemplateNotReadyError) {
        // Never leave someone unable to export because a template failed to map.
        toast(L("That template isn't ready — using the standard export.", "القالب غير جاهز — سيتم استخدام التصدير القياسي."));
        onBuiltinExport();
        onClose();
        return;
      }
      toast(errText(e));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!result) return;
    try {
      await downloadExport(result.downloadUrl, result.fileName);
      onClose();
    } catch (e) {
      toast(errText(e));
    }
  }

  /* ── chrome ─────────────────────────────────────────────────────────────────────── */

  const title =
    stage === "review" ? L("Check the mapping", "راجع التخصيص")
      : stage === "preflight" ? L("Before you download", "قبل التنزيل")
      : stage === "naming" ? L("Name this template", "سمِّ هذا القالب")
      : L("Export comparison", "تصدير المقارنة");

  return (
    <div
      dir={ar ? "rtl" : "ltr"}
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      onClick={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      {/* The review shows the user's whole spreadsheet, so it gets the screen. At 620px their
          template was a letterbox they had to scroll in two directions to read, which is the
          opposite of the point — the grid only helps if you can take it in at a glance. */}
      <div
        className={`max-h-[92vh] w-full overflow-auto rounded-2xl bg-white p-5 shadow-xl ${
          stage === "review" ? "max-w-[1400px]" : "max-w-[620px]"
        }`}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[16px] font-extrabold" style={{ color: C.navy }}>{title}</h2>
          <button onClick={onClose} disabled={busy} className="grid h-8 w-8 place-items-center rounded-full disabled:opacity-40" style={{ color: C.muted }}>
            <span className="material-icons-outlined" style={{ fontSize: 20 }}>close</span>
          </button>
        </div>

        {stage === "picker" && (
          <PickerStage
            L={L} ar={ar} rows={rows} scope={scope} busy={busy}
            onUseBuiltin={() => { onBuiltinExport(); onClose(); }}
            onExport={runExport}
            onReview={async (id) => { setBusy(true); try { await loadReview(id); setStage("review"); } finally { setBusy(false); } }}
            onDelete={async (id) => { setBusy(true); try { await deleteTemplate(id); await refresh(); } catch (e) { toast(errText(e)); } finally { setBusy(false); } }}
            onPickFile={() => fileInput.current?.click()}
          />
        )}

        {stage === "naming" && (
          <div>
            <p className="mb-3 text-[13px]" style={{ color: C.muted }}>
              {L("You'll pick this by name next time you export.", "ستختاره بالاسم في المرة القادمة.")}
            </p>
            <input
              autoFocus value={nameDraft} onChange={(e) => setNameDraft(e.target.value)}
              placeholder={L("e.g. Procurement comparison v2", "مثال: مقارنة المشتريات v2")}
              className="w-full rounded-[10px] border px-3 py-2 text-[14px]"
              style={{ borderColor: C.border, color: C.navy }}
            />
            <div className="mt-4 flex justify-end gap-2">
              <GhostBtn onClick={() => setStage("picker")}>{L("Back", "رجوع")}</GhostBtn>
              <PrimaryBtn onClick={confirmUpload} disabled={!nameDraft.trim()}>{L("Continue", "متابعة")}</PrimaryBtn>
            </div>
          </div>
        )}

        {stage === "mapping" && <MappingProgress L={L} step={mapStep} />}

        {stage === "review" && review && (
          <ReviewStage
            L={L} view={review} sheet={sheet} busy={busy}
            onResolve={resolve} onDrop={dropField} onCorrectMapped={correctMapped}
            onDone={() => confirmReviewThenExport(review.templateId)}
          />
        )}

        {stage === "preflight" && result && (
          <PreflightStage
            L={L} result={result} promptValues={promptValues} setPromptValues={setPromptValues}
            onBack={() => setStage("picker")} onDownload={save}
          />
        )}

        <input
          ref={fileInput} type="file" accept=".xlsx,.csv" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) pickFile(f); e.currentTarget.value = ""; }}
        />
      </div>
    </div>
  );
}

/* ────────────────────────────────────── stages ──────────────────────────────────────── */


/** How many stages the mapping walks through. Kept beside the component that lists them. */
const MAPPING_STAGES = 4;

/**
 * What the agent is doing, while it does it.
 *
 * Mapping a real template takes 20-60s, and an undifferentiated spinner for that long reads as
 * a hang — which is how the duplicate-name conflicts started, with people refreshing something
 * that was working. Same shape as the RFQ processing screen, so the two agents feel like one
 * product rather than two.
 *
 * The stages are PACED, not measured: the agent returns one answer at the end and reports no
 * sub-progress. They are truthful about the ORDER of the work, and the last one keeps spinning
 * rather than completing — a bar that fills and then sits there is worse than one that admits
 * it is still going.
 */
function MappingProgress({ L, step }: { L: LFn; step: number }) {
  const stages = [
    L("Reading your spreadsheet", "قراءة جدولك"),
    L("Understanding what each column means", "فهم معنى كل عمود"),
    L("Matching it to Moedatech's figures", "مطابقته بأرقام معدّاتك"),
    L("Checking what it could not place", "مراجعة ما لم يستطع تحديده"),
  ];
  const pct = Math.round(((step + 1) / stages.length) * 100);

  return (
    <div className="mx-auto max-w-[440px] py-6 text-center">
      <div
        className="relative mx-auto mb-5 grid h-[76px] w-[76px] place-items-center rounded-full border bg-white"
        style={{ borderColor: C.border }}
      >
        <span
          className="absolute -inset-px rounded-full border-[3px] border-transparent motion-safe:animate-spin"
          style={{ borderTopColor: C.action, borderRightColor: C.action }}
        />
        <span className="text-[30px]">🤖</span>
      </div>

      <h3 className="text-[17px] font-extrabold" style={{ color: C.navy }}>
        {L("Reading your template", "جارٍ قراءة قالبك")}
      </h3>
      <p className="mb-5 mt-1 text-[13px]" style={{ color: C.muted }}>
        {L(
          "This happens once. Every export after it is instant.",
          "يحدث هذا مرة واحدة. كل تصدير بعده فوري."
        )}
      </p>

      <div className="mx-auto mb-5 flex max-w-[320px] flex-col gap-3 text-start">
        {stages.map((label, i) => {
          const state = i < step ? "done" : i === step ? "active" : "todo";
          return (
            <div
              key={label}
              className="flex items-center gap-2.5 text-[13px] font-semibold"
              style={{ color: state === "todo" ? C.disabled : state === "active" ? C.navy : C.navyMid }}
            >
              <span
                className="grid h-[20px] w-[20px] flex-none place-items-center rounded-full text-[10px] font-extrabold"
                style={
                  state === "done"
                    ? { background: C.success, color: "#FFFFFF" }
                    : state === "active"
                      ? { border: `2px solid ${C.action}`, borderTopColor: "transparent" }
                      : { border: `2px solid ${C.border}` }
                }
              >
                {state === "done" ? "✓" : ""}
              </span>
              <span className={state === "active" ? "motion-safe:animate-pulse" : ""}>{label}</span>
            </div>
          );
        })}
      </div>

      <div className="mx-auto h-1.5 max-w-[320px] overflow-hidden rounded-full" style={{ background: C.surface2 }}>
        <div
          className="h-full rounded-full transition-[width] duration-700"
          style={{ width: `${pct}%`, background: C.action }}
        />
      </div>
    </div>
  );
}

function PickerStage(p: {
  L: LFn; ar: boolean; rows: ExportTemplateSummaryRow[] | null; scope: "company" | "personal"; busy: boolean;
  onUseBuiltin: () => void; onExport: (id: string) => void; onReview: (id: string) => void;
  onDelete: (id: string) => void; onPickFile: () => void;
}) {
  const { L, rows, scope, busy } = p;
  const [confirmId, setConfirmId] = useState<string | null>(null);
  return (
    <div>
      <button
        onClick={p.onUseBuiltin} disabled={busy}
        className="flex w-full items-center gap-3 rounded-[12px] border p-3 text-start disabled:opacity-50"
        style={{ borderColor: C.border }}
      >
        <span className="material-icons-outlined" style={{ color: C.navyMid }}>description</span>
        <span className="flex-1">
          <span className="block text-[13.5px] font-bold" style={{ color: C.navy }}>{L("Moedatech standard", "نموذج معداتك")}</span>
          <span className="block text-[12px]" style={{ color: C.muted }}>{L("Our layout, as a printable PDF", "تنسيقنا، بصيغة PDF")}</span>
        </span>
      </button>

      <div className="mb-2 mt-4 flex items-center justify-between">
        <span className="text-[12px] font-bold uppercase tracking-wide" style={{ color: C.muted }}>
          {scope === "company" ? L("Your company's templates", "قوالب شركتك") : L("Your templates", "قوالبك")}
        </span>
      </div>

      {rows === null && <p className="py-3 text-[13px]" style={{ color: C.muted }}>{L("Loading…", "جارٍ التحميل…")}</p>}
      {rows?.length === 0 && (
        <p className="py-3 text-[13px]" style={{ color: C.muted }}>
          {L("No templates yet. Upload your company's comparison sheet and export into it.", "لا توجد قوالب بعد. ارفع ورقة المقارنة الخاصة بشركتك.")}
        </p>
      )}

      <div className="flex flex-col gap-2">
        {(rows ?? []).map((r) => {
          const ready = r.status === "ready";
          const failed = r.status === "failed";
          return (
            <div key={r.id} className="flex items-center gap-2 rounded-[12px] border p-3" style={{ borderColor: C.border, opacity: failed ? 0.7 : 1 }}>
              <span className="material-icons-outlined" style={{ color: failed ? C.danger : C.success }}>
                {failed ? "error_outline" : "table_view"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-bold" style={{ color: C.navy }}>{r.name}</span>
                <span className="block text-[12px]" style={{ color: failed ? C.danger : C.muted }}>
                  {failed ? L("Couldn't read this template's layout", "تعذّر قراءة تنسيق القالب")
                    : r.status === "needs_review" ? L("Needs a quick check", "يحتاج مراجعة سريعة")
                    : L("Ready", "جاهز")}
                </span>
              </span>
              {r.status === "needs_review" && (
                <GhostBtn onClick={() => p.onReview(r.id)} disabled={busy}>{L("Review", "مراجعة")}</GhostBtn>
              )}
              {/* A saved template stays editable: reopening the review screen lets the user
                  change what a cell maps to, or fix a constant they typed, with no AI involved
                  — it is just the stored mapping. Without this the first answers were permanent. */}
              {ready && (
                <GhostBtn onClick={() => p.onReview(r.id)} disabled={busy}>{L("Edit", "تعديل")}</GhostBtn>
              )}
              {ready && <PrimaryBtn onClick={() => p.onExport(r.id)} disabled={busy}>{L("Export", "تصدير")}</PrimaryBtn>}
              <button
                onClick={() => setConfirmId(r.id)}
                disabled={busy}
                title={L("Delete", "حذف")}
                className="grid h-8 w-8 place-items-center rounded-full disabled:opacity-40"
                style={{ color: C.muted }}
              >
                <span className="material-icons-outlined" style={{ fontSize: 18 }}>delete_outline</span>
              </button>
            </div>
          );
        })}
      </div>

      {/* Deleting is confirmed because a template is a COMPANY asset, not a personal one — a
          colleague set it up and others may export with it daily. The wording says whose it is
          rather than asking a generic "are you sure". */}
      {confirmId && (
        <div className="mt-2 rounded-[12px] border p-3" style={{ borderColor: C.danger, background: C.dangerBg }}>
          <p className="text-[13px] font-bold" style={{ color: C.danger }}>
            {scope === "company"
              ? L("Delete this template for the whole company?", "حذف هذا القالب لكامل الشركة؟")
              : L("Delete this template?", "حذف هذا القالب؟")}
          </p>
          <p className="mt-0.5 text-[12px]" style={{ color: C.navyMid }}>
            {scope === "company"
              ? L(
                  "Everyone in your company loses it, along with the answers given when it was set up. Uploading it again means reviewing the mapping from scratch.",
                  "سيفقده كل من في شركتك، مع الإجابات التي أُدخلت عند إعداده. إعادة رفعه تعني مراجعة التخصيص من جديد."
                )
              : L(
                  "The answers given when it was set up are lost too. Uploading it again means reviewing the mapping from scratch.",
                  "ستفقد أيضاً الإجابات التي أُدخلت عند إعداده. إعادة رفعه تعني مراجعة التخصيص من جديد."
                )}
          </p>
          <div className="mt-2.5 flex justify-end gap-2">
            <GhostBtn onClick={() => setConfirmId(null)} disabled={busy}>{L("Cancel", "إلغاء")}</GhostBtn>
            <button
              onClick={() => { const id = confirmId; setConfirmId(null); p.onDelete(id); }}
              disabled={busy}
              className="rounded-[10px] px-3.5 py-[9px] text-[12.5px] font-extrabold text-white disabled:opacity-40"
              style={{ background: C.danger }}
            >
              {L("Delete", "حذف")}
            </button>
          </div>
        </div>
      )}

      <button
        onClick={p.onPickFile} disabled={busy}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-[12px] border border-dashed p-3 text-[13px] font-bold disabled:opacity-50"
        style={{ borderColor: C.border, color: C.navyMid }}
      >
        <span className="material-icons-outlined" style={{ fontSize: 18 }}>upload_file</span>
        {L("Upload a template (.xlsx or .csv)", "ارفع قالباً (.xlsx أو .csv)")}
      </button>
    </div>
  );
}

function ReviewStage(p: {
  L: LFn; view: ReconciliationView; sheet: SheetView | null; busy: boolean;
  onResolve: (cell: string, r: UnfilledResolution) => void;
  onDrop: (field: string) => void;
  onCorrectMapped: (cell: string, change: MappedCorrection) => void;
  onDone: () => void;
}) {
  const { L, view, sheet, busy } = p;
  const [constants, setConstants] = useState<Record<string, string>>({});
  /* Show ANSWERED rows too, not just open ones. Filtering them out meant a fully-resolved
   * template opened for editing showed "Everything lines up" with nothing to change — the
   * user could see their answers had been saved but never revise one. */
  const rows = view.theirsUnfilled;
  const openCount = rows.filter((u) => !u.resolved).length;
  /* ALL of them, answered or not. "Answered" here means the user chose to drop the field —
     it still will not appear in the export, so hiding it once decided turns the closing
     warning into a list that empties itself as you read it. */
  const homeless = view.oursNoHome;

  return (
    <div>
      <p className="mb-3 text-[13px]" style={{ color: C.muted }}>
        {view.status === "ready"
          ? L(
              "Your saved answers. Change any of them — this does not re-read the template.",
              "إجاباتك المحفوظة. يمكنك تغيير أي منها — لن تتم إعادة قراءة القالب."
            )
          : L(
              "We matched what we could. These are the differences — you only answer them once.",
              "طابقنا ما أمكن. هذه هي الفروقات — تجيب عنها مرة واحدة فقط."
            )}
      </p>

      {/* The template predates a change on our side. Said plainly, because the alternative is
          the user discovering blank cells in a document they already sent to finance. */}
      {(view.staleFields?.length ?? 0) > 0 && (
        <div className="mb-3 rounded-[12px] p-3 text-[12.5px]" style={{ background: C.warningBg, color: C.warning }}>
          ⚠ {L(
            `This template refers to ${view.staleFields!.length} field(s) we no longer have, so those cells will export blank. Upload the template again to refresh it.`,
            `يشير هذا القالب إلى ${view.staleFields!.length} حقل لم يعد متوفراً، لذا ستُصدَّر تلك الخلايا فارغة. أعد رفع القالب لتحديثه.`
          )}
        </div>
      )}

      {/* The review, drawn on THEIR sheet. Reading "DESCRIPTION B3" off a list means holding
          two things in your head — what we're asking, and where B3 is in a file you can't see.
          The card list below is kept only for when the sheet can't be drawn. */}
      {sheet ? (
        <TemplateSheetGrid
          L={L}
          view={sheet}
          busy={busy}
          homeless={homeless}
          /* Exactly the fields not currently placed anywhere — which is what "put something
             else here" can legitimately offer, so no catalogue copy is needed client-side. */
          vocabulary={view.oursNoHome.map((n) => ({ key: n.field, label: n.label }))}
          onResolveUnfilled={p.onResolve}
          onCorrectMapped={p.onCorrectMapped}
          onDropHomeless={p.onDrop}
        />
      ) : (
        <>
          {rows.length === 0 && homeless.length === 0 && (
            <div className="rounded-[12px] p-3 text-[13px]" style={{ background: C.successBg, color: C.navy }}>
              {L("Everything lines up — nothing to answer.", "كل شيء متطابق — لا شيء للإجابة عليه.")}
            </div>
          )}

          {rows.map((u) => (
        <div
          key={u.cell}
          className="mb-2 rounded-[12px] border p-3"
          style={{ borderColor: u.resolved ? C.successBg : C.border }}
        >
          <div className="flex items-baseline gap-2">
            <span className="text-[13.5px] font-bold" style={{ color: C.navy }}>{u.theirLabel}</span>
            <span className="text-[11px]" style={{ color: C.disabled }}>{u.cell}</span>
            {u.resolved && (
              <span className="text-[11px] font-bold" style={{ color: C.success }}>
                ✓ {L("answered", "تمت الإجابة")}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[12px]" style={{ color: C.muted }}>{u.why}</p>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {/* The common case: a naming mismatch the mapper already spotted. One click and
                this cell fills on every future export. */}
            {u.candidate && (
              <PrimaryBtn disabled={busy} onClick={() => p.onResolve(u.cell, { kind: "acceptCandidate", derivations: u.candidateDerivations ?? ["identity"] })}>
                {L(`Use "${u.candidateLabel}"`, `استخدم "${u.candidateLabel}"`)}
              </PrimaryBtn>
            )}
            <GhostBtn disabled={busy} onClick={() => p.onResolve(u.cell, { kind: "notStated" })}>{L("Not stated", "غير مذكور")}</GhostBtn>
            <GhostBtn disabled={busy} onClick={() => p.onResolve(u.cell, { kind: "byHand" })}>{L("I'll fill it", "سأعبئها")}</GhostBtn>
            <GhostBtn disabled={busy} onClick={() => p.onResolve(u.cell, { kind: "promptAtExport", label: u.theirLabel })}>
              {L("Ask me each time", "اسألني كل مرة")}
            </GhostBtn>
          </div>

          <div className="mt-2 flex items-center gap-2">
            <input
              value={constants[u.cell] ?? ""} onChange={(e) => setConstants((s) => ({ ...s, [u.cell]: e.target.value }))}
              placeholder={L("or type a fixed value", "أو اكتب قيمة ثابتة")}
              className="flex-1 rounded-[10px] border px-2.5 py-1.5 text-[12.5px]"
              style={{ borderColor: C.border, color: C.navy }}
            />
            <GhostBtn
              disabled={busy || !(constants[u.cell] ?? "").trim()}
              onClick={() => p.onResolve(u.cell, { kind: "constant", value: (constants[u.cell] ?? "").trim() })}
            >
              {L("Save", "حفظ")}
            </GhostBtn>
          </div>
        </div>
      ))}

          {homeless.length > 0 && (
            <div className="mt-3">
              <p className="mb-1 text-[12px] font-bold uppercase tracking-wide" style={{ color: C.muted }}>
                {L("No place in your template", "لا مكان لها في قالبك")}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {homeless.map((n) => (
                  <button
                    key={n.field} disabled={busy} onClick={() => p.onDrop(n.field)}
                    className="rounded-full border px-2.5 py-1 text-[12px] disabled:opacity-50"
                    style={{ borderColor: C.border, color: C.navyMid }}
                    title={L("Leave it out", "استبعدها")}
                  >
                    {n.label} ×
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <div className="mt-4 flex items-center justify-between">
        <span className="text-[12px]" style={{ color: C.muted }}>
          {openCount > 0
            ? L(`${openCount} left — you can export anyway`, `${openCount} متبقية — يمكنك التصدير الآن`)
            : L("All set", "جاهز")}
        </span>
        <PrimaryBtn onClick={p.onDone} disabled={busy}>{L("Export", "تصدير")}</PrimaryBtn>
      </div>
    </div>
  );
}

function PreflightStage(p: {
  L: LFn; result: ExportResult;
  promptValues: Record<string, string>;
  setPromptValues: (v: Record<string, string>) => void;
  onBack: () => void; onDownload: () => void;
}) {
  const { L, result } = p;
  const s = result.summary;
  const missingPrompts = useMemo(() => s.blankCells.filter((b) => b.reason === "missingPromptValue"), [s.blankCells]);
  const blanks = s.blankCells.filter((b) => b.reason !== "missingPromptValue");

  return (
    <div>
      <p className="text-[13.5px] font-bold" style={{ color: C.navy }}>{result.fileName}</p>
      <p className="mt-0.5 text-[12.5px]" style={{ color: C.muted }}>
        {s.supplierColumns} {L("supplier columns", "أعمدة موردين")}
        {s.insertedColumns > 0 && ` (${s.insertedColumns} ${L("added", "مضافة")})`} · {s.filledCells} {L("cells filled", "خلية معبأة")}
      </p>

      {/* Counting a missing part as zero is the product decision; saying so is what keeps it
          safe. A total that quietly understates itself by an unstated mobilization cost, in a
          document going to finance for sign-off, is the most expensive thing this can get
          wrong â so it is named, with how many suppliers it affected. */}
      {(s.assumedZero?.length ?? 0) > 0 && (
        <Warn>
          {L(
            `Counted as 0 where the supplier didn't state it: ${s
              .assumedZero!.map((z) => `${z.label} (${z.count})`)
              .join(", ")}`,
            `Ø­ÙØ³Ø¨Øª ØµÙØ±Ø§Ù Ø­ÙØ« ÙÙ ÙØ°ÙØ±ÙØ§ Ø§ÙÙÙØ±ÙØ¯: ${s
              .assumedZero!.map((z) => `${z.label} (${z.count})`)
              .join("Ø ")}`
          )}
        </Warn>
      )}

      {s.omittedSuppliers.length > 0 && (
        <Warn>{L(`Left out: ${s.omittedSuppliers.join(", ")}`, `مستبعدون: ${s.omittedSuppliers.join("، ")}`)}</Warn>
      )}

      {missingPrompts.length > 0 && (
        <div className="mt-3">
          {missingPrompts.map((b) => (
            <div key={b.cell} className="mb-2 flex items-center gap-2">
              <span className="w-40 shrink-0 text-[12.5px]" style={{ color: C.navy }}>{b.label}</span>
              <input
                value={p.promptValues[b.cell] ?? ""}
                onChange={(e) => p.setPromptValues({ ...p.promptValues, [b.cell]: e.target.value })}
                className="flex-1 rounded-[10px] border px-2.5 py-1.5 text-[12.5px]"
                style={{ borderColor: C.border, color: C.navy }}
              />
            </div>
          ))}
          <p className="text-[11.5px]" style={{ color: C.muted }}>
            {L("Fill these, then export again to include them.", "املأ هذه ثم صدّر مجدداً لتضمينها.")}
          </p>
        </div>
      )}

      {blanks.length > 0 && (
        <Warn>
          {L("Left blank: ", "فارغة: ")}
          {blanks.map((b) => b.label).join(", ")}
        </Warn>
      )}

      {s.droppedFields.length > 0 && (
        <Warn>
          {L("No home in your template: ", "لا مكان لها في قالبك: ")}
          {s.droppedFields.map((d) => d.label).join(", ")}
        </Warn>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <GhostBtn onClick={p.onBack}>{L("Back", "رجوع")}</GhostBtn>
        <PrimaryBtn onClick={p.onDownload}>{L("Download", "تنزيل")}</PrimaryBtn>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────── bits ───────────────────────────────────────── */

function Warn({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-2 rounded-[10px] px-3 py-2 text-[12.5px]" style={{ background: C.warningBg, color: C.warning }}>
      ⚠ {children}
    </div>
  );
}

function PrimaryBtn(p: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={p.onClick} disabled={p.disabled}
      className="rounded-[10px] px-3.5 py-[9px] text-[12.5px] font-extrabold text-white disabled:opacity-40"
      style={{ background: C.action }}
    >
      {p.children}
    </button>
  );
}

function GhostBtn(p: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={p.onClick} disabled={p.disabled}
      className="rounded-[10px] border px-3 py-[8px] text-[12.5px] font-bold disabled:opacity-40"
      style={{ borderColor: C.border, color: C.navyMid, background: "#fff" }}
    >
      {p.children}
    </button>
  );
}
