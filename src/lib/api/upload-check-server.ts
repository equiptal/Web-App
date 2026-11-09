import { NextResponse } from "next/server";
import { AppAuthError, appAuthErrorResponse } from "@/lib/api/app-backend-authed";
import type { UploadCheckFileInfo, UploadCheckRefusal } from "@/lib/upload-check/types";

/**
 * SERVER-ONLY helpers for the upload check proxy (`/api/upload-check/*`, company doc check CC-12,
 * Moedatech `docs/plans/ai-upload-check/contract-v4.md` §1, §7).
 *
 * ⚠️ **The flow is pinned here, never read from the browser.** This app checks one thing, the
 * company papers, and `flow` decides which gate and which switch the backend applies (C2, C3). The
 * routes after `/checks` take their flow from the STORED check on the backend, so nothing a browser
 * sends can turn a company check into an equipment one.
 *
 * ⚠️ **`X-Client-Platform: web`, not the app-wide `web-rentee`.** The backend stores
 * `client: 'web'` on a check only for that exact value (`os-client.ts` `clientOf`), so operators can
 * tell web checks apart. It overrides `CLIENT_PLATFORM_HEADER` on these calls only.
 *
 * ⚠️ **What crosses back to the browser: presigned links, ids and codes.** A backend refusal becomes
 * one of `UploadCheckRefusal`, never the backend's own prose.
 */
export const UPLOAD_CHECK_BASE = "/upload-check/v1";
export const UPLOAD_CHECK_FLOW = "company";
export const UPLOAD_CHECK_HEADERS = { "X-Client-Platform": "web" } as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

/** The backend's own bound (`UPLOAD_CHECK_MAX_FILE_ID`); a used or removed id is never given again. */
const MAX_FILE_ID = 9_999;
const MAX_FILES = 200;

export const isFileId = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= MAX_FILE_ID;

/**
 * The file list, rebuilt field by field from what the browser sent (nothing else rides along), or
 * null when it breaks the contract's shape. The backend validates it all again.
 */
export function cleanFiles(raw: unknown): UploadCheckFileInfo[] | null {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_FILES) return null;
  const out: UploadCheckFileInfo[] = [];
  for (const f of raw) {
    if (typeof f !== "object" || f === null) return null;
    const { id, name, mime, bytes, sha256, pages } = f as Record<string, unknown>;
    if (!isFileId(id)) return null;
    if (typeof mime !== "string" || !mime || mime.length > 100) return null;
    if (typeof bytes !== "number" || !Number.isInteger(bytes) || bytes < 0) return null;
    if (typeof sha256 !== "string" || !/^[0-9a-f]{64}$/i.test(sha256)) return null;
    if (typeof pages !== "number" || !Number.isInteger(pages) || pages < 1 || pages > 10_000) return null;
    out.push({ id, name: typeof name === "string" ? name.slice(0, 255) : "", mime, bytes, sha256, pages });
  }
  return out;
}

/** `[{ id, pages }]` for `/sharp`, or null when malformed. Absent = every page `needSharp` asks. */
export function cleanSharpAsk(raw: unknown): Array<{ id: number; pages: number[] }> | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > MAX_FILES) return null;
  const out: Array<{ id: number; pages: number[] }> = [];
  for (const a of raw) {
    if (typeof a !== "object" || a === null) return null;
    const { id, pages } = a as Record<string, unknown>;
    if (!isFileId(id) || !Array.isArray(pages) || pages.length < 1 || pages.length > 100) return null;
    if (!pages.every((p) => typeof p === "number" && Number.isInteger(p) && p >= 0 && p < 100)) return null;
    out.push({ id, pages: pages as number[] });
  }
  return out;
}

const BY_CODE: Record<string, UploadCheckRefusal> = {
  UPLOAD_CHECK_DISABLED: "disabled",
  UPLOAD_CHECK_DAILY_LIMIT: "daily_limit",
  UPLOAD_CHECK_BUSY: "busy",
  UPLOAD_CHECK_NOT_FOUND: "not_found",
  UPLOAD_CHECK_TOO_MANY_FILES: "too_many_files",
  UPLOAD_CHECK_BAD_INPUT: "bad_input",
};

export const refusal = (code: UploadCheckRefusal, status: number) => NextResponse.json({ code }, { status });

/**
 * A failed backend call → `{ code: <refusal> }` with the backend's status. A 401 keeps the house
 * answer (it clears the cookies); a 403 that is not the switch (a guest's tier, an E9009) is
 * `not_allowed`; anything else unknown (a timeout, a 5xx) is `unavailable`.
 */
export function refusalResponse(err: unknown): NextResponse {
  if (err instanceof AppAuthError) {
    if (err.kind === "unauthorized") return appAuthErrorResponse(err);
    const known = err.code ? BY_CODE[err.code] : undefined;
    if (known) return refusal(known, err.status);
    if (err.status === 403) return refusal("not_allowed", 403);
    return refusal("unavailable", err.status >= 400 ? err.status : 502);
  }
  console.error("[upload-check] unexpected error:", err);
  return refusal("unavailable", 502);
}

/** The JSON body of a request, or `{}` when there is none or it does not parse. */
export async function bodyOf(req: Request): Promise<Record<string, unknown>> {
  try {
    const b = (await req.json()) as unknown;
    return typeof b === "object" && b !== null && !Array.isArray(b) ? (b as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
