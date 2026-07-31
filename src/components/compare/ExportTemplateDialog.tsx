"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  TemplateNotReadyError,
  applyResolutions,
  deleteTemplate,
  downloadExport,
  exportWithTemplate,
  getTemplate,
  listTemplates,
  uploadTemplate,
} from "@/lib/api/export-templates";
import type {
  ExportPayload,
  ExportResult,
  ExportTemplateSummaryRow,
  ReconciliationView,
  UnfilledResolution,
} from "@/lib/contract/export-templates";

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
  const [result, setResult] = useState<ExportResult | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [promptValues, setPromptValues] = useState<Record<string, string>>({});
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await listTemplates();
      setRows(list.templates);
      setScope(list.scope);
    } catch {
      setRows([]); // never block the dialog — the built-in export is always offered
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setStage("picker");
    setResult(null);
    setReview(null);
    void refresh();
  }, [open, refresh]);

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
    try {
      const created = await uploadTemplate(pendingFile, nameDraft.trim());
      await refresh();
      if (created.status === "failed") {
        // Keep the row so the user can see why, but send them back rather than into an
        // empty review screen.
        toast(created.mappingError
          ? L("We couldn't read that template's layout.", "تعذّر قراءة تنسيق هذا القالب.")
          : L("Mapping failed.", "فشل التخصيص."));
        setStage("picker");
        return;
      }
      setReview(await getTemplate(created.id));
      setStage("review");
    } catch (e) {
      toast(errText(e));
      setStage("picker");
    } finally {
      setBusy(false);
      setPendingFile(null);
    }
  }

  /* ── review ─────────────────────────────────────────────────────────────────────── */

  async function resolve(cell: string, resolution: UnfilledResolution) {
    if (!review) return;
    setBusy(true);
    try {
      setReview(await applyResolutions(review.templateId, { theirsUnfilled: { [cell]: resolution } }));
    } catch (e) {
      toast(errText(e));
    } finally {
      setBusy(false);
    }
  }

  async function dropField(field: string) {
    if (!review) return;
    setBusy(true);
    try {
      setReview(await applyResolutions(review.templateId, { oursNoHome: { [field]: { kind: "drop" } } }));
    } catch (e) {
      toast(errText(e));
    } finally {
      setBusy(false);
    }
  }

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
      <div className="max-h-[86vh] w-full max-w-[620px] overflow-auto rounded-2xl bg-white p-5 shadow-xl">
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
            onReview={async (id) => { setBusy(true); try { setReview(await getTemplate(id)); setStage("review"); } finally { setBusy(false); } }}
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

        {stage === "mapping" && (
          <div className="py-10 text-center">
            <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: C.action, borderTopColor: "transparent" }} />
            <p className="text-[14px] font-bold" style={{ color: C.navy }}>{L("Reading your template…", "جارٍ قراءة القالب…")}</p>
            <p className="mt-1 text-[12.5px]" style={{ color: C.muted }}>
              {L("Working out where each figure belongs. This happens once.", "نحدد مكان كل رقم. يحدث هذا مرة واحدة فقط.")}
            </p>
          </div>
        )}

        {stage === "review" && review && (
          <ReviewStage
            L={L} view={review} busy={busy}
            onResolve={resolve} onDrop={dropField}
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
  L: LFn; view: ReconciliationView; busy: boolean;
  onResolve: (cell: string, r: UnfilledResolution) => void;
  onDrop: (field: string) => void;
  onDone: () => void;
}) {
  const { L, view, busy } = p;
  const [constants, setConstants] = useState<Record<string, string>>({});
  /* Show ANSWERED rows too, not just open ones. Filtering them out meant a fully-resolved
   * template opened for editing showed "Everything lines up" with nothing to change — the
   * user could see their answers had been saved but never revise one. */
  const rows = view.theirsUnfilled;
  const openCount = rows.filter((u) => !u.resolved).length;
  const homeless = view.oursNoHome.filter((n) => !n.resolved);

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
