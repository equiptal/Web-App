import { NextResponse } from "next/server";
import { agentsPost, agentsDelete, AgentsBackendError } from "@/lib/api/agents-backend";
import { sessionUserId } from "@/lib/api/session-user";

/**
 * SERVER-ONLY plumbing shared by the `/api/me/company/**` BFF routes
 * (docs/plans/company-shared-visibility.md — the web twin of the app's company hub).
 *
 * Every company mutation is the same shape: resolve the signed-in renter as the ACTOR, POST it to the
 * agents-backend company endpoint, and pass the backend's own `CO1xxx` error code straight through so
 * the screens can react to specific outcomes (e.g. `CO1006` = "promote someone before you leave")
 * instead of a generic failure. Import only from route handlers.
 */

/** The renter's own id is never taken from the request body — see `sessionUserId`. */
export async function requireActor(): Promise<{ userId: number } | { response: NextResponse }> {
  const userId = await sessionUserId();
  if (!userId) return { response: NextResponse.json({ code: "unauthorized" }, { status: 401 }) };
  return { userId };
}

/**
 * Map a failure to a response the client reads by `code`. The backend's bilingual message travels
 * with it so the UI can show the real reason (which owner guard tripped) rather than inventing copy
 * for eleven distinct company errors.
 */
export function companyErrorResponse(err: unknown, route: string): NextResponse {
  if (err instanceof AgentsBackendError) {
    return NextResponse.json(
      { code: err.code ?? "company_action_failed", message: err.message, messageAr: err.messageAr },
      // `status 0` means the agents backend isn't configured for this deployment.
      { status: err.status || 502 },
    );
  }
  console.error(`[company] ${route} unexpected error:`, err);
  return NextResponse.json({ code: "unknown" }, { status: 502 });
}

/**
 * Run one company mutation: `POST <agentsPath>` with `{ userId, ...extra }`. Success passes the
 * backend's `{ message, messageAr, ... }` through untouched, so the caller can toast it verbatim.
 */
export async function companyAction(
  agentsPath: string,
  route: string,
  extra: Record<string, unknown> = {},
): Promise<NextResponse> {
  const actor = await requireActor();
  if ("response" in actor) return actor.response;
  try {
    const data = await agentsPost<Record<string, unknown>>(agentsPath, { userId: actor.userId, ...extra });
    return NextResponse.json({ ok: true, ...(data ?? {}) });
  } catch (err) {
    return companyErrorResponse(err, route);
  }
}

/**
 * Same, for the one DELETE endpoint (`DELETE /agents/companies/members/{id}`). The actor rides in
 * the query string rather than a body — a DELETE body is unreliable across proxies.
 */
export async function companyDeleteAction(
  agentsPath: (actorUserId: number) => string,
  route: string,
): Promise<NextResponse> {
  const actor = await requireActor();
  if ("response" in actor) return actor.response;
  try {
    const data = await agentsDelete<Record<string, unknown>>(agentsPath(actor.userId));
    return NextResponse.json({ ok: true, ...(data ?? {}) });
  } catch (err) {
    return companyErrorResponse(err, route);
  }
}
