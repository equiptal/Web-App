/**
 * The browser side of the upload check's calls: this app's own proxy routes
 * (`/api/upload-check/*`, which pin the company flow and carry the session), plus the direct
 * S3 PUTs and progress reads on the presigned links those routes hand back.
 *
 * Every route failure comes back as a refusal code (`UploadCheckRefusal`), never thrown: the
 * session reads any of them as «no check this time» (R10).
 */
import type {
  CheckResult,
  UploadCheckConfig,
  UploadCheckFileInfo,
  UploadCheckFilesAnswer,
  UploadCheckRefusal,
  UploadCheckSharpAnswer,
  UploadCheckStartAnswer,
} from "./types";

const REFUSALS: readonly UploadCheckRefusal[] = [
  "disabled",
  "daily_limit",
  "busy",
  "not_found",
  "too_many_files",
  "bad_input",
  "not_allowed",
  "unavailable",
];

async function call<T>(path: string, init: RequestInit = {}): Promise<CheckResult<T>> {
  try {
    const res = await fetch(`/api/upload-check${path}`, {
      ...init,
      headers: init.body ? { "Content-Type": "application/json" } : undefined,
      cache: "no-store",
    });
    const body = (await res.json().catch(() => null)) as unknown;
    if (!res.ok) {
      const code = (body as { code?: string } | null)?.code;
      return { ok: false, code: REFUSALS.includes(code as UploadCheckRefusal) ? (code as UploadCheckRefusal) : "unavailable" };
    }
    return { ok: true, data: body as T };
  } catch {
    return { ok: false, code: "unavailable" };
  }
}

const post = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });
const at = (checkId: string) => `/checks/${encodeURIComponent(checkId)}`;

export const readCompanyCheckConfig = () => call<UploadCheckConfig>("/config");

export const startCompanyCheck = (files: UploadCheckFileInfo[]) =>
  call<UploadCheckStartAnswer>("/checks", post({ files }));

export const addCompanyCheckFiles = (checkId: string, files: UploadCheckFileInfo[]) =>
  call<UploadCheckFilesAnswer>(`${at(checkId)}/files`, post({ files }));

export const removeCompanyCheckFile = async (checkId: string, fileId: number): Promise<CheckResult<null>> => {
  const r = await call<unknown>(`${at(checkId)}/files/${fileId}`, { method: "DELETE" });
  return r.ok ? { ok: true, data: null } : r;
};

export const runCompanyCheck = (checkId: string) => call<{ progressUrl: string }>(`${at(checkId)}/run`, post({}));

export const askCompanyCheckSharp = (checkId: string, files: Array<{ id: number; pages: number[] }>) =>
  call<UploadCheckSharpAnswer>(`${at(checkId)}/sharp`, post({ files }));

/** A copy, straight to its presigned S3 PUT (which carries only the content type). */
export async function putCopy(url: string, body: Blob, contentType: string): Promise<void> {
  const res = await fetch(url, { method: "PUT", body, headers: { "Content-Type": contentType } });
  if (!res.ok) throw new Error(`copy PUT ${res.status}`);
}

/** The progress file, from its presigned GET; throws `{ status }` on an HTTP error. */
export async function readProgressFile(url: string): Promise<unknown> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw { status: res.status };
  return res.json();
}
