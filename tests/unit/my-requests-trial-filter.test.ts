import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * `GET /api/me/requests` — a TRIAL request created in the mobile app never reaches the web.
 *
 * The database is shared with the app, and the app still offers the 60-minute trial. This app has
 * trials switched off, but `TRIAL_REQUESTS_ENABLED` only stops it CREATING one — it does nothing
 * about a row that arrives from the phone. Before this filter such a row rendered as an ordinary
 * request: no ribbon, no caption, sample bids from the demo supplier reading as real offers, and
 * the whole thing gone an hour later when the TTL expired.
 *
 * 🔴 The filter belongs HERE and not on a surface. The workspace, the request rail, the dashboard
 * and every bid count read this one route; a filter in any of them would leave a trial counted
 * where it is not drawn, which is worse than showing it. So the pin is on the route.
 *
 * ⚠️ `=== true`, never truthy: an older backend that omits the field leaves it `undefined`, and the
 * opposite guess would hide every real request on that build. Both edges have a case.
 */

const h = vi.hoisted(() => ({
  /** What the shared backend answers for `/marketplace/my-requests`. */
  rows: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/api/app-backend-authed", () => ({
  withAuthedBackend: async (
    _req: Request,
    fn: (call: (path: string) => Promise<unknown>) => Promise<Response>,
  ) => fn(async () => ({ requests: h.rows })),
  appAuthErrorResponse: (e: unknown) => new Response(String(e), { status: 502 }),
}));

async function idsFromRoute(): Promise<string[]> {
  const { GET } = await import("@/app/api/me/requests/route");
  const res = await GET(new Request("https://web.example/api/me/requests"));
  const body = (await res.json()) as { requests: Array<{ id: string }> };
  return body.requests.map((r) => r.id);
}

/** The shape `extractRequestList` + `mapRequestListItem` need to produce a row at all. */
const row = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  status: "OPEN",
  equipmentItems: [],
  ...extra,
});

describe("GET /api/me/requests — trial rows from the app", () => {
  beforeEach(() => {
    vi.resetModules();
    h.rows = [];
  });

  it("Given a trial request from the app, Then it is not returned to the web", async () => {
    h.rows = [row("real-1"), row("trial-1", { isTrial: true })];
    expect(await idsFromRoute()).toEqual(["real-1"]);
  });

  it("Given isTrial is false, Then the request is returned", async () => {
    h.rows = [row("real-1", { isTrial: false })];
    expect(await idsFromRoute()).toEqual(["real-1"]);
  });

  it("Given an older backend that omits isTrial, Then the request is still returned", async () => {
    // `undefined` means "this build does not send the field", not "this is a trial". Reading it as
    // truthy-or-not would empty the workspace on that backend.
    h.rows = [row("real-1")];
    expect(await idsFromRoute()).toEqual(["real-1"]);
  });

  it("Given every row is a trial, Then the list is empty rather than partly filtered", async () => {
    h.rows = [row("t1", { isTrial: true }), row("t2", { isTrial: true })];
    expect(await idsFromRoute()).toEqual([]);
  });
});
