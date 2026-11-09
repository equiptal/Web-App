/**
 * One Moedatech upload check for the company-documents pile (company doc check CC-12, Moedatech
 * `docs/plans/ai-upload-check/contract-v4.md` §1, §2, §7).
 *
 * Ported from the Supplier OS session (`apps/web/src/lib/upload-check/session.ts`, UC-26), which
 * follows the app's (`upload_check_session.dart`), so the three clients behave alike:
 *  - files go to the check `startDelayMs` after the LAST add (a file added and removed within it
 *    costs nothing), and at once on `resume` (the renter is about to send);
 *  - server ids are given when a file is SENT, 0..n-1, and never reused (the server refuses a used
 *    id, removed ones included);
 *  - only a write after the last `/run` that lists every file sent is the answer (`isAnswer`);
 *  - a failed DELETE is tried again after 1 s and 3 s, then the pile starts a new check (the server
 *    would count the removed file); at most two new checks, then the check stops;
 *  - sharp copies only for what the progress file asks (`needSharp`).
 *
 * The flow (`company`) is not here: the proxy routes pin it server side.
 *
 * 🔴 **Advisory, never a gate (R10).** Any refusal or failure ends in `stopped`, and the pile then
 * goes exactly as before. Nothing here is awaited by Send.
 *
 * Plain TypeScript with every side effect injected (`CheckIo`), so it is tested without a browser
 * (`tests/unit/upload-check-session.test.ts`); `useCompanyCheck.ts` is the React wrapper.
 */
import type {
  CheckResult,
  UploadCheckConfig,
  UploadCheckFileInfo,
  UploadCheckFilesAnswer,
  UploadCheckSharpAnswer,
  UploadCheckStartAnswer,
} from "./types";
import { isAnswer, parseProgress, sharpToSend, type CheckProgress } from "./progress";

/** Copy caps the worker enforces (contract §1 «Copies»): over them a copy is not read. */
export const SMALL_COPY_MAX_BYTES = 300 * 1024;
export const SHARP_COPY_MAX_BYTES = 1.5 * 1024 * 1024;
/** Waits before each new try of a DELETE that failed. */
export const REMOVE_RETRIES_MS = [1000, 3000];
/** New checks after the first, at most (an expired check, a DELETE that never went through). */
export const MAX_RESTARTS = 2;
/**
 * How long past the LARGE time budget the progress is still read, since the last change. A check
 * past its budget still finishes, and its answer is still worth drawing (the OS retest of
 * 2026-11-07: answers landed 1 to 10 s after the budget).
 */
export const POLL_GRACE_MS = 30_000;
/** More files than this uses the large time budget. */
export const LARGE_PILE = 10;
/** Files prepared (fingerprint + copies) at once: a PDF is read whole and opened in pdfjs. */
export const COPY_SLOTS = 2;

/** At most `slots` of these at once, in call order. */
function limiter(slots: number) {
  let running = 0;
  const waiting: Array<() => void> = [];
  const next = () => {
    if (running >= slots) return;
    const go = waiting.shift();
    if (go) {
      running++;
      go();
    }
  };
  return <T>(fn: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      waiting.push(() =>
        fn()
          .then(resolve, reject)
          .finally(() => {
            running--;
            next();
          }),
      );
      next();
    });
}

export interface CheckIo {
  start(files: UploadCheckFileInfo[]): Promise<CheckResult<UploadCheckStartAnswer>>;
  add(checkId: string, files: UploadCheckFileInfo[]): Promise<CheckResult<UploadCheckFilesAnswer>>;
  remove(checkId: string, fileId: number): Promise<CheckResult<null>>;
  run(checkId: string): Promise<CheckResult<{ progressUrl: string }>>;
  sharp(checkId: string, files: Array<{ id: number; pages: number[] }>): Promise<CheckResult<UploadCheckSharpAnswer>>;
  copies(
    file: File,
    o: { edge: number; maxBytes: number; maxPages: number },
  ): Promise<{ pages: Array<Blob | null>; pageCount: number }>;
  sha256(file: File): Promise<string>;
  put(url: string, body: Blob, contentType: string): Promise<void>;
  /** The progress file; throws `{ status }` on an HTTP error. */
  readProgress(url: string): Promise<unknown>;
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export type CheckMode = "off" | "on" | "stopped";

interface Entry {
  file: File;
  id: number | null;
  /** The check `id` belongs to (a restart starts a new check and gives new ids). */
  checkId: string | null;
  /** Not sent: the file could not be fingerprinted (the check never hears of it). */
  notSent: boolean;
  prep: Promise<{ sha: string | null; pages: Array<Blob | null>; pageCount: number }> | null;
}

export interface CheckSnapshot {
  mode: CheckMode;
  checkId: string | null;
  /** The last progress file read for this check (may be stale: see `answered`). */
  progress: CheckProgress | null;
  /** `progress` is the answer for the pile as it is now. */
  answered: boolean;
  /** The time budget ran out without an answer. */
  timedOut: boolean;
}

export class CheckSession {
  private mode: CheckMode;
  private entries: Entry[] = [];
  private waiting: Entry[] = [];
  private startTimer: unknown = null;
  private pollTimer: unknown = null;
  private queue: Promise<void> = Promise.resolve();
  private checkId: string | null = null;
  private progressUrl: string | null = null;
  private progress: CheckProgress | null = null;
  private staleUpdatedAt: string | null = null;
  /** True between a pile change and the next `/run`: no write before that run is the answer. */
  private awaitingRun = false;
  /**
   * Files removed from the pile whose DELETE has not finished yet (including one removed while its
   * `/checks` or `/files` call was still in flight). While any is here no answer is current.
   */
  private dropping = new Set<Entry>();
  /** Ids removed from this check: an answer that still lists one is not for the pile on screen. */
  private removed = new Set<number>();
  /** Bumped by every `/run`; a progress read counts only if no `/run` happened while it was read. */
  private runSeq = 0;
  private progressSeq = -1;
  /** Bumped by every `startPolling`; only the newest polling loop may re-arm (no two loops). */
  private pollGen = 0;
  private readonly slot = limiter(COPY_SLOTS);
  private nextId = 0;
  private restarts = 0;
  private sharpSent = new Set<string>();
  private changedAt: number;
  private listeners = new Set<() => void>();
  /** Bumped on every change, for React's `useSyncExternalStore` (a stable value between changes). */
  version = 0;

  constructor(
    private readonly io: CheckIo,
    private readonly config: UploadCheckConfig,
  ) {
    this.mode = config.enabled ? "on" : "off";
    this.changedAt = io.now();
  }

  // ── What the page reads ──────────────────────────────────────────────────

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    this.version++;
    for (const fn of this.listeners) fn();
  }

  private get budgetMs(): number {
    return this.entries.length > LARGE_PILE ? this.config.budgetMs.large : this.config.budgetMs.small;
  }

  private sent(): number[] {
    return this.entries.flatMap((e) => (e.id === null ? [] : [e.id]));
  }

  private get answered(): boolean {
    if (this.mode !== "on" || !this.checkId || !this.progress || this.awaitingRun) return false;
    if (this.waiting.length > 0 || this.dropping.size > 0) return false;
    if (this.progressSeq !== this.runSeq) return false;
    if (this.entries.some((e) => e.id === null && !e.notSent)) return false;
    if (this.progress.files.some((f) => this.removed.has(f.id))) return false;
    return isAnswer(this.progress, this.checkId, this.sent(), this.staleUpdatedAt);
  }

  snapshot(): CheckSnapshot {
    const answered = this.answered;
    return {
      mode: this.mode,
      checkId: this.checkId,
      progress: this.progress,
      answered,
      timedOut: this.mode === "on" && !answered && this.io.now() - this.changedAt >= this.budgetMs,
    };
  }

  // ── The pile ─────────────────────────────────────────────────────────────

  /** The pile changed (or is the same): added files join after the delay, removed ones leave. */
  sync(files: readonly File[]): void {
    if (this.mode !== "on") return;
    const left = [...this.entries];
    const next: Entry[] = [];
    const added: Entry[] = [];
    for (const file of files) {
      const at = left.findIndex((e) => e.file === file);
      if (at >= 0) next.push(left.splice(at, 1)[0]);
      else {
        const e: Entry = { file, id: null, checkId: null, notSent: false, prep: null };
        e.prep = this.prepare(file);
        added.push(e);
        next.push(e);
      }
    }
    if (left.length === 0 && added.length === 0) return;
    this.entries = next;
    this.waiting = this.waiting.filter((w) => next.includes(w));
    this.changedAt = this.io.now();
    // Every removed file is queued, sent or not: one whose `/checks` or `/files` call is in flight
    // gets its id when that call returns, and must then be removed too.
    for (const e of left) {
      if (e.id !== null) this.awaitingRun = true;
      this.dropping.add(e);
      this.enqueue(() => this.drop(e));
    }
    if (added.length) {
      this.waiting.push(...added);
      this.armStart();
    }
    this.notify();
  }

  /** The renter is about to send: what is waiting goes now, and the progress is read again. */
  resume(): void {
    if (this.mode !== "on") return;
    this.flush();
    if (this.checkId && !this.answered) this.startPolling();
  }

  close(): void {
    this.mode = this.mode === "on" ? "stopped" : this.mode;
    if (this.startTimer) this.io.clearTimeout(this.startTimer);
    if (this.pollTimer) this.io.clearTimeout(this.pollTimer);
    this.startTimer = this.pollTimer = null;
    this.listeners.clear();
  }

  private armStart(): void {
    if (this.startTimer) this.io.clearTimeout(this.startTimer);
    const delay = Math.min(Math.max(this.config.startDelayMs ?? 0, 0), 5000);
    if (delay === 0) return this.flush();
    this.startTimer = this.io.setTimeout(() => this.flush(), delay);
  }

  private flush(): void {
    if (this.startTimer) this.io.clearTimeout(this.startTimer);
    this.startTimer = null;
    if (this.waiting.length === 0) return;
    const batch = this.waiting;
    this.waiting = [];
    this.enqueue(() => this.register(batch));
  }

  private prepare(file: File): Entry["prep"] {
    const c = this.config;
    return this.slot(() =>
      Promise.all([
        this.io.sha256(file).catch(() => null),
        this.io
          .copies(file, { edge: c.smallEdge, maxBytes: SMALL_COPY_MAX_BYTES, maxPages: c.maxPdfPages })
          .catch(() => ({ pages: [] as Array<Blob | null>, pageCount: 1 })),
      ]),
    ).then(([sha, copy]) => ({ sha, pages: copy.pages, pageCount: copy.pageCount }));
  }

  private enqueue(op: () => Promise<void>): void {
    this.queue = this.queue
      .then(async () => {
        if (this.mode !== "on") return;
        await op();
      })
      .catch(() => this.stop())
      .finally(() => this.notify());
  }

  private stop(): void {
    this.mode = "stopped";
    if (this.pollTimer) this.io.clearTimeout(this.pollTimer);
    this.pollTimer = null;
  }

  /** `/checks` (first files) or `/files` (more), the small copies, then `/run`. */
  private async register(batch: Entry[]): Promise<void> {
    const live = batch.filter((e) => this.entries.includes(e) && e.id === null && !e.notSent);
    if (live.length === 0) return;
    const preps = await Promise.all(live.map((e) => e.prep!));
    if (this.mode !== "on") return;
    const send: Array<{ entry: Entry; info: UploadCheckFileInfo; pages: Array<Blob | null> }> = [];
    live.forEach((entry, i) => {
      const p = preps[i];
      if (!this.entries.includes(entry)) return;
      if (!p.sha) {
        entry.notSent = true;
        return;
      }
      send.push({
        entry,
        pages: p.pages,
        info: {
          id: 0,
          name: entry.file.name,
          mime: entry.file.type || "application/octet-stream",
          bytes: entry.file.size,
          sha256: p.sha,
          pages: Math.max(1, p.pageCount),
        },
      });
    });
    if (send.length === 0) {
      // Nothing could be fingerprinted (no `crypto.subtle`): no check at all, the pile goes as before.
      if (this.checkId === null && this.entries.every((e) => e.notSent)) this.stop();
      return;
    }
    if (this.checkId === null) this.nextId = 0;
    // Ids taken even if the call fails: the server may have stored them.
    for (const s of send) s.info.id = this.nextId++;
    this.awaitingRun = true;
    const answer = this.checkId
      ? await this.io.add(
          this.checkId,
          send.map((s) => s.info),
        )
      : await this.io.start(send.map((s) => s.info));
    if (!answer.ok) return answer.code === "not_found" ? this.restart() : this.stop();
    const started = (answer.data as Partial<UploadCheckStartAnswer>).checkId;
    if (typeof started === "string") this.checkId = started;
    this.progressUrl = answer.data.progressUrl;
    for (const s of send) {
      s.entry.id = s.info.id;
      s.entry.checkId = this.checkId;
    }
    if (this.mode !== "on") return;
    const byId = new Map(send.map((s) => [s.info.id, s]));
    await Promise.all(
      answer.data.upload.map(async (u) => {
        const s = byId.get(u.id);
        if (!s) return;
        const page = s.pages[u.page];
        if (page) await this.io.put(u.small, page, "image/jpeg").catch(() => undefined);
        if (u.pdf && s.entry.file.size <= this.config.pdfAsIsMaxBytes) {
          await this.io.put(u.pdf, s.entry.file, "application/pdf").catch(() => undefined);
        }
      }),
    );
    if (this.mode !== "on") return;
    await this.runNow();
  }

  /** A file left the pile: once it has an id in THIS check, it is removed there too. */
  private async drop(e: Entry): Promise<void> {
    try {
      if (e.id === null || e.checkId === null || e.checkId !== this.checkId) return;
      this.awaitingRun = true;
      this.removed.add(e.id);
      await this.removeOne(e.checkId, e.id, 0);
    } finally {
      this.dropping.delete(e);
    }
  }

  /** `/run` after reading the latest write, which from then on is stale (see `isAnswer`). */
  private async runNow(): Promise<void> {
    if (!this.checkId) return;
    if (this.progressUrl) {
      try {
        const p = parseProgress(await this.io.readProgress(this.progressUrl));
        if (p && p.checkId === this.checkId) this.staleUpdatedAt = p.updatedAt;
      } catch {
        // Not read: the last write we saw is the newest we know of, and is stale from now on.
        if (this.progress?.checkId === this.checkId) this.staleUpdatedAt = this.progress.updatedAt;
      }
    }
    const run = await this.io.run(this.checkId);
    if (!run.ok) return run.code === "not_found" ? this.restart() : this.stop();
    this.progressUrl = run.data.progressUrl;
    this.runSeq++;
    this.awaitingRun = false;
    this.startPolling();
  }

  private async removeOne(checkId: string, fileId: number, attempt: number): Promise<void> {
    // A restart since: that id belongs to a different file in the new check, and the removed file
    // is not in the new check at all.
    if (checkId !== this.checkId || this.mode !== "on") return;
    // The last answer still lists it until the worker writes again.
    this.awaitingRun = true;
    const r = await this.io.remove(checkId, fileId);
    if (r.ok) return this.runNow();
    if (r.code === "not_found") return this.restart();
    if (attempt >= REMOVE_RETRIES_MS.length) return this.restart();
    await new Promise<void>((resolve) => this.io.setTimeout(resolve, REMOVE_RETRIES_MS[attempt]));
    return this.removeOne(checkId, fileId, attempt + 1);
  }

  /** A new check for the whole pile, at most `MAX_RESTARTS` times. */
  private async restart(): Promise<void> {
    if (++this.restarts > MAX_RESTARTS) return this.stop();
    this.checkId = null;
    this.progressUrl = null;
    this.progress = null;
    this.staleUpdatedAt = null;
    this.sharpSent = new Set();
    this.removed = new Set();
    this.dropping.clear();
    this.nextId = 0;
    for (const e of this.entries) {
      e.id = null;
      e.checkId = null;
    }
    this.waiting = [];
    this.changedAt = this.io.now();
    await this.register([...this.entries]);
  }

  // ── Reading the answer ───────────────────────────────────────────────────

  private startPolling(): void {
    if (this.pollTimer) this.io.clearTimeout(this.pollTimer);
    const gen = ++this.pollGen;
    this.pollTimer = this.io.setTimeout(() => void this.poll(gen), 0);
  }

  private async poll(gen: number): Promise<void> {
    this.pollTimer = null;
    if (gen !== this.pollGen) return;
    if (this.mode !== "on" || !this.progressUrl || !this.checkId) return;
    const seq = this.runSeq;
    try {
      const p = parseProgress(await this.io.readProgress(this.progressUrl));
      // A newer loop, or a `/run` while this was read: this read is not the answer to anything.
      if (gen !== this.pollGen) return;
      if (p && p.checkId === this.checkId && seq === this.runSeq) {
        this.progress = p;
        this.progressSeq = seq;
        const ask = sharpToSend(p, this.sharpSent);
        if (ask.length) {
          for (const a of ask) for (const page of a.pages) this.sharpSent.add(`${a.id}:${page}`);
          this.enqueue(() => this.sendSharp(ask));
        }
      }
    } catch (err) {
      // An old link (they live 30 minutes): `/run` hands a fresh one.
      if ((err as { status?: number })?.status === 403) this.enqueue(() => this.runNow());
    }
    this.notify();
    if (gen !== this.pollGen || this.answered) return;
    if (this.io.now() - this.changedAt > this.config.budgetMs.large + POLL_GRACE_MS) return;
    this.pollTimer = this.io.setTimeout(() => void this.poll(gen), this.config.pollMs);
  }

  private async sendSharp(ask: Array<{ id: number; pages: number[] }>): Promise<void> {
    if (!this.checkId) return;
    const r = await this.io.sharp(this.checkId, ask);
    if (!r.ok) return r.code === "not_found" ? this.restart() : undefined;
    const byId = new Map(this.entries.filter((e) => e.id !== null).map((e) => [e.id!, e]));
    /** Draw only as far as the last page asked (a PDF of 10 pages asked for page 0 draws one). */
    const lastPage = new Map<number, number>();
    for (const u of r.data.upload) lastPage.set(u.id, Math.max(lastPage.get(u.id) ?? 0, u.page));
    const made = new Map<number, Promise<Array<Blob | null>>>();
    let sent = 0;
    await Promise.all(
      r.data.upload.map(async (u) => {
        const e = byId.get(u.id);
        if (!e) return;
        if (!made.has(u.id)) {
          made.set(
            u.id,
            this.slot(() =>
              this.io.copies(e.file, {
                edge: this.config.sharpEdge,
                maxBytes: SHARP_COPY_MAX_BYTES,
                maxPages: Math.min(this.config.maxPdfPages, (lastPage.get(u.id) ?? 0) + 1),
              }),
            )
              .then((c) => c.pages)
              .catch(() => []),
          );
        }
        const page = (await made.get(u.id)!)[u.page];
        if (!page) return;
        await this.io
          .put(u.sharp, page, "image/jpeg")
          .then(() => sent++)
          .catch(() => undefined);
      }),
    );
    // The worker waits only so long for a sharp copy; a `/run` makes it read one that came late.
    if (sent > 0 && this.mode === "on") await this.runNow();
  }
}
