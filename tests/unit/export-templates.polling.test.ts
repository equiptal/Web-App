/**
 * `waitForMapping` — the client half of async template mapping.
 *
 * Mapping moved off the request thread because a real template takes 20-60s and the SSR
 * gateway gives up at ~30s; awaiting it returned 504 while the work carried on invisibly. That
 * makes this poll loop the thing standing between the user and a spinner that never ends, so
 * the failure modes worth pinning are:
 *   - returning before the job settles → the review screen opens with no mapping.
 *   - not following the NEW job id after a corrective retry → it waits on a job that is
 *     already done and never sees the correction land.
 *   - ignoring the abort signal → a closed dialog keeps polling and yanks the user back.
 *   - no ceiling → an orphaned job spins forever.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { waitForMapping } from "@/lib/api/export-templates";

/** Queue of canned poll responses, served in order. */
function stubPolls(responses: Array<Record<string, unknown>>) {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (url: string | URL) => {
    calls.push(String(url));
    const body = responses.shift() ?? { id: "t1", status: "mapping" };
    return {
      ok: true,
      json: async () => body,
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Drive the loop far enough to consume `n` polls. */
async function tick(n: number) {
  for (let i = 0; i < n; i++) await vi.advanceTimersByTimeAsync(2500);
}

describe("waitForMapping", () => {
  it("keeps polling while the job is still mapping, then returns the settled state", async () => {
    stubPolls([
      { id: "t1", status: "mapping" },
      { id: "t1", status: "mapping" },
      { id: "t1", status: "needs_review", mappingError: null },
    ]);

    const promise = waitForMapping("t1", "job-1");
    await tick(3);

    await expect(promise).resolves.toMatchObject({ status: "needs_review" });
  });

  // The subtle one. A spec the validator rejects triggers one corrective retry, which is a
  // NEW job on the agent. Polling the original id after that waits on a job that is already
  // done — the correction lands and the user never sees it.
  it("follows the new job id handed back by a corrective retry", async () => {
    const calls = stubPolls([
      { id: "t1", status: "mapping", jobId: "job-RETRY" },
      { id: "t1", status: "ready", mappingError: null },
    ]);

    const promise = waitForMapping("t1", "job-1");
    await tick(2);
    await promise;

    expect(calls[0]).toContain("jobId=job-1");
    expect(calls[1]).toContain("jobId=job-RETRY");
  });

  it("does not resolve while the job is still running", async () => {
    stubPolls([{ id: "t1", status: "mapping" }, { id: "t1", status: "mapping" }]);

    let settled = false;
    const promise = waitForMapping("t1", "job-1").then((r) => {
      settled = true;
      return r;
    });
    await tick(2);

    expect(settled).toBe(false);
    // Let it finish so the promise is not left dangling.
    stubPolls([{ id: "t1", status: "needs_review" }]);
    await tick(1);
    await promise;
  });

  it("stops on abort — a closed dialog must not keep polling", async () => {
    stubPolls([{ id: "t1", status: "mapping" }]);
    const abort = new AbortController();

    const promise = waitForMapping("t1", "job-1", { signal: abort.signal });
    const assertion = expect(promise).rejects.toThrow(/abort/i);

    abort.abort();
    await tick(1);
    await assertion;
  });

  it("refuses to poll at all if already aborted", async () => {
    const calls = stubPolls([{ id: "t1", status: "needs_review" }]);
    const abort = new AbortController();
    abort.abort();

    const promise = waitForMapping("t1", "job-1", { signal: abort.signal });
    const assertion = expect(promise).rejects.toThrow(/abort/i);
    await tick(1);
    await assertion;

    expect(calls).toHaveLength(0);
  });

  // An orphaned job (a redeploy took the in-memory store with it) must not spin forever.
  it("gives up with an explanation rather than polling forever", async () => {
    stubPolls([]); // every poll answers "mapping"

    const promise = waitForMapping("t1", "job-1");
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 5000);

    const result = await promise;
    expect(result.status).toBe("mapping");
    expect(result.mappingError).toMatch(/longer than expected/i);
  });
});
