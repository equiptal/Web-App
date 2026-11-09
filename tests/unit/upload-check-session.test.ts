/**
 * The company check session (company doc check CC-12), ported from the Supplier OS's
 * `session.test.ts` so the two web clients can be compared case by case. Fake routes, fake S3 and
 * a manual clock: no network, no browser.
 */
import { describe, expect, it } from "vitest";
import { CheckSession, type CheckIo } from "@/lib/upload-check/session";
import type { UploadCheckConfig, UploadCheckFileInfo } from "@/lib/upload-check/types";

const CONFIG: UploadCheckConfig = {
  enabled: true,
  maxFiles: 200,
  smallEdge: 512,
  sharpEdge: 1400,
  maxPdfPages: 10,
  pdfAsIsMaxBytes: 5 * 1024 * 1024,
  pollMs: 1000,
  startDelayMs: 2000,
  budgetMs: { small: 15_000, large: 60_000 },
};

function fake(over: Partial<CheckIo> = {}) {
  let now = 0;
  let timers: Array<{ at: number; fn: () => void; id: number }> = [];
  let seq = 0;
  const calls = {
    start: [] as UploadCheckFileInfo[][],
    add: [] as UploadCheckFileInfo[][],
    remove: [] as number[],
    run: 0,
    sharp: [] as Array<Array<{ id: number; pages: number[] }>>,
    puts: [] as string[],
  };
  let progress: unknown = null;
  const io: CheckIo = {
    start: async (files) => {
      calls.start.push(files);
      return {
        ok: true,
        data: {
          checkId: "c1",
          progressUrl: "p",
          upload: files.map((f) => ({ id: f.id, page: 0, small: `s${f.id}`, pdf: f.mime === "application/pdf" ? `pdf${f.id}` : null })),
        },
      };
    },
    add: async (_id, files) => {
      calls.add.push(files);
      return { ok: true, data: { progressUrl: "p", upload: files.map((f) => ({ id: f.id, page: 0, small: `s${f.id}` })) } };
    },
    remove: async (_id, fileId) => {
      calls.remove.push(fileId);
      return { ok: true, data: null };
    },
    run: async () => {
      calls.run++;
      return { ok: true, data: { progressUrl: "p" } };
    },
    sharp: async (_id, files) => {
      calls.sharp.push(files);
      return {
        ok: true,
        data: { upload: files.flatMap((f) => f.pages.map((page) => ({ id: f.id, page, sharp: `h${f.id}-${page}` }))) },
      };
    },
    copies: async () => ({ pages: [new Blob(["x"], { type: "image/jpeg" })], pageCount: 3 }),
    sha256: async (file) => file.name.padEnd(64, "0").slice(0, 64).replace(/[^0-9a-f]/g, "a"),
    put: async (url) => {
      calls.puts.push(url);
    },
    readProgress: async () => {
      if (progress === null) throw { status: 404 };
      return progress;
    },
    now: () => now,
    setTimeout: (fn, ms) => {
      const id = ++seq;
      timers.push({ at: now + ms, fn, id });
      return id;
    },
    clearTimeout: (h) => {
      timers = timers.filter((t) => t.id !== h);
    },
    ...over,
  };
  const settle = async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
    await new Promise((r) => setImmediate(r));
  };
  /** Moves the clock, running every timer that comes due, and lets the async work finish. */
  const advance = async (ms: number) => {
    const end = now + ms;
    for (;;) {
      await settle();
      const due = timers.filter((t) => t.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      timers = timers.filter((t) => t !== due);
      now = due.at;
      due.fn();
    }
    now = end;
    await settle();
  };
  return { io, calls, advance, setProgress: (p: unknown) => (progress = p) };
}

const file = (name: string, type = "image/jpeg") => new File(["bytes of " + name], name, { type });
const done = (updatedAt: string, ids: number[], extra: Record<string, unknown> = {}) => ({
  checkId: "c1",
  status: "done",
  updatedAt,
  files: ids.map((id) => ({ id, kind: "company", state: "read" })),
  machines: [],
  papers: [
    { paper: "cr", state: "present" },
    { paper: "vat", state: "present" },
    { paper: "address", state: "missing" },
  ],
  notes: [],
  ...extra,
});

describe("the company check session", () => {
  it("Given a start delay, When files are added and one removed within it, Then one start is sent without it", async () => {
    const f = fake();
    const s = new CheckSession(f.io, CONFIG);
    const a = file("a.jpg");
    const b = file("b.jpg");
    const c = file("c.jpg");
    s.sync([a]);
    await f.advance(1000);
    s.sync([a, b]);
    await f.advance(1000);
    s.sync([a, c]);
    await f.advance(1500);
    expect(f.calls.start).toHaveLength(0);
    await f.advance(1000);
    expect(f.calls.start).toHaveLength(1);
    expect(f.calls.start[0].map((x) => x.name)).toEqual(["a.jpg", "c.jpg"]);
    expect(f.calls.start[0].map((x) => x.id)).toEqual([0, 1]);
    expect(f.calls.remove).toEqual([]);
  });

  it("Given a PDF, Then its real page count is sent and the PDF itself goes to its own link", async () => {
    const f = fake();
    const s = new CheckSession(f.io, CONFIG);
    s.sync([file("cr.pdf", "application/pdf")]);
    s.resume();
    await f.advance(10);
    expect(f.calls.start[0][0]).toMatchObject({ mime: "application/pdf", pages: 3 });
    expect(f.calls.puts).toEqual(["s0", "pdf0"]);
    expect(f.calls.run).toBe(1);
  });

  it("Given an answer, Then the snapshot carries the check id and the answered progress", async () => {
    const f = fake();
    const s = new CheckSession(f.io, CONFIG);
    s.sync([file("a.jpg")]);
    s.resume();
    await f.advance(10);
    f.setProgress(done("t1", [0]));
    await f.advance(1500);
    const snap = s.snapshot();
    expect(snap.answered).toBe(true);
    expect(snap.checkId).toBe("c1");
    expect(snap.progress?.papers.find((p) => p.paper === "address")?.state).toBe("missing");
  });

  it("Given a done answer for the first batch, When a file is added, Then that answer is not shown until a new write lists both", async () => {
    const f = fake();
    const s = new CheckSession(f.io, CONFIG);
    const a = file("a.jpg");
    s.sync([a]);
    s.resume();
    await f.advance(10);
    f.setProgress(done("t1", [0]));
    await f.advance(1500);
    expect(s.snapshot().answered).toBe(true);

    s.sync([a, file("b.jpg")]);
    s.resume();
    await f.advance(3000);
    expect(s.snapshot().answered).toBe(false);
    expect(f.calls.add[0].map((x) => x.id)).toEqual([1]);

    f.setProgress(done("t1", [0, 1]));
    await f.advance(2000);
    expect(s.snapshot().answered, "the same write time is the stale answer").toBe(false);

    f.setProgress(done("t2", [0, 1]));
    await f.advance(2000);
    expect(s.snapshot().answered).toBe(true);
  });

  it.each(["disabled", "daily_limit", "busy", "not_allowed", "unavailable"] as const)(
    "Given the start is refused (%s), Then the check stops and never blocks (R10)",
    async (code) => {
      const f = fake({ start: async () => ({ ok: false, code }) });
      const s = new CheckSession(f.io, CONFIG);
      s.sync([file("a.jpg")]);
      s.resume();
      await f.advance(100);
      expect(s.snapshot().mode).toBe("stopped");
    },
  );

  it("Given an expired check, Then a new one is started, at most twice, then it stops", async () => {
    let runs = 0;
    const f = fake({
      run: async () => {
        runs++;
        return { ok: false, code: "not_found" };
      },
    });
    const s = new CheckSession(f.io, CONFIG);
    s.sync([file("a.jpg")]);
    s.resume();
    await f.advance(100);
    expect(f.calls.start).toHaveLength(3);
    expect(runs).toBe(3);
    expect(s.snapshot().mode).toBe("stopped");
  });

  it("Given the answer asks sharp copies, Then they are asked once, PUT, and the worker woken", async () => {
    const f = fake();
    const s = new CheckSession(f.io, CONFIG);
    s.sync([file("cr.jpg")]);
    s.resume();
    await f.advance(10);
    const runsBefore = f.calls.run;
    f.setProgress({ ...done("t1", [0]), status: "running", needSharp: [{ id: 0, pages: [0] }] });
    await f.advance(3500);
    expect(f.calls.sharp).toEqual([[{ id: 0, pages: [0] }]]);
    expect(f.calls.puts).toContain("h0-0");
    expect(f.calls.run).toBeGreaterThan(runsBefore);
  });

  it("Given a done answer, When a sent file is removed, Then it is removed on the server and the answer waits for a new write", async () => {
    const f = fake();
    const s = new CheckSession(f.io, CONFIG);
    const a = file("a.jpg");
    const b = file("b.jpg");
    s.sync([a, b]);
    s.resume();
    await f.advance(10);
    f.setProgress(done("t1", [0, 1]));
    await f.advance(1500);
    expect(s.snapshot().answered).toBe(true);
    s.sync([a]);
    expect(s.snapshot().answered).toBe(false);
    await f.advance(3000);
    expect(f.calls.remove).toEqual([1]);
    expect(s.snapshot().answered).toBe(false);
    f.setProgress(done("t2", [0]));
    await f.advance(2000);
    expect(s.snapshot().answered).toBe(true);
  });

  it("Given a small pile past its budget, Then timedOut, and a late answer is still read", async () => {
    const f = fake();
    const s = new CheckSession(f.io, CONFIG);
    s.sync([file("a.jpg")]);
    s.resume();
    await f.advance(10);
    await f.advance(20_000);
    expect(s.snapshot().timedOut).toBe(true);
    f.setProgress(done("t1", [0]));
    await f.advance(2000);
    expect(s.snapshot().answered).toBe(true);
    expect(s.snapshot().timedOut).toBe(false);
  });

  it("Given a worker that never answers, Then reading stops after the large budget plus the grace", async () => {
    let reads = 0;
    const f = fake();
    const s = new CheckSession(
      {
        ...f.io,
        readProgress: async () => {
          reads++;
          throw { status: 404 };
        },
      },
      CONFIG,
    );
    s.sync([file("a.jpg")]);
    s.resume();
    await f.advance(100_000);
    const after = reads;
    await f.advance(30_000);
    expect(reads).toBe(after);
  });

  it("Given no file can be fingerprinted, Then the check stops at once", async () => {
    const f = fake({ sha256: async () => Promise.reject(new Error("no crypto.subtle")) });
    const s = new CheckSession(f.io, CONFIG);
    s.sync([file("a.jpg")]);
    s.resume();
    await f.advance(50);
    expect(f.calls.start).toHaveLength(0);
    expect(s.snapshot().mode).toBe("stopped");
  });

  it("Given the switch is off in the config, Then nothing is ever sent", async () => {
    const f = fake();
    const s = new CheckSession(f.io, { ...CONFIG, enabled: false });
    s.sync([file("a.jpg")]);
    s.resume();
    await f.advance(5000);
    expect(f.calls.start).toHaveLength(0);
    expect(s.snapshot().mode).toBe("off");
  });
});
