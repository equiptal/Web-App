/**
 * Company-documents pile upload — presign → PUT each file → complete.
 *
 * The web half of the flow the mobile app ships (`company_docs_submission_bloc.dart`): the renter
 * sends ONE unlabeled batch of company papers into RelayPanel's ingest lane, and an operator (plus
 * the company classifier) works out what each file is. Nothing here labels a document, because the
 * browser cannot know.
 *
 * ⚠️ **Not `uploadBidFiles`.** That helper (`client.ts`) is `Promise.all` + throw: one failed PUT
 * rejects the batch and every successful upload is lost, because it keeps no session. A pile of up
 * to ten documents on a domestic uplink partially fails often enough that the retry has to be cheap,
 * so this helper hands the session back and re-PUTs only what failed.
 *
 * The two steps of the submission are deliberately separate: identity (`/api/verification/submit`)
 * opens the verification, then the pile goes out. See `VerificationFlow`.
 */

/** Max documents in one pile — the app's cap (`kMaxCompanyDocFiles`). The backend allows 60. */
export const COMPANY_PILE_MAX_FILES = 10;

/** What the presign proxy accepts: image/jpeg|png|webp + pdf. */
export const COMPANY_PILE_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;

/** Bytes per file the ingest lane accepts — Relay's `mode:"put"` ceiling. */
export const COMPANY_PILE_MAX_BYTES = 100 * 1024 * 1024;

/** How many PUTs run at once. Five saturates a domestic uplink without starving the page. */
const MAX_CONCURRENT_PUTS = 5;

/** One presigned PUT target, one per declared file, in the order they were declared. */
export interface PileUploadTarget {
  fileName: string;
  key: string;
  url: string;
}

/**
 * A presign session, kept across a partial failure so a retry re-PUTs only the files that failed
 * rather than the whole pile. Presigned URLs are valid for roughly fifteen minutes.
 */
export interface PileSession {
  submissionId: string;
  uploads: PileUploadTarget[];
  /** `name:size` per file, in order — what this session was presigned FOR. */
  signature: string[];
  /** Indexes into the file list whose PUT has already succeeded. */
  uploadedIndexes: Set<number>;
}

export interface PileResult {
  /** True only when every file uploaded AND the submission was completed. */
  ok: boolean;
  session: PileSession;
  /** Indexes whose PUT failed on this attempt — highlighted for retry. */
  failedIndexes: Set<number>;
}

/** Thrown reasons, so the screen can pick its own copy. */
export type PileFileReject = "unsupported_type" | "too_large" | "empty";

/** `name:size` — a browser has no path, and name alone would miss a swapped file. */
const signatureOf = (files: File[]): string[] => files.map((f) => `${f.name}:${f.size}`);

const sameSignature = (a: string[], b: string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

/** Why this file cannot be sent, or null. Checked before spending a round trip. */
export function validateCompanyPileFile(file: File): PileFileReject | null {
  if (!(COMPANY_PILE_TYPES as readonly string[]).includes(file.type)) return "unsupported_type";
  if (file.size <= 0) return "empty";
  if (file.size > COMPANY_PILE_MAX_BYTES) return "too_large";
  return null;
}

async function presign(files: File[]): Promise<{ submissionId: string; uploads: PileUploadTarget[] }> {
  const res = await fetch("/api/verification/pile/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      files: files.map((f) => ({ name: f.name, type: f.type, size: f.size })),
    }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { code?: string };
    throw new Error(body.code === "offline" ? "offline" : "presign_failed");
  }
  const data = (await res.json()) as { submissionId?: string; uploads?: PileUploadTarget[] };
  if (!data.submissionId || !Array.isArray(data.uploads)) throw new Error("presign_failed");
  return { submissionId: data.submissionId, uploads: data.uploads };
}

async function complete(submissionId: string, uploads: PileUploadTarget[]): Promise<void> {
  const res = await fetch(`/api/verification/pile/${encodeURIComponent(submissionId)}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ files: uploads.map((u) => ({ key: u.key, name: u.fileName })) }),
  });
  // 409 = already received. A dropped response on a completed submission re-completes, and treating
  // that as an error would turn a delivered pile into a permanent failure on screen. The app makes
  // the same allowance (`supplier_store_repository_impl.dart`).
  if (res.ok || res.status === 409) return;
  throw new Error("complete_failed");
}

/**
 * Send a pile. Pass the previous `session` on a retry: an unchanged file list reuses its presign and
 * re-PUTs only the files that failed, so the renter pays for their own dropped connection once.
 *
 * Throws (rather than returning `ok: false`) only when nothing could be attempted at all: a file the
 * lane will not take, or a presign that failed. A failed PUT is reported through `failedIndexes`,
 * because the session behind it is still worth keeping.
 */
export async function uploadCompanyPile(files: File[], prior?: PileSession): Promise<PileResult> {
  if (!files.length) throw new Error("no_files");
  if (files.length > COMPANY_PILE_MAX_FILES) throw new Error("too_many_files");
  for (const f of files) {
    const bad = validateCompanyPileFile(f);
    if (bad) throw new Error(bad);
  }

  const signature = signatureOf(files);
  const canReuse =
    prior !== undefined &&
    sameSignature(prior.signature, signature) &&
    prior.uploads.length === files.length;

  const session: PileSession = canReuse
    ? { ...prior, uploadedIndexes: new Set(prior.uploadedIndexes) }
    : { ...(await presign(files)), signature, uploadedIndexes: new Set<number>() };

  if (session.uploads.length !== files.length) throw new Error("presign_count_mismatch");

  const pending = files.map((_, i) => i).filter((i) => !session.uploadedIndexes.has(i));
  const failedIndexes = new Set<number>();

  if (pending.length) {
    let next = 0;
    const worker = async () => {
      for (;;) {
        const k = next++;
        if (k >= pending.length) return;
        const idx = pending[k];
        try {
          const put = await fetch(session.uploads[idx].url, {
            method: "PUT",
            headers: { "Content-Type": files[idx].type },
            body: files[idx],
          });
          if (!put.ok) throw new Error("put_failed");
          session.uploadedIndexes.add(idx);
        } catch {
          failedIndexes.add(idx);
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(MAX_CONCURRENT_PUTS, pending.length) }, () => worker()),
    );
  }

  // Keep the session so the next attempt only re-PUTs the failures.
  if (session.uploadedIndexes.size < files.length) return { ok: false, session, failedIndexes };

  await complete(session.submissionId, session.uploads);
  return { ok: true, session, failedIndexes };
}
