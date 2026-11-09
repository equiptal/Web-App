/**
 * The upload check's wire shapes as this app's own routes (`/api/upload-check/*`) hand them to the
 * browser (Moedatech `docs/plans/ai-upload-check/contract-v4.md` §1, §7). Shared by the proxy
 * routes and the browser session, so the two cannot drift.
 */

/** `GET /upload-check/v1/config?flow=company`. Clients never hard-code these. */
export interface UploadCheckConfig {
  enabled: boolean;
  maxFiles: number;
  smallEdge: number;
  sharpEdge: number;
  maxPdfPages: number;
  pdfAsIsMaxBytes: number;
  pollMs: number;
  /** Files go this long after the LAST add (absent = at once). */
  startDelayMs?: number;
  budgetMs: { small: number; large: number };
}

export interface UploadCheckFileInfo {
  /** 0..n-1 on start, the next numbers on `/files`; never reused. */
  id: number;
  name: string;
  mime: string;
  bytes: number;
  /** SHA-256 of the EXACT bytes the pile upload sends (the known-files memory keys on it). */
  sha256: string;
  /** The file's real page count. */
  pages: number;
}

export interface UploadCheckUpload {
  id: number;
  page: number;
  small: string;
  pdf?: string | null;
}

export interface UploadCheckStartAnswer {
  checkId: string;
  upload: UploadCheckUpload[];
  progressUrl: string;
}

export interface UploadCheckFilesAnswer {
  upload: UploadCheckUpload[];
  progressUrl: string;
}

export interface UploadCheckSharpAnswer {
  upload: Array<{ id: number; page: number; sharp: string }>;
}

/**
 * Why there is no check this time. Every one means the same to the renter: the pile goes exactly
 * as it did before the check existed (R10). `not_found` is kept apart because it starts a NEW
 * check (an old one expired, contract §1); the others stop trying for this pile.
 */
export type UploadCheckRefusal =
  | "disabled"
  | "daily_limit"
  | "busy"
  | "not_found"
  | "too_many_files"
  | "bad_input"
  | "not_allowed"
  | "unavailable";

export type CheckResult<T> = { ok: true; data: T } | { ok: false; code: UploadCheckRefusal };
