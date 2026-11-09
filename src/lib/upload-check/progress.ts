/**
 * The upload check's progress file, as the browser reads it, for the COMPANY flow only (company
 * doc check CC-12, Moedatech `docs/plans/ai-upload-check/contract-v4.md` §2 and §7).
 *
 * Ported from the Supplier OS (`apps/web/src/lib/upload-check/progress.ts`), cut down to what the
 * company papers need: no machines, no photos. This app has no zod, so the parser is written out.
 *
 * ⚠️ **Lenient on purpose.** The server may add fields and codes. An unknown paper state reads as
 * `not_checked` (never «missing», R2), an unknown note code is dropped, and a file that does not
 * parse at all is `null` (a half-written or foreign object), never a crash.
 *
 * Pure: no DOM, no fetch, so it is tested in node (`tests/unit/upload-check-progress.test.ts`).
 */

/** The three papers the server always judges (C10), in the contract's order. */
export const REQUIRED_PAPERS = ["cr", "vat", "address"] as const;
export type RequiredPaper = (typeof REQUIRED_PAPERS)[number];

export type PaperState = "present" | "missing" | "not_checked";

/** The warning codes this client knows how to word (contract §7). Anything else is skipped. */
export const NOTE_CODES = [
  "expired",
  "unclear_number",
  "name_mismatch",
  "cr_on_platform",
  "file_seen_elsewhere",
] as const;
export type NoteCode = (typeof NOTE_CODES)[number];

export interface CheckNote {
  code: NoteCode;
  /** `null` when the note is about the pile, not one paper (`name_mismatch`). */
  paper: RequiredPaper | null;
  /** The Gregorian day, `YYYY-MM-DD`, for `expired` only. */
  date: string | null;
}

export interface CheckProgress {
  checkId: string;
  status: "running" | "done" | "failed";
  updatedAt: string;
  needSharp: Array<{ id: number; pages: number[] }>;
  /** Only the ids: the answer has to list every file sent (`isAnswer`). */
  files: Array<{ id: number }>;
  papers: Array<{ paper: RequiredPaper; state: PaperState }>;
  /**
   * Notes whose `paper` is null or one of the three required papers. A note on any other paper
   * (`local_content`, ...) is dropped here: the contract shows a note only when its paper is null
   * or one the client asked for, and this page asks for the three.
   */
  notes: CheckNote[];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

const isRequired = (v: unknown): v is RequiredPaper => (REQUIRED_PAPERS as readonly unknown[]).includes(v);
const isNoteCode = (v: unknown): v is NoteCode => (NOTE_CODES as readonly unknown[]).includes(v);

/** A progress file, or null when it does not parse. */
export function parseProgress(raw: unknown): CheckProgress | null {
  if (!isObj(raw) || typeof raw.checkId !== "string" || typeof raw.updatedAt !== "string") return null;
  const status = raw.status === "done" || raw.status === "failed" ? raw.status : "running";

  const needSharp = arr(raw.needSharp).flatMap((n) =>
    isObj(n) && isInt(n.id) ? [{ id: n.id, pages: arr(n.pages).filter(isInt) }] : [],
  );
  const files = arr(raw.files).flatMap((f) => (isObj(f) && isInt(f.id) ? [{ id: f.id }] : []));

  const papers = arr(raw.papers).flatMap((p) => {
    if (!isObj(p) || !isRequired(p.paper)) return [];
    const state: PaperState = p.state === "present" || p.state === "missing" ? p.state : "not_checked";
    return [{ paper: p.paper, state }];
  });

  const notes = arr(raw.notes).flatMap((n): CheckNote[] => {
    if (!isObj(n) || !isNoteCode(n.code)) return [];
    const paper = n.paper === null || n.paper === undefined ? null : isRequired(n.paper) ? n.paper : undefined;
    if (paper === undefined) return [];
    const date = typeof n.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(n.date) ? n.date : null;
    // An `expired` note without its day cannot be worded («expired on <date>»): skipped.
    if (n.code === "expired" && !date) return [];
    return [{ code: n.code, paper, date }];
  });

  return { checkId: raw.checkId, status, updatedAt: raw.updatedAt, needSharp, files, papers, notes };
}

/**
 * Is `p` the answer for the pile as it is now? Same rule as the OS and the app.
 *
 * 🔴 **`staleUpdatedAt` is the write read just before the last `/run`.** A worker that finished the
 * first batch has already written «done» for it, and that is what a poll finds right after more
 * files were added. Only a write after that `/run` can be the answer.
 *
 * ⚠️ **And it must list every file the check was given** (`expected`): a file sent and not in the
 * answer is one the worker has not seen yet.
 */
export function isAnswer(
  p: CheckProgress,
  checkId: string,
  expected: readonly number[],
  staleUpdatedAt: string | null,
): boolean {
  if (p.checkId !== checkId) return false;
  if (staleUpdatedAt !== null && p.updatedAt === staleUpdatedAt) return false;
  if (p.status === "failed") return true;
  if (p.status !== "done") return false;
  const listed = new Set(p.files.map((f) => f.id));
  return expected.every((id) => listed.has(id));
}

/** The sharp copies asked for that have not been sent yet (`sent` holds `id:page`). */
export function sharpToSend(
  p: CheckProgress,
  sent: ReadonlySet<string>,
): Array<{ id: number; pages: number[] }> {
  const out: Array<{ id: number; pages: number[] }> = [];
  for (const ask of p.needSharp) {
    const pages = ask.pages.filter((page) => !sent.has(`${ask.id}:${page}`));
    if (pages.length) out.push({ id: ask.id, pages });
  }
  return out;
}

/**
 * What the page draws from an ANSWER: the required papers the check did not find, and the notes.
 * `null` = draw nothing (a failed check, R10).
 *
 * ⚠️ **Only `missing` is missing.** `not_checked` (a file not read in time) is never shown as
 * missing (R2); this page has no «could not check» line, so it simply says nothing about it.
 */
export function companyFindings(
  p: CheckProgress,
): { missing: RequiredPaper[]; allPresent: boolean; notes: CheckNote[] } | null {
  if (p.status !== "done") return null;
  const stateOf = (paper: RequiredPaper) => p.papers.find((x) => x.paper === paper)?.state ?? "not_checked";
  const missing = REQUIRED_PAPERS.filter((paper) => stateOf(paper) === "missing");
  const allPresent = REQUIRED_PAPERS.every((paper) => stateOf(paper) === "present");
  return { missing, allPresent, notes: p.notes };
}
