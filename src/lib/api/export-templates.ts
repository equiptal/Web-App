/**
 * Browser-side client for the custom bid-comparison export templates.
 *
 * Everything goes through this app's BFF routes (`/api/me/export-templates/…`), which attach the
 * signed-in renter's token — the browser never talks to the Moedatech backend directly.
 */

import type {
  ExportPayload,
  ExportResult,
  ExportTemplateList,
  NoHomeResolution,
  ReconciliationView,
  UnfilledResolution,
} from "@/lib/contract/export-templates";

const BASE = "/api/me/export-templates";

/** A backend rejection with both languages, so callers can show the right one. */
export class TemplateError extends Error {
  constructor(
    message: string,
    readonly messageAr: string | null,
    readonly status: number,
    readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "TemplateError";
  }
}

/**
 * Raised when the chosen template cannot render yet (still mapping, or mapping failed).
 *
 * Deliberately its own type: the caller must fall back to the built-in export rather than
 * showing an error. A template that failed to map must never leave someone unable to export.
 */
export class TemplateNotReadyError extends TemplateError {
  constructor(message: string, messageAr: string | null, readonly templateStatus: string) {
    super(message, messageAr, 400, { reason: "template_not_ready", templateStatus });
    this.name = "TemplateNotReadyError";
  }
}

async function parseError(res: Response): Promise<never> {
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    /* non-JSON error body — fall through to the status text */
  }
  const message = String(body.message ?? body.error ?? res.statusText ?? "Request failed");
  const messageAr = typeof body.messageAr === "string" ? body.messageAr : null;
  const details = (body.details ?? {}) as Record<string, unknown>;

  if (details.fallback === "builtin_export") {
    throw new TemplateNotReadyError(message, messageAr, String(details.templateStatus ?? "unknown"));
  }
  throw new TemplateError(message, messageAr, res.status, details);
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) await parseError(res);
  return (await res.json()) as T;
}

export async function listTemplates(): Promise<ExportTemplateList> {
  return json<ExportTemplateList>(await fetch(BASE, { cache: "no-store" }));
}

export async function getTemplate(id: string): Promise<ReconciliationView> {
  return json<ReconciliationView>(
    await fetch(`${BASE}/${encodeURIComponent(id)}`, { cache: "no-store" })
  );
}

export async function deleteTemplate(id: string): Promise<void> {
  const res = await fetch(`${BASE}/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) await parseError(res);
}

/**
 * Upload a template and register it. Three steps behind one call: presign → PUT to S3 →
 * register (which runs the AI mapping and can take several seconds).
 *
 * The `.xlsx` check here is a courtesy so the user finds out before the upload; the real gate
 * is server-side on register, where a renamed `.docx` or `.pdf` is caught by actually parsing.
 */
export async function uploadTemplate(
  file: File,
  name: string
): Promise<{ id: string; name: string; status: string; mappingError: string | null }> {
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    throw new TemplateError(
      "Only Excel (.xlsx) templates are supported.",
      "ندعم قوالب Excel (.xlsx) فقط.",
      400
    );
  }

  const presigned = await json<{ uploadUrl: string; s3Key: string }>(
    await fetch(`${BASE}/upload-url`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filename: file.name }),
    })
  );

  const put = await fetch(presigned.uploadUrl, {
    method: "PUT",
    body: file,
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  });
  if (!put.ok) {
    throw new TemplateError(
      "The upload didn't complete. Check your connection and try again.",
      "لم يكتمل الرفع. تحقق من الاتصال وحاول مجدداً.",
      put.status
    );
  }

  return json(
    await fetch(BASE, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, s3Key: presigned.s3Key, originalFileName: file.name }),
    })
  );
}

export async function applyResolutions(
  id: string,
  body: {
    theirsUnfilled?: Record<string, UnfilledResolution>;
    oursNoHome?: Record<string, NoHomeResolution>;
    name?: string;
  }
): Promise<ReconciliationView> {
  return json<ReconciliationView>(
    await fetch(`${BASE}/${encodeURIComponent(id)}/mapping`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

/** Render the comparison. Throws `TemplateNotReadyError` when the caller should fall back. */
export async function exportWithTemplate(id: string, payload: ExportPayload): Promise<ExportResult> {
  return json<ExportResult>(
    await fetch(`${BASE}/${encodeURIComponent(id)}/export`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    })
  );
}

/**
 * Save the rendered workbook.
 *
 * Fetched as a blob rather than navigated to: the presigned URL is cross-origin, so a plain
 * anchor would open it in a tab instead of downloading with the template's own name.
 */
export async function downloadExport(url: string, fileName: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new TemplateError(
      "The download link expired. Export again.",
      "انتهت صلاحية رابط التنزيل. صدّر مرة أخرى.",
      res.status
    );
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = fileName.toLowerCase().endsWith(".xlsx") ? fileName : `${fileName}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}
